// 📁 src/utils/analytics.ts - COMPLETE FIX: All missing properties added
import { Analytics, CheckedInVehicle, VehicleStatus } from '@/types'

/**
 * Creates a complete Analytics object from partial data
 * Ensures all required properties are present with sensible defaults
 */
export function createCompleteAnalytics(partialAnalytics: Partial<Analytics> = {}): Analytics {
  return {
    // Core counts
    totalCount: partialAnalytics.totalCount ?? 0,
    readyCount: partialAnalytics.readyCount ?? 0,
    needsCheckingCount: partialAnalytics.needsCheckingCount ?? 0,
    pendingChecksCount: partialAnalytics.pendingChecksCount ?? 0,
    repairsNeededCount: partialAnalytics.repairsNeededCount ?? 0,
    nonStarterCount: partialAnalytics.nonStarterCount ?? 0,
    
    // FIXED: Missing hire counts
    inYardCount: partialAnalytics.inYardCount ?? 0,
    outOnHireCount: partialAnalytics.outOnHireCount ?? 0,
    
    // FIXED: Missing insurance counts
    insuredCount: partialAnalytics.insuredCount ?? 0,
    notInsuredCount: partialAnalytics.notInsuredCount ?? 0,
    unknownInsuranceCount: partialAnalytics.unknownInsuranceCount ?? 0,
    
    // Mileage and expiry data
    avgMileage: partialAnalytics.avgMileage ?? 0,
    motExpiringCount: partialAnalytics.motExpiringCount ?? 0,
    taxExpiringCount: partialAnalytics.taxExpiringCount ?? 0,
    
    // Breakdown data
    conditionBreakdown: partialAnalytics.conditionBreakdown ?? {},
    locationBreakdown: partialAnalytics.locationBreakdown ?? {},
    sizeBreakdown: partialAnalytics.sizeBreakdown ?? {},
    statusBreakdown: partialAnalytics.statusBreakdown ?? {},
    contractBreakdown: partialAnalytics.contractBreakdown ?? {}, // 🔧 FIXED: Added missing contractBreakdown
    
    // FIXED: Missing insurance breakdown
    insuranceBreakdown: partialAnalytics.insuranceBreakdown ?? {},
    
    // Status analytics
    statusCounts: partialAnalytics.statusCounts ?? {
      ready: 0,
      pendingChecks: 0,
      repairsNeeded: 0,
      nonStarter: 0
    },
    statusPercentages: partialAnalytics.statusPercentages ?? {
      ready: 0,
      pendingChecks: 0,
      repairsNeeded: 0,
      nonStarter: 0
    },
    
    // FIXED: Missing hire analytics
    hireAnalytics: partialAnalytics.hireAnalytics ?? {
      totalOutOnHire: 0,
      totalInYard: 0,
      hiresByBranch: {},
      averageHireDuration: 0,
      currentHires: []
    },
    
    // Time-based analytics
    todayCheckIns: partialAnalytics.todayCheckIns ?? 0,
    weekCheckIns: partialAnalytics.weekCheckIns ?? 0,
    averageStayTime: partialAnalytics.averageStayTime ?? 0
  }
}

/**
 * Calculates analytics from a list of vehicles
 * Useful for real-time analytics generation
 */
