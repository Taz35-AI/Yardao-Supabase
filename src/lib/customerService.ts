// src/lib/customerService.ts
// CRUD + dedupe-aware upsert for the customers collection. Mirrors the
// class-singleton pattern used by externalGarageService.
//
// The key operation is `upsertCustomerForBooking` — called from inside
// ServiceBookingsContext.createBooking right after a booking is written.
// It looks up an existing customer by phone (normalised) and either:
//   - patches their name/email + bumps bookingCount + lastBookingDate, OR
//   - creates a fresh customer record.
// Either way the booking succeeds; the upsert is fire-and-forget from the
// caller's perspective so a transient Firestore hiccup never blocks save.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
  increment,
  arrayUnion,
  limit,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Customer } from '@/types/customer'
import { normalizePhone, isPhoneUsable } from '@/lib/utils/phone'
import { normalizeReg } from '@/lib/utils/registration'
import { logger } from '@/lib/logger'

const COLLECTION_NAME = 'customers'

/** Best-effort split of a combined name into first + last. First whitespace
 *  token is the first name; everything after is the surname. Single-word
 *  names → firstName only. Used when a customer is auto-created from a
 *  booking (which only carries a single `customerName` string). */
export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

/** Combine first + last into the display name. Falls back to `fallback`
 *  (the legacy single name) when both are blank. */
function combineName(
  firstName: string | undefined,
  lastName: string | undefined,
  fallback = '',
): string {
  const combined = `${(firstName || '').trim()} ${(lastName || '').trim()}`.trim()
  return combined || fallback.trim()
}

export interface CustomerInput {
  name?: string
  firstName?: string
  lastName?: string
  phone: string
  email?: string
  notes?: string
}

export interface UpsertForBookingInput {
  organizationId: string
  name: string
  phone: string
  email?: string
  /** Vehicle registration from the booking — appended (deduped) to the
   *  customer's `registrations` array. */
  registration?: string
  bookingDate: string // YYYY-MM-DD
  actorId: string
  actorName: string
}

class CustomerService {
  private getCollectionRef() {
    return collection(db, COLLECTION_NAME)
  }
  private getDocRef(id: string) {
    return doc(db, COLLECTION_NAME, id)
  }

  /** All customers for the org, sorted by most-recent booking first then
   *  name. Used by useCustomers / the customers admin page. */
  async getCustomers(organizationId: string): Promise<Customer[]> {
    try {
      const q = query(
        this.getCollectionRef(),
        where('organizationId', '==', organizationId),
        orderBy('name', 'asc'),
      )
      const snapshot = await getDocs(q)
      return snapshot.docs.map((d) => this.mapDoc(d.id, d.data()))
    } catch (err) {
      logger.error('Error fetching customers:', err)
      throw new Error('Failed to fetch customers')
    }
  }

  async getCustomer(id: string): Promise<Customer | null> {
    try {
      const snap = await getDoc(this.getDocRef(id))
      return snap.exists() ? this.mapDoc(snap.id, snap.data()) : null
    } catch (err) {
      logger.error('Error fetching customer:', err)
      throw new Error('Failed to fetch customer')
    }
  }

  /** Lookup by normalised phone — used by upsert dedupe. Returns null when
   *  no match (a brand-new customer). */
  async findByPhone(
    organizationId: string,
    phone: string,
  ): Promise<Customer | null> {
    const normalized = normalizePhone(phone)
    if (!normalized) return null
    try {
      const q = query(
        this.getCollectionRef(),
        where('organizationId', '==', organizationId),
        where('phoneNormalized', '==', normalized),
        limit(1),
      )
      const snap = await getDocs(q)
      const first = snap.docs[0]
      return first ? this.mapDoc(first.id, first.data()) : null
    } catch (err) {
      logger.error('Error finding customer by phone:', err)
      return null
    }
  }

  /** Create a customer record (used by the admin page's "+ Add" button). */
  async createCustomer(
    input: CustomerInput,
    organizationId: string,
    actorId: string,
    actorName: string,
  ): Promise<string> {
    const normalized = normalizePhone(input.phone)
    const firstName = (input.firstName || '').trim()
    const lastName = (input.lastName || '').trim()
    const name = combineName(firstName, lastName, input.name || '')
    const docRef = await addDoc(this.getCollectionRef(), {
      organizationId,
      name,
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
      phone: input.phone.trim(),
      phoneNormalized: normalized,
      ...(input.email?.trim() ? { email: input.email.trim() } : {}),
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      bookingCount: 0,
      createdAt: serverTimestamp(),
      createdBy: actorId,
      createdByName: actorName,
    })
    return docRef.id
  }

