// src/hooks/useVehicleTransfers.ts
// Vehicle transfer operations hook
// ✅ FIXED: Corrected function signature to match actual usage
// ✅ FIXED: receiveVehicle now properly clears ALL transfer status fields
// ✅ FIXED: Uses deleteField() instead of null/undefined to avoid Firebase errors
// ✅ FIXED: Branch transfers don't set external garage fields at all
// ✅ SURGICALLY ADDED: serviceBookingId support for external garage checkouts
// ✅ SURGICALLY ADDED: sourceBranchId/sourceBranchName for proper display on receiving end
// ✅ FIX: receiveVehicle now resets createdAt + checkInTime so "Days in Yard" restarts
//         when a vehicle arrives at a new branch (was counting from original check-in date)
// ✅ FIX: returnFromGarage now resets createdAt + checkInTime so "Days in Yard" restarts
//         when a vehicle returns from an external garage (same bug, same fix)
// ✨ PHASE 2.5a: parkingSpaceId is now cleared on EVERY checkout/transfer/return
//                path so the yard layout never holds a ghost reference to a
//                vehicle that has left the yard or moved branches.

'use client'

import { useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { doc, updateDoc, serverTimestamp, getDoc, deleteField, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { userProfileService } from '@/lib/firestore'
import type { CheckoutDestination, TransferResult } from '@/types/transfer'
import { logger } from '@/lib/logger'

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

      const vehicleRef = doc(db, 'checkedInVehicles', vehicleId)
      
      // Get current vehicle data for logging
      const vehicleSnap = await getDoc(vehicleRef)
      if (!vehicleSnap.exists()) {
        throw new Error('Vehicle not found')
      }
      const vehicleData = vehicleSnap.data()
      
      if (destination.type === 'branch_transfer') {
        logger.log('🚚 BRANCH TRANSFER:', {
          vehicleId,
          registration: vehicleData.registration,
          from: vehicleData.branchId,
          fromName: destination.sourceBranchName,
          to: destination.branchId,
          toName: destination.branchName,
          parkingSpaceWasSet: !!vehicleData.parkingSpaceId,
          setting: {
            transferStatus: 'in_transit',
            sourceBranchId: vehicleData.branchId,
            sourceBranchName: destination.sourceBranchName,
            targetBranchId: destination.branchId,
            targetBranchName: destination.branchName
          }
        })

        // ✅ FIXED: Branch transfer - ONLY set branch transfer fields, clear any existing external garage fields
        // ⚠️ createdAt intentionally NOT reset here — vehicle hasn't physically moved yet.
        //    The reset happens in receiveVehicle() when the destination branch confirms arrival.
        // ✨ Phase 2.5a: parkingSpaceId cleared — vehicle is leaving this branch's yard.
        await updateDoc(vehicleRef, {
          // Set branch transfer fields
          transferStatus: 'in_transit',
          sourceBranchId: vehicleData.branchId,
          sourceBranchName: destination.sourceBranchName || 'Unknown Branch',
          targetBranchId: destination.branchId,
          targetBranchName: destination.branchName,
          transferInitiatedAt: serverTimestamp(),
          transferInitiatedBy: user.uid,
          transferInitiatedByName: userDisplayName,
          // ✨ Phase 2.5a: free up the parking space at the source branch
          parkingSpaceId: null,
          // Clear any existing external garage fields (in case vehicle was previously at garage)
          externalGarageId: deleteField(),
          externalGarageName: deleteField(),
          serviceBookingId: deleteField(),
          checkedOutToGarageAt: deleteField(),
          checkedOutToGarageBy: deleteField(),
          checkedOutToGarageByName: deleteField(),
          updatedAt: serverTimestamp()
        })

        logger.log('✅ Branch transfer initiated successfully (parking space released)')

        return {
          success: true,
          vehicleId,
          message: `Vehicle transferred to ${destination.branchName}`
        }
      } else {
        logger.log('🔧 EXTERNAL GARAGE:', {
          vehicleId,
          registration: vehicleData.registration,
          branchId: vehicleData.branchId,
          garageName: destination.garageName,
          serviceBookingId: destination.serviceBookingId,
          parkingSpaceWasSet: !!vehicleData.parkingSpaceId,
          setting: {
            transferStatus: 'at_external_garage',
            externalGarageId: destination.garageId,
            externalGarageName: destination.garageName,
            serviceBookingId: destination.serviceBookingId
          }
        })

        // ✅ SURGICALLY FIXED: External garage - Set garage fields INCLUDING serviceBookingId, clear any existing branch transfer fields
        // ⚠️ createdAt intentionally NOT reset here — vehicle is still "checked in", just marked at_external_garage.
        //    The reset happens in returnFromGarage() when the vehicle physically comes back.
        // ✨ Phase 2.5a: parkingSpaceId cleared — vehicle is no longer in the yard.
        await updateDoc(vehicleRef, {
          // Set external garage fields
          transferStatus: 'at_external_garage',
          externalGarageId: destination.garageId || '',
          externalGarageName: destination.garageName || 'External Garage',
          serviceBookingId: destination.serviceBookingId || null,
          checkedOutToGarageAt: serverTimestamp(),
          checkedOutToGarageBy: user.uid,
          checkedOutToGarageByName: userDisplayName,
          // ✨ Phase 2.5a: free up the parking space — vehicle is at external garage
          parkingSpaceId: null,
          // Clear any existing branch transfer fields (in case vehicle was previously in transit)
          sourceBranchId: deleteField(),
          sourceBranchName: deleteField(),
          targetBranchId: deleteField(),
          targetBranchName: deleteField(),
          transferInitiatedAt: deleteField(),
          transferInitiatedBy: deleteField(),
          transferInitiatedByName: deleteField(),
          updatedAt: serverTimestamp()
        })

        logger.log('✅ External garage checkout completed successfully (parking space released)')

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
      const vehicleRef = doc(db, 'checkedInVehicles', vehicleId)
      
      logger.log('❌ Cancelling transfer for vehicle:', vehicleId)
      
      // ✅ CRITICAL: Use deleteField() to remove ALL transfer-related fields from Firestore
      // ✨ Phase 2.5a: parkingSpaceId already cleared at initiateCheckout time —
      //                we leave it null so the user manually re-parks if they want.
      await updateDoc(vehicleRef, {
        transferStatus: deleteField(),
        sourceBranchId: deleteField(),
        sourceBranchName: deleteField(),
        targetBranchId: deleteField(),
        targetBranchName: deleteField(),
        transferInitiatedAt: deleteField(),
        transferInitiatedBy: deleteField(),
        transferInitiatedByName: deleteField(),
        externalGarageId: deleteField(),
        externalGarageName: deleteField(),
        serviceBookingId: deleteField(),
        checkedOutToGarageAt: deleteField(),
        checkedOutToGarageBy: deleteField(),
        checkedOutToGarageByName: deleteField(),
        updatedAt: serverTimestamp()
      })

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

      const vehicleRef = doc(db, 'checkedInVehicles', vehicleId)
      
      // Get current vehicle data to log the transfer
      const vehicleSnap = await getDoc(vehicleRef)
      if (!vehicleSnap.exists()) {
        throw new Error('Vehicle not found')
      }
      
      const vehicleData = vehicleSnap.data()
      
      logger.log('📦 Receiving vehicle:', {
        vehicleId,
        registration: vehicleData.registration,
        from: vehicleData.branchId,
        fromName: vehicleData.sourceBranchName,
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
      
      // ✅ CRITICAL FIX: Update branchId AND use deleteField() to remove ALL transfer fields
      // ✅ FIX: Reset createdAt + checkInTime so Days in Yard restarts at 0 for the new branch
      // ✨ Phase 2.5a: defensive — clear parkingSpaceId. Should already be null
      //                from initiateCheckout, but absolute safety: a parking
      //                space id from the OLD branch is invalid here.
      await updateDoc(vehicleRef, {
        branchId: receivingBranchId,
        // ✅ FIX: Reset yard clock — vehicle is "new" to this branch from today
        createdAt: serverTimestamp(),
        checkInTime: serverTimestamp(),
        // ✨ Phase 2.5a: explicitly null the parking space — the OLD branch's
        //                layout has nothing to do with this branch's layout
        parkingSpaceId: null,
        // ✅ Use deleteField() to completely remove all transfer status fields
        transferStatus: deleteField(),
        sourceBranchId: deleteField(),
        sourceBranchName: deleteField(),
        targetBranchId: deleteField(),
        targetBranchName: deleteField(),
        transferInitiatedAt: deleteField(),
        transferInitiatedBy: deleteField(),
        transferInitiatedByName: deleteField(),
        // Also clear any external garage fields (in case it was at garage before)
        externalGarageId: deleteField(),
        externalGarageName: deleteField(),
        serviceBookingId: deleteField(),
        checkedOutToGarageAt: deleteField(),
        checkedOutToGarageBy: deleteField(),
        checkedOutToGarageByName: deleteField(),
        // Record who received it
        receivedAt: serverTimestamp(),
        receivedBy: user.uid,
        receivedByName: userDisplayName,
        updatedAt: serverTimestamp()
      })

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

    const vehicleRef = doc(db, 'checkedInVehicles', vehicleId)
    const vehicleSnap = await getDoc(vehicleRef)
    
    if (!vehicleSnap.exists()) {
      throw new Error('Vehicle not found')
    }
    
    const vehicleData = vehicleSnap.data()
    const serviceBookingId = vehicleData.serviceBookingId
    const wasOnHire = vehicleData.hireStatus === 'Out on Hire'
    
    logger.log('🏠 Returning vehicle from garage:', {
      vehicleId,
      registration: vehicleData.registration,
      serviceBookingId,
      wasOnHire,
      hireStatus: vehicleData.hireStatus
    })
    
    // ✅ Use batch write to update both vehicle AND service booking atomically
    const batch = writeBatch(db)
    
    // ✅ STEP 1: Update vehicle
    const vehicleUpdate: any = {
      // ✅ FIX: Reset yard clock — vehicle is back in yard fresh from today
      createdAt: serverTimestamp(),
      checkInTime: serverTimestamp(),
      // ✨ Phase 2.5a: defensive — vehicle returns unparked, user re-parks manually
      parkingSpaceId: null,
      // Clear ALL garage + transfer fields
      transferStatus: deleteField(),
      sourceBranchId: deleteField(),
      sourceBranchName: deleteField(),
      externalGarageId: deleteField(),
      externalGarageName: deleteField(),
      serviceBookingId: deleteField(),
      checkedOutToGarageAt: deleteField(),
      checkedOutToGarageBy: deleteField(),
      checkedOutToGarageByName: deleteField(),
      targetBranchId: deleteField(),
      targetBranchName: deleteField(),
      transferInitiatedAt: deleteField(),
      transferInitiatedBy: deleteField(),
      transferInitiatedByName: deleteField(),
      returnedFromGarageAt: serverTimestamp(),
      returnedFromGarageBy: user.uid,
      returnedFromGarageByName: userDisplayName,
      updatedAt: serverTimestamp()
    }
    
    // ✅ PRESERVE HIRE STATUS — if vehicle was out on hire when sent to garage, keep it that way
    if (wasOnHire) {
      logger.log(`📌 Vehicle ${vehicleData.registration} will remain on hire`)
      // Don't add hireStatus - leave it as 'Out on Hire'
    } else {
      vehicleUpdate.hireStatus = 'In Yard'
    }
    
    batch.update(vehicleRef, vehicleUpdate)
    
    // ✅ STEP 2: Auto-complete service booking (only if it still exists)
    if (serviceBookingId) {
      logger.log(`📋 Checking if service booking ${serviceBookingId} exists...`)
      const bookingRef = doc(db, 'serviceBookings', serviceBookingId)
      const bookingSnap = await getDoc(bookingRef)
      
      if (bookingSnap.exists()) {
        logger.log(`📋 Auto-completing service booking ${serviceBookingId}`)
        batch.update(bookingRef, {
          status: 'completed',
          completedFromDashboard: true,
          completedAt: serverTimestamp(),
          completedBy: user.uid,
          completedByName: userDisplayName,
          updatedAt: serverTimestamp()
        })
      } else {
        logger.log(`⚠️ Service booking ${serviceBookingId} not found - skipping (already deleted)`)
      }
    }
    
    await batch.commit()
    
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