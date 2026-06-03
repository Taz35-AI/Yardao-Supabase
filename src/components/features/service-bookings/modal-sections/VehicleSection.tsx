// src/components/features/service-bookings/modal-sections/VehicleSection.tsx
'use client'

import React from 'react'
import { Input } from '@/components/ui/Input'
import { Car, Search, Loader2, AlertCircle, Check } from 'lucide-react'
import { VehicleSectionProps } from '@/types/serviceBookingTypes'
import { VehicleSearchDropdown } from '../modal-components/VehicleSearchDropdown'
import { useVehicleSearch } from '@/hooks/features/useVehicleSearch'
import { useRegLookup } from '@/hooks/useRegLookup'
import { useT } from '@/lib/i18n'

export function VehicleSection({
  formData,
  vehicles,
  onInputChange,
  onVehicleSelect,
  errors
}: VehicleSectionProps) {
  const t = useT()
  const lookup = useRegLookup()

  // DVLA returns make (not model) — fill make for vehicles we have no data on.
  const runLookup = async () => {
    const data = await lookup.run(formData.registration)
    if (data?.make) onInputChange('make', data.make)
    if (data?.model) onInputChange('model', data.model)
  }

  const {
    vehicleSearchResults,
    showVehicleSearch,
    setShowVehicleSearch
  } = useVehicleSearch(
    formData.registration,
    vehicles,
    (make, model, isCustom) => {
      // null = leave the field alone (custom vehicle — preserve whatever
      // the user typed or the edit form prefilled). Only a fleet match
      // passes real strings to overwrite with.
      if (make !== null) onInputChange('make', make)
      if (model !== null) onInputChange('model', model)
      onInputChange('isCustomVehicle', isCustom)
    }
  )

  return (
    <div className="bg-[#f8faf9] dark:bg-gray-800/60 p-3 rounded-xl border border-[#e2e8e5] dark:border-gray-700 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="flex items-center justify-center w-6 h-6 rounded-md bg-[#025940]/10 border border-[#025940]/20">
          <Car className="w-3.5 h-3.5 text-[#025940] dark:text-[#72A68E]" />
        </span>
        <label className="block text-[11px] font-semibold text-[#012619] dark:text-gray-200 uppercase tracking-wide">
          {t('serviceBookings.vehicle.sectionLabel')}
        </label>
      </div>

      {/* Registration */}
      <div className="relative mb-2">
        <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-0.5">
          {t('serviceBookings.vehicle.registrationLabel')}
        </label>
        <div className="flex items-center gap-1.5">
          <div className="flex-1">
            <Input
              value={formData.registration}
              onChange={(e) => {
                onInputChange('registration', e.target.value.toUpperCase())
                lookup.reset()
              }}
              onFocus={() => {
                if (vehicleSearchResults.length > 0) {
                  setShowVehicleSearch(true)
                }
              }}
              onBlur={() => {
                setTimeout(() => setShowVehicleSearch(false), 200)
              }}
              placeholder={t('serviceBookings.vehicle.registrationPlaceholder')}
              className={`bg-white dark:bg-gray-800 border-[#c8d5ce] dark:border-gray-600 rounded-lg text-xs h-8 ${errors.registration ? 'border-red-500' : ''}`}
            />
          </div>
          <button
            type="button"
            onClick={runLookup}
            disabled={lookup.loading || !formData.registration.trim()}
            title={t('fleet.form.lookupTitle')}
            className="flex-shrink-0 inline-flex items-center gap-1 bg-[#025940] hover:bg-[#012619] text-white font-semibold px-2.5 h-8 rounded-lg text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {lookup.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            <span>{t('fleet.form.lookupButton')}</span>
          </button>
        </div>
        {errors.registration && (
          <p className="text-red-500 text-[11px] mt-0.5">{errors.registration}</p>
        )}
        {lookup.error && (
          <p className="flex items-start gap-1 text-red-500 text-[11px] mt-0.5">
            <AlertCircle className="w-3 h-3 flex-shrink-0 mt-px" />{lookup.error}
          </p>
        )}
        {lookup.done && !lookup.error && (
          <p className="flex items-start gap-1 text-[#025940] dark:text-[#72A68E] text-[11px] mt-0.5">
            <Check className="w-3 h-3 flex-shrink-0 mt-px" />{t('fleet.form.lookupSuccess')}
          </p>
        )}

        {/* Vehicle Search Results */}
        <VehicleSearchDropdown
          searchResults={vehicleSearchResults}
          showResults={showVehicleSearch}
          onVehicleSelect={(vehicle) => {
            onVehicleSelect(vehicle)
            setShowVehicleSearch(false)
          }}
        />
      </div>

      {/* Make and Model */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
        <div>
          <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-0.5">
            {t('serviceBookings.vehicle.makeLabel', { marker: formData.isCustomVehicle ? '*' : '' })}
          </label>
          <Input
            value={formData.make}
            onChange={(e) => onInputChange('make', e.target.value)}
            placeholder={t('serviceBookings.vehicle.makePlaceholder')}
            className={`bg-white dark:bg-gray-800 border-[#c8d5ce] dark:border-gray-600 rounded-lg text-xs h-8 ${errors.make ? 'border-red-500' : ''}`}
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-0.5">
            {t('serviceBookings.vehicle.modelLabel', { marker: formData.isCustomVehicle ? '*' : '' })}
          </label>
          <Input
            value={formData.model}
            onChange={(e) => onInputChange('model', e.target.value)}
            placeholder={t('serviceBookings.vehicle.modelPlaceholder')}
            className={`bg-white dark:bg-gray-800 border-[#c8d5ce] dark:border-gray-600 rounded-lg text-xs h-8 ${errors.model ? 'border-red-500' : ''}`}
          />
        </div>
      </div>

      {(errors.make || errors.model) && (
        <p className="text-red-500 text-[11px] mb-2">{errors.make || errors.model}</p>
      )}

      {/* Custom Vehicle Toggle */}
      <div className="flex items-center gap-1.5">
        <input
          type="checkbox"
          id="isCustomVehicle"
          checked={formData.isCustomVehicle}
          onChange={(e) => onInputChange('isCustomVehicle', e.target.checked)}
          className="rounded border-[#c8d5ce] text-[#025940] focus:ring-[#025940] w-3.5 h-3.5"
        />
        <label htmlFor="isCustomVehicle" className="text-[11px] text-gray-700 dark:text-gray-300">
          {t('serviceBookings.vehicle.notFleetVehicle')}
        </label>
      </div>
    </div>
  )
}