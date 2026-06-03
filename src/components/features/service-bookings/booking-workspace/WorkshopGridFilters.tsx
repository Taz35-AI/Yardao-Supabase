// src/components/features/service-bookings/booking-workspace/WorkshopGridFilters.tsx
// Header strip above the workshop schedule grid: date picker, technician
// filter, bay filter, Today / prev / next nav. Mirrors the screenshot.
'use client'

import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMechanics } from '@/hooks/useMechanics'
import { getDateInputValue, parseDateFromInput } from '@/utils/serviceBookings/dateHelpers'
import { PARTS_STATUS_ORDER, PARTS_STATUS_META, type PartsStatus } from '@/lib/utils/partsStatus'
import { useT, localizePartsStatus } from '@/lib/i18n'

export interface WorkshopGridFiltersProps {
  selectedDate: Date
  onDateChange: (date: Date) => void
  bayCount: number
  bayFilter: number | 'all'
  onBayFilterChange: (bay: number | 'all') => void
  mechanicFilter: string | 'all'
  onMechanicFilterChange: (mechanicId: string | 'all') => void
  partsFilter: PartsStatus | 'all'
  onPartsFilterChange: (parts: PartsStatus | 'all') => void
}

export function WorkshopGridFilters({
  selectedDate,
  onDateChange,
  bayCount,
  bayFilter,
  onBayFilterChange,
  mechanicFilter,
  onMechanicFilterChange,
  partsFilter,
  onPartsFilterChange,
}: WorkshopGridFiltersProps) {
  const { mechanics } = useMechanics()
  const t = useT()

  const goToday = () => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    onDateChange(t)
  }

  const shiftDay = (delta: number) => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + delta)
    d.setHours(0, 0, 0, 0)
    onDateChange(d)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 pt-1 pb-1.5 border-b border-gray-100 dark:border-gray-700">
      {/* Date picker */}
      <label className="flex items-center gap-2 min-w-[150px] flex-1" title={t('serviceBookings.filters.dateTitle')}>
        <img src="/calendar.svg" alt={t('serviceBookings.filters.dateTitle')} className="w-6 h-6 object-contain flex-shrink-0" />
        <input
          type="date"
          aria-label={t('serviceBookings.filters.dateAria')}
          value={getDateInputValue(selectedDate)}
          onChange={(e) => {
            if (e.target.value) onDateChange(parseDateFromInput(e.target.value))
          }}
          className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#025940]/40"
        />
      </label>

      {/* Technician filter */}
      <label className="flex items-center gap-2 min-w-[150px] flex-1" title={t('serviceBookings.filters.technicianTitle')}>
        <img src="/technician.svg" alt={t('serviceBookings.filters.technicianTitle')} className="w-6 h-6 object-contain flex-shrink-0" />
        <select
          aria-label={t('serviceBookings.filters.technicianAria')}
          value={mechanicFilter}
          onChange={(e) => onMechanicFilterChange(e.target.value as string | 'all')}
          className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#025940]/40"
        >
          <option value="all">{t('serviceBookings.filters.allTechnicians')}</option>
          {mechanics.map((m) => (
            <option key={m.uid} value={m.uid}>
              {m.displayName || m.email}
            </option>
          ))}
        </select>
      </label>

      {/* Bay filter */}
      <label className="flex items-center gap-2 min-w-[150px] flex-1" title={t('serviceBookings.filters.bayTitle')}>
        <img src="/bay.svg" alt={t('serviceBookings.filters.bayTitle')} className="w-6 h-6 object-contain flex-shrink-0" />
        <select
          aria-label={t('serviceBookings.filters.bayAria')}
          value={bayFilter === 'all' ? 'all' : String(bayFilter)}
          onChange={(e) => {
            const v = e.target.value
            onBayFilterChange(v === 'all' ? 'all' : Number(v))
          }}
          className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#025940]/40"
        >
          <option value="all">{t('serviceBookings.filters.allBays')}</option>
          {Array.from({ length: bayCount }, (_, i) => i + 1).map((b) => (
            <option key={b} value={b}>
              {t('serviceBookings.filters.bayOption', { count: b })}
            </option>
          ))}
        </select>
      </label>

      {/* Parts filter */}
      <label className="flex items-center gap-2 min-w-[150px] flex-1" title={t('serviceBookings.filters.partsTitle')}>
        <img src="/parts.svg" alt={t('serviceBookings.filters.partsTitle')} className="w-6 h-6 object-contain flex-shrink-0" />
        <select
          aria-label={t('serviceBookings.filters.partsAria')}
          value={partsFilter}
          onChange={(e) =>
            onPartsFilterChange(e.target.value as PartsStatus | 'all')
          }
          className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#025940]/40"
        >
          <option value="all">{t('serviceBookings.filters.allPartsStates')}</option>
          {PARTS_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {localizePartsStatus(t, s)}
            </option>
          ))}
        </select>
      </label>

      {/* Today + prev/next */}
      <div className="flex items-center gap-1 ml-auto">
        <button
          type="button"
          onClick={goToday}
          className="px-2.5 py-1 text-xs font-bold rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          {t('serviceBookings.filters.today')}
        </button>
        <button
          type="button"
          onClick={() => shiftDay(-1)}
          className="p-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          aria-label={t('serviceBookings.filters.previousDay')}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => shiftDay(1)}
          className="p-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          aria-label={t('serviceBookings.filters.nextDay')}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default WorkshopGridFilters
