// src/lib/i18n/LanguageSync.tsx
// Applies the user's cross-device saved language (userProfile.languagePreference)
// app-wide as soon as they are authenticated — not only when the Settings page
// is opened. LanguageProvider hydrates instantly from localStorage (per-device,
// no flash); this reconciles to the profile preference on login so a fresh
// device / cleared storage still respects the saved choice. Renders nothing.

'use client'

import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { logger } from '@/lib/logger'
import { useLang } from './LanguageProvider'

export function LanguageSync() {
  const { user } = useAuth()
  const { setLang } = useLang()

  useEffect(() => {
    if (!user?.uid) return
    let cancelled = false

    userProfileService
      .getProfile(user.uid)
      .then(profile => {
        if (cancelled) return
        const pref = profile?.languagePreference
        if (pref === 'en' || pref === 'ro' || pref === 'bg' || pref === 'pl') setLang(pref)
      })
      .catch(err => logger.error('LanguageSync: failed to load language preference', err))

    return () => {
      cancelled = true
    }
    // Only re-run on login (user change). Intentionally NOT depending on `lang`
    // so a manual in-app toggle is never overridden by a stale profile value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])

  return null
}
