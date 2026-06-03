// src/lib/i18n/config.ts
// Lightweight in-app i18n config. No external dependency — a tiny custom
// layer keeps the bundle small, avoids SSR/route-config complexity on a
// static-export app, and is fully reversible. English is the source of
// truth; any missing/untranslated key falls back to English (never blank).

export type Lang = 'en' | 'ro' | 'bg' | 'pl'

export const DEFAULT_LANG: Lang = 'en'

// localStorage key (mirrors how next-themes persists the theme — instant,
// per-device). Cross-device sync is handled separately via the user
// profile (languagePreference) on Settings → Save.
export const LANG_STORAGE_KEY = 'yardao.lang'

export const LANGS: { value: Lang; label: string; locale: string }[] = [
  { value: 'en', label: 'English', locale: 'en-GB' },
  { value: 'ro', label: 'Română', locale: 'ro-RO' },
  { value: 'bg', label: 'Български', locale: 'bg-BG' },
  { value: 'pl', label: 'Polski', locale: 'pl-PL' },
]

export function localeFor(lang: Lang): string {
  return LANGS.find((l) => l.value === lang)?.locale ?? 'en-GB'
}
