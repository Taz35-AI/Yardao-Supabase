// src/lib/services/transferService.ts
// Business logic for vehicle transfers and external garage checkouts

import { 
  doc, 
  updateDoc, 
  serverTimestamp,
  Timestamp,
  getDoc
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { TransferStatus, TransferResult } from '@/types/transfer'
import { logger } from '@/lib/logger'

const CHECKED_IN_VEHICLES_COLLECTION = 'checkedInVehicles'

export const transferService = {
  /**
   * Initiate branch transfer
   * Vehicle stays with source branch but marked as "in_transit"
   */
  async initiateBranchTransfer(
    vehicleId: string,
    targetBranchId: string,
    targetBranchName: string,
    userId: string,
    userName: string
  ): Promise<TransferResult> {
    try {
      const vehicleRef = doc(db, CHECKED_IN_VEHICLES_COLLECTION, vehicleId)
      
      // Verify vehicle exists
      const vehicleSnap = await getDoc(vehicleRef)
      if (!vehicleSnap.exists()) {
        throw new Error('Vehicle not found')
      }

      const vehicleData = vehicleSnap.data()
      const registration = vehicleData.registration

      await updateDoc(vehicleRef, {
        transferStatus: 'in_transit' as TransferStatus,
        targetBranchId,
        targetBranchName,
        transferInitiatedAt: serverTimestamp(),
        transferInitiatedBy: userId,
        transferInitiatedByName: userName,
        updatedAt: serverTimestamp(),
        lastEditLog: {
          action: `Vehicle marked for transfer to ${targetBranchName}`,
          editedBy: userId,
          editedByName: userName,
          editedAt: new Date()
        }
      })

      return {
        success: true,
        vehicleId,
        message: `Vehicle ${registration} marked for transfer to ${targetBranchName}`
      }
    } catch (error) {
      logger.error('Error initiating branch transfer:', error)
      return {
        success: false,
        vehicleId,
        message: 'Failed to initiate transfer',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  },

  /**
   * Cancel branch transfer
   * Clear transfer fields and return to normal yard status
   */
  async cancelBranchTransfer(
    vehicleId: string,
    userId: string,
    userName: string
  ): Promise<TransferResult> {
    try {
      const vehicleRef = doc(db, CHECKED_IN_VEHICLES_COLLECTION, vehicleId)
      
      const vehicleSnap = await getDoc(vehicleRef)
      if (!vehicleSnap.exists()) {
        throw new Error('Vehicle not found')
      }

      const vehicleData = vehicleSnap.data()
      const registration = vehicleData.registration

      await updateDoc(vehicleRef, {
        transferStatus: null,
        targetBranchId: null,
        targetBranchName: null,
        transferInitiatedAt: null,
        transferInitiatedBy: null,
        transferInitiatedByName: null,
        updatedAt: serverTimestamp(),
        lastEditLog: {
          action: `Transfer cancelled - vehicle returned to yard`,
          editedBy: userId,
          editedByName: userName,
          editedAt: new Date()
        }
      })

      return {
        success: true,
        vehicleId,
        message: `Transfer cancelled for ${registration}`
      }
    } catch (error) {
      logger.error('Error cancelling transfer:', error)
      return {
        success: false,
        vehicleId,
        message: 'Failed to cancel transfer',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  },

  /**
   * Receive vehicle at destination branch
   * Changes branchId and clears transfer fields
   */
  async receiveVehicleTransfer(
    vehicleId: string,
    newBranchId: string,
    userId: string,
    userName: string
  ): Promise<TransferResult> {
    try {
      const vehicleRef = doc(db, CHECKED_IN_VEHICLES_COLLECTION, vehicleId)
      
      const vehicleSnap = await getDoc(vehicleRef)
      if (!vehicleSnap.exists()) {
        throw new Error('Vehicle not found')
      }

      const vehicleData = vehicleSnap.data()
      const registration = vehicleData.registration
      const sourceBranchId = vehicleData.branchId

      await updateDoc(vehicleRef, {
        branchId: newBranchId,
        transferStatus: null,
        targetBranchId: null,
        targetBranchName: null,
        transferInitiatedAt: null,
        transferInitiatedBy: null,
        transferInitiatedByName: null,
        updatedAt: serverTimestamp(),
        lastEditLog: {
          action: `Vehicle received from branch ${sourceBranchId}`,
          editedBy: userId,
          editedByName: userName,
          editedAt: new Date()
        }
      })

      return {
        success: true,
        vehicleId,
        message: `Vehicle ${registration} successfully received`
      }
    } catch (error) {
      logger.error('Error receiving vehicle:', error)
      return {
        success: false,
        vehicleId,
        message: 'Failed to receive vehicle',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  },

  /**
   * Mark vehicle as checked out to external garage
   * Called after service booking is created
   */
  async checkoutToExternalGarage(
    vehicleId: string,
    garageName: string,
    serviceBookingId: string,
    userId: string,
    userName: string
  ): Promise<TransferResult> {
    try {
      const vehicleRef = doc(db, CHECKED_IN_VEHICLES_COLLECTION, vehicleId)
      
      const vehicleSnap = await getDoc(vehicleRef)
      if (!vehicleSnap.exists()) {
        throw new Error('Vehicle not found')
      }

      const vehicleData = vehicleSnap.data()
      const registration = vehicleData.registration

      await updateDoc(vehicleRef, {
        transferStatus: 'at_external_garage' as TransferStatus,
        externalGarageName: garageName,
        serviceBookingId,
        checkedOutToGarageAt: serverTimestamp(),
        checkedOutToGarageBy: userId,
        checkedOutToGarageByName: userName,
        updatedAt: serverTimestamp(),
        lastEditLog: {
          action: `Vehicle checked out to ${garageName}`,
          editedBy: userId,
          editedByName: userName,
          editedAt: new Date()
        }
      })

      return {
        success: true,
        vehicleId,
        message: `Vehicle ${registration} checked out to ${garageName}`
      }
    } catch (error) {
      logger.error('Error checking out to garage:', error)
      return {
        success: false,
        vehicleId,
        message: 'Failed to checkout to garage',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  },

  /**
   * Return vehicle from external garage
   * Clear garage fields and return to normal yard status
   */
  async returnFromExternalGarage(
    vehicleId: string,
    userId: string,
    userName: string
  ): Promise<TransferResult> {
    try {
      const vehicleRef = doc(db, CHECKED_IN_VEHICLES_COLLECTION, vehicleId)
      
      const vehicleSnap = await getDoc(vehicleRef)
      if (!vehicleSnap.exists()) {
        throw new Error('Vehicle not found')
      }

      const vehicleData = vehicleSnap.data()
      const registration = vehicleData.registration
      const garageName = vehicleData.externalGarageName || 'external garage'

      await updateDoc(vehicleRef, {
        transferStatus: null,
        externalGarageName: null,
        serviceBookingId: null,
        checkedOutToGarageAt: null,
        checkedOutToGarageBy: null,
        checkedOutToGarageByName: null,
        updatedAt: serverTimestamp(),
        lastEditLog: {
          action: `Vehicle returned from ${garageName}`,
          editedBy: userId,
          editedByName: userName,
          editedAt: new Date()
        }
      })

      return {
        success: true,
        vehicleId,
        message: `Vehicle ${registration} returned from ${garageName}`
      }
    } catch (error) {
      logger.error('Error returning from garage:', error)
      return {
        success: false,
        vehicleId,
        message: 'Failed to return vehicle',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}