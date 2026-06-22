// src/lib/services/vehicleServiceHistoryService.ts — SUPABASE re-implementation.
//
// ⚠️ Data-layer swap: every export + signature below is kept identical to the
// Firestore version. Only the INTERNALS change.
//
// Per-vehicle service history — read on demand, scoped to ONE vehicle + a
// limit, so it adds negligible read cost (SELECTs, never a listener).
// Booking-sourced rows are DERIVED from completed service_bookings (no copy /
// no migration); manual rows live in the `vehicle_service_history` table
// (new in migration 0013). RLS scopes every query to the caller's org.

import { supabase } from '@/lib/supabaseClient'
import { toCamel, toSnake } from '@/lib/dbMap'
import { logger } from '@/lib/logger'
import {
  ManualServiceHistoryDoc,
  VehicleServiceRecord,
} from '@/types/vehicleServiceHistory'

const SERVICE_BOOKINGS_TABLE = 'service_bookings'
const VEHICLE_SERVICE_HISTORY_TABLE = 'vehicle_service_history'

// UPPER + no whitespace — used for equality matching across spacing variants
export function normalizeReg(reg: string): string {
  return (reg || '').toUpperCase().replace(/\s+/g, '')
}

// timestamptz | Date | 'YYYY-MM-DD' string → 'YYYY-MM-DD'
function toDateStr(value: any, fallback: string): string {
  try {
    if (!value) return fallback
    if (typeof value === 'string') return value.slice(0, 10)
    const d: Date = value instanceof Date ? value : new Date(value)
    if (isNaN(d.getTime())) return fallback
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  } catch {
    return fallback
  }
}

function bookingToRecord(b: any): VehicleServiceRecord {
  const work = Array.isArray(b.workRequired)
    ? b.workRequired.filter(Boolean).join(', ')
    : (b.workRequired || '')
  return {
    id: b.id,
    source: 'booking',
    date: toDateStr(b.completedAt, typeof b.date === 'string' ? b.date : ''),
    locationType: b.isExternalProvider ? 'external' : 'internal',
    garageName: b.externalProvider?.garageName || undefined,
    garageAddress: b.externalProvider?.address || undefined,
    workDone: work,
    mechanicName: b.assignedMechanicName || undefined,
    serviceBay: typeof b.serviceBay === 'number' ? b.serviceBay : undefined,
    branchName: b.originalBranchName || undefined,
    // Internal completions can now capture an odometer reading; external/
    // garage completions still won't have one.
    mileage: typeof b.mileage === 'number' ? b.mileage : undefined,
    notes: b.notes || undefined,
    completedByName: b.completedByName || undefined,
  }
}

function manualToRecord(m: any): VehicleServiceRecord {
  return {
    id: m.id,
    source: 'manual',
    date: (m.date || '').slice(0, 10),
    locationType: m.locationType,
    garageName: m.garageName || undefined,
    workDone: m.workDone || '',
    mechanicName: m.mechanicName || undefined,
    mileage: typeof m.mileage === 'number' ? m.mileage : undefined,
    notes: m.notes || undefined,
    createdByName: m.createdByName || undefined,
  }
}

