// src/utils/serviceBookings/slotHelpers.ts - Slot Occupancy & Styling Logic
import { ServiceBooking } from '@/types/serviceBookings'
import { SlotOccupancy } from '@/types/serviceBookingTypes'
import { TIME_SLOTS } from '@/components/features/service-bookings/ServiceBookingsContent'
import { formatDate } from './dateHelpers'

// 🕐 Multi-slot helpers ─────────────────────────────────────────────────────
// `slotCount` defaults to 1; existing single-slot bookings have no field set.
//
// IMPORTANT: we do this lookup lazily inside the function rather than
// pre-computing a Record<string, number> at module load. `TIME_SLOTS` lives
// in ServiceBookingsContent.tsx, which itself imports from this file —
// touching `TIME_SLOTS` at top level here triggers the circular import
// before `TIME_SLOTS` finishes initializing.

const ATOMIC_SLOT_MINUTES = 30

/** Parse the duration encoded in a slot id like "08:30-10:00" → 90 (mins).
 *  Returns null when the id isn't HH:MM-HH:MM (e.g. "EXTERNAL", "CUSTOM"). */
function parseSlotIdDurationMins(slotId: string): number | null {
  const m = slotId?.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/)
  if (!m) return null
  const start = Number(m[1]) * 60 + Number(m[2])
  const end = Number(m[3]) * 60 + Number(m[4])
  return end > start ? end - start : null
}

/** Lookup a slot id in TIME_SLOTS with a graceful fallback so legacy
 *  90-min IDs (e.g. "08:30-10:00") still resolve after we drop atomic
 *  granularity to 30 minutes. */
export function getSlotIndex(slotId: string): number {
  const direct = TIME_SLOTS.findIndex(s => s.id === slotId)
  if (direct >= 0) return direct
  // Compat: match by start time only (e.g. "08:30-10:00" → "08:30-09:00")
  const m = slotId?.match(/^(\d{2}:\d{2})/)
  if (!m) return -1
  return TIME_SLOTS.findIndex(s => s.startTime === m[1])
}

/** How many atomic slots a booking actually occupies. New bookings carry
 *  the answer in `slotCount`. Legacy bookings stored a 90-min slot ID with
 *  `slotCount = 1` — we infer the true span from the ID's duration so they
 *  render correctly without a Firestore migration. */
export function getEffectiveSlotCount(booking: { timeSlot: string; slotCount?: number }): number {
  const idDuration = parseSlotIdDurationMins(booking.timeSlot)
  // Modern booking: atomic-sized id → trust slotCount.
  if (idDuration === null || idDuration === ATOMIC_SLOT_MINUTES) {
    return Math.max(1, booking.slotCount ?? 1)
  }
  // Legacy booking with a wider id (e.g. 90-min) → derive from the id.
  return Math.max(1, Math.round(idDuration / ATOMIC_SLOT_MINUTES))
}

/** Returns the slot ids the booking spans, or [] if its start slot is unknown. */
export function getBookingSlotIds(booking: { timeSlot: string; slotCount?: number }): string[] {
  const startIdx = getSlotIndex(booking.timeSlot)
  if (startIdx < 0) return []
  const span = getEffectiveSlotCount(booking)
  const ids: string[] = []
  for (let i = 0; i < span; i++) {
    const slot = TIME_SLOTS[startIdx + i]
    if (!slot) break
    ids.push(slot.id)
  }
  return ids
}

/** True when the booking's slot range includes `slotId`. */
export function bookingCoversSlot(
  booking: { timeSlot: string; slotCount?: number },
  slotId: string,
): boolean {
  const startIdx = getSlotIndex(booking.timeSlot)
  if (startIdx < 0) return false
  const targetIdx = getSlotIndex(slotId)
  if (targetIdx < 0) return false
  const span = getEffectiveSlotCount(booking)
  return targetIdx >= startIdx && targetIdx < startIdx + span
}

/** End-time string for display (e.g. "16:00") given a start slot + span. */
export function getBookingEndTime(timeSlot: string, slotCount?: number): string {
  const startIdx = getSlotIndex(timeSlot)
  if (startIdx < 0) return ''
  const span = getEffectiveSlotCount({ timeSlot, slotCount })
  const endIdx = Math.min(startIdx + span - 1, TIME_SLOTS.length - 1)
  return TIME_SLOTS[endIdx]?.endTime || ''
}

/**
 * Calculate slot occupancy for a specific date.
 *
 * 🛠️ When `bayCount` is supplied (the branch's configured number of ramps),
 * occupancy is reported in cap-aware form:
 *   - `availableBay` is the lowest unoccupied bay number in [1, bayCount].
 *   - `isFull` is true when every bay in [1, bayCount] is taken.
 *   - `nextAvailableBay` is kept in sync with `availableBay` for callers that
 *     still read it directly. When `isFull`, it equals `bayCount` (the modal
 *     can use it for messaging — "all N bays occupied" — without going past).
 *
 * Without `bayCount` the original unbounded behaviour is preserved exactly.
 */
