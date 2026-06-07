// src/components/features/dashboard/DashboardTour.tsx
// Renders the "?" help button (desktop only) that starts the guided dashboard
// tour, and auto-starts the tour once for a brand-new user. Completion is
// persisted on the user's profile (has_completed_tour) so it never nags again
// and follows them across devices.
'use client'

import { useEffect, useRef } from 'react'
import { HelpCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import { startDashboardTour } from '@/lib/tour/dashboardTour'
import { logger } from '@/lib/logger'

/** `ready` should be true once the dashboard has loaded (so the buttons the
 *  tour points at actually exist in the DOM). */
export function DashboardTour({ ready }: { ready: boolean }) {
  const { user, profile, refreshProfile } = useAuth()
  const autoStarted = useRef(false)

  const markComplete = async () => {
    if (!user?.uid) return
    try {
      await supabase.from('profiles').update({ has_completed_tour: true }).eq('id', user.uid)
      await refreshProfile()
    } catch (err) {
      logger.error('DashboardTour: failed to persist tour completion', err)
    }
  }

  const run = () => startDashboardTour(markComplete)

  // Auto-start once for a new user who hasn't seen it yet.
  useEffect(() => {
    if (!ready || autoStarted.current || !profile) return
    if ((profile as { hasCompletedTour?: boolean }).hasCompletedTour) return
    // Hold the tour until the temporary-password welcome notice is acknowledged
    // — otherwise a brand-new user gets both at once. Clicking "Got it" clears
    // requiresPasswordReset + refreshes the profile, which re-runs this effect
    // and starts the tour then.
    if ((profile as { requiresPasswordReset?: boolean }).requiresPasswordReset) return
    // Desktop-only auto-start (the tour targets the desktop sidebar + header).
    // Don't mark complete on mobile, so it runs when they next open on desktop.
    if (typeof window !== 'undefined' && window.innerWidth < 1024) return
    autoStarted.current = true
    // Small delay so the header buttons + nav are fully mounted.
    const id = setTimeout(run, 800)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, profile])

  return (
    <button
      type="button"
      data-tour="tour-help"
      onClick={run}
      title="Take the tour"
      aria-label="Take the guided tour"
      className="hidden lg:inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-600 text-[#4a5e54] dark:text-gray-300 hover:border-[#c8d5ce] hover:shadow-md transition-all flex-shrink-0"
    >
      <HelpCircle className="w-4 h-4" />
    </button>
  )
}
