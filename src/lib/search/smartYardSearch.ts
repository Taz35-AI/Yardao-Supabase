// src/lib/search/smartYardSearch.ts
// Smart, multi-token yard search. Parses a free-text query like
//   "blue kia sdh", "repair sdh", "greythorn pending ready to rent",
//   "large van greythorn not insured"
// into a set of AND constraints across the vehicle's real attributes
// (status, contract, size, colour, make, model, condition, insurance) plus a
// free-text fallback, then filters the loaded vehicle list client-side.
//
// Vocab for contracts / sizes / colours / makes / models / conditions is built
// from the ACTUAL data so it adapts to whatever values an org uses (no hard-coded
// size codes etc.). Status & insurance keywords are fixed synonyms.

import { CheckedInVehicle, normalizeVehicleStatus } from '@/types'

// Effective status bucket for a vehicle: on-hire vehicles are their own bucket.
export type StatusBucket = 'Ready' | 'Pending checks' | 'Repairs needed' | 'Non-Starter' | 'on_hire'

export function vehicleBucket(v: CheckedInVehicle): StatusBucket {
  if ((v as any).hireStatus === 'Out on Hire') return 'on_hire'
  return normalizeVehicleStatus(v.status) as StatusBucket
}

// ── fixed keyword synonyms ───────────────────────────────────────────────────
const STATUS_SYNONYMS: Record<string, StatusBucket> = {
  'ready': 'Ready', 'ready to rent': 'Ready', 'rentable': 'Ready', 'available': 'Ready',
  'pending': 'Pending checks', 'pending checks': 'Pending checks', 'checks': 'Pending checks',
  'repair': 'Repairs needed', 'repairs': 'Repairs needed', 'repairs needed': 'Repairs needed',
  'non-starter': 'Non-Starter', 'nonstarter': 'Non-Starter', 'non starter': 'Non-Starter',
  'on hire': 'on_hire', 'on-hire': 'on_hire', 'hire': 'on_hire', 'hired': 'on_hire', 'rented': 'on_hire', 'out': 'on_hire',
}
const INSURANCE_SYNONYMS: Record<string, 'Insured' | 'Not Insured'> = {
  'insured': 'Insured',
  'not insured': 'Not Insured', 'uninsured': 'Not Insured', 'no insurance': 'Not Insured',
}
// Connector / filler words that carry no filter meaning on their own.
const FILLER = new Set(['on', 'the', 'a', 'an', 'to', 'in', 'of', 'and', 'with', 'contract', 'rent', 'status', 'vehicle', 'vehicles'])

export interface SmartQuery {
  raw: string
  statuses: Set<StatusBucket>
  insurance: 'Insured' | 'Not Insured' | null
  contracts: string[]
  sizes: string[]
  colours: string[]
  makes: string[]
  freeText: string[]
  isEmpty: boolean
}

interface Vocab {
  byPhrase: Map<string, { dim: 'contract' | 'size' | 'colour' | 'make' | 'model' | 'condition'; value: string }>
  maxWords: number
}

const lc = (s: unknown) => String(s ?? '').trim().toLowerCase()

/** Build the data-driven vocabulary (distinct contracts/sizes/colours/makes/models/conditions). */
export function buildVocab(vehicles: CheckedInVehicle[]): Vocab {
  const byPhrase = new Map<string, { dim: any; value: string }>()
  let maxWords = 2 // status/insurance phrases are up to 3 words; recompute below
  const add = (dim: any, value?: string | null) => {
    const v = lc(value)
    if (!v) return
    if (!byPhrase.has(v)) byPhrase.set(v, { dim, value: v })
    const words = v.split(/\s+/).length
    if (words > maxWords) maxWords = words
  }
  for (const v of vehicles) {
    add('contract', v.contract)
    add('size', v.size)
    add('colour', v.colour)
    add('make', v.make)
    add('model', v.model)
    add('condition', v.condition)
  }
  // status / insurance phrases can be up to 3 words ("ready to rent", "non starter")
  return { byPhrase, maxWords: Math.max(maxWords, 3) }
}

/** Parse a query string into structured AND constraints using the vocab. */
export function parseQuery(raw: string, vocab: Vocab): SmartQuery {
  const q: SmartQuery = {
    raw, statuses: new Set(), insurance: null,
    contracts: [], sizes: [], colours: [], makes: [], freeText: [], isEmpty: true,
  }
  const words = lc(raw).split(/\s+/).filter(Boolean)
  let i = 0
  while (i < words.length) {
    let matched = false
    // Greedy: try the longest phrase window first (status/insurance/vocab).
    const maxW = Math.min(vocab.maxWords, words.length - i)
    for (let w = maxW; w >= 1 && !matched; w--) {
      const phrase = words.slice(i, i + w).join(' ')
      if (STATUS_SYNONYMS[phrase]) { q.statuses.add(STATUS_SYNONYMS[phrase]); i += w; matched = true; break }
      if (INSURANCE_SYNONYMS[phrase]) { q.insurance = INSURANCE_SYNONYMS[phrase]; i += w; matched = true; break }
      const hit = vocab.byPhrase.get(phrase)
      if (hit) {
        if (hit.dim === 'contract') q.contracts.push(hit.value)
        else if (hit.dim === 'size') q.sizes.push(hit.value)
        else if (hit.dim === 'colour') q.colours.push(hit.value)
        else if (hit.dim === 'make') q.makes.push(hit.value)
        else q.freeText.push(hit.value) // model / condition → free text match
        i += w; matched = true; break
      }
    }
    if (!matched) {
      const word = words[i]
      if (!FILLER.has(word)) q.freeText.push(word)
      i += 1
    }
  }
  q.isEmpty = q.statuses.size === 0 && !q.insurance && q.contracts.length === 0 &&
    q.sizes.length === 0 && q.colours.length === 0 && q.makes.length === 0 && q.freeText.length === 0
  return q
}

function blob(v: CheckedInVehicle): string {
  return [v.registration, v.make, v.model, v.colour, v.size, v.contract, v.condition, v.status]
    .map(lc).join(' ')
}

/** Does one vehicle satisfy every constraint in the parsed query? */
export function matchesQuery(v: CheckedInVehicle, q: SmartQuery): boolean {
  if (q.statuses.size > 0 && !q.statuses.has(vehicleBucket(v))) return false
  if (q.insurance && lc(v.insuranceStatus) !== lc(q.insurance)) return false
  if (q.contracts.length && !q.contracts.includes(lc(v.contract))) return false
  if (q.sizes.length && !q.sizes.includes(lc(v.size))) return false
  if (q.colours.length && !q.colours.includes(lc(v.colour))) return false
  if (q.makes.length && !q.makes.includes(lc(v.make))) return false
  if (q.freeText.length) {
    const text = blob(v)
    if (!q.freeText.every(t => text.includes(t))) return false
  }
  return true
}

/** One-shot helper: parse + filter. */
export function smartSearch(vehicles: CheckedInVehicle[], raw: string, vocab?: Vocab): { query: SmartQuery; results: CheckedInVehicle[] } {
  const v = vocab ?? buildVocab(vehicles)
  const query = parseQuery(raw, v)
  if (query.isEmpty) return { query, results: [] }
  return { query, results: vehicles.filter(x => matchesQuery(x, query)) }
}
