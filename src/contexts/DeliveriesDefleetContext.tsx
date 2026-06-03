// src/contexts/DeliveriesDefleetContext.tsx
// 💸 COST OPTIMISATION + 🟢 LIVE-SYNC: Single shared deliveries/defleet
// instance.
//
// Before: useDeliveriesDefleet was called from 3 places (ServiceBanner,
// useNotifications [→ NotificationBell + ServiceBanner], and
// DeliveriesDefleetContent). Each mounted its own onSnapshot against the
// `deliveriesDefleet` collection, and the listener effect tore the
// subscription down + rebuilt it on EVERY app-state/visibility re-render
// (shouldHaveActiveListener changes identity whenever isAppActive
// toggles) — a full collection re-read each time, multiplied across all
// consumers.
//
// After: this provider owns the only listener. It is mounted in
// ConditionalProviders (above the routed pages) so it persists across
// navigation. Combined with the org-ref guard inside the hook, the
// listener now stays hot — zero extra reads and no reconnect gap.
//
// Public API is the hook's return object, passed through 1:1, so existing
// call sites work unchanged (they only swap the import path). This mirrors
// the ServiceBookingsProvider / FleetDataProvider pattern.
'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useDeliveriesDefleetInternal } from '@/hooks/useDeliveriesDefleet'

type DeliveriesDefleetContextValue = ReturnType<typeof useDeliveriesDefleetInternal>

const DeliveriesDefleetContext = createContext<DeliveriesDefleetContextValue | null>(null)

/**
 * Shared deliveries/defleet data. Drop-in replacement for the old
 * `useDeliveriesDefleet()` hook — same return shape, but backed by the
 * single provider-owned listener instead of a per-caller subscription.
 */
export function useDeliveriesDefleet(): DeliveriesDefleetContextValue {
  const ctx = useContext(DeliveriesDefleetContext)
  if (!ctx) {
    throw new Error(
      'useDeliveriesDefleet must be used within a DeliveriesDefleetProvider. ' +
        'Make sure DeliveriesDefleetProvider is mounted in the React tree.',
    )
  }
  return ctx
}

export function DeliveriesDefleetProvider({ children }: { children: ReactNode }) {
  // The ONLY call to the implementation hook in the entire app.
  const value = useDeliveriesDefleetInternal()
  return (
    <DeliveriesDefleetContext.Provider value={value}>
      {children}
    </DeliveriesDefleetContext.Provider>
  )
}
