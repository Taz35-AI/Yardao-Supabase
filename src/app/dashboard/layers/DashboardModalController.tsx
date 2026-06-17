// src/app/dashboard/layers/DashboardModalController.tsx
// Manages all modal states and their handlers
// ENHANCED with checkout destination modal for vehicle transfers
// ✅ ADDED: Garage checkout modal for external garage checkouts

import { useState, useCallback } from 'react'
import type { CheckedInVehicle } from '@/types'
import { useT } from '@/lib/i18n'

// Modal state interfaces
interface ModalStates {
  showCleanupConfirm: boolean
  showCheckoutConfirm: boolean
  showBulkCheckoutConfirm: boolean
  showErrorAlert: boolean
  showSuccessAlert: boolean
  errorMessage: string
  successMessage: string
  checkoutVehicle: CheckedInVehicle | null
  bulkCheckoutVehicles: string[]
  // Checkout destination modal
  showCheckoutDestinationModal: boolean
  checkoutDestinationVehicle: CheckedInVehicle | null
  // ✅ NEW: Garage checkout modal
  showGarageCheckoutModal: boolean
  garageCheckoutVehicle: CheckedInVehicle | null
  // ✅ NEW: Transfer confirmation modals
  showReturnFromGarageConfirm: boolean
  showCancelTransferConfirm: boolean
  returnFromGarageVehicleId: string | null
  cancelTransferVehicleId: string | null
}

interface HireModalStates {
  showSetOutOnHireModal: boolean
  showQuickCheckInModal: boolean
  selectedVehicleForHire: CheckedInVehicle | null
  hireActionLoading: boolean
}

interface UIModalStates {
  showNotesCleanupModal: boolean
  showCheckInForm: boolean
  isFiltersExpanded: boolean
}

