// src/lib/services/hireCustomerService.ts
// Hire customers (separate from garage customers) + their documents + the
// insurance-eligibility gate. Defensive: missing tables → [] / safe defaults.

import { supabase } from '@/lib/supabaseClient'
import { toCamel, toCamelList } from '@/lib/dbMap'
import { logger } from '@/lib/logger'
import type { RentalCustomer, RentalCustomerDocument } from '@/types/hire'

const CUSTOMERS = 'rental_customers'
const DOCUMENTS = 'rental_customer_documents'

const nowIso = () => new Date().toISOString()

export const hireCustomerService = {
  async getCustomers(organizationId: string): Promise<RentalCustomer[]> {
    if (!organizationId) return []
    try {
      const { data, error } = await supabase
        .from(CUSTOMERS)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name', { ascending: true })
      if (error) throw error
      return toCamelList<RentalCustomer>(data)
    } catch (err) {
      logger.error('hireCustomerService.getCustomers failed (table may not exist yet):', err)
      return []
    }
  },

  async getCustomer(id: string): Promise<RentalCustomer | null> {
    try {
      const { data, error } = await supabase.from(CUSTOMERS).select('*').eq('id', id).single()
      if (error) throw error
      return toCamel<RentalCustomer>(data)
    } catch (err) {
      logger.error('hireCustomerService.getCustomer failed:', err)
      return null
    }
  },

  async createCustomer(input: {
    organizationId: string
    name: string
    isBusiness?: boolean
    companyName?: string | null
    accountNo?: string | null
    contactName?: string | null
    phone?: string | null
    email?: string | null
    billingEmail?: string | null
    billingAddress?: string | null
    accountManager?: string | null
    notes?: string | null
    createdBy?: string | null
    createdByName?: string | null
  }): Promise<string> {
    const { data, error } = await supabase
      .from(CUSTOMERS)
      .insert({
        organization_id: input.organizationId,
        name: input.name,
        is_business: input.isBusiness ?? false,
        company_name: input.companyName ?? null,
        account_no: input.accountNo ?? null,
        contact_name: input.contactName ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        billing_email: input.billingEmail ?? null,
        billing_address: input.billingAddress ?? null,
        account_manager: input.accountManager ?? null,
        notes: input.notes ?? null,
        created_by: input.createdBy ?? null,
        created_by_name: input.createdByName ?? null,
      })
      .select('id')
      .single()
    if (error) throw error
    return data.id as string
  },

  async updateCustomer(id: string, updates: Record<string, any>): Promise<void> {
    const { error } = await supabase
      .from(CUSTOMERS)
      .update({ ...updates, updated_at: nowIso() })
      .eq('id', id)
    if (error) throw error
  },

  // ── Documents ─────────────────────────────────────────────────────────────
  async getDocuments(organizationId: string, customerId: string): Promise<RentalCustomerDocument[]> {
    if (!organizationId || !customerId) return []
    try {
      const { data, error } = await supabase
        .from(DOCUMENTS)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return toCamelList<RentalCustomerDocument>(data)
    } catch (err) {
      logger.error('hireCustomerService.getDocuments failed:', err)
      return []
    }
  },

  async addDocument(input: {
    organizationId: string
    customerId: string
    docType: string
    reference?: string | null
    expiryDate?: string | null
    fileUrl?: string | null
    notes?: string | null
    createdBy?: string | null
    createdByName?: string | null
  }): Promise<string> {
    const { data, error } = await supabase
      .from(DOCUMENTS)
      .insert({
        organization_id: input.organizationId,
        customer_id: input.customerId,
        doc_type: input.docType,
        reference: input.reference ?? null,
        expiry_date: input.expiryDate ?? null,
        file_url: input.fileUrl ?? null,
        notes: input.notes ?? null,
        created_by: input.createdBy ?? null,
        created_by_name: input.createdByName ?? null,
      })
      .select('id')
      .single()
    if (error) throw error
    return data.id as string
  },

  async deleteDocument(id: string): Promise<void> {
    const { error } = await supabase.from(DOCUMENTS).delete().eq('id', id)
    if (error) throw error
  },

  /**
   * Hire eligibility: the customer must hold a 'fleet_insurance' document whose
   * expiry is today or later. Returns the gate result + the reason for the UI.
   */
  async checkInsuranceEligibility(
    organizationId: string,
    customerId: string,
  ): Promise<{ eligible: boolean; reason: 'ok' | 'missing' | 'expired'; expiryDate?: string | null }> {
    const docs = await this.getDocuments(organizationId, customerId)
    const insurance = docs.filter((d) => d.docType === 'fleet_insurance')
    if (insurance.length === 0) return { eligible: false, reason: 'missing' }
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    // Pick the latest-expiring insurance doc.
    const latest = insurance
      .filter((d) => d.expiryDate)
      .sort((a, b) => (a.expiryDate! < b.expiryDate! ? 1 : -1))[0]
    if (!latest?.expiryDate) return { eligible: false, reason: 'missing' }
    const exp = new Date(latest.expiryDate + 'T00:00:00')
    if (exp.getTime() < today.getTime()) {
      return { eligible: false, reason: 'expired', expiryDate: latest.expiryDate }
    }
    return { eligible: true, reason: 'ok', expiryDate: latest.expiryDate }
  },
}
