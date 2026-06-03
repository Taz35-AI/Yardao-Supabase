// src/types/banner.ts - Types for ServiceBanner component
export interface BannerState {
  dismissedDate: string | null
  lastServiceIds: string[]
  hasInteracted: boolean
}

export interface ServiceStats {
  total: number
  completed: number
  inProgress: number
  scheduled: number
  external: number
  internal: number
}

export interface ServiceBannerProps {
  className?: string
}

// Re-export from service bookings for convenience
export type { ServiceBooking } from './serviceBookings'