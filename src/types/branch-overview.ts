// src/types/branch-overview.ts
export interface BranchVehicle {
  id: string
  registration: string
  make: string
  model: string
  colour?: string
  size?: string
  status?: string
  condition?: string
  contract?: string
  contractColor?: string
  branchId: string
  createdAt?: Date
  mileage?: string
  notes?: string
  comments?: string
  // HIRE STATUS FIELDS
  hireStatus?: string           // 'In Yard' | 'Out on Hire'
  hiredBy?: string             // User ID who hired the vehicle
  hiredByName?: string         // Display name of who hired it
  hiredAt?: any                // Timestamp when hired
  hireNotes?: string           // Notes when hiring
  originalStatus?: string      // Original vehicle status before hire
  returnedFromHireAt?: any     // Timestamp when returned (optional)
  returnedFromHireBy?: string  // User ID who returned it (optional)
  returnedFromHireByName?: string // Display name of who returned it (optional)
  returnNotes?: string         // Notes when returning (optional)
}

export interface VehicleGroup {
  make: string
  model: string
  count: number
  vehicles: BranchVehicle[]
}

export interface BranchData {
  branchId: string
  branchName: string
  isMain: boolean
  totalVehicles: number
  vehiclesInYard: number
  vehiclesOutOnHire: number
  vehicleGroups: VehicleGroup[]
  hiredVehicles: BranchVehicle[]
}

export interface BranchOverviewStats {
  totalVehicles: number
  totalInYard: number
  totalOutOnHire: number
  totalBranches: number
  avgPerBranch: number
  mostCommon: {
    type: string
    count: number
  }
}

export interface BranchOverviewFilters {
  searchTerm: string
  filterMake: string
  filterModel: string
}