// src/hooks/useVehicleTransfers.ts — SUPABASE re-implementation.
// Vehicle transfer operations hook. Public API (loading, initiateCheckout,
// cancelTransfer, receiveVehicle, returnFromGarage) + every returned
// TransferResult shape is kept identical; only the internals swap
// Firestore → Supabase.
//
// This is a MUTATION hook — there is no onSnapshot here, so nothing to make
// "realtime"; it just writes to checked_in_vehicles (the same table the live
// dashboards/branch hooks subscribe to). Firestore semantics mapped:
//   * doc(db,'checkedInVehicles',id) + updateDoc → supabase.from(...).update().eq('id', id)
//   * getDoc(...).exists()/.data()               → select('*').eq('id', id).maybeSingle()
//   * serverTimestamp()                          → new Date().toISOString()
//   * deleteField()                              → null  (snake_case column cleared)
//   * writeBatch                                 → two sequential updates (returnFromGarage)
// Field names are written in snake_case to match the Postgres columns
// (0001_core_schema.sql + the receipt-audit columns added in 0020_deliveries.sql);
// reads use the raw snake_case row.

'use client'

import { useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import { userProfileService } from '@/lib/firestore'
import type { CheckoutDestination, TransferResult } from '@/types/transfer'
import { logger } from '@/lib/logger'
import { activityLogService } from '@/lib/services/activityLogService'

const CHECKED_IN_VEHICLES = 'checked_in_vehicles'
const SERVICE_BOOKINGS = 'service_bookings'

const nowIso = () => new Date().toISOString()

export function useVehicleTransfers() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)

  // Initiate checkout (transfer or external garage)
  // ✨ Phase 2.5a: clears parkingSpaceId on both branch transfers and garage
  //                checkouts — vehicle is leaving the yard either way.
  const initiateCheckout = useCallback(async (
    vehicleId: string,
    destination: CheckoutDestination
  ): Promise<TransferResult> => {
    if (!user) {
      return {
        success: false,
        vehicleId,
        message: 'User not authenticated',
        error: 'Not authenticated'
      }
    }

    setLoading(true)
    try {
      const userProfile = await userProfileService.getProfile(user.uid)
      const userDisplayName = userProfile?.displayName || user.email || 'Unknown User'

      // Get current vehicle data for logging
      const { data: vehicleData, error: fetchError } = await supabase
        .from(CHECKED_IN_VEHICLES)
        .select('*')
        .eq('id', vehicleId)
        .maybeSingle()
      if (fetchError) throw fetchError
      if (!vehicleData) {
        throw new Error('Vehicle not found')
      }

      if (destination.type === 'branch_transfer') {
        logger.log('🚚 BRANCH TRANSFER:', {
          vehicleId,
          registration: vehicleData.registration,
          from: vehicleData.branch_id,
          fromName: destination.sourceBranchName,
          to: destination.branchId,
          toName: destination.branchName,
          parkingSpaceWasSet: !!vehicleData.parking_space_id,
          setting: {
            transferStatus: 'in_transit',
            sourceBranchId: vehicleData.branch_id,
            sourceBranchName: destination.sourceBranchName,
            targetBranchId: destination.branchId,
            targetBranchName: destination.branchName
          }
        })

        // ✅ Branch transfer - ONLY set branch transfer fields, clear any existing external garage fields
        // ⚠️ createdAt intentionally NOT reset here — vehicle hasn't physically moved yet.
        //    The reset happens in receiveVehicle() when the destination branch confirms arrival.
        // ✨ Phase 2.5a: parkingSpaceId cleared — vehicle is leaving this branch's yard.
        const { error: updateError } = await supabase
          .from(CHECKED_IN_VEHICLES)
          .update({
            // Set branch transfer fields
            transfer_status: 'in_transit',
            source_branch_id: vehicleData.branch_id,
            source_branch_name: destination.sourceBranchName || 'Unknown Branch',
            target_branch_id: destination.branchId,
            target_branch_name: destination.branchName,
            transfer_initiated_at: nowIso(),
            transfer_initiated_by: user.uid,
            transfer_initiated_by_name: userDisplayName,
            // ✨ Phase 2.5a: free up the parking space at the source branch
            parking_space_id: null,
            // Clear any existing external garage fields (in case vehicle was previously at garage)
            external_garage_id: null,
            external_garage_name: null,
            service_booking_id: null,
            checked_out_to_garage_at: null,
            checked_out_to_garage_by: null,
            checked_out_to_garage_by_name: null,
            updated_at: nowIso()
          })
          .eq('id', vehicleId)
        if (updateError) throw updateError

        logger.log('✅ Branch transfer initiated successfully (parking space released)')

        // Movement timeline: record the outbound transfer (fire-and-forget).
        activityLogService.log({
          organizationId: vehicleData.organization_id,
          actorId: user.uid,
          actorName: userDisplayName,
          actionType: 'transfer',
          summary: `Transfer to ${destination.branchName || 'another branch'}`,
          registration: vehicleData.registration,
          entityId: vehicleId,
          branchId: vehicleData.branch_id ?? null,
          details: { from: destination.sourceBranchName ?? null, to: destination.branchName ?? null },
        })

        return {
          success: true,
          vehicleId,
          message: `Vehicle transferred to ${destination.branchName}`
        }
      } else {
        logger.log('🔧 EXTERNAL GARAGE:', {
          vehicleId,
          registration: vehicleData.registration,
          branchId: vehicleData.branch_id,
          garageName: destination.garageName,
          serviceBookingId: destination.serviceBookingId,
          parkingSpaceWasSet: !!vehicleData.parking_space_id,
          setting: {
            transferStatus: 'at_external_garage',
            externalGarageId: destination.garageId,
            externalGarageName: destination.garageName,
            serviceBookingId: destination.serviceBookingId
          }
        })

        // ✅ External garage - Set garage fields INCLUDING serviceBookingId, clear any existing branch transfer fields
        // ⚠️ createdAt intentionally NOT reset here — vehicle is still "checked in", just marked at_external_garage.
        //    The reset happens in returnFromGarage() when the vehicle physically comes back.
        // ✨ Phase 2.5a: parkingSpaceId cleared — vehicle is no longer in the yard.
        const { error: updateError } = await supabase
          .from(CHECKED_IN_VEHICLES)
          .update({
            // Set external garage fields
            transfer_status: 'at_external_garage',
            external_garage_id: destination.garageId || null,
            external_garage_name: destination.garageName || 'External Garage',
            service_booking_id: destination.serviceBookingId || null,
            checked_out_to_garage_at: nowIso(),
            checked_out_to_garage_by: user.uid,
            checked_out_to_garage_by_name: userDisplayName,
            // ✨ Phase 2.5a: free up the parking space — vehicle is at external garage
            parking_space_id: null,
            // Clear any existing branch transfer fields (in case vehicle was previously in transit)
            source_branch_id: null,
            source_branch_name: null,
            target_branch_id: null,
            target_branch_name: null,
            transfer_initiated_at: null,
            transfer_initiated_by: null,
            transfer_initiated_by_name: null,
            updated_at: nowIso()
          })
          .eq('id', vehicleId)
        if (updateError) throw updateError

        logger.log('✅ External garage checkout completed successfully (parking space released)')

        // Movement timeline: record the garage check-out (fire-and-forget).
        activityLogService.log({
          organizationId: vehicleData.organization_id,
          actorId: user.uid,
          actorName: userDisplayName,
          actionType: 'garage_out',
          summary: `Sent to ${destination.garageName || 'external garage'}`,
          registration: vehicleData.registration,
          entityId: vehicleId,
          branchId: vehicleData.branch_id ?? null,
          details: { garageName: destination.garageName ?? null, serviceBookingId: destination.serviceBookingId ?? null },
        })

        return {
          success: true,
          vehicleId,
          message: `Vehicle checked out to ${destination.garageName}`
        }
      }
    } catch (error) {
      logger.error('❌ Checkout error:', error)
      return {
        success: false,
        vehicleId,
        message: 'Failed to checkout vehicle',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    } finally {
      setLoading(false)
    }
  }, [user])

  // Cancel transfer
  // ⚠️ No createdAt reset — vehicle never physically left, counter keeps running correctly
  // ✨ Phase 2.5a: parkingSpaceId stays null — user re-parks manually if they want
  //                the vehicle back on the map. Cancelling a transfer just means
  //                "the vehicle stays at this branch" — it doesn't auto-restore
  //                whatever space it might have been in before.
  const cancelTransfer = useCallback(async (vehicleId: string): Promise<TransferResult> => {
    if (!user) {
      return {
        success: false,
        vehicleId,
        message: 'User not authenticated',
        error: 'Not authenticated'
      }
    }

    setLoading(true)
    try {
      logger.log('❌ Cancelling transfer for vehicle:', vehicleId)

      // ✅ CRITICAL: null out ALL transfer-related columns
      // ✨ Phase 2.5a: parkingSpaceId already cleared at initiateCheckout time —
      //                we leave it null so the user manually re-parks if they want.
      const { error: updateError } = await supabase
        .from(CHECKED_IN_VEHICLES)
        .update({
          transfer_status: null,
          source_branch_id: null,
          source_branch_name: null,
          target_branch_id: null,
          target_branch_name: null,
          transfer_initiated_at: null,
          transfer_initiated_by: null,
          transfer_initiated_by_name: null,
          external_garage_id: null,
          external_garage_name: null,
          service_booking_id: null,
          checked_out_to_garage_at: null,
          checked_out_to_garage_by: null,
          checked_out_to_garage_by_name: null,
          updated_at: nowIso()
        })
        .eq('id', vehicleId)
      if (updateError) throw updateError

      logger.log('✅ Transfer cancelled, all fields deleted')

      return {
        success: true,
        vehicleId,
        message: 'Transfer cancelled successfully'
      }
    } catch (error) {
      logger.error('❌ Cancel transfer error:', error)
      return {
        success: false,
        vehicleId,
        message: 'Failed to cancel transfer',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    } finally {
      setLoading(false)
    }
  }, [user])

  // Receive vehicle (complete the branch transfer on the destination side)
  // ✅ FIX: Resets createdAt + checkInTime so "Days in Yard" restarts from 0 at the new branch.
  //         Without this, a vehicle transferred from Branch A would arrive at Branch B still
  //         showing however many days it spent at A — now it resets to 0d on arrival.
  // ✨ Phase 2.5a: parkingSpaceId is explicitly cleared on receive. Even if the
  //                vehicle had a parking space ID from its OLD branch's layout,
  //                that ID is meaningless at the new branch (different layout
  //                doc with different space ids). User must park it fresh.
  const receiveVehicle = useCallback(async (
    vehicleId: string,
    receivingBranchId: string
  ): Promise<TransferResult> => {
    if (!user) {
      return {
        success: false,
        vehicleId,
        message: 'User not authenticated',
        error: 'Not authenticated'
      }
    }

    setLoading(true)
    try {
      const userProfile = await userProfileService.getProfile(user.uid)
      const userDisplayName = userProfile?.displayName || user.email || 'Unknown User'

      // Get current vehicle data to log the transfer
      const { data: vehicleData, error: fetchError } = await supabase
        .from(CHECKED_IN_VEHICLES)
        .select('*')
        .eq('id', vehicleId)
        .maybeSingle()
      if (fetchError) throw fetchError
      if (!vehicleData) {
        throw new Error('Vehicle not found')
      }

      logger.log('📦 Receiving vehicle:', {
        vehicleId,
        registration: vehicleData.registration,
        from: vehicleData.branch_id,
        fromName: vehicleData.source_branch_name,
        to: receivingBranchId,
        removingFields: [
          'transferStatus',
          'sourceBranchId',
          'sourceBranchName',
          'targetBranchId',
          'targetBranchName',
          'transferInitiatedAt',
          'transferInitiatedBy',
          'transferInitiatedByName',
          'parkingSpaceId'
        ]
      })

      // ✅ CRITICAL FIX: Update branchId AND null out ALL transfer fields
      // ✅ FIX: Reset createdAt + checkInTime so Days in Yard restarts at 0 for the new branch
      // ✨ Phase 2.5a: defensive — clear parkingSpaceId. Should already be null
      //                from initiateCheckout, but absolute safety: a parking
      //                space id from the OLD branch is invalid here.
      const { error: updateError } = await supabase
        .from(CHECKED_IN_VEHICLES)
        .update({
          branch_id: receivingBranchId,
          // ✅ FIX: Reset yard clock — vehicle is "new" to this branch from today
          created_at: nowIso(),
          check_in_time: nowIso(),
          // ✨ Phase 2.5a: explicitly null the parking space — the OLD branch's
          //                layout has nothing to do with this branch's layout
          parking_space_id: null,
          // ✅ Null out all transfer status fields
          transfer_status: null,
          source_branch_id: null,
          source_branch_name: null,
          target_branch_id: null,
          target_branch_name: null,
          transfer_initiated_at: null,
          transfer_initiated_by: null,
          transfer_initiated_by_name: null,
          // Also clear any external garage fields (in case it was at garage before)
          external_garage_id: null,
          external_garage_name: null,
          service_booking_id: null,
          checked_out_to_garage_at: null,
          checked_out_to_garage_by: null,
          checked_out_to_garage_by_name: null,
          // Record who received it
          received_at: nowIso(),
          received_by: user.uid,
          received_by_name: userDisplayName,
          updated_at: nowIso()
        })
        .eq('id', vehicleId)
      if (updateError) throw updateError

      logger.log('✅ Vehicle received successfully — Days in Yard reset to 0 for new branch (unparked)')

      return {
        success: true,
        vehicleId,
        message: 'Vehicle received successfully'
      }
    } catch (error) {
      logger.error('❌ Receive vehicle error:', error)
      return {
        success: false,
        vehicleId,
        message: 'Failed to receive vehicle',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    } finally {
      setLoading(false)
    }
  }, [user])

  // Return from external garage
  // ✅ FIX: Resets createdAt + checkInTime so "Days in Yard" restarts from 0.
  //         Without this, a vehicle at a garage for 3 weeks would come back still
  //         showing 21+ days even though it just arrived back in the yard.
  // Also handles: preserve hire status if vehicle was out on hire when sent to garage.
  // Also handles: auto-complete the associated service booking if one exists.
  // ✨ Phase 2.5a: parkingSpaceId stays null — user manually re-parks the
  //                vehicle on its return. Same logic as quickCheckIn from hire.
  const returnFromGarage = useCallback(async (vehicleId: string): Promise<TransferResult> => {
  if (!user) {
    return {
      success: false,
      vehicleId,
      message: 'User not authenticated',
      error: 'Not authenticated'
    }
  }

  setLoading(true)
  try {
    const userProfile = await userProfileService.getProfile(user.uid)
    const userDisplayName = userProfile?.displayName || user.email || 'Unknown User'

    const { data: vehicleData, error: fetchError } = await supabase
      .from(CHECKED_IN_VEHICLES)
      .select('*')
      .eq('id', vehicleId)
      .maybeSingle()
    if (fetchError) throw fetchError
    if (!vehicleData) {
      throw new Error('Vehicle not found')
    }

    const serviceBookingId = vehicleData.service_booking_id
    const wasOnHire = vehicleData.hire_status === 'Out on Hire'

    logger.log('🏠 Returning vehicle from garage:', {
      vehicleId,
      registration: vehicleData.registration,
      serviceBookingId,
      wasOnHire,
      hireStatus: vehicleData.hire_status
    })

    // ✅ STEP 1: Update vehicle. (Firestore used a writeBatch to update vehicle +
    //    booking atomically; Supabase-js has no client-side multi-row
    //    transaction, so we run the two updates sequentially — same end state.)
    const vehicleUpdate: Record<string, any> = {
      // ✅ FIX: Reset yard clock — vehicle is back in yard fresh from today
      created_at: nowIso(),
      check_in_time: nowIso(),
      // ✨ Phase 2.5a: defensive — vehicle returns unparked, user re-parks manually
      parking_space_id: null,
      // Clear ALL garage + transfer fields
      transfer_status: null,
      source_branch_id: null,
      source_branch_name: null,
      external_garage_id: null,
      external_garage_name: null,
      service_booking_id: null,
      checked_out_to_garage_at: null,
      checked_out_to_garage_by: null,
      checked_out_to_garage_by_name: null,
      target_branch_id: null,
      target_branch_name: null,
      transfer_initiated_at: null,
      transfer_initiated_by: null,
      transfer_initiated_by_name: null,
      returned_from_garage_at: nowIso(),
      returned_from_garage_by: user.uid,
      returned_from_garage_by_name: userDisplayName,
      updated_at: nowIso()
    }

    // ✅ PRESERVE HIRE STATUS — if vehicle was out on hire when sent to garage, keep it that way
    if (wasOnHire) {
      logger.log(`📌 Vehicle ${vehicleData.registration} will remain on hire`)
      // Don't add hireStatus - leave it as 'Out on Hire'
    } else {
      vehicleUpdate.hire_status = 'In Yard'
    }

    const { error: vehicleUpdateError } = await supabase
      .from(CHECKED_IN_VEHICLES)
      .update(vehicleUpdate)
      .eq('id', vehicleId)
    if (vehicleUpdateError) throw vehicleUpdateError

    // Movement timeline: record the garage RETURN, with days-out computed from
    // the original checkout timestamp (fire-and-forget). This is the event the
    // old per-vehicle history was missing.
    {
      const garageName = vehicleData.external_garage_name || 'external garage'
      let daysOut: number | null = null
      if (vehicleData.checked_out_to_garage_at) {
        const out = new Date(vehicleData.checked_out_to_garage_at).getTime()
        if (!isNaN(out)) daysOut = Math.max(0, Math.floor((new Date().getTime() - out) / 86400000))
      }
      activityLogService.log({
        organizationId: vehicleData.organization_id,
        actorId: user.uid,
        actorName: userDisplayName,
        actionType: 'garage_return',
        summary: daysOut != null
          ? `Returned from ${garageName} (${daysOut} day${daysOut === 1 ? '' : 's'} out)`
          : `Returned from ${garageName}`,
        registration: vehicleData.registration,
        entityId: vehicleId,
        branchId: vehicleData.branch_id ?? null,
        details: { garageName, daysOut, serviceBookingId: serviceBookingId ?? null },
      })
    }

    // ✅ STEP 2: Auto-complete service booking (only if it still exists)
    if (serviceBookingId) {
      logger.log(`📋 Checking if service booking ${serviceBookingId} exists...`)
      const { data: bookingRow } = await supabase
        .from(SERVICE_BOOKINGS)
        .select('id')
        .eq('id', serviceBookingId)
        .maybeSingle()

      if (bookingRow) {
        logger.log(`📋 Auto-completing service booking ${serviceBookingId}`)
        const { error: bookingUpdateError } = await supabase
          .from(SERVICE_BOOKINGS)
          .update({
            status: 'completed',
            completed_from_dashboard: true,
            completed_at: nowIso(),
            completed_by: user.uid,
            completed_by_name: userDisplayName,
            updated_at: nowIso()
          })
          .eq('id', serviceBookingId)
        if (bookingUpdateError) throw bookingUpdateError
      } else {
        logger.log(`⚠️ Service booking ${serviceBookingId} not found - skipping (already deleted)`)
      }
    }

    logger.log(`✅ Vehicle returned from garage — Days in Yard reset to 0, unparked${wasOnHire ? ' (hire status preserved)' : ''}`)
    if (serviceBookingId) {
      logger.log(`✅ Service booking auto-completed`)
    }

    return {
      success: true,
      vehicleId,
      message: wasOnHire
        ? 'Vehicle returned from garage and restored to hire status'
        : 'Vehicle returned from garage successfully'
    }
  } catch (error) {
    logger.error('❌ Return from garage error:', error)
    return {
      success: false,
      vehicleId,
      message: 'Failed to return vehicle from garage',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  } finally {
    setLoading(false)
  }
}, [user])

  return {
    loading,
    initiateCheckout,
    cancelTransfer,
    receiveVehicle,
    returnFromGarage
  }
}
