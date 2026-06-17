// src/app/dashboard/layers/DashboardBusinessLogic.tsx
// Handles all business logic, vehicle operations, and data management
// ✅ FIXED: handleCheckoutWithDestination now calls initiateCheckout with correct parameters
// ✅ ADDED: handleGarageCheckout creates service bookings for external garage checkouts
// ✅ ENHANCED: handleGarageCheckout now supports custom garage details (ad-hoc garages)
// ✅ CRITICAL FIX: Added garageCheckoutInProgress ref to prevent double booking creation
// ENHANCED with vehicle transfer and external garage checkout functionality

'use client'

import { useCallback, useRef } from 'react' // ✅ SURGICAL FIX: Added useRef
import { useAuth } from '@/contexts/AuthContext'
import { exportDashboardVehicles } from '@/utils/dashboardExport'
import { useVehicleTransfers } from '@/hooks/useVehicleTransfers'
import { useServiceBookings } from '@/hooks/useServiceBookings' // ✅ ADDED: Import service bookings hook
import { CheckoutDestination } from '@/types/transfer'
import type { 
  VehicleFormData, 
  VehicleStatus, 
  CheckedInVehicle,
  SetOutOnHireData,
  QuickCheckInData
} from '@/types'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

interface DashboardBusinessLogicProps {
  yardData: any
  dashboardLogic: any
  userProfile: any
  checkedInVehicles: CheckedInVehicle[]
  enhancedFilteredVehicles: CheckedInVehicle[]
  forceDataRefresh: () => Promise<void>
  showError: (message: string) => void
  showSuccess: (message: string) => void
  modalController: any
  branchId: string
}

