// src/services/contractSyncService.ts — SUPABASE re-implementation.
// ID-based Contract Sync with Registration Fallback. Public exports + method
// signatures unchanged; only the data-layer internals were swapped from
// Firestore to Supabase. Firestore writeBatch → parallel Promise.all of
// single-row .update()s (not atomic — acceptable here).

import { supabase } from '@/lib/supabaseClient'
import { logger } from '@/lib/logger'

const VEHICLES = 'vehicles'
const CHECKED_IN = 'checked_in_vehicles'

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

      let updatedFleetRecord = false
      let updatedYardRecords = 0

      // 1. FAST: Update fleet record directly using document ID
      try {
        const { error } = await supabase
          .from(VEHICLES)
          .update({
            contract: contractData.contract,
            contract_color: contractData.contractColor,
            last_contract_update: {
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
        logger.log(`Fleet record queued for update (ID: ${vehicleId})`)
      } catch (error) {
        logger.log(`Could not update fleet record for ID: ${vehicleId}`)
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
              contract: contractData.contract,
              contract_color: contractData.contractColor,
              last_edit_log: {
                action: `Contract ${contractData.contract ? 'set to' : 'removed'} ${contractData.contract || ''} (ID sync)`,
                editedBy: userId,
                editedByName: userDisplayName,
                editedAt: new Date().toISOString(),
                changes: {
                  contract: contractData.contract,
                  contractColor: contractData.contractColor,
                  syncSource: 'id_based_sync',
                  vehicleId: vehicleId,
                },
              },
            })
            .eq('id', yardRow.id)
          updatedYardRecords++
        })
      )

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

      let updatedFleetRecord = false
      let updatedYardRecords = 0
      const cleanReg = registration.toUpperCase().trim()

      // 1. Find fleet record by registration
      const { data: fleetRows } = await supabase
        .from(VEHICLES)
        .select('id, contract')
        .eq('organization_id', organizationId)
        .eq('registration', cleanReg)

      if (fleetRows && fleetRows.length > 0) {
        const fleetDoc = fleetRows[0]
        const { error } = await supabase
          .from(VEHICLES)
          .update({
            contract: contractData.contract,
            contract_color: contractData.contractColor,
            last_contract_update: {
              updatedBy: userId,
              updatedByName: userDisplayName,
              updatedAt: new Date().toISOString(),
              source: 'yard_sync_registration',
              registration: cleanReg,
              previousContract: fleetDoc.contract || null,
            },
          })
          .eq('id', fleetDoc.id)
        if (error) throw error

        updatedFleetRecord = true
        logger.log(`Fleet record found and queued: ${cleanReg}`)
      } else {
        logger.log(`Fleet record not found: ${cleanReg}`)
      }

      // 2. Find all yard records by registration
      const { data: yardRows } = await supabase
        .from(CHECKED_IN)
        .select('id')
        .eq('organization_id', organizationId)
        .eq('registration', cleanReg)

      await Promise.all(
        (yardRows ?? []).map(async (yardRow) => {
          await supabase
            .from(CHECKED_IN)
            .update({
              contract: contractData.contract,
              contract_color: contractData.contractColor,
              last_edit_log: {
                action: `Contract ${contractData.contract ? 'set to' : 'removed'} ${contractData.contract || ''} (registration sync)`,
                editedBy: userId,
                editedByName: userDisplayName,
                editedAt: new Date().toISOString(),
                changes: {
                  contract: contractData.contract,
                  contractColor: contractData.contractColor,
                  syncSource: 'registration_based_sync',
                  registration: cleanReg,
                },
              },
            })
            .eq('id', yardRow.id)
          updatedYardRecords++
        })
      )

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
              contract: contractData.contract,
              contract_color: contractData.contractColor,
              last_edit_log: {
                action: `Contract ${contractData.contract ? 'updated to' : 'removed'} ${contractData.contract || ''} (fleet sync)`,
                editedBy: userId,
                editedByName: userDisplayName,
                editedAt: new Date().toISOString(),
                changes: {
                  contract: contractData.contract,
                  contractColor: contractData.contractColor,
                  syncSource: 'fleet_to_yard_id',
                  vehicleId: vehicleId,
                },
              },
            })
            .eq('id', yardRow.id)
          updatedYardRecords++
        })
      )

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

      let updatedYardRecords = 0
      const cleanReg = registration.toUpperCase().trim()

      // Find all yard records by registration
      const { data: yardRows } = await supabase
        .from(CHECKED_IN)
        .select('id')
        .eq('organization_id', organizationId)
        .eq('registration', cleanReg)

      await Promise.all(
        (yardRows ?? []).map(async (yardRow) => {
          await supabase
            .from(CHECKED_IN)
            .update({
              contract: contractData.contract,
              contract_color: contractData.contractColor,
              last_edit_log: {
                action: `Contract ${contractData.contract ? 'updated to' : 'removed'} ${contractData.contract || ''} (fleet sync)`,
                editedBy: userId,
                editedByName: userDisplayName,
                editedAt: new Date().toISOString(),
                changes: {
                  contract: contractData.contract,
                  contractColor: contractData.contractColor,
                  syncSource: 'fleet_to_yard_registration',
                  registration: cleanReg,
                },
              },
            })
            .eq('id', yardRow.id)
          updatedYardRecords++
        })
      )

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
      const { data: rows } = await supabase
        .from(CHECKED_IN)
        .select('vehicle_id')
        .eq('organization_id', organizationId)

      let withIds = 0
      let withoutIds = 0

      ;(rows ?? []).forEach((data: any) => {
        if (data.vehicle_id && String(data.vehicle_id).trim() !== '') {
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
