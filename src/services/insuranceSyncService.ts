// src/services/insuranceSyncService.ts — SUPABASE re-implementation.
// ✅ Carries policy fields (id, name, expiry) through every sync.
// ✅ ALL original methods preserved: bulkSyncInsurance (with direction + performanceStats),
//    getPerformanceStats, getInsuranceBreakdown, canPerformAction
// Public exports + method signatures unchanged; only the data-layer internals
// were swapped from Firestore to Supabase. Firestore writeBatch → parallel
// Promise.all of single-row .update()s (not atomic — acceptable here).

import { supabase } from '@/lib/supabaseClient'
import { InsuranceStatus } from '@/types'
import { logger } from '@/lib/logger'

const VEHICLES = 'vehicles'
const CHECKED_IN = 'checked_in_vehicles'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface InsuranceSyncData {
  insuranceStatus: InsuranceStatus | null
  // ✅ optional policy fields — all existing callers still work unchanged
  insurancePolicyId?: string | null
  insurancePolicyName?: string | null
  insurancePolicyExpiry?: string | null
}

export interface SyncResult {
  success: boolean
  updatedFleetRecord: boolean
  updatedYardRecords: number
  error?: string
  method?: 'id-based' | 'registration-based'
}

// ── Helper: camelCase policy fields (for the jsonb audit blob) ─────────────────
function policyFields(data: InsuranceSyncData) {
  return {
    insuranceStatus:       data.insuranceStatus,
    insurancePolicyId:     data.insurancePolicyId     ?? null,
    insurancePolicyName:   data.insurancePolicyName   ?? null,
    insurancePolicyExpiry: data.insurancePolicyExpiry ?? null,
  }
}

