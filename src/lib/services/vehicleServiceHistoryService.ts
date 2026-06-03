// src/lib/services/vehicleServiceHistoryService.ts
// Per-vehicle service history — read on demand, scoped to ONE vehicle + a
// limit, so it adds negligible Firestore read cost (getDocs, never a
// listener). Booking-sourced rows are derived from completed
// serviceBookings (no copy / no migration); manual rows live in the
// `vehicleServiceHistory` collection.

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  limit as fbLimit,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logger } from '@/lib/logger'
import {
  VEHICLE_SERVICE_HISTORY_COLLECTION,
  ManualServiceHistoryDoc,
  VehicleServiceRecord,
} from '@/types/vehicleServiceHistory'

const SERVICE_BOOKINGS_COLLECTION = 'serviceBookings'

// UPPER + no whitespace — used for equality matching across spacing variants
export function normalizeReg(reg: string): string {
  return (reg || '').toUpperCase().replace(/\s+/g, '')
}

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

function bookingToRecord(id: string, b: any): VehicleServiceRecord {
  const work = Array.isArray(b.workRequired)
    ? b.workRequired.filter(Boolean).join(', ')
    : (b.workRequired || '')
  return {
    id,
    source: 'booking',
    date: toDateStr(b.completedAt, typeof b.date === 'string' ? b.date : ''),
    locationType: b.isExternalProvider ? 'external' : 'internal',
    garageName: b.externalProvider?.garageName || undefined,
    garageAddress: b.externalProvider?.address || undefined,
    workDone: work,
    mechanicName: b.assignedMechanicName || undefined,
    serviceBay: typeof b.serviceBay === 'number' ? b.serviceBay : undefined,
    branchName: b.originalBranchName || undefined,
    // Internal completions can now capture an odometer reading; external/
    // garage completions still won't have one.
    mileage: typeof b.mileage === 'number' ? b.mileage : undefined,
    notes: b.notes || undefined,
    completedByName: b.completedByName || undefined,
  }
}

function manualToRecord(id: string, m: ManualServiceHistoryDoc): VehicleServiceRecord {
  return {
    id,
    source: 'manual',
    date: (m.date || '').slice(0, 10),
    locationType: m.locationType,
    garageName: m.garageName || undefined,
    workDone: m.workDone || '',
    mechanicName: m.mechanicName || undefined,
    mileage: typeof m.mileage === 'number' ? m.mileage : undefined,
    notes: m.notes || undefined,
    createdByName: m.createdByName || undefined,
  }
}

export const vehicleServiceHistoryService = {
  /**
   * Merged history for ONE vehicle: completed serviceBookings (derived,
   * no migration) + manual records. On-demand, capped by `max` per source.
   */
  async getVehicleServiceHistory(params: {
    organizationId: string
    registration: string
    max?: number
  }): Promise<VehicleServiceRecord[]> {
    const { organizationId, registration } = params
    const max = params.max ?? 50
    if (!organizationId || !registration) return []

    const raw = registration.trim()
    const spaceless = normalizeReg(registration)
    // Query the registration as stored, plus the spaceless variant when it
    // differs — two cheap indexed equality queries, deduped by doc id.
    const regCandidates = Array.from(new Set([raw, spaceless].filter(Boolean)))

    const records: VehicleServiceRecord[] = []
    const seenBooking = new Set<string>()
    let bookingOk = false
    let manualOk = false
    let lastErr: unknown = null

    // Booking-sourced (completed only). Isolated so a problem here (missing
    // index, rules) can't take out the manual records, and vice-versa.
    try {
      for (const regValue of regCandidates) {
        const q = query(
          collection(db, SERVICE_BOOKINGS_COLLECTION),
          where('organizationId', '==', organizationId),
          where('registration', '==', regValue),
          where('status', '==', 'completed'),
          orderBy('date', 'desc'),
          fbLimit(max),
        )
        const snap = await getDocs(q)
        snap.forEach(d => {
          if (seenBooking.has(d.id)) return
          seenBooking.add(d.id)
          records.push(bookingToRecord(d.id, d.data()))
        })
      }
      bookingOk = true
    } catch (err) {
      lastErr = err
      logger.error('Service history: booking query failed (often a missing composite index or serviceBookings rules):', err)
    }

    // Manual records. Separate, newer collection — if its Firestore security
    // rule / index isn't in place yet this must NOT wipe out the
    // booking-derived history that is perfectly readable.
    try {
      const mq = query(
        collection(db, VEHICLE_SERVICE_HISTORY_COLLECTION),
        where('organizationId', '==', organizationId),
        where('registrationKey', '==', spaceless),
        orderBy('date', 'desc'),
        fbLimit(max),
      )
      const msnap = await getDocs(mq)
      msnap.forEach(d => {
        records.push(manualToRecord(d.id, d.data() as ManualServiceHistoryDoc))
      })
      manualOk = true
    } catch (err) {
      lastErr = err
      logger.error('Service history: manual query failed (the vehicleServiceHistory collection likely has no Firestore rule yet):', err)
    }

    // Only surface an error if BOTH sources failed — otherwise show whatever
    // we could read so the tab stays useful while rules/indexes catch up.
    if (!bookingOk && !manualOk) {
      throw lastErr instanceof Error
        ? lastErr
        : new Error('Failed to load vehicle service history')
    }

    // Newest first; stable enough on a YYYY-MM-DD string sort
    records.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    return records
  },

  async addManualServiceRecord(
    record: Omit<ManualServiceHistoryDoc, 'id' | 'createdAt' | 'updatedAt' | 'registrationKey'>,
  ): Promise<string> {
    const payload = {
      ...record,
      registrationKey: normalizeReg(record.registration),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    const ref = await addDoc(collection(db, VEHICLE_SERVICE_HISTORY_COLLECTION), payload)
    logger.log('🧾 Manual service history added:', ref.id)
    return ref.id
  },

  async updateManualServiceRecord(
    id: string,
    patch: Partial<Omit<ManualServiceHistoryDoc, 'id' | 'organizationId' | 'createdBy' | 'createdByName' | 'createdAt'>>,
  ): Promise<void> {
    const next: Record<string, any> = { ...patch, updatedAt: serverTimestamp() }
    if (typeof patch.registration === 'string') {
      next.registrationKey = normalizeReg(patch.registration)
    }
    await updateDoc(doc(db, VEHICLE_SERVICE_HISTORY_COLLECTION, id), next)
    logger.log('🧾 Manual service history updated:', id)
  },

  async deleteManualServiceRecord(id: string): Promise<void> {
    await deleteDoc(doc(db, VEHICLE_SERVICE_HISTORY_COLLECTION, id))
    logger.log('🧾 Manual service history deleted:', id)
  },
}
