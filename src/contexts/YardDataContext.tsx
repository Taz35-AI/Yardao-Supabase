// src/contexts/YardDataContext.tsx
// 💸 COST OPTIMISATION + 🟢 LIVE-SYNC: Single shared yard-data instance.
//
// Before: useYardData was called from 2 places (DashboardDataLayer and
// ServiceBookingsContent). Each mounted its own onSnapshot against the
// `checkedInVehicles` collection, and the hook's listener effect tore the
// subscription down + rebuilt it on EVERY navigation between
// dashboard / fleet / service-bookings (pathname feeds the
// listener-decision dependency) — a full collection re-read each time.
// ServiceBookingsContent also created a *second* listener, hard-pinned to
// branch 'main'.
//
// After: this provider owns the only listener. It is mounted in
// ConditionalProviders (above the routed pages) so it persists across
// navigation. Combined with the branch-ref guard inside the hook, the
// listener now stays hot while you move between pages — zero extra reads
// and NO reconnect gap, so other users' yard changes stay instantaneous.
//
// Public API is the hook's return object, passed through 1:1, so existing
// call sites work unchanged (they only swap the import path).
'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  Suspense,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'next/navigation'
import { useYardDataInternal } from '@/hooks/useYardData'

type YardDataContextValue = ReturnType<typeof useYardDataInternal>

const YardDataContext = createContext<YardDataContextValue | null>(null)

/**
 * Shared yard data. Drop-in replacement for the old
 * `useYardData()` hook — same return shape, but backed by the single
 * provider-owned listener instead of a per-caller subscription.
 */
export function useYardData(): YardDataContextValue {
  const ctx = useContext(YardDataContext)
  if (!ctx) {
    throw new Error(
      'useYardData must be used within a YardDataProvider. ' +
        'Make sure YardDataProvider is mounted in the React tree.',
    )
  }
  return ctx
}

// Reads `?branch=` and pushes it up. Isolated in its own component so the
// useSearchParams() call sits behind a Suspense boundary (required for the
// static export build) WITHOUT gating the rest of the app behind a
// fallback. Renders nothing.
function BranchSlugSync({ onChange }: { onChange: (slug: string) => void }) {
  const searchParams = useSearchParams()
  const slug = searchParams?.get('branch') || 'main'
  useEffect(() => {
    onChange(slug)
  }, [slug, onChange])
  return null
}

export function YardDataProvider({ children }: { children: ReactNode }) {
  // Seed synchronously from the URL so the very first listener already
  // targets the correct branch (no first-load double-subscribe). The
  // Suspense-isolated BranchSlugSync below keeps it reactive to in-app
  // branch switches afterwards.
  const [branchSlug, setBranchSlug] = useState<string>(() => {
    if (typeof window === 'undefined') return 'main'
    try {
      return new URLSearchParams(window.location.search).get('branch') || 'main'
    } catch {
      return 'main'
    }
  })

  // The ONLY call to the implementation hook in the entire app.
  const yard = useYardDataInternal({ branchId: branchSlug })

  return (
    <YardDataContext.Provider value={yard}>
      <Suspense fallback={null}>
        <BranchSlugSync onChange={setBranchSlug} />
      </Suspense>
      {children}
    </YardDataContext.Provider>
  )
}
