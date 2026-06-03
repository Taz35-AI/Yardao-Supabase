// src/lib/utils/phone.ts
// Phone-number helpers used by the customer collection. We keep the user's
// original input for display ("+44 7123 456789" — looks nice, opens dialer
// correctly) but compute a normalized digits-only key for dedupe lookup
// ("447123456789"). Two customers with phones formatted differently but
// representing the same number will resolve to the same normalized value.

/** Strip everything except digits, then drop a single leading 0 (UK trunk
 *  prefix) so "07123 456789" and "+44 7123 456789" both normalise to
 *  "7123456789" / "447123456789" respectively — close enough for dedupe.
 *  We don't try to be E.164-perfect; the goal is "same person → same key",
 *  not regulator-grade phone parsing. */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D+/g, '')
  if (!digits) return ''
  // Drop a single leading 0 (UK national trunk). Numbers entered with an
  // international prefix already have country code in front so this only
  // affects "07..." style entries.
  return digits.startsWith('0') ? digits.slice(1) : digits
}

/** True when the input looks like a usable phone number (≥ 6 digits after
 *  stripping). Matches the form-side validator's threshold. */
export function isPhoneUsable(phone: string | null | undefined): boolean {
  if (!phone) return false
  return phone.replace(/\D+/g, '').length >= 6
}
