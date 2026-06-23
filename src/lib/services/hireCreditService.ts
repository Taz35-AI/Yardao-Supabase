// src/lib/services/hireCreditService.ts
// Suggested credits (downtime / early return) for hire lines. Visibility only —
// a manager approves before they reach the export. Idempotent per
// (line, reason, period_start). Defensive: missing table → [].

import { supabase } from '@/lib/supabaseClient'
import { toCamelList } from '@/lib/dbMap'
import { logger } from '@/lib/logger'
import { prorationService } from '@/lib/services/prorationService'
import type { HireCredit, HireCreditReason, HireCreditStatus, HireRateType } from '@/types/hire'

const TABLE = 'rental_credits'
const nowIso = () => new Date().toISOString()

export const hireCreditService = {
  async getCredits(organizationId: string, statuses?: HireCreditStatus[]): Promise<HireCredit[]> {
    if (!organizationId) return []
    try {
      let q = supabase.from(TABLE).select('*').eq('organization_id', organizationId)
      if (statuses?.length) q = q.in('status', statuses)
      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) throw error
      return toCamelList<HireCredit>(data)
    } catch (err) {
      logger.error('hireCreditService.getCredits failed (table may not exist yet):', err)
      return []
    }
  },

  async getCreditsForAgreement(organizationId: string, agreementId: string): Promise<HireCredit[]> {
    if (!organizationId || !agreementId) return []
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('agreement_id', agreementId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return toCamelList<HireCredit>(data)
    } catch (err) {
      logger.error('hireCreditService.getCreditsForAgreement failed:', err)
      return []
    }
  },

  /**
   * Suggest a credit for a downtime / early-return window on a line. Calendar-
   * accurate estimate. Idempotent (upsert on the unique window) and never
   * overwrites a manager's decision.
   */
  async suggestCredit(input: {
    organizationId: string
    agreementId: string
    lineId: string
    vehicleId?: string | null
    registration?: string | null
    reason: HireCreditReason
    periodStart: string // YYYY-MM-DD
    periodEnd: string // YYYY-MM-DD (exclusive)
    rateType: HireRateType
    rateAmount: number
  }): Promise<void> {
    const days = prorationService.dayCount(input.periodStart, input.periodEnd)
    if (days <= 0) return
    const estimated = prorationService.prorate(input.rateType, input.rateAmount, input.periodStart, input.periodEnd)
    try {
      const { error } = await supabase.from(TABLE).upsert(
        {
          organization_id: input.organizationId,
          agreement_id: input.agreementId,
          line_id: input.lineId,
          vehicle_id: input.vehicleId ?? null,
          registration: input.registration ?? null,
          reason: input.reason,
          period_start: input.periodStart,
          period_end: input.periodEnd,
          days,
          daily_rate: days > 0 ? Math.round((estimated / days) * 100) / 100 : null,
          estimated_credit: estimated,
        },
        { onConflict: 'organization_id,line_id,reason,period_start', ignoreDuplicates: true },
      )
      if (error) throw error
    } catch (err) {
      logger.error('hireCreditService.suggestCredit failed:', err)
    }
  },

  async setStatus(
    id: string,
    status: HireCreditStatus,
    reviewedBy?: string | null,
    reviewedByName?: string | null,
    notes?: string | null,
  ): Promise<void> {
    const { error } = await supabase
      .from(TABLE)
      .update({
        status,
        reviewed_by: reviewedBy ?? null,
        reviewed_by_name: reviewedByName ?? null,
        notes: notes ?? null,
        updated_at: nowIso(),
      })
      .eq('id', id)
    if (error) throw error
  },
}