export const vehicleServiceHistoryService = {
  /**
   * Merged history for ONE vehicle: completed service_bookings (derived,
   * no migration) + manual records. On-demand, capped by `max` per source.
   */
  async getVehicleServiceHistory(params: {
    organizationId: string
    registration: string
    max?: number
  }): Promise<VehicleServiceRecord[]> {
    const { organizationId, registration } = params
    const max = params.max ?? 50
    if (!organizationId || !registration) return []

    const raw = registration.trim()
    const spaceless = normalizeReg(registration)
    // Query the registration as stored, plus the spaceless variant when it
    // differs — one indexed IN query, naturally deduped.
    const regCandidates = Array.from(new Set([raw, spaceless].filter(Boolean)))

    const records: VehicleServiceRecord[] = []
    let bookingOk = false
    let manualOk = false
    let lastErr: unknown = null

    // Booking-sourced (completed only). Isolated so a problem here can't take
    // out the manual records, and vice-versa.
    try {
      const { data, error } = await supabase
        .from(SERVICE_BOOKINGS_TABLE)
        .select('*')
        .eq('organization_id', organizationId)
        .in('registration', regCandidates)
        .eq('status', 'completed')
        .order('date', { ascending: false })
        .limit(max)
      if (error) throw error
      ;(data ?? []).forEach((row) => records.push(bookingToRecord(toCamel<any>(row)!)))
      bookingOk = true
    } catch (err) {
      lastErr = err
      logger.error('Service history: booking query failed:', err)
    }

    // Manual records. Separate table — if it isn't reachable this must NOT
    // wipe out the booking-derived history that is perfectly readable.
    try {
      const { data, error } = await supabase
        .from(VEHICLE_SERVICE_HISTORY_TABLE)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('registration_key', spaceless)
        .order('date', { ascending: false })
        .limit(max)
      if (error) throw error
      ;(data ?? []).forEach((row) => records.push(manualToRecord(toCamel<any>(row)!)))
      manualOk = true
    } catch (err) {
      lastErr = err
      logger.error('Service history: manual query failed:', err)
    }

    // Only surface an error if BOTH sources failed — otherwise show whatever
    // we could read so the tab stays useful.
    if (!bookingOk && !manualOk) {
      throw lastErr instanceof Error
        ? lastErr
        : new Error('Failed to load vehicle service history')
    }

    // Newest first; stable enough on a YYYY-MM-DD string sort
    records.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    return records
  },

  /**
   * The most recent OIL / FULL SERVICE record (booking OR manual) that carries
   * an odometer reading, for one vehicle. Used at check-in to decide whether the
   * vehicle is overdue for a service (current mileage − this >= threshold).
   * Only oil/service-type work counts (keyword match) so a brake or tyre job
   * with a mileage doesn't reset the clock. Returns null when the vehicle has no
   * such record — in which case the caller simply doesn't flag it.
   */
  async getLastServiceMileage(
    organizationId: string,
    registration: string,
  ): Promise<{ mileage: number; date: string } | null> {
    if (!organizationId || !registration) return null
    try {
      const history = await this.getVehicleServiceHistory({ organizationId, registration })
      // Only an OIL / FULL SERVICE resets the service-due clock — not a brake,
      // tyre or clutch job. We keyword-match the work description: "service"
      // catches full/major/minor/interim/annual service; \boil\b catches engine
      // oil, oil filter, oil change, oil & filter (the word boundary stops it
      // matching "coil"). We check both the work-done text and any notes.
      const isServiceWork = (r: VehicleServiceRecord) =>
        /\bservices?\b|\boil\b/i.test(`${r.workDone || ''} ${r.notes || ''}`)
      // history is newest-first; take the most recent service-type record that
      // also carries a usable mileage.
      const withMileage = history.find(
        (r) =>
          typeof r.mileage === 'number' &&
          Number.isFinite(r.mileage) &&
          (r.mileage as number) > 0 &&
          isServiceWork(r),
      )
      if (!withMileage) return null
      return { mileage: withMileage.mileage as number, date: withMileage.date }
    } catch (err) {
      logger.error('getLastServiceMileage failed:', err)
      return null
    }
  },

  async addManualServiceRecord(
    record: Omit<ManualServiceHistoryDoc, 'id' | 'createdAt' | 'updatedAt' | 'registrationKey'>,
  ): Promise<string> {
    const payload = {
      ...toSnake(record),
      registration_key: normalizeReg(record.registration),
    }
    const { data, error } = await supabase
      .from(VEHICLE_SERVICE_HISTORY_TABLE)
      .insert(payload)
      .select('id')
      .single()
    if (error) throw error
    logger.log('🧾 Manual service history added:', data.id)
    return data.id as string
  },

  async updateManualServiceRecord(
    id: string,
    patch: Partial<Omit<ManualServiceHistoryDoc, 'id' | 'organizationId' | 'createdBy' | 'createdByName' | 'createdAt'>>,
  ): Promise<void> {
    const next: Record<string, any> = { ...toSnake(patch) }
    if (typeof patch.registration === 'string') {
      next.registration_key = normalizeReg(patch.registration)
    }
    const { error } = await supabase
      .from(VEHICLE_SERVICE_HISTORY_TABLE)
      .update(next)
      .eq('id', id)
    if (error) throw error
    logger.log('🧾 Manual service history updated:', id)
  },

  async deleteManualServiceRecord(id: string): Promise<void> {
    const { error } = await supabase
      .from(VEHICLE_SERVICE_HISTORY_TABLE)
      .delete()
      .eq('id', id)
    if (error) throw error
    logger.log('🧾 Manual service history deleted:', id)
  },
}
