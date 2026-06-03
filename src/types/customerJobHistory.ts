// src/types/customerJobHistory.ts
// Per-customer job history.
//
// Derived ON DEMAND from completed `serviceBookings` matched by the
// customer's phone — no copy written, no migration, no new collection.
// Each completed booking IS the record (internal workshop jobs AND
// external-garage jobs, since both are serviceBookings rows).
//
// Reads are on-demand getDocs scoped to ONE customer + a limit, so this
// feature adds negligible Firestore read cost (never a listener).

import type { ServiceLocationType } from '@/types/vehicleServiceHistory'

// Unified, render-ready record for a single past job done for a customer.
// Mirrors VehicleServiceRecord but is vehicle-centric: it always carries
// the registration (+ make/model) since the whole point here is "which
// vehicles did we fix for this customer".
export interface CustomerJobRecord {
  id: string
  date: string // YYYY-MM-DD
  registration: string
  make?: string
  model?: string
  locationType: ServiceLocationType
  garageName?: string
  garageAddress?: string
  workDone: string
  mechanicName?: string
  serviceBay?: number
  branchName?: string
  mileage?: number | null
  notes?: string
  completedByName?: string
}
