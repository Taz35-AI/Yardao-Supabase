// src/lib/i18n/LanguageProvider.tsx
// App-wide language context. `t(key, vars?)` resolves a dotted key in the
// current language, falls back to English, and finally to the key itself
// (last resort — shouldn't happen since English is complete). Interpolates
// {tokens}. Hooks degrade gracefully (English) if used outside the
// provider so a stray component can never crash a screen.

'use client'

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react'
import {
  Lang,
  DEFAULT_LANG,
  LANG_STORAGE_KEY,
  localeFor,
} from './config'
import { en } from './dictionaries/en'
import { ro } from './dictionaries/ro'
import { bg } from './dictionaries/bg'
import { pl } from './dictionaries/pl'

const DICTS: Record<Lang, unknown> = { en, ro, bg, pl }

function lookup(dict: unknown, key: string): string | undefined {
  const val = key
    .split('.')
    .reduce<unknown>(
      (o, k) =>
        o && typeof o === 'object'
          ? (o as Record<string, unknown>)[k]
          : undefined,
      dict,
    )
  return typeof val === 'string' ? val : undefined
}

function interpolate(
  raw: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (_, n) =>
    n in vars ? String(vars[n]) : `{${n}}`,
  )
}

function translate(
  lang: Lang,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const raw = lookup(DICTS[lang], key) ?? lookup(en, key) ?? key
  return interpolate(raw, vars)
}

interface Ctx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, vars?: Record<string, string | number>) => string
  locale: string
}

const FALLBACK_CTX: Ctx = {
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (key, vars) => translate(DEFAULT_LANG, key, vars),
  locale: localeFor(DEFAULT_LANG),
}

const LanguageContext = createContext<Ctx | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // First render is always DEFAULT_LANG (so static export / hydration can
  // never mismatch); the saved choice is applied on mount.
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANG_STORAGE_KEY) as Lang | null
      if (saved && saved !== lang && saved in DICTS) setLangState(saved)
    } catch {
      // localStorage unavailable (privacy mode etc.) — stay on default.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, l)
    } catch {
      // ignore — language still applies for this session
    }
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translate(lang, key, vars),
    [lang],
  )

  return (
    <LanguageContext.Provider
      value={{ lang, setLang, t, locale: localeFor(lang) }}
    >
      {children}
    </LanguageContext.Provider>
  )
}

export function useLang() {
  const c = useContext(LanguageContext) ?? FALLBACK_CTX
  return { lang: c.lang, setLang: c.setLang, locale: c.locale }
}

export function useT() {
  return (useContext(LanguageContext) ?? FALLBACK_CTX).t
}
