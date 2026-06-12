// src/components/features/deliveries-defleet/DeliveriesDefleetCalendar.tsx
// RESTYLED: Premium UI matching Service Bookings calendar aesthetic
// ALL logic, handlers, state, navigation, and functionality preserved exactly — CSS/layout only
'use client'

import React, { useState, useMemo, forwardRef, useImperativeHandle } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Truck,
  TruckIcon,
  Edit,
  Check,
  Plus,
  X,
} from 'lucide-react'
import { DeliveryDefleelEntry } from './DeliveriesDefleetContent'
import { EntryCard } from './EntryCard'
import { logger } from '@/lib/logger'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeliveriesDefleetCalendarProps {
  entries: DeliveryDefleelEntry[]
  loading: boolean
  onDateSelect: (date: Date) => void
  onEditEntry: (entry: DeliveryDefleelEntry) => void
  onDeleteEntry?: (entryId: string) => void
  onMarkComplete?: (entryId: string) => void
  searchReg?: string
  matchingDates?: string[]
  getEntriesForDate: (date: string) => DeliveryDefleelEntry[]
}

export interface DeliveriesDefleetCalendarRef {
  navigateToDate: (date: Date) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export const DeliveriesDefleetCalendar = forwardRef<DeliveriesDefleetCalendarRef, DeliveriesDefleetCalendarProps>((
  {
    entries,
    loading,
    onDateSelect,
    onEditEntry,
    onDeleteEntry,
    onMarkComplete,
    searchReg = '',
    matchingDates = [],
    getEntriesForDate,
  },
  ref
) => {
  const [currentDate, setCurrentDate]   = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  // Expose navigation method to parent (PRESERVED)
  useImperativeHandle(ref, () => ({
    navigateToDate: (date: Date) => {
      setCurrentDate(new Date(date.getFullYear(), date.getMonth(), 1))
      setSelectedDate(date)
    },
  }))

  // ── Static data ─────────────────────────────────────────────────────────────

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]

  // Day headers — clean flat style matching Service Bookings mini-calendar
  const dayNames = [
    { short: 'Su', full: 'Sunday'    },
    { short: 'Mo', full: 'Monday'    },
    { short: 'Tu', full: 'Tuesday'   },
    { short: 'We', full: 'Wednesday' },
    { short: 'Th', full: 'Thursday'  },
    { short: 'Fr', full: 'Friday'    },
    { short: 'Sa', full: 'Saturday'  },
  ]

  // ── Navigation (PRESERVED) ───────────────────────────────────────────────────

  const goToPreviousMonth = () =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))

  const goToNextMonth = () =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))

  const goToToday = () => {
    const today = new Date()
    setCurrentDate(today)
    setSelectedDate(today)
  }

  // ── Calendar day generation (PRESERVED) ─────────────────────────────────────

  const calendarDays = useMemo(() => {
    const year  = currentDate.getFullYear()
    const month = currentDate.getMonth()

    const firstDay = new Date(year, month, 1)
    const lastDay  = new Date(year, month + 1, 0)

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024

    if (isMobile) {
      // Mobile: current month days only
      const days = []
      for (let day = 1; day <= lastDay.getDate(); day++) {
        days.push(new Date(year, month, day))
      }
      return days
    } else {
      // Desktop: full 6-week grid
      const startDate = new Date(year, month, 1 - firstDay.getDay())
      const days = []
      for (let i = 0; i < 42; i++) {
        days.push(new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i))
      }
      return days
    }
  }, [currentDate])

  // ── Date helpers (ALL PRESERVED) ─────────────────────────────────────────────

  const formatDateString = (date: Date): string => {
    const year  = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day   = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const isToday = (date: Date): boolean =>
    formatDateString(date) === formatDateString(new Date())

  const isCurrentMonth = (date: Date): boolean =>
    date.getMonth() === currentDate.getMonth()

  const isSelected = (date: Date): boolean =>
    selectedDate ? formatDateString(date) === formatDateString(selectedDate) : false

  // ── Grid classes (PRESERVED — mobile vs desktop logic intact) ────────────────

  const getGridClasses = () => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024

    if (isMobile) {
      const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      return {
        header:     'grid grid-cols-7 gap-0.5 mb-1',
        days:       'grid grid-cols-7 gap-0.5',
        emptyStart: firstDay.getDay(),
      }
    }
    return {
      header:     'grid grid-cols-7 gap-1 mb-1',
      days:       'grid grid-cols-7 gap-1',
      emptyStart: 0,
    }
  }

  // ── Text helpers (PRESERVED) ──────────────────────────────────────────────────

  const truncateText = (text: string, maxLength = 9): string => {
    if (!text) return ''
    return text.length > maxLength ? `${text.substring(0, maxLength)}…` : text
  }

  // ── Entry pill colours — clean flat style matching Service Bookings ───────────
  // Delivery  → soft green pill
  // Defleet   → soft red pill
  // Completed → grey strikethrough

  const getEntryPillClass = (operationType: 'delivery' | 'defleet', isCompleted?: boolean): string => {
    if (isCompleted) {
      return 'bg-gray-100 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-600 line-through'
    }
    return operationType === 'delivery'
      ? 'bg-[#025940]/10 dark:bg-[#025940]/25 text-[#025940] dark:text-[#72A68E] border-[#025940]/25 dark:border-[#025940]/50'
      : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/50'
  }

  // ── Side panel entry card colours ────────────────────────────────────────────

  const getPanelCardClass = (operationType: 'delivery' | 'defleet', isCompleted?: boolean): string => {
    if (isCompleted) return 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 opacity-75'
    return operationType === 'delivery'
      ? 'border-[#C5D9D0] dark:border-[#025940]/60 bg-white dark:bg-gray-800/50'
      : 'border-red-100 dark:border-red-900/40 bg-white dark:bg-gray-800/50'
  }

  // ── Event handlers (PRESERVED) ───────────────────────────────────────────────

  const handleDateClick = (date: Date) => {
    logger.log('Date clicked:', date.toDateString(), 'Formatted:', formatDateString(date))
    const isMobile = window.innerWidth < 1024
    setSelectedDate(date)
    if (isMobile) {
      onDateSelect(date)
    }
  }

  const handleAddEntry = (date: Date) => {
    logger.log('Add entry for date:', date.toDateString(), 'Formatted:', formatDateString(date))
    onDateSelect(date)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const gridClasses = getGridClasses()

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

      {/* ══════════════════════════════════════════════════════════════════════
          MAIN CALENDAR — 2/3 width on desktop
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="lg:col-span-2">
        <div className="bg-white dark:bg-gray-800/50 rounded-2xl border border-[#e2e8e5] dark:border-gray-700 overflow-hidden">

          {/* Calendar header — solid forest + lime chip */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#012619]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#b3f243] flex items-center justify-center">
                <Calendar className="w-4 h-4 text-[#012619]" />
              </div>
              <h2 className="text-base font-semibold text-white">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={goToPreviousMonth}
                className="p-1.5 text-white/70 hover:text-white hover:bg-white/15 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={goToToday}
                className="px-3 py-1 text-xs font-semibold text-white/80 hover:text-white hover:bg-white/15 rounded-lg transition-colors border border-white/20"
              >
                Today
              </button>
              <button
                onClick={goToNextMonth}
                className="p-1.5 text-white/70 hover:text-white hover:bg-white/15 rounded-lg transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Calendar grid */}
          <div className="p-3">

            {/* Day name headers — clean, flat, brand-tinted */}
            <div className={`${gridClasses.header}`}>
              {dayNames.map(day => (
                <div
                  key={day.short}
                  title={day.full}
                  className="text-center text-[10px] font-bold uppercase tracking-wide text-[#025940]/70 dark:text-[#72A68E]/70 py-1.5"
                >
                  {day.short}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className={`${gridClasses.days} [&>*]:box-border`}>

              {/* Empty offset cells for mobile month alignment */}
              {Array.from({ length: gridClasses.emptyStart }, (_, i) => (
                <div key={`empty-${i}`} className="h-10 lg:h-[90px] box-border w-full" />
              ))}

              {calendarDays.map((date, index) => {
                const dateStr         = formatDateString(date)
                const dayEntries      = getEntriesForDate(dateStr)
                const entriesCount    = dayEntries.length
                const isCurrentM      = isCurrentMonth(date)
                const isTodayDate     = isToday(date)
                const isSelectedDate  = isSelected(date)
                const hasMatchingReg  = !!searchReg && matchingDates.includes(dateStr)

                return (
                  <div
                    key={index}
                    onClick={() => handleDateClick(date)}
                    className={`
                      group relative cursor-pointer rounded-xl border transition-all duration-150
                      h-10 lg:h-[90px] lg:flex lg:flex-col
                      box-border w-full
                      ${!isCurrentM
                        ? 'border-transparent bg-gray-50/40 dark:bg-gray-800/20'
                        : isTodayDate
                          ? 'border-[#025940] bg-[#f0f7f4] dark:bg-[#025940]/15'
                          : 'border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800/30 hover:border-[#72A68E] hover:bg-[#f0f7f4] dark:hover:bg-[#025940]/10'
                      }
                      ${isSelectedDate ? 'ring-2 ring-[#025940] dark:ring-[#72A68E] ring-offset-1 shadow-md' : ''}
                      ${hasMatchingReg && isCurrentM ? 'ring-2 ring-orange-400 ring-offset-1 bg-orange-50 dark:bg-orange-900/15 border-orange-200 dark:border-orange-700' : ''}
                    `}
                  >
                    {/* ── MOBILE: compact date number + count dot ── */}
                    <div className="lg:hidden flex items-center justify-center h-full">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`text-xs font-semibold leading-none ${
                          !isCurrentM   ? 'text-gray-300 dark:text-gray-600' :
                          isTodayDate   ? 'text-[#025940] dark:text-[#72A68E] font-black' :
                                          'text-gray-700 dark:text-gray-300'
                        }`}>
                          {date.getDate()}
                        </span>
                        {entriesCount > 0 && isCurrentM && (
                          <div className="w-4 h-4 rounded-full bg-[#025940] dark:bg-[#72A68E] text-white text-[8px] font-bold flex items-center justify-center">
                            {entriesCount}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── DESKTOP: full cell with date + pills ── */}
                    <div className="hidden lg:flex lg:flex-col h-full p-2">

                      {/* Date number row */}
                      <div className="flex items-start justify-between mb-1.5 flex-shrink-0">
                        <div className="flex flex-col items-start">
                          <span className={`text-sm font-bold leading-none ${
                            !isCurrentM   ? 'text-gray-300 dark:text-gray-600' :
                            isTodayDate   ? 'text-[#025940] dark:text-[#72A68E]' :
                                            'text-gray-800 dark:text-gray-200'
                          }`}>
                            {date.getDate()}
                          </span>
                          {/* "Today" label — matches Service Bookings */}
                          {isTodayDate && (
                            <span className="text-[8px] font-bold text-[#025940] dark:text-[#72A68E] uppercase tracking-wide leading-none mt-0.5">
                              Today
                            </span>
                          )}
                        </div>

                        {/* Count badge */}
                        {entriesCount > 0 && isCurrentM && (
                          <span className="text-[10px] font-bold bg-[#025940] dark:bg-[#72A68E] text-white dark:text-[#012619] rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 shadow-sm">
                            {entriesCount}
                          </span>
                        )}
                      </div>

                      {/* Entry pills */}
                      <div className="flex-1 overflow-hidden min-h-0">
                        <div className="space-y-0.5 overflow-y-auto h-full scrollbar-none">
                          {dayEntries.slice(0, 5).map((entry, idx) => {
                            const isMatch = !!searchReg && entry.registration?.toLowerCase().includes(searchReg.toLowerCase())
                            return (
                              <div
                                key={idx}
                                title={`${entry.operationType.toUpperCase()} · ${entry.registration} ${entry.make} ${entry.model}${entry.isCompleted ? ' (Completed)' : ''}`}
                                className={`
                                  text-[10px] font-semibold px-1.5 py-0.5 rounded border leading-tight truncate
                                  transition-all duration-150
                                  ${getEntryPillClass(entry.operationType, entry.isCompleted)}
                                  ${isMatch ? 'ring-1 ring-orange-400 shadow-sm' : ''}
                                `}
                              >
                                {/* Icon prefix */}
                                <span className="mr-0.5">
                                  {entry.operationType === 'delivery' ? '↓' : '↑'}
                                </span>
                                {truncateText(entry.registration)}
                              </div>
                            )
                          })}

                          {dayEntries.length > 5 && (
                            <div className="text-[9px] font-semibold text-[#72A68E] dark:text-[#72A68E]/70 pl-1">
                              +{dayEntries.length - 5} more
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Hover add button */}
                      {isCurrentM && (
                        <button
                          onClick={e => { e.stopPropagation(); handleAddEntry(date) }}
                          className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-md bg-[#025940] text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-sm"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="px-4 pb-3 flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500 dark:text-gray-400">
              <div className="w-2.5 h-2.5 rounded-sm bg-[#025940]/10 border border-[#025940]/25" />
              Delivery
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500 dark:text-gray-400">
              <div className="w-2.5 h-2.5 rounded-sm bg-red-50 border border-red-200" />
              Defleet
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500 dark:text-gray-400">
              <div className="w-2.5 h-2.5 rounded-sm bg-gray-100 border border-gray-200" />
              Completed
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          DAY DETAIL PANEL — 1/3 width on desktop (matches Service Bookings mini panel)
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:block">
        <div className="bg-white dark:bg-gray-800/50 rounded-2xl border border-[#e2e8e5] dark:border-gray-700 overflow-hidden sticky top-4">

          {/* Panel header — solid forest + lime chip */}
          <div className="px-4 py-3 bg-[#012619]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#b3f243] flex items-center justify-center flex-shrink-0">
                <Calendar className="w-4 h-4 text-[#012619]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white leading-tight truncate">
                  {selectedDate
                    ? selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
                    : 'Select a date'
                  }
                </p>
                {selectedDate && (
                  <p className="text-[10px] text-white/60 mt-0.5">
                    {(() => {
                      const count = getEntriesForDate(formatDateString(selectedDate)).length
                      return count === 0 ? 'No entries' : `${count} entr${count !== 1 ? 'ies' : 'y'}`
                    })()}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="p-4">
            {!selectedDate ? (
              /* Empty state — no date selected */
              <div className="text-center py-10">
                <div className="w-12 h-12 rounded-full bg-[#C5D9D0]/40 dark:bg-[#025940]/20 flex items-center justify-center mx-auto mb-3">
                  <Calendar className="w-6 h-6 text-[#72A68E]" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                  Click a date to see entries
                </p>
              </div>
            ) : (
              <div className="space-y-3">

                {/* Add entry button */}
                <button
                  onClick={() => handleAddEntry(selectedDate)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 bg-[#025940] hover:bg-[#012619] text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Entry
                </button>

                {/* Entries list */}
                {getEntriesForDate(formatDateString(selectedDate)).length === 0 ? (
                  <div className="text-center py-6">
                    <div className="w-10 h-10 rounded-xl bg-[#f0f7f4] dark:bg-[#025940]/20 border border-[#e2e8e5] dark:border-gray-700 flex items-center justify-center mx-auto mb-2">
                      <Calendar className="w-5 h-5 text-[#72A68E]" />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">No entries for this day</p>
                  </div>
                ) : (
                  // Use EntryCard so the fleet-add prompt works on desktop too
                  getEntriesForDate(formatDateString(selectedDate)).map((entry, idx) => (
                    <EntryCard
                      key={entry.id || idx}
                      entry={entry}
                      onEdit={() => onEditEntry(entry)}
                      onDelete={(entryId) => onDeleteEntry && onDeleteEntry(entryId)}
                      onMarkComplete={onMarkComplete}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

DeliveriesDefleetCalendar.displayName = 'DeliveriesDefleetCalendar'

export default DeliveriesDefleetCalendar