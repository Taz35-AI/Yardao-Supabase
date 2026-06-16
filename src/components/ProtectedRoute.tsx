// src/components/ProtectedRoute.tsx
// Auth/active gate. The user PROFILE is now fetched ONCE per auth change in
// AuthContext (not per navigation). This component is a pure consumer of
// that shared profile — same checks, same redirects, ZERO Firestore reads
// on route changes.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { isUserActive, isUserDeleted } from '@/types'

type Decision =
  | 'loading'
  | 'no-user'
  | 'error'
  | 'no-profile'
  | 'deleted'
  | 'inactive'
  | 'ok'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, profile, profileLoading, profileError } = useAuth()
  const router = useRouter()

  // 🛟 Cold-reload guard. On a hard refresh, Firebase auth AND the
  // one-time profile read rehydrate asynchronously. Without a grace
  // window ProtectedRoute would momentarily see 'no-user' / 'no-profile'
  // and bounce a genuinely signed-in user to /login (the bug: dashboard
  // has no ProtectedRoute so it never bounced; every gated page did).
  // We hold the spinner for a short settle period before honouring any
  // evicting decision — signed-in users resolve to 'ok' well within it;
  // genuinely-logged-out users still reach /login, just ~1.2s later.
  const [settleDone, setSettleDone] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setSettleDone(true), 1200)
    return () => clearTimeout(id)
  }, [])

  const decision = useMemo<Decision>(() => {
    if (loading) return 'loading'
    if (!user) return 'no-user'
    // Auth resolved but the one-time profile fetch is still in flight —
    // wait (spinner), do NOT treat as "no profile".
    if (profileLoading) return 'loading'
    if (profileError) return 'error'
    if (!profile) return 'no-profile'
    if (isUserDeleted(profile)) return 'deleted'
    if (!isUserActive(profile)) return 'inactive'
    return 'ok'
  }, [loading, user, profileLoading, profileError, profile])

  // 🐶 Watchdog: never spin forever. If we're still 'loading' after a generous
  // window (a wedged/expired session that didn't resolve on resume), stop
  // waiting and route to /login instead of leaving the user on an endless
  // spinner. AuthContext now resolves within ~8s, so this only fires in the
  // genuinely-stuck case.
  useEffect(() => {
    if (decision !== 'loading') return
    const id = setTimeout(() => router.push('/login?reason=timeout'), 12000)
    return () => clearTimeout(id)
  }, [decision, router])

  // Redirect side-effects — identical destinations/params to the original,
  // but suppressed until the cold-reload settle window has elapsed so a
  // still-rehydrating session is never falsely evicted.
  useEffect(() => {
    if (!settleDone) return
    switch (decision) {
      case 'no-user':
        router.push('/login')
        break
      case 'error':
        logout()
        router.push('/login?error=profile-error')
        break
      case 'no-profile':
        logout()
        router.push('/login')
        break
      case 'deleted':
        logout()
        router.push('/login?error=account-deleted')
        break
      case 'inactive':
        logout()
        router.push('/login?error=account-inactive')
        break
      // 'loading' and 'ok' → no side-effect
    }
  }, [decision, router, logout, settleDone])

  // Signed-in users render immediately — never delayed by the settle grace.
  if (decision === 'ok') {
    return <>{children}</>
  }

  // Still verifying, OR within the cold-reload settle window: keep the
  // spinner up instead of evicting, so a rehydrating session can resolve
  // to 'ok' before any redirect fires.
  if (decision === 'loading' || !settleDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <span className="text-gray-600 dark:text-gray-400">Verifying access...</span>
        </div>
      </div>
    )
  }

  // Settled and genuinely not allowed — redirect effect has fired; don't
  // flash protected content.
  return null
}
