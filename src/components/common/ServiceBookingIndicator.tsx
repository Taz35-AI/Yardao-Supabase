'use client'

import React, { useState } from 'react'
import { Triangle, ExternalLink, Home, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface ServiceBooking {
  id: string
  registration: string
  date: string
  timeSlot?: string
  customTime?: string
  workRequired: string | string[]
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled'
  isExternalProvider?: boolean
  externalProvider?: {
    garageName: string
    address?: string
  }
}

interface ServiceBookingIndicatorProps {
  vehicleRegistration: string
  serviceBookings?: ServiceBooking[]
  className?: string
}

export const ServiceBookingIndicator = React.memo(function ServiceBookingIndicator({
  vehicleRegistration,
  serviceBookings = [],
  className = ''
}: ServiceBookingIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  const hasActiveBooking = serviceBookings.some(
    booking =>
      booking.registration?.toLowerCase() === vehicleRegistration?.toLowerCase() &&
      (booking.status === 'scheduled' || booking.status === 'in-progress')
  )

  const activeBooking = serviceBookings.find(
    booking =>
      booking.registration?.toLowerCase() === vehicleRegistration?.toLowerCase() &&
      (booking.status === 'scheduled' || booking.status === 'in-progress')
  )

  if (!hasActiveBooking || !activeBooking) {
    return null
  }

  const isExternal = activeBooking.isExternalProvider
  const triangleColor = 'text-yellow-500 font-bold' // yellow bold triangle

  return (
    <>
      {/* Triangle Button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          setShowTooltip(true)
        }}
        className={`w-4 h-4 ${triangleColor} hover:scale-110 transition-transform cursor-pointer ${className}`}
        title="Vehicle is booked for service"
      >
        <Triangle className="w-full h-full fill-current" />
      </button>

      {/* Centered Modal */}
      {showTooltip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-80 max-w-full p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">Service Booking</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTooltip(false)}
                className="p-1"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-2 text-sm">
              <p className="text-gray-900 dark:text-white">
                <strong>{vehicleRegistration}</strong> is booked for service.
              </p>

              <div className="flex items-center space-x-2">
                {isExternal ? (
                  <ExternalLink className="w-4 h-4 text-yellow-500" />
                ) : (
                  <Home className="w-4 h-4 text-blue-600" />
                )}
                <span className="text-gray-600 dark:text-gray-400">
                  {isExternal ? 'External provider' : 'In-house service'}
                </span>
              </div>

              {isExternal && activeBooking.externalProvider?.garageName && (
                <p className="text-gray-600 dark:text-gray-400">
                  Provider: {activeBooking.externalProvider.garageName}
                </p>
              )}

              <p className="text-gray-600 dark:text-gray-400">
                Status: {activeBooking.status === 'in-progress' ? 'In Progress' : 'Scheduled'}
              </p>
            </div>

            <Button onClick={() => setShowTooltip(false)} className="w-full mt-4" size="sm">
              Close
            </Button>
          </div>
        </div>
      )}
    </>
  )
})
