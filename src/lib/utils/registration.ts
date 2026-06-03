// src/lib/utils/registration.ts
// Vehicle-registration helpers. Mirrors lib/utils/phone.ts: there is one
// canonical key form used for ALL lookups/joins (parts usage, customer
// registration history, custom-vehicle matching) so "gj22 oxx", "GJ22OXX"
// and " gj22oxx " all resolve to the same value.
//
// UK plates are conventionally displayed with a space ("GJ22 OXX") but the
// space is cosmetic — the registration is the same number plate with or
// without it. The canonical key is therefore: uppercase, no whitespace.

/** Canonical registration key: trim, uppercase, strip ALL whitespace.
 *  Use this for every write and every lookup that joins on registration
 *  (partUsage, customer.registrations[], custom-vehicle matching). */
export function normalizeReg(reg: string | null | undefined): string {
  if (!reg) return ''
  return reg.toUpperCase().replace(/\s+/g, '').trim()
}

/** True when the input looks like a plausible registration (≥ 2 chars
 *  after normalising). Deliberately loose — covers personalised plates
 *  and non-UK formats; we just want to reject blanks/typos. */
export function isRegUsable(reg: string | null | undefined): boolean {
  return normalizeReg(reg).length >= 2
}
