// src/lib/services/activityLogService.ts
// Append-only activity feed. Every meaningful action calls log() with the actor
// (who did it). Logging must NEVER break the action it records, so log() is
// fire-and-forget and swallows its own errors.

import { supabase } from '@/lib/supabaseClient'
import { toCamelList } from '@/lib/dbMap'
import { logger } from '@/lib/logger'

export type ActivityActionType =
  | 'checkin' | 'checkout'
  | 'status_changed'
  | 'hire' | 'return'
  | 'garage_booking' | 'garage_out' | 'garage_return'
  | 'comment'
  | 'condition_changed' | 'contract_changed' | 'insurance_changed'
  | 'vehicle_added' | 'defleet'
  | 'registration_changed'
  | 'transfer'
  | 'rental_on_hire' | 'rental_swap' | 'rental_end' | 'rental_temp_return' | 'rental_renew'
  | 'rental_extend' | 'rental_split_renew'

export interface ActivityRecord {
  id: string
  organizationId: string
  actorId: string | null
  actorName: string | null
  actionType: ActivityActionType
  entityType: string
  entityId: string | null
  registration: string | null
  summary: string
  details: any | null
  branchId: string | null
  createdAt: string
}

export interface LogActivityInput {
  organizationId: string
  actorId?: string | null
  actorName?: string | null
  actionType: ActivityActionType
  summary: string
  registration?: string | null
  entityId?: string | null
  entityType?: string
  branchId?: string | null
  details?: Record<string, any> | null
}

const TABLE = 'activity_log'

export const activityLogService = {
  /**
   * Record one activity event. Fire-and-forget: never throws, never blocks the
   * caller's main action. Returns a promise you may optionally await in tests.
   */
  async log(input: LogActivityInput): Promise<void> {
    try {
      if (!input.organizationId || !input.actionType || !input.summary) return
      const row = {
        organization_id: input.organizationId,
        actor_id: input.actorId ?? null,
        actor_name: input.actorName ?? null,
        action_type: input.actionType,
        entity_type: input.entityType ?? 'vehicle',
        entity_id: input.entityId ?? null,
        registration: input.registration ? String(input.registration).toUpperCase() : null,
        summary: input.summary,
        branch_id: input.branchId ?? null,
        details: input.details ?? null,
      }
      const { error } = await supabase.from(TABLE).insert(row)
      if (error) logger.warn('activityLog insert failed (non-fatal):', error.message)
    } catch (e) {
      logger.warn('activityLog log() threw (non-fatal):', e)
    }
  },

  /** Latest N events for an organisation, newest first. */
  async getRecent(organizationId: string, limit = 20): Promise<ActivityRecord[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) { logger.error('activityLog getRecent failed:', error.message); return [] }
    return toCamelList<ActivityRecord>(data)
  },

  /**
   * Full event timeline for ONE vehicle (matched by registration), within the
   * last `days`, newest first. Powers the Fleet "Movement History" tab and the
   * Reports vehicle-history export.
   */
  async getForVehicle(
    organizationId: string,
    registration: string,
    days = 365,
    limit = 500,
  ): Promise<ActivityRecord[]> {
    if (!organizationId || !registration) return []
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('organization_id', organizationId)
      .eq('registration', registration.toUpperCase())
      .gte('created_at', cutoff.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) { logger.error('activityLog getForVehicle failed:', error.message); return [] }
    return toCamelList<ActivityRecord>(data)
  },

  /** Live subscription — fires onChange on any insert for this org. Returns an unsubscribe fn. */
  subscribe(organizationId: string, onChange: () => void): () => void {
    const channel = supabase
      .channel(`activity_log:${organizationId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: TABLE, filter: `organization_id=eq.${organizationId}` },
        () => onChange(),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  },
}
