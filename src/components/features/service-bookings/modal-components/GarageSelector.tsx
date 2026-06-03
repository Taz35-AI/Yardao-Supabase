// src/components/features/service-bookings/modal-components/GarageSelector.tsx
'use client'

import React from 'react'
import { Input } from '@/components/ui/Input'
import { Loader2 } from 'lucide-react'
import { GarageSelectorProps } from '@/types/serviceBookingTypes'
import { useT } from '@/lib/i18n'

export function GarageSelector({
  selectedGarageName,
  selectedAddress,
  externalGarages,
  loading,
  onGarageSelect,
  onCustomGarageChange,
  errors
}: GarageSelectorProps) {
  const t = useT()
  const isCustomGarage = !externalGarages.some(g => g.name === selectedGarageName)

  const handleGarageChange = (value: string) => {
    if (value === 'CUSTOM') {
      // Clear for custom entry
      onCustomGarageChange('garageName', '')
      onCustomGarageChange('address', '')
    } else {
      onGarageSelect(value)
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
        {t('serviceBookings.garageSelector.label')}
      </label>
      {loading ? (
        <div className="flex items-center space-x-2 p-2 border border-purple-300 dark:border-purple-600 rounded-xl bg-white dark:bg-gray-800">
          <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
          <span className="text-sm text-gray-500">{t('serviceBookings.garageSelector.loading')}</span>
        </div>
      ) : (
        <div className="space-y-2">
          <select
            value={selectedGarageName || ''}
            onChange={(e) => handleGarageChange(e.target.value)}
            className={`w-full p-2 border border-purple-300 dark:border-purple-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${errors.garageName ? 'border-red-500' : ''}`}
          >
            <option value="">{t('serviceBookings.garageSelector.selectPlaceholder')}</option>
            {externalGarages.map((garage) => (
              <option key={garage.id} value={garage.name}>
                {garage.name}
              </option>
            ))}
            <option value="CUSTOM">{t('serviceBookings.garageSelector.customOption')}</option>
          </select>
          
          {/* Custom Garage Entry */}
          {(!selectedGarageName || isCustomGarage) && (
            <div className="space-y-2 p-3 bg-purple-50 dark:bg-purple-900/30 rounded-lg border border-purple-200 dark:border-purple-700">
              <div className="text-xs text-purple-700 dark:text-purple-300 font-medium">
                {t('serviceBookings.garageSelector.customEntryHeading')}
              </div>
              <div>
                <Input
                  value={selectedGarageName}
                  onChange={(e) => onCustomGarageChange('garageName', e.target.value)}
                  placeholder={t('serviceBookings.garageSelector.namePlaceholder')}
                  className={`bg-white dark:bg-gray-800 border-purple-300 dark:border-purple-600 rounded-xl ${errors.garageName ? 'border-red-500' : ''}`}
                />
              </div>
              <div>
                <Input
                  value={selectedAddress}
                  onChange={(e) => onCustomGarageChange('address', e.target.value)}
                  placeholder={t('serviceBookings.garageSelector.addressPlaceholder')}
                  className={`bg-white dark:bg-gray-800 border-purple-300 dark:border-purple-600 rounded-xl ${errors.address ? 'border-red-500' : ''}`}
                />
              </div>
            </div>
          )}
        </div>
      )}
      {errors.garageName && (
        <p className="text-red-500 text-xs mt-1">{errors.garageName}</p>
      )}
    </div>
  )
}