// ── Helper: snake_case policy columns (for the actual row update) ──────────────
function policyColumns(data: InsuranceSyncData) {
  return {
    insurance_status:        data.insuranceStatus,
    insurance_policy_id:     data.insurancePolicyId     ?? null,
    insurance_policy_name:   data.insurancePolicyName   ?? null,
    insurance_policy_expiry: data.insurancePolicyExpiry ?? null,
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Insurance Sync Service - ID-First Approach with Registration Fallback
 *
 * Automatically syncs insurance status + policy details between Fleet Inventory
 * and Yard. Prioritises fast ID-based lookups, falls back to registration-based
 * queries for backward compatibility. Matches ContractSyncService architecture.
 */
export class InsuranceSyncService {

  // ════════════════════════════════════════════════════════════════════════════
  // YARD → FLEET
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * MAIN METHOD: Sync insurance from yard to fleet.
   * Automatically chooses ID-based or registration-based sync.
   */
  static async syncInsuranceFromYardToFleet(
    vehicleIdentifier: string, // vehicleId OR registration
    insuranceData: InsuranceSyncData,
    organizationId: string,
    userId: string,
    userDisplayName: string,
    isVehicleId: boolean = false
  ): Promise<SyncResult> {
    if (isVehicleId) {
      return this.syncInsuranceFromYardToFleetById(
        vehicleIdentifier, insuranceData, organizationId, userId, userDisplayName
      )
    }
    return this.syncInsuranceFromYardToFleetByRegistration(
      vehicleIdentifier, insuranceData, organizationId, userId, userDisplayName
    )
  }

  /**
   * ID-BASED SYNC: Fast insurance sync using vehicle document ID.
   */
  static async syncInsuranceFromYardToFleetById(
    vehicleId: string,
    insuranceData: InsuranceSyncData,
    organizationId: string,
    userId: string,
    userDisplayName: string
  ): Promise<SyncResult> {
    try {
      logger.log(`Insurance sync via ID for vehicle: ${vehicleId}`)

      let updatedFleetRecord = false
      let updatedYardRecords = 0

      // 1. FAST: Update fleet record directly using document ID
      try {
        const { error } = await supabase
          .from(VEHICLES)
          .update({
            ...policyColumns(insuranceData),
            last_insurance_update: {
              updatedBy: userId,
              updatedByName: userDisplayName,
              updatedAt: new Date().toISOString(),
              source: 'yard_sync_id',
              vehicleId,
            },
          })
          .eq('id', vehicleId)
        if (error) throw error
        updatedFleetRecord = true
        logger.log(`Fleet record queued for insurance update (ID: ${vehicleId})`)
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
              ...policyColumns(insuranceData),
              last_edit_log: {
                action: `Insurance status ${insuranceData.insuranceStatus ? 'set to' : 'removed'} ${insuranceData.insuranceStatus || ''} (ID sync)`,
                editedBy: userId,
                editedByName: userDisplayName,
                editedAt: new Date().toISOString(),
                changes: {
                  ...policyFields(insuranceData),
                  syncSource: 'id_based_sync',
                  vehicleId,
                },
              },
            })
            .eq('id', yardRow.id)
          updatedYardRecords++
        })
      )

      logger.log(`ID-based insurance sync completed: Fleet=${updatedFleetRecord}, Yard=${updatedYardRecords}`)

      return { success: true, updatedFleetRecord, updatedYardRecords, method: 'id-based' }

    } catch (error) {
      logger.error('ID-based insurance sync failed:', error)
      return {
        success: false,
        updatedFleetRecord: false,
        updatedYardRecords: 0,
        error: error instanceof Error ? error.message : 'ID sync failed',
        method: 'id-based',
      }
    }
  }

  /**
   * REGISTRATION-BASED SYNC: Fallback insurance sync using registration number.
   */
  static async syncInsuranceFromYardToFleetByRegistration(
    registration: string,
    insuranceData: InsuranceSyncData,
    organizationId: string,
    userId: string,
    userDisplayName: string
  ): Promise<SyncResult> {
    try {
      logger.log(`Insurance sync via registration for: ${registration}`)

      let updatedFleetRecord = false
      let updatedYardRecords = 0
      const cleanReg = registration.toUpperCase().trim()

      // 1. Find fleet record by registration
      const { data: fleetRows } = await supabase
        .from(VEHICLES)
        .select('id, insurance_status')
        .eq('organization_id', organizationId)
        .eq('registration', cleanReg)

      if (fleetRows && fleetRows.length > 0) {
        const fleetDoc = fleetRows[0]
        const { error } = await supabase
          .from(VEHICLES)
          .update({
            ...policyColumns(insuranceData),
            last_insurance_update: {
              updatedBy: userId,
              updatedByName: userDisplayName,
              updatedAt: new Date().toISOString(),
              source: 'yard_sync_registration',
              registration: cleanReg,
              previousInsuranceStatus: fleetDoc.insurance_status || null,
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
              ...policyColumns(insuranceData),
              last_edit_log: {
                action: `Insurance status ${insuranceData.insuranceStatus ? 'set to' : 'removed'} ${insuranceData.insuranceStatus || ''} (registration sync)`,
                editedBy: userId,
                editedByName: userDisplayName,
                editedAt: new Date().toISOString(),
                changes: {
                  ...policyFields(insuranceData),
                  syncSource: 'registration_based_sync',
                  registration: cleanReg,
                },
              },
            })
            .eq('id', yardRow.id)
          updatedYardRecords++
        })
      )

      logger.log(`Registration-based insurance sync completed: Fleet=${updatedFleetRecord}, Yard=${updatedYardRecords}`)
      return { success: true, updatedFleetRecord, updatedYardRecords, method: 'registration-based' }

    } catch (error) {
      logger.error('Registration-based insurance sync failed:', error)
      return {
        success: false,
        updatedFleetRecord: false,
        updatedYardRecords: 0,
        error: error instanceof Error ? error.message : 'Registration sync failed',
        method: 'registration-based',
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FLEET → YARD
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * FLEET-TO-YARD SYNC: Update yard when fleet insurance changes.
   */
  static async syncInsuranceFromFleetToYard(
    vehicleIdentifier: string,
    insuranceData: InsuranceSyncData,
    organizationId: string,
    userId: string,
    userDisplayName: string,
    isVehicleId: boolean = false
  ): Promise<SyncResult> {
    if (isVehicleId) {
      return this.syncInsuranceFromFleetToYardById(
        vehicleIdentifier, insuranceData, organizationId, userId, userDisplayName
      )
    }
    return this.syncInsuranceFromFleetToYardByRegistration(
      vehicleIdentifier, insuranceData, organizationId, userId, userDisplayName
    )
  }

  /**
   * ID-BASED FLEET-TO-YARD: Fast sync using vehicle ID.
   */
  static async syncInsuranceFromFleetToYardById(
    vehicleId: string,
    insuranceData: InsuranceSyncData,
    organizationId: string,
    userId: string,
    userDisplayName: string
  ): Promise<SyncResult> {
    try {
      logger.log(`Fleet-to-yard insurance sync via ID: ${vehicleId}`)

      let updatedYardRecords = 0

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
              ...policyColumns(insuranceData),
              last_edit_log: {
                action: `Insurance status ${insuranceData.insuranceStatus ? 'updated to' : 'removed'} ${insuranceData.insuranceStatus || ''} (fleet sync)`,
                editedBy: userId,
                editedByName: userDisplayName,
                editedAt: new Date().toISOString(),
                changes: {
                  ...policyFields(insuranceData),
                  syncSource: 'fleet_to_yard_id',
                  vehicleId,
                },
              },
            })
            .eq('id', yardRow.id)
          updatedYardRecords++
        })
      )

      logger.log(`Fleet-to-yard ID sync completed: ${updatedYardRecords} yard records updated`)

      return { success: true, updatedFleetRecord: false, updatedYardRecords, method: 'id-based' }

    } catch (error) {
      logger.error('Fleet-to-yard ID sync failed:', error)
      return {
        success: false,
        updatedFleetRecord: false,
        updatedYardRecords: 0,
        error: error instanceof Error ? error.message : 'Fleet-to-yard ID sync failed',
        method: 'id-based',
      }
    }
  }

  /**
   * REGISTRATION-BASED FLEET-TO-YARD: Fallback sync using registration.
   */
  static async syncInsuranceFromFleetToYardByRegistration(
    registration: string,
    insuranceData: InsuranceSyncData,
    organizationId: string,
    userId: string,
    userDisplayName: string
  ): Promise<SyncResult> {
    try {
      logger.log(`Fleet-to-yard insurance sync via registration: ${registration}`)

      let updatedYardRecords = 0
      const cleanReg = registration.toUpperCase().trim()

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
              ...policyColumns(insuranceData),
              last_edit_log: {
                action: `Insurance status ${insuranceData.insuranceStatus ? 'updated to' : 'removed'} ${insuranceData.insuranceStatus || ''} (fleet sync)`,
                editedBy: userId,
                editedByName: userDisplayName,
                editedAt: new Date().toISOString(),
                changes: {
                  ...policyFields(insuranceData),
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

      return { success: true, updatedFleetRecord: false, updatedYardRecords, method: 'registration-based' }

    } catch (error) {
      logger.error('Fleet-to-yard registration sync failed:', error)
      return {
        success: false,
        updatedFleetRecord: false,
        updatedYardRecords: 0,
        error: error instanceof Error ? error.message : 'Fleet-to-yard registration sync failed',
        method: 'registration-based',
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // BULK SYNC
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * BULK SYNC: Handle multiple vehicles efficiently.
   * Supports both yard-to-fleet and fleet-to-yard directions.
   * Returns performance stats (id-based vs registration-based split).
   */
  static async bulkSyncInsurance(
    vehicles: Array<{
      vehicleId?: string | null
      registration: string
      insuranceData: InsuranceSyncData
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
      const hasVehicleId = Boolean(vehicle.vehicleId && vehicle.vehicleId.trim() !== '')

      if (hasVehicleId) {
        syncResult = direction === 'yard-to-fleet'
          ? await this.syncInsuranceFromYardToFleetById(
              vehicle.vehicleId!,
              vehicle.insuranceData,
              organizationId,
              userId,
              userDisplayName
            )
          : await this.syncInsuranceFromFleetToYardById(
              vehicle.vehicleId!,
              vehicle.insuranceData,
              organizationId,
              userId,
              userDisplayName
            )
        idBased++
      } else {
        syncResult = direction === 'yard-to-fleet'
          ? await this.syncInsuranceFromYardToFleetByRegistration(
              vehicle.registration,
              vehicle.insuranceData,
              organizationId,
              userId,
              userDisplayName
            )
          : await this.syncInsuranceFromFleetToYardByRegistration(
              vehicle.registration,
              vehicle.insuranceData,
              organizationId,
              userId,
              userDisplayName
            )
        registrationBased++
      }

      results.push({
        identifier: hasVehicleId ? vehicle.vehicleId! : vehicle.registration,
        result: syncResult,
      })

      if (syncResult.success) {
        if (syncResult.updatedFleetRecord) totalFleetUpdated++
        totalYardUpdated += syncResult.updatedYardRecords
      }
    }

    logger.log(`Bulk insurance sync completed: ${idBased} ID-based, ${registrationBased} registration-based`)

    return {
      success: results.every(r => r.result.success),
      results,
      totalFleetUpdated,
      totalYardUpdated,
      performanceStats: { idBased, registrationBased },
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * UTILITY: Check if a vehicle can perform actions based on insurance status.
   */
  static canPerformAction(insuranceStatus: InsuranceStatus | null): boolean {
    return insuranceStatus === 'Insured'
  }

  /**
   * UTILITY: Get performance statistics — how many yard vehicles have a vehicleId
   * vs relying on registration-based sync. Useful to track migration progress.
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
        migrationPercentage,
      }

    } catch (error) {
      logger.error('Error getting performance stats:', error)
      return { totalVehicles: 0, vehiclesWithIds: 0, vehiclesWithoutIds: 0, migrationPercentage: 0 }
    }
  }

  /**
   * UTILITY: Get insurance breakdown for analytics dashboard.
   */
  static async getInsuranceBreakdown(organizationId: string): Promise<Record<string, number>> {
    try {
      const { data: rows } = await supabase
        .from(CHECKED_IN)
        .select('insurance_status')
        .eq('organization_id', organizationId)

      const breakdown: Record<string, number> = {}

      ;(rows ?? []).forEach((data: any) => {
        const status = data.insurance_status || 'Unknown'
        breakdown[status] = (breakdown[status] || 0) + 1
      })

      return breakdown

    } catch (error) {
      logger.error('Error getting insurance breakdown:', error)
      return {}
    }
  }
}
