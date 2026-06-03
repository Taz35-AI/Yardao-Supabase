// src/services/contractSyncService.ts - Complete Rewrite: ID-based Contract Sync with Registration Fallback
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

export interface ContractSyncData {
  contract: string | null
  contractColor: string | null
}

export interface SyncResult {
  success: boolean
  updatedFleetRecord: boolean
  updatedYardRecords: number
  error?: string
  method?: 'id-based' | 'registration-based'
}

/**
 * Contract Sync Service - ID-First Approach with Registration Fallback
 * 
 * This service automatically syncs contract assignments between Fleet Inventory and Yard.
 * It prioritizes fast ID-based lookups but gracefully falls back to registration-based 
 * queries for backward compatibility.
 */
export class ContractSyncService {
  
  /**
   * MAIN METHOD: Sync contract from yard to fleet
   * Automatically chooses ID-based or registration-based sync
   */
  static async syncContractFromYardToFleet(
    vehicleIdentifier: string, // Can be vehicleId OR registration
    contractData: ContractSyncData,
    organizationId: string,
    userId: string,
    userDisplayName: string,
    isVehicleId: boolean = false // Hint about identifier type
  ): Promise<SyncResult> {
    
    // If we know it's a vehicle ID, use fast ID-based sync
    if (isVehicleId) {
      return this.syncContractFromYardToFleetById(
        vehicleIdentifier,
        contractData,
        organizationId,
        userId,
        userDisplayName
      )
    }
    
    // Otherwise, try registration-based sync
    return this.syncContractFromYardToFleetByRegistration(
      vehicleIdentifier,
      contractData,
      organizationId,
      userId,
      userDisplayName
    )
  }

