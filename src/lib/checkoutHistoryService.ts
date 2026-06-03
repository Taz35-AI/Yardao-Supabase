// src/lib/checkoutHistoryService.ts — SUPABASE re-implementation.
// Branch-aware checkout history. Public interface + signatures unchanged.
// Date fields are returned as Date objects (as the Firestore version did) so
// consumers that call .toLocaleDateString() etc. keep working.

import { supabase } from '@/lib/supabaseClient'
import { toCamel, toSnake } from '@/lib/dbMap'
import { logger } from '@/lib/logger'

export interface CheckoutHistoryRecord {
  id?: string
  // Vehicle Details
  registration: string
  make: string
  model: string
  colour?: string
  size: string
  condition: string
  status: string
  mileage?: string
  contract?: string | null
  contractColor?: string | null
  motExpiry?: string
  taxExpiry?: string
  notes?: string
  comments?: string
  insuranceStatus?: string

  // Branch Information for multi-branch support
  originalBranchId?: string | null
  originalBranchName?: string | null

  // Checkout Information
  checkedOutDate: Date | any
  checkedOutBy: string
  checkedOutByName: string

  // Organization
  organizationId: string

  // Additional context from check-in
  originalCheckInDate?: Date | any
  originalCheckedInBy?: string
  originalCheckedInByName?: string

  // External garage specific fields
  isExternalGarageCheckout?: boolean
  externalGarageName?: string
  serviceBookingId?: string

  // Timestamps
  createdAt?: Date | any
}

const TABLE = 'checkout_history'

// Row → record: snake→camel + revive timestamp strings into Date objects.
const toDate = (v: any) => (v ? new Date(v) : v)
function rowToRecord(row: any): CheckoutHistoryRecord {
  const r = toCamel<any>(row)!
  r.checkedOutDate = toDate(r.checkedOutDate)
  r.originalCheckInDate = toDate(r.originalCheckInDate)
  r.createdAt = toDate(r.createdAt)
  return r as CheckoutHistoryRecord
}

export const checkoutHistoryService = {
  async addCheckoutRecord(record: Omit<CheckoutHistoryRecord, 'id' | 'createdAt'>) {
    const recordData = {
      ...record,
      checkedOutDate: record.checkedOutDate || new Date().toISOString(),
    }
    logger.log('Adding checkout record with branch tracking:', {
      registration: recordData.registration,
      originalBranchId: recordData.originalBranchId,
      originalBranchName: recordData.originalBranchName,
      isExternalGarageCheckout: recordData.isExternalGarageCheckout,
    })

    const { data, error } = await supabase.from(TABLE).insert(toSnake(recordData)).select().single()
    if (error) throw error
    return rowToRecord(data)
  },

  async getCheckoutHistory(
    organizationId: string,
    daysBack: number = 30,
    limitResults: number = 100,
  ): Promise<CheckoutHistoryRecord[]> {
    const dateThreshold = new Date()
    dateThreshold.setDate(dateThreshold.getDate() - daysBack)

    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('organization_id', organizationId)
      .gte('checked_out_date', dateThreshold.toISOString())
      .order('checked_out_date', { ascending: false })
      .limit(limitResults)
    if (error) throw error
    return (data ?? []).map(rowToRecord)
  },

  async getAllCheckoutHistory(organizationId: string): Promise<CheckoutHistoryRecord[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('organization_id', organizationId)
      .order('checked_out_date', { ascending: false })
    if (error) throw error
    return (data ?? []).map(rowToRecord)
  },

  async searchByRegistration(organizationId: string, registration: string): Promise<CheckoutHistoryRecord[]> {
    const cleanReg = registration.trim().toUpperCase().replace(/\s+/g, '')
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('organization_id', organizationId)
      .eq('registration', cleanReg)
      .order('checked_out_date', { ascending: false })
    if (error) throw error
    return (data ?? []).map(rowToRecord)
  },

  async findExternalGarageCheckouts(
    organizationId: string,
    registration: string,
  ): Promise<CheckoutHistoryRecord[]> {
    const cleanReg = registration.trim().toUpperCase().replace(/\s+/g, '')
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('organization_id', organizationId)
      .eq('registration', cleanReg)
      .eq('is_external_garage_checkout', true)
      .order('checked_out_date', { ascending: false })
    if (error) throw error
    return (data ?? []).map(rowToRecord)
  },

  async getBranchCheckoutHistory(
    organizationId: string,
    branchId: string,
    daysBack: number = 30,
  ): Promise<CheckoutHistoryRecord[]> {
    const dateThreshold = new Date()
    dateThreshold.setDate(dateThreshold.getDate() - daysBack)

    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('organization_id', organizationId)
      .eq('original_branch_id', branchId)
      .gte('checked_out_date', dateThreshold.toISOString())
      .order('checked_out_date', { ascending: false })
    if (error) throw error
    return (data ?? []).map(rowToRecord)
  },

  async getMostRecentExternalCheckout(
    organizationId: string,
    registration: string,
  ): Promise<CheckoutHistoryRecord | null> {
    const records = await this.findExternalGarageCheckouts(organizationId, registration)
    return records.length > 0 ? records[0] : null
  },

  async getBranchCheckoutStats(
    organizationId: string,
    branchId: string,
    daysBack: number = 30,
  ): Promise<{
    totalCheckouts: number
    externalGarageCheckouts: number
    regularCheckouts: number
    topDestinations: Array<{ name: string; count: number }>
  }> {
    const records = await this.getBranchCheckoutHistory(organizationId, branchId, daysBack)

    const stats = {
      totalCheckouts: records.length,
      externalGarageCheckouts: records.filter((r) => r.isExternalGarageCheckout).length,
      regularCheckouts: records.filter((r) => !r.isExternalGarageCheckout).length,
      topDestinations: [] as Array<{ name: string; count: number }>,
    }

    const destinations = new Map<string, number>()
    records
      .filter((r) => r.isExternalGarageCheckout && r.externalGarageName)
      .forEach((r) => {
        const name = r.externalGarageName!
        destinations.set(name, (destinations.get(name) || 0) + 1)
      })

    stats.topDestinations = Array.from(destinations.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return stats
  },
}
