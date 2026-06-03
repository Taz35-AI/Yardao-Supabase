// src/components/features/fleet/FleetActions.tsx - Mobile simplified (actions moved to header)
'use client'

import { Button } from '@/components/ui/Button'
import { FleetExportButton } from '@/components/fleet/FleetExportButton'
import { FleetVehicle } from '@/lib/fleetUtils'
import { Trash2, Plus } from 'lucide-react'

interface FleetActionsProps {
  vehicleCount: number
  vehicles: FleetVehicle[]
  filteredVehicles?: FleetVehicle[]
  conditions: any[]
  clearingAll: boolean
  onBulkUpload: (vehicles: any[]) => Promise<void>
  onClearAll: () => Promise<void>
  onAddVehicle?: () => void
}

export function FleetActions({
  vehicleCount,
  vehicles,
  filteredVehicles,
  conditions,
  clearingAll,
  onBulkUpload,
  onClearAll,
  onAddVehicle
}: FleetActionsProps) {
  // COMPLETELY HIDDEN - All buttons now only in FleetHeader dropdown/action menu
  // This removes the duplicate Clear All and Export buttons above summary cards

  return null // Return nothing - all actions handled by FleetHeader
}