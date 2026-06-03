// src/lib/i18n/serviceBookingLabels.ts
// DISPLAY-ONLY localisation helpers for service-booking domain values.
//
// The stored Firestore value, the colour-key lookup (workTypeStyles), the
// search filter, and any === comparison MUST keep using the raw English
// value. These helpers only translate what is RENDERED to the user. A value
// not present in the dictionary (e.g. free-typed custom work) falls back to
// the raw value, never a key path.

type TFunc = (key: string, vars?: Record<string, string | number>) => string

/** Localise a single work-type token for display only. Unknown / custom
 *  work returns the raw value unchanged. */
export function localizeWorkType(t: TFunc, value: string): string {
  if (!value) return value
  const key = `serviceBookings.workType.${value}`
  const v = t(key)
  // translate() returns the key itself when it can't resolve — treat that
  // as "not a known work type" and show the original (custom) text.
  return v === key ? value : v
}

/** Localise a booking's workRequired (string | string[]) into one display
 *  string. `fallback` is shown when there is no work at all. */
export function localizeWorkRequired(
  t: TFunc,
  workRequired: string | string[] | null | undefined,
  fallback: string,
  joiner = ' + ',
): string {
  if (Array.isArray(workRequired)) {
    const parts = workRequired.filter(Boolean).map(w => localizeWorkType(t, w))
    return parts.length ? parts.join(joiner) : fallback
  }
  if (workRequired) return localizeWorkType(t, workRequired)
  return fallback
}

/** Localise a booking's workRequired into an array of display strings
 *  (for chip lists). */
export function localizeWorkList(
  t: TFunc,
  workRequired: string | string[] | null | undefined,
): string[] {
  if (Array.isArray(workRequired)) {
    return workRequired.filter(Boolean).map(w => localizeWorkType(t, w))
  }
  if (workRequired) return [localizeWorkType(t, workRequired)]
  return []
}

/** Localise a parts-status code ('needed' | 'ordered' | 'in') for display.
 *  The code itself stays the logic/stored value. */
export function localizePartsStatus(t: TFunc, status: string): string {
  if (!status) return status
  const key = `serviceBookings.parts.${status}`
  const v = t(key)
  return v === key ? status : v
}
