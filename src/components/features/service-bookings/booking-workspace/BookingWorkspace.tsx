// src/components/features/service-bookings/booking-workspace/BookingWorkspace.tsx
// Top-level 3-column shell rendered by ServiceBookingsContent when the
// user clicks the "+" Add Booking button. Replaces the modal but keeps
// every other view (Today / Upcoming / Calendar) intact.
//
// Layout:
//   ┌──────────────┬──────────────────────────────┬─────────────────────┐
//   │ Form panel   │ Workshop schedule grid       │ Rules / info cards  │
//   │ (left)       │ (centre — Bay × Time)        │ (right)             │
//   └──────────────┴──────────────────────────────┴─────────────────────┘
// On < lg the columns stack vertically.
'use client'

import React, { useMemo, useState } from 'react'
import { Vehicle } from '@/lib/firestore'
import { ServiceBooking } from '@/types/serviceBookings'
import { Customer } from '@/types/customer'
import type { PartsStatus } from '@/lib/utils/partsStatus'
import { useT } from '@/lib/i18n'

import { BookingFormPanel } from './BookingFormPanel'
import { WorkshopScheduleGrid, FormSelection } from './WorkshopScheduleGrid'
import { WorkshopGridFilters } from './WorkshopGridFilters'

export interface BookingWorkspaceProps {
  /** All bookings in the org (already merged with garage entries). */
  bookings: ServiceBooking[]
  /** Fleet vehicles for the registration autocomplete. */
  vehicles: Vehicle[]
  /** Branch bay cap. */
  bayCount: number
  /** Date the user was viewing when they hit "+". */
  initialDate: Date
  /** Save handler for CREATE mode — wired straight to
   *  ServiceBookingsContent.handleCreateBooking so the existing bay-conflict
   *  modal + "all bays full" guard still run. */
  onCreate: (
    booking: Omit<
      ServiceBooking,
      'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'
    >,
  ) => Promise<boolean>
  /** When set, the workspace is in EDIT mode — the form prefills from this
   *  booking (minus the slot, which the user re-picks on the grid) and
   *  Save calls `onUpdate` instead of `onCreate`. */
  editingBooking?: ServiceBooking | null
  /** Save handler for EDIT mode — required when editingBooking is set. */
  onUpdate?: (
    booking: Omit<
      ServiceBooking,
      'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'
    >,
  ) => Promise<boolean>
  /** "Cancel" / "X" → return the page to its previous view. */
  onClose: () => void
  /** Click on an existing booking block in the grid → open the details
   *  modal (the parent owns the modal). */
  onBookingEdit?: (booking: ServiceBooking) => void
  /** Drag/resize commit handler for blocks in the workshop grid. The parent
   *  is responsible for calling updateBooking() and surfacing errors. When
   *  omitted, the grid is read-only. */
  onBookingUpdate?: (
    bookingId: string,
    changes: {
      serviceBay?: number
      timeSlot?: string
      slotCount?: number
      partsStatus?: PartsStatus
    },
  ) => void
  /** Customer list — forwarded to the grid so blocks can display the
   *  matched customer's preferred notes inline. */
  customers?: Customer[]
}

