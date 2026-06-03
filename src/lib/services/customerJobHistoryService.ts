// src/lib/services/customerJobHistoryService.ts — SUPABASE re-implementation.
//
// ⚠️ Data-layer swap: the export + signature below are kept identical to the
// Firestore version. Only the INTERNALS change.
//
// Per-customer job history — read on demand, scoped to ONE customer + a
// limit, so it adds negligible read cost (a single SELECT, never a listener).
// Rows are DERIVED from completed service_bookings matched by the customer's
// phone — no copy, no migration, NO new table. External-garage jobs are
// included automatically (they are service_bookings rows flagged
// isExternalProvider). RLS scopes the query to the caller's org.

import { supabase } from '@/lib/supabaseClient'
import { toCamel } from '@/lib/dbMap'
import { logger } from '@/lib/logger'
import { normalizePhone } from '@/lib/utils/phone'
import type { CustomerJobRecord } from '@/types/customerJobHistory'

const SERVICE_BOOKINGS_TABLE = 'service_bookings'

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

function bookingToRecord(b: any): CustomerJobRecord {
  const work = Array.isArray(b.workRequired)
    ? b.workRequired.filter(Boolean).join(', ')
    : (b.workRequired || '')
  return {
    id: b.id,
    date: toDateStr(b.completedAt, typeof b.date === 'string' ? b.date : ''),
    registration: b.registration || '—',
    make: b.make || undefined,
    model: b.model || undefined,
    locationType: b.isExternalProvider ? 'external' : 'internal',
    garageName: b.externalProvider?.garageName || undefined,
    garageAddress: b.externalProvider?.address || undefined,
    workDone: work,
    mechanicName: b.assignedMechanicName || undefined,
    serviceBay: typeof b.serviceBay === 'number' ? b.serviceBay : undefined,
    branchName: b.originalBranchName || undefined,
    mileage: typeof b.mileage === 'number' ? b.mileage : undefined,
    notes: b.notes || undefined,
    completedByName: b.completedByName || undefined,
  }
}

export const customerJobHistoryService = {
  /**
   * Completed jobs done for ONE customer, matched by phone. On-demand,
   * capped by `max`. Matches the phone as stored on the customer plus the
   * normalised (digits-only) variant when it differs — one indexed IN query,
   * naturally deduped — so bookings saved with a differently-formatted number
   * still resolve to the same customer.
   */
  async getCustomerJobHistory(params: {
    organizationId: string
    phone: string
    phoneNormalized?: string
    max?: number
  }): Promise<CustomerJobRecord[]> {
    const { organizationId } = params
    const max = params.max ?? 100
    const rawPhone = (params.phone || '').trim()
    if (!organizationId || !rawPhone) return []

    const normalized = params.phoneNormalized || normalizePhone(rawPhone)
    const phoneCandidates = Array.from(
      new Set([rawPhone, normalized].filter(Boolean)),
    )

    try {
      const { data, error } = await supabase
        .from(SERVICE_BOOKINGS_TABLE)
        .select('*')
        .eq('organization_id', organizationId)
        .in('customer_phone', phoneCandidates)
        .eq('status', 'completed')
        .order('date', { ascending: false })
        .limit(max)
      if (error) throw error

      const records = (data ?? []).map((row) => bookingToRecord(toCamel<any>(row)!))
      // Newest first; stable on a YYYY-MM-DD string sort.
      records.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      return records
    } catch (err) {
      logger.error('Customer job history query failed:', err)
      throw err instanceof Error
        ? err
        : new Error('Failed to load customer job history')
    }
  },
}
