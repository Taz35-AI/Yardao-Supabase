// src/components/yard/components/VehicleDetailsForm.tsx
'use client'

import React from 'react'
import { Input } from '@/components/ui/Input'
import { VehicleFormData } from '@/types'

interface VehicleDetailsFormProps {
  formData: VehicleFormData
  onChange: (field: string, value: string) => void
}

export const VehicleDetailsForm = React.memo(function VehicleDetailsForm({
  formData,
  onChange
}: VehicleDetailsFormProps) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <h3 className="text-sm sm:text-base font-medium text-gray-700 dark:text-gray-300">
        Vehicle Details
      </h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
        <Input
          label="Registration *"
          value={formData.registration}
          onChange={(e) => onChange('registration', e.target.value)}
          placeholder="e.g., AB12 CDE"
          required
          className="h-8 sm:h-10 text-xs sm:text-sm"
        />
        <Input
          label="Make *"
          value={formData.make}
          onChange={(e) => onChange('make', e.target.value)}
          placeholder="e.g., Ford"
          required
          className="h-8 sm:h-10 text-xs sm:text-sm"
        />
        <Input
          label="Model *"
          value={formData.model}
          onChange={(e) => onChange('model', e.target.value)}
          placeholder="e.g., Transit"
          required
          className="h-8 sm:h-10 text-xs sm:text-sm"
        />
        <Input
          label="Colour"
          value={formData.colour}
          onChange={(e) => onChange('colour', e.target.value)}
          placeholder="e.g., White"
          className="h-8 sm:h-10 text-xs sm:text-sm"
        />
        
        <div className="space-y-2">
          <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
            Size *
          </label>
          <select
            value={formData.size}
            onChange={(e) => onChange('size', e.target.value)}
            className="flex h-8 sm:h-10 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 sm:px-3 py-1 sm:py-2 text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            required
          >
            <option value="">Select size...</option>
            <option value="Small Van">Small Van</option>
            <option value="Large Van">Large Van</option>
            <option value="Extra Large Van">Extra Large Van</option>
            <option value="Pickup Truck">Pickup Truck</option>
            <option value="Car">Car</option>
            <option value="Motorcycle">Motorcycle</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
            MOT Expiry
          </label>
          <input
            type="date"
            value={formData.motExpiry || ''}
            onChange={(e) => onChange('motExpiry', e.target.value)}
            className="flex h-8 sm:h-10 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 sm:px-3 py-1 sm:py-2 text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>
    </div>
  )
})