// src/lib/permissions.ts
// Single source of truth for who can do what. Roles: 'admin' | 'member' |
// 'mechanic' | 'garage_manager'. The org OWNER (organizations.created_by) is
// always fully privileged, regardless of their stored role.
//
// Model:
//   • Owner + Garage Manager  → may WRITE money/schedule: invoices, bookings,
//     stock prices, and may grant the Garage Manager role.
//   • Regular Admin           → operational actions only (check-in, mark
//     complete, scan parts); view-only for the above.
//   • member / mechanic       → unchanged from before.
//
// This is the UI/service gate. Invoices are ALSO locked at the DB (migration
// 0054); bookings/stock are gated here only (operational + structural edits
// share rows, so they can't be split by simple RLS).

export type AppRole = 'admin' | 'member' | 'mechanic' | 'garage_manager'

/**
 * Admin-LEVEL for visibility/access: a Garage Manager sees everything an admin
 * sees (it's a promotion — admin PLUS write powers). Use this to gate PAGE and
 * NAV visibility so garage managers aren't hidden from Fleet, Invoicing, admin
 * settings, etc. (Write actions are gated separately by isManager.)
 */
export function isAdminRole(role?: string | null): boolean {
  return role === 'admin' || role === 'garage_manager'
}

export interface PermCtx {
  uid?: string | null
  role?: AppRole | string | null
  /** organizations.created_by — the org owner's uid. */
  orgCreatedBy?: string | null
}

/** The org creator — always fully privileged even if their role is 'admin'. */
export function isOwner(c: PermCtx): boolean {
  return !!c.uid && !!c.orgCreatedBy && c.uid === c.orgCreatedBy
}

export function isGarageManager(c: PermCtx): boolean {
  return c.role === 'garage_manager'
}

/** Money/schedule write authority: owner or garage manager. */
export function isManager(c: PermCtx): boolean {
  return isOwner(c) || isGarageManager(c)
}

/** Admin-level for operational gates (things a plain admin could always do). */
export function isAdminLevel(c: PermCtx): boolean {
  return c.role === 'admin' || c.role === 'garage_manager' || isOwner(c)
}

// ── Capabilities (all "write" powers collapse to isManager) ──────────────────
export const canEditInvoices = isManager        // edit / issue / void / delete
export const canCreateInvoices = isManager       // raise a draft from a job
export const canManageBookings = isManager       // add / edit / reschedule / resize / delete
export const canCreateBookings = isManager
export const canManageStockPrices = isManager    // edit part prices / stock values
export const canGrantManager = isManager         // owner + garage managers
