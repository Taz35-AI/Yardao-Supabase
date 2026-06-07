// src/lib/vehicleArt/match.ts
// Maps a vehicle's (make, model) to one of the art files in public/Vehicles/
// purely from the file NAMES — so new files are drop-in (add file -> rebuild ->
// linked). Tolerant of real-world data: make aliases (Volkswagen->vw,
// Mercedes-Benz->mercedes), trim suffixes (Golf GTI -> golf), and small typos
// (yaris vs the file's "yarris") via a bounded fuzzy fallback.
import { VEHICLE_ART_FILES } from './manifest'

/** Lowercase + strip every non-alphanumeric char. */
function normalize(s: string | undefined | null): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

// Map a normalised make to the token used in the file names.
const MAKE_ALIASES: Record<string, string> = {
  volkswagen: 'vw',
  vw: 'vw',
  mercedesbenz: 'mercedes',
  mercedes: 'mercedes',
  merc: 'mercedes',
}

function aliasMake(make: string): string {
  return MAKE_ALIASES[make] || make
}

/**
 * Some makes name files by model family while the data uses numeric trims.
 * e.g. BMW "330"/"320d"/"318i" all belong to the "3 Series" file.
 */
function modelFamily(makeToken: string, modelNorm: string): string | null {
  if (makeToken === 'bmw') {
    // 3-digit trim like 320 / 330 / 335 -> "<n>series"
    const m = modelNorm.match(/^(\d)\d{2}[a-z]*$/)
    if (m) return `${m[1]}series`
  }
  return null
}

/** Candidate lookup keys for a vehicle (aliased + raw make + model family). */
function candidateKeys(make?: string, model?: string): string[] {
  const m = normalize(make)
  const md = normalize(model)
  const keys = new Set<string>()
  const am = aliasMake(m)
  if (am || md) keys.add(am + md)
  if (m || md) keys.add(m + md)
  const fam = modelFamily(am, md)
  if (fam) keys.add(am + fam)
  return [...keys].filter(Boolean)
}

/** Bounded Levenshtein (good enough for short keys). */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (Math.abs(m - n) > 2) return 99
  const dp = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      prev = tmp
    }
  }
  return dp[n]
}

const cache = new Map<string, string | null>()

/**
 * Returns the matching art file basename (e.g. "vwgolf", "ford transit") or
 * null if none. Pure name-based matching against VEHICLE_ART_FILES.
 */
export function matchVehicleArtFile(make?: string, model?: string): string | null {
  const cacheKey = `${make || ''}|${model || ''}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  const cands = candidateKeys(make, model)
  let best: string | null = null
  let bestScore = -1

  if (cands.length) {
    for (const file of VEHICLE_ART_FILES) {
      const fk = normalize(file)
      if (fk.length < 3) continue
      for (const ck of cands) {
        if (!ck) continue
        let score = -1
        if (fk === ck) {
          score = 1000
        } else if (ck.startsWith(fk) && fk.length >= 4) {
          // file is the general form, vehicle has a trim suffix (Golf GTI)
          score = 500 + fk.length
        } else if (fk.startsWith(ck) && ck.length >= 5) {
          score = 300 + ck.length
        } else if (
          fk.slice(0, 4) === ck.slice(0, 4) &&
          fk[fk.length - 1] === ck[ck.length - 1] &&
          Math.max(fk.length, ck.length) >= 5 &&
          levenshtein(fk, ck) <= 1
        ) {
          // same make prefix + same final char + 1-char typo (yaris vs yarris,
          // trafic vs traffic) — but NOT a differing model discriminator like
          // Model 3 vs Model S.
          score = 250
        }
        if (score > bestScore) {
          bestScore = score
          best = file
        }
      }
    }
  }

  const result = bestScore >= 250 ? best : null
  cache.set(cacheKey, result)
  return result
}
