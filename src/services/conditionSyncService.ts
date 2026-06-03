// src/services/conditionSyncService.ts — SUPABASE re-implementation.
// ID-based Condition Sync with Registration Fallback. Public exports + method
// signatures unchanged; only the data-layer internals were swapped from
// Firestore to Supabase. Firestore writeBatch → parallel Promise.all of
// single-row .update()s (not atomic — acceptable here).

import { supabase } from '@/lib/supabaseClient'
import { logger } from '@/lib/logger'

const VEHICLES = 'vehicles'
const CHECKED_IN = 'checked_in_vehicles'

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

      let updatedFleetRecord = false
      let updatedYardRecords = 0

      // 1. FAST: Update fleet record directly using document ID
      try {
        const { error } = await supabase
          .from(VEHICLES)
          .update({
            condition: conditionData.condition,
            last_condition_update: {
              updatedBy: userId,
              updatedByName: userDisplayName,
              updatedAt: new Date().toISOString(),
              source: 'yard_sync_id',
              vehicleId: vehicleId,
            },
          })
          .eq('id', vehicleId)
        if (error) throw error

        updatedFleetRecord = true
        logger.log(`✅ Fleet record queued for condition update (ID: ${vehicleId})`)
      } catch (error) {
        logger.log(`⚠️ Could not update fleet record for ID: ${vehicleId}`)
      }

      // 2. Update all yard records that reference this vehicle ID
      const { data: yardRows } = await supabase
        .from(CHECKED_IN)
        .select('id')
        .eq('organization_id', organizationId)
        .eq('vehicle_id', vehicleId)

      await Promise.all(
        (yardRows ?? []).map(async (yardRow) => {
          await supabase
            .from(CHECKED_IN)
            .update({
              condition: conditionData.condition,
              last_edit_log: {
                action: `Condition updated to "${conditionData.condition}" (ID sync)`,
                editedBy: userId,
                editedByName: userDisplayName,
                editedAt: new Date().toISOString(),
                changes: {
                  condition: conditionData.condition,
                  syncSource: 'id_based_sync',
                  vehicleId: vehicleId,
                },
              },
            })
            .eq('id', yardRow.id)
          updatedYardRecords++
        })
      )

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

      let updatedFleetRecord = false
      let updatedYardRecords = 0

      // 1. Find and update fleet record by registration
      const { data: fleetRows } = await supabase
        .from(VEHICLES)
        .select('id')
        .eq('organization_id', organizationId)
        .eq('registration', registration.toUpperCase())

      if (fleetRows && fleetRows.length > 0) {
        const fleetDoc = fleetRows[0]
        const { error } = await supabase
          .from(VEHICLES)
          .update({
            condition: conditionData.condition,
            last_condition_update: {
              updatedBy: userId,
              updatedByName: userDisplayName,
              updatedAt: new Date().toISOString(),
              source: 'yard_sync_registration',
              registration: registration,
            },
          })
          .eq('id', fleetDoc.id)
        if (error) throw error

        updatedFleetRecord = true
        logger.log(`✅ Fleet record found and queued for condition update`)
      } else {
        logger.log(`⚠️ No fleet record found for registration: ${registration}`)
      }

      // 2. Update all yard records with matching registration
      const { data: yardRows } = await supabase
        .from(CHECKED_IN)
        .select('id')
        .eq('organization_id', organizationId)
        .eq('registration', registration.toUpperCase())

      await Promise.all(
        (yardRows ?? []).map(async (yardRow) => {
          await supabase
            .from(CHECKED_IN)
            .update({
              condition: conditionData.condition,
              last_edit_log: {
                action: `Condition updated to "${conditionData.condition}" (registration sync)`,
                editedBy: userId,
                editedByName: userDisplayName,
                editedAt: new Date().toISOString(),
                changes: {
                  condition: conditionData.condition,
                  syncSource: 'registration_based_sync',
                  registration: registration,
                },
              },
            })
            .eq('id', yardRow.id)
          updatedYardRecords++
        })
      )

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

      let updatedYardRecords = 0

      // Find all yard records referencing this vehicle ID
      const { data: yardRows } = await supabase
        .from(CHECKED_IN)
        .select('id')
        .eq('organization_id', organizationId)
        .eq('vehicle_id', vehicleId)

      await Promise.all(
        (yardRows ?? []).map(async (yardRow) => {
          await supabase
            .from(CHECKED_IN)
            .update({
              condition: conditionData.condition,
              last_edit_log: {
                action: `Condition updated to "${conditionData.condition}" (fleet sync)`,
                editedBy: userId,
                editedByName: userDisplayName,
                editedAt: new Date().toISOString(),
                changes: {
                  condition: conditionData.condition,
                  syncSource: 'fleet_to_yard_id',
                  vehicleId: vehicleId,
                },
              },
            })
            .eq('id', yardRow.id)
          updatedYardRecords++
        })
      )

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

      let updatedYardRecords = 0

      // Find all yard records with matching registration
      const { data: yardRows } = await supabase
        .from(CHECKED_IN)
        .select('id')
        .eq('organization_id', organizationId)
        .eq('registration', registration.toUpperCase())

      await Promise.all(
        (yardRows ?? []).map(async (yardRow) => {
          await supabase
            .from(CHECKED_IN)
            .update({
              condition: conditionData.condition,
              last_edit_log: {
                action: `Condition updated to "${conditionData.condition}" (fleet sync)`,
                editedBy: userId,
                editedByName: userDisplayName,
                editedAt: new Date().toISOString(),
                changes: {
                  condition: conditionData.condition,
                  syncSource: 'fleet_to_yard_registration',
                  registration: registration,
                },
              },
            })
            .eq('id', yardRow.id)
          updatedYardRecords++
        })
      )

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
