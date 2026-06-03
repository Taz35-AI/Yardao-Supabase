// src/lib/services/bulkRoadTaxService.ts — SUPABASE re-implementation.
// Bulk road-tax expiry updates for fleet vehicles. Public class, method
// signatures, result shapes, validation order and throw/return semantics are
// unchanged from the Firestore version — only the data-access internals change.

import { supabase } from '@/lib/supabaseClient'
import { toCamelList } from '@/lib/dbMap'
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

const VEHICLES = 'vehicles'

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
      const { data: fleetRows, error: fleetError } = await supabase
        .from(VEHICLES)
        .select('*')
        .eq('organization_id', organizationId)
      if (fleetError) throw fleetError

      const fleetVehicles = toCamelList<FleetVehicle>(fleetRows)

      if (fleetVehicles.length === 0) {
        throw new Error('No vehicles found in fleet inventory')
      }

      // 2. Filter to only selected vehicles
      const vehiclesToUpdate = fleetVehicles.filter((vehicle) =>
        vehicleIds.includes(vehicle.id)
      )

      if (vehiclesToUpdate.length === 0) {
        throw new Error('No matching vehicles found to update')
      }

      result.totalProcessed = vehiclesToUpdate.length

      // 3. Build the shared update. lastTaxUpdate is an opaque audit blob stored
      // in the last_tax_update jsonb column (camelCase keys preserved verbatim).
      const updateData = {
        tax_expiry: taxExpiry,
        last_tax_update: {
          updatedBy: userId,
          updatedByName: userDisplayName,
          updatedAt: new Date().toISOString(),
          source: 'bulk_update',
          bulkOperation: true
        }
      }

      // 4. Apply each vehicle update. Supabase has no client-side write batch,
      // so the per-row updates are issued in parallel.
      const updatePromises = vehiclesToUpdate.map((vehicle) => {
        result.processedVehicles.push(vehicle.id)
        return supabase.from(VEHICLES).update(updateData).eq('id', vehicle.id)
      })

      const updateResults = await Promise.all(updatePromises)
      const failed = updateResults.find((r) => r.error)
      if (failed?.error) throw failed.error

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
