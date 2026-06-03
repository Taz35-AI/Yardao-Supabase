// src/types/insurance.ts - Insurance Status Type Definitions

export type InsuranceStatus = 'Insured' | 'Not Insured'

/**
 * Interface for insurance sync data between fleet and yard
 */
export interface InsuranceSyncData {
  insuranceStatus: InsuranceStatus | null
}

/**
 * Insurance sync result interface
 */
export interface InsuranceSyncResult {
  success: boolean
  updatedFleetRecord: boolean
  updatedYardRecords: number
  error?: string
}

/**
 * Insurance warning modal props
 */
export interface InsuranceWarningModalProps {
  isOpen: boolean
  onClose: () => void
  vehicleRegistration: string
  action: 'checkout' | 'hire' // What action was blocked
}

/**
 * Insurance toggle button props
 */
export interface InsuranceToggleProps {
  insuranceStatus: InsuranceStatus | null
  onToggle: (status: InsuranceStatus) => void
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * Insurance status badge props
 */
export interface InsuranceStatusBadgeProps {
  status: InsuranceStatus | null
  showIcon?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * Get insurance status display configuration
 */
export function getInsuranceStatusConfig(status: InsuranceStatus | null) {
  if (!status) {
    return {
      label: 'Unknown',
      color: 'text-gray-500',
      bgColor: 'bg-gray-100 dark:bg-gray-700',
      borderColor: 'border-gray-300 dark:border-gray-600',
      textColor: 'text-gray-700 dark:text-gray-300'
    }
  }

  switch (status) {
    case 'Insured':
      return {
        label: 'Insured',
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-50 dark:bg-green-900/20',
        borderColor: 'border-green-300 dark:border-green-600',
        textColor: 'text-green-700 dark:text-green-300'
      }
    case 'Not Insured':
      return {
        label: 'Not Insured',
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-50 dark:bg-red-900/20',
        borderColor: 'border-red-300 dark:border-red-600',
        textColor: 'text-red-700 dark:text-red-300'
      }
    default:
      return {
        label: 'Unknown',
        color: 'text-gray-500',
        bgColor: 'bg-gray-100 dark:bg-gray-700',
        borderColor: 'border-gray-300 dark:border-gray-600',
        textColor: 'text-gray-700 dark:text-gray-300'
      }
  }
}

/**
 * Check if a vehicle can be checked out or hired based on insurance status
 */
export function canPerformAction(insuranceStatus: InsuranceStatus | null): boolean {
  return insuranceStatus === 'Insured'
}

/**
 * Get insurance warning message for blocked actions
 */
export function getInsuranceWarningMessage(action: 'checkout' | 'hire', registration: string): string {
  const actionText = action === 'checkout' ? 'check out' : 'hire out'
  const actionNoun = action === 'checkout' ? 'check-out' : 'hire'
  
  return `Vehicle ${registration} cannot be ${actionText} without insurance. It needs to be added back on insurance before going out!`
}

/**
 * Get insurance status display text
 */
export function getInsuranceDisplayText(status: InsuranceStatus | null): string {
  if (!status) return 'Not Set'
  return status
}