  /**
   * ID-BASED SYNC: Fast contract sync using vehicle document ID
   */
  static async syncContractFromYardToFleetById(
    vehicleId: string,
    contractData: ContractSyncData,
    organizationId: string,
    userId: string,
    userDisplayName: string
  ): Promise<SyncResult> {
    try {
      logger.log(`Contract sync via ID for vehicle: ${vehicleId}`)
      
      const batch = writeBatch(db)
      let updatedFleetRecord = false
      let updatedYardRecords = 0

      // 1. FAST: Update fleet record directly using document ID
      try {
        const fleetRef = doc(db, 'vehicles', vehicleId)
        
        batch.update(fleetRef, {
          contract: contractData.contract,
          contractColor: contractData.contractColor,
          updatedAt: serverTimestamp(),
          lastContractUpdate: {
            updatedBy: userId,
            updatedByName: userDisplayName,
            updatedAt: new Date(),
            source: 'yard_sync_id',
            vehicleId: vehicleId
          }
        })
        
        updatedFleetRecord = true
        logger.log(`Fleet record queued for update (ID: ${vehicleId})`)
      } catch (error) {
        logger.log(`Could not update fleet record for ID: ${vehicleId}`)
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
          contract: contractData.contract,
          contractColor: contractData.contractColor,
          updatedAt: serverTimestamp(),
          lastEditLog: {
            action: `Contract ${contractData.contract ? 'set to' : 'removed'} ${contractData.contract || ''} (ID sync)`,
            editedBy: userId,
            editedByName: userDisplayName,
            editedAt: new Date(),
            changes: {
              contract: contractData.contract,
              contractColor: contractData.contractColor,
              syncSource: 'id_based_sync',
              vehicleId: vehicleId
            }
          }
        })
        
        updatedYardRecords++
      })

      // Commit all updates
      await batch.commit()
      
      logger.log(`ID-based contract sync completed: Fleet=${updatedFleetRecord}, Yard=${updatedYardRecords}`)

      return {
        success: true,
        updatedFleetRecord,
        updatedYardRecords,
        method: 'id-based'
      }

    } catch (error) {
      logger.error('ID-based contract sync failed:', error)
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
   * REGISTRATION-BASED SYNC: Fallback contract sync using registration number
   */
  static async syncContractFromYardToFleetByRegistration(
    registration: string,
    contractData: ContractSyncData,
    organizationId: string,
    userId: string,
    userDisplayName: string
  ): Promise<SyncResult> {
    try {
      logger.log(`Contract sync via registration for: ${registration}`)
      
      const batch = writeBatch(db)
      let updatedFleetRecord = false
      let updatedYardRecords = 0
      const cleanReg = registration.toUpperCase().trim()

      // 1. Find fleet record by registration
      const fleetQuery = query(
        collection(db, 'vehicles'),
        where('organizationId', '==', organizationId),
        where('registration', '==', cleanReg)
      )
      
      const fleetSnapshot = await getDocs(fleetQuery)
      
      if (!fleetSnapshot.empty) {
        const fleetDoc = fleetSnapshot.docs[0]
        const fleetRef = doc(db, 'vehicles', fleetDoc.id)
        
        batch.update(fleetRef, {
          contract: contractData.contract,
          contractColor: contractData.contractColor,
          updatedAt: serverTimestamp(),
          lastContractUpdate: {
            updatedBy: userId,
            updatedByName: userDisplayName,
            updatedAt: new Date(),
            source: 'yard_sync_registration',
            registration: cleanReg,
            previousContract: fleetDoc.data().contract || null
          }
        })
        
        updatedFleetRecord = true
        logger.log(`Fleet record found and queued: ${cleanReg}`)
      } else {
        logger.log(`Fleet record not found: ${cleanReg}`)
      }

      // 2. Find all yard records by registration
      const yardQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId),
        where('registration', '==', cleanReg)
      )
      
      const yardSnapshot = await getDocs(yardQuery)
      
      yardSnapshot.docs.forEach(yardDoc => {
        const yardRef = doc(db, 'checkedInVehicles', yardDoc.id)
        
        batch.update(yardRef, {
          contract: contractData.contract,
          contractColor: contractData.contractColor,
          updatedAt: serverTimestamp(),
          lastEditLog: {
            action: `Contract ${contractData.contract ? 'set to' : 'removed'} ${contractData.contract || ''} (registration sync)`,
            editedBy: userId,
            editedByName: userDisplayName,
            editedAt: new Date(),
            changes: {
              contract: contractData.contract,
              contractColor: contractData.contractColor,
              syncSource: 'registration_based_sync',
              registration: cleanReg
            }
          }
        })
        
        updatedYardRecords++
      })

      // Commit all updates
      if (updatedFleetRecord || updatedYardRecords > 0) {
        await batch.commit()
      }
      
      logger.log(`Registration-based contract sync completed: Fleet=${updatedFleetRecord}, Yard=${updatedYardRecords}`)

      return {
        success: true,
        updatedFleetRecord,
        updatedYardRecords,
        method: 'registration-based'
      }

    } catch (error) {
      logger.error('Registration-based contract sync failed:', error)
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
   * FLEET-TO-YARD SYNC: Update yard when fleet contract changes
   */
  static async syncContractFromFleetToYard(
    vehicleIdentifier: string, // Can be vehicleId OR registration
    contractData: ContractSyncData,
    organizationId: string,
    userId: string,
    userDisplayName: string,
    isVehicleId: boolean = false
  ): Promise<SyncResult> {
    
    if (isVehicleId) {
      return this.syncContractFromFleetToYardById(
        vehicleIdentifier,
        contractData,
        organizationId,
        userId,
        userDisplayName
      )
    }
    
    return this.syncContractFromFleetToYardByRegistration(
      vehicleIdentifier,
      contractData,
      organizationId,
      userId,
      userDisplayName
    )
  }

  /**
   * ID-BASED FLEET-TO-YARD: Fast sync using vehicle ID
   */
  static async syncContractFromFleetToYardById(
    vehicleId: string,
    contractData: ContractSyncData,
    organizationId: string,
    userId: string,
    userDisplayName: string
  ): Promise<SyncResult> {
    try {
      logger.log(`Fleet-to-yard contract sync via ID: ${vehicleId}`)
      
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
          contract: contractData.contract,
          contractColor: contractData.contractColor,
          updatedAt: serverTimestamp(),
          lastEditLog: {
            action: `Contract ${contractData.contract ? 'updated to' : 'removed'} ${contractData.contract || ''} (fleet sync)`,
            editedBy: userId,
            editedByName: userDisplayName,
            editedAt: new Date(),
            changes: {
              contract: contractData.contract,
              contractColor: contractData.contractColor,
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
      
      logger.log(`Fleet-to-yard ID sync completed: ${updatedYardRecords} yard records updated`)

      return {
        success: true,
        updatedFleetRecord: false, // Fleet was the source
        updatedYardRecords,
        method: 'id-based'
      }

    } catch (error) {
      logger.error('Fleet-to-yard ID sync failed:', error)
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
   * REGISTRATION-BASED FLEET-TO-YARD: Fallback sync using registration
   */
  static async syncContractFromFleetToYardByRegistration(
    registration: string,
    contractData: ContractSyncData,
    organizationId: string,
    userId: string,
    userDisplayName: string
  ): Promise<SyncResult> {
    try {
      logger.log(`Fleet-to-yard contract sync via registration: ${registration}`)
      
      const batch = writeBatch(db)
      let updatedYardRecords = 0
      const cleanReg = registration.toUpperCase().trim()

      // Find all yard records by registration
      const yardQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId),
        where('registration', '==', cleanReg)
      )
      
      const yardSnapshot = await getDocs(yardQuery)
      
      yardSnapshot.docs.forEach(yardDoc => {
        const yardRef = doc(db, 'checkedInVehicles', yardDoc.id)
        
        batch.update(yardRef, {
          contract: contractData.contract,
          contractColor: contractData.contractColor,
          updatedAt: serverTimestamp(),
          lastEditLog: {
            action: `Contract ${contractData.contract ? 'updated to' : 'removed'} ${contractData.contract || ''} (fleet sync)`,
            editedBy: userId,
            editedByName: userDisplayName,
            editedAt: new Date(),
            changes: {
              contract: contractData.contract,
              contractColor: contractData.contractColor,
              syncSource: 'fleet_to_yard_registration',
              registration: cleanReg
            }
          }
        })
        
        updatedYardRecords++
      })

      if (updatedYardRecords > 0) {
        await batch.commit()
      }
      
      logger.log(`Fleet-to-yard registration sync completed: ${updatedYardRecords} yard records updated`)

      return {
        success: true,
        updatedFleetRecord: false,
        updatedYardRecords,
        method: 'registration-based'
      }

    } catch (error) {
      logger.error('Fleet-to-yard registration sync failed:', error)
      return {
        success: false,
        updatedFleetRecord: false,
        updatedYardRecords: 0,
        error: error instanceof Error ? error.message : 'Fleet-to-yard registration sync failed',
        method: 'registration-based'
      }
    }
  }

  /**
   * BULK SYNC: Handle multiple vehicles efficiently
   */
  static async bulkSyncContracts(
    vehicles: Array<{
      vehicleId?: string | null
      registration: string
      contractData: ContractSyncData
    }>,
    organizationId: string,
    userId: string,
    userDisplayName: string,
    direction: 'yard-to-fleet' | 'fleet-to-yard' = 'yard-to-fleet'
  ): Promise<{
    success: boolean
    results: Array<{ identifier: string; result: SyncResult }>
    totalFleetUpdated: number
    totalYardUpdated: number
    performanceStats: {
      idBased: number
      registrationBased: number
    }
  }> {
    const results: Array<{ identifier: string; result: SyncResult }> = []
    let totalFleetUpdated = 0
    let totalYardUpdated = 0
    let idBased = 0
    let registrationBased = 0

    for (const vehicle of vehicles) {
      let syncResult: SyncResult
      const hasVehicleId = vehicle.vehicleId && vehicle.vehicleId.trim() !== ''

      if (hasVehicleId) {
        // Use ID-based sync
        syncResult = direction === 'yard-to-fleet' 
          ? await this.syncContractFromYardToFleetById(
              vehicle.vehicleId!,
              vehicle.contractData,
              organizationId,
              userId,
              userDisplayName
            )
          : await this.syncContractFromFleetToYardById(
              vehicle.vehicleId!,
              vehicle.contractData,
              organizationId,
              userId,
              userDisplayName
            )
        idBased++
      } else {
        // Use registration-based sync
        syncResult = direction === 'yard-to-fleet'
          ? await this.syncContractFromYardToFleetByRegistration(
              vehicle.registration,
              vehicle.contractData,
              organizationId,
              userId,
              userDisplayName
            )
          : await this.syncContractFromFleetToYardByRegistration(
              vehicle.registration,
              vehicle.contractData,
              organizationId,
              userId,
              userDisplayName
            )
        registrationBased++
      }

      results.push({
        identifier: hasVehicleId ? vehicle.vehicleId! : vehicle.registration,
        result: syncResult
      })

      if (syncResult.success) {
        if (syncResult.updatedFleetRecord) totalFleetUpdated++
        totalYardUpdated += syncResult.updatedYardRecords
      }
    }

    logger.log(`Bulk sync completed: ${idBased} ID-based, ${registrationBased} registration-based`)

    return {
      success: results.every(r => r.result.success),
      results,
      totalFleetUpdated,
      totalYardUpdated,
      performanceStats: {
        idBased,
        registrationBased
      }
    }
  }

  /**
   * UTILITY: Get performance statistics
   */
  static async getPerformanceStats(organizationId: string): Promise<{
    totalVehicles: number
    vehiclesWithIds: number
    vehiclesWithoutIds: number
    migrationPercentage: number
  }> {
    try {
      const yardQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId)
      )
      
      const snapshot = await getDocs(yardQuery)
      
      let withIds = 0
      let withoutIds = 0
      
      snapshot.docs.forEach(doc => {
        const data = doc.data()
        if (data.vehicleId && data.vehicleId.trim() !== '') {
          withIds++
        } else {
          withoutIds++
        }
      })
      
      const total = withIds + withoutIds
      const migrationPercentage = total > 0 ? Math.round((withIds / total) * 100) : 0
      
      return {
        totalVehicles: total,
        vehiclesWithIds: withIds,
        vehiclesWithoutIds: withoutIds,
        migrationPercentage
      }
    } catch (error) {
      logger.error('Error getting performance stats:', error)
      return {
        totalVehicles: 0,
        vehiclesWithIds: 0,
        vehiclesWithoutIds: 0,
        migrationPercentage: 0
      }
    }
  }
}