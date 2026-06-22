// src/utils/serviceBookings/bayLabels.ts
// Resolves a bay number to its display label.
//
// SAFETY: a bay's identity is ALWAYS its number — bookings, service history and
// the scheduling logic reference the number, never the name. These helpers only
// decide how that number is *shown*. A blank or missing custom name falls back
// to the default ("Bay N"), so behaviour is unchanged for branches that never
// set names. Renaming a bay never moves a booking.

/** The custom name set for a bay, or null when none/blank.
 *  `bayNumber` is 1-indexed (bay 1 → names[0]). */
export function getBayName(
  bayNames: string[] | null | undefined,
  bayNumber: number | null | undefined,
): string | null {
  if (!bayNames || !bayNumber || bayNumber < 1) return null
  const name = bayNames[bayNumber - 1]
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Display label for a bay: the custom name if set, otherwise `fallback`
 *  (pass the localised "Bay N" string). */
export function bayLabel(
  bayNames: string[] | null | undefined,
  bayNumber: number | null | undefined,
  fallback: string,
): string {
  return getBayName(bayNames, bayNumber) ?? fallback
}

/** Trim names and drop trailing blanks so we don't persist empty padding.
 *  Keeps interior blanks (a named bay 3 with an unnamed bay 2 stays aligned by
 *  index). Returns undefined when nothing meaningful is left. */
export function normalizeBayNames(
  names: (string | null | undefined)[] | null | undefined,
): string[] | undefined {
  if (!names || names.length === 0) return undefined
  const cleaned = names.map((n) => (typeof n === 'string' ? n.trim() : ''))
  let lastNamed = -1
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i].length > 0) lastNamed = i
  }
  if (lastNamed < 0) return undefined
  return cleaned.slice(0, lastNamed + 1)
}
