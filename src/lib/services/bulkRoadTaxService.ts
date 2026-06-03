// src/lib/services/bulkRoadTaxService.ts
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
import { FleetVehicle } from '@/types'
import { logger } from '@/lib/logger'

export interface BulkRoadTaxResult {
  success: boolean
  totalProcessed: number
  fleetUpdated: number
  errors: string[]
  processedVehicles: string[]
}

export interface BulkRoadTaxOptions {
  organizationId: string
  userId: string
  userDisplayName: string
  taxExpiry: string // ISO date string (YYYY-MM-DD)
  vehicleIds: string[] // Specific vehicles to update
}

/**
 * Bulk Road Tax Service
 * Handles bulk road tax expiry date operations for fleet vehicles
 */
export class BulkRoadTaxService {
  
  /**
   * Update road tax expiry date for multiple vehicles in bulk
   */
  static async bulkUpdateRoadTax(options: BulkRoadTaxOptions): Promise<BulkRoadTaxResult> {
    const {
      organizationId,
      userId,
      userDisplayName,
      taxExpiry,
      vehicleIds
    } = options

    logger.log('🚗 Starting bulk road tax update:', {
      organizationId,
      taxExpiry,
      vehicleCount: vehicleIds.length
    })

    const result: BulkRoadTaxResult = {
      success: false,
      totalProcessed: 0,
      fleetUpdated: 0,
      errors: [],
      processedVehicles: []
    }

    try {
      // Validate inputs
      if (!vehicleIds || vehicleIds.length === 0) {
        throw new Error('No vehicles selected for update')
      }

      if (!taxExpiry) {
        throw new Error('No tax expiry date provided')
      }

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(taxExpiry)) {
        throw new Error('Invalid date format. Expected YYYY-MM-DD')
      }

      // 1. Query fleet vehicles
      const fleetQuery = query(
        collection(db, 'vehicles'),
        where('organizationId', '==', organizationId)
      )

      const fleetSnapshot = await getDocs(fleetQuery)
      
      if (fleetSnapshot.empty) {
        throw new Error('No vehicles found in fleet inventory')
      }

      // 2. Filter to only selected vehicles
      const vehiclesToUpdate = fleetSnapshot.docs.filter(doc => 
        vehicleIds.includes(doc.id)
      )

      if (vehiclesToUpdate.length === 0) {
        throw new Error('No matching vehicles found to update')
      }

      result.totalProcessed = vehiclesToUpdate.length

      // 3. Prepare batch update for fleet
      const batch = writeBatch(db)
      const timestamp = serverTimestamp()
      
      const updateData = {
        taxExpiry,
        updatedAt: timestamp,
        lastTaxUpdate: {
          updatedBy: userId,
          updatedByName: userDisplayName,
          updatedAt: new Date().toISOString(),
          source: 'bulk_update',
          bulkOperation: true
        }
      }

      // 4. Add each vehicle update to batch
      vehiclesToUpdate.forEach(vehicleDoc => {
        const vehicleRef = doc(db, 'vehicles', vehicleDoc.id)
        batch.update(vehicleRef, updateData)
        result.processedVehicles.push(vehicleDoc.id)
      })

      // 5. Commit batch update
      await batch.commit()
      result.fleetUpdated = vehiclesToUpdate.length

      logger.log(`✅ Successfully updated ${result.fleetUpdated} vehicles with road tax expiry: ${taxExpiry}`)

      result.success = true
      return result

    } catch (error) {
      logger.error('❌ Bulk road tax update failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      result.errors.push(errorMessage)
      throw error
    }
  }

  /**
   * Validate if a vehicle can have its road tax updated
   */
  static validateVehicle(vehicle: FleetVehicle): { valid: boolean; reason?: string } {
    if (!vehicle.registration) {
      return { valid: false, reason: 'Missing registration' }
    }
    
    return { valid: true }
  }
}