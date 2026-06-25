// src/lib/services/hireAgreementService.ts
// Hire agreements (the spine) + their vehicle lines (the proration unit).
// Defensive reads (missing tables → []). End date is computed from start +
// duration via the proration service so it's identical everywhere.

import { supabase } from '@/lib/supabaseClient'
import { toCamel, toCamelList } from '@/lib/dbMap'
import { logger } from '@/lib/logger'
import { prorationService } from '@/lib/services/prorationService'
import { activityLogService } from '@/lib/services/activityLogService'
import { hireCreditService } from '@/lib/services/hireCreditService'
import { VehicleHireService } from '@/lib/services/vehicleHireService'
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

  /**
   * Resolve a set of line ids → the hire customer name on each line's agreement.
   * Used by the yard "Out on Hire" list to show who a contract vehicle is with.
   * Returns { lineId: customerName }. Defensive: missing tables → {}.
   */
  async getCustomerNamesByLineIds(
    organizationId: string,
    lineIds: string[],
  ): Promise<Record<string, string>> {
    const out: Record<string, string> = {}
    const ids = lineIds.filter(Boolean)
    if (!organizationId || ids.length === 0) return out
    try {
      // SECURITY DEFINER RPC (migration 0050): returns ONLY line_id -> customer
      // name for the caller's org, so non-hire staff still get the yard chip even
      // though the rental_* tables themselves are locked to granted users.
      const { data, error } = await supabase.rpc('hire_customer_names_for_lines', { line_ids: ids })
      if (error) throw error
      for (const r of (data ?? []) as { line_id: string; customer_name: string | null }[]) {
        if (r.customer_name) out[r.line_id] = r.customer_name
      }
    } catch (err) {
      logger.error('hireAgreementService.getCustomerNamesByLineIds failed:', err)
    }
    return out
  },

  async getAgreement(id: string): Promise<HireAgreement | null> {
    try {
      const { data, error } = await supabase.from(AGREEMENTS).select('*').eq('id', id).single()
      if (error) throw error
      return toCamel<HireAgreement>(data)
    } catch (err) {
      logger.error('hireAgreementService.getAgreement failed:', err)
      return null
    }
  },

  /** Open (scheduled/active) line for a registration — used by the yard
   *  set-on-hire interception. Matches on the normalised registration. */
  async findOpenLineByRegistration(
    organizationId: string,
    registration: string,
  ): Promise<HireAgreementVehicle | null> {
    if (!organizationId || !registration) return null
    const norm = registration.toUpperCase().replace(/\s+/g, '')
    try {
      const { data, error } = await supabase
        .from(LINES)
        .select('*')
        .eq('organization_id', organizationId)
        .in('status', ['scheduled', 'active'])
      if (error) throw error
      const hit = (data ?? []).find(
        (r) => (r.registration || '').toUpperCase().replace(/\s+/g, '') === norm,
      )
      return hit ? toCamel<HireAgreementVehicle>(hit) : null
    } catch (err) {
      logger.error('hireAgreementService.findOpenLineByRegistration failed:', err)
      return null
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

  /**
   * Edit a contract's core details and CASCADE the single contract rate to every
   * vehicle line (the rate is always per-vehicle and identical across the
   * contract). End date is recomputed from start + duration.
   */
  async updateAgreementDetails(input: {
    organizationId: string
    agreementId: string
    reference?: string | null
    startDate: string
    durationValue: number
    durationUnit: HireDurationUnit
    rateType: HireRateType
    rateAmount: number
  }): Promise<void> {
    const endDate = prorationService.computeEndDate(input.startDate, input.durationValue, input.durationUnit)
    const { error } = await supabase
      .from(AGREEMENTS)
      .update({
        reference: input.reference ?? null,
        start_date: input.startDate,
        duration_value: input.durationValue,
        duration_unit: input.durationUnit,
        end_date: endDate,
        rate_type: input.rateType,
        rate_amount: input.rateAmount,
        updated_at: nowIso(),
      })
      .eq('organization_id', input.organizationId)
      .eq('id', input.agreementId)
    if (error) throw error
    // Cascade the contract rate to all vehicle lines (every vehicle = full rate).
    const { error: lerr } = await supabase
      .from(LINES)
      .update({ line_rate_type: input.rateType, line_rate_amount: input.rateAmount, updated_at: nowIso() })
      .eq('organization_id', input.organizationId)
      .eq('agreement_id', input.agreementId)
    if (lerr) throw lerr
  },

  /**
   * Delete a whole contract. Lines, swaps and credits cascade via FK. Any vehicle
   * currently OUT ON HIRE on this contract is RETURNED to the yard (proper
   * check-in: hire_status → In Yard, original status restored), then every yard
   * link to this contract's lines is cleared (plain column, no FK).
   */
  async deleteAgreement(
    organizationId: string,
    agreementId: string,
    opts?: { actorId?: string | null; actorName?: string | null },
  ): Promise<void> {
    try {
      const { data: lines } = await supabase
        .from(LINES)
        .select('id')
        .eq('organization_id', organizationId)
        .eq('agreement_id', agreementId)
      const ids = (lines ?? []).map((l) => l.id)
      if (ids.length) {
        // Return any on-hire vehicles to the yard via the normal check-in path.
        const { data: rows } = await supabase
          .from('checked_in_vehicles')
          .select('id, hire_status')
          .eq('organization_id', organizationId)
          .in('current_agreement_line_id', ids)
        for (const r of rows ?? []) {
          if (r.hire_status === 'Out on Hire') {
            try {
              await VehicleHireService.quickCheckIn(r.id, opts?.actorId || '', opts?.actorName || 'System')
            } catch (err) {
              logger.error('deleteAgreement: returning vehicle to yard failed (non-fatal):', err)
            }
          }
        }
        // Clear the (now stale) contract link on every linked yard row.
        await supabase
          .from('checked_in_vehicles')
          .update({ current_agreement_line_id: null })
          .eq('organization_id', organizationId)
          .in('current_agreement_line_id', ids)
      }
    } catch (err) {
      logger.error('deleteAgreement: yard cleanup failed (non-fatal):', err)
    }
    const { error } = await supabase
      .from(AGREEMENTS)
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', agreementId)
    if (error) throw error
  },

  /**
   * Remove a single vehicle line from a contract. If that vehicle is currently
   * out on hire it is RETURNED to the yard first, then its yard link is cleared.
   */
  async removeLine(
    organizationId: string,
    lineId: string,
    opts?: { actorId?: string | null; actorName?: string | null },
  ): Promise<void> {
    try {
      const { data: rows } = await supabase
        .from('checked_in_vehicles')
        .select('id, hire_status')
        .eq('organization_id', organizationId)
        .eq('current_agreement_line_id', lineId)
      for (const r of rows ?? []) {
        if (r.hire_status === 'Out on Hire') {
          try {
            await VehicleHireService.quickCheckIn(r.id, opts?.actorId || '', opts?.actorName || 'System')
          } catch (err) {
            logger.error('removeLine: returning vehicle to yard failed (non-fatal):', err)
          }
        }
      }
      await supabase
        .from('checked_in_vehicles')
        .update({ current_agreement_line_id: null })
        .eq('organization_id', organizationId)
        .eq('current_agreement_line_id', lineId)
    } catch (err) {
      logger.error('removeLine: clearing yard link failed (non-fatal):', err)
    }
    const { error } = await supabase
      .from(LINES)
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', lineId)
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

  /**
   * Guard: a vehicle may only ever be on ONE open (scheduled/active) hire line.
   * Throws VEHICLE_ALREADY_ON_HIRE — naming the existing customer/contract — if
   * it's already committed elsewhere, so it can never be double-booked across
   * two customers or two agreements.
   */
  async assertVehicleAvailable(
    organizationId: string,
    vehicleId: string,
    registration: string,
  ): Promise<void> {
    const clash =
      (await this.findOpenLineForVehicle(organizationId, vehicleId)) ||
      (await this.findOpenLineByRegistration(organizationId, registration))
    if (!clash) return
    let holder = ''
    try {
      const ag = await this.getAgreement(clash.agreementId)
      if (ag) holder = ag.customerName ? ` (${ag.customerName}${ag.reference ? ` · ${ag.reference}` : ''})` : ''
    } catch {
      /* best-effort label */
    }
    const err = new Error(
      `${registration} is already on an open hire${holder}. Return or swap it before hiring it again.`,
    ) as Error & { code?: string; clash?: HireAgreementVehicle }
    err.code = 'VEHICLE_ALREADY_ON_HIRE'
    err.clash = clash
    throw err
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
    // Never double-book a vehicle across customers/agreements.
    await this.assertVehicleAvailable(input.organizationId, input.vehicleId, input.registration)
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

  /** Activate a line (set on hire). Stamps actual_out_at; best-effort yard stamp. */
  async setLineOnHire(params: {
    organizationId: string
    lineId: string
    registration?: string | null
    actualOutAt?: string // ISO; defaults to now
    checkedInVehicleId?: string | null
    actorId?: string | null
    actorName?: string | null
  }): Promise<void> {
    const outAt = params.actualOutAt || nowIso()
    await this.updateLine(params.lineId, { status: 'active', actual_out_at: outAt })
    if (params.checkedInVehicleId) {
      try {
        await supabase
          .from('checked_in_vehicles')
          .update({ current_agreement_line_id: params.lineId, hire_status: 'Out on Hire' })
          .eq('id', params.checkedInVehicleId)
      } catch (err) {
        logger.error('setLineOnHire yard stamp failed (non-fatal):', err)
      }
    }
    activityLogService.log({
      organizationId: params.organizationId,
      actionType: 'rental_on_hire',
      registration: params.registration ?? null,
      actorId: params.actorId,
      actorName: params.actorName,
      summary: 'Set on hire',
      details: { lineId: params.lineId },
    })
  },

  /**
   * End a line (end of hire). Stamps the return, marks it returned, and SUGGESTS
   * a calendar-accurate credit for the unused remainder of the current billing
   * period (e.g. weekly 23–29 returned 25 → credit [25, 30)).
   */
  async endLine(params: {
    organizationId: string
    agreementId: string
    lineId: string
    vehicleId?: string | null
    registration?: string | null
    periodStart: string // line actual-out (or scheduled start) — period anchor
    rateType: HireRateType
    rateAmount: number
    actualReturnAt?: string // ISO; defaults to now
    checkedInVehicleId?: string | null
    actorId?: string | null
    actorName?: string | null
  }): Promise<void> {
    const returnAt = params.actualReturnAt || nowIso()
    await this.updateLine(params.lineId, { status: 'returned', actual_return_at: returnAt })
    if (params.checkedInVehicleId) {
      try {
        await supabase
          .from('checked_in_vehicles')
          .update({ current_agreement_line_id: null, hire_status: 'In Yard' })
          .eq('id', params.checkedInVehicleId)
      } catch (err) {
        logger.error('endLine yard reset failed (non-fatal):', err)
      }
    }
    // Suggest a prorated credit for the unused remainder of the current period.
    const returnDay = (returnAt.length <= 10 ? returnAt : returnAt.slice(0, 10))
    const periodEnd = prorationService.currentPeriodEnd(params.periodStart, params.rateType, returnDay)
    if (prorationService.dayCount(returnDay, periodEnd) > 0) {
      await hireCreditService.suggestCredit({
        organizationId: params.organizationId,
        agreementId: params.agreementId,
        lineId: params.lineId,
        vehicleId: params.vehicleId,
        registration: params.registration,
        reason: 'early_return',
        periodStart: returnDay,
        periodEnd,
        rateType: params.rateType,
        rateAmount: params.rateAmount,
      })
    }
    activityLogService.log({
      organizationId: params.organizationId,
      actionType: 'rental_end',
      registration: params.registration ?? null,
      actorId: params.actorId,
      actorName: params.actorName,
      summary: 'End of hire — vehicle returned',
      details: { lineId: params.lineId },
    })
  },

  /**
   * Temporary return — the vehicle comes back to the yard but the hire stays
   * active (allocation persists, line stays 'active'). Re-stamps the yard link
   * (check-in cleared it) and logs it; downtime/credit can be reviewed later.
   */
  async markTempReturn(params: {
    organizationId: string
    lineId: string
    registration?: string | null
    checkedInVehicleId?: string | null
    actorId?: string | null
    actorName?: string | null
  }): Promise<void> {
    if (params.checkedInVehicleId) {
      try {
        await supabase
          .from('checked_in_vehicles')
          .update({ current_agreement_line_id: params.lineId })
          .eq('id', params.checkedInVehicleId)
      } catch (err) {
        logger.error('markTempReturn relink failed (non-fatal):', err)
      }
    }
    activityLogService.log({
      organizationId: params.organizationId,
      actionType: 'rental_temp_return',
      registration: params.registration ?? null,
      actorId: params.actorId,
      actorName: params.actorName,
      summary: 'Temporary return — vehicle in yard, allocation kept',
      details: { lineId: params.lineId },
    })
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
    // 2b. Free the OUTGOING vehicle's agreement link (its line is now closed).
    //     Its physical return to the yard is done via the normal check-in flow;
    //     we only clear the stale link so it isn't left pointing at a dead line.
    try {
      await supabase
        .from('checked_in_vehicles')
        .update({ current_agreement_line_id: null })
        .eq('organization_id', input.organizationId)
        .eq('current_agreement_line_id', input.fromLineId)
    } catch (err) {
      logger.error('swapLine: clearing outgoing link failed (non-fatal):', err)
    }
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
