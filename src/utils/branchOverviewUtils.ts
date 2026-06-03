// src/utils/branchOverviewUtils.ts
import type { BranchVehicle, VehicleGroup, BranchData, BranchOverviewStats } from '@/types/branch-overview'

/**
 * Check if vehicle is out on hire
 */
export const isVehicleOutOnHire = (vehicle: BranchVehicle): boolean => {
  return vehicle.hireStatus === 'Out on Hire'
}

/**
 * Process vehicles into groups by make/model
 * Only groups vehicles that are in the yard (not out on hire)
 */
export const groupVehiclesByMakeModel = (vehicles: BranchVehicle[]): VehicleGroup[] => {
  const vehiclesInYard = vehicles.filter(v => !isVehicleOutOnHire(v))
  const groupMap = new Map<string, VehicleGroup>()
  
  vehiclesInYard.forEach(vehicle => {
    // Clean and normalize data
    const normalizedMake = (vehicle.make || 'Unknown').trim().replace(/\s+/g, ' ')
    const normalizedModel = (vehicle.model || 'Unknown').trim().replace(/\s+/g, ' ')
    const key = `${normalizedMake.toLowerCase()}-${normalizedModel.toLowerCase()}`
    
    const existing = groupMap.get(key)
    
    if (existing) {
      existing.count++
      existing.vehicles.push(vehicle)
    } else {
      groupMap.set(key, {
        make: normalizedMake,
        model: normalizedModel,
        count: 1,
        vehicles: [vehicle]
      })
    }
  })
  
  return Array.from(groupMap.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      const aName = `${a.make} ${a.model}`.toLowerCase()
      const bName = `${b.make} ${b.model}`.toLowerCase()
      return aName.localeCompare(bName)
    })
}

/**
 * Process branch data with proper sorting
 */
export const processBranchData = (
  branches: Array<{ slug: string; name: string; isMain: boolean }>,
  allVehicles: BranchVehicle[]
): BranchData[] => {
  if (!branches.length || !allVehicles.length) return []

  return branches.map(branch => {
    const branchVehicles = allVehicles.filter(v => v.branchId === branch.slug)
    const vehiclesInYard = branchVehicles.filter(v => !isVehicleOutOnHire(v))
    const vehiclesOutOnHire = branchVehicles.filter(v => isVehicleOutOnHire(v))
    const vehicleGroups = groupVehiclesByMakeModel(branchVehicles)
    
    return {
      branchId: branch.slug,
      branchName: branch.name,
      isMain: branch.isMain,
      totalVehicles: branchVehicles.length,
      vehiclesInYard: vehiclesInYard.length,
      vehiclesOutOnHire: vehiclesOutOnHire.length,
      vehicleGroups,
      hiredVehicles: vehiclesOutOnHire
    }
  }).sort((a, b) => {
    if (a.isMain) return -1
    if (b.isMain) return 1
    return b.totalVehicles - a.totalVehicles
  })
}

/**
 * Build make-model relationship map for filtering
 */
export const buildMakeModelMap = (allVehicles: BranchVehicle[]): Map<string, Set<string>> => {
  const map = new Map<string, Set<string>>()
  
  allVehicles.forEach(vehicle => {
    // Only include vehicles that are in yard for filtering
    if (!isVehicleOutOnHire(vehicle)) {
      const make = (vehicle.make || '').trim()
      const model = (vehicle.model || '').trim()
      
      if (make && model) {
        if (!map.has(make)) {
          map.set(make, new Set<string>())
        }
        map.get(make)!.add(model)
      }
    }
  })
  
  return map
}

/**
 * Filter branch data based on search criteria
 */
export const filterBranchData = (
  branchData: BranchData[],
  searchTerm: string,
  filterMake: string,
  filterModel: string
): BranchData[] => {
  if (!searchTerm && !filterMake && !filterModel) return branchData
  
  return branchData.map(branch => {
    const filteredGroups = branch.vehicleGroups.filter(group => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase().trim()
        const fullName = `${group.make} ${group.model}`.toLowerCase()
        const matchesSearch = 
          fullName.includes(searchLower) ||
          group.make.toLowerCase().includes(searchLower) ||
          group.model.toLowerCase().includes(searchLower) ||
          group.vehicles.some(v => v.registration.toLowerCase().includes(searchLower))
        
        if (!matchesSearch) return false
      }
      
      // Make filter
      if (filterMake && group.make !== filterMake) return false
      
      // Model filter
      if (filterModel && group.model !== filterModel) return false
      
      return true
    })
    
    return {
      ...branch,
      vehicleGroups: filteredGroups,
      vehiclesInYard: filteredGroups.reduce((sum, g) => sum + g.count, 0),
      // Keep original hire counts (not affected by filters)
      vehiclesOutOnHire: branch.vehiclesOutOnHire,
      hiredVehicles: branch.hiredVehicles
    }
  })
}

/**
 * Calculate overview statistics
 */
export const calculateBranchOverviewStats = (
  allVehicles: BranchVehicle[],
  branches: Array<{ slug: string; name: string; isMain: boolean }>
): BranchOverviewStats => {
  const totalVehicles = allVehicles.length
  const totalInYard = allVehicles.filter(v => !isVehicleOutOnHire(v)).length
  const totalOutOnHire = allVehicles.filter(v => isVehicleOutOnHire(v)).length
  const totalBranches = branches.length
  const avgPerBranch = totalBranches > 0 ? Math.round(totalVehicles / totalBranches) : 0
  
  const vehicleTypeCount = new Map<string, number>()
  allVehicles.forEach(v => {
    // Only count vehicles in yard for "most common"
    if (!isVehicleOutOnHire(v)) {
      const key = `${v.make || 'Unknown'} ${v.model || 'Unknown'}`
      vehicleTypeCount.set(key, (vehicleTypeCount.get(key) || 0) + 1)
    }
  })
  
  let mostCommon = { type: 'N/A', count: 0 }
  vehicleTypeCount.forEach((count, type) => {
    if (count > mostCommon.count) {
      mostCommon = { type, count }
    }
  })
  
  return { 
    totalVehicles, 
    totalInYard, 
    totalOutOnHire, 
    totalBranches, 
    avgPerBranch, 
    mostCommon 
  }
}