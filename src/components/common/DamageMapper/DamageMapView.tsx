// src/components/common/DamageMapper/DamageMapView.tsx
// Shows damage pins on the fleet detail modal (read-only) and edit modal (editable).
// Drop this inside FleetVehicleDetailModal and FleetVehicleEditModal.
//
// READ-ONLY usage (FleetVehicleDetailModal):
//   <DamageMapView
//     diagramType={vehicle.vehicleDiagramType}
//     pins={vehicle.damagePins || []}
//     readOnly
//   />
//
// EDIT usage (FleetVehicleEditModal) — passes onChange and triggers a sync on save:
//   <DamageMapView
//     diagramType={formData.vehicleDiagramType}
//     pins={formData.damagePins || []}
//     onChange={(pins) => handleInputChange('damagePins', pins)}
//     onPhotoSelected={handleDamagePhoto}
//   />

'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, MapPin } from 'lucide-react'
import { DamageMapper, DamagePin, VehicleDiagramType } from './DamageMapper'

const VALID_DIAGRAMS: VehicleDiagramType[] = [
  'minibus', 'small_van', 'saloon', 'pickup', 'luton_van', 'tipper', 'swb_van',
  '7-seater', 'large-van', 'large-suv',
]

interface DamageMapViewProps {
  diagramType?: VehicleDiagramType | string | null
  pins: DamagePin[]
  readOnly?: boolean
  onChange?: (pins: DamagePin[]) => void
  onPhotoSelected?: (pinId: string, file: File) => Promise<string | void>
}

export function DamageMapView({
  diagramType,
  pins,
  readOnly = false,
  onChange,
  onPhotoSelected,
}: DamageMapViewProps) {
  const [expanded, setExpanded] = useState(true)

  const resolvedType = VALID_DIAGRAMS.includes(diagramType as VehicleDiagramType)
    ? (diagramType as VehicleDiagramType)
    : null

  const hasPins = pins.length > 0

  return (
    <div className="bg-gradient-to-br from-white to-amber-50/30 dark:from-gray-800 dark:to-amber-900/5 rounded-xl border border-[#72A68E]/30 dark:border-[#025940]/50 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Damage Map
          </span>
          {hasPins ? (
            <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
              {pins.length} pin{pins.length !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500">No damage recorded</span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          {resolvedType ? (
            <DamageMapper
              diagramType={resolvedType}
              pins={pins}
              onChange={onChange || (() => {})}
              readOnly={readOnly}
              onPhotoSelected={onPhotoSelected}
            />
          ) : (
            <div className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">
              <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-amber-300 dark:text-amber-600" />
              <p className="text-xs">
                No vehicle diagram assigned.{' '}
                {!readOnly && 'Set one in the Vehicle Diagram field above.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DamageMapView