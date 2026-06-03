// src/types/customer.ts
// Customer record shared across bookings. The booking form upserts a
// customer (matched by `phoneNormalized`) on every successful save —
// `bookingCount` and `lastBookingDate` are auto-maintained by the service
// so the customers list shows useful at-a-glance stats.

export interface Customer {
  id: string
  organizationId: string

  // Structured name. `name` is the combined display value (always kept in
  // sync = `${firstName} ${lastName}`.trim()), retained for search +
  // backward-compat with records created before the split existed.
  name: string
  firstName?: string
  lastName?: string
  phone: string
  email?: string

  // Every registration this customer has had a booking for. Auto-appended
  // (deduped) on each booking-save upsert via Firestore arrayUnion.
  registrations?: string[]

  // Lookup key — digits only, leading 0 trimmed (see lib/utils/phone). Two
  // entries with the same number formatted differently end up identical
  // here so the upsert dedupes correctly.
  phoneNormalized: string

  // Optional free-form notes ("prefers WhatsApp", "VIP", etc).
  notes?: string

  // Auto-stats — updated by customerService.upsertCustomerForBooking.
  bookingCount: number
  /** Most recent booking date in YYYY-MM-DD form. */
  lastBookingDate?: string

  // Audit
  createdAt: Date
  createdBy: string
  createdByName: string
  updatedAt?: Date
  updatedBy?: string
  updatedByName?: string
}
