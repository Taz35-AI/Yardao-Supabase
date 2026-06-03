// src/lib/timeUtils.ts - Utility functions for formatting time differences
import { logger } from '@/lib/logger'
export function getTimeAgo(date: Date | string | null | undefined): string {
  if (!date) {
    return 'Never'
  }

  try {
    const now = new Date()
    const targetDate = typeof date === 'string' ? new Date(date) : date
    
    // Handle invalid dates
    if (isNaN(targetDate.getTime())) {
      return 'Never'
    }

    const diffInSeconds = Math.floor((now.getTime() - targetDate.getTime()) / 1000)
    
    // Handle future dates (shouldn't happen, but just in case)
    if (diffInSeconds < 0) {
      return 'Just now'
    }
    
    // Less than 1 minute
    if (diffInSeconds < 60) {
      return 'Just now'
    }
    
    // Minutes
    const diffInMinutes = Math.floor(diffInSeconds / 60)
    if (diffInMinutes < 60) {
      return `${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''} ago`
    }
    
    // Hours
    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) {
      return `${diffInHours} hour${diffInHours !== 1 ? 's' : ''} ago`
    }
    
    // Days
    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays < 7) {
      return `${diffInDays} day${diffInDays !== 1 ? 's' : ''} ago`
    }
    
    // Weeks
    const diffInWeeks = Math.floor(diffInDays / 7)
    if (diffInWeeks < 4) {
      return `${diffInWeeks} week${diffInWeeks !== 1 ? 's' : ''} ago`
    }
    
    // Months
    const diffInMonths = Math.floor(diffInDays / 30)
    if (diffInMonths < 12) {
      return `${diffInMonths} month${diffInMonths !== 1 ? 's' : ''} ago`
    }
    
    // Years
    const diffInYears = Math.floor(diffInDays / 365)
    return `${diffInYears} year${diffInYears !== 1 ? 's' : ''} ago`
    
  } catch (error) {
    logger.error('Error calculating time ago:', error)
    return 'Unknown'
  }
}

// Helper function to get a more detailed timestamp for tooltips
export function getDetailedTimestamp(date: Date | string | null | undefined): string {
  if (!date) {
    return 'Never logged in'
  }

  try {
    const targetDate = typeof date === 'string' ? new Date(date) : date
    
    if (isNaN(targetDate.getTime())) {
      return 'Never logged in'
    }

    // Format: "Monday, August 17, 2025 at 2:30 PM"
    return targetDate.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  } catch (error) {
    logger.error('Error formatting detailed timestamp:', error)
    return 'Invalid date'
  }
}

// Helper function to check if user is considered "online" (logged in recently)
export function isUserOnline(lastLoginAt: Date | string | null | undefined, minutesThreshold: number = 15): boolean {
  if (!lastLoginAt) {
    return false
  }

  try {
    const now = new Date()
    const loginDate = typeof lastLoginAt === 'string' ? new Date(lastLoginAt) : lastLoginAt
    
    if (isNaN(loginDate.getTime())) {
      return false
    }

    const diffInMinutes = Math.floor((now.getTime() - loginDate.getTime()) / (1000 * 60))
    return diffInMinutes <= minutesThreshold
  } catch (error) {
    logger.error('Error checking online status:', error)
    return false
  }
}

// Helper function to get status color based on last login
export function getLoginStatusColor(lastLoginAt: Date | string | null | undefined): {
  color: string
  bgColor: string
  textColor: string
} {
  if (!lastLoginAt) {
    return {
      color: 'text-gray-500',
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-700'
    }
  }

  try {
    const now = new Date()
    const loginDate = typeof lastLoginAt === 'string' ? new Date(lastLoginAt) : lastLoginAt
    
    if (isNaN(loginDate.getTime())) {
      return {
        color: 'text-gray-500',
        bgColor: 'bg-gray-100',
        textColor: 'text-gray-700'
      }
    }

    const diffInMinutes = Math.floor((now.getTime() - loginDate.getTime()) / (1000 * 60))
    
    // Online (within 15 minutes)
    if (diffInMinutes <= 15) {
      return {
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        textColor: 'text-green-800'
      }
    }
    
    // Recently active (within 1 hour)
    if (diffInMinutes <= 60) {
      return {
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        textColor: 'text-blue-800'
      }
    }
    
    // Active today (within 24 hours)
    if (diffInMinutes <= 1440) {
      return {
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        textColor: 'text-yellow-800'
      }
    }
    
    // Inactive (more than 24 hours)
    return {
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      textColor: 'text-red-800'
    }
    
  } catch (error) {
    logger.error('Error getting login status color:', error)
    return {
      color: 'text-gray-500',
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-700'
    }
  }
}