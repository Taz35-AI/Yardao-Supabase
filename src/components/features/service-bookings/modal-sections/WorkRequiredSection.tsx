// src/components/features/service-bookings/modal-sections/WorkRequiredSection.tsx
// Compact job picker: 4 one-tap quick chips + a searchable dropdown over
// the full garage job list, instead of a tall toggle grid. Selected jobs
// show as removable chips. Free-text "custom work" stays for anything not
// in the list. Props are unchanged so both ServiceBookingModal and the
// booking workspace keep working without edits.
'use client'

import React, { useMemo, useState } from 'react'
import { Input } from '@/components/ui/Input'
import { Wrench, CheckCircle, Settings, Search, X } from 'lucide-react'
import { WorkRequiredSectionProps } from '@/types/serviceBookingTypes'
import { GARAGE_JOBS, QUICK_JOBS } from '@/components/features/service-bookings/garageJobs'
import { useT } from '@/lib/i18n'

const MAX_RESULTS = 40

export function WorkRequiredSection({
  workRequired,
  customWork,
  onWorkTypeToggle,
  onCustomWorkChange,
  errors,
}: WorkRequiredSectionProps) {
  const t = useT()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const selected = workRequired || []

  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return GARAGE_JOBS.filter(
      (job) =>
        job.toLowerCase().includes(q) && !selected.includes(job),
    ).slice(0, MAX_RESULTS)
  }, [search, selected])

  const pick = (job: string) => {
    if (!selected.includes(job)) onWorkTypeToggle(job)
    setSearch('')
    setOpen(false)
  }

  return (
    <>
      {/* Work Required */}
      <div className="bg-[#f8faf9] dark:bg-gray-800/60 p-3 rounded-xl border border-[#e2e8e5] dark:border-gray-700 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-md bg-[#b3f243]/30 border border-[#b3f243]/60">
            <Wrench className="w-3.5 h-3.5 text-[#025940]" />
          </span>
          <label className="block text-[11px] font-semibold text-[#012619] dark:text-gray-200 uppercase tracking-wide">
            {t('serviceBookings.workRequired.selectLabel')}
          </label>
        </div>

        {/* Quick chips — symmetrical 3 × 2 grid */}
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {QUICK_JOBS.map((job) => {
            const isOn = selected.includes(job)
            return (
              <button
                key={job}
                type="button"
                onClick={() => onWorkTypeToggle(job)}
                className={`flex items-center justify-center gap-1 w-full px-2 py-1.5 rounded-lg text-[11px] font-semibold border text-center leading-tight transition-all ${
                  isOn
                    ? 'border-[#025940] bg-[#025940] text-white shadow-sm'
                    : 'border-[#c8d5ce] dark:border-gray-600 bg-white dark:bg-gray-800 text-[#012619] dark:text-gray-200 hover:border-[#72A68E]'
                }`}
              >
                {isOn && <CheckCircle className="w-2.5 h-2.5 shrink-0" />}
                <span className="truncate">{job}</span>
              </button>
            )
          })}
        </div>

        {/* Searchable dropdown */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            // Delay close so a click on a result registers before blur.
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            placeholder={t('serviceBookings.workRequired.searchPlaceholder')}
            className="w-full pl-7 pr-7 py-1.5 text-xs border border-[#c8d5ce] dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[#012619] dark:text-white placeholder-[#8a9e94] focus:outline-none focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label={t('serviceBookings.workRequired.clearSearchAria')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {open && search.trim() && (
            <div className="absolute z-30 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-[#c8d5ce] dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg">
              {results.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-[#8a9e94] dark:text-gray-400">
                  {t('serviceBookings.workRequired.noResults')}
                </div>
              ) : (
                results.map((job) => (
                  <button
                    key={job}
                    type="button"
                    // mouseDown fires before input blur, so the pick lands.
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pick(job)
                    }}
                    className="block w-full text-left px-3 py-1.5 text-xs text-[#012619] dark:text-gray-100 hover:bg-[#025940]/8 dark:hover:bg-[#72A68E]/15"
                  >
                    {job}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Selected chips */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {selected.map((job) => (
              <span
                key={job}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-[#b3f243]/40 dark:bg-[#b3f243]/20 text-[#012619] dark:text-[#eaf3ef] border border-[#7fae27]"
              >
                {job}
                <button
                  type="button"
                  onClick={() => onWorkTypeToggle(job)}
                  className="text-[#025940] dark:text-[#b3f243] hover:text-[#012619] dark:hover:text-white"
                  aria-label={t('serviceBookings.workRequired.removeAria', { job })}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {errors.workRequired && (
          <p className="text-red-500 text-[11px] mt-2">{errors.workRequired}</p>
        )}
      </div>

      {/* Additional Custom Work */}
      <div className="bg-[#f8faf9] dark:bg-gray-800/60 p-3 rounded-xl border border-[#e2e8e5] dark:border-gray-700 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-md bg-[#72A68E]/15 border border-[#72A68E]/40">
            <Settings className="w-3.5 h-3.5 text-[#025940] dark:text-[#72A68E]" />
          </span>
          <label className="block text-[11px] font-semibold text-[#012619] dark:text-gray-200 uppercase tracking-wide">
            {t('serviceBookings.workRequired.customLabel')}
          </label>
        </div>
        <Input
          value={customWork}
          onChange={(e) => onCustomWorkChange(e.target.value)}
          placeholder={t('serviceBookings.workRequired.customPlaceholder')}
          className="bg-white dark:bg-gray-800 border-[#c8d5ce] dark:border-gray-600 rounded-lg text-xs h-8 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] placeholder-[#8a9e94]"
        />
      </div>
    </>
  )
}
