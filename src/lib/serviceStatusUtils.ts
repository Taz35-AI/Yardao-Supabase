// src/lib/serviceStatusUtils.ts - Simple status display logic
export type ServiceStatus = 'scheduled' | 'in-progress' | 'completed' | 'cancelled'
export type DisplayStatus = ServiceStatus

/**
 * Get the display status for a service based on simple logic:
 * - If today's date >= service date AND status is still "scheduled" → show as "in-progress"
 * - Otherwise show the actual status
 */
export function getDisplayStatus(serviceDate: string, actualStatus: ServiceStatus): DisplayStatus {
  // If already completed or cancelled, show actual status
  if (actualStatus === 'completed' || actualStatus === 'cancelled') {
    return actualStatus
  }
  
  // If already marked as in-progress, show that
  if (actualStatus === 'in-progress') {
    return actualStatus
  }
  
  // For scheduled services, check if date has passed
  if (actualStatus === 'scheduled') {
    const today = new Date()
    const service = new Date(serviceDate + 'T00:00:00') // Ensure local timezone
    
    // If service date is today or in the past, show as in-progress
    if (service <= today) {
      return 'in-progress'
    }
  }
  
  // Default to actual status
  return actualStatus
}

/**
 * Get status badge colors based on display status
 */
export function getStatusBadgeClasses(displayStatus: DisplayStatus): string {
  switch (displayStatus) {
    case 'scheduled':
      return 'bg-cyan-50 text-cyan-700 border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-300'
    case 'in-progress':
      return 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300'
    case 'completed':
      return 'bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300'
    case 'cancelled':
      return 'bg-gray-50 text-gray-700 border-gray-300 dark:bg-gray-900/30 dark:text-gray-300'
    default:
      return 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300'
  }
}

/**
 * Get status background colors for service cards/items
 */
export function getStatusBackgroundClasses(displayStatus: DisplayStatus): string {
  switch (displayStatus) {
    case 'scheduled':
      return 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800'
    case 'in-progress':
      return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
    case 'completed':
      return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
    case 'cancelled':
      return 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700'
    default:
      return 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700'
  }
}

/**
 * Get status label for display
 */
export function getStatusLabel(displayStatus: DisplayStatus): string {
  switch (displayStatus) {
    case 'scheduled':
      return 'Scheduled'
    case 'in-progress':
      return 'In Progress'
    case 'completed':
      return 'Completed'
    case 'cancelled':
      return 'Cancelled'
    default:
      return 'Unknown'
  }
}

/**
 * Get status icon emoji
 */
export function getStatusIcon(displayStatus: DisplayStatus): string {
  switch (displayStatus) {
    case 'scheduled':
      return '📅'
    case 'in-progress':
      return '🔧'
    case 'completed':
      return '✅'
    case 'cancelled':
      return '❌'
    default:
      return '📋'
  }
}