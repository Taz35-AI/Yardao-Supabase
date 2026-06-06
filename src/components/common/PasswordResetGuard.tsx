// src/components/common/PasswordResetGuard.tsx
// Global enforcement of "must set a new password on first login".
//
// A user the admin created (or who was migrated in) has
// requires_password_reset = true on their profile. This guard redirects them to
// /reset-password-required from ANY protected page — not just the login page —
// so they can't bypass it by navigating directly to a URL, refreshing, or
// deep-linking. It clears itself the moment the flag is false (the reset page
// refreshes the profile after setting the new password), so there's no loop.
'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

// Pages the guard must NEVER redirect away from (auth / recovery flows).
const EXEMPT = [
  '/reset-password-required',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email-required',
  '/offline',
]

export function PasswordResetGuard() {
  const { user, profile, loading, profileLoading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    // Wait until auth + profile are fully resolved — never redirect on a guess.
    if (loading || profileLoading) return
    if (!user || !profile) return
    if (!profile.requiresPasswordReset) return

    const path = (pathname || '/').replace(/\/+$/, '') || '/'
    if (EXEMPT.some((p) => path === p || path.startsWith(p + '/'))) return

    router.replace('/reset-password-required')
  }, [user, profile, loading, profileLoading, pathname, router])

  return null
}
