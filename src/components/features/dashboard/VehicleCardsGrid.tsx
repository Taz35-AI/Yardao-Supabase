// src/components/features/dashboard/VehicleCardsGrid.tsx - Updated with ServiceBookingIndicator integration
'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { CheckedInVehicle } from '@/types'
import { getConditionColor, getConditionTextColor, getConditionDisplayName } from '@/lib/conditionUtils'
import { formatAuditLogForDisplay, getAuditLogColorClass } from '@/lib/auditUtils'
import { ServiceBookingIndicator } from '@/components/common/ServiceBookingIndicator' // NEW: Import ServiceBookingIndicator
import { Calendar, Gauge, MapPin, FileText, Eye, History } from 'lucide-react'
import { useT } from '@/lib/i18n'

// NEW: Service booking interface to match ServiceBookingIndicator
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

interface VehicleCardsGridProps {
  vehicles: CheckedInVehicle[]
  serviceBookings?: ServiceBooking[] // NEW: Add service bookings prop
  onViewVehicle: (vehicle: CheckedInVehicle) => void
  getStatusConfig: (status: string) => any
  safeString: (value: any) => string
  formatDate: (date: any) => string
  formatMileage: (mileage: any) => string
  className?: string
}

export const VehicleCardsGrid = React.memo(function VehicleCardsGrid({
  vehicles,
  serviceBookings = [], // NEW: Default empty array for service bookings
  onViewVehicle,
  getStatusConfig,
  safeString,
  formatDate,
  formatMileage,
  className = ''
}: VehicleCardsGridProps) {
  const t = useT()
  // Sort vehicles by status color priority: Ready (green) → Pending (yellow) → Repairs (orange) → Non-Starter (red)
  const sortedVehicles = React.useMemo(() => {
    const statusPriority = {
      'Ready': 1,
      'Pending checks': 2,
      'Repairs needed': 3,
      'Non-Starter': 4
    }
    
    return [...vehicles].sort((a, b) => {
      const priorityA = statusPriority[a.status as keyof typeof statusPriority] || 5
      const priorityB = statusPriority[b.status as keyof typeof statusPriority] || 5
      return priorityA - priorityB
    })
  }, [vehicles])

  if (sortedVehicles.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 dark:text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-4" />
          <p className="text-lg font-medium mb-2">{t('dashboard.cardsGrid.emptyTitle')}</p>
          <p className="text-sm">
            {t('dashboard.cardsGrid.emptySubtitle')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12 gap-2 ${className}`}>
      {sortedVehicles.map((vehicle) => {
        const statusConfig = getStatusConfig(vehicle.status)
        const StatusIcon = statusConfig.icon
        const conditionColor = getConditionColor(vehicle.condition)
        const conditionTextColor = getConditionTextColor(conditionColor)
        const conditionDisplayName = getConditionDisplayName(vehicle.condition)

        return (
          <Card
            key={vehicle.id}
            className={`group hover:shadow-sm transition-all duration-150 cursor-pointer border-l-2 hover:scale-110 ${
              vehicle.status === 'Ready' 
                ? 'border-l-green-500 hover:border-l-green-600' 
                : vehicle.status === 'Pending checks'
                ? 'border-l-yellow-500 hover:border-l-yellow-600'
                : vehicle.status === 'Repairs needed'
                ? 'border-l-orange-500 hover:border-l-orange-600'
                : 'border-l-red-500 hover:border-l-red-600'
            }`}
            onClick={() => onViewVehicle(vehicle)}
          >
            <CardContent className="p-2 space-y-1.5">
              {/* Registration with Service Booking Indicator - Most prominent */}
              <div className="text-center relative">
                <div className="flex items-center justify-center space-x-1">
                  <h3 className="font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate flex-1" style={{ fontSize: '0.75rem', lineHeight: '1.2' }}>
                    {safeString(vehicle.registration)}
                  </h3>
                  {/* NEW: Service Booking Indicator */}
                  <div className="flex-shrink-0">
                    <ServiceBookingIndicator
                      vehicleRegistration={vehicle.registration}
                      serviceBookings={serviceBookings}
                      className="ml-1"
                    />
                  </div>
                </div>
              </div>

              {/* Status Badge - Minimal */}
              <div className={`inline-flex items-center px-1.5 py-0.5 rounded w-full justify-center ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                <StatusIcon className={`w-2 h-2 mr-1 ${statusConfig.color}`} />
                <span style={{ fontSize: '0.6rem', lineHeight: '1.1' }}>{statusConfig.label}</span>
              </div>

              {/* Make + Model - Single line */}
              <div className="text-center">
                <p className="truncate text-gray-600 dark:text-gray-400" style={{ fontSize: '0.6rem', lineHeight: '1.2' }}>
                  {`${safeString(vehicle.make)} ${safeString(vehicle.model)}`.trim() || t('dashboard.cardsGrid.unknownVehicle')}
                </p>
              </div>

              {/* Size - Minimal */}
              {safeString(vehicle.size) && (
                <div className="text-center">
                  <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 w-full text-center" style={{ fontSize: '0.55rem', lineHeight: '1.1' }}>
                    {safeString(vehicle.size)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
})