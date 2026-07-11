// src/lib/services/hireChargeService.ts
// PCNs & damages charge ledger (migration 0062). One row per chargeable
// incident on a hire vehicle, linked customer + agreement + vehicle, with the
// money breakdown (base + admin fee + VAT = total) and settlement status.
// Also home to the deterministic PCN paste-parser (email/Excel lists → rows).
// Defensive: missing table → [] / safe defaults, mirroring the other hire services.

import { supabase } from '@/lib/supabaseClient'
import { toCamelList } from '@/lib/dbMap'
import { logger } from '@/lib/logger'
import { normChargeReg } from '@/lib/services/hireChargeParse'
import type {
  HireCharge,
  HireChargeStatus,
  HireChargeType,
  HirePcnKind,
} from '@/types/hire'

// Pure helpers (parser + money) live in hireChargeParse.ts — re-exported here
// so UI code has a single import point.
export { VAT_RATE, computeChargeMoney, parsePcnPaste, type ParsedPcnRow } from '@/lib/services/hireChargeParse'

const CHARGES = 'rental_charges'
const LINES = 'rental_agreement_vehicles'
const AGREEMENTS = 'rental_agreements'

const nowIso = () => new Date().toISOString()
const normReg = normChargeReg

// ── Customer/contract resolution ─────────────────────────────────────────────

export interface HireChargeCandidate {
  lineId: string
  agreementId: string
  agreementReference: string | null
  customerId: string | null
  customerName: string | null
  registration: string
  activeNow: boolean
  coversDate: boolean
}

