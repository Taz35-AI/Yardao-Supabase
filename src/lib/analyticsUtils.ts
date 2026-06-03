// src/lib/analyticsUtils.ts - COMPLETE FIX: All missing properties added
import { Analytics } from '@/types'

/**
 * Creates a complete Analytics object with all required properties
 * Ensures no missing properties that would cause TypeScript errors
 */
export function createCompleteAnalytics(partialAnalytics: Partial<Analytics> = {}): Analytics {
  const totalCount = partialAnalytics.totalCount || 0
  const readyCount = partialAnalytics.readyCount || 0
  const pendingChecksCount = partialAnalytics.pendingChecksCount || partialAnalytics.needsCheckingCount || 0
  const repairsNeededCount = partialAnalytics.repairsNeededCount || 0
  const nonStarterCount = partialAnalytics.nonStarterCount || 0

  // Calculate percentages safely
  const calculatePercentages = () => {
    if (totalCount === 0) {
      return { ready: 0, pendingChecks: 0, repairsNeeded: 0, nonStarter: 0 }
    }
    
    return {
      ready: Math.round((readyCount / totalCount) * 100),
      pendingChecks: Math.round((pendingChecksCount / totalCount) * 100),
      repairsNeeded: Math.round((repairsNeededCount / totalCount) * 100),
      nonStarter: Math.round((nonStarterCount / totalCount) * 100)
    }
  }

  return {
    // Core counts
    totalCount,
    readyCount,
    needsCheckingCount: pendingChecksCount, // Legacy support
    pendingChecksCount,
    repairsNeededCount,
    nonStarterCount,
    
    // FIXED: Missing hire counts
    inYardCount: partialAnalytics.inYardCount || 0,
    outOnHireCount: partialAnalytics.outOnHireCount || 0,
    
    // FIXED: Missing insurance counts
    insuredCount: partialAnalytics.insuredCount || 0,
    notInsuredCount: partialAnalytics.notInsuredCount || 0,
    unknownInsuranceCount: partialAnalytics.unknownInsuranceCount || 0,
    
    // Mileage and expiry data
    avgMileage: partialAnalytics.avgMileage || 0,
    motExpiringCount: partialAnalytics.motExpiringCount || 0,
    taxExpiringCount: partialAnalytics.taxExpiringCount || 0,
    
    // Breakdown data
    conditionBreakdown: partialAnalytics.conditionBreakdown || {},
    locationBreakdown: partialAnalytics.locationBreakdown || {},
    sizeBreakdown: partialAnalytics.sizeBreakdown || {},
    statusBreakdown: partialAnalytics.statusBreakdown || {},
    contractBreakdown: partialAnalytics.contractBreakdown || {},
    
    // FIXED: Missing insurance breakdown
    insuranceBreakdown: partialAnalytics.insuranceBreakdown || {},
    
    // Status analytics
    statusCounts: partialAnalytics.statusCounts || {
      ready: readyCount,
      pendingChecks: pendingChecksCount,
      repairsNeeded: repairsNeededCount,
      nonStarter: nonStarterCount
    },
    statusPercentages: partialAnalytics.statusPercentages || calculatePercentages(),
    
    // FIXED: Missing hire analytics
    hireAnalytics: partialAnalytics.hireAnalytics || {
      totalOutOnHire: 0,
      totalInYard: 0,
      hiresByBranch: {},
      averageHireDuration: 0,
      currentHires: []
    },
    
    // Time-based analytics
    todayCheckIns: partialAnalytics.todayCheckIns || 0,
    weekCheckIns: partialAnalytics.weekCheckIns || 0,
    averageStayTime: partialAnalytics.averageStayTime || 0
  }
}

/**
 * Validates that an analytics object has all required properties
 */
export function validateAnalytics(analytics: any): analytics is Analytics {
  const requiredProps = [
    'totalCount', 'readyCount', 'needsCheckingCount', 'pendingChecksCount',
    'repairsNeededCount', 'nonStarterCount', 'avgMileage', 'motExpiringCount',
    'taxExpiringCount', 'conditionBreakdown', 'locationBreakdown', 
    'sizeBreakdown', 'statusBreakdown', 'contractBreakdown', 'statusCounts', 
    'statusPercentages', 'todayCheckIns', 'weekCheckIns', 'averageStayTime',
    // FIXED: Added all missing validation properties
    'inYardCount', 'outOnHireCount', 'insuredCount', 'notInsuredCount', 
    'unknownInsuranceCount', 'insuranceBreakdown', 'hireAnalytics'
  ]

  return requiredProps.every(prop => analytics && analytics.hasOwnProperty(prop))
}

/**
 * Merges partial analytics with a complete analytics template
 * Useful for updating analytics incrementally
 */
export function mergeAnalytics(base: Analytics, updates: Partial<Analytics>): Analytics {
  return createCompleteAnalytics({ ...base, ...updates })
}

/**
 * Calculates utilization rate from analytics
 */
export function calculateUtilizationRate(analytics: Analytics): number {
  if (analytics.totalCount === 0) return 0
  return Math.round((analytics.readyCount / analytics.totalCount) * 100)
}

/**
 * Gets vehicles needing attention count
 */
export function getVehiclesNeedingAttention(analytics: Analytics): number {
  return analytics.pendingChecksCount + analytics.repairsNeededCount + analytics.nonStarterCount
}

/**
 * Formats analytics data for display
 */
export function formatAnalyticsForDisplay(analytics: Analytics) {
  return {
    totalVehicles: analytics.totalCount.toLocaleString(),
    readyVehicles: analytics.readyCount.toLocaleString(),
    needsAttention: getVehiclesNeedingAttention(analytics).toLocaleString(),
    utilizationRate: calculateUtilizationRate(analytics),
    averageMileage: analytics.avgMileage > 0 ? Math.round(analytics.avgMileage).toLocaleString() + ' mi' : 'N/A',
    expiringDocuments: analytics.motExpiringCount + analytics.taxExpiringCount,
    todayActivity: analytics.todayCheckIns.toLocaleString(),
    weekActivity: analytics.weekCheckIns.toLocaleString(),
    averageStay: analytics.averageStayTime > 0 ? `${Math.round(analytics.averageStayTime)}h` : 'N/A'
  }
}

/**
 * Creates an empty analytics object for loading states
 */
export function createEmptyAnalytics(): Analytics {
  return createCompleteAnalytics({})
}

/**
 * Converts legacy analytics format to new format
 */
export function migrateLegacyAnalytics(legacyAnalytics: any): Analytics {
  const mappings = {
    // Map old property names to new ones
    needsChecking: 'pendingChecksCount',
    repairsNeeded: 'repairsNeededCount',
    nonStarters: 'nonStarterCount'
  }

  const migratedAnalytics: any = { ...legacyAnalytics }

  // Apply mappings
  Object.entries(mappings).forEach(([oldKey, newKey]) => {
    if (legacyAnalytics[oldKey] !== undefined) {
      migratedAnalytics[newKey] = legacyAnalytics[oldKey]
    }
  })

  return createCompleteAnalytics(migratedAnalytics)
}