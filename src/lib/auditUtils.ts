// src/lib/auditUtils.ts - Audit Logging Utility Functions

import { AuditLog } from '@/types'
import { logger } from '@/lib/logger'

/**
 * Creates an audit log entry
 * @param action - The action performed (e.g., "Checked in", "Status changed")
 * @param by - The user ID who performed the action
 * @param byDisplayName - The display name of the user (optional)
 * @returns AuditLog object
 */
export function createAuditLog(
  action: string, 
  by: string, 
  byDisplayName?: string
): AuditLog {
  return {
    action,
    by,
    byDisplayName,
    timestamp: new Date()
  }
}

/**
 * Generates audit log action text based on what changed
 * @param changes - Object containing the changes made
 * @param userDisplayName - Name of the user making the change
 * @returns Formatted action string
 */
export function generateAuditAction(
  changes: Record<string, any>, 
  userDisplayName: string
): string {
  const changeKeys = Object.keys(changes).filter(key => 
    key !== 'updatedAt' && 
    key !== 'lastEditLog' && 
    changes[key] !== undefined
  )

  if (changeKeys.length === 0) {
    return `Vehicle edited by ${userDisplayName}`
  }

  // Priority order for changes (most important first)
  const priorityOrder = ['status', 'condition', 'mileage', 'notes', 'comments']
  
  // Find the most important change
  const primaryChange = priorityOrder.find(key => changeKeys.includes(key)) || changeKeys[0]

  switch (primaryChange) {
    case 'status':
      return `Status changed by ${userDisplayName}`
    case 'condition':
      return `Condition changed by ${userDisplayName}`
    case 'mileage':
      return `Mileage updated by ${userDisplayName}`
    case 'notes':
      return `Notes updated by ${userDisplayName}`
    case 'comments':
      return `Comments updated by ${userDisplayName}`
    case 'registration':
      return `Registration updated by ${userDisplayName}`
    case 'make':
    case 'model':
    case 'colour':
    case 'size':
      return `Vehicle details edited by ${userDisplayName}`
    default:
      return `Vehicle edited by ${userDisplayName}`
  }
}

/**
 * Formats audit log for display in UI
 * @param auditLog - The audit log entry
 * @param showTimestamp - Whether to include timestamp (default: true)
 * @returns Formatted string for display
 */
export function formatAuditLogForDisplay(
  auditLog: AuditLog | undefined, 
  showTimestamp: boolean = true
): string {
  if (!auditLog) {
    return 'No recent activity'
  }

  const { action, timestamp } = auditLog
  
  if (!showTimestamp || !timestamp) {
    return action
  }

  // Format timestamp with error handling
  try {
    const timeString = formatAuditTimestamp(timestamp)
    return `${action} • ${timeString}`
  } catch (error) {
    logger.log('Error formatting audit log timestamp:', error)
    return action // Return just the action if timestamp formatting fails
  }
}

/**
 * Formats timestamp for audit log display
 * @param timestamp - The timestamp to format
 * @returns Formatted time string
 */
export function formatAuditTimestamp(timestamp: Date | string): string {
  try {
    let date: Date
    
    // Handle different timestamp formats
    if (typeof timestamp === 'string') {
      date = new Date(timestamp)
    } else if (timestamp instanceof Date) {
      date = timestamp
    } else if (timestamp && typeof timestamp === 'object' && typeof (timestamp as any).toDate === 'function') {
      // Handle Firestore Timestamp objects
      date = (timestamp as any).toDate()
    } else {
      // Fallback for any other format
      date = new Date(timestamp)
    }
    
    // Validate the date
    if (isNaN(date.getTime())) {
      logger.log('Invalid timestamp provided to formatAuditTimestamp:', timestamp)
      return 'Unknown time'
    }
    
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    // Less than 1 minute
    if (diffInSeconds < 60) {
      return 'Just now'
    }

    // Less than 1 hour
    if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60)
      return `${minutes}m ago`
    }

    // Less than 1 day
    if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600)
      return `${hours}h ago`
    }

    // Less than 1 week
    if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400)
      return `${days}d ago`
    }

    // More than 1 week - show actual date
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    })
  } catch (error) {
    logger.error('Error formatting audit timestamp:', error)
    return 'Unknown time'
  }
}

/**
 * Gets the color class for audit log based on action type
 * @param action - The audit action string
 * @returns Tailwind color classes
 */
export function getAuditLogColorClass(action: string): string {
  const lowerAction = action.toLowerCase()
  
  if (lowerAction.includes('checked in')) {
    return 'text-green-600 dark:text-green-400'
  }
  
  if (lowerAction.includes('checked out')) {
    return 'text-red-600 dark:text-red-400'
  }
  
  if (lowerAction.includes('status changed')) {
    return 'text-blue-600 dark:text-blue-400'
  }
  
  if (lowerAction.includes('condition changed')) {
    return 'text-orange-600 dark:text-orange-400'
  }
  
  if (lowerAction.includes('mileage') || lowerAction.includes('notes') || lowerAction.includes('comments')) {
    return 'text-purple-600 dark:text-purple-400'
  }
  
  // Default color for general edits
  return 'text-gray-600 dark:text-gray-400'
}

/**
 * Creates a check-in audit log
 * @param userDisplayName - Name of the user checking in the vehicle
 * @returns AuditLog for check-in action
 */
export function createCheckInAuditLog(userDisplayName: string, userId: string): AuditLog {
  return createAuditLog(`Checked in by ${userDisplayName}`, userId, userDisplayName)
}

/**
 * Creates a check-out audit log
 * @param userDisplayName - Name of the user checking out the vehicle
 * @returns AuditLog for check-out action
 */
export function createCheckOutAuditLog(userDisplayName: string, userId: string): AuditLog {
  return createAuditLog(`Checked out by ${userDisplayName}`, userId, userDisplayName)
}