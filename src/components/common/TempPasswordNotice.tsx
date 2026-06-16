// src/components/common/TempPasswordNotice.tsx
// One-time, NON-blocking welcome notice for users created with a temporary
// password. Replaces the old forced "set a new password" redirect: instead of
// trapping the user on /reset-password-required, we show a single branded card
// telling them they can change their password later from their Profile page if
// they want to. Dismissing it clears requires_password_reset so it never shows
// again. (The forced-reset flow in PasswordResetGuard + /reset-password-required
// is kept in the codebase as a fallback, just no longer auto-enforced.)
'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { Button } from '@/components/ui/Button'
import { useT } from '@/lib/i18n'
import { logger } from '@/lib/logger'

// Auth / recovery routes where the notice must never appear.
const EXEMPT = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/reset-password-required',
  '/verify-email-required',
  '/offline',
]

export function TempPasswordNotice() {
  const { user, profile, loading, profileLoading, refreshProfile } = useAuth()
  const pathname = usePathname()
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Reset the local dismissed latch if a different user signs in.
  useEffect(() => { setDismissed(false) }, [user?.uid])

  if (loading || profileLoading) return null
  if (!user || !profile) return null
  if (!profile.requiresPasswordReset) return null
  if (dismissed) return null

  const path = (pathname || '/').replace(/\/+$/, '') || '/'
  if (EXEMPT.some((p) => path === p || path.startsWith(p + '/'))) return null

  const acknowledge = async () => {
    setBusy(true)
    setDismissed(true) // hide immediately for a snappy feel
    try {
      await userProfileService.updateProfile(user.uid, { requiresPasswordReset: false })
      await refreshProfile()
    } catch (e) {
      logger.error('Failed to clear temp-password notice flag:', e)
      // Stay dismissed for this session even if the write failed; it will show
      // again next login, which is acceptable for a non-blocking notice.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-[#e2e8e5] dark:border-gray-700 overflow-hidden">
        {/* Branded header */}
        <div className="flex flex-col items-center gap-3 px-6 pt-7 pb-4 bg-[#012619]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/yardao-logo.png"
            alt="Yardao"
            className="h-11 w-auto object-contain"
          />
          <h2 className="text-base font-semibold text-white text-center">
            {t('tempPassword.title')}
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="text-sm leading-relaxed text-[#4a5e54] dark:text-gray-300 text-center">
            {t('tempPassword.body')}
          </p>
          <Button
            onClick={acknowledge}
            disabled={busy}
            className="mt-5 w-full bg-[#025940] hover:bg-[#012619] text-white font-medium"
          >
            {t('tempPassword.gotIt')}
          </Button>
        </div>
      </div>
    </div>
  )
}
