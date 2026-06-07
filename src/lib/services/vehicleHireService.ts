// src/lib/services/vehicleHireService.ts — SUPABASE re-implementation.
//
// ⚠️ Data-layer swap: class shape + every static method signature are kept
// identical to the Firestore version so callers import nothing new. Only the
// INTERNALS change — Firestore SDK calls become Supabase queries against
// `checked_in_vehicles` (which already carries the per-vehicle hire columns)
// and the `hire_history` ledger (migration 0012). snake↔camel mapping via dbMap.
//
// ✅ FIXED: quickCheckIn now resets createdAt to now() so Days in Yard
//           counter restarts from 0 when a vehicle returns from hire.
//           Previously createdAt was never touched, so the counter kept running
//           from the original check-in date even across hire periods.
// ✨ PHASE 2.5a: Now also clears `parkingSpaceId` when a vehicle goes on hire,
//                so the yard layout doesn't keep ghost-occupying its parking
//                space while the vehicle is off-yard. On return, the vehicle
//                comes back unparked — user re-parks it manually (Option A).

import { supabase } from '@/lib/supabaseClient'
import { toCamel } from '@/lib/dbMap'
import { activityLogService } from '@/lib/services/activityLogService'
import {
  CheckedInVehicle,
  VehicleHireStatus,
  createHireAuditLog
} from '@/types'
import { logger } from '@/lib/logger'

export class VehicleHireService {
  private static readonly VEHICLES_TABLE = 'checked_in_vehicles'
  private static readonly HIRE_HISTORY_TABLE = 'hire_history'

