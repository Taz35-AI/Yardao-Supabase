// src/utils/serviceBookings/dateHelpers.ts - Date Formatting & Parsing
import { logger } from '@/lib/logger'
/**
 * Format Date object to YYYY-MM-DD string for Firestore
 */
export const formatDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const formatted = `${year}-${month}-${day}`
  logger.log('Formatting date:', date.toDateString(), 'to:', formatted)
  return formatted
}

/**
 * Get date value for HTML input element (YYYY-MM-DD)
 */
export const getDateInputValue = (date: Date): string => {
  return formatDate(date)
}

/**
 * Parse YYYY-MM-DD string to Date object
 */
export const parseDateFromInput = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Get formatted display date (e.g., "Monday, 15 January 2025")
 */
export const getDisplayDate = (date: Date): string => {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

/**
 * Get today's date in YYYY-MM-DD format (for min date restriction)
 */
export const getTodayDateString = (): string => {
  return new Date().toISOString().split('T')[0]
}