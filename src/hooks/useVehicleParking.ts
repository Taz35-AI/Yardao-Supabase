// src/hooks/useVehicleParking.ts
// Thin React wrapper around vehicleParkingService.
// Tracks an `assigning` flag so the UI can disable buttons during writes.
// Doesn't subscribe to anything — vehicle data already streams via useYardData,
// so when parkingSpaceId changes on the doc, your dashboard's existing
// onSnapshot picks it up automatically. Free live updates.
//
// 👤 Automatically attaches the current user as `actor` to each parking write
// so the underlying doc records who parked / moved / unparked the vehicle.
// The hook's public signature is unchanged — callers don't pass user info.

import { useState, useCallback, useMemo } from 'react'
import { vehicleParkingService, type ParkingActor } from '@/lib/services/vehicleParkingService'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/lib/logger'

interface UseVehicleParkingResult {
  assigning: boolean
  error: string | null
  assignVehicleToSpace: (vehicleId: string, spaceId: string, branchId: string) => Promise<boolean>
  forceAssignVehicleToSpace: (vehicleId: string, spaceId: string, branchId: string) => Promise<boolean>
  unassignVehicle: (vehicleId: string) => Promise<boolean>
  clearError: () => void
}

export function useVehicleParking(): UseVehicleParkingResult {
  const { user } = useAuth()
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Build the actor object once — only when user is authenticated.
  // Falls back to undefined when there's no user (the service treats that
  // as "no attribution" and writes the doc exactly as before).
  const actor: ParkingActor | undefined = useMemo(() => {
    if (!user) return undefined
    return {
      uid: user.uid,
      name: user.displayName || user.email || 'Unknown User',
    }
  }, [user])

  const clearError = useCallback(() => setError(null), [])

  const assignVehicleToSpace = useCallback(
    async (vehicleId: string, spaceId: string, branchId: string): Promise<boolean> => {
      setAssigning(true)
      setError(null)
      try {
        await vehicleParkingService.assignVehicleToSpace(vehicleId, spaceId, branchId, actor)
        return true
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to assign vehicle'
        setError(msg)
        logger.error('useVehicleParking assign error:', err)
        return false
      } finally {
        setAssigning(false)
      }
    },
    [actor],
  )

  const forceAssignVehicleToSpace = useCallback(
    async (vehicleId: string, spaceId: string, branchId: string): Promise<boolean> => {
      setAssigning(true)
      setError(null)
      try {
        await vehicleParkingService.forceAssignVehicleToSpace(vehicleId, spaceId, branchId, actor)
        return true
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to move vehicle'
        setError(msg)
        logger.error('useVehicleParking force-assign error:', err)
        return false
      } finally {
        setAssigning(false)
      }
    },
    [actor],
  )

  const unassignVehicle = useCallback(
    async (vehicleId: string): Promise<boolean> => {
      setAssigning(true)
      setError(null)
      try {
        await vehicleParkingService.unassignVehicle(vehicleId, actor)
        return true
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to unpark vehicle'
        setError(msg)
        logger.error('useVehicleParking unassign error:', err)
        return false
      } finally {
        setAssigning(false)
      }
    },
    [actor],
  )

  return {
    assigning,
    error,
    assignVehicleToSpace,
    forceAssignVehicleToSpace,
    unassignVehicle,
    clearError,
  }
}
