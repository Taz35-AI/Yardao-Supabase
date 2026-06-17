// src/lib/services/mileageService.ts
// Anti-clocking floor: the highest odometer reading ever recorded for a vehicle.
//
// Used to stop staff entering a throwaway mileage (e.g. "1") just to clear the
// mandatory-mileage gate. A new reading must be >= this floor.
//
// The floor is built from HISTORICAL records only — past check-outs
// (checkout_history) + service history (completed bookings + manual records).
// It deliberately EXCLUDES the vehicle's current in-yard row so the Edit form
// can still correct that live value downward to the true historical floor.
// Callers that need to include the current value (e.g. return-from-hire) add it
// themselves.

import { supabase } from '@/lib/supabaseClient'
import { normalizeReg } from '@/lib/utils/registration'
import { vehicleServiceHistoryService } from './vehicleServiceHistoryService'
import { logger } from '@/lib/logger'

function parseMiles(v: any): number {
  const n = parseInt(String(v ?? '').replace(/[,\s]/g, ''), 10)
  return Number.isFinite(n) ? n : NaN
}

export const mileageService = {
  /**
   * Highest historical odometer reading for a registration, or null when none
   * is on record. Org-scoped.
   */
  async getHistoricalMileageFloor(
    organizationId: string,
    registration: string,
  ): Promise<number | null> {
    if (!organizationId || !registration) return null

    const raw = registration.trim()
    const spaceless = normalizeReg(registration)
    const candidates = Array.from(new Set([raw, spaceless].filter(Boolean)))

    let max = -1

    // Past check-outs (mileage stored as text)
    try {
      const { data, error } = await supabase
        .from('checkout_history')
        .select('mileage, registration')
        .eq('organization_id', organizationId)
        .in('registration', candidates)
      if (error) throw error
      ;(data ?? []).forEach((r) => {
        const m = parseMiles((r as any).mileage)
        if (Number.isFinite(m) && m > max) max = m
      })
    } catch (err) {
      logger.error('getHistoricalMileageFloor: checkout_history failed:', err)
    }

    // Service history (completed bookings + manual records)
    try {
      const last = await vehicleServiceHistoryService.getLastServiceMileage(organizationId, registration)
      if (last && Number.isFinite(last.mileage) && last.mileage > max) max = last.mileage
    } catch (err) {
      logger.error('getHistoricalMileageFloor: service history failed:', err)
    }

    return max >= 0 ? max : null
  },
}
