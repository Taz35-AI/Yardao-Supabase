// src/utils/dateHelpers.ts

/**
 * Formats a Date object to YYYY-MM-DD string for Firestore
 * Timezone-safe implementation
 */
export function formatDateForFirestore(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Formats a date string or Date object to a readable format
 * Example: "Monday, November 16, 2025"
 */
export function formatDate(dateString: string | Date): string {
  let date: Date
  
  if (typeof dateString === 'string') {
    // Handle YYYY-MM-DD format
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateString.split('-').map(Number)
      date = new Date(year, month - 1, day)
    } else {
      date = new Date(dateString)
    }
  } else {
    date = dateString
  }
  
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

/**
 * Parses a YYYY-MM-DD string to a Date object
 */
export function parseFirestoreDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Checks if a date is today
 */
export function isToday(date: Date): boolean {
  const today = new Date()
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  )
}

/**
 * Checks if a date is in the past
 */
export function isPast(date: Date): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return date < today
}

/**
 * Checks if a date is in the future
 */
export function isFuture(date: Date): boolean {
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  return date > today
}