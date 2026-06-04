// supabase/functions/bulkRefreshVehicleData/index.ts  (Deno Edge Function)
// ----------------------------------------------------------------------------
// Bulk MOT & road-tax refresh for an organisation's whole fleet.
//
// Port of the Firebase pipeline (functions/src/bulkRefreshVehicleData.ts +
// onBulkRefreshRequested.ts + bulkRefresh.ts). Firebase split this into a thin
// "enqueue" callable plus a Firestore-trigger worker so the heavy DVLA work
// survived a page refresh. Edge Functions have no equivalent of a table trigger
// that can run for minutes, so we fold the two back together: this single
// function claims the job AND does the DVLA work inline, reporting incremental
// progress to bulk_refresh_jobs (which the client watches via Realtime).
//
// Because the work runs inside the request, the client's invoke() promise stays
// open until the refresh finishes. That's fine — the UI's progress bar reads
// bulk_refresh_jobs over Realtime regardless of when invoke() resolves, and the
// job row is the durable source of truth. The cooldown/already-running guards
// from the original enqueue callable are preserved.
//
// Client contract (src/lib/services/bulkVehicleRefreshService.ts):
//   supabase.functions.invoke('bulkRefreshVehicleData', { body: {} })
//   → BulkRefreshStartResult { started, alreadyRunning?, rateLimited?, minutesLeft? }
//
// Secrets used (same names/endpoints as the single vehicleLookup):
//   DVLA_API_KEY                         — DVLA VES x-api-key
//   MOT_CLIENT_ID / MOT_CLIENT_SECRET    — DVSA MOT OAuth2 client-credentials
//   MOT_API_KEY                          — DVSA MOT X-API-Key
//   MOT_TOKEN_URL / MOT_SCOPE            — DVSA MOT OAuth token endpoint + scope
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handlePreflight, json } from '../_shared/cors.ts'

// ─────────────────────────────────────────────────────────────────────────────
// DVLA Vehicle Enquiry Service (VES) client — ported from functions/src/dvla.ts
// ─────────────────────────────────────────────────────────────────────────────

// Production (real DVLA records). If your DVLA key is a TEST/UAT key, swap to:
// 'https://uat.driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles'
const DVLA_URL =
  'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles'

type DvlaErrorKind = 'invalid' | 'forbidden' | 'notfound' | 'ratelimit' | 'error'

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

interface DvlaResult {
  registration: string
  make: string
  colour: string
  taxStatus: string
  taxExpiry: string
  motStatus: string
  motExpiry: string
}

// fetch() has no default timeout; a hung upstream would stall a worker and stick
// the job at "0 of N". Give every request a hard ceiling so a stall becomes a
// fast, retryable error.
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
 * A stored "registration" can carry a private/cherished plate with the original
 * DVLA plate in brackets, e.g. "91VP ( HK72XOL )". DVLA can't look up that whole
 * string, so derive the candidate plates to try in priority order: the leading
 * (private/current) plate first, then any bracketed (original) plate.
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

  if (candidates.length === 0) {
    const whole = clean(raw)
    if (whole) candidates.push(whole)
  }

  return [...new Set(candidates)]
}

