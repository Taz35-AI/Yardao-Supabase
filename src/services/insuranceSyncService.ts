// src/services/insuranceSyncService.ts
// ✅ UPDATED: Now carries policy fields (id, name, expiry) through every sync
// ✅ ALL original methods preserved: bulkSyncInsurance (with direction + performanceStats),
//    getPerformanceStats, getInsuranceBreakdown, canPerformAction

import {
  doc,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { InsuranceStatus } from '@/types'
import { logger } from '@/lib/logger'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface InsuranceSyncData {
  insuranceStatus: InsuranceStatus | null
  // ✅ NEW: optional policy fields — all existing callers still work unchanged
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

// ── Helper: builds the Firestore field object for any batch write ──────────────
// Spreads all insurance + policy fields so every write is consistent

function policyFields(data: InsuranceSyncData) {
  return {
    insuranceStatus:       data.insuranceStatus,
    insurancePolicyId:     data.insurancePolicyId     ?? null,
    insurancePolicyName:   data.insurancePolicyName   ?? null,
    insurancePolicyExpiry: data.insurancePolicyExpiry ?? null,
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

      const batch = writeBatch(db)
      let updatedFleetRecord = false
      let updatedYardRecords = 0

      // 1. FAST: Update fleet record directly using document ID
      try {
        batch.update(doc(db, 'vehicles', vehicleId), {
          ...policyFields(insuranceData),
          updatedAt: serverTimestamp(),
          lastInsuranceUpdate: {
            updatedBy: userId,
            updatedByName: userDisplayName,
            updatedAt: new Date(),
            source: 'yard_sync_id',
            vehicleId,
          },
        })
        updatedFleetRecord = true
        logger.log(`Fleet record queued for insurance update (ID: ${vehicleId})`)
      } catch (error) {
        logger.log(`Could not update fleet record for ID: ${vehicleId}`)
      }

      // 2. Update all yard records that reference this vehicle ID
      const yardSnapshot = await getDocs(query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId),
        where('vehicleId', '==', vehicleId)
      ))

      yardSnapshot.docs.forEach(yardDoc => {
        batch.update(doc(db, 'checkedInVehicles', yardDoc.id), {
          ...policyFields(insuranceData),
          updatedAt: serverTimestamp(),
          lastEditLog: {
            action: `Insurance status ${insuranceData.insuranceStatus ? 'set to' : 'removed'} ${insuranceData.insuranceStatus || ''} (ID sync)`,
            editedBy: userId,
            editedByName: userDisplayName,
            editedAt: new Date(),
            changes: {
              ...policyFields(insuranceData),
              syncSource: 'id_based_sync',
              vehicleId,
            },
          },
        })
        updatedYardRecords++
      })

      await batch.commit()
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

      const batch = writeBatch(db)
      let updatedFleetRecord = false
      let updatedYardRecords = 0
      const cleanReg = registration.toUpperCase().trim()

      // 1. Find fleet record by registration
      const fleetSnapshot = await getDocs(query(
        collection(db, 'vehicles'),
        where('organizationId', '==', organizationId),
        where('registration', '==', cleanReg)
      ))

      if (!fleetSnapshot.empty) {
        const fleetDoc = fleetSnapshot.docs[0]
        batch.update(doc(db, 'vehicles', fleetDoc.id), {
          ...policyFields(insuranceData),
          updatedAt: serverTimestamp(),
          lastInsuranceUpdate: {
            updatedBy: userId,
            updatedByName: userDisplayName,
            updatedAt: new Date(),
            source: 'yard_sync_registration',
            registration: cleanReg,
            previousInsuranceStatus: fleetDoc.data().insuranceStatus || null,
          },
        })
        updatedFleetRecord = true
        logger.log(`Fleet record found and queued: ${cleanReg}`)
      } else {
        logger.log(`Fleet record not found: ${cleanReg}`)
      }

      // 2. Find all yard records by registration
      const yardSnapshot = await getDocs(query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId),
        where('registration', '==', cleanReg)
      ))

      yardSnapshot.docs.forEach(yardDoc => {
        batch.update(doc(db, 'checkedInVehicles', yardDoc.id), {
          ...policyFields(insuranceData),
          updatedAt: serverTimestamp(),
          lastEditLog: {
            action: `Insurance status ${insuranceData.insuranceStatus ? 'set to' : 'removed'} ${insuranceData.insuranceStatus || ''} (registration sync)`,
            editedBy: userId,
            editedByName: userDisplayName,
            editedAt: new Date(),
            changes: {
              ...policyFields(insuranceData),
              syncSource: 'registration_based_sync',
              registration: cleanReg,
            },
          },
        })
        updatedYardRecords++
      })

      if (updatedFleetRecord || updatedYardRecords > 0) {
        await batch.commit()
      }

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

      const batch = writeBatch(db)
      let updatedYardRecords = 0

      const yardSnapshot = await getDocs(query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId),
        where('vehicleId', '==', vehicleId)
      ))

      yardSnapshot.docs.forEach(yardDoc => {
        batch.update(doc(db, 'checkedInVehicles', yardDoc.id), {
          ...policyFields(insuranceData),
          updatedAt: serverTimestamp(),
          lastEditLog: {
            action: `Insurance status ${insuranceData.insuranceStatus ? 'updated to' : 'removed'} ${insuranceData.insuranceStatus || ''} (fleet sync)`,
            editedBy: userId,
            editedByName: userDisplayName,
            editedAt: new Date(),
            changes: {
              ...policyFields(insuranceData),
              syncSource: 'fleet_to_yard_id',
              vehicleId,
            },
          },
        })
        updatedYardRecords++
      })

      if (updatedYardRecords > 0) await batch.commit()
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

      const batch = writeBatch(db)
      let updatedYardRecords = 0
      const cleanReg = registration.toUpperCase().trim()

      const yardSnapshot = await getDocs(query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId),
        where('registration', '==', cleanReg)
      ))

      yardSnapshot.docs.forEach(yardDoc => {
        batch.update(doc(db, 'checkedInVehicles', yardDoc.id), {
          ...policyFields(insuranceData),
          updatedAt: serverTimestamp(),
          lastEditLog: {
            action: `Insurance status ${insuranceData.insuranceStatus ? 'updated to' : 'removed'} ${insuranceData.insuranceStatus || ''} (fleet sync)`,
            editedBy: userId,
            editedByName: userDisplayName,
            editedAt: new Date(),
            changes: {
              ...policyFields(insuranceData),
              syncSource: 'fleet_to_yard_registration',
              registration: cleanReg,
            },
          },
        })
        updatedYardRecords++
      })

      if (updatedYardRecords > 0) await batch.commit()
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
      const snapshot = await getDocs(query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId)
      ))

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
      const snapshot = await getDocs(query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId)
      ))

      const breakdown: Record<string, number> = {}

      snapshot.docs.forEach(doc => {
        const status = doc.data().insuranceStatus || 'Unknown'
        breakdown[status] = (breakdown[status] || 0) + 1
      })

      return breakdown

    } catch (error) {
      logger.error('Error getting insurance breakdown:', error)
      return {}
    }
  }
}