  /**
   * Calculate days between two dates — COUNTS NIGHTS
   * Same day = 1 day, otherwise count nights slept away
   */
  private static calculateDurationInDays(startDate: Date, endDate: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24
    const startTime = new Date(startDate).setHours(0, 0, 0, 0)
    const endTime   = new Date(endDate).setHours(0, 0, 0, 0)
    const diffMs    = endTime - startTime
    const nightCount = Math.floor(diffMs / msPerDay)
    // Same day = 0 nights → count as 1 day; otherwise return night count
    return nightCount === 0 ? 1 : nightCount
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SET OUT ON HIRE
  // Creates a hire history record and marks the vehicle as Out on Hire.
  // createdAt is deliberately NOT touched here — the vehicle is still in the
  // same yard document it was checked into.
  // ✨ Phase 2.5a: parkingSpaceId is cleared so the yard layout no longer
  //               considers the slot occupied while the vehicle is off-yard.
  // ─────────────────────────────────────────────────────────────────────────────
  static async setOutOnHire(
    vehicleId: string,
    userId: string,
    userDisplayName: string,
    hireNotes?: string
  ): Promise<void> {
    try {
      logger.log(`🚗 Setting vehicle ${vehicleId} out on hire by ${userDisplayName}`)

      const hireAuditLog = createHireAuditLog('hired', userDisplayName, userId, hireNotes)

      // Fetch current vehicle data
      const { data: vehicleRow, error: fetchError } = await supabase
        .from(this.VEHICLES_TABLE)
        .select('*')
        .eq('id', vehicleId)
        .maybeSingle()

      if (fetchError) throw fetchError

      if (!vehicleRow) {
        throw new Error('Vehicle not found')
      }

      const vehicleData = toCamel<CheckedInVehicle>(vehicleRow) as CheckedInVehicle

      if (vehicleData.hireStatus === 'Out on Hire') {
        throw new Error(`Vehicle ${vehicleData.registration} is already out on hire`)
      }

      const nowIso = new Date().toISOString()

      // Create hire history record
      const hireHistoryRecord = {
        vehicle_id: vehicleId,
        registration: vehicleData.registration.trim().toUpperCase().replace(/\s+/g, ''),
        make: vehicleData.make || '',
        model: vehicleData.model || '',
        hire_start_date: nowIso,
        hire_end_date: null,
        hired_by: userId,
        hired_by_name: userDisplayName,
        hire_notes: hireNotes || '',
        organization_id: vehicleData.organizationId,
        branch_id: vehicleData.branchId || 'main',
        branch_name: vehicleData.branchId || 'Main Branch',
        created_at: nowIso
      }

      const { data: hireHistoryInserted, error: insertError } = await supabase
        .from(this.HIRE_HISTORY_TABLE)
        .insert(hireHistoryRecord)
        .select('id')
        .single()

      if (insertError) throw insertError

      const hireHistoryId = hireHistoryInserted.id as string

      logger.log(`✅ Created hire history record: ${hireHistoryId}`)

      // Update vehicle — mark as out on hire
      const { error: updateError } = await supabase
        .from(this.VEHICLES_TABLE)
        .update({
          hire_status: 'Out on Hire' as VehicleHireStatus,
          original_status: vehicleData.status,
          hired_at: nowIso,
          hired_by: userId,
          hired_by_name: userDisplayName,
          hire_notes: hireNotes || '',
          last_edit_log: hireAuditLog,
          updated_at: nowIso,
          current_hire_history_id: hireHistoryId,
          // ✨ Phase 2.5a: free the parking space — vehicle is leaving the yard
          parking_space_id: null,
          // ⚠️  created_at intentionally NOT reset here — vehicle is still checked in,
          //     the "days in yard" counter should keep running while it's out on hire
          //     so managers can see how long it's been on-site total.
          //     The counter resets in quickCheckIn() when the vehicle actually returns.
        })
        .eq('id', vehicleId)

      if (updateError) throw updateError

      activityLogService.log({
        organizationId: vehicleData.organizationId, actorId: userId, actorName: userDisplayName,
        actionType: 'hire', registration: vehicleData.registration, entityId: vehicleId, branchId: vehicleData.branchId,
        summary: `Out on hire${hireNotes ? ` — ${hireNotes}` : ''}`,
      })

      logger.log(`✅ Vehicle ${vehicleData.registration} set out on hire (parking space released)`)
    } catch (error) {
      logger.error('Error setting vehicle out on hire:', error)
      throw new Error(`Failed to set vehicle out on hire: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // QUICK CHECK-IN  (return from hire)
  // ✅ FIX: Now resets createdAt + checkInTime to now() so the
  //         "Days in Yard" bar resets to 0d when the vehicle comes back.
  // ✨ Phase 2.5a: parkingSpaceId stays null so user has to manually re-park
  //                the vehicle when it returns from hire (Option A).
  // ─────────────────────────────────────────────────────────────────────────────
  static async quickCheckIn(
    vehicleId: string,
    userId: string,
    userDisplayName: string,
    returnNotes?: string
  ): Promise<void> {
    try {
      logger.log(`🔄 Returning vehicle ${vehicleId} from hire by ${userDisplayName}`)

      const returnAuditLog = createHireAuditLog('returned', userDisplayName, userId, returnNotes)

      // Fetch current vehicle data
      const { data: vehicleRow, error: fetchError } = await supabase
        .from(this.VEHICLES_TABLE)
        .select('*')
        .eq('id', vehicleId)
        .maybeSingle()

      if (fetchError) throw fetchError

      if (!vehicleRow) {
        throw new Error('Vehicle not found')
      }

      const vehicleData = toCamel<CheckedInVehicle & { currentHireHistoryId?: string }>(
        vehicleRow
      ) as CheckedInVehicle & { currentHireHistoryId?: string }

      if (vehicleData.hireStatus !== 'Out on Hire') {
        throw new Error(`Vehicle ${vehicleData.registration} is not currently on hire`)
      }

      const nowIso = new Date().toISOString()

      // ── Update hire history record ──────────────────────────────────────────
      if (vehicleData.currentHireHistoryId) {
        try {
          const { data: hireRow, error: hireFetchError } = await supabase
            .from(this.HIRE_HISTORY_TABLE)
            .select('*')
            .eq('id', vehicleData.currentHireHistoryId)
            .maybeSingle()

          if (hireFetchError) throw hireFetchError

          if (hireRow) {
            const hireData = toCamel<any>(hireRow)!

            const hireStartDate = new Date(hireData.hireStartDate)

            const now = new Date()
            const durationInDays = this.calculateDurationInDays(hireStartDate, now)

            const { error: hireUpdateError } = await supabase
              .from(this.HIRE_HISTORY_TABLE)
              .update({
                hire_end_date: nowIso,
                duration_in_days: durationInDays,
                returned_by: userId,
                returned_by_name: userDisplayName,
                return_notes: returnNotes || '',
                updated_at: nowIso
              })
              .eq('id', vehicleData.currentHireHistoryId)

            if (hireUpdateError) throw hireUpdateError

            logger.log(`✅ Updated hire history: ${vehicleData.currentHireHistoryId} (${durationInDays} days)`)
          }
        } catch (historyError) {
          // Non-fatal — vehicle update still proceeds
          logger.error('Error updating hire history:', historyError)
        }
      } else {
        logger.log(`⚠️ No hire history ID found for vehicle ${vehicleId}`)
      }

      // ── Update vehicle record ───────────────────────────────────────────────
      const { error: updateError } = await supabase
        .from(this.VEHICLES_TABLE)
        .update({
          hire_status: 'In Yard' as VehicleHireStatus,
          status: vehicleData.originalStatus || vehicleData.status,
          last_edit_log: returnAuditLog,
          updated_at: nowIso,
          // ✅ FIX: Reset the yard clock so "Days in Yard" starts fresh from return
          created_at: nowIso,
          check_in_time: nowIso,
          // ✨ Phase 2.5a: defensive — vehicle returns unparked. Even if some
          // edge case set parkingSpaceId during the hire window (shouldn't
          // happen), this guarantees the user re-parks intentionally.
          parking_space_id: null,
          // Clear all hire fields
          original_status: null,
          hired_at: null,
          hired_by: null,
          hired_by_name: null,
          hire_notes: null,
          current_hire_history_id: null
        })
        .eq('id', vehicleId)

      if (updateError) throw updateError

      activityLogService.log({
        organizationId: vehicleData.organizationId, actorId: userId, actorName: userDisplayName,
        actionType: 'return', registration: vehicleData.registration, entityId: vehicleId, branchId: vehicleData.branchId,
        summary: `Returned from hire`,
      })

      logger.log(`✅ Vehicle ${vehicleData.registration} returned from hire — Days in Yard reset to 0, unparked`)
    } catch (error) {
      logger.error('Error returning vehicle from hire:', error)
      throw new Error(`Failed to return vehicle from hire: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET CURRENTLY HIRED VEHICLES
  // ─────────────────────────────────────────────────────────────────────────────
  static async getCurrentlyHiredVehicles(
    organizationId: string,
    branchId?: string
  ): Promise<CheckedInVehicle[]> {
    try {
      let q = supabase
        .from(this.VEHICLES_TABLE)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('hire_status', 'Out on Hire')

      if (branchId) {
        q = q.eq('branch_id', branchId)
      }

      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((row) => toCamel<CheckedInVehicle>(row) as CheckedInVehicle)
    } catch (error) {
      logger.error('Error fetching currently hired vehicles:', error)
      throw new Error(`Failed to fetch hired vehicles: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET ALL VEHICLES WITH HIRE STATUS
  // ─────────────────────────────────────────────────────────────────────────────
  static async getAllVehiclesWithHireStatus(
    organizationId: string,
    branchId?: string
  ): Promise<CheckedInVehicle[]> {
    try {
      let q = supabase
        .from(this.VEHICLES_TABLE)
        .select('*')
        .eq('organization_id', organizationId)

      if (branchId) {
        q = q.eq('branch_id', branchId)
      }

      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((row) => toCamel<CheckedInVehicle>(row) as CheckedInVehicle)
    } catch (error) {
      logger.error('Error fetching vehicles with hire status:', error)
      throw new Error(`Failed to fetch vehicles: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
