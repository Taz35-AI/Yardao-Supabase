// src/hooks/features/useVehicleSearch.ts - Vehicle Search & Auto-populate Logic
import { useState, useEffect } from 'react'
import { Vehicle } from '@/lib/firestore'
import { VehicleMatch } from '@/types/serviceBookingTypes'

export function useVehicleSearch(
  registration: string,
  vehicles: Vehicle[],
  // make/model === null means "leave the field as the user typed it".
  // Only a fleet exact-match passes real strings; the no-match (custom)
  // branch passes null so it never wipes hand-entered make/model.
  onAutoPopulate: (
    make: string | null,
    model: string | null,
    isCustom: boolean,
  ) => void
) {
  const [vehicleSearchResults, setVehicleSearchResults] = useState<VehicleMatch[]>([])
  const [showVehicleSearch, setShowVehicleSearch] = useState(false)

  // Auto-populate vehicle details when registration is entered
  useEffect(() => {
    if (registration && registration.length >= 2 && vehicles) {
      const matches = vehicles
        .filter(v => v.registration.toLowerCase().includes(registration.toLowerCase()))
        .slice(0, 5)
        .map(v => ({
          registration: v.registration,
          make: v.make || '',
          model: v.model || '',
          isFleetVehicle: true
        }))

      setVehicleSearchResults(matches)
      setShowVehicleSearch(matches.length > 0)

      const exactMatch = vehicles.find(v =>
        v.registration.toLowerCase() === registration.toLowerCase()
      )

      if (exactMatch) {
        // Fleet match → autofill make/model from the fleet record.
        onAutoPopulate(exactMatch.make || '', exactMatch.model || '', false)
        setShowVehicleSearch(false)
      } else if (registration.length >= 3 && matches.length === 0) {
        // No fleet match → custom vehicle. Flag it custom but DO NOT
        // touch make/model (null) — those are hand-entered (new booking)
        // or prefilled from the existing booking (edit). Blanking them
        // here was wiping the user's input on every fleet-list re-emit.
        onAutoPopulate(null, null, true)
      }
    } else {
      setVehicleSearchResults([])
      setShowVehicleSearch(false)
    }
  }, [registration, vehicles])

  return {
    vehicleSearchResults,
    showVehicleSearch,
    setShowVehicleSearch
  }
}