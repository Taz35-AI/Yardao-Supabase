// src/lib/search/smartFleetSearch.ts
// Smart, multi-token search for the FLEET page. Parses a free-text query into
// AND constraints across every fleet column + derived predicates, then filters
// the loaded fleet list client-side. Examples:
//   "blue transit lease"            → colour=blue AND make=transit AND contract=lease
//   "not insured mot expired"       → insurance=Not Insured AND MOT expired
//   "sold scrapped"                 → status in {sold, scrapped}  (multiple ok)
//   "recall white van"             → has recall AND colour=white AND size≈van
//   "ABC123" / partial reg/model    → free-text fallback
//
// Vocab for make / model / colour / size / contract / condition is built from
// the ACTUAL data so it adapts to whatever an org uses. Status, insurance and
// the date-derived MOT/tax/recall predicates are fixed keyword phrases.

import { FleetVehicle } from '@/types'

const lc = (s: unknown) => String(s ?? '').trim().toLowerCase()

function daysUntil(iso?: string | null): number | null {
  if (!iso) return null
  const d = new Date(String(iso))
  if (isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000)
}

// MOT / road tax counts as "due soon" within this many days.
const SOON_DAYS = 30

type FleetStatus = 'in_fleet' | 'checked_in' | 'external_service' | 'sold' | 'scrapped' | 'defleeted'
type Flag = 'recall' | 'mot_expired' | 'mot_soon' | 'no_mot' | 'tax_expired' | 'tax_soon' | 'no_tax' | 'defleeted'

const STATUS_SYNONYMS: Record<string, FleetStatus> = {
  'in fleet': 'in_fleet', 'on fleet': 'in_fleet', 'active': 'in_fleet', 'in_fleet': 'in_fleet',
  'checked in': 'checked_in', 'in yard': 'checked_in',
  'external': 'external_service', 'at garage': 'external_service', 'external service': 'external_service',
  'sold': 'sold', 'scrapped': 'scrapped',
}
const INSURANCE_SYNONYMS: Record<string, 'Insured' | 'Not Insured'> = {
  'insured': 'Insured', 'not insured': 'Not Insured', 'uninsured': 'Not Insured', 'no insurance': 'Not Insured',
}
// Longest phrases first matters; the windowed parser tries up to 3 words.
const FLAG_SYNONYMS: Record<string, Flag> = {
  'recall': 'recall', 'recalls': 'recall',
  'defleeted': 'defleeted', 'defleet': 'defleeted',
  'no mot': 'no_mot', 'mot expired': 'mot_expired', 'mot due': 'mot_soon', 'mot expiring': 'mot_soon', 'mot soon': 'mot_soon',
  'no tax': 'no_tax', 'no road tax': 'no_tax', 'road tax expired': 'tax_expired', 'tax expired': 'tax_expired',
  'road tax due': 'tax_soon', 'tax due': 'tax_soon', 'road tax expiring': 'tax_soon', 'tax expiring': 'tax_soon',
}
const FILLER = new Set(['the', 'a', 'an', 'to', 'in', 'of', 'and', 'with', 'on', 'contract', 'status', 'vehicle', 'vehicles', 'is'])

export interface FleetQuery {
  raw: string
  statuses: Set<FleetStatus>
  flags: Set<Flag>
  insurance: 'Insured' | 'Not Insured' | null
  makes: string[]
  colours: string[]
  sizes: string[]
  contracts: string[]
  freeText: string[]
  isEmpty: boolean
}

interface Vocab {
  byPhrase: Map<string, { dim: 'make' | 'model' | 'colour' | 'size' | 'contract' | 'condition'; value: string }>
  maxWords: number
}

export function buildFleetVocab(vehicles: FleetVehicle[]): Vocab {
  const byPhrase = new Map<string, { dim: any; value: string }>()
  let maxWords = 3
  const add = (dim: any, value?: string | null) => {
    const v = lc(value)
    if (!v) return
    if (!byPhrase.has(v)) byPhrase.set(v, { dim, value: v })
    maxWords = Math.max(maxWords, v.split(/\s+/).length)
  }
  for (const v of vehicles) {
    add('make', v.make); add('model', v.model); add('colour', v.colour)
    add('size', v.size); add('contract', v.contract); add('condition', v.condition)
  }
  return { byPhrase, maxWords }
}

