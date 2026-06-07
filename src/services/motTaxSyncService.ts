// src/services/motTaxSyncService.ts — Fleet → Yard cascade for MOT & road-tax expiry.
//
// "Fleet page is the bible": whenever a vehicle's MOT or tax expiry changes in
// the fleet (single edit OR bulk road-tax update), the matching checked-in
// (yard) rows must follow automatically — so staff never have to re-run the
// same check from the Yard page.
//
// Matching is ID-FIRST (checked_in_vehicles.vehicle_id = the fleet vehicle's
// stable uuid) with a registration fallback for any legacy rows missing the id.
// Only the fields actually supplied are written, so a tax-only update never
// clobbers a yard row's MOT (and vice-versa).
//
// NOTE: this covers the client-side write paths. The server-side DVLA bulk
// refresh (edge function) is covered by the DB trigger in
// supabase/migrations/0033_cascade_mot_tax.sql, which enforces the same
// invariant for ANY write to vehicles.mot_expiry / vehicles.tax_expiry.

import { supabase } from '@/lib/supabaseClient'
import { logger } from '@/lib/logger'

const VEHICLES = 'vehicles'
const CHECKED_IN = 'checked_in_vehicles'

export interface MotTaxSyncData {
  // Pass only the field(s) you changed. `null` clears the date.
  motExpiry?: string | null
  taxExpiry?: string | null
}

export interface MotTaxSyncResult {
  success: boolean
  updatedYardRecords: number
  error?: string
  method?: 'id-based' | 'registration-based' | 'bulk'
}

// Build the snake_case patch from the supplied (camelCase) fields. Returns null
// if nothing meaningful was supplied (so callers can skip the write).
function buildPatch(data: MotTaxSyncData): Record<string, any> | null {
  const patch: Record<string, any> = {}
  if ('motExpiry' in data) patch.mot_expiry = data.motExpiry || null
  if ('taxExpiry' in data) patch.tax_expiry = data.taxExpiry || null
  return Object.keys(patch).length ? patch : null
}

export class MotTaxSyncService {
  /**
   * Cascade MOT/tax from a single fleet vehicle to its yard records.
   * ID-first; falls back to registration only when no id match is found.
   */
  static async syncFromFleetToYard(
    vehicleId: string,
    registration: string | undefined,
    data: MotTaxSyncData,
    organizationId: string,
    userId: string,
    userDisplayName: string,
  ): Promise<MotTaxSyncResult> {
    const patch = buildPatch(data)
    if (!patch) return { success: true, updatedYardRecords: 0, method: 'id-based' }

    try {
      // 1) ID-based match (the stable, reg-change-proof link).
      const { data: byId, error: idErr } = await supabase
        .from(CHECKED_IN)
        .update({ ...patch, last_edit_log: this.editLog(patch, userId, userDisplayName, 'fleet_to_yard_id') })
        .eq('organization_id', organizationId)
        .eq('vehicle_id', vehicleId)
        .select('id')
      if (idErr) throw idErr

      if (byId && byId.length > 0) {
        logger.log(`✅ MOT/tax cascaded to ${byId.length} yard record(s) by id`)
        return { success: true, updatedYardRecords: byId.length, method: 'id-based' }
      }

      // 2) Registration fallback (legacy rows with null vehicle_id).
      const cleanReg = (registration || '').trim().toUpperCase()
      if (!cleanReg) return { success: true, updatedYardRecords: 0, method: 'id-based' }

      const { data: byReg, error: regErr } = await supabase
        .from(CHECKED_IN)
        .update({ ...patch, last_edit_log: this.editLog(patch, userId, userDisplayName, 'fleet_to_yard_registration') })
        .eq('organization_id', organizationId)
        .eq('registration', cleanReg)
        .select('id')
      if (regErr) throw regErr

      const n = byReg?.length ?? 0
      if (n) logger.log(`✅ MOT/tax cascaded to ${n} yard record(s) by registration`)
      return { success: true, updatedYardRecords: n, method: 'registration-based' }
    } catch (error) {
      logger.error('❌ MOT/tax fleet→yard sync failed:', error)
      return {
        success: false,
        updatedYardRecords: 0,
        error: error instanceof Error ? error.message : 'MOT/tax sync failed',
      }
    }
  }

  /**
   * Bulk cascade for the fleet "bulk road tax / MOT" actions. Updates every
   * yard row whose vehicle_id is in `vehicleIds` in a single statement.
   */
  static async bulkSyncToYard(
    organizationId: string,
    vehicleIds: string[],
    data: MotTaxSyncData,
    userId: string,
    userDisplayName: string,
  ): Promise<MotTaxSyncResult> {
    const patch = buildPatch(data)
    if (!patch || vehicleIds.length === 0) {
      return { success: true, updatedYardRecords: 0, method: 'bulk' }
    }
    try {
      const { data: updated, error } = await supabase
        .from(CHECKED_IN)
        .update({ ...patch, last_edit_log: this.editLog(patch, userId, userDisplayName, 'fleet_bulk') })
        .eq('organization_id', organizationId)
        .in('vehicle_id', vehicleIds)
        .select('id')
      if (error) throw error

      const n = updated?.length ?? 0
      logger.log(`✅ Bulk MOT/tax cascaded to ${n} yard record(s)`)
      return { success: true, updatedYardRecords: n, method: 'bulk' }
    } catch (error) {
      logger.error('❌ Bulk MOT/tax fleet→yard sync failed:', error)
      return {
        success: false,
        updatedYardRecords: 0,
        error: error instanceof Error ? error.message : 'Bulk MOT/tax sync failed',
      }
    }
  }

  private static editLog(
    patch: Record<string, any>,
    userId: string,
    userDisplayName: string,
    source: string,
  ) {
    const parts: string[] = []
    if ('mot_expiry' in patch) parts.push(`MOT → ${patch.mot_expiry ?? 'cleared'}`)
    if ('tax_expiry' in patch) parts.push(`Road tax → ${patch.tax_expiry ?? 'cleared'}`)
    return {
      action: `${parts.join(', ')} (fleet sync)`,
      editedBy: userId,
      editedByName: userDisplayName,
      editedAt: new Date().toISOString(),
      changes: { ...patch, syncSource: source },
    }
  }
}
