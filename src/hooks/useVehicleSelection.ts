// src/hooks/useVehicleSelection.ts
import { useState, useCallback, useMemo } from 'react'
import { FleetVehicle } from '@/types'

export interface VehicleSelectionHook {
  selectedVehicleIds: Set<string>
  isVehicleSelected: (vehicleId: string) => boolean
  toggleVehicleSelection: (vehicleId: string) => void
  selectAllVehicles: (vehicleIds: string[]) => void
  clearSelection: () => void
  selectedCount: number
  hasSelection: boolean
  getSelectedVehicles: (allVehicles: FleetVehicle[]) => FleetVehicle[]
}

/**
 * Custom hook for managing vehicle selection state
 * Maintains selection across pagination, filtering, and sorting
 */
export function useVehicleSelection(): VehicleSelectionHook {
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<Set<string>>(new Set())

  // Check if a vehicle is selected
  const isVehicleSelected = useCallback((vehicleId: string): boolean => {
    return selectedVehicleIds.has(vehicleId)
  }, [selectedVehicleIds])

  // Toggle individual vehicle selection
  const toggleVehicleSelection = useCallback((vehicleId: string) => {
    setSelectedVehicleIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(vehicleId)) {
        newSet.delete(vehicleId)
      } else {
        newSet.add(vehicleId)
      }
      return newSet
    })
  }, [])

  // Select all vehicles from a list
  const selectAllVehicles = useCallback((vehicleIds: string[]) => {
    setSelectedVehicleIds(new Set(vehicleIds))
  }, [])

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelectedVehicleIds(new Set())
  }, [])

  // Get count of selected vehicles
  const selectedCount = useMemo(() => selectedVehicleIds.size, [selectedVehicleIds])

  // Check if any vehicles are selected
  const hasSelection = useMemo(() => selectedVehicleIds.size > 0, [selectedVehicleIds])

  // Get the actual vehicle objects for selected IDs
  const getSelectedVehicles = useCallback((allVehicles: FleetVehicle[]): FleetVehicle[] => {
    return allVehicles.filter(vehicle => selectedVehicleIds.has(vehicle.id))
  }, [selectedVehicleIds])

  return {
    selectedVehicleIds,
    isVehicleSelected,
    toggleVehicleSelection,
    selectAllVehicles,
    clearSelection,
    selectedCount,
    hasSelection,
    getSelectedVehicles
  }
}