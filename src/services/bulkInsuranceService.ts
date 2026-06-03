// src/services/bulkInsuranceService.ts — SUPABASE re-implementation.
// Duplicate of src/lib/services/bulkInsuranceService.ts (kept at this path for
// existing imports). Public class, method signatures, result shapes and
// throw/return semantics are unchanged from the Firestore version — only the
// data-access internals are swapped to Supabase.

import { supabase } from '@/lib/supabaseClient'
import { toCamelList } from '@/lib/dbMap'
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

const VEHICLES = 'vehicles'

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
      const { data: fleetRows, error: fleetError } = await supabase
        .from(VEHICLES)
        .select('*')
        .eq('organization_id', organizationId)
      if (fleetError) throw fleetError

      const fleetVehicles = toCamelList<FleetVehicle>(fleetRows)

      if (fleetVehicles.length === 0) {
        throw new Error('No vehicles found in fleet inventory')
      }

      // 2. Filter vehicles if specific IDs provided
      const vehiclesToUpdate = fleetVehicles.filter((vehicle) => {
        if (!vehicleIds || vehicleIds.length === 0) {
          return true // Update all vehicles
        }
        return vehicleIds.includes(vehicle.id)
      })

      if (vehiclesToUpdate.length === 0) {
        throw new Error('No matching vehicles found to update')
      }

      result.totalProcessed = vehiclesToUpdate.length

      // 3. Build the per-vehicle update. The lastInsuranceUpdate audit blob is an
      // opaque jsonb column (last_insurance_update) — its camelCase keys are
      // preserved verbatim. previousInsuranceStatus is captured per vehicle.
      const baseInsuranceUpdate = {
        updatedBy: userId,
        updatedByName: userDisplayName,
        updatedAt: new Date().toISOString(),
        source: 'bulk_update',
        bulkOperation: true,
        previousInsuranceStatus: null as InsuranceStatus | null
      }

      // 4. Apply each fleet update. Supabase has no client-side write batch, so
      // we issue the per-row updates in parallel (one per selected vehicle).
      const updatePromises = vehiclesToUpdate.map((vehicle) => {
        const vehicleUpdateData = {
          insurance_status: insuranceStatus,
          last_insurance_update: {
            ...baseInsuranceUpdate,
            previousInsuranceStatus: vehicle.insuranceStatus || null
          }
        }
        result.processedVehicles.push(vehicle.registration)
        return supabase.from(VEHICLES).update(vehicleUpdateData).eq('id', vehicle.id)
      })

      const updateResults = await Promise.all(updatePromises)
      const failed = updateResults.find((r) => r.error)
      if (failed?.error) throw failed.error

      result.fleetUpdated = vehiclesToUpdate.length

      logger.log(`✅ Fleet bulk insurance update completed: ${result.fleetUpdated} vehicles updated`)

      // 6. Sync to yard if enabled
      if (syncToYard) {
        logger.log('🔄 Starting yard sync for bulk insurance update...')

        let totalYardSynced = 0

        // Process each vehicle for yard sync
        for (const vehicleData of vehiclesToUpdate) {

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
      const { data, error } = await supabase
        .from(VEHICLES)
        .select('*')
        .eq('organization_id', organizationId)
      if (error) throw error

      const vehicles = toCamelList<FleetVehicle>(data)
      const breakdown: Record<string, number> = {}
      let total = 0
      let insured = 0
      let uninsured = 0
      let unknown = 0

      vehicles.forEach((vehicle) => {
        const status = vehicle.insuranceStatus || 'Unknown'

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
      const { data, error } = await supabase
        .from(VEHICLES)
        .select('*')
        .eq('organization_id', organizationId)
      if (error) throw error

      return toCamelList<FleetVehicle>(data)
        .filter((vehicle) => !vehicle.insuranceStatus || vehicle.insuranceStatus !== 'Insured')

    } catch (error) {
      logger.error('Error getting vehicles needing insurance:', error)
      return []
    }
  }
}