export function BookingWorkspace({
  bookings,
  vehicles,
  bayCount,
  initialDate,
  editingBooking,
  onCreate,
  onUpdate,
  onClose,
  onBookingEdit,
  onBookingUpdate,
  customers,
}: BookingWorkspaceProps) {
  const t = useT()
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate)
  const [bayFilter, setBayFilter] = useState<number | 'all'>('all')
  const [mechanicFilter, setMechanicFilter] = useState<string | 'all'>('all')
  const [partsFilter, setPartsFilter] = useState<PartsStatus | 'all'>('all')
  // Cell-pick state from the grid. Single click = slotCount 1; drag-select
  // across N consecutive cells = slotCount N. The form's DurationSection
  // is gone, so the slot range is the *only* duration source now.
  const [pendingCell, setPendingCell] = useState<{
    bay: number
    timeSlot: string
    slotCount: number
  } | null>(null)
  const [formSelection, setFormSelection] = useState<FormSelection>({
    serviceBay: 1,
    timeSlot: null,
    slotCount: 1,
    isExternalProvider: false,
  })

  // While EDITING, draw the edited booking at the form's live position
  // (bay / slot / span) instead of its stale Firestore values — so a
  // drag/resize is visible immediately and matches what Save will write.
  // (The booking is also excludeBookingId'd so it can't conflict with
  // itself.) Other bookings and create mode are untouched.
  const displayBookings = useMemo(() => {
    if (!editingBooking) return bookings
    return bookings.map((b) => {
      if (b.id !== editingBooking.id) return b
      return {
        ...b,
        serviceBay: formSelection.serviceBay ?? b.serviceBay,
        timeSlot: formSelection.timeSlot ?? b.timeSlot,
        slotCount: formSelection.slotCount ?? b.slotCount,
      }
    })
  }, [bookings, editingBooking, formSelection])

  return (
    // 2-col layout: form (left, ~400px) + workshop grid (right, fills the
    // rest). The previous "rules / how-overlap-is-prevented" right rail
    // was removed — the grid + the form's inline availability checklist
    // cover the same ground without taking screen real estate.
    <div className="grid gap-4 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
      {/* LEFT — booking form */}
      <div className="min-h-[600px] lg:max-h-[calc(100vh-220px)]">
        <BookingFormPanel
          bookings={bookings}
          vehicles={vehicles}
          bayCount={bayCount}
          initialDate={initialDate}
          editingBooking={editingBooking}
          pendingCell={pendingCell}
          onSelectionChange={setFormSelection}
          onDateChange={setSelectedDate}
          onSubmit={onCreate}
          onUpdate={onUpdate}
          onCancel={onClose}
        />
      </div>

      {/* CENTRE — workshop schedule grid */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col min-h-[600px] lg:max-h-[calc(100vh-220px)] overflow-hidden">
        <div className="px-4 pt-3 pb-2">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">
            {t('serviceBookings.workspace.scheduleHeading')}
          </h2>
        </div>
        <WorkshopGridFilters
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          bayCount={bayCount}
          bayFilter={bayFilter}
          onBayFilterChange={setBayFilter}
          mechanicFilter={mechanicFilter}
          onMechanicFilterChange={setMechanicFilter}
          partsFilter={partsFilter}
          onPartsFilterChange={setPartsFilter}
        />
        <div className="flex-1 overflow-auto">
          <WorkshopScheduleGrid
            selectedDate={selectedDate}
            bookings={displayBookings}
            bayCount={bayCount}
            bayFilter={bayFilter}
            mechanicFilter={mechanicFilter}
            partsFilter={partsFilter}
            formSelection={formSelection}
            onCellClick={(bay, timeSlot, slotCount) =>
              setPendingCell({ bay, timeSlot, slotCount: slotCount ?? 1 })
            }
            onBookingClick={onBookingEdit}
            onBookingUpdate={(bookingId, changes) => {
              // 🐛 FIX (revert-on-save): in EDIT mode, dragging/resizing
              // the booking being edited must feed the FORM (so the
              // form's Save persists it) — NOT write Firestore now. The
              // immediate write was being clobbered moments later by the
              // form's Save submitting the stale prefilled slot.
              if (editingBooking && bookingId === editingBooking.id) {
                setPendingCell({
                  bay: changes.serviceBay ?? formSelection.serviceBay ?? 1,
                  timeSlot: changes.timeSlot ?? formSelection.timeSlot ?? '',
                  slotCount: changes.slotCount ?? formSelection.slotCount ?? 1,
                })
                return
              }
              onBookingUpdate?.(bookingId, changes)
            }}
            customers={customers}
            excludeBookingId={editingBooking?.id}
            enableTouchRangeSelect
          />
        </div>
      </div>

    </div>
  )
}

export default BookingWorkspace
