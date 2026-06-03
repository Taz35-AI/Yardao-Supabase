// src/types/branch.ts
// UPDATED - Branch related types with address and GPS coordinates

export interface Branch {
  id: string
  slug: string // URL-friendly: 'main', 'fairview', 'kensington'
  name: string // Display name: 'Main Branch', 'Fairview Branch'
  isMain: boolean
  organizationId: string
  createdAt: Date
  createdBy: string
  createdByName?: string
  updatedAt?: Date
  isActive: boolean // To soft-delete branches
  vehicleCount?: number // Optional: for quick stats
  
  // NEW: Location fields for map integration
  address?: string // Full address: "123 High Street, London, E1 1AA"
  postcode?: string // UK postcode: "E1 1AA"
  latitude?: number // GPS coordinate: 51.5074
  longitude?: number // GPS coordinate: -0.1278

  // 🛠️ NEW: number of service bays (ramps) physically available at this branch.
  // Caps how many bookings can share the same time slot. Optional — when
  // undefined we treat it as DEFAULT_SERVICE_BAY_COUNT below for backward
  // compatibility with branches that existed before this field.
  serviceBayCount?: number
}

// Default applied when a branch hasn't had its bay count set yet.
// Conservative — most small garages have at least 2 ramps, and this matches
// the previous unspoken behaviour of the booking UI which started suggesting
// "Bay 2" once a slot had its first booking.
export const DEFAULT_SERVICE_BAY_COUNT = 2

// Update your existing CheckedInVehicle type by adding branchId
// In your existing types file, add this field to CheckedInVehicle interface:
// branchId?: string // 'main' or branch slug - optional for backward compatibility

export interface BranchMigration {
  id: string
  organizationId: string
  migrationCompleted: boolean
  migrationDate?: Date
  migratedVehicleCount?: number
}