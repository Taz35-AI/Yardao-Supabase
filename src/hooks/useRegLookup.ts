// src/hooks/useRegLookup.ts
// Shared per-vehicle DVLA lookup state for the "Look up" button.
// Used by the fleet edit modal and the service-booking form so they behave
// identically. The DVLA key stays server-side (vehicleLookupService proxies it).
'use client'

import { useCallback, useState } from 'react'
import { vehicleLookupService, VehicleLookupError, type VehicleLookupResult } from '@/lib/services/vehicleLookupService'

export function useRegLookup() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // DVLA has no record for the reg (404) — usually a brand-new vehicle.
  // Callers can show a gentle hint instead of a scary error.
  const [notFound, setNotFound] = useState(false)
  const [done, setDone] = useState(false)

  // Returns the DVLA data so the caller can apply just the fields it has.
  const run = useCallback(async (registration: string): Promise<VehicleLookupResult | null> => {
    const reg = (registration || '').trim()
    if (!reg) {
      setError('Enter a registration first')
      setDone(false)
      return null
    }
    setLoading(true)
    setError(null)
    setNotFound(false)
    setDone(false)
    try {
      const data = await vehicleLookupService.lookup(reg)
      setDone(true)
      return data
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Vehicle lookup failed'
      setError(message.replace(/[⚠️❌]/g, '').trim())
      setNotFound(e instanceof VehicleLookupError && e.notFound)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  // Call when the registration is edited so stale feedback clears.
  const reset = useCallback(() => {
    setError(null)
    setNotFound(false)
    setDone(false)
  }, [])

  return { loading, error, notFound, done, run, reset }
}