  /** Patch an existing customer (admin edit). Only writes the fields
   *  that changed so audit trails stay clean. */
  async updateCustomer(
    id: string,
    changes: Partial<CustomerInput>,
    actorId: string,
    actorName: string,
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
      updatedBy: actorId,
      updatedByName: actorName,
    }
    // First / last drive the combined `name`. When either is supplied we
    // recompute name from both so search + display stay consistent.
    if (changes.firstName !== undefined || changes.lastName !== undefined) {
      const firstName = (changes.firstName ?? '').trim()
      const lastName = (changes.lastName ?? '').trim()
      patch.firstName = firstName || null
      patch.lastName = lastName || null
      patch.name = combineName(firstName, lastName, changes.name || '')
    } else if (changes.name !== undefined) {
      patch.name = changes.name.trim()
    }
    if (changes.phone !== undefined) {
      patch.phone = changes.phone.trim()
      patch.phoneNormalized = normalizePhone(changes.phone)
    }
    if (changes.email !== undefined) patch.email = changes.email.trim() || null
    if (changes.notes !== undefined) patch.notes = changes.notes.trim() || null
    await updateDoc(this.getDocRef(id), patch)
  }

  async deleteCustomer(id: string): Promise<void> {
    await deleteDoc(this.getDocRef(id))
  }

  /**
   * Upsert called immediately after a booking is created.
   * Matches existing customer by normalised phone:
   *   - If found: patch name/email if blank-or-different (booking form is
   *     source of truth), bump bookingCount via Firestore increment(),
   *     update lastBookingDate when later than the stored value.
   *   - If not found: create a fresh customer with bookingCount = 1.
   *
   * Fire-and-forget — caller logs errors but does not surface to user.
   */
  async upsertCustomerForBooking(input: UpsertForBookingInput): Promise<void> {
    if (!isPhoneUsable(input.phone)) return // skip — no valid dedupe key
    const existing = await this.findByPhone(input.organizationId, input.phone)
    if (existing) {
      // Only update fields the booking form has new info for. We do NOT
      // overwrite a stored email with empty (bookings don't always carry
      // email). Same for name — keep existing if booking is somehow blank.
      const patch: Record<string, unknown> = {
        bookingCount: increment(1),
        updatedAt: serverTimestamp(),
        updatedBy: input.actorId,
        updatedByName: input.actorName,
      }
      // Newer booking → bump lastBookingDate. String compare is safe for
      // the YYYY-MM-DD format we use everywhere.
      if (
        !existing.lastBookingDate ||
        input.bookingDate > existing.lastBookingDate
      ) {
        patch.lastBookingDate = input.bookingDate
      }
      const trimmedName = input.name.trim()
      if (trimmedName && trimmedName !== existing.name) {
        // Name changed on the booking — re-sync structured first/last too
        // so the admin record doesn't drift from what was last booked.
        patch.name = trimmedName
        const { firstName, lastName } = splitName(trimmedName)
        patch.firstName = firstName || null
        patch.lastName = lastName || null
      }
      const trimmedEmail = input.email?.trim()
      if (trimmedEmail && trimmedEmail !== existing.email) {
        patch.email = trimmedEmail
      }
      // Append this booking's reg (deduped — arrayUnion no-ops if
      // present). Same canonical key the parts flow uses so a customer's
      // registration history joins cleanly with partUsage.
      const reg = normalizeReg(input.registration)
      if (reg) {
        patch.registrations = arrayUnion(reg)
      }
      await updateDoc(this.getDocRef(existing.id), patch)
    } else {
      const trimmedName = input.name.trim()
      const { firstName, lastName } = splitName(trimmedName)
      const reg = normalizeReg(input.registration)
      await addDoc(this.getCollectionRef(), {
        organizationId: input.organizationId,
        name: trimmedName,
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        phone: input.phone.trim(),
        phoneNormalized: normalizePhone(input.phone),
        ...(input.email?.trim() ? { email: input.email.trim() } : {}),
        ...(reg ? { registrations: [reg] } : {}),
        bookingCount: 1,
        lastBookingDate: input.bookingDate,
        createdAt: serverTimestamp(),
        createdBy: input.actorId,
        createdByName: input.actorName,
      })
    }
  }

  /** Internal: convert a Firestore doc into the typed Customer. */
  private mapDoc(id: string, data: any): Customer {
    return {
      id,
      organizationId: data.organizationId,
      name: data.name || '',
      firstName: data.firstName || undefined,
      lastName: data.lastName || undefined,
      phone: data.phone || '',
      email: data.email || undefined,
      phoneNormalized: data.phoneNormalized || normalizePhone(data.phone || ''),
      registrations: Array.isArray(data.registrations) ? data.registrations : undefined,
      notes: data.notes || undefined,
      bookingCount:
        typeof data.bookingCount === 'number' ? data.bookingCount : 0,
      lastBookingDate: data.lastBookingDate || undefined,
      createdAt: data.createdAt?.toDate?.() || data.createdAt || new Date(),
      createdBy: data.createdBy || '',
      createdByName: data.createdByName || '',
      updatedAt: data.updatedAt?.toDate?.() || data.updatedAt || undefined,
      updatedBy: data.updatedBy || undefined,
      updatedByName: data.updatedByName || undefined,
    }
  }
}

export const customerService = new CustomerService()
