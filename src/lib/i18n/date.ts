// src/lib/i18n/date.ts
// Locale-aware date formatting. Phase 1 ships the helper; Phase 2 swaps
// the ~39 hardcoded en-GB call sites over to it page by page.

export function formatDateLocale(
  d: Date | string | number | null | undefined,
  locale: string,
  opts: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  },
): string {
  if (d == null) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleDateString(locale, opts)
}