export function useDashboardModalController() {
  const t = useT()
  // Professional Modal States
  const [modalStates, setModalStates] = useState<ModalStates>({
  showCleanupConfirm: false,
  showCheckoutConfirm: false,
  showBulkCheckoutConfirm: false,
  showErrorAlert: false,
  showSuccessAlert: false,
  errorMessage: '',
  successMessage: '',
  checkoutVehicle: null,
  bulkCheckoutVehicles: [],
  // Checkout destination modal states
  showCheckoutDestinationModal: false,
  checkoutDestinationVehicle: null,
  // ✅ NEW: Garage checkout modal states
  showGarageCheckoutModal: false,
  garageCheckoutVehicle: null,
  // ✅ NEW: Transfer confirmation modal states
  showReturnFromGarageConfirm: false,
  showCancelTransferConfirm: false,
  returnFromGarageVehicleId: null,
  cancelTransferVehicleId: null
})
  
  // Hire modal states
  const [hireModalStates, setHireModalStates] = useState<HireModalStates>({
    showSetOutOnHireModal: false,
    showQuickCheckInModal: false,
    selectedVehicleForHire: null,
    hireActionLoading: false
  })
  
  // UI modal states
  const [uiModalStates, setUIModalStates] = useState<UIModalStates>({
    showNotesCleanupModal: false,
    showCheckInForm: false,
    isFiltersExpanded: false
  })

  // Professional modal helper functions
  const showError = useCallback((message: string) => {
    setModalStates(prev => ({
      ...prev,
      errorMessage: message,
      showErrorAlert: true
    }))
  }, [])

  const showSuccess = useCallback((message: string) => {
    setModalStates(prev => ({
      ...prev,
      successMessage: message,
      showSuccessAlert: true
    }))
  }, [])

  const closeError = useCallback(() => {
    setModalStates(prev => ({
      ...prev,
      showErrorAlert: false,
      errorMessage: ''
    }))
  }, [])

  const closeSuccess = useCallback(() => {
    setModalStates(prev => ({
      ...prev,
      showSuccessAlert: false,
      successMessage: ''
    }))
  }, [])

  // Cleanup modal handlers
  const handleCleanButtonClick = useCallback((userProfile: any) => {
    if (!userProfile?.organizationId) {
      showError(t('dashboard.errors.noOrgId'))
      return
    }
    setModalStates(prev => ({ ...prev, showCleanupConfirm: true }))
  }, [showError])

  const handleCleanupConfirm = useCallback(() => {
    setModalStates(prev => ({ ...prev, showCleanupConfirm: false }))
    setUIModalStates(prev => ({ ...prev, showNotesCleanupModal: true }))
  }, [])

  const closeCleanupConfirm = useCallback(() => {
    setModalStates(prev => ({ ...prev, showCleanupConfirm: false }))
  }, [])

  const closeNotesCleanupModal = useCallback(() => {
    setUIModalStates(prev => ({ ...prev, showNotesCleanupModal: false }))
  }, [])

  // Checkout modal handlers (LEGACY - kept for compatibility)
  const showCheckoutModal = useCallback((vehicle: CheckedInVehicle) => {
    setModalStates(prev => ({
      ...prev,
      checkoutVehicle: vehicle,
      showCheckoutConfirm: true
    }))
  }, [])

  const closeCheckoutModal = useCallback(() => {
    setModalStates(prev => ({
      ...prev,
      showCheckoutConfirm: false,
      checkoutVehicle: null
    }))
  }, [])

  const confirmCheckout = useCallback(() => {
    const vehicle = modalStates.checkoutVehicle
    closeCheckoutModal()
    return vehicle
  }, [modalStates.checkoutVehicle, closeCheckoutModal])

  // Checkout destination modal handlers
  const showCheckoutDestination = useCallback((vehicle: CheckedInVehicle) => {
    setModalStates(prev => ({
      ...prev,
      checkoutDestinationVehicle: vehicle,
      showCheckoutDestinationModal: true
    }))
  }, [])

  const closeCheckoutDestinationModal = useCallback(() => {
    setModalStates(prev => ({
      ...prev,
      showCheckoutDestinationModal: false,
      checkoutDestinationVehicle: null
    }))
  }, [])

  // ✅ NEW: Garage checkout modal handlers
  const showGarageCheckoutModal = useCallback((vehicle: CheckedInVehicle) => {
    setModalStates(prev => ({
      ...prev,
      garageCheckoutVehicle: vehicle,
      showGarageCheckoutModal: true
    }))
  }, [])

  const closeGarageCheckoutModal = useCallback(() => {
    setModalStates(prev => ({
      ...prev,
      showGarageCheckoutModal: false,
      garageCheckoutVehicle: null
    }))
  }, [])

  // Bulk checkout modal handlers
  const showBulkCheckoutModal = useCallback((vehicleIds: string[]) => {
    setModalStates(prev => ({
      ...prev,
      bulkCheckoutVehicles: vehicleIds,
      showBulkCheckoutConfirm: true
    }))
  }, [])

  const closeBulkCheckoutModal = useCallback(() => {
    setModalStates(prev => ({
      ...prev,
      showBulkCheckoutConfirm: false,
      bulkCheckoutVehicles: []
    }))
  }, [])

  const confirmBulkCheckout = useCallback(() => {
    const vehicleIds = modalStates.bulkCheckoutVehicles
    closeBulkCheckoutModal()
    return vehicleIds
  }, [modalStates.bulkCheckoutVehicles, closeBulkCheckoutModal])

  // Hire modal handlers
  const handleSetOutOnHire = useCallback((vehicle: CheckedInVehicle, dashboardLogic: any) => {
    setHireModalStates(prev => ({
      ...prev,
      selectedVehicleForHire: vehicle,
      showSetOutOnHireModal: true
    }))
    
    if (dashboardLogic.showDetailModal) {
      dashboardLogic.setShowDetailModal(false)
    }
    if (dashboardLogic.showEditModal) {
      dashboardLogic.setShowEditModal(false)
    }
  }, [])

  const closeSetOutOnHireModal = useCallback(() => {
    setHireModalStates(prev => ({
      ...prev,
      showSetOutOnHireModal: false,
      selectedVehicleForHire: null
    }))
  }, [])

  const handleQuickCheckIn = useCallback((vehicle: CheckedInVehicle, dashboardLogic: any) => {
    setHireModalStates(prev => ({
      ...prev,
      selectedVehicleForHire: vehicle,
      showQuickCheckInModal: true
    }))
    
    if (dashboardLogic.showDetailModal) {
      dashboardLogic.setShowDetailModal(false)
    }
  }, [])

  const closeQuickCheckInModal = useCallback(() => {
    setHireModalStates(prev => ({
      ...prev,
      showQuickCheckInModal: false,
      selectedVehicleForHire: null
    }))
  }, [])

  const setHireActionLoading = useCallback((loading: boolean) => {
    setHireModalStates(prev => ({
      ...prev,
      hireActionLoading: loading
    }))
  }, [])

  // UI modal handlers
  const toggleFilters = useCallback(() => {
    setUIModalStates(prev => ({
      ...prev,
      isFiltersExpanded: !prev.isFiltersExpanded
    }))
  }, [])

  const showCheckInForm = useCallback(() => {
    setUIModalStates(prev => ({
      ...prev,
      showCheckInForm: true
    }))
  }, [])

  const closeCheckInForm = useCallback(() => {
    setUIModalStates(prev => ({
      ...prev,
      showCheckInForm: false
    }))
  }, [])

  // Wrapper functions for business logic integration
  const wrapSetOutOnHireConfirm = useCallback(async (
    businessLogicHandler: (vehicleId: string, hireNotes?: string) => Promise<boolean | undefined>,
    vehicleId: string,
    hireNotes?: string
  ) => {
    setHireActionLoading(true)
    try {
      const success = await businessLogicHandler(vehicleId, hireNotes)
      if (success) {
        closeSetOutOnHireModal()
      }
    } finally {
      setHireActionLoading(false)
    }
  }, [closeSetOutOnHireModal, setHireActionLoading])

  const wrapQuickCheckInConfirm = useCallback(async (
    businessLogicHandler: (vehicleId: string, returnNotes?: string, mileage?: string) => Promise<boolean | undefined>,
    vehicleId: string,
    returnNotes?: string,
    mileage?: string
  ) => {
    setHireActionLoading(true)
    try {
      const success = await businessLogicHandler(vehicleId, returnNotes, mileage)
      if (success) {
        closeQuickCheckInModal()
      }
    } finally {
      setHireActionLoading(false)
    }
  }, [closeQuickCheckInModal, setHireActionLoading])

  const wrapCheckInConfirm = useCallback(async (
    businessLogicHandler: (formData: any) => Promise<boolean | undefined>,
    formData: any
  ) => {
    const success = await businessLogicHandler(formData)
    if (success) {
      closeCheckInForm()
    }
  }, [closeCheckInForm])

  const showReturnFromGarageConfirm = useCallback((vehicleId: string) => {
    setModalStates(prev => ({
      ...prev,
      showReturnFromGarageConfirm: true,
      returnFromGarageVehicleId: vehicleId
    }))
  }, [])

  const closeReturnFromGarageConfirm = useCallback(() => {
    setModalStates(prev => ({
      ...prev,
      showReturnFromGarageConfirm: false,
      returnFromGarageVehicleId: null
    }))
  }, [])

  // ✅ NEW: Cancel transfer confirmation handlers  
  const showCancelTransferConfirm = useCallback((vehicleId: string) => {
    setModalStates(prev => ({
      ...prev,
      showCancelTransferConfirm: true,
      cancelTransferVehicleId: vehicleId
    }))
  }, [])

  const closeCancelTransferConfirm = useCallback(() => {
    setModalStates(prev => ({
      ...prev,
      showCancelTransferConfirm: false,
      cancelTransferVehicleId: null
    }))
  }, [])

  return {
    modalStates,
    hireModalStates,
    uiModalStates,
    
    // Alert functions
    showError,
    showSuccess,
    closeError,
    closeSuccess,
    
    // Cleanup modal functions
    handleCleanButtonClick,
    handleCleanupConfirm,
    closeCleanupConfirm,
    closeNotesCleanupModal,
    
    // Checkout modal functions (LEGACY - kept for compatibility)
    showCheckoutModal,
    closeCheckoutModal,
    confirmCheckout,
    
    // Checkout destination modal functions
    showCheckoutDestination,
    closeCheckoutDestinationModal,
    
    // ✅ NEW: Garage checkout modal functions
    showGarageCheckoutModal,
    closeGarageCheckoutModal,
    
    // ✅ NEW: Transfer confirmation modals
    showReturnFromGarageConfirm,
    closeReturnFromGarageConfirm,
    showCancelTransferConfirm,
    closeCancelTransferConfirm,
    
    // Bulk checkout modal functions
    showBulkCheckoutModal,
    closeBulkCheckoutModal,
    confirmBulkCheckout,
    
    // Hire modal functions
    handleSetOutOnHire,
    closeSetOutOnHireModal,
    handleQuickCheckIn,
    closeQuickCheckInModal,
    setHireActionLoading,
    
    // UI modal functions
    toggleFilters,
    showCheckInForm,
    closeCheckInForm,
    
    // Wrapper functions
    wrapSetOutOnHireConfirm,
    wrapQuickCheckInConfirm,
    wrapCheckInConfirm
  }
}