// src/lib/services/transferService.ts — SUPABASE re-implementation.
// Business logic for vehicle transfers and external garage checkouts.
//
// ⚠️ Data-layer swap: every EXPORT and method SIGNATURE below is kept identical
// to the original Firestore version — only the INTERNALS change. Firestore
// doc()/getDoc()/updateDoc() calls become Supabase queries against
// `checked_in_vehicles` (the table already carries every transfer / garage
// column — see 0001_core_schema.sql). RLS scopes every query to the caller's
// org. The try/catch + TransferResult shape and logger.error behaviour mirror
// the original exactly.

import { supabase } from '@/lib/supabaseClient'
import { TransferStatus, TransferResult } from '@/types/transfer'
import { logger } from '@/lib/logger'

const CHECKED_IN_VEHICLES_TABLE = 'checked_in_vehicles'

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
      // Verify vehicle exists (and read its registration for the message)
      const { data: vehicleData, error: fetchError } = await supabase
        .from(CHECKED_IN_VEHICLES_TABLE)
        .select('registration')
        .eq('id', vehicleId)
        .maybeSingle()
      if (fetchError) throw fetchError
      if (!vehicleData) {
        throw new Error('Vehicle not found')
      }

      const registration = vehicleData.registration

      const { error: updateError } = await supabase
        .from(CHECKED_IN_VEHICLES_TABLE)
        .update({
          transfer_status: 'in_transit' as TransferStatus,
          target_branch_id: targetBranchId,
          target_branch_name: targetBranchName,
          transfer_initiated_at: new Date().toISOString(),
          transfer_initiated_by: userId,
          transfer_initiated_by_name: userName,
          last_edit_log: {
            action: `Vehicle marked for transfer to ${targetBranchName}`,
            editedBy: userId,
            editedByName: userName,
            editedAt: new Date().toISOString()
          }
        })
        .eq('id', vehicleId)
      if (updateError) throw updateError

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
      const { data: vehicleData, error: fetchError } = await supabase
        .from(CHECKED_IN_VEHICLES_TABLE)
        .select('registration')
        .eq('id', vehicleId)
        .maybeSingle()
      if (fetchError) throw fetchError
      if (!vehicleData) {
        throw new Error('Vehicle not found')
      }

      const registration = vehicleData.registration

      const { error: updateError } = await supabase
        .from(CHECKED_IN_VEHICLES_TABLE)
        .update({
          transfer_status: null,
          target_branch_id: null,
          target_branch_name: null,
          transfer_initiated_at: null,
          transfer_initiated_by: null,
          transfer_initiated_by_name: null,
          last_edit_log: {
            action: `Transfer cancelled - vehicle returned to yard`,
            editedBy: userId,
            editedByName: userName,
            editedAt: new Date().toISOString()
          }
        })
        .eq('id', vehicleId)
      if (updateError) throw updateError

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
      const { data: vehicleData, error: fetchError } = await supabase
        .from(CHECKED_IN_VEHICLES_TABLE)
        .select('registration, branch_id')
        .eq('id', vehicleId)
        .maybeSingle()
      if (fetchError) throw fetchError
      if (!vehicleData) {
        throw new Error('Vehicle not found')
      }

      const registration = vehicleData.registration
      const sourceBranchId = vehicleData.branch_id

      const { error: updateError } = await supabase
        .from(CHECKED_IN_VEHICLES_TABLE)
        .update({
          branch_id: newBranchId,
          transfer_status: null,
          target_branch_id: null,
          target_branch_name: null,
          transfer_initiated_at: null,
          transfer_initiated_by: null,
          transfer_initiated_by_name: null,
          last_edit_log: {
            action: `Vehicle received from branch ${sourceBranchId}`,
            editedBy: userId,
            editedByName: userName,
            editedAt: new Date().toISOString()
          }
        })
        .eq('id', vehicleId)
      if (updateError) throw updateError

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
      const { data: vehicleData, error: fetchError } = await supabase
        .from(CHECKED_IN_VEHICLES_TABLE)
        .select('registration')
        .eq('id', vehicleId)
        .maybeSingle()
      if (fetchError) throw fetchError
      if (!vehicleData) {
        throw new Error('Vehicle not found')
      }

      const registration = vehicleData.registration

      const { error: updateError } = await supabase
        .from(CHECKED_IN_VEHICLES_TABLE)
        .update({
          transfer_status: 'at_external_garage' as TransferStatus,
          external_garage_name: garageName,
          service_booking_id: serviceBookingId,
          checked_out_to_garage_at: new Date().toISOString(),
          checked_out_to_garage_by: userId,
          checked_out_to_garage_by_name: userName,
          last_edit_log: {
            action: `Vehicle checked out to ${garageName}`,
            editedBy: userId,
            editedByName: userName,
            editedAt: new Date().toISOString()
          }
        })
        .eq('id', vehicleId)
      if (updateError) throw updateError

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
      const { data: vehicleData, error: fetchError } = await supabase
        .from(CHECKED_IN_VEHICLES_TABLE)
        .select('registration, external_garage_name')
        .eq('id', vehicleId)
        .maybeSingle()
      if (fetchError) throw fetchError
      if (!vehicleData) {
        throw new Error('Vehicle not found')
      }

      const registration = vehicleData.registration
      const garageName = vehicleData.external_garage_name || 'external garage'

      const { error: updateError } = await supabase
        .from(CHECKED_IN_VEHICLES_TABLE)
        .update({
          transfer_status: null,
          external_garage_name: null,
          service_booking_id: null,
          checked_out_to_garage_at: null,
          checked_out_to_garage_by: null,
          checked_out_to_garage_by_name: null,
          last_edit_log: {
            action: `Vehicle returned from ${garageName}`,
            editedBy: userId,
            editedByName: userName,
            editedAt: new Date().toISOString()
          }
        })
        .eq('id', vehicleId)
      if (updateError) throw updateError

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
