// src/components/features/service-bookings/booking-workspace/DurationSection.tsx
// Workspace-only compact duration picker. Replaces the modal's 24-chip
// TimeSlotSection by leaning on the workshop schedule grid for picking the
// start time — the user clicks a cell on the grid to choose where the
// booking lands, and just picks a duration here.
//
// Atomic slot is 30 min (see TIME_SLOTS in ServiceBookingsContent). A
// 90-min job is slotCount=3, MOT 60-min is slotCount=2, etc.
'use client'

import React from 'react'
import { Clock, ArrowRight, MousePointerClick } from 'lucide-react'
import { TIME_SLOTS } from '@/components/features/service-bookings/ServiceBookingsContent'
import { getSlotIndex, getBookingEndTime } from '@/utils/serviceBookings/slotHelpers'
import { formatDuration } from '@/lib/utils/duration'
import { useT } from '@/lib/i18n'

export interface DurationSectionProps {
  /** Currently picked start slot id (e.g. "09:00-09:30"), or '' when none. */
  selectedTimeSlot: string
  /** Currently picked atomic-slot count (1 = 30 min, 2 = 60 min, etc.). */
  slotCount: number
  /** Update slot count. */
  onSlotCountChange: (count: number) => void
  /** Clear the picked slot — used by the "Change start" affordance. */
  onClearSlot?: () => void
  /** Validation error from the form (if no slot picked at submit). */
  error?: string
}

const PRESETS: ReadonlyArray<{ tKey: string; minutes: number; slots: number }> = [
  { tKey: 'serviceBookings.duration.preset30m',  minutes: 30,  slots: 1 },
  { tKey: 'serviceBookings.duration.preset1hr',  minutes: 60,  slots: 2 },
  { tKey: 'serviceBookings.duration.preset15hrs', minutes: 90,  slots: 3 },
  { tKey: 'serviceBookings.duration.preset2hrs', minutes: 120, slots: 4 },
  { tKey: 'serviceBookings.duration.preset3hrs', minutes: 180, slots: 6 },
  { tKey: 'serviceBookings.duration.preset4hrs', minutes: 240, slots: 8 },
]

export function DurationSection({
  selectedTimeSlot,
  slotCount,
  onSlotCountChange,
  onClearSlot,
  error,
}: DurationSectionProps) {
  const t = useT()
  const startIdx = selectedTimeSlot ? getSlotIndex(selectedTimeSlot) : -1
  const startSlot = startIdx >= 0 ? TIME_SLOTS[startIdx] : null
  const endTime = startSlot ? getBookingEndTime(startSlot.id, slotCount) : ''

  const totalMinutes = Math.max(1, slotCount) * 30

  const stepDown = () => onSlotCountChange(Math.max(1, slotCount - 1))
  const stepUp = () =>
    onSlotCountChange(
      Math.min(
        TIME_SLOTS.length - Math.max(0, startIdx),
        slotCount + 1,
      ),
    )

  return (
    <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/10 p-4 rounded-xl border border-blue-200 dark:border-blue-700">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {t('serviceBookings.duration.label')}
        </label>
      </div>

      {/* Preset chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {PRESETS.map((p) => {
          const active = slotCount === p.slots
          return (
            <button
              key={p.slots}
              type="button"
              onClick={() => onSlotCountChange(p.slots)}
              className={`text-[11px] font-bold px-2.5 py-1.5 rounded-md border transition-colors ${
                active
                  ? 'bg-[#025940] text-white border-[#025940]'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:border-[#72A68E]'
              }`}
            >
              {t(p.tKey)}
            </button>
          )
        })}
      </div>

      {/* Custom stepper for non-preset values */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          {t('serviceBookings.duration.custom')}
        </span>
        <button
          type="button"
          onClick={stepDown}
          disabled={slotCount <= 1}
          className="w-7 h-7 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
        >
          −
        </button>
        <span className="min-w-[80px] text-center text-xs font-bold text-gray-800 dark:text-gray-200">
          {formatDuration(totalMinutes)}
          <span className="ml-1 text-[10px] font-normal text-gray-400">
            {t('serviceBookings.duration.slotMultiplier', { count: slotCount })}
          </span>
        </span>
        <button
          type="button"
          onClick={stepUp}
          className="w-7 h-7 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-bold"
        >
          +
        </button>
      </div>

      {/* Selected start time card OR call-to-action */}
      {startSlot ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-[#72A68E]/40 p-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="w-4 h-4 text-[#025940] dark:text-[#72A68E] flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {t('serviceBookings.duration.selectedStart')}
              </div>
              <div className="flex items-center gap-1.5 text-sm font-bold text-gray-900 dark:text-white">
                <span>{startSlot.startTime}</span>
                <ArrowRight className="w-3 h-3 text-gray-400" />
                <span>{endTime}</span>
              </div>
            </div>
          </div>
          {onClearSlot && (
            <button
              type="button"
              onClick={onClearSlot}
              className="text-[11px] font-medium text-gray-500 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 rounded transition-colors"
              title={t('serviceBookings.duration.clearStartTitle')}
            >
              {t('serviceBookings.duration.change')}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white/70 dark:bg-gray-800/60 rounded-lg border border-dashed border-blue-300 dark:border-blue-700 p-2.5 flex items-center gap-2 text-[11px] text-gray-600 dark:text-gray-400">
          <MousePointerClick className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <span>
            {t('serviceBookings.duration.pickStartHint')}
          </span>
        </div>
      )}

      {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
    </div>
  )
}

export default DurationSection
