// src/lib/services/stockService.ts — SUPABASE re-implementation.
//
// ⚠️ Data-layer swap: every EXPORT and method SIGNATURE below is kept identical
// to the original Firestore version so the frontend imports/usage are unchanged.
// Only the INTERNALS change — Firestore SDK calls become Supabase queries with
// snake↔camel mapping (see dbMap) so returned objects match the TS interfaces
// byte-for-byte. RLS scopes every query to the caller's org.
//
// Maps to existing tables (0001): stock_parts, part_usage, invoices,
// order_history, stock_adjustments.
//
// Firestore writeBatch atomicity has no direct client equivalent in Supabase;
// the batched flows (removePartQuantity, adjustStock, batchUseParts) are
// performed as sequential writes that validate before mutating and throw on the
// first error — same observable contract for callers.

import { supabase } from '@/lib/supabaseClient'
import { StockPart, PartUsageRecord, Invoice, OrderHistoryRecord, StockAdjustment } from '@/types/stock'
import { toCamel, toCamelList, toSnake } from '@/lib/dbMap'
import { logger } from '@/lib/logger'
import { normalizeReg } from '@/lib/utils/registration'

const STOCK_TABLE = 'stock_parts'
const USAGE_TABLE = 'part_usage'
const INVOICE_TABLE = 'invoices'
const ORDER_HISTORY_TABLE = 'order_history'
const STOCK_ADJUSTMENTS_TABLE = 'stock_adjustments'

/**
 * Atomic compare-and-swap change to a part's quantity.
 *
 * The remove/adjust/batch flows used to read the quantity and then blindly
 * write `read - used`. Two people removing the same part at the same moment
 * could both read the old value and oversell it (and a half-finished batch
 * could leave a partial deduction). This closes that race without needing a
 * Postgres RPC / migration:
 *
 *   1. read the current row
 *   2. compute the new quantity (reject if it would go negative)
 *   3. write it back ONLY IF the stored quantity is still what we read
 *      (`.eq('quantity', current)` — a row-level compare-and-swap)
 *   4. if another writer slipped in (0 rows updated), re-read and retry
 *
 * `delta` is negative for a use/removal, positive for an add/restock.
 * `buildExtra` lets the caller stamp extra snake_case columns computed from
 * the freshly-read row (e.g. last_used_date, total_usage_count). Returns the
 * updated part (camelCased). Throws on insufficient stock, or if the row keeps
 * changing under us after several attempts.
 */
async function casChangeQuantity(
  partId: string,
  delta: number,
  buildExtra?: (current: any) => Record<string, any>,
  underflowMessage = 'Insufficient stock quantity',
): Promise<StockPart> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: cur, error: readErr } = await supabase
      .from(STOCK_TABLE)
      .select('*')
      .eq('id', partId)
      .maybeSingle()
    if (readErr) throw readErr
    if (!cur) throw new Error('Part not found')

    const current = Number((cur as any).quantity) || 0
    const next = current + delta
    if (next < 0) throw new Error(underflowMessage)

    const extra = buildExtra ? buildExtra(cur) : {}
    const { data: updated, error: updErr } = await supabase
      .from(STOCK_TABLE)
      .update({ quantity: next, ...extra })
      .eq('id', partId)
      .eq('quantity', current) // compare-and-swap guard
      .select()
    if (updErr) throw updErr
    if (updated && updated.length > 0) {
      return toCamel<StockPart>(updated[0]) as StockPart
    }
    // CAS miss — the quantity changed beneath us; loop and retry with the
    // fresh value (re-validates stock on the next pass).
  }
  throw new Error('Could not update stock quantity — too many concurrent changes, please retry')
}

