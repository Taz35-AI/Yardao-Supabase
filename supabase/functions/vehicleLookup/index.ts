// supabase/functions/vehicleLookup/index.ts
// Single-vehicle lookup, ported from the Firebase Cloud Function `vehicleLookup`.
// Calls the DVSA MOT History API (make/model/colour/fuel/MOT/mileage) and the
// DVLA VES API (road tax + CO2/weight/euro) IN PARALLEL and merges them.
// All keys live in Edge Function secrets (Deno.env) — never in code or the browser.
//
// Client contract:
//   supabase.functions.invoke('vehicleLookup', { body: { registrationNumber } })
// Returns the same VehicleLookupResult shape the original Cloud Function returned.

import { handlePreflight, json } from '../_shared/cors.ts'

// ─────────────────────────────────────────────────────────────────────────────
// DVLA Vehicle Enquiry Service (VES)
// ─────────────────────────────────────────────────────────────────────────────

// Production (real DVLA records). If your key is a TEST/UAT key, swap for:
//   https://uat.driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles
const DVLA_URL =
  'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles'

interface DvlaResult {
  registration: string
  make: string
  colour: string
  fuelType: string
  taxStatus: string
  taxExpiry: string
  motStatus: string
  motExpiry: string
  yearOfManufacture: number | null
  engineCapacity: number | null
  co2Emissions: number | null
  revenueWeight: number | null
  euroStatus: string
  wheelplan: string
  monthOfFirstRegistration: string
  typeApproval: string
  markedForExport: boolean | null
}

type DvlaErrorKind = 'invalid' | 'forbidden' | 'notfound' | 'ratelimit' | 'error'

// Typed error so the handler can map DVLA failures to the right HTTP status.
class DvlaError extends Error {
  kind: DvlaErrorKind
  status: number
  constructor(kind: DvlaErrorKind, status: number, message: string) {
    super(message)
    this.name = 'DvlaError'
    this.kind = kind
    this.status = status
  }
}

interface DvlaVehicleResponse {
  registrationNumber?: string
  make?: string
  colour?: string
  fuelType?: string
  taxStatus?: string
  taxDueDate?: string
  motStatus?: string
  motExpiryDate?: string
  yearOfManufacture?: number
  engineCapacity?: number
  co2Emissions?: number
  revenueWeight?: number
  euroStatus?: string
  wheelplan?: string
  monthOfFirstRegistration?: string
  typeApproval?: string
  markedForExport?: boolean
}

// fetch has NO default timeout. A hung upstream (TCP accepted but no response)
// would otherwise block forever. Give every request a hard ceiling.
function timeoutSignal(ms: number): AbortSignal {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  // Deno timers do not need unref(); the AbortController is enough.
  void t
  return ac.signal
}

const isAbort = (error: unknown): boolean => {
  const name = (error as Error)?.name
  return name === 'AbortError' || name === 'TimeoutError'
}

/**
 * A vehicle's stored "registration" can carry a private/cherished plate with the
 * original DVLA plate in brackets, e.g. "91VP ( HK72XOL )". DVLA can't look up
 * that whole string, so derive the candidate plates to try, in priority order:
 * the leading (private/current) plate first, then any bracketed (original) plate.
 * A plain registration yields a single candidate. Each is stripped to A–Z/0–9.
 */
function parseRegistrationCandidates(raw: string): string[] {
  if (!raw) return []
  const clean = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  const candidates: string[] = []

  const leading = clean(raw.split('(')[0])
  if (leading) candidates.push(leading)

  const bracket = raw.match(/\(([^)]*)\)/)
  if (bracket) {
    const inner = clean(bracket[1])
    if (inner) candidates.push(inner)
  }

  // Fallback for an input with no usable leading/bracket part.
  if (candidates.length === 0) {
    const whole = clean(raw)
    if (whole) candidates.push(whole)
  }

  return [...new Set(candidates)]
}

/**
 * Look up a single vehicle from DVLA. Throws DvlaError on any non-200.
 */
