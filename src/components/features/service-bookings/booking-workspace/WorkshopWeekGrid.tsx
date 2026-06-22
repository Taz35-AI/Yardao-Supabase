// src/components/features/service-bookings/booking-workspace/WorkshopWeekGrid.tsx
// Week view (tablet/desktop only — never rendered on phones; see the
// >=768px guard in ServiceBookingsContent).
//
// It is literally the day's WorkshopScheduleGrid rendered 7 times side
// by side, narrowed, in a row. The window is a rolling 7 days STARTING
// at the selected/current day (day 1 = today by default).
//
// Navigation: NO scrollbar — grab-and-drag the area to pan horizontally
// (cursor turns into a hand). Each grid is passed interactive={false}
// so the cells never capture the pointer and the whole strip pans
// cleanly. View-only: single-click does nothing; DOUBLE-CLICK a booking
// to edit it; click a day header to drop into the full editable day.
'use client'

import React, { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ServiceBooking } from '@/types/serviceBookings'
import { formatDate } from '@/utils/serviceBookings/dateHelpers'
import { WorkshopScheduleGrid } from './WorkshopScheduleGrid'
import type { PartsStatus } from '@/lib/utils/partsStatus'

export interface WorkshopWeekGridProps {
  selectedDate: Date
  bookings: ServiceBooking[]
  bayCount: number
  bayNames?: string[]
  mechanicFilter: string | 'all'
  partsFilter: PartsStatus | 'all'
  /** Week nav (prev/next/today) — change the date, STAY in week view. */
  onPickDate: (date: Date) => void
  /** Click a day header — change the date AND drop into the day grid. */
  onOpenDay: (date: Date) => void
  /** Double-click a booking → edit that specific booking. */
  onBookingEdit?: (booking: ServiceBooking) => void
}

const DAY_W = 340

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

// Inert form selection — week view never drives the create-form highlight.
const NO_SELECTION = {
  serviceBay: null,
  timeSlot: null,
  slotCount: 1,
  isExternalProvider: false,
} as const

export function WorkshopWeekGrid({
  selectedDate,
  bookings,
  bayCount,
  bayNames,
  mechanicFilter,
  partsFilter,
  onPickDate,
  onOpenDay,
  onBookingEdit,
}: WorkshopWeekGridProps) {
  // Rolling 7-day window: day 1 = the selected/current day.
  const weekStart = useMemo(() => startOfDay(selectedDate), [selectedDate])
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )
  const today = new Date()

  // ── Grab-and-drag horizontal panning ─────────────────────────────────
  // No scrollbar: press and drag the strip to pan. We do NOT setPointer-
  // Capture (so a booking double-click still reaches the block) and the
  // grids are interactive={false} so their cells never capture either.
  const bodyRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{ startX: number; startScroll: number } | null>(null)
  const [grabbing, setGrabbing] = useState(false)

  const onPanDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!bodyRef.current) return
    panRef.current = {
      startX: e.clientX,
      startScroll: bodyRef.current.scrollLeft,
    }
    setGrabbing(true)
  }
  const onPanMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = panRef.current
    if (!p || !bodyRef.current) return
    bodyRef.current.scrollLeft = p.startScroll - (e.clientX - p.startX)
  }
  const endPan = () => {
    panRef.current = null
    setGrabbing(false)
  }

  const weekLabel = `${days[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
  const totalWidth = days.length * DAY_W

  return (
    <div className="flex flex-col h-full">
      {/* Week nav */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-1.5 border-b border-gray-100 dark:border-gray-700">
        <span className="text-xs font-bold text-gray-700 dark:text-gray-200 tabular-nums">
          {weekLabel}{' '}
          <span className="font-medium text-gray-400 dark:text-gray-500">
            · drag to scroll · double-click a booking to edit
          </span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPickDate(addDays(selectedDate, -7))}
            className="p-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            aria-label="Previous 7 days"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onPickDate(new Date())}
            className="px-2.5 py-1 text-xs font-bold rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => onPickDate(addDays(selectedDate, 7))}
            className="p-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            aria-label="Next 7 days"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 7 narrowed day grids — grab & drag to pan, no scrollbar. */}
      <div
        ref={bodyRef}
        onPointerDown={onPanDown}
        onPointerMove={onPanMove}
        onPointerUp={endPan}
        onPointerLeave={endPan}
        onPointerCancel={endPan}
        className={`flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          grabbing ? 'cursor-grabbing select-none' : 'cursor-grab'
        }`}
      >
        <div className="flex h-full" style={{ width: totalWidth }}>
          {days.map((day) => {
            const dateStr = formatDate(day)
            const count = bookings.filter(
              (b) => b.date === dateStr && b.status !== 'cancelled',
            ).length
            const isToday = isSameDay(day, today)
            const isSelected = isSameDay(day, selectedDate)

            return (
              <div
                key={dateStr}
                style={{ width: DAY_W }}
                className={`flex flex-col flex-shrink-0 border-r border-gray-200 dark:border-gray-700 ${
                  isSelected ? 'ring-1 ring-inset ring-[#025940]/30' : ''
                }`}
              >
                {/* Day header — click to open this day in the editable grid */}
                <button
                  type="button"
                  onClick={() => onOpenDay(day)}
                  className="text-left px-3 py-2 border-b border-gray-200 dark:border-gray-700 hover:bg-[#025940]/[0.06] dark:hover:bg-[#72A68E]/15 transition-colors flex items-center justify-between gap-2"
                  title="Open this day to edit"
                >
                  <span className="min-w-0">
                    <span
                      className={`text-[11px] font-black uppercase tracking-wide ${
                        isToday
                          ? 'text-[#025940] dark:text-[#72A68E]'
                          : 'text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {day.toLocaleDateString('en-GB', { weekday: 'short' })}
                    </span>{' '}
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">
                      {day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 flex-shrink-0">
                    {isToday && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#b3f243] text-[#012619]">
                        TODAY
                      </span>
                    )}
                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                      {count === 0 ? '—' : `${count} booking${count !== 1 ? 's' : ''}`}
                    </span>
                  </span>
                </button>

                {/* The exact day grid — view-only & non-interactive so the
                    strip pans cleanly. Double-click a block to edit it. */}
                <div className="flex-1 min-h-0">
                  <WorkshopScheduleGrid
                    selectedDate={day}
                    bookings={bookings}
                    bayCount={bayCount}
                    bayNames={bayNames}
                    bayFilter="all"
                    mechanicFilter={mechanicFilter}
                    partsFilter={partsFilter}
                    formSelection={NO_SELECTION}
                    onCellClick={() => {}}
                    onBookingDoubleClick={onBookingEdit}
                    interactive={false}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default WorkshopWeekGrid