async function fetchDvlaVehicle(registration: string, apiKey: string): Promise<DvlaResult> {
  const registrationNumber = registration.replace(/\s+/g, '').toUpperCase()

  const response = await fetch(DVLA_URL, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
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
        throw new DvlaError('invalid', 400, `"${registrationNumber}" is not a valid registration.`)
      case 403:
        throw new DvlaError('forbidden', 403, 'DVLA rejected the API key. Check the key and that it matches the endpoint (test vs live).')
      case 404:
        throw new DvlaError('notfound', 404, `No DVLA record found for "${registrationNumber}".`)
      case 429:
        throw new DvlaError('ratelimit', 429, 'DVLA rate limit reached.')
      default:
        throw new DvlaError('error', response.status, `DVLA lookup failed (status ${response.status}). ${errorText}`.trim())
    }
  }

  const data = (await response.json()) as Record<string, any>
  return {
    registration: data.registrationNumber ?? registrationNumber,
    make: data.make ?? '',
    colour: data.colour ?? '',
    taxStatus: data.taxStatus ?? '',
    taxExpiry: data.taxDueDate ?? '',
    motStatus: data.motStatus ?? '',
    motExpiry: data.motExpiryDate ?? '',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DVSA MOT History client — ported from functions/src/motHistory.ts
// ─────────────────────────────────────────────────────────────────────────────

const MOT_BASE = 'https://history.mot.api.gov.uk/v1/trade/vehicles/registration/'

interface MotCreds {
  clientId: string
  clientSecret: string
  apiKey: string
  tokenUrl: string
  scope: string
}

interface MotResult {
  model: string
  motStatus: string
  motExpiry: string // normalised to YYYY-MM-DD
  hasOutstandingRecall: string // 'Yes' | 'No' | 'Unknown' | ''
}

// Token cached at module scope and reused across warm invocations.
let cachedToken: { value: string; exp: number } | null = null

async function getMotToken(c: MotCreds): Promise<string> {
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
  const data = (await res.json()) as { access_token: string; expires_in?: number }
  cachedToken = { value: data.access_token, exp: now + (data.expires_in ?? 3600) * 1000 }
  return cachedToken.value
}

const normDate = (d?: string): string => (d ? d.slice(0, 10).replace(/\./g, '-') : '')

async function fetchMotHistory(registration: string, creds: MotCreds): Promise<MotResult | null> {
  const reg = registration.replace(/\s+/g, '').toUpperCase()
  const token = await getMotToken(creds)

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
  const tests: Array<Record<string, any>> = Array.isArray(v.motTests) ? v.motTests : []
  const latest = [...tests].sort((a, b) =>
    String(b.completedDate || '').localeCompare(String(a.completedDate || '')))[0]

  return {
    model: v.model ?? '',
    motStatus: latest?.testResult ?? '',
    motExpiry: normDate(latest?.expiryDate),
    hasOutstandingRecall: v.hasOutstandingRecall ?? '',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk refresh loop — ported from functions/src/bulkRefresh.ts
// ─────────────────────────────────────────────────────────────────────────────

const CONCURRENCY = 4 // simultaneous DVLA requests in flight
const MAX_RETRIES = 4 // per-vehicle retries on rate-limit / transient error
const PROGRESS_EVERY = 10 // push progress to the job row every N processed vehicles

const COOLDOWN_MS = 10 * 60 * 1000 // one refresh per 10 minutes per organisation
const STALE_MS = 15 * 60 * 1000 // an in-progress job older than this is treated as crashed

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface StartResult {
  started: boolean
  alreadyRunning?: boolean
  rateLimited?: boolean
  minutesLeft?: number
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = handlePreflight(req)
  if (pre) return pre

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // ── Identify the caller's org from their JWT (don't trust the client) ──────
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) {
      return json({ error: 'You must be logged in.' }, 401)
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return json({ error: 'You must be logged in.' }, 401)
    }
    const uid = userData.user.id

    // Service-role client for all reads/writes (bypasses RLS for the worker).
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    })

    const { data: profile, error: profErr } = await admin
      .from('profiles')
      .select('organization_id')
      .eq('id', uid)
      .maybeSingle()
    if (profErr) throw profErr
    const organizationId = profile?.organization_id as string | undefined
    if (!organizationId) {
      return json({ error: 'No organisation found for this user.' }, 400)
    }

    // ── Cooldown / already-running guard (ported from the enqueue callable) ────
    const { data: existing } = await admin
      .from('bulk_refresh_jobs')
      .select('status, updated_at, created_at')
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (existing) {
      const now = Date.now()
      const lastTouchedMs = new Date(existing.updated_at ?? existing.created_at ?? 0).getTime()

      // Don't stack a second run on top of one genuinely in progress.
      if (
        (existing.status === 'running' || existing.status === 'requested') &&
        now - lastTouchedMs < STALE_MS
      ) {
        const result: StartResult = { started: false, alreadyRunning: true }
        return json(result)
      }

      // Cooldown: one successful refresh per 10 minutes per organisation. A failed
      // run is NOT capped, so a misconfiguration can be retried immediately.
      if (existing.status === 'done' && lastTouchedMs && now - lastTouchedMs < COOLDOWN_MS) {
        const minutesLeft = Math.max(1, Math.ceil((COOLDOWN_MS - (now - lastTouchedMs)) / 60000))
        const result: StartResult = { started: false, rateLimited: true, minutesLeft }
        return json(result)
      }
    }

    // ── Credentials ───────────────────────────────────────────────────────────
    const apiKey = Deno.env.get('DVLA_API_KEY') ?? ''
    const motCreds: MotCreds = {
      clientId: Deno.env.get('MOT_CLIENT_ID') ?? '',
      clientSecret: Deno.env.get('MOT_CLIENT_SECRET') ?? '',
      apiKey: Deno.env.get('MOT_API_KEY') ?? '',
      tokenUrl: Deno.env.get('MOT_TOKEN_URL') ?? '',
      scope: Deno.env.get('MOT_SCOPE') ?? '',
    }
    const motConfigured = !!(motCreds.clientId && motCreds.clientSecret && motCreds.apiKey && motCreds.tokenUrl)

    // ── Load the org's active fleet ───────────────────────────────────────────
    const { data: fleetRows, error: fleetErr } = await admin
      .from('vehicles')
      .select('id, registration, is_defleeted, make, model, colour')
      .eq('organization_id', organizationId)
    if (fleetErr) throw fleetErr

    const vehicles = (fleetRows ?? [])
      .map((d: any) => ({
        id: d.id as string,
        registration: (d.registration as string) || '',
        isDefleeted: d.is_defleeted === true,
        make: (d.make as string) || '',
        model: (d.model as string) || '',
        colour: (d.colour as string) || '',
      }))
      .filter((v) => v.registration && !v.isDefleeted)

    const total = vehicles.length

    // ── Claim the job: upsert to 'running' with a clean counter set ────────────
    const { error: upsertErr } = await admin
      .from('bulk_refresh_jobs')
      .upsert(
        {
          organization_id: organizationId,
          status: 'running',
          total,
          processed: 0,
          updated: 0,
          not_found: 0,
          errors: 0,
          error_message: null,
        },
        { onConflict: 'organization_id' },
      )
    if (upsertErr) throw upsertErr

    if (!apiKey) {
      await admin
        .from('bulk_refresh_jobs')
        .update({ status: 'error', error_message: 'Vehicle lookup is not configured.' })
        .eq('organization_id', organizationId)
      return json({ error: 'Vehicle lookup is not configured.' }, 500)
    }

    if (total === 0) {
      await admin
        .from('bulk_refresh_jobs')
        .update({ status: 'done' })
        .eq('organization_id', organizationId)
      const result: StartResult = { started: true }
      return json(result)
    }

    // ── Worker pool ───────────────────────────────────────────────────────────
    let nextIndex = 0
    let processed = 0
    let updated = 0
    let notFound = 0
    let errors = 0
    let aborted = false
    let abortMessage = ''

    const writeProgress = async () => {
      await admin
        .from('bulk_refresh_jobs')
        .update({ processed, updated, not_found: notFound, errors })
        .eq('organization_id', organizationId)
        .then(() => {}, () => {})
    }

    const fetchWithRetry = async (reg: string, attempt = 0): Promise<DvlaResult> => {
      try {
        return await fetchDvlaVehicle(reg, apiKey)
      } catch (error) {
        if (
          error instanceof DvlaError &&
          (error.kind === 'ratelimit' || error.kind === 'error') &&
          attempt < MAX_RETRIES
        ) {
          await sleep(400 * Math.pow(2, attempt))
          return fetchWithRetry(reg, attempt + 1)
        }
        throw error
      }
    }

    const worker = async () => {
      while (!aborted) {
        const i = nextIndex++
        if (i >= total) return
        const v = vehicles[i]
        try {
          const candidates = parseRegistrationCandidates(v.registration)
          let ves: DvlaResult | null = null
          let mot: MotResult | null = null
          let lastVesErr: unknown = null

          for (const cand of candidates) {
            const [vesR, motR] = await Promise.allSettled([
              fetchWithRetry(cand),
              motConfigured ? fetchMotHistory(cand, motCreds) : Promise.resolve(null),
            ])

            // A bad/forbidden DVLA key aborts the whole job — no point hammering on.
            if (
              vesR.status === 'rejected' &&
              vesR.reason instanceof DvlaError &&
              vesR.reason.kind === 'forbidden'
            ) {
              aborted = true
              abortMessage = vesR.reason.message
              break
            }

            ves = vesR.status === 'fulfilled' ? vesR.value : null
            mot = motR.status === 'fulfilled' ? motR.value : null
            lastVesErr = vesR.status === 'rejected' ? vesR.reason : null

            if (ves || (mot && (mot.motExpiry || mot.model))) break
          }

          if (aborted) continue

          // Build the update — never wipe a field the APIs return blank.
          const data: Record<string, unknown> = {}
          const motExpiry = mot?.motExpiry || ves?.motExpiry
          if (motExpiry) data.mot_expiry = motExpiry
          if (ves?.taxExpiry) data.tax_expiry = ves.taxExpiry
          if (mot && mot.hasOutstandingRecall) data.has_recall = mot.hasOutstandingRecall === 'Yes'

          // Backfill identity fields ONLY when the vehicle has none — never
          // overwrite a curated value. make/colour come from DVLA VES, model
          // from the DVSA MOT history.
          if (!v.make?.trim() && ves?.make) data.make = ves.make
          if (!v.model?.trim() && mot?.model) data.model = mot.model
          if (!v.colour?.trim() && ves?.colour) data.colour = ves.colour

          if (Object.keys(data).length > 0) {
            // Audit blob in last_tax_update jsonb (camelCase keys preserved),
            // matching the convention the other bulk services use.
            data.last_tax_update = {
              updatedBy: uid,
              updatedAt: new Date().toISOString(),
              source: 'bulk_refresh',
              bulkOperation: true,
              lastDvlaRefresh: new Date().toISOString(),
            }
            // Per-row update; service-role client bypasses RLS.
            const { error: updErr } = await admin
              .from('vehicles')
              .update(data)
              .eq('id', v.id)
            if (updErr) {
              errors++
            } else {
              updated++
            }
          } else if (lastVesErr) {
            if (lastVesErr instanceof DvlaError && lastVesErr.kind === 'notfound') {
              notFound++
            } else {
              errors++
            }
          }
        } catch (_error) {
          errors++
        } finally {
          processed++
          if (processed % PROGRESS_EVERY === 0) await writeProgress()
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker()))
    await writeProgress()

    if (aborted) {
      await admin
        .from('bulk_refresh_jobs')
        .update({ status: 'error', error_message: abortMessage || 'DVLA rejected the API key.' })
        .eq('organization_id', organizationId)
        .then(() => {}, () => {})
      // The job row carries the failure; the client watches it via Realtime.
      const result: StartResult = { started: true }
      return json(result)
    }

    await admin
      .from('bulk_refresh_jobs')
      .update({ status: 'done' })
      .eq('organization_id', organizationId)
      .then(() => {}, () => {})

    const result: StartResult = { started: true }
    return json(result)
  } catch (e) {
    console.error('bulkRefreshVehicleData failed:', e)
    return json({ error: e instanceof Error ? e.message : 'Bulk refresh failed.' }, 500)
  }
})
