// src/lib/checkoutHistoryService.ts - Enhanced with branch tracking while preserving all existing functionality
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logger } from '@/lib/logger'

export interface CheckoutHistoryRecord {
  id?: string
  // Vehicle Details
  registration: string
  make: string
  model: string
  colour?: string
  size: string
  condition: string
  status: string
  mileage?: string
  contract?: string | null
  contractColor?: string | null
  motExpiry?: string
  taxExpiry?: string
  notes?: string
  comments?: string
  insuranceStatus?: string
  
  // NEW: Branch Information for multi-branch support
  originalBranchId?: string | null        // e.g., 'main', 'fairview', 'kensington'
  originalBranchName?: string | null      // e.g., 'Main Branch', 'Fairview Barking'
  
  // Checkout Information
  checkedOutDate: Date | Timestamp | any
  checkedOutBy: string // User ID
  checkedOutByName: string // Display name
  
  // Organization
  organizationId: string
  
  // Additional context from check-in
  originalCheckInDate?: Date | Timestamp | any
  originalCheckedInBy?: string
  originalCheckedInByName?: string
  
  // NEW: External garage specific fields
  isExternalGarageCheckout?: boolean      // Flag for external garage checkouts
  externalGarageName?: string             // Name of external garage
  serviceBookingId?: string               // Associated service booking ID
  
  // Timestamps
  createdAt?: Date | Timestamp | any
}

const CHECKOUT_HISTORY_COLLECTION = 'checkoutHistory'

