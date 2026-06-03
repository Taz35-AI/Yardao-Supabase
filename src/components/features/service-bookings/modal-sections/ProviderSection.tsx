// src/components/features/service-bookings/modal-sections/ProviderSection.tsx
'use client'

import React from 'react'
import { Building, ExternalLink } from 'lucide-react'
import { ProviderSectionProps } from '@/types/serviceBookingTypes'
import { useT } from '@/lib/i18n'

export function ProviderSection({ isExternalProvider, onProviderTypeChange }: ProviderSectionProps) {
  const t = useT()
  return (
    <div className="bg-[#f8faf9] dark:bg-gray-800/60 p-3 rounded-xl border border-[#e2e8e5] dark:border-gray-700 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="flex items-center justify-center w-6 h-6 rounded-md bg-[#012619]/8 border border-[#012619]/20">
          <Building className="w-3.5 h-3.5 text-[#012619] dark:text-[#72A68E]" />
        </span>
        <label className="block text-[11px] font-semibold text-[#012619] dark:text-gray-200 uppercase tracking-wide">
          {t('serviceBookings.provider.label')}
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onProviderTypeChange(false)}
          className={`p-2.5 border-2 rounded-lg text-left transition-all ${
            !isExternalProvider
              ? 'border-[#025940] bg-[#025940] text-white shadow-sm'
              : 'border-[#c8d5ce] dark:border-gray-600 bg-white dark:bg-gray-800 text-[#012619] dark:text-gray-200 hover:border-[#72A68E]'
          }`}
        >
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 flex-shrink-0" />
            <div className="leading-tight min-w-0">
              <div className="font-bold text-xs">{t('serviceBookings.provider.inHouseTitle')}</div>
              <div className="text-[10px] opacity-80">{t('serviceBookings.provider.inHouseDescription')}</div>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onProviderTypeChange(true)}
          className={`p-2.5 border-2 rounded-lg text-left transition-all ${
            isExternalProvider
              ? 'border-[#012619] bg-[#012619] text-white shadow-sm'
              : 'border-[#c8d5ce] dark:border-gray-600 bg-white dark:bg-gray-800 text-[#012619] dark:text-gray-200 hover:border-[#72A68E]'
          }`}
        >
          <div className="flex items-center gap-2">
            <ExternalLink className="w-4 h-4 flex-shrink-0" />
            <div className="leading-tight min-w-0">
              <div className="font-bold text-xs">{t('serviceBookings.provider.externalTitle')}</div>
              <div className="text-[10px] opacity-80">{t('serviceBookings.provider.externalDescription')}</div>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}