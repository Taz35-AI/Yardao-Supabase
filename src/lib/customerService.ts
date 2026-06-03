// src/lib/customerService.ts — SUPABASE re-implementation.
//
// ⚠️ Data-layer swap: the file name and every EXPORT below are kept identical
// to the original Firestore version so the frontend imports nothing new. Only
// the INTERNALS change — Firestore SDK calls become Supabase queries, with
// snake↔camel mapping (see dbMap) so returned objects match the Customer
// interface byte-for-byte. RLS scopes every query to the caller's org.
//
// CRUD + dedupe-aware upsert for the `customers` table. The key operation is
// `upsertCustomerForBooking` — called from inside
// ServiceBookingsContext.createBooking right after a booking is written.
// It looks up an existing customer by phone (normalised) and either:
//   - patches their name/email + bumps bookingCount + lastBookingDate, OR
//   - creates a fresh customer record.
// Either way the booking succeeds; the upsert is fire-and-forget from the
// caller's perspective so a transient DB hiccup never blocks save.
//
// Firestore atomic helpers have no direct Supabase equivalent at the client:
//   - increment(1)   → read current bookingCount, write count + 1
//   - arrayUnion(reg) → merge reg into the existing registrations array (deduped)
// Both are reproduced read-then-write; the per-customer upsert is low-traffic
// (one booking save at a time) so the lack of a server-side atomic is fine.

import { supabase } from '@/lib/supabaseClient'
import { toCamel } from '@/lib/dbMap'
import type { Customer } from '@/types/customer'
import { normalizePhone, isPhoneUsable } from '@/lib/utils/phone'
import { normalizeReg } from '@/lib/utils/registration'
import { logger } from '@/lib/logger'

const TABLE = 'customers'

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

// timestamptz string | Date → Date (the Firestore version revived Timestamps
// to Date; consumers rely on Customer.createdAt being a Date).
const toDate = (v: any): Date | undefined => {
  if (!v) return undefined
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? undefined : d
}

class CustomerService {
  /** Row → typed Customer (snake→camel + revive timestamps + defaults). */
  private mapDoc(row: any): Customer {
    const data = toCamel<any>(row)!
    return {
      id: data.id,
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
      createdAt: toDate(data.createdAt) || new Date(),
      createdBy: data.createdBy || '',
      createdByName: data.createdByName || '',
      updatedAt: toDate(data.updatedAt),
      updatedBy: data.updatedBy || undefined,
      updatedByName: data.updatedByName || undefined,
    }
  }

  /** All customers for the org, sorted by name. Used by useCustomers / the
   *  customers admin page. */
  async getCustomers(organizationId: string): Promise<Customer[]> {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('organization_id', organizationId)
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []).map((d) => this.mapDoc(d))
    } catch (err) {
      logger.error('Error fetching customers:', err)
      throw new Error('Failed to fetch customers')
    }
  }

  async getCustomer(id: string): Promise<Customer | null> {
    try {
      const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return data ? this.mapDoc(data) : null
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
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('phone_normalized', normalized)
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data ? this.mapDoc(data) : null
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
    const row = {
      organization_id: organizationId,
      name,
      ...(firstName ? { first_name: firstName } : {}),
      ...(lastName ? { last_name: lastName } : {}),
      phone: input.phone.trim(),
      phone_normalized: normalized,
      ...(input.email?.trim() ? { email: input.email.trim() } : {}),
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      booking_count: 0,
      created_by: actorId,
      created_by_name: actorName,
    }
    const { data, error } = await supabase.from(TABLE).insert(row).select('id').single()
    if (error) throw error
    return data.id as string
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
      updated_at: new Date().toISOString(),
      updated_by: actorId,
      updated_by_name: actorName,
    }
    // First / last drive the combined `name`. When either is supplied we
    // recompute name from both so search + display stay consistent.
    if (changes.firstName !== undefined || changes.lastName !== undefined) {
      const firstName = (changes.firstName ?? '').trim()
      const lastName = (changes.lastName ?? '').trim()
      patch.first_name = firstName || null
      patch.last_name = lastName || null
      patch.name = combineName(firstName, lastName, changes.name || '')
    } else if (changes.name !== undefined) {
      patch.name = changes.name.trim()
    }
    if (changes.phone !== undefined) {
      patch.phone = changes.phone.trim()
      patch.phone_normalized = normalizePhone(changes.phone)
    }
    if (changes.email !== undefined) patch.email = changes.email.trim() || null
    if (changes.notes !== undefined) patch.notes = changes.notes.trim() || null
    const { error } = await supabase.from(TABLE).update(patch).eq('id', id)
    if (error) throw error
  }

  async deleteCustomer(id: string): Promise<void> {
    const { error } = await supabase.from(TABLE).delete().eq('id', id)
    if (error) throw error
  }

  /**
   * Upsert called immediately after a booking is created.
   * Matches existing customer by normalised phone:
   *   - If found: patch name/email if blank-or-different (booking form is
   *     source of truth), bump bookingCount, update lastBookingDate when
   *     later than the stored value.
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
        // increment(1) has no client-side atomic in Supabase — read+write.
        booking_count: (existing.bookingCount || 0) + 1,
        updated_at: new Date().toISOString(),
        updated_by: input.actorId,
        updated_by_name: input.actorName,
      }
      // Newer booking → bump lastBookingDate. String compare is safe for
      // the YYYY-MM-DD format we use everywhere.
      if (
        !existing.lastBookingDate ||
        input.bookingDate > existing.lastBookingDate
      ) {
        patch.last_booking_date = input.bookingDate
      }
      const trimmedName = input.name.trim()
      if (trimmedName && trimmedName !== existing.name) {
        // Name changed on the booking — re-sync structured first/last too
        // so the admin record doesn't drift from what was last booked.
        patch.name = trimmedName
        const { firstName, lastName } = splitName(trimmedName)
        patch.first_name = firstName || null
        patch.last_name = lastName || null
      }
      const trimmedEmail = input.email?.trim()
      if (trimmedEmail && trimmedEmail !== existing.email) {
        patch.email = trimmedEmail
      }
      // Append this booking's reg (deduped — arrayUnion semantics: no-op if
      // already present). Same canonical key the parts flow uses so a
      // customer's registration history joins cleanly with partUsage.
      const reg = normalizeReg(input.registration)
      if (reg) {
        const current = Array.isArray(existing.registrations) ? existing.registrations : []
        if (!current.includes(reg)) {
          patch.registrations = [...current, reg]
        }
      }
      const { error } = await supabase.from(TABLE).update(patch).eq('id', existing.id)
      if (error) throw error
    } else {
      const trimmedName = input.name.trim()
      const { firstName, lastName } = splitName(trimmedName)
      const reg = normalizeReg(input.registration)
      const row = {
        organization_id: input.organizationId,
        name: trimmedName,
        ...(firstName ? { first_name: firstName } : {}),
        ...(lastName ? { last_name: lastName } : {}),
        phone: input.phone.trim(),
        phone_normalized: normalizePhone(input.phone),
        ...(input.email?.trim() ? { email: input.email.trim() } : {}),
        ...(reg ? { registrations: [reg] } : {}),
        booking_count: 1,
        last_booking_date: input.bookingDate,
        created_by: input.actorId,
        created_by_name: input.actorName,
      }
      const { error } = await supabase.from(TABLE).insert(row)
      if (error) throw error
    }
  }
}

export const customerService = new CustomerService()
