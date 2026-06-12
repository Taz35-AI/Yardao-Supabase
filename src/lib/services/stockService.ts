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
    const part = await this.getPart(partId)
    if (!part) throw new Error('Part not found')

    const newQuantity = part.quantity - quantityUsed
    if (newQuantity < 0) {
      throw new Error('Insufficient stock quantity')
    }

    const { error: updateError } = await supabase
      .from(STOCK_TABLE)
      .update({
        quantity: newQuantity,
        last_used_date: new Date().toISOString(),
        total_usage_count: (part.totalUsageCount ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', partId)
    if (updateError) throw updateError

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

    // Get part details
    const part = await this.getPart(partId)
    if (!part) throw new Error('Part not found')

    // Calculate new quantity
    const previousStock = part.quantity
    const newQuantity = adjustmentType === 'add' ? part.quantity + quantity : part.quantity - quantity

    if (newQuantity < 0) {
      throw new Error('Cannot adjust stock below zero')
    }

    // Update part quantity
    const { error: updateError } = await supabase
      .from(STOCK_TABLE)
      .update({
        quantity: newQuantity,
        updated_at: new Date().toISOString(),
      })
      .eq('id', partId)
    if (updateError) throw updateError

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

  // ==================== INVOICES ====================

  /**
   * Generate next invoice number
   */
  async generateInvoiceNumber(organizationId: string): Promise<string> {
    const { data, error } = await supabase
      .from(INVOICE_TABLE)
      .select('invoice_number')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
    if (error) throw error
    const lastInvoice = (data ?? [])[0]

    if (!lastInvoice) {
      return 'INV-0001'
    }

    const lastNumber = lastInvoice.invoice_number
    const numPart = parseInt(lastNumber.split('-')[1]) + 1
    return `INV-${numPart.toString().padStart(4, '0')}`
  },

  /**
   * Create invoice
   */
  async createInvoice(invoice: Omit<Invoice, 'id' | 'createdAt'>): Promise<Invoice> {
    const invoiceData = {
      ...invoice,
      createdAt: new Date().toISOString(),
    }

    const { data, error } = await supabase.from(INVOICE_TABLE).insert(toSnake(invoiceData)).select().single()
    if (error) throw error
    return toCamel<Invoice>(data) as Invoice
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
    notes?: string
  ): Promise<void> {
    // Fetch all parts first to validate
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

    // Build all operations
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const part = partsData[i]
      const newQuantity = part.quantity - item.quantity

      // Update part quantity
      const { error: updateError } = await supabase
        .from(STOCK_TABLE)
        .update({
          quantity: newQuantity,
          last_used_date: new Date().toISOString(),
          total_usage_count: (part.totalUsageCount ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.partId)
      if (updateError) throw updateError

      // Create usage record
      const usageRecord: any = {
        partId: item.partId,
        partName: part.partName,
        partNumber: part.partNumber,
        vehicleId,
        vehicleRegistration,
        quantityUsed: item.quantity,
        unit: part.unit,
        usedBy: userId,
        usedByName: userName,
        usedAt: new Date().toISOString(),
        organizationId,
        netPrice: part.netPrice,
        totalCost: part.netPrice * item.quantity,
      }

      // Only add notes if provided
      if (notes) {
        usageRecord.notes = notes
      } else {
        usageRecord.notes = `Batch use: ${items.length} parts`
      }

      const { error: usageError } = await supabase.from(USAGE_TABLE).insert(toSnake(usageRecord))
      if (usageError) throw usageError
    }
  },
}
