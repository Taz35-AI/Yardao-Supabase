// src/types/hireHistory.ts
// Firebase removed — Supabase returns ISO strings; alias kept so existing
// `Timestamp` type references still resolve.
type Timestamp = any

/**
 * Hire History Record
 * Stores complete history of every time a vehicle goes out on hire
 */
export interface HireHistoryRecord {
  id?: string
  
  // Vehicle Information
  vehicleId: string
  registration: string
  make?: string
  model?: string
  
  // Hire Period
  hireStartDate: Date | Timestamp | string
  hireEndDate?: Date | Timestamp | string | null  // null if still out on hire
  durationInDays?: number  // Calculated when returned
  
  // Who hired it
  hiredBy: string
  hiredByName: string
  hireNotes?: string
  
  // Who returned it
  returnedBy?: string
  returnedByName?: string
  returnNotes?: string
  
  // Organization/Branch
  organizationId: string
  branchId: string
  branchName?: string
  
  // Timestamps
  createdAt: Date | Timestamp | string
  updatedAt?: Date | Timestamp | string
}

/**
 * Hire History Query Result
 * What gets returned when you search for a vehicle's hire history
 */
export interface HireHistoryQueryResult {
  registration: string
  totalDaysOnHire: number
  numberOfHires: number
  hireRecords: HireHistoryRecord[]
  periodStart: Date
  periodEnd: Date
  utilizationRate: number  // Percentage of period that vehicle was on hire
}

/**
 * Period Selection Options
 */
export type PeriodOption = '7days' | '14days' | '30days' | '3months' | '6months' | '1year' | 'custom'

export interface PeriodSelection {
  option: PeriodOption
  startDate: Date
  endDate: Date
  label: string
}

/**
 * Fleet Utilization Snapshot
 * Current state of the fleet (not historical)
 */
export interface FleetUtilizationSnapshot {
  // Total counts
  totalVehicles: number
  
  // By hire status
  outOnHire: number
  inYard: number
  
  // By operational status (in yard only)
  readyToRent: number      // Ready AND in yard
  pendingChecks: number     // Pending checks status
  repairsNeeded: number     // Repairs needed status
  nonStarters: number       // Non-starters
  
  // Calculated metrics
  utilizationRate: number   // (outOnHire / totalVehicles) × 100
  availableCapacity: number // readyToRent count
  unavailableVehicles: number // repairsNeeded + nonStarters
  
  // Timestamp
  snapshotAt: Date
}