// src/components/yard/components/VehicleSelector.tsx
'use client'

import React from 'react'
import { Button } from '@/components/ui/Button'
import { Car, Plus } from 'lucide-react'
import { Vehicle } from '@/types'

interface VehicleSelectorProps {
  vehicles: Vehicle[]
  customVehicle: boolean
  onVehicleSelect: (vehicle: Vehicle) => void
  onCustomToggle: (custom: boolean) => void
}

export const VehicleSelector = React.memo(function VehicleSelector({
  vehicles,
  customVehicle,
  onVehicleSelect,
  onCustomToggle
}: VehicleSelectorProps) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm sm:text-base font-medium text-gray-700 dark:text-gray-300">
          Select Vehicle
        </label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={!customVehicle ? "default" : "outline"}
            size="sm"
            onClick={() => onCustomToggle(false)}
            className="text-xs sm:text-sm"
          >
            <Car className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            Fleet Vehicle
          </Button>
          <Button
            type="button"
            variant={customVehicle ? "default" : "outline"}
            size="sm"
            onClick={() => onCustomToggle(true)}
            className="text-xs sm:text-sm"
          >
            <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            Custom Vehicle
          </Button>
        </div>
      </div>

      {!customVehicle && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 sm:max-h-48 overflow-y-auto">
          {vehicles.length > 0 ? (
            vehicles.map((vehicle) => (
              <button
                key={vehicle.id}
                type="button"
                onClick={() => onVehicleSelect(vehicle)}
                className="p-3 sm:p-4 text-left border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <div className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white">
                  {vehicle.registration}
                </div>
                <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  {vehicle.make} {vehicle.model}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-500">
                  {vehicle.size}
                </div>
              </button>
            ))
          ) : (
            <div className="col-span-2 text-center py-6 sm:py-8 text-gray-500 dark:text-gray-400">
              <Car className="w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 opacity-50" />
              <p className="text-sm sm:text-base">No vehicles in fleet</p>
              <p className="text-xs sm:text-sm">Use custom vehicle option</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
})