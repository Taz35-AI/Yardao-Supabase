// src/services/conditionSyncService.ts - ID-based Condition Sync with Registration Fallback
import { 
  doc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  writeBatch,
  serverTimestamp 
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logger } from '@/lib/logger'

export interface ConditionSyncData {
  condition: string
}

export interface SyncResult {
  success: boolean
  updatedFleetRecord: boolean
  updatedYardRecords: number
  error?: string
  method?: 'id-based' | 'registration-based'
}

/**
 * Condition Sync Service - ID-First Approach with Registration Fallback
 * 
 * This service automatically syncs vehicle condition between Fleet Inventory and Yard.
 * It prioritizes fast ID-based lookups but gracefully falls back to registration-based 
 * queries for backward compatibility.
 */
export class ConditionSyncService {
  
  /**
   * MAIN METHOD: Sync condition from yard to fleet
   * Automatically chooses ID-based or registration-based sync
   */
  static async syncConditionFromYardToFleet(
    vehicleIdentifier: string, // Can be vehicleId OR registration
    conditionData: ConditionSyncData,
    organizationId: string,
    userId: string,
    userDisplayName: string,
    isVehicleId: boolean = false // Hint about identifier type
  ): Promise<SyncResult> {
    
    // If we know it's a vehicle ID, use fast ID-based sync
    if (isVehicleId) {
      return this.syncConditionFromYardToFleetById(
        vehicleIdentifier,
        conditionData,
        organizationId,
        userId,
        userDisplayName
      )
    }
    
    // Otherwise, try registration-based sync
    return this.syncConditionFromYardToFleetByRegistration(
      vehicleIdentifier,
      conditionData,
      organizationId,
      userId,
      userDisplayName
    )
  }

  /**
   * ID-BASED SYNC: Fast condition sync using vehicle document ID
   */
  static async syncConditionFromYardToFleetById(
    vehicleId: string,
    conditionData: ConditionSyncData,
    organizationId: string,
    userId: string,
    userDisplayName: string
  ): Promise<SyncResult> {
    try {
      logger.log(`🔄 Condition sync via ID for vehicle: ${vehicleId}`)
      
      const batch = writeBatch(db)
      let updatedFleetRecord = false
      let updatedYardRecords = 0

      // 1. FAST: Update fleet record directly using document ID
      try {
        const fleetRef = doc(db, 'vehicles', vehicleId)
        
        batch.update(fleetRef, {
          condition: conditionData.condition,
          updatedAt: serverTimestamp(),
          lastConditionUpdate: {
            updatedBy: userId,
            updatedByName: userDisplayName,
            updatedAt: new Date(),
            source: 'yard_sync_id',
            vehicleId: vehicleId
          }
        })
        
        updatedFleetRecord = true
        logger.log(`✅ Fleet record queued for condition update (ID: ${vehicleId})`)
      } catch (error) {
        logger.log(`⚠️ Could not update fleet record for ID: ${vehicleId}`)
      }

      // 2. Update all yard records that reference this vehicle ID
      const yardQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId),
        where('vehicleId', '==', vehicleId)
      )
      
      const yardSnapshot = await getDocs(yardQuery)
      
      yardSnapshot.docs.forEach(yardDoc => {
        const yardRef = doc(db, 'checkedInVehicles', yardDoc.id)
        
        batch.update(yardRef, {
          condition: conditionData.condition,
          updatedAt: serverTimestamp(),
          lastEditLog: {
            action: `Condition updated to "${conditionData.condition}" (ID sync)`,
            editedBy: userId,
            editedByName: userDisplayName,
            editedAt: new Date(),
            changes: {
              condition: conditionData.condition,
              syncSource: 'id_based_sync',
              vehicleId: vehicleId
            }
          }
        })
        
        updatedYardRecords++
      })

      // Commit all updates
      await batch.commit()
      
      logger.log(`✅ ID-based condition sync completed: Fleet=${updatedFleetRecord}, Yard=${updatedYardRecords}`)