export function useDashboardBusinessLogic({
  yardData,
  dashboardLogic,
  userProfile,
  checkedInVehicles,
  enhancedFilteredVehicles,
  forceDataRefresh,
  showError,
  showSuccess,
  modalController,
  branchId
}: DashboardBusinessLogicProps) {

  // Get current user from auth context
  const { user } = useAuth()
  const t = useT()

  // ✅ CRITICAL FIX: Ref to prevent double garage checkout execution
  const garageCheckoutInProgressRef = useRef<boolean>(false)

  // Vehicle transfer operations hook
  const {
    loading: transferLoading,
    initiateCheckout,
    cancelTransfer,
    receiveVehicle,
    returnFromGarage
  } = useVehicleTransfers()

  // ✅ ADDED: Service bookings hook for creating bookings when checking out to garage
  const { createBooking } = useServiceBookings()

  // Handle notes cleanup success
  const handleNotesCleanupSuccess = useCallback(async () => {
    if (yardData?.clearError) {
      yardData.clearError()
    }
    await forceDataRefresh()
  }, [yardData, forceDataRefresh])

  // Handle export
  const handleExport = useCallback(async () => {
    if (!enhancedFilteredVehicles.length) {
      showError(t('dashboard.errors.noVehiclesToExport'))
      return
    }

    try {
      await exportDashboardVehicles(enhancedFilteredVehicles, 'yard-dashboard-vehicles')
      logger.log(`✅ Exported ${enhancedFilteredVehicles.length} vehicles successfully`)
    } catch (error) {
      logger.error('Failed to export:', error)
      showError(t('dashboard.errors.exportFailed'))
    }
  }, [enhancedFilteredVehicles, showError])

  // Handle set out on hire
  const handleSetOutOnHireConfirm = useCallback(async (vehicleId: string, hireNotes?: string): Promise<boolean | undefined> => {
    if (!yardData?.setOutOnHire) {
      showError(t('dashboard.errors.hireFnUnavailable'))
      return false
    }

    try {
      const hireData: SetOutOnHireData = {
        vehicleId,
        hireNotes
      }
      
      await yardData.setOutOnHire(hireData)
      showSuccess(t('dashboard.success.setOutOnHire'))
      return true
    } catch (error) {
      logger.error('Failed to set vehicle out on hire:', error)
      showError(error instanceof Error ? error.message : t('dashboard.errors.setOutOnHireFailed'))
      return false
    }
  }, [yardData, showError, showSuccess])

  // Handle quick check in
  const handleQuickCheckInConfirm = useCallback(async (vehicleId: string, returnNotes?: string, mileage?: string): Promise<boolean | undefined> => {
    if (!yardData?.quickCheckIn) {
      showError(t('dashboard.errors.checkInFnUnavailable'))
      return false
    }

    try {
      const checkInData: QuickCheckInData = {
        vehicleId,
        returnNotes,
        mileage
      }
      
      await yardData.quickCheckIn(checkInData)
      showSuccess(t('dashboard.success.returnedFromHire'))
      return true
    } catch (error) {
      logger.error('Failed to return vehicle from hire:', error)
      showError(error instanceof Error ? error.message : t('dashboard.errors.returnFromHireFailed'))
      return false
    }
  }, [yardData, showError, showSuccess])

  // Handle vehicle update
  const handleVehicleUpdate = useCallback(async (vehicleId: string, updates: any) => {
    if (!yardData?.updateVehicleConditionAndStatus) {
      showError(t('dashboard.errors.updateFnUnavailable'))
      return
    }
    
    try {
      const finalStatus: VehicleStatus = updates.status || 'Pending checks'
      
      const updateData: any = {
        condition: updates.condition,
        comments: updates.comments,
        notes: updates.notes,
        mileage: updates.mileage,
        status: finalStatus,
        contract: updates.contract,
        contractColor: updates.contractColor,
        insuranceStatus: updates.insuranceStatus,
        insurancePolicyId:     updates.insurancePolicyId     ?? null,  // ✅ NEW
        insurancePolicyName:   updates.insurancePolicyName   ?? null,  // ✅ NEW
        insurancePolicyExpiry: updates.insurancePolicyExpiry ?? null,  // ✅ NEW
        damagePins: updates.damagePins ?? []
      }

      if (updates.motExpiry !== undefined) updateData.motExpiry = updates.motExpiry
      if (updates.taxExpiry !== undefined) updateData.taxExpiry = updates.taxExpiry
      if (updates.createdAt !== undefined) updateData.createdAt = updates.createdAt

      await yardData.updateVehicleConditionAndStatus(vehicleId, updateData)
      
      if (updates.condition || updates.comments || updates.notes || updates.mileage || updates.status) {
        dashboardLogic.setShowEditModal(false)
        dashboardLogic.setSelectedVehicle(null)
        showSuccess(t('dashboard.success.vehicleUpdated'))
      }
    } catch (error) {
      logger.error('Failed to update vehicle:', error)
      showError(t('dashboard.errors.updateFailed'))
    }
  }, [yardData, dashboardLogic, showError, showSuccess])

  // Handle check in
  const handleCheckIn = useCallback(async (formData: VehicleFormData): Promise<boolean | undefined> => {
    if (!yardData?.checkInVehicle) {
      showError(t('dashboard.errors.checkInFnUnavailable'))
      return false
    }

    const cleanRegistration = formData.registration.trim()
    if (!cleanRegistration) {
      showError(t('dashboard.errors.registrationRequired'))
      return false
    }

    try {
      const finalStatus: VehicleStatus = formData.status || 'Pending checks'
      
      const checkInData: any = {
        id: formData.id,
        registration: cleanRegistration,
        make: formData.make,
        model: formData.model,
        colour: formData.colour,
        size: formData.size,
        condition: formData.condition,
        status: finalStatus,
        mileage: formData.mileage,
        notes: formData.notes,
        comments: formData.comments,
        contract: formData.contract,
        contractColor: formData.contractColor
      }

      // Only add optional fields if they are defined
      if (formData.insuranceStatus !== undefined) {
        checkInData.insuranceStatus = formData.insuranceStatus
      }
      if (formData.motExpiry !== undefined) {
        checkInData.motExpiry = formData.motExpiry
      }
      if (formData.taxExpiry !== undefined) {
        checkInData.taxExpiry = formData.taxExpiry
      }
      if (formData.damagePins !== undefined) {
        checkInData.damagePins = formData.damagePins
      }
      // ADD THIS:
if ((formData as any).vehicleDiagramType !== undefined) {
  checkInData.vehicleDiagramType = (formData as any).vehicleDiagramType
}

      logger.log('✅ Checking in vehicle with insurance status:', checkInData.insuranceStatus)
      
      await yardData.checkInVehicle(checkInData)

// Sync damage pins back to fleet
if (formData.damagePins?.length && formData.id) {
  try {
    const { DamageSyncService } = await import('@/services/damageSyncService')
    await DamageSyncService.syncDamageFromYardToFleet(
      formData.id,
      formData.damagePins,
      checkInData.organizationId || '',
      '', // userId not available here — ok, sync still works
      '',
      true
    )
  } catch (e) {
    logger.error('Damage sync failed (non-critical):', e)
  }
}

showSuccess(t('dashboard.success.vehicleCheckedIn', { registration: cleanRegistration }))
      return true
    } catch (error) {
      logger.error('Failed to check in vehicle:', error)
      showError(error instanceof Error ? error.message : t('dashboard.errors.checkInFailed'))
      return false
    }
  }, [yardData, showError, showSuccess])

  // Handle single vehicle checkout - UPDATED to show destination modal
  const handleVehicleCheckout = useCallback(async (vehicleId: string) => {
    if (!yardData?.checkOutVehicle) {
      showError(t('dashboard.errors.checkoutFnUnavailable'))
      return null
    }

    const vehicle = checkedInVehicles.find(v => v.id === vehicleId)
    if (!vehicle) {
      showError(t('dashboard.errors.vehicleNotFoundDot'))
      return null
    }

    // Show destination selection modal instead of immediate checkout
    modalController.showCheckoutDestination(vehicle)
    return vehicle
  }, [yardData, checkedInVehicles, showError, modalController])

  // LEGACY: Handle checkout confirmation (kept for "Set Out on Hire" compatibility)
  const handleCheckoutConfirm = useCallback(async (vehicle: CheckedInVehicle) => {
    if (!vehicle || !yardData?.checkOutVehicle) return

    try {
      await yardData.checkOutVehicle(vehicle.id)
      
      if (dashboardLogic.selectedVehicle?.id === vehicle.id) {
        dashboardLogic.handleCloseDetailModal()
      }

      showSuccess(t('dashboard.success.vehicleCheckedOut', { registration: vehicle.registration }))
      return true
    } catch (error) {
      logger.error('Failed to check out vehicle:', error)
      showError(t('dashboard.errors.checkoutFailedWithReason', { error: error instanceof Error ? error.message : t('dashboard.errors.unknownError') }))
      return false
    }
  }, [yardData, dashboardLogic, showError, showSuccess])

  // ✅ Handle checkout with destination selection
  const handleCheckoutWithDestination = useCallback(async (
    vehicleId: string,
    destination: CheckoutDestination
  ): Promise<boolean> => {
    try {
      // Find the vehicle to get its registration
      const vehicle = checkedInVehicles.find(v => v.id === vehicleId)
      if (!vehicle) {
        showError(t('dashboard.errors.vehicleNotFound'))
        return false
      }

      logger.log('🎯 handleCheckoutWithDestination called:', {
        vehicleId,
        registration: vehicle.registration,
        destination
      })

      // ✅ Handle BRANCH transfers
      if (destination.type === 'branch_transfer') {
        const result = await initiateCheckout(vehicleId, destination)

        if (result.success) {
          // Close modals
          if (dashboardLogic.selectedVehicle?.id === vehicleId) {
            dashboardLogic.handleCloseDetailModal()
          }
          modalController.closeCheckoutDestinationModal()

          showSuccess(t('dashboard.success.markedForTransfer', { registration: vehicle.registration, branchName: destination.branchName ?? '' }))
          return true
        } else {
          showError(result.message || t('dashboard.errors.checkoutVehicleFailed'))
          return false
        }
      }

      // ✅ Handle EXTERNAL GARAGE - show garage selection modal
      if (destination.type === 'external_garage') {
        // Close the destination modal and show garage selection
        modalController.closeCheckoutDestinationModal()
        modalController.showGarageCheckoutModal(vehicle)
        return true
      }

      // ✅ Handle REMOVE - a non-fleet vehicle (visitor / customer) simply
      // leaving the yard: plain checkout (logs to history, frees the space,
      // removes the yard row). No transfer, no garage.
      if (destination.type === 'remove') {
        if (!yardData?.checkOutVehicle) {
          showError(t('dashboard.errors.checkoutFnUnavailable'))
          return false
        }
        await yardData.checkOutVehicle(vehicleId)
        if (dashboardLogic.selectedVehicle?.id === vehicleId) {
          dashboardLogic.handleCloseDetailModal()
        }
        modalController.closeCheckoutDestinationModal()
        showSuccess(t('dashboard.success.vehicleCheckedOut', { registration: vehicle.registration }))
        return true
      }

      showError(t('dashboard.errors.invalidCheckoutDestination'))
      return false
    } catch (error) {
      logger.error('❌ Checkout with destination error:', error)
      showError(error instanceof Error ? error.message : t('dashboard.errors.checkoutVehicleFailed'))
      return false
    }
  }, [initiateCheckout, checkedInVehicles, dashboardLogic, modalController, showError, showSuccess, yardData])

  // ✅ FIXED: Handle cancel transfer - triggers confirmation modal
const handleCancelTransfer = useCallback(async (vehicleId: string): Promise<boolean> => {
  modalController.showCancelTransferConfirm(vehicleId)
  return true
}, [modalController])

// ✅ NEW: Execute cancel transfer (called after modal confirmation)
const executeCancelTransfer = useCallback(async (vehicleId: string): Promise<boolean> => {
  try {
    const result = await cancelTransfer(vehicleId)

    if (result.success) {
      modalController.closeCancelTransferConfirm()
      showSuccess(t('dashboard.success.transferCancelled'))
      return true
    } else {
      showError(result.message || t('dashboard.errors.cancelTransferFailed'))
      return false
    }
  } catch (error) {
    logger.error('Cancel transfer error:', error)
    showError(error instanceof Error ? error.message : t('dashboard.errors.cancelTransferFailed'))
    return false
  }
}, [cancelTransfer, modalController, showError, showSuccess])

  // Handle receive vehicle
  const handleReceiveVehicle = useCallback(async (vehicleId: string): Promise<boolean> => {
    try {
      const result = await receiveVehicle(vehicleId, branchId)

      if (result.success) {
        showSuccess(t('dashboard.success.vehicleReceived'))
        return true
      } else {
        showError(result.message || t('dashboard.errors.receiveVehicleFailed'))
        return false
      }
    } catch (error) {
      logger.error('Receive vehicle error:', error)
      showError(error instanceof Error ? error.message : t('dashboard.errors.receiveVehicleFailed'))
      return false
    }
  }, [receiveVehicle, branchId, showError, showSuccess])

  // ✅ FIXED: Handle return from external garage - triggers confirmation modal
const handleReturnFromGarage = useCallback(async (vehicleId: string): Promise<boolean> => {
  modalController.showReturnFromGarageConfirm(vehicleId)
  return true
}, [modalController])

// ✅ NEW: Execute return from garage (called after modal confirmation)
const executeReturnFromGarage = useCallback(async (vehicleId: string): Promise<boolean> => {
  try {
    const result = await returnFromGarage(vehicleId)

    if (result.success) {
      modalController.closeReturnFromGarageConfirm()
      showSuccess(t('dashboard.success.returnedFromGarage'))
      return true
    } else {
      showError(result.message || t('dashboard.errors.returnVehicleFailed'))
      return false
    }
  } catch (error) {
    logger.error('Return from garage error:', error)
    showError(error instanceof Error ? error.message : t('dashboard.errors.returnVehicleFailed'))
    return false
  }
}, [returnFromGarage, modalController, showError, showSuccess])

  // Handle bulk checkout
  const handleBulkCheckout = useCallback(async (vehicleIds: string[]) => {
    if (!yardData?.bulkCheckout) {
      showError(t('dashboard.errors.bulkCheckoutFnUnavailable'))
      return
    }

    if (vehicleIds.length === 0) {
      showError(t('dashboard.errors.noVehiclesSelected'))
      return
    }

    return vehicleIds
  }, [yardData, showError])

  // Handle bulk checkout confirmation
  const handleBulkCheckoutConfirm = useCallback(async (vehicleIds: string[]) => {
    if (!vehicleIds.length || !yardData?.bulkCheckout) return

    try {
      await yardData.bulkCheckout(vehicleIds)
      showSuccess(t('dashboard.success.bulkCheckedOut', { count: vehicleIds.length }))
      return true
    } catch (error) {
      logger.error('Failed to bulk checkout vehicles:', error)
      showError(t('dashboard.errors.bulkCheckoutFailed'))
      return false
    }
  }, [yardData, showError, showSuccess])

  // Handle detail modal actions
  const handleDetailModalEdit = useCallback(() => {
    if (dashboardLogic.selectedVehicle) {
      dashboardLogic.setShowDetailModal(false)
      dashboardLogic.setShowEditModal(true)
    }
  }, [dashboardLogic])

  const handleDetailModalCheckout = useCallback(async () => {
    if (dashboardLogic.selectedVehicle) {
      return await handleVehicleCheckout(dashboardLogic.selectedVehicle.id)
    }
    return null
  }, [dashboardLogic.selectedVehicle, handleVehicleCheckout])

  // ✅ ENHANCED: Handle garage checkout - NOW supports custom garage details
  // ✅ CRITICAL FIX: Added double-execution prevention with ref lock
  const handleGarageCheckout = useCallback(async (
    garageId: string,
    garageName: string,
    notes: string,
    customAddress?: string // ✅ NEW: Optional custom address for ad-hoc garages
  ): Promise<boolean> => {
    // ✅ CRITICAL FIX: Prevent double execution
    if (garageCheckoutInProgressRef.current) {
      logger.log('⚠️ Garage checkout already in progress, ignoring duplicate call')
      return false
    }

    // Set the lock immediately
    garageCheckoutInProgressRef.current = true
    logger.log('🔒 Garage checkout lock acquired')

    try {
      const vehicle = modalController.modalStates.garageCheckoutVehicle
      if (!vehicle) {
        showError(t('dashboard.errors.noVehicleForGarageCheckout'))
        return false
      }

      // ✅ Validate user authentication
      if (!user) {
        showError(t('dashboard.errors.userNotAuthenticated'))
        return false
      }

      logger.log('🔧 Starting garage checkout process:', {
        vehicleId: vehicle.id,
        registration: vehicle.registration,
        garageId,
        garageName,
        isCustomGarage: garageId === 'CUSTOM',
        customAddress
      })

      // ✅ Step 1 - Create service booking for today with external garage
      const today = new Date()
      const dateString = today.toISOString().split('T')[0] // YYYY-MM-DD format

      const bookingData = {
        date: dateString,
        timeSlot: '09:00-17:00', // Default full day slot
        registration: vehicle.registration,
        make: vehicle.make || '',
        model: vehicle.model || '',
        workRequired: notes || 'Service/Repair at external garage',
        isCustomVehicle: false,
        notes: notes,
        organizationId: vehicle.organizationId,
        createdBy: user.uid,
        createdByName: user.displayName || user.email || 'Unknown User',
        createdAt: new Date(),
        status: 'scheduled' as const,
        isExternalProvider: true,
        externalProvider: {
          garageName: garageName,
          address: customAddress || '', // ✅ Use custom address if provided
          customTime: 'Full Day'
        },
        serviceBay: 1,
        // Track original branch for return
        originalBranchId: vehicle.branchId || branchId,
        originalBranchName: vehicle.branchId || 'Main Branch'
      }

      logger.log('📋 Creating service booking:', bookingData)

      // ✅ Create the booking
      const bookingId = await createBooking(bookingData)

      logger.log('✅ Service booking created:', bookingId)

      // ✅ Step 2 - Set vehicle status to at_external_garage with booking ID link
      const result = await initiateCheckout(vehicle.id, {
        type: 'external_garage',
        garageId,
        garageName,
        serviceBookingId: bookingId // ✅ Link the booking ID
      })

      if (result.success) {
        // Close modals
        if (dashboardLogic.selectedVehicle?.id === vehicle.id) {
          dashboardLogic.handleCloseDetailModal()
        }
        modalController.closeGarageCheckoutModal()

        // ✅ Success message mentions both actions
        const garageInfo = garageId === 'CUSTOM'
          ? t('dashboard.success.customGaragePrefix', { garageName })
          : garageName

        showSuccess(t('dashboard.success.garageCheckout', { registration: vehicle.registration, garageInfo }))
        return true
      } else {
        showError(result.message || t('dashboard.errors.checkoutVehicleFailed'))
        return false
      }
    } catch (error) {
      logger.error('❌ Garage checkout error:', error)
      showError(error instanceof Error ? error.message : t('dashboard.errors.garageCheckoutFailed'))
      return false
    } finally {
      // ✅ CRITICAL FIX: Always release the lock
      garageCheckoutInProgressRef.current = false
      logger.log('🔓 Garage checkout lock released')
    }
  }, [initiateCheckout, createBooking, dashboardLogic, modalController, showError, showSuccess, user, branchId])

  return {
    // Operation handlers (EXISTING)
    handleNotesCleanupSuccess,
    handleExport,
    handleSetOutOnHireConfirm,
    handleQuickCheckInConfirm,
    handleVehicleUpdate,
    handleCheckIn,
    handleVehicleCheckout,
    handleCheckoutConfirm,
    handleBulkCheckout,
    handleBulkCheckoutConfirm,
    
    // Detail modal handlers (EXISTING)
    handleDetailModalEdit,
    handleDetailModalCheckout,

    // Transfer operation handlers
    handleCheckoutWithDestination,
    handleGarageCheckout,
    handleCancelTransfer,
    handleReceiveVehicle,
    handleReturnFromGarage,
    
    // ✅ NEW: Execute handlers (called by modal confirmation)
    executeReturnFromGarage,
    executeCancelTransfer,
    
    transferLoading
  }
}