export const hireChargeService = {
  /**
   * Who could be liable for a charge on this reg? Scans the agreement lines for
   * the registration; when an incident date is given, lines whose hire window
   * covers it rank first, then currently-active lines, then most recent.
   */
  async getCandidatesForReg(
    organizationId: string,
    registration: string,
    incidentDate?: string | null,
  ): Promise<HireChargeCandidate[]> {
    if (!organizationId || !registration) return []
    const target = normReg(registration)
    try {
      const { data, error } = await supabase
        .from(LINES)
        .select('*')
        .eq('organization_id', organizationId)
        .in('status', ['scheduled', 'active', 'returned', 'swapped'])
      if (error) throw error
      const lines = toCamelList<any>(data).filter(
        (l) => normReg(l.registration || '') === target,
      )
      if (lines.length === 0) return []

      const agreementIds = Array.from(new Set(lines.map((l) => l.agreementId).filter(Boolean)))
      const { data: agRows, error: agErr } = await supabase
        .from(AGREEMENTS)
        .select('id, reference, customer_id, customer_name')
        .in('id', agreementIds)
      if (agErr) throw agErr
      const agById = new Map(toCamelList<any>(agRows).map((a) => [a.id, a]))

      const dayMs = 86_400_000
      const candidates: HireChargeCandidate[] = lines.map((l) => {
        const ag = agById.get(l.agreementId)
        const outMs = l.actualOutAt ? new Date(l.actualOutAt).getTime() : null
        const retMs = l.actualReturnAt ? new Date(l.actualReturnAt).getTime() : null
        let coversDate = false
        if (incidentDate && outMs !== null) {
          const d = new Date(`${incidentDate}T12:00:00`).getTime()
          coversDate = d >= outMs - dayMs && (retMs === null ? l.status === 'active' : d <= retMs + dayMs)
        }
        return {
          lineId: l.id,
          agreementId: l.agreementId,
          agreementReference: ag?.reference ?? null,
          customerId: ag?.customerId ?? null,
          customerName: ag?.customerName ?? null,
          registration: l.registration || target,
          activeNow: l.status === 'active',
          coversDate,
        }
      })
      candidates.sort((a, b) => {
        if (a.coversDate !== b.coversDate) return a.coversDate ? -1 : 1
        if (a.activeNow !== b.activeNow) return a.activeNow ? -1 : 1
        return 0
      })
      return candidates
    } catch (err) {
      logger.error('hireChargeService.getCandidatesForReg failed:', err)
      return []
    }
  },

  async getCharges(organizationId: string): Promise<HireCharge[]> {
    if (!organizationId) return []
    try {
      const { data, error } = await supabase
        .from(CHARGES)
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return toCamelList<HireCharge>(data)
    } catch (err) {
      logger.error('hireChargeService.getCharges failed (run migration 0062?):', err)
      return []
    }
  },

  async createCharge(input: {
    organizationId: string
    chargeType: HireChargeType
    pcnKind?: HirePcnKind | null
    reference?: string | null
    issuer?: string | null
    registration?: string | null
    vehicleId?: string | null
    customerId?: string | null
    customerName?: string | null
    agreementId?: string | null
    agreementReference?: string | null
    lineId?: string | null
    incidentDate?: string | null
    description?: string | null
    baseAmount: number
    adminFee: number
    vatAmount: number
    totalAmount: number
    status?: HireChargeStatus
    notes?: string | null
    createdBy?: string | null
    createdByName?: string | null
  }): Promise<string> {
    const { data, error } = await supabase
      .from(CHARGES)
      .insert({
        organization_id: input.organizationId,
        charge_type: input.chargeType,
        pcn_kind: input.chargeType === 'pcn' ? input.pcnKind ?? null : null,
        reference: input.reference?.trim() || null,
        issuer: input.issuer?.trim() || null,
        registration: input.registration ? normReg(input.registration) : null,
        vehicle_id: input.vehicleId ?? null,
        customer_id: input.customerId ?? null,
        customer_name: input.customerName ?? null,
        agreement_id: input.agreementId ?? null,
        agreement_reference: input.agreementReference ?? null,
        line_id: input.lineId ?? null,
        incident_date: input.incidentDate || null,
        description: input.description?.trim() || null,
        base_amount: input.baseAmount,
        admin_fee: input.adminFee,
        vat_amount: input.vatAmount,
        total_amount: input.totalAmount,
        status: input.status || 'outstanding',
        notes: input.notes?.trim() || null,
        created_by: input.createdBy ?? null,
        created_by_name: input.createdByName ?? null,
      })
      .select('id')
      .single()
    if (error) throw error
    return data.id as string
  },

  /** Patch a charge. Accepts camelCase fields and maps them explicitly. */
  async updateCharge(id: string, patch: {
    pcnKind?: HirePcnKind | null
    reference?: string | null
    issuer?: string | null
    registration?: string | null
    customerId?: string | null
    customerName?: string | null
    agreementId?: string | null
    agreementReference?: string | null
    lineId?: string | null
    incidentDate?: string | null
    description?: string | null
    baseAmount?: number
    adminFee?: number
    vatAmount?: number
    totalAmount?: number
    status?: HireChargeStatus
    paidAt?: string | null
    notes?: string | null
  }): Promise<void> {
    const row: Record<string, any> = { updated_at: nowIso() }
    if (patch.pcnKind !== undefined) row.pcn_kind = patch.pcnKind
    if (patch.reference !== undefined) row.reference = patch.reference?.trim() || null
    if (patch.issuer !== undefined) row.issuer = patch.issuer?.trim() || null
    if (patch.registration !== undefined) row.registration = patch.registration ? normReg(patch.registration) : null
    if (patch.customerId !== undefined) row.customer_id = patch.customerId
    if (patch.customerName !== undefined) row.customer_name = patch.customerName
    if (patch.agreementId !== undefined) row.agreement_id = patch.agreementId
    if (patch.agreementReference !== undefined) row.agreement_reference = patch.agreementReference
    if (patch.lineId !== undefined) row.line_id = patch.lineId
    if (patch.incidentDate !== undefined) row.incident_date = patch.incidentDate || null
    if (patch.description !== undefined) row.description = patch.description?.trim() || null
    if (patch.baseAmount !== undefined) row.base_amount = patch.baseAmount
    if (patch.adminFee !== undefined) row.admin_fee = patch.adminFee
    if (patch.vatAmount !== undefined) row.vat_amount = patch.vatAmount
    if (patch.totalAmount !== undefined) row.total_amount = patch.totalAmount
    if (patch.status !== undefined) row.status = patch.status
    if (patch.paidAt !== undefined) row.paid_at = patch.paidAt || null
    if (patch.notes !== undefined) row.notes = patch.notes?.trim() || null
    const { error } = await supabase.from(CHARGES).update(row).eq('id', id)
    if (error) throw error
  },

  /** Settlement toggle. Marking paid stamps today; other statuses clear it. */
  async setStatus(id: string, status: HireChargeStatus): Promise<void> {
    const row: Record<string, any> = { status, updated_at: nowIso() }
    row.paid_at = status === 'paid' ? nowIso().slice(0, 10) : null
    const { error } = await supabase.from(CHARGES).update(row).eq('id', id)
    if (error) throw error
  },

  async deleteCharge(id: string): Promise<void> {
    const { error } = await supabase.from(CHARGES).delete().eq('id', id)
    if (error) throw error
  },
}
