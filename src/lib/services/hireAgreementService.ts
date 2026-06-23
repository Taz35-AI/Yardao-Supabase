// src/lib/services/hireAgreementService.ts
// Hire agreements (the spine) + their vehicle lines (the proration unit).
// Defensive reads (missing tables → []). End date is computed from start +
// duration via the proration service so it's identical everywhere.

import { supabase } from '@/lib/supabaseClient'
import { toCamel, toCamelList } from '@/lib/dbMap'
import { logger } from '@/lib/logger'
import { prorationService } from '@/lib/services/prorationService'
import { activityLogService } from '@/lib/services/activityLogService'
import type {
  HireAgreement,
  HireAgreementVehicle,
  HireAgreementStatus,
  HireDurationUnit,
  HireRateType,
  HireLineStatus,
} from '@/types/hire'

const AGREEMENTS = 'rental_agreements'
const LINES = 'rental_agreement_vehicles'
const SWAPS = 'rental_swaps'

const nowIso = () => new Date().toISOString()

export const hireAgreementService = {
  // ── Agreements ──────────────────────────────────────────────────────────
  async getAgreements(
    organizationId: string,
    opts?: { statuses?: HireAgreementStatus[] },
  ): Promise<HireAgreement[]> {
    if (!organizationId) return []
    try {
      let q = supabase.from(AGREEMENTS).select('*').eq('organization_id', organizationId)
      if (opts?.statuses?.length) q = q.in('status', opts.statuses)
      const { data, error } = await q.order('start_date', { ascending: false })
      if (error) throw error
      return toCamelList<HireAgreement>(data)
    } catch (err) {
      logger.error('hireAgreementService.getAgreements failed (table may not exist yet):', err)
      return []
    }
  },

  async getAgreementsForCustomer(organizationId: string, customerId: string): Promise<HireAgreement[]> {
    if (!organizationId || !customerId) return []
    try {
      const { data, error } = await supabase
        .from(AGREEMENTS)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('customer_id', customerId)
        .order('start_date', { ascending: false })
      if (error) throw error
      return toCamelList<HireAgreement>(data)
    } catch (err) {
      logger.error('hireAgreementService.getAgreementsForCustomer failed:', err)
      return []
    }
  },

  async createAgreement(input: {
    organizationId: string
    customerId: string
    customerName?: string | null
    reference?: string | null
    branchId?: string | null
    branchName?: string | null
    startDate: string
    durationValue: number
    durationUnit: HireDurationUnit
    rateType: HireRateType
    rateAmount: number
    currency?: string
    notes?: string | null
    createdBy?: string | null
    createdByName?: string | null
  }): Promise<string> {
    const endDate = prorationService.computeEndDate(input.startDate, input.durationValue, input.durationUnit)
    const { data, error } = await supabase
      .from(AGREEMENTS)
      .insert({
        organization_id: input.organizationId,
        customer_id: input.customerId,
        customer_name: input.customerName ?? null,
        reference: input.reference ?? null,
        branch_id: input.branchId ?? null,
        branch_name: input.branchName ?? null,
        start_date: input.startDate,
        duration_value: input.durationValue,
        duration_unit: input.durationUnit,
        end_date: endDate,
        rate_type: input.rateType,
        rate_amount: input.rateAmount,
        currency: input.currency || 'GBP',
        status: 'draft',
        notes: input.notes ?? null,
        created_by: input.createdBy ?? null,
        created_by_name: input.createdByName ?? null,
      })
      .select('id')
      .single()
    if (error) throw error
    return data.id as string
  },

  async updateAgreement(id: string, updates: Record<string, any>): Promise<void> {
    const { error } = await supabase
      .from(AGREEMENTS)
      .update({ ...updates, updated_at: nowIso() })
      .eq('id', id)
    if (error) throw error
  },

  // ── Vehicle lines ─────────────────────────────────────────────────────────
  async getLines(organizationId: string, agreementId: string): Promise<HireAgreementVehicle[]> {
    if (!organizationId || !agreementId) return []
    try {
      const { data, error } = await supabase
        .from(LINES)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('agreement_id', agreementId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return toCamelList<HireAgreementVehicle>(data)
    } catch (err) {
      logger.error('hireAgreementService.getLines failed:', err)
      return []
    }
  },

  async getActiveLines(organizationId: string): Promise<HireAgreementVehicle[]> {
    if (!organizationId) return []
    try {
      const { data, error } = await supabase
        .from(LINES)
        .select('*')
        .eq('organization_id', organizationId)
        .in('status', ['scheduled', 'active'])
      if (error) throw error
      return toCamelList<HireAgreementVehicle>(data)
    } catch (err) {
      logger.error('hireAgreementService.getActiveLines failed:', err)
      return []
    }
  },

  /** Find the open line for a vehicle (used by the set-on-hire interception). */
  async findOpenLineForVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<HireAgreementVehicle | null> {
    if (!organizationId || !vehicleId) return null
    try {
      const { data, error } = await supabase
        .from(LINES)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('vehicle_id', vehicleId)
        .in('status', ['scheduled', 'active'])
        .limit(1)
      if (error) throw error
      return data?.[0] ? toCamel<HireAgreementVehicle>(data[0]) : null
    } catch (err) {
      logger.error('hireAgreementService.findOpenLineForVehicle failed:', err)
      return null
    }
  },

  async attachVehicle(input: {
    organizationId: string
    agreementId: string
    vehicleId: string
    registration: string
    make?: string | null
    model?: string | null
    scheduledStart: string
    scheduledEnd?: string | null
    rateType: HireRateType
    rateAmount: number
    createdBy?: string | null
    createdByName?: string | null
  }): Promise<string> {
    const { data, error } = await supabase
      .from(LINES)
      .insert({
        organization_id: input.organizationId,
        agreement_id: input.agreementId,
        vehicle_id: input.vehicleId,
        registration: input.registration,
        make: input.make ?? null,
        model: input.model ?? null,
        scheduled_start: input.scheduledStart,
        scheduled_end: input.scheduledEnd ?? null,
        status: 'scheduled',
        line_rate_type: input.rateType,
        line_rate_amount: input.rateAmount,
        created_by: input.createdBy ?? null,
        created_by_name: input.createdByName ?? null,
      })
      .select('id')
      .single()
    if (error) throw error
    return data.id as string
  },

  async updateLine(id: string, updates: Record<string, any>): Promise<void> {
    const { error } = await supabase
      .from(LINES)
      .update({ ...updates, updated_at: nowIso() })
      .eq('id', id)
    if (error) throw error
  },

  /**
   * Swap a vehicle on an agreement: close the outgoing line at `swappedAt`, open
   * a new line for the replacement from that date, and log it. (Insurance gating
   * + yard stamping live in the set-on-hire flow, P2+.)
   */
  async swapLine(input: {
    organizationId: string
    agreementId: string
    fromLineId: string
    fromRegistration?: string | null
    toVehicleId: string
    toRegistration: string
    toMake?: string | null
    toModel?: string | null
    swappedAt: string // YYYY-MM-DD
    scheduledEnd?: string | null
    rateType: HireRateType
    rateAmount: number
    reason?: string | null
    performedBy?: string | null
    performedByName?: string | null
  }): Promise<string> {
    // 1. Open the replacement line.
    const toLineId = await this.attachVehicle({
      organizationId: input.organizationId,
      agreementId: input.agreementId,
      vehicleId: input.toVehicleId,
      registration: input.toRegistration,
      make: input.toMake,
      model: input.toModel,
      scheduledStart: input.swappedAt,
      scheduledEnd: input.scheduledEnd ?? null,
      rateType: input.rateType,
      rateAmount: input.rateAmount,
      createdBy: input.performedBy,
      createdByName: input.performedByName,
    })
    // 2. Close the outgoing line at the swap date.
    await this.updateLine(input.fromLineId, {
      status: 'swapped',
      scheduled_end: input.swappedAt,
      actual_return_at: nowIso(),
      swapped_to_line_id: toLineId,
    })
    await this.updateLine(toLineId, { swapped_from_line_id: input.fromLineId })
    // 3. Log the swap.
    try {
      await supabase.from(SWAPS).insert({
        organization_id: input.organizationId,
        agreement_id: input.agreementId,
        from_line_id: input.fromLineId,
        from_registration: input.fromRegistration ?? null,
        to_line_id: toLineId,
        to_registration: input.toRegistration,
        reason: input.reason ?? null,
        performed_by: input.performedBy ?? null,
        performed_by_name: input.performedByName ?? null,
      })
    } catch (err) {
      logger.error('swapLine: swap log failed (non-fatal):', err)
    }
    activityLogService.log({
      organizationId: input.organizationId,
      actionType: 'rental_swap',
      registration: input.toRegistration,
      actorId: input.performedBy,
      actorName: input.performedByName,
      summary: `Swapped ${input.fromRegistration || 'vehicle'} → ${input.toRegistration}${input.reason ? ` (${input.reason})` : ''}`,
      details: { agreementId: input.agreementId },
    })
    return toLineId
  },
}

export type { HireLineStatus }
