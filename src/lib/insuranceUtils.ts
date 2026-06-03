// src/lib/insuranceUtils.ts - Insurance Status Utilities
import { InsuranceStatus } from '@/types'

/**
 * Valid insurance status values
 */
export const VALID_INSURANCE_STATUSES: InsuranceStatus[] = ['Insured', 'Not Insured']

/**
 * Check if a vehicle is insured
 */
export function isVehicleInsured(insuranceStatus: InsuranceStatus | null | undefined): boolean {
  return insuranceStatus === 'Insured'
}

/**
 * Check if a vehicle is not insured (explicitly not insured or unknown status)
 */
export function isVehicleNotInsured(insuranceStatus: InsuranceStatus | null | undefined): boolean {
  return insuranceStatus === 'Not Insured' || !insuranceStatus
}

/**
 * Get insurance status display text
 */
export function getInsuranceStatusDisplay(insuranceStatus: InsuranceStatus | null | undefined): string {
  if (!insuranceStatus) return 'Unknown'
  return insuranceStatus
}

/**
 * Get insurance status color classes for UI components
 */
export function getInsuranceStatusClasses(insuranceStatus: InsuranceStatus | null | undefined) {
  if (isVehicleInsured(insuranceStatus)) {
    return {
      bg: 'bg-green-50 dark:bg-green-900/20',
      text: 'text-green-700 dark:text-green-300',
      border: 'border-green-300 dark:border-green-600'
    }
  } else if (insuranceStatus === 'Not Insured') {
    return {
      bg: 'bg-red-50 dark:bg-red-900/20',
      text: 'text-red-700 dark:text-red-300',
      border: 'border-red-300 dark:border-red-600'
    }
  } else {
    return {
      bg: 'bg-gray-100 dark:bg-gray-700',
      text: 'text-gray-600 dark:text-gray-400',
      border: 'border-gray-300 dark:border-gray-600'
    }
  }
}

/**
 * Normalize insurance status from various input formats
 */
export function normalizeInsuranceStatus(status: string | null | undefined): InsuranceStatus | null {
  if (!status) return null
  
  const normalized = status.toLowerCase().trim()
  
  // Handle common variations
  if (normalized.includes('insured') && !normalized.includes('not') && !normalized.includes('un')) {
    return 'Insured'
  }
  
  if (normalized.includes('not insured') || normalized.includes('uninsured') || normalized === 'no') {
    return 'Not Insured'
  }
  
  // Exact matches
  switch (normalized) {
    case 'insured':
    case 'yes':
    case 'covered':
      return 'Insured'
    case 'not insured':
    case 'uninsured':
    case 'no':
    case 'uncovered':
      return 'Not Insured'
    default:
      return null
  }
}

/**
 * Validate insurance status
 */
export function isValidInsuranceStatus(status: any): status is InsuranceStatus {
  return VALID_INSURANCE_STATUSES.includes(status)
}

/**
 * Filter vehicles by insurance status
 */
export function filterVehiclesByInsurance<T extends { insuranceStatus?: InsuranceStatus | null }>(
  vehicles: T[],
  filter: 'all' | 'insured' | 'not-insured'
): T[] {
  switch (filter) {
    case 'insured':
      return vehicles.filter(v => isVehicleInsured(v.insuranceStatus))
    case 'not-insured':
      return vehicles.filter(v => isVehicleNotInsured(v.insuranceStatus))
    default:
      return vehicles
  }
}

/**
 * Calculate insurance analytics from vehicle list
 */
export function calculateInsuranceAnalytics<T extends { insuranceStatus?: InsuranceStatus | null }>(
  vehicles: T[]
) {
  const insured = vehicles.filter(v => isVehicleInsured(v.insuranceStatus)).length
  const notInsured = vehicles.filter(v => isVehicleNotInsured(v.insuranceStatus)).length
  const unknown = vehicles.filter(v => !v.insuranceStatus).length
  const total = vehicles.length
  
  return {
    insured,
    notInsured,
    unknown,
    total,
    insuredPercentage: total > 0 ? Math.round((insured / total) * 100) : 0,
    notInsuredPercentage: total > 0 ? Math.round((notInsured / total) * 100) : 0,
    unknownPercentage: total > 0 ? Math.round((unknown / total) * 100) : 0
  }
}

/**
 * Check if insurance action is allowed (for checkout/hire restrictions)
 */
export function canPerformAction(insuranceStatus: InsuranceStatus | null | undefined): boolean {
  return isVehicleInsured(insuranceStatus)
}

/**
 * Get insurance warning message for blocked actions
 */
export function getInsuranceWarningMessage(
  action: 'checkout' | 'hire',
  registration: string
): string {
  const actionText = action === 'checkout' ? 'check out' : 'hire out'
  return `Cannot ${actionText} vehicle ${registration} - insurance coverage required. Please update the insurance status to "Insured" before proceeding.`
}