export const calculateSlotOccupancy = (
  selectedDate: Date | null,
  bookings: ServiceBooking[],
  existingBookingId?: string,
  isExternalProvider?: boolean,
  bayCount?: number
): Map<string, SlotOccupancy> => {
  if (!selectedDate || isExternalProvider) {
    return new Map<string, SlotOccupancy>()
  }

  const selectedDateStr = formatDate(selectedDate)
  const occupancyMap = new Map<string, SlotOccupancy>()
  const cap = typeof bayCount === 'number' && bayCount >= 1 ? Math.floor(bayCount) : undefined

  TIME_SLOTS.forEach(slot => {
    // 🕐 Multi-slot aware: a booking that started at an earlier slot with
    // slotCount > 1 still occupies this slot. We match on "booking covers
    // this slot id" rather than "booking starts here".
    const slotBookings = bookings.filter(b =>
      b.date === selectedDateStr &&
      b.status !== 'cancelled' &&
      !b.isExternalProvider &&
      b.id !== existingBookingId && // Exclude current booking if editing
      bookingCoversSlot(b, slot.id)
    )

    const baysInUse = slotBookings.map(b => b.serviceBay || 1)
    const maxBay = Math.max(...baysInUse, 0)

    if (cap === undefined) {
      // Legacy unbounded behaviour
      occupancyMap.set(slot.id, {
        slotId: slot.id,
        bookings: slotBookings,
        baysInUse,
        nextAvailableBay: maxBay + 1,
      })
      return
    }

    // Cap-aware: walk 1..cap and pick the first bay not in use.
    const usedSet = new Set(baysInUse)
    let firstFree: number | null = null
    for (let bay = 1; bay <= cap; bay++) {
      if (!usedSet.has(bay)) {
        firstFree = bay
        break
      }
    }
    const isFull = firstFree === null
    occupancyMap.set(slot.id, {
      slotId: slot.id,
      bookings: slotBookings,
      baysInUse,
      // Mirror availableBay into nextAvailableBay so existing readers keep
      // working. When full, surface the cap so messaging reads "all N bays".
      nextAvailableBay: firstFree ?? cap,
      availableBay: firstFree,
      isFull,
      bayCount: cap,
    })
  })

  return occupancyMap
}

/**
 * Get slot button styling based on occupancy and selection state.
 *
 * 🛠️ Cap-aware: when the slot's `isFull` flag is set (every bay in the
 * branch's cap is booked) we render red regardless of raw booking count, so
 * staff immediately see they can't squeeze another booking in. When `bayCount`
 * is set but the slot isn't full yet, we tier the colour by % occupancy.
 * Without a cap (legacy callers) the original count-based heuristic applies.
 */
export const getSlotButtonStyle = (
  slotId: string,
  isSelected: boolean,
  slotOccupancy: Map<string, SlotOccupancy>
): string => {
  const occupancy = slotOccupancy.get(slotId)
  const bookingCount = occupancy?.bookings.length || 0

  if (isSelected) {
    return 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100 shadow-lg ring-2 ring-blue-500'
  }

  if (bookingCount === 0) {
    return 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 bg-white dark:bg-gray-800'
  }

  // Cap-aware path
  if (occupancy?.bayCount && typeof occupancy.bayCount === 'number') {
    if (occupancy.isFull) {
      return 'border-red-500 dark:border-red-500 bg-red-50 dark:bg-red-900/30 hover:border-red-600 dark:hover:border-red-400 ring-1 ring-red-400/40'
    }
    const ratio = bookingCount / occupancy.bayCount
    if (ratio >= 0.66) {
      return 'border-orange-400 dark:border-orange-600 bg-orange-50 dark:bg-orange-900/20 hover:border-orange-500 dark:hover:border-orange-400'
    }
    return 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 hover:border-amber-500 dark:hover:border-amber-400'
  }

  // Legacy unbounded path — preserve original count-based heuristic.
  if (bookingCount === 1) {
    return 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 hover:border-amber-500 dark:hover:border-amber-400'
  }
  if (bookingCount === 2) {
    return 'border-orange-400 dark:border-orange-600 bg-orange-50 dark:bg-orange-900/20 hover:border-orange-500 dark:hover:border-orange-400'
  }
  return 'border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/20 hover:border-red-500 dark:hover:border-red-400'
}

/**
 * Get booking count for a slot
 */
export const getSlotBookingCount = (
  slotId: string,
  slotOccupancy: Map<string, SlotOccupancy>
): number => {
  const occupancy = slotOccupancy.get(slotId)
  return occupancy?.bookings.length || 0
}

/**
 * Get next available bay for a slot
 */
export const getNextAvailableBay = (
  slotId: string,
  slotOccupancy: Map<string, SlotOccupancy>
): number => {
  const occupancy = slotOccupancy.get(slotId)
  return occupancy?.nextAvailableBay || 1
}