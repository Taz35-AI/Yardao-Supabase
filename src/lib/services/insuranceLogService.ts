// src/lib/services/insuranceLogService.ts
// Append-only insurance history. One row per change of insurance status/policy,
// written from every insurance-change path so the Fleet "Insurance Status"
// section can show each vehicle's history at a glance. Defensive: a missing
// table or a failed write must never block the actual vehicle update.

import { supabase } from '@/lib/supabaseClient'
import { toCamelList } from '@/lib/dbMap'
import { logger } from '@/lib/logger'

const TABLE = 'insurance_change_log'

export interface InsuranceChange {
  id: string
  organizationId: string
  vehicleId?: string | null
  registration?: string | null
  make?: string | null
  model?: string | null
  fromStatus?: string | null
  fromPolicyName?: string | null
  toStatus?: string | null
  toPolicyName?: string | null
  changedBy?: string | null
  changedByName?: string | null
  source?: string | null
  note?: string | null
  createdAt: string
}

export interface InsuranceChangeInput {
  organizationId: string
  vehicleId?: string | null
  registration?: string | null
  make?: string | null
  model?: string | null
  fromStatus?: string | null
  fromPolicyName?: string | null
  toStatus?: string | null
  toPolicyName?: string | null
  changedBy?: string | null
  changedByName?: string | null
  source?: string // 'fleet_edit' | 'yard' | 'detail_modal' | 'bulk'
  note?: string | null
}

/** True when the status or the policy name actually changed. */
export function insuranceDidChange(
  fromStatus?: string | null, fromPolicy?: string | null,
  toStatus?: string | null, toPolicy?: string | null,
): boolean {
  const norm = (s?: string | null) => (s || '').trim()
  return norm(fromStatus) !== norm(toStatus) || norm(fromPolicy) !== norm(toPolicy)
}

export const insuranceLogService = {
  async log(entry: InsuranceChangeInput): Promise<void> {
    if (!entry.organizationId) return
    // Skip no-op writes.
    if (!insuranceDidChange(entry.fromStatus, entry.fromPolicyName, entry.toStatus, entry.toPolicyName)) return
    try {
      const { error } = await supabase.from(TABLE).insert({
        organization_id: entry.organizationId,
        vehicle_id: entry.vehicleId ?? null,
        registration: entry.registration ?? null,
        make: entry.make ?? null,
        model: entry.model ?? null,
        from_status: entry.fromStatus ?? null,
        from_policy_name: entry.fromPolicyName ?? null,
        to_status: entry.toStatus ?? null,
        to_policy_name: entry.toPolicyName ?? null,
        changed_by: entry.changedBy ?? null,
        changed_by_name: entry.changedByName ?? null,
        source: entry.source ?? null,
        note: entry.note ?? null,
      })
      if (error) throw error
    } catch (err) {
      logger.error('insuranceLogService.log failed (non-fatal):', err)
    }
  },

  /** History for one vehicle (by fleet id, else by registration), newest first. */
  async getForVehicle(organizationId: string, opts: { vehicleId?: string | null; registration?: string | null }): Promise<InsuranceChange[]> {
    if (!organizationId) return []
    try {
      let q = supabase.from(TABLE).select('*').eq('organization_id', organizationId)
      if (opts.vehicleId) q = q.eq('vehicle_id', opts.vehicleId)
      else if (opts.registration) q = q.eq('registration', opts.registration)
      else return []
      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) throw error
      return toCamelList<InsuranceChange>(data)
    } catch (err) {
      logger.error('insuranceLogService.getForVehicle failed:', err)
      return []
    }
  },

  /** Recent changes org-wide, newest first. */
  async getRecent(organizationId: string, limit = 200): Promise<InsuranceChange[]> {
    if (!organizationId) return []
    try {
      const { data, error } = await supabase
        .from(TABLE).select('*').eq('organization_id', organizationId)
        .order('created_at', { ascending: false }).limit(limit)
      if (error) throw error
      return toCamelList<InsuranceChange>(data)
    } catch (err) {
      logger.error('insuranceLogService.getRecent failed:', err)
      return []
    }
  },
}
