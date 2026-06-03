// src/services/bulkInsuranceService.ts
import { 
  collection, 
  query, 
  where, 
  getDocs,
  writeBatch,
  serverTimestamp,
  doc
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { InsuranceStatus, FleetVehicle } from '@/types'
import { InsuranceSyncService } from '@/services/insuranceSyncService'
import { logger } from '@/lib/logger'

export interface BulkInsuranceResult {
  success: boolean
  totalProcessed: number
  fleetUpdated: number
  yardSynced: number
  errors: string[]
  processedVehicles: string[]
}

export interface BulkInsuranceOptions {
  organizationId: string
  userId: string
  userDisplayName: string
  insuranceStatus: InsuranceStatus
  vehicleIds?: string[] // Optional: specific vehicles, if not provided will update all
  syncToYard?: boolean // Default true
}

/**
 * Bulk Insurance Service
 * Handles bulk insurance operations for fleet vehicles
 */
export class BulkInsuranceService {
  
  /**
   * Mark multiple vehicles as insured in bulk
   */
  static async bulkUpdateInsurance(options: BulkInsuranceOptions): Promise<BulkInsuranceResult> {
    const {
      organizationId,
      userId,
      userDisplayName,
      insuranceStatus,
      vehicleIds,
      syncToYard = true
    } = options

    logger.log('🏢 Starting bulk insurance update:', {
      organizationId,
      insuranceStatus,
      vehicleCount: vehicleIds?.length || 'all',
      syncToYard
    })

    const result: BulkInsuranceResult = {
      success: false,
      totalProcessed: 0,
      fleetUpdated: 0,
      yardSynced: 0,
      errors: [],
      processedVehicles: []
    }

    try {
      // 1. Query fleet vehicles
      let fleetQuery = query(
        collection(db, 'vehicles'),
        where('organizationId', '==', organizationId)
      )

      const fleetSnapshot = await getDocs(fleetQuery)
      
      if (fleetSnapshot.empty) {
        throw new Error('No vehicles found in fleet inventory')
      }

      // 2. Filter vehicles if specific IDs provided
      const vehiclesToUpdate = fleetSnapshot.docs.filter(doc => {
        if (!vehicleIds || vehicleIds.length === 0) {
          return true // Update all vehicles
        }
        return vehicleIds.includes(doc.id)
      })

      if (vehiclesToUpdate.length === 0) {
        throw new Error('No matching vehicles found to update')
      }

      result.totalProcessed = vehiclesToUpdate.length

      // 3. Prepare batch update for fleet
      const batch = writeBatch(db)
      const timestamp = serverTimestamp()
      
      const updateData = {
        insuranceStatus,
        updatedAt: timestamp,
        lastInsuranceUpdate: {
          updatedBy: userId,
          updatedByName: userDisplayName,
          updatedAt: new Date(),
          source: 'bulk_update',
          bulkOperation: true,
          previousInsuranceStatus: null // Will be set individually if needed
        }
      }

      // 4. Queue all fleet updates
      vehiclesToUpdate.forEach(vehicleDoc => {
        const vehicleRef = doc(db, 'vehicles', vehicleDoc.id)
        const vehicleData = vehicleDoc.data() as FleetVehicle
        
        const vehicleUpdateData = {
          ...updateData,
          lastInsuranceUpdate: {
            ...updateData.lastInsuranceUpdate,
            previousInsuranceStatus: vehicleData.insuranceStatus || null
          }
        }
        
        batch.update(vehicleRef, vehicleUpdateData)
        result.processedVehicles.push(vehicleData.registration)
      })

      // 5. Execute fleet batch update
      await batch.commit()
      result.fleetUpdated = vehiclesToUpdate.length

      logger.log(`✅ Fleet bulk insurance update completed: ${result.fleetUpdated} vehicles updated`)

      // 6. Sync to yard if enabled
      if (syncToYard) {
        logger.log('🔄 Starting yard sync for bulk insurance update...')
        
        let totalYardSynced = 0
        
        // Process each vehicle for yard sync
        for (const vehicleDoc of vehiclesToUpdate) {
          const vehicleData = vehicleDoc.data() as FleetVehicle
          
          try {
            const syncResult = await InsuranceSyncService.syncInsuranceFromFleetToYard(
              vehicleData.registration,
              { insuranceStatus },
              organizationId,
              userId,
              userDisplayName
            )
            
            if (syncResult.success) {
              totalYardSynced += syncResult.updatedYardRecords
            } else {
              result.errors.push(`Yard sync failed for ${vehicleData.registration}: ${syncResult.error}`)
            }
          } catch (syncError) {
            const errorMsg = `Yard sync error for ${vehicleData.registration}: ${syncError instanceof Error ? syncError.message : 'Unknown error'}`
            result.errors.push(errorMsg)
            logger.error('❌', errorMsg)
          }
        }
        
        result.yardSynced = totalYardSynced
        logger.log(`✅ Yard sync completed: ${totalYardSynced} yard records updated`)
      }

      result.success = true
      
      logger.log('🎉 Bulk insurance update completed successfully:', {
        totalProcessed: result.totalProcessed,
        fleetUpdated: result.fleetUpdated,
        yardSynced: result.yardSynced,
        errors: result.errors.length
      })

      return result

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      result.errors.push(errorMessage)
      logger.error('❌ Bulk insurance update failed:', errorMessage)
      
      return result
    }
  }

  /**
   * Get insurance status summary for fleet
   */
  static async getInsuranceSummary(organizationId: string): Promise<{
    total: number
    insured: number
    uninsured: number
    unknown: number
    breakdown: Record<string, number>
  }> {
    try {
      const fleetQuery = query(
        collection(db, 'vehicles'),
        where('organizationId', '==', organizationId)
      )
      
      const snapshot = await getDocs(fleetQuery)
      const breakdown: Record<string, number> = {}
      let total = 0
      let insured = 0
      let uninsured = 0
      let unknown = 0
      
      snapshot.docs.forEach(doc => {
        const data = doc.data() as FleetVehicle
        const status = data.insuranceStatus || 'Unknown'
        
        breakdown[status] = (breakdown[status] || 0) + 1
        total++
        
        switch (status) {
          case 'Insured':
            insured++
            break
          case 'Not Insured':
            uninsured++
            break
          default:
            unknown++
        }
      })
      
      return {
        total,
        insured,
        uninsured,
        unknown,
        breakdown
      }
      
    } catch (error) {
      logger.error('Error getting insurance summary:', error)
      return {
        total: 0,
        insured: 0,
        uninsured: 0,
        unknown: 0,
        breakdown: {}
      }
    }
  }

  /**
   * Get vehicles that need insurance updates
   */
  static async getVehiclesNeedingInsurance(organizationId: string): Promise<FleetVehicle[]> {
    try {
      const fleetQuery = query(
        collection(db, 'vehicles'),
        where('organizationId', '==', organizationId)
      )
      
      const snapshot = await getDocs(fleetQuery)
      
      return snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as FleetVehicle))
        .filter(vehicle => !vehicle.insuranceStatus || vehicle.insuranceStatus !== 'Insured')
      
    } catch (error) {
      logger.error('Error getting vehicles needing insurance:', error)
      return []
    }
  }
}