export const stockService = {
  // ==================== STOCK PARTS ====================

  /**
   * Add new part to stock
   */
  async addPart(part: Omit<StockPart, 'id' | 'createdAt'>): Promise<StockPart> {
    const partData: any = {
      partName: part.partName,
      partNumber: part.partNumber,
      makeModel: part.makeModel,
      quantity: part.quantity,
      netPrice: part.netPrice,
      restockTarget: part.restockTarget,
      unit: part.unit,
      organizationId: part.organizationId,
      createdBy: part.createdBy,
      createdAt: new Date().toISOString(),
      totalUsageCount: 0,
    }

    // Only add supplier if it has a value
    if (part.supplier && part.supplier.trim()) {
      partData.supplier = part.supplier.trim()
    }

    // Only add comments if it has a value
    if (part.comments && part.comments.trim()) {
      partData.comments = part.comments.trim()
    }

    if (part.isOneOff) partData.isOneOff = true
    if (part.linkedRegistration) partData.linkedRegistration = part.linkedRegistration
    if (part.linkedVehicleId) partData.linkedVehicleId = part.linkedVehicleId

    const { data, error } = await supabase.from(STOCK_TABLE).insert(toSnake(partData)).select().single()
    if (error) throw error
    return toCamel<StockPart>(data) as StockPart
  },

  /**
   * Get all parts for organization
   */
  async getParts(organizationId: string): Promise<StockPart[]> {
    const { data, error } = await supabase
      .from(STOCK_TABLE)
      .select('*')
      .eq('organization_id', organizationId)
      .order('part_name', { ascending: true })
    if (error) throw error
    return toCamelList<StockPart>(data)
  },

  /**
   * Get single part by ID
   */
  async getPart(partId: string): Promise<StockPart | null> {
    const { data, error } = await supabase.from(STOCK_TABLE).select('*').eq('id', partId).maybeSingle()
    if (error) throw error
    return toCamel<StockPart>(data)
  },

  /**
   * Update part
   */
  async updatePart(partId: string, updates: Partial<StockPart>): Promise<void> {
    // Mirror the Firestore deleteField semantics: undefined → clear the column
    // (null); empty-string supplier/comments → clear too.
    const cleanUpdates: any = {
      updatedAt: new Date().toISOString(),
    }

    Object.keys(updates).forEach((key) => {
      const value = (updates as any)[key]

      if (value === undefined) {
        cleanUpdates[key] = null
      } else if (value === '' && (key === 'supplier' || key === 'comments')) {
        cleanUpdates[key] = null
      } else {
        cleanUpdates[key] = value
      }
    })

    // toSnake drops undefined; cleanUpdates uses explicit null so the
    // cleared columns are written, matching deleteField().
    const row: Record<string, any> = {}
    for (const [k, v] of Object.entries(cleanUpdates)) {
      row[k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())] = v
    }

    const { error } = await supabase.from(STOCK_TABLE).update(row).eq('id', partId)
    if (error) throw error
  },

  /**
   * Delete part
   */
  async deletePart(partId: string): Promise<void> {
    const { error } = await supabase.from(STOCK_TABLE).delete().eq('id', partId)
    if (error) throw error
  },

  /**
   * Delete ALL stock parts for an organization
   * This completely wipes the stock inventory
   */
  async deleteAllStock(organizationId: string): Promise<number> {
    try {
      const { data, error } = await supabase
        .from(STOCK_TABLE)
        .delete()
        .eq('organization_id', organizationId)
        .select('id')
      if (error) throw error
      const count = (data ?? []).length
      logger.log(`✅ Deleted ALL ${count} stock items`)
      return count
    } catch (error) {
      logger.error('Error deleting all stock:', error)
      throw error
    }
  },

  /**
   * Remove part quantity and log usage
   */
  // vehicleId is '' for custom (non-fleet) vehicles — those are matched
  // back by `vehicleRegistrationKey` (normalised reg) instead of by id, so
  // the parts flow is identical to fleet from the caller's perspective.
  async removePartQuantity(
    partId: string,
    quantityUsed: number,
    vehicleId: string,
    vehicleRegistration: string,
    userId: string,
    userName: string,
    organizationId: string,
    notes?: string,
    // Optional job link (migration 0039). When a part is used from a specific
    // service booking (the B1 live-parts flow), pass the booking id so the row
    // is attributed to exactly that job — this is what lets invoicing pull a
    // single job's parts instead of a 10-day window. Omitted = unattributed.
    serviceBookingId?: string | null
  ): Promise<void> {
    // Atomic compare-and-swap deduction — prevents two concurrent removals
    // both reading the old quantity and overselling. `part` comes back with
    // the quantity already decremented; its name/number/price/unit + one-off
    // flags are intact for the snapshot + one-off cleanup below.
    const part = await casChangeQuantity(partId, -quantityUsed, (cur) => ({
      last_used_date: new Date().toISOString(),
      total_usage_count: (Number(cur.total_usage_count) || 0) + 1,
      updated_at: new Date().toISOString(),
    }))
    const newQuantity = part.quantity

    const usageRecord: any = {
      partId,
      partName: part.partName,
      partNumber: part.partNumber,
      vehicleId,
      vehicleRegistration,
      // Canonical reg key — the join key for custom (non-fleet) vehicles
      // whose usage history can't be fetched by vehicleId. Written for
      // fleet rows too so a single reg-based query covers both.
      vehicleRegistrationKey: normalizeReg(vehicleRegistration),
      quantityUsed,
      unit: part.unit,
      usedBy: userId,
      usedByName: userName,
      usedAt: new Date().toISOString(),
      organizationId,
      netPrice: part.netPrice,
      totalCost: part.netPrice * quantityUsed,
    }

    // Only add notes if provided
    if (notes) {
      usageRecord.notes = notes
    }

    // Stamp the job link when this usage belongs to a specific booking
    // (toSnake maps serviceBookingId → service_booking_id).
    if (serviceBookingId) {
      usageRecord.serviceBookingId = serviceBookingId
    }

    const { error: usageError } = await supabase.from(USAGE_TABLE).insert(toSnake(usageRecord))
    if (usageError) throw usageError

    // One-off parts are ordered for a single vehicle and spent once fitted. When
    // such a part hits zero, remove it from stock so it doesn't linger as a dead
    // "out of stock" row. The usage row above survives the delete (part_usage
    // .part_id is ON DELETE SET NULL and carries name/number/price snapshots),
    // so the job + invoice keep the part. Restockable parts stay at 0 as normal.
    const isOneOff = !!part.isOneOff || !!part.linkedRegistration || !!part.linkedVehicleId
    if (newQuantity === 0 && isOneOff) {
      const { error: deleteError } = await supabase.from(STOCK_TABLE).delete().eq('id', partId)
      if (deleteError) throw deleteError
      logger.log('One-off part fully used - removed from stock')
      return
    }

    logger.log('✅ Part usage logged successfully')
  },

  /**
   * Adjust stock (add/remove without vehicle or order)
   * For corrections, damage, theft, returns, etc.
   */
  async adjustStock(
    partId: string,
    adjustmentType: 'add' | 'remove',
    quantity: number,
    reason: 'count_correction' | 'damaged' | 'lost_stolen' | 'return_supplier' | 'transfer' | 'expired' | 'other',
    notes: string,
    userId: string,
    userName: string,
    organizationId: string
  ): Promise<void> {
    logger.log('⚖️ Starting stock adjustment:', {
      partId,
      adjustmentType,
      quantity,
      reason,
    })

    // Atomic compare-and-swap so a manual correction can't race another
    // removal/adjustment and drive stock negative. `part` returns with the
    // quantity already applied; previousStock is recovered from the winning
    // attempt so the audit record is exact.
    const delta = adjustmentType === 'add' ? quantity : -quantity
    const part = await casChangeQuantity(
      partId,
      delta,
      () => ({ updated_at: new Date().toISOString() }),
      'Cannot adjust stock below zero',
    )
    const newQuantity = part.quantity
    const previousStock = newQuantity - delta

    // Create adjustment record for audit trail
    const adjustmentRecord: Omit<StockAdjustment, 'id'> = {
      partId,
      partName: part.partName,
      partNumber: part.partNumber,
      adjustmentType,
      quantity,
      reason,
      notes,
      previousStock,
      newStock: newQuantity,
      adjustedBy: userId,
      adjustedByName: userName,
      adjustedAt: new Date().toISOString(),
      organizationId,
      unit: part.unit,
    }

    const { error: adjustError } = await supabase
      .from(STOCK_ADJUSTMENTS_TABLE)
      .insert(toSnake(adjustmentRecord))
    if (adjustError) throw adjustError

    logger.log('✅ Stock adjustment complete:', {
      partName: part.partName,
      previousStock,
      newStock: newQuantity,
      change: adjustmentType === 'add' ? `+${quantity}` : `-${quantity}`,
    })
  },

  /**
   * Get stock adjustments for organization
   */
  async getStockAdjustments(organizationId: string, limit?: number): Promise<StockAdjustment[]> {
    const { data, error } = await supabase
      .from(STOCK_ADJUSTMENTS_TABLE)
      .select('*')
      .eq('organization_id', organizationId)
      .order('adjusted_at', { ascending: false })
    if (error) throw error
    const adjustments = toCamelList<StockAdjustment>(data)

    return limit ? adjustments.slice(0, limit) : adjustments
  },

  /**
   * Get low stock parts (quantity < restockTarget)
   */
  async getLowStockParts(organizationId: string): Promise<StockPart[]> {
    const allParts = await this.getParts(organizationId)
    return allParts.filter((part) => part.quantity < part.restockTarget)
  },

  // ==================== PART USAGE ====================

  /**
   * Get usage records for a vehicle
   */
  async getVehicleUsageHistory(
    organizationId: string,
    vehicleId: string,
    afterDate?: string,
  ): Promise<PartUsageRecord[]> {
    const { data, error } = await supabase
      .from(USAGE_TABLE)
      .select('*')
      .eq('organization_id', organizationId)
      .eq('vehicle_id', vehicleId)
    if (error) throw error
    return toCamelList<PartUsageRecord>(data)
      .filter((r) => !afterDate || (r.usedAt ?? '') >= afterDate)
      .sort((a, b) => (b.usedAt ?? '').localeCompare(a.usedAt ?? ''))
  },

  /**
   * Usage history for a CUSTOM (non-fleet) vehicle, matched by normalised
   * registration instead of vehicleId. Org-scoped so identical plates
   * across organisations never bleed together. Same shape + ordering as
   * getVehicleUsageHistory so the invoice loader can use either.
   */
  async getVehicleUsageHistoryByRegistration(
    organizationId: string,
    registration: string,
    afterDate?: string,
  ): Promise<PartUsageRecord[]> {
    const key = normalizeReg(registration)
    if (!key) return []

    const { data, error } = await supabase
      .from(USAGE_TABLE)
      .select('*')
      .eq('organization_id', organizationId)
      .eq('vehicle_registration_key', key)
    if (error) throw error

    return toCamelList<PartUsageRecord>(data)
      .filter((r) => !afterDate || (r.usedAt ?? '') >= afterDate)
      .sort((a, b) => (b.usedAt ?? '').localeCompare(a.usedAt ?? ''))
  },

  /**
   * Get all usage records for organization
   */
  async getAllUsageRecords(organizationId: string): Promise<PartUsageRecord[]> {
    const { data, error } = await supabase
      .from(USAGE_TABLE)
      .select('*')
      .eq('organization_id', organizationId)
      .order('used_at', { ascending: false })
    if (error) throw error
    return toCamelList<PartUsageRecord>(data)
  },

  /**
   * Get every part-usage row attributed to one service booking (job).
   * This is the bullet-proof path for invoicing + the live job-parts list:
   * parts are matched by the exact job they were used on (service_booking_id,
   * migration 0039), never by a fuzzy date window. Newest first.
   */
  async getUsageByBooking(
    organizationId: string,
    serviceBookingId: string,
  ): Promise<PartUsageRecord[]> {
    if (!serviceBookingId) return []
    const { data, error } = await supabase
      .from(USAGE_TABLE)
      .select('*')
      .eq('organization_id', organizationId)
      .eq('service_booking_id', serviceBookingId)
    if (error) throw error
    return toCamelList<PartUsageRecord>(data).sort((a, b) =>
      (b.usedAt ?? '').localeCompare(a.usedAt ?? ''),
    )
  },

  /**
   * Stock-page part usage for one vehicle that isn't linked to any job yet
   * (service_booking_id IS NULL) — e.g. oil removed on the Stock page without
   * picking a job. Surfaced in the live job-parts modal so staff can attach it
   * to the job explicitly. Matched by the canonical reg key; recent first.
   */
  async getUnlinkedUsageByRegistration(
    organizationId: string,
    registration: string,
  ): Promise<PartUsageRecord[]> {
    const regKey = normalizeReg(registration)
    if (!organizationId || !regKey) return []
    // Keep the list relevant — only usage from the last ~30 days.
    const since = new Date(); since.setDate(since.getDate() - 30)
    const { data, error } = await supabase
      .from(USAGE_TABLE)
      .select('*')
      .eq('organization_id', organizationId)
      .eq('vehicle_registration_key', regKey)
      .is('service_booking_id', null)
      .gte('used_at', since.toISOString())
    if (error) throw error
    return toCamelList<PartUsageRecord>(data).sort((a, b) =>
      (b.usedAt ?? '').localeCompare(a.usedAt ?? ''),
    )
  },

  /**
   * Attach one existing usage row to a job (stamps service_booking_id). Used by
   * the "Add to this job" action when staff adopt a Stock-page removal into the
   * job they're working on, and by the Stock page's job picker. Idempotent.
   */
  async linkUsageToBooking(usageId: string, serviceBookingId: string): Promise<void> {
    if (!usageId || !serviceBookingId) return
    const { error } = await supabase
      .from(USAGE_TABLE)
      .update({ service_booking_id: serviceBookingId })
      .eq('id', usageId)
    if (error) throw error
  },

  /**
   * Undo a part-usage row (e.g. a mis-added part on a job). Restores the
   * quantity back onto the part's stock and deletes the usage row so it can
   * never be invoiced. The mirror image of removePartQuantity — used by the
   * live job-parts list's remove button.
   */
  async deletePartUsage(usageId: string, restock = true): Promise<void> {
    if (!usageId) return

    // Read the row first so we know which part + how much to give back.
    const { data, error } = await supabase
      .from(USAGE_TABLE)
      .select('*')
      .eq('id', usageId)
      .single()
    if (error) throw error

    const partId = (data as any).part_id as string | null
    const qty = Number((data as any).quantity_used) || 0

    if (restock && partId && qty > 0) {
      const part = await this.getPart(partId)
      if (part) {
        const { error: restockError } = await supabase
          .from(STOCK_TABLE)
          .update({
            quantity: part.quantity + qty,
            updated_at: new Date().toISOString(),
          })
          .eq('id', partId)
        if (restockError) throw restockError
      }
    }

    const { error: deleteError } = await supabase
      .from(USAGE_TABLE)
      .delete()
      .eq('id', usageId)
    if (deleteError) throw deleteError

    logger.log('✅ Part usage reversed + stock restored')
  },

  /**
   * Clear a part's one-off vehicle link. Called when a part that was ordered
   * for a specific registration is used on that vehicle — the earmark is
   * fulfilled, so it becomes ordinary stock again (any leftover quantity).
   */
  async clearPartLink(partId: string): Promise<void> {
    if (!partId) return
    const { error } = await supabase
      .from(STOCK_TABLE)
      .update({
        linked_registration: null,
        linked_vehicle_id: null,
        is_one_off: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', partId)
    if (error) throw error
  },

  // ==================== INVOICES ====================

  /**
   * Generate next invoice number
   */
  async generateInvoiceNumber(organizationId: string): Promise<string> {
    // Next number = (highest existing INV-#### for this org) + 1. We scan ALL
    // numbers and take the max rather than ordering by created_at — created_at
    // order doesn't track the numeric sequence (edits, deletions, same-second
    // timestamps), which produced duplicates and a 409 unique-constraint error
    // on (organization_id, invoice_number).
    const { data, error } = await supabase
      .from(INVOICE_TABLE)
      .select('invoice_number')
      .eq('organization_id', organizationId)
    if (error) throw error
    let max = 0
    for (const row of data ?? []) {
      const n = parseInt(String((row as any).invoice_number || '').split('-')[1] || '', 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
    return `INV-${String(max + 1).padStart(4, '0')}`
  },

  /**
   * Create invoice
   */
  async createInvoice(invoice: Omit<Invoice, 'id' | 'createdAt'>): Promise<Invoice> {
    // Self-heal invoice-number collisions: if two invoices are raised close
    // together (or the number was stale) the insert hits the unique
    // (organization_id, invoice_number) constraint — Postgres 23505, surfaced
    // to the client as a 409. Regenerate from the current max and retry.
    let invoiceNumber = invoice.invoiceNumber
    for (let attempt = 0; attempt < 6; attempt++) {
      const invoiceData = {
        ...invoice,
        invoiceNumber,
        createdAt: new Date().toISOString(),
      }
      const { data, error } = await supabase.from(INVOICE_TABLE).insert(toSnake(invoiceData)).select().single()
      if (!error) return toCamel<Invoice>(data) as Invoice

      const isDuplicate =
        (error as any).code === '23505' ||
        /duplicate key|unique constraint/i.test(error.message || '')
      if (!isDuplicate || !invoice.organizationId || attempt === 5) throw error

      invoiceNumber = await this.generateInvoiceNumber(invoice.organizationId)
    }
    // Unreachable — the loop either returns or throws.
    throw new Error('Could not allocate a unique invoice number')
  },

  /**
   * Get invoices for organization
   */
  async getInvoices(organizationId: string): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from(INVOICE_TABLE)
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return toCamelList<Invoice>(data)
  },

  /**
   * Get single invoice
   */
  async getInvoice(invoiceId: string): Promise<Invoice | null> {
    const { data, error } = await supabase.from(INVOICE_TABLE).select('*').eq('id', invoiceId).maybeSingle()
    if (error) throw error
    return toCamel<Invoice>(data)
  },

  /**
   * Update invoice status
   */
  async updateInvoiceStatus(invoiceId: string, status: Invoice['status']): Promise<void> {
    const { error } = await supabase.from(INVOICE_TABLE).update({ status }).eq('id', invoiceId)
    if (error) throw error
  },

  /**
   * Update an existing invoice (full edit). Pass only the editable fields —
   * invoice number, status, createdAt and organization stay as they were.
   * Serialised exactly like createInvoice so the stored shape is identical.
   */
  async updateInvoice(
    invoiceId: string,
    invoice: Partial<Omit<Invoice, 'id' | 'createdAt' | 'invoiceNumber' | 'organizationId'>>,
  ): Promise<void> {
    const { error } = await supabase
      .from(INVOICE_TABLE)
      .update(toSnake(invoice))
      .eq('id', invoiceId)
    if (error) throw error
  },

  /**
   * Delete invoice
   */
  async deleteInvoice(invoiceId: string): Promise<void> {
    const { error } = await supabase.from(INVOICE_TABLE).delete().eq('id', invoiceId)
    if (error) throw error
  },

  // ==================== ORDER HISTORY ====================

  /**
   * Add order history record
   */
  async addOrderHistory(
    partId: string,
    partName: string,
    partNumber: string,
    supplier: string | undefined,
    quantity: number,
    unit: 'pieces' | 'liters',
    netPrice: number,
    userId: string,
    userName: string,
    organizationId: string,
    orderType: 'initial' | 'restock'
  ): Promise<void> {
    const orderRecord: any = {
      partId,
      partName,
      partNumber,
      quantityOrdered: quantity,
      unit,
      netPrice,
      totalCost: netPrice * quantity,
      orderedBy: userId,
      orderedByName: userName,
      orderedAt: new Date().toISOString(),
      organizationId,
      orderType,
    }

    // Only add supplier if provided
    if (supplier && supplier.trim()) {
      orderRecord.supplier = supplier.trim()
    }

    const { error } = await supabase.from(ORDER_HISTORY_TABLE).insert(toSnake(orderRecord))
    if (error) throw error
  },

  /**
   * Get order history for last 3 months
   */
  async getOrderHistory(organizationId: string): Promise<OrderHistoryRecord[]> {
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    const threeMonthsAgoISO = threeMonthsAgo.toISOString()

    const { data, error } = await supabase
      .from(ORDER_HISTORY_TABLE)
      .select('*')
      .eq('organization_id', organizationId)
      .gte('ordered_at', threeMonthsAgoISO)
      .order('ordered_at', { ascending: false })
    if (error) throw error
    return toCamelList<OrderHistoryRecord>(data)
  },

  /**
   * Delete all order history for a specific part
   */
  async deleteOrderHistory(organizationId: string, partId: string): Promise<void> {
    try {
      const { data, error } = await supabase
        .from(ORDER_HISTORY_TABLE)
        .delete()
        .eq('organization_id', organizationId)
        .eq('part_id', partId)
        .select('id')
      if (error) throw error
      logger.log(`✅ Deleted ${(data ?? []).length} order history records for part ${partId}`)
    } catch (error) {
      logger.error('Error deleting order history:', error)
      throw error
    }
  },

  /**
   * Delete a single order history record
   */
  async deleteOrderHistoryRecord(orderId: string): Promise<void> {
    try {
      const { error } = await supabase.from(ORDER_HISTORY_TABLE).delete().eq('id', orderId)
      if (error) throw error
      logger.log('✅ Order history record deleted successfully')
    } catch (error) {
      logger.error('Error deleting order history record:', error)
      throw error
    }
  },

  /**
   * Delete ALL order history for an organization
   */
  async deleteAllOrderHistory(organizationId: string): Promise<void> {
    try {
      const { data, error } = await supabase
        .from(ORDER_HISTORY_TABLE)
        .delete()
        .eq('organization_id', organizationId)
        .select('id')
      if (error) throw error
      logger.log(`✅ Deleted ALL ${(data ?? []).length} order history records`)
    } catch (error) {
      logger.error('Error deleting all order history:', error)
      throw error
    }
  },
  /**
   * Batch use multiple parts on a single vehicle
   * ✅ Atomic-ish batch operation - all parts validated up front, then deducted
   * Used when a mechanic does a full service and uses multiple parts at once
   */
  async batchUseParts(
    items: Array<{ partId: string; quantity: number }>,
    vehicleId: string,
    vehicleRegistration: string,
    userId: string,
    userName: string,
    organizationId: string,
    notes?: string,
    // Optional job link (migration 0039) — parity with removePartQuantity.
    // When the batch belongs to a specific service booking, pass the id so
    // every usage row is attributed to that exact job for invoicing. Omitted
    // (e.g. the bodyshop flow, which isn't a service_booking) = unattributed.
    serviceBookingId?: string | null
  ): Promise<void> {
    // Fetch all parts first to fail fast on an obviously-short batch (deducts
    // nothing in that case). The real oversell guard is the per-item
    // compare-and-swap below; this is just an early, friendly error.
    const partsData: StockPart[] = []
    for (const item of items) {
      const part = await this.getPart(item.partId)
      if (!part) throw new Error(`Part not found: ${item.partId}`)
      if (part.quantity < item.quantity) {
        throw new Error(
          `Insufficient stock for ${part.partName}: have ${part.quantity}, need ${item.quantity}`
        )
      }
      partsData.push(part)
    }

    // Canonical reg key so batch usage matches custom (non-fleet) vehicles by
    // registration, exactly like removePartQuantity. (Previously omitted — a
    // gap that left bodyshop/custom-reg parts unmatchable by reg.)
    const vehicleRegistrationKey = normalizeReg(vehicleRegistration)

    // Deduct each item atomically. If a later item fails after earlier ones
    // were applied, compensate by restocking the applied ones so the batch
    // doesn't leave a partial deduction. (True DB-transaction atomicity would
    // need a Postgres RPC; this rollback covers the realistic failure modes.)
    const applied: Array<{ partId: string; quantity: number }> = []
    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const part = partsData[i]

        await casChangeQuantity(item.partId, -item.quantity, (cur) => ({
          last_used_date: new Date().toISOString(),
          total_usage_count: (Number(cur.total_usage_count) || 0) + 1,
          updated_at: new Date().toISOString(),
        }))
        applied.push({ partId: item.partId, quantity: item.quantity })

        const usageRecord: any = {
          partId: item.partId,
          partName: part.partName,
          partNumber: part.partNumber,
          vehicleId,
          vehicleRegistration,
          vehicleRegistrationKey,
          quantityUsed: item.quantity,
          unit: part.unit,
          usedBy: userId,
          usedByName: userName,
          usedAt: new Date().toISOString(),
          organizationId,
          netPrice: part.netPrice,
          totalCost: part.netPrice * item.quantity,
          notes: notes || `Batch use: ${items.length} parts`,
        }

        // Stamp the job link when supplied (toSnake → service_booking_id).
        if (serviceBookingId) usageRecord.serviceBookingId = serviceBookingId

        const { error: usageError } = await supabase.from(USAGE_TABLE).insert(toSnake(usageRecord))
        if (usageError) throw usageError
      }
    } catch (err) {
      // Compensating rollback: give back everything already deducted.
      for (const a of applied) {
        try {
          await casChangeQuantity(a.partId, a.quantity, () => ({
            updated_at: new Date().toISOString(),
          }))
        } catch (rollbackErr) {
          logger.error('batchUseParts rollback failed for part', a.partId, rollbackErr)
        }
      }
      throw err
    }
  },
}
