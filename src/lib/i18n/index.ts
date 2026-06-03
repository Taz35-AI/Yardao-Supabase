// src/lib/i18n/index.ts
// Single entry point for the i18n layer.

export { LanguageProvider, useLang, useT } from './LanguageProvider'
export { LanguageSync } from './LanguageSync'
export { LANGS, DEFAULT_LANG, localeFor } from './config'
export type { Lang } from './config'
export { formatDateLocale } from './date'
export {
  localizeWorkType,
  localizeWorkRequired,
  localizeWorkList,
  localizePartsStatus,
} from './serviceBookingLabels'
