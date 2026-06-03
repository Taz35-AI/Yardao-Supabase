// src/lib/services/customerJobHistoryService.ts
// Per-customer job history — read on demand, scoped to ONE customer + a
// limit, so it adds negligible Firestore read cost (getDocs, never a
// listener). Rows are derived from completed serviceBookings matched by
// the customer's phone — no copy, no migration, NO new collection.
// External-garage jobs are included automatically (they are serviceBookings
// rows flagged isExternalProvider).

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit as fbLimit,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logger } from '@/lib/logger'
import { normalizePhone } from '@/lib/utils/phone'
import type { CustomerJobRecord } from '@/types/customerJobHistory'

const SERVICE_BOOKINGS_COLLECTION = 'serviceBookings'

// Firestore Timestamp | Date | 'YYYY-MM-DD' string → 'YYYY-MM-DD'
function toDateStr(value: any, fallback: string): string {
  try {
    if (!value) return fallback
    if (typeof value === 'string') return value.slice(0, 10)
    const d: Date = typeof value.toDate === 'function' ? value.toDate() : new Date(value)
    if (isNaN(d.getTime())) return fallback
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  } catch {
    return fallback
  }
}

function bookingToRecord(id: string, b: any): CustomerJobRecord {
  const work = Array.isArray(b.workRequired)
    ? b.workRequired.filter(Boolean).join(', ')
    : (b.workRequired || '')
  return {
    id,
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
   * capped by `max`. Queries the phone as stored on the customer plus the
   * normalised (digits-only) variant when it differs — two cheap indexed
   * equality queries, deduped by doc id — so bookings saved with a
   * differently-formatted number still resolve to the same customer.
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

    const records: CustomerJobRecord[] = []
    const seen = new Set<string>()

    try {
      for (const phoneValue of phoneCandidates) {
        const q = query(
          collection(db, SERVICE_BOOKINGS_COLLECTION),
          where('organizationId', '==', organizationId),
          where('customerPhone', '==', phoneValue),
          where('status', '==', 'completed'),
          orderBy('date', 'desc'),
          fbLimit(max),
        )
        const snap = await getDocs(q)
        snap.forEach(d => {
          if (seen.has(d.id)) return
          seen.add(d.id)
          records.push(bookingToRecord(d.id, d.data()))
        })
      }
    } catch (err) {
      logger.error(
        'Customer job history query failed (often a missing composite index — serviceBookings: organizationId + customerPhone + status + date desc):',
        err,
      )
      throw err instanceof Error
        ? err
        : new Error('Failed to load customer job history')
    }

    // Newest first; stable on a YYYY-MM-DD string sort.
    records.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    return records
  },
}
