// src/types/vehicleServiceHistory.ts
// Per-vehicle work history.
//
// Two sources are merged for display:
//  - 'booking': derived on demand from completed serviceBookings (no copy
//    written, no migration — the completed booking IS the record).
//  - 'manual' : hand-entered records stored in the `vehicleServiceHistory`
//    collection (old paper jobs, ad-hoc external work, pre-system history).
//
// Reads are on-demand getDocs scoped to ONE vehicle + a limit, so this
// feature adds negligible Firestore read cost.

export const VEHICLE_SERVICE_HISTORY_COLLECTION = 'vehicleServiceHistory'

export type ServiceLocationType = 'internal' | 'external'

// Document shape stored in the `vehicleServiceHistory` collection (manual only)
export interface ManualServiceHistoryDoc {
  id?: string
  organizationId: string
  // Registration as the user typed it (display) + a normalized key
  // (UPPER, no spaces) used for the equality query so "AB12 CDE" and
  // "AB12CDE" resolve to the same vehicle.
  registration: string
  registrationKey: string
  make?: string
  model?: string
  date: string // service date, YYYY-MM-DD
  locationType: ServiceLocationType
  garageName?: string // when external
  workDone: string
  mechanicName?: string
  mileage?: number | null
  notes?: string
  createdBy: string
  createdByName: string
  createdAt?: any
  updatedAt?: any
}

// Unified, render-ready record (booking-sourced OR manual)
export interface VehicleServiceRecord {
  id: string
  source: 'booking' | 'manual'
  date: string // YYYY-MM-DD
  locationType: ServiceLocationType
  garageName?: string
  garageAddress?: string
  workDone: string
  mechanicName?: string
  serviceBay?: number
  branchName?: string
  mileage?: number | null
  notes?: string
  completedByName?: string // booking source
  createdByName?: string // manual source — who logged it
}
