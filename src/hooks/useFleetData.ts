// src/hooks/useFleetData.ts
// 💸 COST OPTIMIZATION: This hook is now a thin passthrough to
// FleetDataContext. All state, effects, and action methods live in the
// provider, so no matter how many components call useFleetData(), only ONE
// fetch of the vehicles + conditions collections runs per session.
//
// All public exports are preserved so the 7 call sites
// (DashboardDataLayer, fleet/page.tsx, ServiceBanner, DeliveriesDefleetContent,
// EntryCard, ServiceBookingsContent, useNotifications) need no changes.
'use client'

export { useFleetDataContext as useFleetData } from '@/contexts/FleetDataContext'

export type { FleetDataContextValue } from '@/contexts/FleetDataContext'
