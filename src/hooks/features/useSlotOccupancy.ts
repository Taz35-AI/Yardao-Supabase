// src/hooks/features/useSlotOccupancy.ts - Slot Occupancy Management
import { useMemo, useState } from 'react'
import { ServiceBooking } from '@/types/serviceBookings'
import { SlotOccupancy } from '@/types/serviceBookingTypes'
import { calculateSlotOccupancy, getSlotButtonStyle } from '@/utils/serviceBookings/slotHelpers'

export function useSlotOccupancy(
  localSelectedDate: Date | null,
  bookings: ServiceBooking[],
  existingBooking?: ServiceBooking | null,
  isExternalProvider?: boolean,
  // 🛠️ Optional cap from the user's current branch. When supplied, the
  // resulting occupancy entries include isFull / availableBay so the modal
  // can disable saving when no bays are free.
  bayCount?: number
) {
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null)

  // Calculate slot occupancy for the selected date
  const slotOccupancy = useMemo(() => {
    return calculateSlotOccupancy(
      localSelectedDate,
      bookings,
      existingBooking?.id,
      isExternalProvider,
      bayCount,
    )
  }, [localSelectedDate, bookings, existingBooking, isExternalProvider, bayCount])

  // Get slot button styling
  const getButtonStyle = (slotId: string, isSelected: boolean) => {
    return getSlotButtonStyle(slotId, isSelected, slotOccupancy)
  }

  return {
    slotOccupancy,
    hoveredSlot,
    setHoveredSlot,
    getButtonStyle
  }
}