// src/components/fleet/form-fields/VehicleDetailsFields.tsx
'use client'

import React from 'react'
import { Input } from '@/components/ui/Input'
import { Car, Settings, Palette } from 'lucide-react'

interface VehicleDetailsFieldsProps {
  registration: string
  make: string
  model: string
  colour: string
  duplicateError: boolean
  onFieldChange: (field: string, value: string) => void
}

export function VehicleDetailsFields({
  registration,
  make,
  model,
  colour,
  duplicateError,
  onFieldChange
}: VehicleDetailsFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2 mb-4">
        <Car className="w-5 h-5 text-[#025940]" />
        <h3 className="text-lg font-semibold text-[#012619]">Vehicle Details</h3>
      </div>
      
      {/* Registration - Bright */}
      <div className={`bg-gradient-to-br ${duplicateError ? 'from-red-100 to-red-50' : 'from-white to-[#C5D9D0]/20'} p-4 rounded-xl border ${duplicateError ? 'border-red-400' : 'border-[#72A68E]'} shadow-sm`}>
        <div className="flex items-center space-x-2 mb-3">
          <Car className={`w-4 h-4 ${duplicateError ? 'text-red-600' : 'text-[#025940]'}`} />
          <label className="block text-sm font-semibold text-[#012619]">
            Registration *
          </label>
        </div>
        <Input
          value={registration}
          onChange={(e) => onFieldChange('registration', e.target.value.toUpperCase())}
          placeholder="e.g., ABC123"
          required
          className={`bg-white text-[#012619] ${duplicateError ? 'border-red-400' : 'border-[#72A68E]'} rounded-xl`}
        />
      </div>

      {/* Make & Model Row - Bright */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Make */}
        <div className="bg-gradient-to-br from-[#C5D9D0]/40 to-white p-4 rounded-xl border border-[#72A68E] shadow-sm">
          <div className="flex items-center space-x-2 mb-3">
            <Settings className="w-4 h-4 text-[#025940]" />
            <label className="block text-sm font-semibold text-[#012619]">
              Make
            </label>
          </div>
          <Input
            value={make}
            onChange={(e) => onFieldChange('make', e.target.value)}
            placeholder="e.g., Ford"
            className="bg-white text-[#012619] border-[#72A68E] rounded-xl"
          />
        </div>

        {/* Model */}
        <div className="bg-gradient-to-br from-[#C5D9D0]/40 to-white p-4 rounded-xl border border-[#72A68E] shadow-sm">
          <div className="flex items-center space-x-2 mb-3">
            <Settings className="w-4 h-4 text-[#025940]" />
            <label className="block text-sm font-semibold text-[#012619]">
              Model
            </label>
          </div>
          <Input
            value={model}
            onChange={(e) => onFieldChange('model', e.target.value)}
            placeholder="e.g., Transit"
            className="bg-white text-[#012619] border-[#72A68E] rounded-xl"
          />
        </div>
      </div>

      {/* Color - Bright */}
      <div className="bg-gradient-to-br from-[#72A68E]/20 to-white p-4 rounded-xl border border-[#72A68E] shadow-sm">
        <div className="flex items-center space-x-2 mb-3">
          <Palette className="w-4 h-4 text-[#025940]" />
          <label className="block text-sm font-semibold text-[#012619]">
            Color
          </label>
        </div>
        <Input
          value={colour}
          onChange={(e) => onFieldChange('colour', e.target.value)}
          placeholder="e.g., White"
          className="bg-white text-[#012619] border-[#72A68E] rounded-xl"
        />
      </div>
    </div>
  )
}