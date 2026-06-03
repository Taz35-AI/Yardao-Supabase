// src/lib/services/enhancedVehicleService.ts - COMPLETE WITH DEFLEET SUPPORT
// ⚠️ PRESERVING deleteVehicleCompletely + ADDING defleetVehicle
import { 
  collection, 
  doc, 
  deleteDoc, 
  query, 
  where, 
  getDocs,
  writeBatch,
  getDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Vehicle, DefleetReason } from '@/types'
import { logger } from '@/lib/logger'

export const enhancedVehicleService = {
  /**
   * ✅ NEW: Soft-delete a vehicle (mark as defleeted) - PRESERVES ALL DATA
   * @param vehicleId - The ID of the vehicle in the fleet collection
   * @param options - Defleet options including reason, date, and user details
   */
  async defleetVehicle(
    vehicleId: string,
    options: {
      reason: DefleetReason
      reasonDetails?: string
      defleetDate: string
      userId: string
      userDisplayName: string
      preserveHistory?: boolean
    }
  ): Promise<{
    success: boolean
    defleeted: boolean
    removedFromBranches: number
    preservedInHistory: boolean
    errors: string[]
  }> {
    const result = {
      success: false,
      defleeted: false,
      removedFromBranches: 0,
      preservedInHistory: false,
      errors: [] as string[]
    }

    try {
      logger.log(`🚗 Starting defleet process for vehicle ID: ${vehicleId}`)

      // Step 1: Get the fleet vehicle details
      const fleetVehicleDoc = await getDoc(doc(db, 'vehicles', vehicleId))
      if (!fleetVehicleDoc.exists()) {
        throw new Error('Vehicle not found in fleet inventory')
      }

      const fleetVehicle = { 
        id: fleetVehicleDoc.id, 
        ...fleetVehicleDoc.data() 
      } as Vehicle

      logger.log(`Found fleet vehicle: ${fleetVehicle.registration}`)

      // Step 2: Find all instances in branches (org-scoped — tenant rules
      // reject any checkedInVehicles query not constrained to the org)
      const orgId = fleetVehicleDoc.data()?.organizationId
      const branchVehiclesByIdQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', orgId),
        where('vehicleId', '==', vehicleId)
      )

      const branchVehiclesByRegQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', orgId),
        where('registration', '==', fleetVehicle.registration)
      )

      const [byIdSnapshot, byRegSnapshot] = await Promise.all([
        getDocs(branchVehiclesByIdQuery),
        getDocs(branchVehiclesByRegQuery)
      ])

      // Combine results and remove duplicates
      const branchVehicleIds = new Set<string>()
      const branchVehicles: any[] = []

      byIdSnapshot.forEach(doc => {
        if (!branchVehicleIds.has(doc.id)) {
          branchVehicleIds.add(doc.id)
          branchVehicles.push({ id: doc.id, ...doc.data() })
        }
      })

      byRegSnapshot.forEach(doc => {
        if (!branchVehicleIds.has(doc.id)) {
          branchVehicleIds.add(doc.id)
          branchVehicles.push({ id: doc.id, ...doc.data() })
        }
      })

      logger.log(`Found ${branchVehicles.length} instances in branches`)

      // Step 3: Preserve history if requested (default true)
      if (options.preserveHistory !== false && branchVehicles.length > 0) {
        try {
          const { checkoutHistoryService } = await import('@/lib/checkoutHistoryService')
          
          for (const branchVehicle of branchVehicles) {
            const historyRecord = {
              registration: branchVehicle.registration,
              make: branchVehicle.make || fleetVehicle.make,
              model: branchVehicle.model || fleetVehicle.model,
              colour: branchVehicle.colour || fleetVehicle.colour,
              size: branchVehicle.size || fleetVehicle.size,
              condition: branchVehicle.condition,
              status: branchVehicle.status,
              mileage: branchVehicle.mileage,
              contract: branchVehicle.contract,
              contractColor: branchVehicle.contractColor,
              insuranceStatus: branchVehicle.insuranceStatus,
              motExpiry: branchVehicle.motExpiry || fleetVehicle.motExpiry,
              taxExpiry: branchVehicle.taxExpiry || fleetVehicle.taxExpiry,
              notes: branchVehicle.notes,
              comments: branchVehicle.comments,
              originalBranchId: branchVehicle.branchId || 'unknown',
              originalBranchName: branchVehicle.branchId || 'Unknown Branch',
              checkedOutDate: new Date(),
              checkedOutBy: options.userId,
              checkedOutByName: options.userDisplayName,
              organizationId: branchVehicle.organizationId,
              originalCheckInDate: branchVehicle.checkInTime?.toDate?.() || new Date(),
              originalCheckedInBy: branchVehicle.userId,
              originalCheckedInByName: branchVehicle.lastEditLog?.editedByName || 'Unknown',
              vehicleId: vehicleId,
              deletionReason: `DEFLEETED - ${options.reason}: ${options.reasonDetails || 'No additional details'}`
            }

            await checkoutHistoryService.addCheckoutRecord(historyRecord)
          }
          
          result.preservedInHistory = true
          logger.log(`✅ Preserved ${branchVehicles.length} branch records in history`)
        } catch (error) {
          logger.error('Failed to preserve history:', error)
          result.errors.push(`Failed to preserve history: ${error}`)
        }
      }

      // Step 4: Delete from all branches using a batch operation
      if (branchVehicles.length > 0) {
        const batch = writeBatch(db)
        
        branchVehicles.forEach(branchVehicle => {
          const docRef = doc(db, 'checkedInVehicles', branchVehicle.id)
          batch.delete(docRef)
        })

        await batch.commit()
        result.removedFromBranches = branchVehicles.length
        logger.log(`✅ Deleted from ${branchVehicles.length} branches`)
      }

      // Step 5: SOFT DELETE - Update fleet inventory with defleet flags (NOT DELETE!)
      const defleetUpdateData = {
        isDefleeted: true,
        defleetDate: options.defleetDate,
        defleetProcessedDate: new Date().toISOString(),
        defleetReason: options.reason,
        defleetReasonDetails: options.reasonDetails || '',
        defleetedBy: options.userId,
        defleetedByName: options.userDisplayName,
        currentStatus: 'defleeted' as const,
        updatedAt: new Date().toISOString()
      }

      await updateDoc(doc(db, 'vehicles', vehicleId), defleetUpdateData)
      result.defleeted = true
      logger.log(`✅ Marked as defleeted in fleet inventory`)

      // Step 6: Update any service bookings to mark vehicle as defleeted
      try {
        const serviceBookingsQuery = query(
          collection(db, 'serviceBookings'),
          where('organizationId', '==', orgId),
          where('registration', '==', fleetVehicle.registration)
        )
        const serviceBookingsSnapshot = await getDocs(serviceBookingsQuery)
        
        if (!serviceBookingsSnapshot.empty) {
          const serviceBatch = writeBatch(db)
          serviceBookingsSnapshot.forEach(doc => {
            serviceBatch.update(doc.ref, {
              vehicleDefleeted: true,
              vehicleDefleetedAt: serverTimestamp(),
              vehicleDefleetedBy: options.userId,
              notes: `Vehicle defleeted: ${options.reason} - ${options.reasonDetails || 'No additional details'}`
            })
          })
          await serviceBatch.commit()
          logger.log(`✅ Updated ${serviceBookingsSnapshot.size} service bookings`)
        }
      } catch (error) {
        logger.error('Failed to update service bookings:', error)
        result.errors.push(`Failed to update service bookings: ${error}`)
      }

      result.success = true
      logger.log('✅ Complete vehicle defleet successful')

    } catch (error) {
      logger.error('❌ Vehicle defleet failed:', error)
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
      result.success = false
    }

    return result
  },

  /**
   * ✅ Restore a defleeted vehicle back to the active fleet. Reverses the field
   * changes made by defleetVehicle so the vehicle reappears in the active list.
   * The vehicle is NOT re-checked into any yard — use the normal check-in flow
   * for that (a returned-from-customer vehicle gets checked in afresh).
   */
  async restoreVehicle(
    vehicleId: string,
    options: { userId: string; userDisplayName: string }
  ): Promise<{ success: boolean; errors: string[] }> {
    const result = { success: false, errors: [] as string[] }
    try {
      const fleetVehicleDoc = await getDoc(doc(db, 'vehicles', vehicleId))
      if (!fleetVehicleDoc.exists()) {
        throw new Error('Vehicle not found in fleet inventory')
      }

      // Reverse the defleet flags + clear the metadata, and stamp who restored it.
      await updateDoc(doc(db, 'vehicles', vehicleId), {
        isDefleeted: false,
        currentStatus: 'in_fleet',
        defleetDate: null,
        defleetProcessedDate: null,
        defleetReason: null,
        defleetReasonDetails: null,
        defleetedBy: null,
        defleetedByName: null,
        restoredAt: new Date().toISOString(),
        restoredBy: options.userId,
        restoredByName: options.userDisplayName,
        updatedAt: new Date().toISOString(),
      })

      result.success = true
      logger.log(`✅ Vehicle ${vehicleId} restored to active fleet`)
    } catch (error) {
      logger.error('❌ Vehicle restore failed:', error)
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
    }
    return result
  },

  /**
   * ✅ NEW: Checks if a vehicle can be safely defleeted
   * @param vehicleId - The ID of the vehicle to check
   */
  async canDefleetVehicle(vehicleId: string): Promise<{
    canDefleet: boolean
    reasons: string[]
    branchCount: number
    isOnHire: boolean
    isInService: boolean
  }> {
    const result = {
      canDefleet: true,
      reasons: [] as string[],
      branchCount: 0,
      isOnHire: false,
      isInService: false
    }

    try {
      // Check if vehicle exists
      const vehicleDoc = await getDoc(doc(db, 'vehicles', vehicleId))
      if (!vehicleDoc.exists()) {
        result.canDefleet = false
        result.reasons.push('Vehicle not found in fleet inventory')
        return result
      }

      const vehicle = vehicleDoc.data() as Vehicle
      const orgId = vehicleDoc.data()?.organizationId

      // Check if already defleeted
      if (vehicle.isDefleeted) {
        result.canDefleet = false
        result.reasons.push('Vehicle is already defleeted')
        return result
      }

      // Check branches (org-scoped for tenant rules)
      const branchQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', orgId),
        where('vehicleId', '==', vehicleId)
      )
      const branchSnapshot = await getDocs(branchQuery)
      result.branchCount = branchSnapshot.size

      // Check if any are on hire
      branchSnapshot.forEach(doc => {
        const data = doc.data()
        if (data.status === 'On Hire' || data.hireStatus === 'Out on Hire') {
          result.isOnHire = true
          result.canDefleet = false
          result.reasons.push(`Vehicle is currently out on hire from ${data.branchId || 'a branch'}`)
        }
      })

      // Check service bookings — org + registration only; the status
      // filter is applied in JS so the query stays two-equality and needs
      // no composite index.
      const serviceQuery = query(
        collection(db, 'serviceBookings'),
        where('organizationId', '==', orgId),
        where('registration', '==', vehicle.registration)
      )
      const serviceSnapshot = await getDocs(serviceQuery)
      const activeServiceBookings = serviceSnapshot.docs.filter(d =>
        ['scheduled', 'checked_in_to_garage'].includes(d.data().status)
      )

      if (activeServiceBookings.length > 0) {
        result.isInService = true
        result.canDefleet = false
        result.reasons.push('Vehicle is currently in service')
      }

      // If there are blocking reasons, can't defleet
      if (result.isOnHire || result.isInService) {
        result.canDefleet = false
      }

    } catch (error) {
      logger.error('Error checking if vehicle can be defleeted:', error)
      result.canDefleet = false
      result.reasons.push('Error checking vehicle status')
    }

    return result
  },

  /**
   * ⚠️ PRESERVED: Original hard-delete function - kept for backward compatibility
   * Deletes a vehicle from fleet and removes it from all branches
   * @param vehicleId - The ID of the vehicle in the fleet collection
   * @param options - Additional options for the deletion
   */
  async deleteVehicleCompletely(
    vehicleId: string, 
    options?: {
      preserveHistory?: boolean
      userId?: string
      userDisplayName?: string
      reason?: string
    }
  ): Promise<{
    success: boolean
    deletedFromFleet: boolean
    deletedFromBranches: number
    preservedInHistory: boolean
    errors: string[]
  }> {
    const result = {
      success: false,
      deletedFromFleet: false,
      deletedFromBranches: 0,
      preservedInHistory: false,
      errors: [] as string[]
    }

    try {
      logger.log(`🗑️ Starting complete vehicle deletion for ID: ${vehicleId}`)

      // Step 1: Get the fleet vehicle details first
      const fleetVehicleDoc = await getDoc(doc(db, 'vehicles', vehicleId))
      if (!fleetVehicleDoc.exists()) {
        throw new Error('Vehicle not found in fleet inventory')
      }

      const fleetVehicle = { 
        id: fleetVehicleDoc.id, 
        ...fleetVehicleDoc.data() 
      } as Vehicle

      logger.log(`Found fleet vehicle: ${fleetVehicle.registration}`)

      // Step 2: Find all instances of this vehicle in branches
      // Search by vehicleId reference (org-scoped for tenant rules)
      const orgId = fleetVehicleDoc.data()?.organizationId
      const branchVehiclesByIdQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', orgId),
        where('vehicleId', '==', vehicleId)
      )

      // Also search by registration as a fallback
      const branchVehiclesByRegQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', orgId),
        where('registration', '==', fleetVehicle.registration)
      )

      const [byIdSnapshot, byRegSnapshot] = await Promise.all([
        getDocs(branchVehiclesByIdQuery),
        getDocs(branchVehiclesByRegQuery)
      ])

      // Combine results and remove duplicates
      const branchVehicleIds = new Set<string>()
      const branchVehicles: any[] = []

      byIdSnapshot.forEach(doc => {
        if (!branchVehicleIds.has(doc.id)) {
          branchVehicleIds.add(doc.id)
          branchVehicles.push({ id: doc.id, ...doc.data() })
        }
      })

      byRegSnapshot.forEach(doc => {
        if (!branchVehicleIds.has(doc.id)) {
          branchVehicleIds.add(doc.id)
          branchVehicles.push({ id: doc.id, ...doc.data() })
        }
      })

      logger.log(`Found ${branchVehicles.length} instances in branches`)

      // Step 3: If preserveHistory is true, save to checkout history before deletion
      if (options?.preserveHistory && branchVehicles.length > 0) {
        try {
          const { checkoutHistoryService } = await import('@/lib/checkoutHistoryService')
          
          for (const branchVehicle of branchVehicles) {
            const historyRecord = {
              registration: branchVehicle.registration,
              make: branchVehicle.make || fleetVehicle.make,
              model: branchVehicle.model || fleetVehicle.model,
              colour: branchVehicle.colour || fleetVehicle.colour,
              size: branchVehicle.size || fleetVehicle.size,
              condition: branchVehicle.condition,
              status: branchVehicle.status,
              mileage: branchVehicle.mileage,
              contract: branchVehicle.contract,
              contractColor: branchVehicle.contractColor,
              insuranceStatus: branchVehicle.insuranceStatus,
              motExpiry: branchVehicle.motExpiry || fleetVehicle.motExpiry,
              taxExpiry: branchVehicle.taxExpiry || fleetVehicle.taxExpiry,
              notes: branchVehicle.notes,
              comments: branchVehicle.comments,
              branchId: branchVehicle.branchId || 'unknown',
              checkedOutDate: new Date(),
              checkedOutBy: options.userId || 'system',
              checkedOutByName: options.userDisplayName || 'System Deletion',
              organizationId: branchVehicle.organizationId,
              originalCheckInDate: branchVehicle.checkInTime?.toDate?.() || new Date(),
              originalCheckedInBy: branchVehicle.userId,
              originalCheckedInByName: branchVehicle.lastEditLog?.editedByName || 'Unknown',
              vehicleId: vehicleId,
              deletionReason: options.reason || 'Deleted from fleet inventory'
            }

            await checkoutHistoryService.addCheckoutRecord(historyRecord)
          }
          
          result.preservedInHistory = true
          logger.log(`✅ Preserved ${branchVehicles.length} branch records in history`)
        } catch (error) {
          logger.error('Failed to preserve history:', error)
          result.errors.push(`Failed to preserve history: ${error}`)
        }
      }

      // Step 4: Delete from all branches using a batch operation
      if (branchVehicles.length > 0) {
        const batch = writeBatch(db)
        
        branchVehicles.forEach(branchVehicle => {
          const docRef = doc(db, 'checkedInVehicles', branchVehicle.id)
          batch.delete(docRef)
        })

        await batch.commit()
        result.deletedFromBranches = branchVehicles.length
        logger.log(`✅ Deleted from ${branchVehicles.length} branches`)
      }

      // Step 5: Delete from fleet inventory
      await deleteDoc(doc(db, 'vehicles', vehicleId))
      result.deletedFromFleet = true
      logger.log(`✅ Deleted from fleet inventory`)

      // Step 6: Clean up any service bookings
      try {
        const serviceBookingsQuery = query(
          collection(db, 'serviceBookings'),
          where('organizationId', '==', orgId),
          where('registration', '==', fleetVehicle.registration)
        )
        const serviceBookingsSnapshot = await getDocs(serviceBookingsQuery)
        
        if (!serviceBookingsSnapshot.empty) {
          const serviceBatch = writeBatch(db)
          serviceBookingsSnapshot.forEach(doc => {
            // Update service bookings to mark vehicle as deleted
            serviceBatch.update(doc.ref, {
              vehicleDeleted: true,
              vehicleDeletedAt: serverTimestamp(),
              vehicleDeletedBy: options?.userId || 'system',
              notes: `Vehicle deleted from fleet: ${options?.reason || 'No reason provided'}`
            })
          })
          await serviceBatch.commit()
          logger.log(`✅ Updated ${serviceBookingsSnapshot.size} service bookings`)
        }
      } catch (error) {
        logger.error('Failed to update service bookings:', error)
        result.errors.push(`Failed to update service bookings: ${error}`)
      }

      result.success = true
      logger.log('✅ Complete vehicle deletion successful')

    } catch (error) {
      logger.error('❌ Vehicle deletion failed:', error)
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
      result.success = false
    }

    return result
  },

  /**
   * ⚠️ PRESERVED: Original check function - kept for backward compatibility
   * Checks if a vehicle can be safely deleted
   * @param vehicleId - The ID of the vehicle to check
   */
  async canDeleteVehicle(vehicleId: string): Promise<{
    canDelete: boolean
    reasons: string[]
    branchCount: number
    isOnHire: boolean
    isInService: boolean
  }> {
    const result = {
      canDelete: true,
      reasons: [] as string[],
      branchCount: 0,
      isOnHire: false,
      isInService: false
    }

    try {
      // Check if vehicle exists
      const vehicleDoc = await getDoc(doc(db, 'vehicles', vehicleId))
      if (!vehicleDoc.exists()) {
        result.canDelete = false
        result.reasons.push('Vehicle not found in fleet inventory')
        return result
      }

      const vehicle = vehicleDoc.data() as Vehicle
      const orgId = vehicleDoc.data()?.organizationId

      // Check branches (org-scoped for tenant rules)
      const branchQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', orgId),
        where('vehicleId', '==', vehicleId)
      )
      const branchSnapshot = await getDocs(branchQuery)
      result.branchCount = branchSnapshot.size

      // Check if any are on hire
      branchSnapshot.forEach(doc => {
        const data = doc.data()
        if (data.hireStatus === 'Out on Hire') {
          result.isOnHire = true
          result.canDelete = false
          result.reasons.push(`Vehicle is currently out on hire from ${data.branchId || 'a branch'}`)
        }
      })

      // Check service bookings — org + registration only; status filtered
      // in JS so the query stays two-equality (no composite index).
      const serviceQuery = query(
        collection(db, 'serviceBookings'),
        where('organizationId', '==', orgId),
        where('registration', '==', vehicle.registration)
      )
      const serviceSnapshot = await getDocs(serviceQuery)
      const activeServiceBookings = serviceSnapshot.docs.filter(d =>
        ['scheduled', 'checked_in_to_garage'].includes(d.data().status)
      )

      if (activeServiceBookings.length > 0) {
        result.isInService = true
        result.canDelete = false
        result.reasons.push('Vehicle is currently in service')
      }

    } catch (error) {
      logger.error('Error checking if vehicle can be deleted:', error)
      result.canDelete = false
      result.reasons.push('Error checking vehicle status')
    }

    return result
  }
}