async function fetchDvlaVehicle(
  registration: string,
  apiKey: string,
): Promise<DvlaResult> {
  // DVLA expects the plate with no spaces, uppercased.
  const registrationNumber = registration.replace(/\s+/g, '').toUpperCase()

  const response = await fetch(DVLA_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ registrationNumber }),
    signal: timeoutSignal(20_000),
  }).catch((error) => {
    throw new DvlaError(
      'error',
      0,
      isAbort(error)
        ? 'DVLA request timed out.'
        : `Could not reach DVLA: ${(error as Error)?.message ?? 'network error'}`,
    )
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    switch (response.status) {
      case 400:
        throw new DvlaError(
          'invalid',
          400,
          `"${registrationNumber}" is not a valid registration.`,
        )
      case 403:
        throw new DvlaError(
          'forbidden',
          403,
          'DVLA rejected the API key. Check the key and that it matches the endpoint (test vs live).',
        )
      case 404:
        throw new DvlaError(
          'notfound',
          404,
          `No DVLA record found for "${registrationNumber}".`,
        )
      case 429:
        throw new DvlaError('ratelimit', 429, 'DVLA rate limit reached.')
      default:
        throw new DvlaError(
          'error',
          response.status,
          `DVLA lookup failed (status ${response.status}). ${errorText}`.trim(),
        )
    }
  }

  const data = (await response.json()) as DvlaVehicleResponse

  return {
    registration: data.registrationNumber ?? registrationNumber,
    make: data.make ?? '',
    colour: data.colour ?? '',
    fuelType: data.fuelType ?? '',
    taxStatus: data.taxStatus ?? '',
    taxExpiry: data.taxDueDate ?? '',
    motStatus: data.motStatus ?? '',
    motExpiry: data.motExpiryDate ?? '',
    yearOfManufacture: data.yearOfManufacture ?? null,
    engineCapacity: data.engineCapacity ?? null,
    co2Emissions: data.co2Emissions ?? null,
    revenueWeight: data.revenueWeight ?? null,
    euroStatus: data.euroStatus ?? '',
    wheelplan: data.wheelplan ?? '',
    monthOfFirstRegistration: data.monthOfFirstRegistration ?? '',
    typeApproval: data.typeApproval ?? '',
    markedForExport: data.markedForExport ?? null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DVSA MOT History API
// ─────────────────────────────────────────────────────────────────────────────

const MOT_BASE =
  'https://history.mot.api.gov.uk/v1/trade/vehicles/registration/'

interface MotCreds {
  clientId: string
  clientSecret: string
  apiKey: string
  tokenUrl: string
  scope: string
}

interface MotAdvisory {
  text: string
  type: string // ADVISORY / MINOR / MAJOR / DANGEROUS / FAIL …
  dangerous: boolean
}

interface MotResult {
  make: string
  model: string
  colour: string
  fuelType: string
  engineCapacity: number | null
  motStatus: string
  motExpiry: string // normalised to YYYY-MM-DD
  mileage: number | null // odometer at the most recent test
  mileageUnit: string // MI / KM
  firstUsedDate: string // YYYY-MM-DD
  hasOutstandingRecall: string // 'Yes' | 'No' | 'Unknown' | ''
  advisories: MotAdvisory[] // defects from the most recent test
}

// Cached token shared across warm invocations on the same instance.
let cachedToken: { value: string; exp: number } | null = null

async function getToken(c: MotCreds): Promise<string> {
  const now = Date.now()
  if (cachedToken && now < cachedToken.exp - 60_000) return cachedToken.value

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: c.clientId,
    client_secret: c.clientSecret,
    scope: c.scope,
  })
  const res = await fetch(c.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: timeoutSignal(15_000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`MOT token request failed (${res.status}). ${t}`.trim())
  }
  const data = (await res.json()) as {
    access_token: string
    expires_in?: number
  }
  cachedToken = {
    value: data.access_token,
    exp: now + (data.expires_in ?? 3600) * 1000,
  }
  return cachedToken.value
}

