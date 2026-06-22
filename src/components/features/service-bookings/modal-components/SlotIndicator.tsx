// src/components/features/service-bookings/modal-components/SlotIndicator.tsx
'use client'

import React from 'react'
import { Users, Car } from 'lucide-react'
import { getSlotButtonStyle } from '@/utils/serviceBookings/slotHelpers'
import { getBayName } from '@/utils/serviceBookings/bayLabels'
import { SlotOccupancy } from '@/types/serviceBookingTypes'
import { useT } from '@/lib/i18n'

interface SlotIndicatorProps {
  bookingCount: number
  isSelected: boolean
  slotLabel: string
  nextAvailableBay?: number
  bookings?: any[]
  isHovered?: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onClick?: () => void
  slotOccupancy: Map<string, SlotOccupancy>
  slotId: string
  /** Optional custom bay names (display only). Index 0 = bay 1. */
  bayNames?: string[]
}

export function SlotIndicator({
  bookingCount,
  isSelected,
  slotLabel,
  nextAvailableBay,
  bookings = [],
  isHovered = false,
  onMouseEnter,
  onMouseLeave,
  onClick,
  slotOccupancy,
  slotId,
  bayNames
}: SlotIndicatorProps) {
  const t = useT()
  const buttonStyle = getSlotButtonStyle(slotId, isSelected, slotOccupancy)

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`relative px-1.5 py-1.5 border rounded-lg text-center transition-all text-xs ${buttonStyle}`}
    >
      <div className="font-medium text-[11px] leading-tight">{slotLabel}</div>

      {/* Booking count indicator. When the branch's bay cap is known we show
          "X / Y" so the user instantly sees how full the slot is. */}
      {(() => {
        const occ = slotOccupancy.get(slotId)
        const cap = occ?.bayCount
        return bookingCount > 0 ? (
          <div className="flex items-center justify-center space-x-0.5 mt-0.5">
            <Users className="w-2.5 h-2.5" />
            <span className="text-[10px] font-semibold">
              {typeof cap === 'number'
                ? `${bookingCount} / ${cap}`
                : t('serviceBookings.slotIndicator.bookingCount', { count: bookingCount })}
            </span>
          </div>
        ) : null
      })()}

      {/* Bay info on selection. When the slot is full we show that instead
          of suggesting a non-existent bay number. */}
      {isSelected && bookingCount > 0 && (() => {
        const occ = slotOccupancy.get(slotId)
        if (occ?.isFull) {
          return (
            <div className="text-[10px] text-red-700 dark:text-red-300 mt-0.5 font-semibold">
              {t('serviceBookings.slotIndicator.allBaysBooked')}
            </div>
          )
        }
        if (nextAvailableBay) {
          const namedBay = getBayName(bayNames, nextAvailableBay)
          return (
            <div className="text-[10px] text-blue-700 dark:text-blue-300 mt-0.5">
              {namedBay
                ? t('serviceBookings.slotIndicator.bayWillBeUsedNamed', { bay: namedBay })
                : t('serviceBookings.slotIndicator.bayWillBeUsed', { nextAvailableBay })}
            </div>
          )
        }
        return null
      })()}
      
      {/* Hover tooltip with booking details */}
      {isHovered && bookingCount > 0 && (
        <div className="absolute z-10 bottom-full left-1/2 transform -translate-x-1/2 mb-2 p-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg shadow-lg min-w-[200px] text-xs">
          <div className="font-semibold mb-1">{t('serviceBookings.slotIndicator.currentBookings')}</div>
          {bookings.map((b, idx) => {
            const namedBay = getBayName(bayNames, b.serviceBay || 1)
            return (
              <div key={idx} className="flex items-center space-x-1">
                <Car className="w-3 h-3" />
                <span>
                  {namedBay
                    ? `${namedBay}: ${b.registration}`
                    : t('serviceBookings.slotIndicator.bayLine', { bay: b.serviceBay || 1, registration: b.registration })}
                </span>
              </div>
            )
          })}
          <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
            <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900 dark:border-t-gray-700"></div>
          </div>
        </div>
      )}
    </button>
  )
}