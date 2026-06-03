// src/lib/statusUtils.ts - Status Configuration Utilities
import { 
  CheckCircle, 
  Clock, 
  Wrench, 
  XCircle, 
  AlertTriangle 
} from 'lucide-react'
import { logger } from '@/lib/logger'

export type VehicleStatus = 'Ready' | 'Pending checks' | 'Repairs needed' | 'Non-Starter'

export interface StatusConfig {
  icon: any
  color: string
  bgColor: string
  borderColor: string
  textColor: string
  label: string
  description: string
}

// UPDATED: Enhanced status configuration for new 4-status system
export const getStatusConfig = (status: string): StatusConfig => {
  switch (status) {
    case 'Ready':
      return {
        icon: CheckCircle,
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-50 dark:bg-green-900/20',
        borderColor: 'border-green-200 dark:border-green-800',
        textColor: 'text-green-800 dark:text-green-200',
        label: 'Ready for Collection',
        description: 'Vehicle is ready to be collected'
      }
    case 'Pending checks':
      return {
        icon: Clock,
        color: 'text-yellow-600 dark:text-yellow-400',
        bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
        borderColor: 'border-yellow-200 dark:border-yellow-800',
        textColor: 'text-yellow-800 dark:text-yellow-200',
        label: 'Pending Checks',
        description: 'Vehicle awaiting inspection or review'
      }
    case 'Repairs needed':
      return {
        icon: Wrench,
        color: 'text-orange-600 dark:text-orange-400',
        bgColor: 'bg-orange-50 dark:bg-orange-900/20',
        borderColor: 'border-orange-200 dark:border-orange-800',
        textColor: 'text-orange-800 dark:text-orange-200',
        label: 'Repairs Needed',
        description: 'Vehicle requires repair work'
      }
    case 'Non-Starter':
      return {
        icon: XCircle,
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-50 dark:bg-red-900/20',
        borderColor: 'border-red-200 dark:border-red-800',
        textColor: 'text-red-800 dark:text-red-200',
        label: 'Non-Starter',
        description: 'Vehicle cannot start or is inoperable'
      }
    
    // LEGACY SUPPORT: Keep old status for backward compatibility
    case 'Needs Checking':
      return {
        icon: AlertTriangle,
        color: 'text-orange-600 dark:text-orange-400',
        bgColor: 'bg-orange-50 dark:bg-orange-900/20',
        borderColor: 'border-orange-200 dark:border-orange-800',
        textColor: 'text-orange-800 dark:text-orange-200',
        label: 'Needs Checking',
        description: 'Vehicle requires inspection'
      }
    
    default:
      return {
        icon: AlertTriangle,
        color: 'text-gray-600 dark:text-gray-400',
        bgColor: 'bg-gray-50 dark:bg-gray-900/20',
        borderColor: 'border-gray-200 dark:border-gray-800',
        textColor: 'text-gray-800 dark:text-gray-200',
        label: 'Unknown Status',
        description: 'Status not determined'
      }
  }
}

// Helper function to get status badge styling
export const getStatusBadgeStyle = (status: string) => {
  const config = getStatusConfig(status)
  return {
    backgroundColor: config.bgColor,
    color: config.textColor,
    border: `1px solid ${config.borderColor}`,
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '12px',
    fontWeight: '500',
    display: 'inline-block'
  }
}

// Helper function to normalize status values
export const normalizeVehicleStatus = (status: string | undefined): VehicleStatus => {
  if (!status) return 'Pending checks'
  
  const normalizedStatus = status.toLowerCase().trim()
  
  switch (normalizedStatus) {
    case 'needs checking':
    case 'pending checks':
      return 'Pending checks'
    case 'ready':
      return 'Ready'
    case 'repairs needed':
      return 'Repairs needed'
    case 'non-starter':
      return 'Non-Starter'
    default:
      logger.log(`Unknown status "${status}", defaulting to "Pending checks"`)
      return 'Pending checks'
  }
}

// Check if status is valid
export const isValidVehicleStatus = (status: string): status is VehicleStatus => {
  const validStatuses: VehicleStatus[] = ['Ready', 'Pending checks', 'Repairs needed', 'Non-Starter']
  return validStatuses.includes(status as VehicleStatus)
}

// Get all available status options
export const getAllStatusOptions = (): VehicleStatus[] => {
  return ['Ready', 'Pending checks', 'Repairs needed', 'Non-Starter']
}