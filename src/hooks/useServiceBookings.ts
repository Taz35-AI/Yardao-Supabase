// src/hooks/useServiceBookings.ts
// 💸 COST OPTIMIZATION: This hook is now a thin passthrough to
// ServiceBookingsContext. All listener / state / action logic lives in the
// provider, so no matter how many components call useServiceBookings(), only
// ONE Firestore subscription runs.
//
// All public exports are preserved so the 5 call sites
// (DashboardDataLayer, DashboardBusinessLogic, useNotifications,
// ServiceBookingsContent, ServiceBookingModal) need no changes.
'use client'

export {
  useServiceBookingsContext as useServiceBookings,
  setServiceBookingsModalHandler,
} from '@/contexts/ServiceBookingsContext'

export type { ServiceBookingsContextValue } from '@/contexts/ServiceBookingsContext'