      return {
        success: true,
        updatedFleetRecord,
        updatedYardRecords,
        method: 'id-based'
      }

    } catch (error) {
      logger.error('❌ ID-based condition sync failed:', error)
      return {
        success: false,
        updatedFleetRecord: false,
        updatedYardRecords: 0,
        error: error instanceof Error ? error.message : 'ID sync failed',
        method: 'id-based'
      }
    }
  }

  /**
   * REGISTRATION-BASED SYNC: Fallback for vehicles without vehicleId
   */
  static async syncConditionFromYardToFleetByRegistration(
    registration: string,
    conditionData: ConditionSyncData,
    organizationId: string,
    userId: string,
    userDisplayName: string
  ): Promise<SyncResult> {
    try {
      logger.log(`🔄 Condition sync via registration: ${registration}`)
      
      const batch = writeBatch(db)
      let updatedFleetRecord = false
      let updatedYardRecords = 0

      // 1. Find and update fleet record by registration
      const fleetQuery = query(
        collection(db, 'vehicles'),
        where('organizationId', '==', organizationId),
        where('registration', '==', registration.toUpperCase())
      )
      
      const fleetSnapshot = await getDocs(fleetQuery)
      
      if (!fleetSnapshot.empty) {
        const fleetDoc = fleetSnapshot.docs[0]
        const fleetRef = doc(db, 'vehicles', fleetDoc.id)
        
        batch.update(fleetRef, {
          condition: conditionData.condition,
          updatedAt: serverTimestamp(),
          lastConditionUpdate: {
            updatedBy: userId,
            updatedByName: userDisplayName,
            updatedAt: new Date(),
            source: 'yard_sync_registration',
            registration: registration
          }
        })
        
        updatedFleetRecord = true
        logger.log(`✅ Fleet record found and queued for condition update`)
      } else {
        logger.log(`⚠️ No fleet record found for registration: ${registration}`)
      }

      // 2. Update all yard records with matching registration
      const yardQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId),
        where('registration', '==', registration.toUpperCase())
      )
      
      const yardSnapshot = await getDocs(yardQuery)
      
      yardSnapshot.docs.forEach(yardDoc => {
        const yardRef = doc(db, 'checkedInVehicles', yardDoc.id)
        
        batch.update(yardRef, {
          condition: conditionData.condition,
          updatedAt: serverTimestamp(),
          lastEditLog: {
            action: `Condition updated to "${conditionData.condition}" (registration sync)`,
            editedBy: userId,
            editedByName: userDisplayName,
            editedAt: new Date(),
            changes: {
              condition: conditionData.condition,
              syncSource: 'registration_based_sync',
              registration: registration
            }
          }
        })
        
        updatedYardRecords++
      })

      // Commit all updates
      await batch.commit()
      
      logger.log(`✅ Registration-based condition sync completed: Fleet=${updatedFleetRecord}, Yard=${updatedYardRecords}`)

      return {
        success: true,
        updatedFleetRecord,
        updatedYardRecords,
        method: 'registration-based'
      }

    } catch (error) {
      logger.error('❌ Registration-based condition sync failed:', error)
      return {
        success: false,
        updatedFleetRecord: false,
        updatedYardRecords: 0,
        error: error instanceof Error ? error.message : 'Registration sync failed',
        method: 'registration-based'
      }
    }
  }

  /**
   * FLEET-TO-YARD SYNC: Update yard when fleet condition changes
   */
  static async syncConditionFromFleetToYard(
    vehicleIdentifier: string, // Can be vehicleId OR registration
    conditionData: ConditionSyncData,
    organizationId: string,
    userId: string,
    userDisplayName: string,
    isVehicleId: boolean = false
  ): Promise<SyncResult> {
    
    if (isVehicleId) {
      return this.syncConditionFromFleetToYardById(
        vehicleIdentifier,
        conditionData,
        organizationId,
        userId,
        userDisplayName
      )
    }
    
    return this.syncConditionFromFleetToYardByRegistration(
      vehicleIdentifier,
      conditionData,
      organizationId,
      userId,
      userDisplayName
    )
  }

  /**
   * ID-BASED FLEET-TO-YARD: Fast sync using vehicle ID
   */
  static async syncConditionFromFleetToYardById(
    vehicleId: string,
    conditionData: ConditionSyncData,
    organizationId: string,
    userId: string,
    userDisplayName: string
  ): Promise<SyncResult> {
    try {
      logger.log(`🔄 Fleet-to-yard condition sync via ID: ${vehicleId}`)
      
      const batch = writeBatch(db)
      let updatedYardRecords = 0

      // Find all yard records referencing this vehicle ID
      const yardQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId),
        where('vehicleId', '==', vehicleId)
      )
      
      const yardSnapshot = await getDocs(yardQuery)
      
      yardSnapshot.docs.forEach(yardDoc => {
        const yardRef = doc(db, 'checkedInVehicles', yardDoc.id)
        
        batch.update(yardRef, {
          condition: conditionData.condition,
          updatedAt: serverTimestamp(),
          lastEditLog: {
            action: `Condition updated to "${conditionData.condition}" (fleet sync)`,
            editedBy: userId,
            editedByName: userDisplayName,
            editedAt: new Date(),
            changes: {
              condition: conditionData.condition,
              syncSource: 'fleet_to_yard_id',
              vehicleId: vehicleId
            }
          }
        })
        
        updatedYardRecords++
      })

      if (updatedYardRecords > 0) {
        await batch.commit()
      }
      
      logger.log(`✅ Fleet-to-yard ID sync completed: ${updatedYardRecords} yard records updated`)

      return {
        success: true,
        updatedFleetRecord: false, // Fleet was the source
        updatedYardRecords,
        method: 'id-based'
      }

    } catch (error) {
      logger.error('❌ Fleet-to-yard ID sync failed:', error)
      return {
        success: false,
        updatedFleetRecord: false,
        updatedYardRecords: 0,
        error: error instanceof Error ? error.message : 'Fleet-to-yard ID sync failed',
        method: 'id-based'
      }
    }
  }

  /**
   * REGISTRATION-BASED FLEET-TO-YARD: Fallback sync
   */
  static async syncConditionFromFleetToYardByRegistration(
    registration: string,
    conditionData: ConditionSyncData,
    organizationId: string,
    userId: string,
    userDisplayName: string
  ): Promise<SyncResult> {
    try {
      logger.log(`🔄 Fleet-to-yard condition sync via registration: ${registration}`)
      
      const batch = writeBatch(db)
      let updatedYardRecords = 0

      // Find all yard records with matching registration
      const yardQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId),
        where('registration', '==', registration.toUpperCase())
      )
      
      const yardSnapshot = await getDocs(yardQuery)
      
      yardSnapshot.docs.forEach(yardDoc => {
        const yardRef = doc(db, 'checkedInVehicles', yardDoc.id)
        
        batch.update(yardRef, {
          condition: conditionData.condition,
          updatedAt: serverTimestamp(),
          lastEditLog: {
            action: `Condition updated to "${conditionData.condition}" (fleet sync)`,
            editedBy: userId,
            editedByName: userDisplayName,
            editedAt: new Date(),
            changes: {
              condition: conditionData.condition,
              syncSource: 'fleet_to_yard_registration',
              registration: registration
            }
          }
        })
        
        updatedYardRecords++
      })

      if (updatedYardRecords > 0) {
        await batch.commit()
      }
      
      logger.log(`✅ Fleet-to-yard registration sync completed: ${updatedYardRecords} yard records updated`)

      return {
        success: true,
        updatedFleetRecord: false, // Fleet was the source
        updatedYardRecords,
        method: 'registration-based'
      }

    } catch (error) {
      logger.error('❌ Fleet-to-yard registration sync failed:', error)
      return {
        success: false,
        updatedFleetRecord: false,
        updatedYardRecords: 0,
        error: error instanceof Error ? error.message : 'Fleet-to-yard registration sync failed',
        method: 'registration-based'
      }
    }
  }
}