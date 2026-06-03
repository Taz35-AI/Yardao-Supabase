// src/components/features/service-bookings/modal-components/VehicleSearchDropdown.tsx
'use client'

import React from 'react'
import { VehicleSearchDropdownProps } from '@/types/serviceBookingTypes'

export function VehicleSearchDropdown({
  searchResults,
  showResults,
  onVehicleSelect
}: VehicleSearchDropdownProps) {
  if (!showResults || searchResults.length === 0) {
    return null
  }

  return (
    <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-600 rounded-xl shadow-lg max-h-32 overflow-y-auto">
      {searchResults.map((vehicle, idx) => (
        <button
          key={idx}
          type="button"
          onClick={() => onVehicleSelect(vehicle)}
          className="w-full text-left px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center justify-between border-b border-emerald-100 dark:border-emerald-700 last:border-b-0 text-sm"
        >
          <span className="font-medium">{vehicle.registration}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {vehicle.make} {vehicle.model}
          </span>
        </button>
      ))}
    </div>
  )
}