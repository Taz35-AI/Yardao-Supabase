// src/utils/dateUtils.ts - Utility functions for date formatting and handling

import * as XLSX from 'xlsx'
import { logger } from '@/lib/logger'

// ============================================================================
// EXISTING FUNCTIONS - Last Login Utilities
// ============================================================================

/**
 * Formats a last login timestamp into a human-readable relative time string
 * @param lastLoginAt - The timestamp of the last login (Date, string, or undefined)
 * @returns A formatted string like "2 hours ago", "3 days ago", or "Never"
 */
export function formatLastLogin(lastLoginAt?: Date | string | null): string {
  if (!lastLoginAt) {
    return 'Never'
  }

  try {
    // Convert to Date object
    let date: Date
    if (typeof lastLoginAt === 'string') {
      date = new Date(lastLoginAt)
    } else if (lastLoginAt instanceof Date) {
      date = lastLoginAt
    } else {
      return 'Never'
    }

    // Validate the date
    if (isNaN(date.getTime())) {
      logger.log('Invalid lastLoginAt timestamp:', lastLoginAt)
      return 'Unknown'
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
      return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
    }

    // Less than 1 day
    if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600)
      return `${hours} hour${hours === 1 ? '' : 's'} ago`
    }

    // Less than 1 week
    if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400)
      return `${days} day${days === 1 ? '' : 's'} ago`
    }

    // Less than 1 month (30 days)
    if (diffInSeconds < 2592000) {
      const weeks = Math.floor(diffInSeconds / 604800)
      return `${weeks} week${weeks === 1 ? '' : 's'} ago`
    }

    // Less than 1 year
    if (diffInSeconds < 31536000) {
      const months = Math.floor(diffInSeconds / 2592000)
      return `${months} month${months === 1 ? '' : 's'} ago`
    }

    // More than 1 year - show the actual date in UK format
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })

  } catch (error) {
    logger.error('Error formatting last login timestamp:', error)
    return 'Unknown'
  }
}

/**
 * Formats a timestamp for detailed display (used in tooltips or detailed views)
 * @param timestamp - The timestamp to format
 * @returns A formatted string like "15/03/2024 at 14:30"
 */
export function formatDetailedTimestamp(timestamp?: Date | string | null): string {
  if (!timestamp) {
    return 'Never logged in'
  }

  try {
    let date: Date
    if (typeof timestamp === 'string') {
      date = new Date(timestamp)
    } else if (timestamp instanceof Date) {
      date = timestamp
    } else {
      return 'Invalid date'
    }

    if (isNaN(date.getTime())) {
      return 'Invalid date'
    }

    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })

  } catch (error) {
    logger.error('Error formatting detailed timestamp:', error)
    return 'Invalid date'
  }
}

/**
 * Gets a status indicator based on how recent the last login was
 * @param lastLoginAt - The timestamp of the last login
 * @returns Object with status and color information
 */
export function getLoginStatus(lastLoginAt?: Date | string | null): {
  status: 'active' | 'recent' | 'inactive' | 'never'
  color: string
  bgColor: string
  description: string
} {
  if (!lastLoginAt) {
    return {
      status: 'never',
      color: 'text-gray-500',
      bgColor: 'bg-gray-100 dark:bg-gray-800',
      description: 'Never logged in'
    }
  }

  try {
    let date: Date
    if (typeof lastLoginAt === 'string') {
      date = new Date(lastLoginAt)
    } else if (lastLoginAt instanceof Date) {
      date = lastLoginAt
    } else {
      return {
        status: 'never',
        color: 'text-gray-500',
        bgColor: 'bg-gray-100 dark:bg-gray-800',
        description: 'Invalid date'
      }
    }

    if (isNaN(date.getTime())) {
      return {
        status: 'never',
        color: 'text-gray-500',
        bgColor: 'bg-gray-100 dark:bg-gray-800',
        description: 'Invalid date'
      }
    }

    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)

    // Active: logged in within last 24 hours
    if (diffInHours < 24) {
      return {
        status: 'active',
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-100 dark:bg-green-900/20',
        description: 'Recently active'
      }
    }

    // Recent: logged in within last 7 days
    if (diffInHours < 168) {
      return {
        status: 'recent',
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-100 dark:bg-blue-900/20',
        description: 'Recently active'
      }
    }

    // Inactive: logged in more than 7 days ago
    return {
      status: 'inactive',
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-900/20',
      description: 'Inactive'
    }

  } catch (error) {
    logger.error('Error getting login status:', error)
    return {
      status: 'never',
      color: 'text-gray-500',
      bgColor: 'bg-gray-100 dark:bg-gray-800',
      description: 'Error'
    }
  }
}

/**
 * Checks if a user should be considered "inactive" based on their last login
 * @param lastLoginAt - The timestamp of the last login
 * @param inactiveDays - Number of days to consider as inactive threshold (default: 30)
 * @returns true if user should be considered inactive
 */
