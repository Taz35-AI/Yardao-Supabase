// src/components/features/service-bookings/modal-sections/TimeSlotSection.tsx
'use client'

import React, { useState } from 'react'
import { Clock, PenLine } from 'lucide-react'
import { TimeSlotSectionProps } from '@/types/serviceBookingTypes'
import { TIME_SLOTS } from '@/components/features/service-bookings/ServiceBookingsContent'
import { SlotIndicator } from '../modal-components/SlotIndicator'
import { getSlotIndex, getBookingEndTime } from '@/utils/serviceBookings/slotHelpers'
import { useT } from '@/lib/i18n'

const CUSTOM_SLOT_ID = 'CUSTOM'

export function TimeSlotSection({
  selectedDate,
  selectedTimeSlot,
  onTimeSlotSelect,
  slotOccupancy,
  existingBooking,
  error,
  slotCount,
  onSlotCountChange,
  bayNames,
}: TimeSlotSectionProps) {
  const t = useT()
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null)

  // 🕐 Multi-slot mode: enabled when the parent provided slotCount + handler.
  // In single-slot mode (existing callers) the picker behaves exactly as
  // before — clicking a slot selects only that slot.
  const isMultiSlotMode =
    typeof slotCount === 'number' && typeof onSlotCountChange === 'function'
  const span = isMultiSlotMode ? Math.max(1, slotCount as number) : 1

  // Slot indices for the currently-selected range (multi-slot mode only).
  const startIdx = isMultiSlotMode ? getSlotIndex(selectedTimeSlot) : -1
  const endIdx = startIdx >= 0 ? startIdx + span - 1 : -1

  // ── Range-aware click handler ────────────────────────────────────────────
  // - If there's no current selection, clicking a slot starts the range at 1.
  // - If span === 1, clicking a different slot extends the range to cover
  //   the path from current start to clicked slot.
  // - If span > 1 already, clicking inside or on an edge resets to a single
  //   slot at the click position. Clicking before/after the existing range
  //   extends it to that slot.
  const handleSlotClick = (slotId: string) => {
    if (!isMultiSlotMode) {
      onTimeSlotSelect(slotId)
      return
    }

    const clickIdx = getSlotIndex(slotId)
    if (clickIdx < 0) {
      onTimeSlotSelect(slotId)
      onSlotCountChange?.(1)
      return
    }

    // No valid current start → start fresh
    if (startIdx < 0) {
      onTimeSlotSelect(slotId)
      onSlotCountChange?.(1)
      return
    }

    if (span === 1) {
      // Second-click extends the range from current start to clicked slot
      if (clickIdx === startIdx) return // same slot, no-op
      if (clickIdx > startIdx) {
        onSlotCountChange?.(clickIdx - startIdx + 1)
      } else {
        onTimeSlotSelect(slotId)
        onSlotCountChange?.(startIdx - clickIdx + 1)
      }
      return
    }

    // span > 1 — already a range
    if (clickIdx > endIdx) {
      onSlotCountChange?.(clickIdx - startIdx + 1)
    } else if (clickIdx < startIdx) {
      onTimeSlotSelect(slotId)
      onSlotCountChange?.(endIdx - clickIdx + 1)
    } else {
      // Click inside or on an edge of the existing range → collapse to single
      onTimeSlotSelect(slotId)
      onSlotCountChange?.(1)
    }
  }

  // ── Presets — pick the start, then snap span to the preset count ────────
  const setPreset = (count: number) => {
    if (!isMultiSlotMode) return
    // If nothing's selected yet, default to first slot
    const baseStart = startIdx >= 0 ? startIdx : 0
    const maxAvailable = TIME_SLOTS.length - baseStart
    const finalCount = Math.min(count, maxAvailable)
    if (finalCount < 1) return
    onTimeSlotSelect(TIME_SLOTS[baseStart].id)
    onSlotCountChange?.(finalCount)
  }

  // ── Custom time fallback (preserved from original) ─────────────────────
  const isCustomSelected =
    selectedTimeSlot === CUSTOM_SLOT_ID ||
    (!!selectedTimeSlot && !TIME_SLOTS.find(s => s.id === selectedTimeSlot))

  const [customTime, setCustomTime] = useState<string>(() => {
    if (existingBooking?.timeSlot && !TIME_SLOTS.find(s => s.id === existingBooking.timeSlot)) {
      return existingBooking.timeSlot
    }
    return ''
  })

  const handleCustomTimeChange = (value: string) => {
    setCustomTime(value)
    if (value) {
      onTimeSlotSelect(value)
    }
  }

  const handleSelectCustom = () => {
    onTimeSlotSelect(CUSTOM_SLOT_ID)
    setCustomTime('')
    if (isMultiSlotMode) onSlotCountChange?.(1)
  }

  // Selected range summary (e.g. "08:30 – 16:00 · 5 slots")
  const rangeSummary = (() => {
    if (!isMultiSlotMode || startIdx < 0) return null
    const startSlot = TIME_SLOTS[startIdx]
    if (!startSlot) return null
    const endTime = getBookingEndTime(startSlot.id, span)
    if (span === 1) {
      return t('serviceBookings.timeSlot.rangeSummarySingle', {
        startTime: startSlot.startTime,
        endTime: startSlot.endTime,
      })
    }
    return t('serviceBookings.timeSlot.rangeSummaryMulti', {
      startTime: startSlot.startTime,
      endTime,
      count: span,
    })
  })()

  return (
    <div className="bg-[#f8faf9] dark:bg-gray-800/60 p-3 rounded-xl border border-[#e2e8e5] dark:border-gray-700 shadow-sm">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-md bg-[#025940]/10 border border-[#025940]/20">
            <Clock className="w-3.5 h-3.5 text-[#025940] dark:text-[#72A68E]" />
          </span>
          <label className="block text-[11px] font-semibold text-[#012619] dark:text-gray-200 uppercase tracking-wide">
            {t('serviceBookings.timeSlot.label')}{isMultiSlotMode ? t('serviceBookings.timeSlot.labelMultiSuffix') : ''}
          </label>
        </div>
        {/* Range summary */}
        {rangeSummary && (
          <span className="text-[11px] font-bold text-[#025940] dark:text-[#72A68E] bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded-md border border-[#72A68E]/40">
            {rangeSummary}
          </span>
        )}
      </div>

      {/* 🕐 Quick presets — only in multi-slot mode. Atomic slot is 30 min,
          so the slot counts here translate as 1=30m, 2=1h, 3=90m, 4=2h,
          8=4h (half day), TIME_SLOTS.length=12h (full day). */}
      {isMultiSlotMode && (() => {
        const PRESETS: { label: string; slots: number; title: string }[] = [
          { label: t('serviceBookings.timeSlot.preset30m'),      slots: 1,  title: t('serviceBookings.timeSlot.preset30mTitle') },
          { label: t('serviceBookings.timeSlot.preset1hr'),      slots: 2,  title: t('serviceBookings.timeSlot.preset1hrTitle') },
          { label: t('serviceBookings.timeSlot.preset15hrs'),    slots: 3,  title: t('serviceBookings.timeSlot.preset15hrsTitle') },
          { label: t('serviceBookings.timeSlot.preset2hrs'),     slots: 4,  title: t('serviceBookings.timeSlot.preset2hrsTitle') },
          { label: t('serviceBookings.timeSlot.presetHalfDay'),  slots: 8,  title: t('serviceBookings.timeSlot.presetHalfDayTitle') },
          { label: t('serviceBookings.timeSlot.presetFullDay'),  slots: TIME_SLOTS.length, title: t('serviceBookings.timeSlot.presetFullDayTitle') },
        ]
        return (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PRESETS.map(p => {
              const isFullDay = p.slots === TIME_SLOTS.length
              const active = isFullDay
                ? startIdx === 0 && span === TIME_SLOTS.length
                : span === p.slots
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => (p.slots === 1 ? onSlotCountChange?.(1) : setPreset(p.slots))}
                  disabled={!selectedTimeSlot || isCustomSelected}
                  title={p.title}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors ${
                    active
                      ? 'bg-[#025940] text-white border-[#025940]'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-[#72A68E]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        )
      })()}

      {/* Atomic slots are 30 min — denser grid so 24 chips don't blow up
          vertically. Up to 6 chips per row on large screens. */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
        {/* Standard slots */}
        {TIME_SLOTS.map((slot, idx) => {
          // In multi-slot mode, every slot in the range counts as selected.
          const isInRange =
            isMultiSlotMode && startIdx >= 0 && idx >= startIdx && idx <= endIdx
          const isSelected = isMultiSlotMode
            ? isInRange
            : selectedTimeSlot === slot.id
          const occupancy = slotOccupancy.get(slot.id)
          const bookingCount = occupancy?.bookings.length || 0

          return (
            <SlotIndicator
              key={slot.id}
              bookingCount={bookingCount}
              isSelected={isSelected}
              slotLabel={slot.label}
              nextAvailableBay={occupancy?.nextAvailableBay}
              bookings={occupancy?.bookings}
              isHovered={hoveredSlot === slot.id}
              onMouseEnter={() => setHoveredSlot(slot.id)}
              onMouseLeave={() => setHoveredSlot(null)}
              onClick={() => handleSlotClick(slot.id)}
              slotOccupancy={slotOccupancy}
              slotId={slot.id}
              bayNames={bayNames}
            />
          )
        })}

        {/* Custom time button */}
        <button
          type="button"
          onClick={handleSelectCustom}
          onMouseEnter={() => setHoveredSlot(CUSTOM_SLOT_ID)}
          onMouseLeave={() => setHoveredSlot(null)}
          className={`
            relative px-2 py-1.5 rounded-lg border text-[11px] font-semibold transition-all duration-150
            flex items-center justify-center gap-1
            ${isCustomSelected
              ? 'bg-[#025940] border-[#025940] text-white shadow'
              : 'bg-white dark:bg-gray-800 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-[#72A68E] hover:text-[#025940] dark:hover:text-[#72A68E]'
            }
          `}
        >
          <PenLine className="w-3 h-3 flex-shrink-0" />
          <span>{t('serviceBookings.timeSlot.customButton')}</span>
        </button>
      </div>

      {/* Custom time input — shown when Custom is selected */}
      {isCustomSelected && (
        <div className="mt-2 flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-[#025940] dark:text-[#72A68E] flex-shrink-0" />
          <div className="flex-1">
            <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-0.5">
              {t('serviceBookings.timeSlot.customTimeLabel')}
            </label>
            <input
              type="time"
              value={customTime}
              onChange={e => handleCustomTimeChange(e.target.value)}
              className="w-full px-2 py-1 text-xs border border-[#72A68E] dark:border-[#025940] rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#025940] focus:border-[#025940] transition-colors"
              autoFocus
            />
          </div>
          {customTime && (
            <div className="flex-shrink-0 text-xs font-bold text-[#025940] dark:text-[#72A68E] bg-[#C5D9D0]/40 dark:bg-[#025940]/20 px-2 py-1 rounded-md border border-[#72A68E]/40">
              {customTime}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-red-500 text-[11px] mt-1">{error}</p>
      )}
    </div>
  )
}
