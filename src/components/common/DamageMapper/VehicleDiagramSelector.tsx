// src/components/common/DamageMapper/VehicleDiagramSelector.tsx
// Dropdown to pick the vehicle body diagram type (used in fleet add/edit forms).
// Stores the value as `vehicleDiagramType` on the Vehicle / FleetVehicle document.

'use client'

import { ChevronDown } from 'lucide-react'
import { DIAGRAM_OPTIONS, VehicleDiagramType } from './DamageMapper'

interface VehicleDiagramSelectorProps {
  value: VehicleDiagramType | ''
  onChange: (value: VehicleDiagramType | '') => void
  className?: string
}

export function VehicleDiagramSelector({ value, onChange, className = '' }: VehicleDiagramSelectorProps) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={e => onChange(e.target.value as VehicleDiagramType | '')}
        className="w-full px-3 py-2 text-sm border border-[#72A68E] dark:border-[#025940] rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white appearance-none focus:ring-2 focus:ring-[#025940] focus:border-[#025940] pr-8"
      >
        <option value="">— No diagram —</option>
        {DIAGRAM_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
    </div>
  )
}

export default VehicleDiagramSelector