export function isUserInactive(lastLoginAt?: Date | string | null, inactiveDays: number = 30): boolean {
  if (!lastLoginAt) {
    return true // Never logged in = inactive
  }

  try {
    let date: Date
    if (typeof lastLoginAt === 'string') {
      date = new Date(lastLoginAt)
    } else if (lastLoginAt instanceof Date) {
      date = lastLoginAt
    } else {
      return true
    }

    if (isNaN(date.getTime())) {
      return true
    }

    const now = new Date()
    const diffInDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)

    return diffInDays > inactiveDays

  } catch (error) {
    logger.error('Error checking user inactive status:', error)
    return true
  }
}

// ============================================================================
// NEW FUNCTIONS - UK Date Format for Excel Import/Export
// ============================================================================

/**
 * Format date to UK format (DD/MM/YYYY)
 * @param date - The date to format (can be Date, string, Firestore Timestamp, etc.)
 * @returns Formatted date string in DD/MM/YYYY format
 */
export function formatDateToUK(date: any): string {
  if (!date) return ''
  
  let dateObj: Date
  
  // Handle different date formats
  if (date && typeof date === 'object' && 'toDate' in date) {
    // Firestore Timestamp
    dateObj = date.toDate()
  } else if (date instanceof Date) {
    dateObj = date
  } else if (typeof date === 'string' || typeof date === 'number') {
    dateObj = new Date(date)
  } else {
    return ''
  }
  
  if (isNaN(dateObj.getTime())) {
    return ''
  }
  
  const day = String(dateObj.getDate()).padStart(2, '0')
  const month = String(dateObj.getMonth() + 1).padStart(2, '0')
  const year = dateObj.getFullYear()
  
  return `${day}/${month}/${year}`
}

/**
 * Parse UK date format (DD/MM/YYYY) to Date object
 * @param dateStr - Date string in DD/MM/YYYY format
 * @returns Date object or null if invalid
 */
export function parseUKDate(dateStr: string): Date | null {
  if (!dateStr) return null
  
  // Check if it's in DD/MM/YYYY format
  const ukDateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  const match = dateStr.match(ukDateRegex)
  
  if (match) {
    const [_, day, month, year] = match
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    
    if (!isNaN(date.getTime())) {
      return date
    }
  }
  
  // Fallback: try parsing as-is
  const date = new Date(dateStr)
  return isNaN(date.getTime()) ? null : date
}

/**
 * Parse Excel date (handles both Excel serial numbers and UK date strings)
 * @param excelDate - Date from Excel (can be number, string, or Date)
 * @returns Date string in YYYY-MM-DD format for Firestore
 */
export function parseExcelDate(excelDate: any): string {
  if (!excelDate) return ''
  
  // Handle Excel serial number
  if (typeof excelDate === 'number') {
    // Excel stores dates as numbers (days since 1900-01-01)
    const date = new Date((excelDate - 25569) * 86400 * 1000)
    return formatDateForFirestore(date)
  }
  
  // Handle string dates
  if (typeof excelDate === 'string') {
    // First try UK format (DD/MM/YYYY)
    const ukDate = parseUKDate(excelDate)
    if (ukDate) {
      return formatDateForFirestore(ukDate)
    }
    
    // Try other formats
    const date = new Date(excelDate)
    if (!isNaN(date.getTime())) {
      return formatDateForFirestore(date)
    }
  }
  
  // Handle Date object
  if (excelDate instanceof Date) {
    return formatDateForFirestore(excelDate)
  }
  
  return ''
}

/**
 * Format date for Firestore storage (YYYY-MM-DD)
 * @param date - Date to format for Firestore
 * @returns Date string in YYYY-MM-DD format
 */
export function formatDateForFirestore(date: Date | string | any): string {
  if (!date) return ''
  
  let dateObj: Date
  
  if (date instanceof Date) {
    dateObj = date
  } else if (typeof date === 'string') {
    // Try UK format first
    const ukDate = parseUKDate(date)
    dateObj = ukDate || new Date(date)
  } else if (date && typeof date === 'object' && 'toDate' in date) {
    dateObj = date.toDate()
  } else {
    dateObj = new Date(date)
  }
  
  if (isNaN(dateObj.getTime())) {
    return ''
  }
  
  // Return in YYYY-MM-DD format for Firestore
  return dateObj.toISOString().split('T')[0]
}

/**
 * Configure XLSX to use UK date format
 */
export function configureXLSXForUK(): void {
  // Set XLSX date format for UK
  if (typeof XLSX !== 'undefined' && XLSX.SSF) {
    // UK date format
    XLSX.SSF._table[14] = 'dd/mm/yyyy'
    XLSX.SSF._table[22] = 'dd/mm/yyyy hh:mm'
  }
}

/**
 * Format date cell for Excel with UK format
 * @param date - Date to format for Excel cell
 * @returns Excel cell object with UK formatted date
 */
export function formatExcelDateCell(date: any): any {
  if (!date) return ''
  
  const ukDate = formatDateToUK(date)
  
  // Return as formatted string for Excel
  return {
    v: ukDate,
    t: 's', // String type to preserve format
    w: ukDate
  }
}

/**
 * Generic date formatter - formats any date to UK format string
 * @param date - The date to format
 * @returns Formatted date string in DD/MM/YYYY format
 */
export function formatDate(date: any): string {
  return formatDateToUK(date)
}