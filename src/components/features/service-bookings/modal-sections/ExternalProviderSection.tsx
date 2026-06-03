// src/components/features/service-bookings/modal-sections/ExternalProviderSection.tsx
'use client'

import React from 'react'
import { Input } from '@/components/ui/Input'
import { ExternalLink, MapPin, Loader2 } from 'lucide-react'
import { ExternalProviderSectionProps } from '@/types/serviceBookingTypes'
import { GarageSelector } from '../modal-components/GarageSelector'
import { useT } from '@/lib/i18n'

export function ExternalProviderSection({
  formData,
  onGarageSelect,
  onProviderChange,
  errors,
  externalGaragesLoading,
  externalGarages
}: ExternalProviderSectionProps) {
  const t = useT()
  return (
    <div className="bg-[#f8faf9] dark:bg-gray-800/60 p-3 rounded-xl border border-[#e2e8e5] dark:border-gray-700 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="flex items-center justify-center w-6 h-6 rounded-md bg-[#72A68E]/15 border border-[#72A68E]/40">
          <ExternalLink className="w-3.5 h-3.5 text-[#025940] dark:text-[#72A68E]" />
        </span>
        <h4 className="font-semibold text-[#012619] dark:text-gray-200 text-[11px] uppercase tracking-wide">
          {t('serviceBookings.externalProvider.title')}
        </h4>
      </div>

      <div className="space-y-2">
        {/* Garage Selection */}
        <GarageSelector
          selectedGarageName={formData.externalProvider.garageName}
          selectedAddress={formData.externalProvider.address}
          externalGarages={externalGarages}
          loading={externalGaragesLoading}
          onGarageSelect={onGarageSelect}
          onCustomGarageChange={onProviderChange}
          errors={errors}
        />

        {/* Display selected garage address */}
        {formData.externalProvider.address && (
          <div>
            <label className="block text-[11px] font-medium text-[#4a5e54] dark:text-gray-300 mb-0.5">
              {t('serviceBookings.externalProvider.garageAddressLabel')}
            </label>
            <div className="p-1.5 bg-white dark:bg-gray-800 border border-[#c8d5ce] dark:border-gray-600 rounded-lg">
              <div className="flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#025940] dark:text-[#72A68E] mt-0.5 flex-shrink-0" />
                <span className="text-xs text-[#012619] dark:text-gray-200">
                  {formData.externalProvider.address}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Custom Time */}
        <div>
          <label className="block text-[11px] font-medium text-[#4a5e54] dark:text-gray-300 mb-0.5">
            {t('serviceBookings.externalProvider.customTimeLabel')}
          </label>
          <Input
            value={formData.customTime}
            onChange={(e) => onProviderChange('customTime', e.target.value)}
            placeholder={t('serviceBookings.externalProvider.customTimePlaceholder')}
            className={`bg-white dark:bg-gray-800 border-[#c8d5ce] dark:border-gray-600 rounded-lg text-xs h-8 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] placeholder-[#8a9e94] ${errors.customTime ? 'border-red-500' : ''}`}
          />
          {errors.customTime && (
            <p className="text-red-500 text-[11px] mt-0.5">{errors.customTime}</p>
          )}
        </div>
      </div>
    </div>
  )
}