// src/components/features/service-bookings/modal-sections/DateSection.tsx
'use client'

import React from 'react'
import { Input } from '@/components/ui/Input'
import { DateSectionProps } from '@/types/serviceBookingTypes'
import { getDateInputValue, getTodayDateString } from '@/utils/serviceBookings/dateHelpers'
import { useT } from '@/lib/i18n'

export function DateSection({ selectedDate, onDateChange, error, allowPastDates }: DateSectionProps) {
  const t = useT()
  // In edit mode (`allowPastDates`) the browser-level min is dropped so a
  // booking that already sits on a past day can be re-saved (user wants to
  // add a forgotten job to yesterday's booking). New bookings still pin to
  // today.
  const minDate = allowPastDates ? undefined : getTodayDateString()
  return (
    <div className="bg-[#f8faf9] dark:bg-gray-800/60 p-3 rounded-xl border border-[#e2e8e5] dark:border-gray-700 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <img src="/calendar.svg" alt="" className="w-7 h-7 object-contain" />
        <label className="block text-[11px] font-semibold text-[#012619] dark:text-gray-200 uppercase tracking-wide">
          {t('serviceBookings.date.label')}
        </label>
      </div>
      <Input
        type="date"
        value={selectedDate ? getDateInputValue(selectedDate) : ''}
        onChange={(e) => onDateChange(e.target.value)}
        min={minDate}
        className={`bg-white dark:bg-gray-800 border-[#c8d5ce] dark:border-gray-600 rounded-lg text-xs h-8 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] ${error ? 'border-red-500' : ''}`}
      />
      {error && (
        <p className="text-red-500 text-[11px] mt-1">{error}</p>
      )}
    </div>
  )
}