// src/lib/services/stockService.ts
// Stock Management Service - All database operations
// ✅ CLEAN VERSION: No undo feature - use Adjust Stock instead
// ✅ FEATURES: Stock adjustments, edit parts, delete orders, all existing functions
// ✅ FIXED: Firestore compatibility - no undefined values
// ✅ NEW: Delete all stock function added

import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  increment,
  serverTimestamp,
  writeBatch,
  Timestamp,
  deleteField  // ✅ NEW: Import deleteField for removing fields
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { StockPart, PartUsageRecord, Invoice, OrderHistoryRecord, StockAdjustment } from '@/types/stock'
import { logger } from '@/lib/logger'
import { normalizeReg } from '@/lib/utils/registration'

const STOCK_COLLECTION = 'stockParts'
const USAGE_COLLECTION = 'partUsage'
const INVOICE_COLLECTION = 'invoices'
const ORDER_HISTORY_COLLECTION = 'orderHistory'
const STOCK_ADJUSTMENTS_COLLECTION = 'stockAdjustments'

export const stockService = {
  // ==================== STOCK PARTS ====================
  
  /**
   * Add new part to stock
   */
  async addPart(part: Omit<StockPart, 'id' | 'createdAt'>): Promise<StockPart> {
    // ✅ FIXED: Remove undefined fields for Firestore compatibility
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
      totalUsageCount: 0
    }
    
    // Only add supplier if it has a value
    if (part.supplier && part.supplier.trim()) {
      partData.supplier = part.supplier.trim()
    }
    
    // ✅ NEW: Only add comments if it has a value
    if (part.comments && part.comments.trim()) {
      partData.comments = part.comments.trim()
    }

    if (part.isOneOff) partData.isOneOff = true
    if (part.linkedRegistration) partData.linkedRegistration = part.linkedRegistration
    if (part.linkedVehicleId) partData.linkedVehicleId = part.linkedVehicleId
    
    const docRef = await addDoc(collection(db, STOCK_COLLECTION), partData)
    return { id: docRef.id, ...partData }
  },

  /**
   * Get all parts for organization
   */
  async getParts(organizationId: string): Promise<StockPart[]> {
    const q = query(
      collection(db, STOCK_COLLECTION),
      where('organizationId', '==', organizationId),
      orderBy('partName', 'asc')
    )
    
    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as StockPart))
  },

  /**
   * Get single part by ID
   */
  async getPart(partId: string): Promise<StockPart | null> {
    const docRef = doc(db, STOCK_COLLECTION, partId)
    const docSnap = await getDoc(docRef)
    
    if (!docSnap.exists()) return null
    
    return { id: docSnap.id, ...docSnap.data() } as StockPart
  },

  /**
   * Update part
   */
  async updatePart(partId: string, updates: Partial<StockPart>): Promise<void> {
    // ✅ FIXED: Handle undefined fields properly - delete them from Firestore
    const cleanUpdates: any = {
      updatedAt: new Date().toISOString()
    }
    
    // Process each update
    Object.keys(updates).forEach(key => {
      const value = (updates as any)[key]
      
      // If value is undefined, mark field for deletion
      if (value === undefined) {
        cleanUpdates[key] = deleteField()
      } 
      // If it's an empty string for optional fields, mark for deletion
      else if (value === '' && (key === 'supplier' || key === 'comments')) {
        cleanUpdates[key] = deleteField()
      }
      // Otherwise, include the value
      else {
        cleanUpdates[key] = value
      }
    })
    
    const docRef = doc(db, STOCK_COLLECTION, partId)
    await updateDoc(docRef, cleanUpdates)
  },

  /**
   * Delete part
   */
  async deletePart(partId: string): Promise<void> {
    await deleteDoc(doc(db, STOCK_COLLECTION, partId))
  },

  /**
   * ✅ NEW: Delete ALL stock parts for an organization
   * This completely wipes the stock inventory
   */
  async deleteAllStock(organizationId: string): Promise<number> {
    try {
      const stockQuery = query(
        collection(db, STOCK_COLLECTION),
        where('organizationId', '==', organizationId)
      )
      
      const snapshot = await getDocs(stockQuery)
      
      // Firebase has a limit of 500 operations per batch
      // If you have more than 500 items, we need multiple batches
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref))
      await Promise.all(deletePromises)
      
      logger.log(`✅ Deleted ALL ${snapshot.size} stock items`)
      return snapshot.size
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
    notes?: string
  ): Promise<void> {
    const batch = writeBatch(db)
    
    const part = await this.getPart(partId)
    if (!part) throw new Error('Part not found')
    
    const newQuantity = part.quantity - quantityUsed
    if (newQuantity < 0) {
      throw new Error('Insufficient stock quantity')
    }
    
    const partRef = doc(db, STOCK_COLLECTION, partId)
    batch.update(partRef, {
      quantity: newQuantity,
      lastUsedDate: new Date().toISOString(),
      totalUsageCount: increment(1),
      updatedAt: new Date().toISOString()
    })
    
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
      totalCost: part.netPrice * quantityUsed
    }
    
    // Only add notes if provided
    if (notes) {
      usageRecord.notes = notes
    }
    
    const usageRef = doc(collection(db, USAGE_COLLECTION))
    batch.set(usageRef, usageRecord)
    
    await batch.commit()
    
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
    const batch = writeBatch(db)
    
    logger.log('⚖️ Starting stock adjustment:', {
      partId,
      adjustmentType,
      quantity,
      reason
    })
    
    // Get part details
    const part = await this.getPart(partId)
    if (!part) throw new Error('Part not found')
    
    // Calculate new quantity
    const previousStock = part.quantity
    const newQuantity = adjustmentType === 'add' 
      ? part.quantity + quantity 
      : part.quantity - quantity
    
    if (newQuantity < 0) {
      throw new Error('Cannot adjust stock below zero')
    }
    
    // Update part quantity
    const partRef = doc(db, STOCK_COLLECTION, partId)
    batch.update(partRef, {
      quantity: newQuantity,
      updatedAt: new Date().toISOString()
    })
    
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
      unit: part.unit
    }
    
    const adjustmentRef = doc(collection(db, STOCK_ADJUSTMENTS_COLLECTION))
    batch.set(adjustmentRef, adjustmentRecord)
    
    await batch.commit()
    
    logger.log('✅ Stock adjustment complete:', {
      partName: part.partName,
      previousStock,
      newStock: newQuantity,
      change: adjustmentType === 'add' ? `+${quantity}` : `-${quantity}`
    })
  },

  /**
   * Get stock adjustments for organization
   */
  async getStockAdjustments(organizationId: string, limit?: number): Promise<StockAdjustment[]> {
    let q = query(
      collection(db, STOCK_ADJUSTMENTS_COLLECTION),
      where('organizationId', '==', organizationId),
      orderBy('adjustedAt', 'desc')
    )
    
    const snapshot = await getDocs(q)
    const adjustments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as StockAdjustment))
    
    return limit ? adjustments.slice(0, limit) : adjustments
  },

  /**
   * Get low stock parts (quantity < restockTarget)
   */
  async getLowStockParts(organizationId: string): Promise<StockPart[]> {
    const allParts = await this.getParts(organizationId)
    return allParts.filter(part => part.quantity < part.restockTarget)
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
    // organizationId + vehicleId are BOTH equality filters → served
    // without a composite index. The date window + ordering are applied
    // in JS (a vehicle has few usage rows) so the tenant rules are
    // satisfied without introducing a new index.
    const snapshot = await getDocs(
      query(
        collection(db, USAGE_COLLECTION),
        where('organizationId', '==', organizationId),
        where('vehicleId', '==', vehicleId),
      ),
    )
    return snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as PartUsageRecord))
      .filter(r => !afterDate || (r.usedAt ?? '') >= afterDate)
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

    // SINGLE equality filter only → served by the auto single-field
    // index, so this NEVER needs a composite index (unlike the id-based
    // history which has a long-standing one). Org-scoping + the date
    // window + ordering are applied in JS afterwards. A given reg has a
    // tiny number of rows so the client-side pass is negligible.
    // org + reg-key are BOTH equality filters → no composite index. Org
    // is now enforced in the QUERY (was a post-fetch JS filter) so the
    // tightened tenant rules accept it.
    const snapshot = await getDocs(
      query(
        collection(db, USAGE_COLLECTION),
        where('organizationId', '==', organizationId),
        where('vehicleRegistrationKey', '==', key),
      ),
    )

    const rows = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as PartUsageRecord))

    return rows
      .filter(r => !afterDate || (r.usedAt ?? '') >= afterDate)
      .sort((a, b) => (b.usedAt ?? '').localeCompare(a.usedAt ?? ''))
  },

  /**
   * Get all usage records for organization
   */
  async getAllUsageRecords(organizationId: string): Promise<PartUsageRecord[]> {
    const q = query(
      collection(db, USAGE_COLLECTION),
      where('organizationId', '==', organizationId),
      orderBy('usedAt', 'desc')
    )
    
    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as PartUsageRecord))
  },

  // ==================== INVOICES ====================
  
  /**
   * Generate next invoice number
   */
  async generateInvoiceNumber(organizationId: string): Promise<string> {
    const q = query(
      collection(db, INVOICE_COLLECTION),
      where('organizationId', '==', organizationId),
      orderBy('createdAt', 'desc')
    )
    
    const snapshot = await getDocs(q)
    const lastInvoice = snapshot.docs[0]
    
    if (!lastInvoice) {
      return 'INV-0001'
    }
    
    const lastNumber = lastInvoice.data().invoiceNumber
    const numPart = parseInt(lastNumber.split('-')[1]) + 1
    return `INV-${numPart.toString().padStart(4, '0')}`
  },

  /**
   * Create invoice
   */
  async createInvoice(invoice: Omit<Invoice, 'id' | 'createdAt'>): Promise<Invoice> {
    const invoiceData = {
      ...invoice,
      createdAt: new Date().toISOString()
    }
    
    const docRef = await addDoc(collection(db, INVOICE_COLLECTION), invoiceData)
    return { id: docRef.id, ...invoiceData }
  },

  /**
   * Get invoices for organization
   */
  async getInvoices(organizationId: string): Promise<Invoice[]> {
    const q = query(
      collection(db, INVOICE_COLLECTION),
      where('organizationId', '==', organizationId),
      orderBy('createdAt', 'desc')
    )
    
    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Invoice))
  },

  /**
   * Get single invoice
   */
  async getInvoice(invoiceId: string): Promise<Invoice | null> {
    const docRef = doc(db, INVOICE_COLLECTION, invoiceId)
    const docSnap = await getDoc(docRef)
    
    if (!docSnap.exists()) return null
    
    return { id: docSnap.id, ...docSnap.data() } as Invoice
  },

  /**
   * Update invoice status
   */
  async updateInvoiceStatus(invoiceId: string, status: Invoice['status']): Promise<void> {
    const docRef = doc(db, INVOICE_COLLECTION, invoiceId)
    await updateDoc(docRef, { status })
  },

  /**
   * Delete invoice
   */
  async deleteInvoice(invoiceId: string): Promise<void> {
    await deleteDoc(doc(db, INVOICE_COLLECTION, invoiceId))
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
      orderType
    }
    
    // Only add supplier if provided
    if (supplier && supplier.trim()) {
      orderRecord.supplier = supplier.trim()
    }
    
    await addDoc(collection(db, ORDER_HISTORY_COLLECTION), orderRecord)
  },

  /**
   * Get order history for last 3 months
   */
  async getOrderHistory(organizationId: string): Promise<OrderHistoryRecord[]> {
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    const threeMonthsAgoISO = threeMonthsAgo.toISOString()
    
    const q = query(
      collection(db, ORDER_HISTORY_COLLECTION),
      where('organizationId', '==', organizationId),
      where('orderedAt', '>=', threeMonthsAgoISO),
      orderBy('orderedAt', 'desc')
    )
    
    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as OrderHistoryRecord))
  },

  /**
   * Delete all order history for a specific part
   */
  async deleteOrderHistory(organizationId: string, partId: string): Promise<void> {
    try {
      const historyQuery = query(
        collection(db, ORDER_HISTORY_COLLECTION),
        where('organizationId', '==', organizationId),
        where('partId', '==', partId)
      )
      
      const snapshot = await getDocs(historyQuery)
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref))
      await Promise.all(deletePromises)
      
      logger.log(`✅ Deleted ${snapshot.size} order history records for part ${partId}`)
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
      await deleteDoc(doc(db, ORDER_HISTORY_COLLECTION, orderId))
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
      const historyQuery = query(
        collection(db, ORDER_HISTORY_COLLECTION),
        where('organizationId', '==', organizationId)
      )
      
      const snapshot = await getDocs(historyQuery)
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref))
      await Promise.all(deletePromises)
      
      logger.log(`✅ Deleted ALL ${snapshot.size} order history records`)
    } catch (error) {
      logger.error('Error deleting all order history:', error)
      throw error
    }
  },
  /**
   * Batch use multiple parts on a single vehicle
   * ✅ NEW: Atomic batch operation - all parts deducted or none
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
    const batch = writeBatch(db)
    
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
    
    // Build all batch operations
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const part = partsData[i]
      const newQuantity = part.quantity - item.quantity
      
      // Update part quantity
      const partRef = doc(db, STOCK_COLLECTION, item.partId)
      batch.update(partRef, {
        quantity: newQuantity,
        lastUsedDate: new Date().toISOString(),
        totalUsageCount: increment(1),
        updatedAt: new Date().toISOString()
      })
      
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
        totalCost: part.netPrice * item.quantity
      }
      
      // Only add notes if provided
      if (notes) {
        usageRecord.notes = notes
      } else {
        usageRecord.notes = `Batch use: ${items.length} parts`
      }
      
      const usageRef = doc(collection(db, USAGE_COLLECTION))
      batch.set(usageRef, usageRecord)
    }
    
    await batch.commit()
  }
}