const normDate = (d?: string): string =>
  d ? d.slice(0, 10).replace(/\./g, '-') : ''

/**
 * Look up a vehicle in the DVSA MOT History API.
 * Returns null if the vehicle has no MOT record (404). Throws on auth/other errors.
 */
async function fetchMotHistory(
  registration: string,
  creds: MotCreds,
): Promise<MotResult | null> {
  const reg = registration.replace(/\s+/g, '').toUpperCase()
  const token = await getToken(creds)

  const res = await fetch(MOT_BASE + encodeURIComponent(reg), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-API-Key': creds.apiKey,
      'Accept': 'application/json',
    },
    signal: timeoutSignal(20_000),
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`MOT History API error (${res.status}). ${t}`.trim())
  }

  const v = (await res.json()) as Record<string, any>
  const tests: Array<Record<string, any>> = Array.isArray(v.motTests)
    ? v.motTests
    : []
  // Newest test first — sort defensively by completedDate descending.
  const sorted = [...tests].sort((a, b) =>
    String(b.completedDate || '').localeCompare(String(a.completedDate || '')),
  )
  const latest = sorted[0]
  // The MOT expiry ONLY appears on PASS tests. If the most recent test is a
  // fail / retest it has no expiryDate, so use the newest test that actually
  // carries one (the latest pass). For vehicles not yet MOT'd (under 3 years)
  // fall back to the first-MOT due date the API returns at vehicle level.
  const latestWithExpiry = sorted.find((tt) => tt.expiryDate)
  const motExpiry = normDate(latestWithExpiry?.expiryDate) || normDate(v.motTestDueDate)

  return {
    make: v.make ?? '',
    model: v.model ?? '',
    colour: v.primaryColour ?? '',
    fuelType: v.fuelType ?? '',
    engineCapacity: v.engineSize ? Number(v.engineSize) || null : null,
    motStatus: latest?.testResult ?? '',
    motExpiry,
    mileage: latest?.odometerValue ? Number(latest.odometerValue) || null : null,
    mileageUnit: latest?.odometerUnit ?? '',
    firstUsedDate: normDate(v.firstUsedDate),
    hasOutstandingRecall: v.hasOutstandingRecall ?? '',
    advisories: Array.isArray(latest?.defects)
      ? latest.defects.map((d: Record<string, any>) => ({
          text: d.text ?? '',
          type: d.type ?? '',
          dangerous: d.dangerous === true,
        }))
      : [],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

// Maps a DvlaError kind to the HTTP status that best represents it. The original
// Cloud Function used HttpsError codes; here we surface { error } JSON + status.
const DVLA_ERROR_HTTP: Record<DvlaErrorKind, [number, string?]> = {
  invalid: [400],
  forbidden: [403],
  notfound: [404],
  ratelimit: [429, 'DVLA rate limit reached. Please wait a moment and try again.'],
  error: [503, 'Could not reach the DVLA service. Please try again.'],
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  try {
    const { registrationNumber: raw } = await req.json()
    if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
      return json({ error: 'A registration number is required.' }, 400)
    }

    const dvlaKey = Deno.env.get('DVLA_API_KEY')
    const motCreds: MotCreds = {
      clientId: Deno.env.get('MOT_CLIENT_ID') ?? '',
      clientSecret: Deno.env.get('MOT_CLIENT_SECRET') ?? '',
      apiKey: Deno.env.get('MOT_API_KEY') ?? '',
      tokenUrl: Deno.env.get('MOT_TOKEN_URL') ?? '',
      scope: Deno.env.get('MOT_SCOPE') ?? '',
    }
    const motConfigured = !!(
      motCreds.clientId &&
      motCreds.clientSecret &&
      motCreds.apiKey &&
      motCreds.tokenUrl
    )

    // A stored/typed reg can be "11DCP (BK24LNT)" — the leading private plate
    // plus the original DVLA plate in brackets. Try each candidate in order
    // (private first, then bracketed original); the first that returns data wins.
    const candidates = parseRegistrationCandidates(raw)
    if (candidates.length === 0) {
      return json({ error: `"${raw}" is not a valid registration.` }, 400)
    }

    let ves: DvlaResult | null = null
    let mot: MotResult | null = null
    let lastVesReason: unknown = null

    for (const cand of candidates) {
      // Fire both lookups at once; neither blocks the other.
      const [vesR, motR] = await Promise.allSettled([
        dvlaKey
          ? fetchDvlaVehicle(cand, dvlaKey)
          : Promise.reject(new Error('VES not configured')),
        motConfigured
          ? fetchMotHistory(cand, motCreds)
          : Promise.reject(new Error('MOT not configured')),
      ])

      ves = vesR.status === 'fulfilled' ? vesR.value : null
      mot = motR.status === 'fulfilled' ? motR.value : null
      if (vesR.status === 'rejected') lastVesReason = vesR.reason
      if (motR.status === 'rejected') {
        console.error(
          'MOT History lookup failed:',
          (motR.reason as Error)?.message ?? motR.reason,
        )
      }

      // A forbidden key won't improve with another plate — stop now.
      if (
        vesR.status === 'rejected' &&
        vesR.reason instanceof DvlaError &&
        vesR.reason.kind === 'forbidden'
      ) {
        break
      }
      // Got useful data → stop. Otherwise try the next candidate.
      if (ves || (mot && (mot.motExpiry || mot.model))) break
    }

    // Both failed for every candidate → surface a meaningful error.
    if (!ves && !mot) {
      if (lastVesReason instanceof DvlaError) {
        const [status, override] = DVLA_ERROR_HTTP[lastVesReason.kind] ?? [500]
        return json({ error: override ?? lastVesReason.message }, status)
      }
      return json({ error: 'Vehicle lookup failed. Please try again.' }, 503)
    }

    // Preserve the user's typed value when they used the "private ( original )"
    // format, so the lookup doesn't overwrite their plate display with the bare
    // DVLA plate. A plain reg is normalised to DVLA's canonical form as before.
    const registration = raw.includes('(')
      ? raw.trim()
      : ves?.registration || raw.replace(/\s+/g, '').toUpperCase()

    const result = {
      registration,
      // MOT History is authoritative for identity (and the only source of model).
      make: mot?.make || ves?.make || '',
      model: mot?.model || '',
      colour: mot?.colour || ves?.colour || '',
      fuelType: mot?.fuelType || ves?.fuelType || '',
      // VES owns road tax.
      taxStatus: ves?.taxStatus ?? '',
      taxExpiry: ves?.taxExpiry ?? '',
      // MOT — prefer MOT History's actual latest test, fall back to VES status.
      motStatus: mot?.motStatus || ves?.motStatus || '',
      motExpiry: mot?.motExpiry || ves?.motExpiry || '',
      // Technical/spec data.
      yearOfManufacture:
        ves?.yearOfManufacture ??
        (mot?.firstUsedDate
          ? Number(mot.firstUsedDate.slice(0, 4)) || null
          : null),
      engineCapacity: ves?.engineCapacity ?? mot?.engineCapacity ?? null,
      co2Emissions: ves?.co2Emissions ?? null,
      revenueWeight: ves?.revenueWeight ?? null,
      euroStatus: ves?.euroStatus ?? '',
      wheelplan: ves?.wheelplan ?? '',
      monthOfFirstRegistration: ves?.monthOfFirstRegistration ?? '',
      typeApproval: ves?.typeApproval ?? '',
      markedForExport: ves?.markedForExport ?? null,
      // MOT History extras.
      mileage: mot?.mileage ?? null,
      mileageUnit: mot?.mileageUnit ?? '',
      firstUsedDate: mot?.firstUsedDate ?? '',
      hasOutstandingRecall: mot?.hasOutstandingRecall ?? '',
      advisories: mot?.advisories ?? [],
    }

    return json(result)
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : 'Vehicle lookup failed' },
      400,
    )
  }
})
