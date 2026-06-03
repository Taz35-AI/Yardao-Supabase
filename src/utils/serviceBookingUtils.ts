// src/utils/serviceBookingUtils.ts - Service Booking Utility Functions
// Separation of Concerns: Pure logic for booking density calculations

import type { ServiceBooking } from '@/types/serviceBookings'

/**
 * Booking density levels for heatmap visualization
 */
export type BookingDensity = 'not-busy' | 'busy' | 'very-busy'

/**
 * Booking density thresholds configuration
 * You can easily adjust these numbers to change sensitivity
 */
export const DENSITY_THRESHOLDS = {
  NOT_BUSY: 2,    // 0-2 bookings = not busy
  BUSY: 5,        // 3-5 bookings = busy
  // 6+ bookings = very busy
} as const

/**
 * Calculate booking density for a specific date
 * Returns the density level based on number of active bookings
 * 
 * @param bookings - Array of all service bookings
 * @param dateString - Date in 'YYYY-MM-DD' format
 * @returns BookingDensity level
 */
export function getBookingDensityForDate(
  bookings: ServiceBooking[],
  dateString: string
): BookingDensity {
  // Count active bookings (exclude cancelled)
  const activeBookingsCount = bookings.filter(
    booking => 
      booking.date === dateString && 
      booking.status !== 'cancelled'
  ).length

  // Determine density level based on thresholds
  if (activeBookingsCount <= DENSITY_THRESHOLDS.NOT_BUSY) {
    return 'not-busy'
  } else if (activeBookingsCount <= DENSITY_THRESHOLDS.BUSY) {
    return 'busy'
  } else {
    return 'very-busy'
  }
}

/**
 * Get CSS classes for heatmap visualization based on density
 * Provides consistent styling across the application
 * 
 * @param density - The booking density level
 * @returns Tailwind CSS classes for background and border
 */
export function getHeatmapStyles(density: BookingDensity): string {
  switch (density) {
    case 'not-busy':
      // Green tones - calm, available
      return 'bg-green-50/80 dark:bg-green-950/30 border-green-200 dark:border-green-800/40'
    
    case 'busy':
      // Amber tones - moderate activity
      return 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40'
    
    case 'very-busy':
      // Red tones - high activity
      return 'bg-red-50/80 dark:bg-red-950/30 border-red-200 dark:border-red-800/40'
  }
}

/**
 * Get readable label for booking density
 * Useful for tooltips or accessibility
 * 
 * @param density - The booking density level
 * @returns Human-readable label
 */
export function getDensityLabel(density: BookingDensity): string {
  switch (density) {
    case 'not-busy':
      return 'Not Busy'
    case 'busy':
      return 'Busy'
    case 'very-busy':
      return 'Very Busy'
  }
}

/**
 * Get booking count description for a date
 * Provides contextual information about booking volume
 * 
 * @param bookings - Array of all service bookings
 * @param dateString - Date in 'YYYY-MM-DD' format
 * @returns Descriptive text
 */
export function getBookingCountDescription(
  bookings: ServiceBooking[],
  dateString: string
): string {
  const count = bookings.filter(
    booking => 
      booking.date === dateString && 
      booking.status !== 'cancelled'
  ).length

  if (count === 0) return 'No bookings'
  if (count === 1) return '1 booking'
  return `${count} bookings`
}

/**
 * Calculate booking statistics for a date range
 * Useful for analytics and reporting
 * 
 * @param bookings - Array of all service bookings
 * @param startDate - Start date string 'YYYY-MM-DD'
 * @param endDate - End date string 'YYYY-MM-DD'
 * @returns Statistics object
 */
export function getBookingStatistics(
  bookings: ServiceBooking[],
  startDate: string,
  endDate: string
) {
  const rangeBookings = bookings.filter(
    booking => 
      booking.date >= startDate && 
      booking.date <= endDate &&
      booking.status !== 'cancelled'
  )

  const byDensity = {
    'not-busy': 0,
    'busy': 0,
    'very-busy': 0
  }

  // Generate all dates in range
  const start = new Date(startDate)
  const end = new Date(endDate)
  const dates: string[] = []
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0]
    dates.push(dateStr)
    const density = getBookingDensityForDate(bookings, dateStr)
    byDensity[density]++
  }

  return {
    totalBookings: rangeBookings.length,
    totalDays: dates.length,
    averageBookingsPerDay: dates.length > 0 ? rangeBookings.length / dates.length : 0,
    densityBreakdown: byDensity,
    busiestDay: dates.reduce((busiest, date) => {
      const count = bookings.filter(b => b.date === date && b.status !== 'cancelled').length
      const busiestCount = bookings.filter(b => b.date === busiest && b.status !== 'cancelled').length
      return count > busiestCount ? date : busiest
    }, dates[0])
  }
}

/**
 * Check if a date should show a heatmap indicator
 * Only show heatmap on dates with at least one booking
 * 
 * @param bookings - Array of all service bookings
 * @param dateString - Date in 'YYYY-MM-DD' format
 * @returns boolean
 */
export function shouldShowHeatmap(
  bookings: ServiceBooking[],
  dateString: string
): boolean {
  return bookings.some(
    booking => 
      booking.date === dateString && 
      booking.status !== 'cancelled'
  )
}