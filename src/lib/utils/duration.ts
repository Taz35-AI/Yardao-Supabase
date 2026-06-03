// src/lib/utils/duration.ts
// Human-friendly duration formatter shared across the booking UI. Replaces
// raw "120m" / "240m" displays with "2hrs" / "4hrs", and handles half-hour
// slots as "1.5hrs". Falls back to "Xh Ym" for anything not on a 30-min
// boundary so future non-grid durations (e.g. custom-time external
// bookings) still render sensibly.

/**
 * Format a minute count as a short, human-readable duration.
 *
 * Examples (assuming the 30-min booking-slot grid):
 *   30  → "30m"
 *   60  → "1hr"
 *   90  → "1.5hrs"
 *   120 → "2hrs"
 *   150 → "2.5hrs"
 *   240 → "4hrs"
 *   400 → "6h 40m"   (non-30-multiple — fallback)
 */
export function formatDuration(mins: number): string {
  if (!Number.isFinite(mins) || mins <= 0) return ''
  if (mins < 60) return `${Math.round(mins)}m`

  // Whole hours.
  if (mins % 60 === 0) {
    const h = mins / 60
    return h === 1 ? '1hr' : `${h}hrs`
  }

  // Half hours — the common 90 / 150 / 210 / … case.
  if (mins % 30 === 0) {
    const halves = mins / 30        // e.g. 90 → 3
    const decimal = halves / 2      // 3 → 1.5
    return `${decimal}hrs`
  }

  // Anything else (off-grid custom times) — fall back to "Xh Ym".
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h ${m}m`
}