export const checkoutHistoryService = {
  /**
   * Add a new checkout history record (enhanced to support branch tracking)
   */
  async addCheckoutRecord(record: Omit<CheckoutHistoryRecord, 'id' | 'createdAt'>) {
    const recordData = {
      ...record,
      checkedOutDate: record.checkedOutDate || serverTimestamp(),
      createdAt: serverTimestamp()
    }
    
    logger.log('Adding checkout record with branch tracking:', {
      registration: recordData.registration,
      originalBranchId: recordData.originalBranchId,
      originalBranchName: recordData.originalBranchName,
      isExternalGarageCheckout: recordData.isExternalGarageCheckout
    })
    
    const docRef = await addDoc(collection(db, CHECKOUT_HISTORY_COLLECTION), recordData)
    return { id: docRef.id, ...recordData }
  },

  /**
   * Get checkout history for an organization with optional date filtering
   */
  async getCheckoutHistory(
    organizationId: string, 
    daysBack: number = 30,
    limitResults: number = 100
  ): Promise<CheckoutHistoryRecord[]> {
    // Calculate the date threshold (30 days back by default)
    const dateThreshold = new Date()
    dateThreshold.setDate(dateThreshold.getDate() - daysBack)

    const q = query(
      collection(db, CHECKOUT_HISTORY_COLLECTION),
      where('organizationId', '==', organizationId),
      where('checkedOutDate', '>=', Timestamp.fromDate(dateThreshold)),
      orderBy('checkedOutDate', 'desc'),
      limit(limitResults)
    )
    
    const querySnapshot = await getDocs(q)
    return querySnapshot.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        ...data,
        // Safely convert Firestore timestamps to Date objects
        checkedOutDate: data.checkedOutDate?.toDate ? data.checkedOutDate.toDate() : data.checkedOutDate,
        originalCheckInDate: data.originalCheckInDate?.toDate ? data.originalCheckInDate.toDate() : data.originalCheckInDate,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt
      } as CheckoutHistoryRecord
    })
  },

  /**
   * Get all checkout history for an organization (no date filtering)
   */
  async getAllCheckoutHistory(organizationId: string): Promise<CheckoutHistoryRecord[]> {
    const q = query(
      collection(db, CHECKOUT_HISTORY_COLLECTION),
      where('organizationId', '==', organizationId),
      orderBy('checkedOutDate', 'desc')
    )
    
    const querySnapshot = await getDocs(q)
    return querySnapshot.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        ...data,
        checkedOutDate: data.checkedOutDate?.toDate ? data.checkedOutDate.toDate() : data.checkedOutDate,
        originalCheckInDate: data.originalCheckInDate?.toDate ? data.originalCheckInDate.toDate() : data.originalCheckInDate,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt
      } as CheckoutHistoryRecord
    })
  },

  /**
   * Search checkout history by registration number
   */
  async searchByRegistration(organizationId: string, registration: string): Promise<CheckoutHistoryRecord[]> {
    const cleanReg = registration.trim().toUpperCase().replace(/\s+/g, '')
    
    const q = query(
      collection(db, CHECKOUT_HISTORY_COLLECTION),
      where('organizationId', '==', organizationId),
      where('registration', '==', cleanReg),
      orderBy('checkedOutDate', 'desc')
    )
    
    const querySnapshot = await getDocs(q)
    return querySnapshot.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        ...data,
        checkedOutDate: data.checkedOutDate?.toDate ? data.checkedOutDate.toDate() : data.checkedOutDate,
        originalCheckInDate: data.originalCheckInDate?.toDate ? data.originalCheckInDate.toDate() : data.originalCheckInDate,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt
      } as CheckoutHistoryRecord
    })
  },

  /**
   * NEW: Search external garage checkout records by registration
   * This is used to find vehicles that were sent to external garages for service
   */
  async findExternalGarageCheckouts(
    organizationId: string, 
    registration: string
  ): Promise<CheckoutHistoryRecord[]> {
    const cleanReg = registration.trim().toUpperCase().replace(/\s+/g, '')
    
    const q = query(
      collection(db, CHECKOUT_HISTORY_COLLECTION),
      where('organizationId', '==', organizationId),
      where('registration', '==', cleanReg),
      where('isExternalGarageCheckout', '==', true),
      orderBy('checkedOutDate', 'desc')
    )
    
    const querySnapshot = await getDocs(q)
    return querySnapshot.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        ...data,
        checkedOutDate: data.checkedOutDate?.toDate ? data.checkedOutDate.toDate() : data.checkedOutDate,
        originalCheckInDate: data.originalCheckInDate?.toDate ? data.originalCheckInDate.toDate() : data.originalCheckInDate,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt
      } as CheckoutHistoryRecord
    })
  },

  /**
   * NEW: Get checkout history for a specific branch
   * Useful for branch managers to see what vehicles were checked out from their branch
   */
  async getBranchCheckoutHistory(
    organizationId: string,
    branchId: string,
    daysBack: number = 30
  ): Promise<CheckoutHistoryRecord[]> {
    const dateThreshold = new Date()
    dateThreshold.setDate(dateThreshold.getDate() - daysBack)

    const q = query(
      collection(db, CHECKOUT_HISTORY_COLLECTION),
      where('organizationId', '==', organizationId),
      where('originalBranchId', '==', branchId),
      where('checkedOutDate', '>=', Timestamp.fromDate(dateThreshold)),
      orderBy('checkedOutDate', 'desc')
    )
    
    const querySnapshot = await getDocs(q)
    return querySnapshot.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        ...data,
        checkedOutDate: data.checkedOutDate?.toDate ? data.checkedOutDate.toDate() : data.checkedOutDate,
        originalCheckInDate: data.originalCheckInDate?.toDate ? data.originalCheckInDate.toDate() : data.originalCheckInDate,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt
      } as CheckoutHistoryRecord
    })
  },

  /**
   * NEW: Get most recent external garage checkout for a vehicle
   * Used specifically for restoring vehicle data when returning from external service
   */
  async getMostRecentExternalCheckout(
    organizationId: string,
    registration: string
  ): Promise<CheckoutHistoryRecord | null> {
    const records = await this.findExternalGarageCheckouts(organizationId, registration)
    return records.length > 0 ? records[0] : null
  },

  /**
   * NEW: Get checkout statistics for a branch
   * Useful for reporting and analytics
   */
  async getBranchCheckoutStats(
    organizationId: string,
    branchId: string,
    daysBack: number = 30
  ): Promise<{
    totalCheckouts: number
    externalGarageCheckouts: number
    regularCheckouts: number
    topDestinations: Array<{ name: string; count: number }>
  }> {
    const records = await this.getBranchCheckoutHistory(organizationId, branchId, daysBack)
    
    const stats = {
      totalCheckouts: records.length,
      externalGarageCheckouts: records.filter(r => r.isExternalGarageCheckout).length,
      regularCheckouts: records.filter(r => !r.isExternalGarageCheckout).length,
      topDestinations: [] as Array<{ name: string; count: number }>
    }

    // Calculate top external garage destinations
    const destinations = new Map<string, number>()
    records
      .filter(r => r.isExternalGarageCheckout && r.externalGarageName)
      .forEach(r => {
        const name = r.externalGarageName!
        destinations.set(name, (destinations.get(name) || 0) + 1)
      })

    stats.topDestinations = Array.from(destinations.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5) // Top 5 destinations

    return stats
  }
}