export function parseFleetQuery(raw: string, vocab: Vocab): FleetQuery {
  const q: FleetQuery = {
    raw, statuses: new Set(), flags: new Set(), insurance: null,
    makes: [], colours: [], sizes: [], contracts: [], freeText: [], isEmpty: true,
  }
  const words = lc(raw).split(/\s+/).filter(Boolean)
  let i = 0
  while (i < words.length) {
    let matched = false
    const maxW = Math.min(vocab.maxWords, words.length - i)
    for (let w = maxW; w >= 1 && !matched; w--) {
      const phrase = words.slice(i, i + w).join(' ')
      if (STATUS_SYNONYMS[phrase]) { q.statuses.add(STATUS_SYNONYMS[phrase]); i += w; matched = true; break }
      if (FLAG_SYNONYMS[phrase]) { q.flags.add(FLAG_SYNONYMS[phrase]); i += w; matched = true; break }
      if (INSURANCE_SYNONYMS[phrase]) { q.insurance = INSURANCE_SYNONYMS[phrase]; i += w; matched = true; break }
      const hit = vocab.byPhrase.get(phrase)
      if (hit) {
        if (hit.dim === 'make') q.makes.push(hit.value)
        else if (hit.dim === 'colour') q.colours.push(hit.value)
        else if (hit.dim === 'size') q.sizes.push(hit.value)
        else if (hit.dim === 'contract') q.contracts.push(hit.value)
        else q.freeText.push(hit.value) // model / condition → free text
        i += w; matched = true; break
      }
    }
    if (!matched) {
      if (!FILLER.has(words[i])) q.freeText.push(words[i])
      i += 1
    }
  }
  q.isEmpty = q.statuses.size === 0 && q.flags.size === 0 && !q.insurance &&
    q.makes.length === 0 && q.colours.length === 0 && q.sizes.length === 0 &&
    q.contracts.length === 0 && q.freeText.length === 0
  return q
}

// Searchable text blob for free-text tokens. Includes the registration BOTH
// as-stored and compacted (alnum-only, no spaces) so partials and the trailing
// chars/digits match — e.g. "vo57yhr", "57yhr" or just "yhr" all hit "VO57 YHR".
function blob(v: FleetVehicle): string {
  const reg = lc(v.registration)
  const regCompact = reg.replace(/[^a-z0-9]/g, '')
  return [reg, regCompact, v.make, v.model, v.colour, v.size, v.contract, v.condition, v.comments]
    .map(lc).join(' ')
}

function hasFlag(v: FleetVehicle, f: Flag): boolean {
  const mot = daysUntil(v.motExpiry)
  const tax = daysUntil(v.taxExpiry)
  switch (f) {
    case 'recall': return v.hasRecall === true
    case 'defleeted': return v.isDefleeted === true
    case 'no_mot': return !v.motExpiry
    case 'mot_expired': return mot !== null && mot < 0
    case 'mot_soon': return mot !== null && mot >= 0 && mot <= SOON_DAYS
    case 'no_tax': return !v.taxExpiry
    case 'tax_expired': return tax !== null && tax < 0
    case 'tax_soon': return tax !== null && tax >= 0 && tax <= SOON_DAYS
  }
}

export function matchesFleetQuery(v: FleetVehicle, q: FleetQuery): boolean {
  if (q.statuses.size > 0 && !q.statuses.has((v.currentStatus as FleetStatus) || 'in_fleet')) return false
  if (q.insurance && lc(v.insuranceStatus) !== lc(q.insurance)) return false
  if (q.makes.length && !q.makes.includes(lc(v.make))) return false
  if (q.colours.length && !q.colours.includes(lc(v.colour))) return false
  if (q.sizes.length && !q.sizes.includes(lc(v.size))) return false
  if (q.contracts.length && !q.contracts.includes(lc(v.contract))) return false
  for (const f of q.flags) if (!hasFlag(v, f)) return false
  if (q.freeText.length) {
    const text = blob(v)
    // Each token must appear somewhere in the blob. Test the token as typed AND
    // its alnum-only form so reg fragments with punctuation/spaces still match.
    const ok = q.freeText.every(t => {
      if (text.includes(t)) return true
      const compact = t.replace(/[^a-z0-9]/g, '')
      return compact.length > 0 && text.includes(compact)
    })
    if (!ok) return false
  }
  return true
}