export function calculateAnalyticsFromVehicles(vehicles: CheckedInVehicle[]): Analytics {
  const totalCount = vehicles.length
  
  // Status counts
  const statusCounts = vehicles.reduce((acc, vehicle) => {
    const status = vehicle.status || 'Pending checks'
    switch (status) {
      case 'Ready':
        acc.ready++
        break
      case 'Pending checks':
        acc.pendingChecks++
        break
      case 'Repairs needed':
        acc.repairsNeeded++
        break
      case 'Non-Starter':
        acc.nonStarter++
        break
    }
    return acc
  }, {
    ready: 0,
    pendingChecks: 0,
    repairsNeeded: 0,
    nonStarter: 0
  })

  // FIXED: Hire status counts
  const hireStatusCounts = vehicles.reduce((acc, vehicle) => {
    const hireStatus = vehicle.hireStatus || 'In Yard'
    if (hireStatus === 'In Yard') {
      acc.inYard++
    } else if (hireStatus === 'Out on Hire') {
      acc.outOnHire++
    }
    return acc
  }, {
    inYard: 0,
    outOnHire: 0
  })

  // FIXED: Insurance status counts
  const insuranceCounts = vehicles.reduce((acc, vehicle) => {
    const insuranceStatus = vehicle.insuranceStatus
    if (insuranceStatus === 'Insured') {
      acc.insured++
    } else if (insuranceStatus === 'Not Insured') {
      acc.notInsured++
    } else {
      acc.unknown++
    }
    return acc
  }, {
    insured: 0,
    notInsured: 0,
    unknown: 0
  })

  // Calculate percentages
  const statusPercentages = {
    ready: totalCount > 0 ? Math.round((statusCounts.ready / totalCount) * 100) : 0,
    pendingChecks: totalCount > 0 ? Math.round((statusCounts.pendingChecks / totalCount) * 100) : 0,
    repairsNeeded: totalCount > 0 ? Math.round((statusCounts.repairsNeeded / totalCount) * 100) : 0,
    nonStarter: totalCount > 0 ? Math.round((statusCounts.nonStarter / totalCount) * 100) : 0
  }

  // Condition breakdown
  const conditionBreakdown = vehicles.reduce((acc, vehicle) => {
    const condition = vehicle.condition || 'Unknown'
    acc[condition] = (acc[condition] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Size breakdown
  const sizeBreakdown = vehicles.reduce((acc, vehicle) => {
    const size = vehicle.size || 'Unknown'
    acc[size] = (acc[size] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Status breakdown
  const statusBreakdown = vehicles.reduce((acc, vehicle) => {
    const status = vehicle.status || 'Pending checks'
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // 🔧 FIXED: Contract breakdown
  const contractBreakdown = vehicles.reduce((acc, vehicle) => {
    const contract = (vehicle.contract && vehicle.contract.trim() !== '') ? vehicle.contract : 'No Contract'
    acc[contract] = (acc[contract] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // FIXED: Insurance breakdown
  const insuranceBreakdown = vehicles.reduce((acc, vehicle) => {
    const insuranceStatus = vehicle.insuranceStatus || 'Unknown'
    acc[insuranceStatus] = (acc[insuranceStatus] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Location breakdown
  const locationBreakdown = vehicles.reduce((acc, vehicle) => {
    const location = vehicle.location || 'Unspecified'
    acc[location] = (acc[location] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Calculate average mileage
  const validMileages = vehicles
    .map(v => parseFloat(v.mileage || '0'))
    .filter(m => !isNaN(m) && m > 0)
  const avgMileage = validMileages.length > 0 
    ? validMileages.reduce((sum, m) => sum + m, 0) / validMileages.length
    : 0

  // Calculate expiring counts (next 30 days)
  const now = new Date()
  const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000))

  const motExpiringCount = vehicles.filter(v => {
    if (!v.motExpiry) return false
    try {
      const motDate = new Date(v.motExpiry)
      return motDate <= thirtyDaysFromNow && motDate >= now
    } catch {
      return false
    }
  }).length

  const taxExpiringCount = vehicles.filter(v => {
    if (!v.taxExpiry) return false
    try {
      const taxDate = new Date(v.taxExpiry)
      return taxDate <= thirtyDaysFromNow && taxDate >= now
    } catch {
      return false
    }
  }).length

  // FIXED: Get vehicles currently out on hire
  const currentHires = vehicles.filter(v => v.hireStatus === 'Out on Hire')

  return {
    totalCount,
    readyCount: statusCounts.ready,
    needsCheckingCount: statusCounts.pendingChecks, // Legacy support
    pendingChecksCount: statusCounts.pendingChecks,
    repairsNeededCount: statusCounts.repairsNeeded,
    nonStarterCount: statusCounts.nonStarter,
    
    // FIXED: Missing hire counts
    inYardCount: hireStatusCounts.inYard,
    outOnHireCount: hireStatusCounts.outOnHire,
    
    // FIXED: Missing insurance counts
    insuredCount: insuranceCounts.insured,
    notInsuredCount: insuranceCounts.notInsured,
    unknownInsuranceCount: insuranceCounts.unknown,
    
    avgMileage: Math.round(avgMileage),
    motExpiringCount,
    taxExpiringCount,
    conditionBreakdown,
    locationBreakdown,
    sizeBreakdown,
    statusBreakdown,
    contractBreakdown, // 🔧 FIXED: Include contract breakdown
    
    // FIXED: Missing insurance breakdown
    insuranceBreakdown,
    
    statusCounts,
    statusPercentages,
    
    // FIXED: Missing hire analytics
    hireAnalytics: {
      totalOutOnHire: hireStatusCounts.outOnHire,
      totalInYard: hireStatusCounts.inYard,
      hiresByBranch: {}, // Would need branch data to calculate
      averageHireDuration: 0, // Would need additional logic to calculate
      currentHires
    },
    
    todayCheckIns: 0, // Would need additional logic to calculate
    weekCheckIns: 0, // Would need additional logic to calculate
    averageStayTime: 0 // Would need additional logic to calculate
  }
}

/**
 * Filters vehicles by status
 */
export function filterVehiclesByStatus(vehicles: CheckedInVehicle[], status: VehicleStatus): CheckedInVehicle[] {
  return vehicles.filter(vehicle => vehicle.status === status)
}

/**
 * Filters vehicles by condition
 */
export function filterVehiclesByCondition(vehicles: CheckedInVehicle[], condition: string): CheckedInVehicle[] {
  return vehicles.filter(vehicle => vehicle.condition === condition)
}

/**
 * Filters vehicles by size
 */
export function filterVehiclesBySize(vehicles: CheckedInVehicle[], size: string): CheckedInVehicle[] {
  return vehicles.filter(vehicle => vehicle.size === size)
}

/**
 * 🔧 FIXED: Filters vehicles by contract
 */
export function filterVehiclesByContract(vehicles: CheckedInVehicle[], contract: string): CheckedInVehicle[] {
  if (contract === 'No Contract') {
    return vehicles.filter(vehicle => !vehicle.contract || vehicle.contract.trim() === '')
  }
  return vehicles.filter(vehicle => vehicle.contract === contract)
}

/**
 * FIXED: Filters vehicles by insurance status
 */
export function filterVehiclesByInsurance(vehicles: CheckedInVehicle[], insuranceStatus: string): CheckedInVehicle[] {
  if (insuranceStatus === 'Unknown') {
    return vehicles.filter(vehicle => !vehicle.insuranceStatus)
  }
  return vehicles.filter(vehicle => vehicle.insuranceStatus === insuranceStatus)
}

/**
 * FIXED: Filters vehicles by hire status
 */
export function filterVehiclesByHireStatus(vehicles: CheckedInVehicle[], hireStatus: string): CheckedInVehicle[] {
  return vehicles.filter(vehicle => (vehicle.hireStatus || 'In Yard') === hireStatus)
}

/**
 * Gets vehicles with expiring MOT (within specified days)
 */
export function getVehiclesWithExpiringMOT(vehicles: CheckedInVehicle[], days: number = 30): CheckedInVehicle[] {
  const now = new Date()
  const futureDate = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000))

  return vehicles.filter(vehicle => {
    if (!vehicle.motExpiry) return false
    try {
      const motDate = new Date(vehicle.motExpiry)
      return motDate <= futureDate && motDate >= now
    } catch {
      return false
    }
  })
}

/**
 * Gets vehicles with expiring Tax (within specified days)
 */
export function getVehiclesWithExpiringTax(vehicles: CheckedInVehicle[], days: number = 30): CheckedInVehicle[] {
  const now = new Date()
  const futureDate = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000))

  return vehicles.filter(vehicle => {
    if (!vehicle.taxExpiry) return false
    try {
      const taxDate = new Date(vehicle.taxExpiry)
      return taxDate <= futureDate && taxDate >= now
    } catch {
      return false
    }
  })
}

/**
 * Sorts vehicles by a specified field
 */
export function sortVehicles(vehicles: CheckedInVehicle[], sortBy: keyof CheckedInVehicle, direction: 'asc' | 'desc' = 'asc'): CheckedInVehicle[] {
  return [...vehicles].sort((a, b) => {
    const aValue = a[sortBy]
    const bValue = b[sortBy]
    
    if (aValue == null && bValue == null) return 0
    if (aValue == null) return direction === 'asc' ? 1 : -1
    if (bValue == null) return direction === 'asc' ? -1 : 1
    
    if (aValue < bValue) return direction === 'asc' ? -1 : 1
    if (aValue > bValue) return direction === 'asc' ? 1 : -1
    
    return 0
  })
}