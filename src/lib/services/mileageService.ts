// src/lib/services/mileageService.ts
// Gold-standard odometer history (migration 0044).
//
// One append-only log — public.mileage_readings — is the single source of truth
// for a vehicle's mileage over time. It powers:
//   • the anti-clocking floor (a new reading can't be below any prior one),
//   • the per-vehicle mileage timeline,
//   • the vehicles.last_recorded_mileage cache (latest reading).
//
// Every capture point (check-in, return-from-hire, edit, service) appends one
// row via recordReading(); reads use getMileageFloor() / getReadings().

import { supabase } from '@/lib/supabaseClient'
import { normalizeReg } from '@/lib/utils/registration'
import { logger } from '@/lib/logger'

const TABLE = 'mileage_readings'

export type MileageSource = 'check_in' | 'quick_check_in' | 'edit' | 'service' | 'manual'

export interface MileageReading {
  id: string
  mileage: number
  recordedAt: string
  source: string
  recordedByName?: string | null
  notes?: string | null
}

function parseMiles(v: any): number {
  const n = parseInt(String(v ?? '').replace(/[,\s]/g, ''), 10)
  return Number.isFinite(n) ? n : NaN
}

export const mileageService = {
  /**
   * Highest odometer reading on record for a registration (the anti-clocking
   * floor). Pass `beforeIso` to consider only readings recorded before that
   * moment — the Edit form uses the vehicle's check-in time so it can still
   * correct the current stay's value down to the true historical floor.
   * Returns null when there's no reading on record.
   */
  async getMileageFloor(
    organizationId: string,
    registration: string,
    beforeIso?: string,
  ): Promise<number | null> {
    if (!organizationId || !registration) return null
    const key = normalizeReg(registration)
    try {
      let q = supabase
        .from(TABLE)
        .select('mileage')
        .eq('organization_id', organizationId)
        .eq('registration_key', key)
      if (beforeIso) q = q.lt('recorded_at', beforeIso)
      const { data, error } = await q
      if (error) throw error
      let max = -1
      ;(data ?? []).forEach((r) => {
        const m = Number((r as any).mileage)
        if (Number.isFinite(m) && m > max) max = m
      })
      return max >= 0 ? max : null
    } catch (err) {
      logger.error('getMileageFloor failed:', err)
      return null
    }
  },

  /** Recent readings for the per-vehicle timeline (newest first). */
  async getReadings(
    organizationId: string,
    registration: string,
    limit = 20,
  ): Promise<MileageReading[]> {
    if (!organizationId || !registration) return []
    const key = normalizeReg(registration)
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('registration_key', key)
        .order('recorded_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []).map((r: any) => ({
        id: r.id,
        mileage: Number(r.mileage),
        recordedAt: r.recorded_at,
        source: r.source,
        recordedByName: r.recorded_by_name,
        notes: r.notes,
      }))
    } catch (err) {
      logger.error('getReadings failed:', err)
      return []
    }
  },

  /**
   * Append a reading to the log and refresh the vehicle's cache. Best-effort —
   * never throws to the caller, so a logging hiccup can't break a check-in.
   * Silently ignores non-numeric / non-positive readings (e.g. "odometer not
   * available").
   */
  async recordReading(params: {
    organizationId: string
    registration: string
    mileage: number | string
    source: MileageSource
    vehicleId?: string | null
    recordedBy?: string | null
    recordedByName?: string | null
    notes?: string | null
  }): Promise<void> {
    const { organizationId, registration, source } = params
    const miles = parseMiles(params.mileage)
    if (!organizationId || !registration || !Number.isFinite(miles) || miles <= 0) return
    const key = normalizeReg(registration)
    try {
      const { error } = await supabase.from(TABLE).insert({
        organization_id: organizationId,
        vehicle_id: params.vehicleId || null,
        registration,
        registration_key: key,
        mileage: miles,
        source,
        recorded_by: params.recordedBy || null,
        recorded_by_name: params.recordedByName || null,
        notes: params.notes || null,
      })
      if (error) throw error

      // Refresh the fleet cache to this (latest) reading. Only when we have the
      // fleet vehicle id — custom/non-fleet vehicles have no record to cache.
      if (params.vehicleId) {
        await supabase
          .from('vehicles')
          .update({ last_recorded_mileage: miles, last_mileage_at: new Date().toISOString() })
          .eq('id', params.vehicleId)
      }
    } catch (err) {
      logger.warn('recordReading skipped:', err)
    }
  },
}
