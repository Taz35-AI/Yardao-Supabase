// src/types/transfer.ts
// Vehicle transfer and external garage checkout types

import { Timestamp } from 'firebase/firestore'

export type TransferStatus = 'in_transit' | 'at_external_garage' | null

export interface VehicleTransfer {
  // Transfer identification
  transferStatus: TransferStatus
  
  // Branch transfer fields
  sourceBranchId?: string | null      // ✅ NEW: Source branch ID for display
  sourceBranchName?: string | null    // ✅ NEW: Source branch name for display
  targetBranchId?: string | null
  targetBranchName?: string | null
  transferInitiatedAt?: Date | Timestamp
  transferInitiatedBy?: string
  transferInitiatedByName?: string
  
  // External garage fields
  externalGarageId?: string | null
  externalGarageName?: string | null
  serviceBookingId?: string | null // ✅ SURGICAL ADDITION: Link to service booking
  checkedOutToGarageAt?: Date | Timestamp
  checkedOutToGarageBy?: string
  checkedOutToGarageByName?: string
}

export interface CheckoutDestination {
  type: 'branch_transfer' | 'external_garage'
  branchId?: string
  branchName?: string
  sourceBranchId?: string      // ✅ NEW: Source branch ID
  sourceBranchName?: string    // ✅ NEW: Source branch name
  garageId?: string
  garageName?: string
  serviceBookingId?: string // ✅ SURGICAL ADDITION: Link to service booking when checking out to garage
}

// Extended CheckedInVehicle with transfer fields
export interface TransferableVehicle {
  id: string
  registration: string
  make: string
  model: string
  branchId: string
  
  // Transfer fields
  transferStatus?: TransferStatus
  sourceBranchId?: string | null      // ✅ NEW: Source branch ID
  sourceBranchName?: string | null    // ✅ NEW: Source branch name
  targetBranchId?: string | null
  targetBranchName?: string | null
  transferInitiatedAt?: Date
  transferInitiatedBy?: string
  transferInitiatedByName?: string
  
  // External garage fields
  externalGarageId?: string | null
  externalGarageName?: string | null
  serviceBookingId?: string | null // ✅ SURGICAL ADDITION: Link to service booking
  checkedOutToGarageAt?: Date
  checkedOutToGarageBy?: string
  checkedOutToGarageByName?: string
}

// Transfer operation result
export interface TransferResult {
  success: boolean
  vehicleId: string
  message: string
  error?: string
}