// src/components/features/service-bookings/DayDetailsModal.tsx - CUSTOM COLOR PALETTE VERSION
// FIXED: External garage checkouts from Dashboard should NOT show check-in/complete buttons
'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

// Professional Modal Components
import { ConfirmationModal } from '@/components/common/Modals/ConfirmationModal'
import { AlertModal } from '@/components/common/Modals/AlertModal'
import { logger } from '@/lib/logger'
import { useT, localizeWorkRequired } from '@/lib/i18n'

import {
  X,
  Calendar,
  Clock,
  Car,
  Wrench,
  Edit,
  Trash2,
  Plus,
  CheckCircle,
  Building,
  MapPin,
  ExternalLink,
  LogIn,
  AlertCircle
} from 'lucide-react'

// shared types
import type { ServiceBooking, DayDetailsModalProps } from '@/types/serviceBookings'

// Modal states interface
interface ModalStates {
  showCheckInConfirm: boolean
  showErrorAlert: boolean
  showSuccessAlert: boolean
  errorMessage: string
  successMessage: string
  checkInBooking: ServiceBooking | null
}

export default function DayDetailsModal({
  isOpen,
  onClose,
  selectedDate,
  bookings,
  onBookingEdit,
  onBookingDelete,
  onMarkCompleted,
  onCheckInToGarage,
  onAddBooking
}: DayDetailsModalProps) {
  const t = useT()
  // Professional Modal States
  const [modalStates, setModalStates] = useState<ModalStates>({
    showCheckInConfirm: false,
    showErrorAlert: false,
    showSuccessAlert: false,
    errorMessage: '',
    successMessage: '',
    checkInBooking: null
  })

  if (!isOpen) return null

  // ✅ FIXED: Helper to determine if booking is a dashboard external garage checkout
  const isDashboardExternalGarageCheckout = (booking: ServiceBooking): boolean => {
    // This is a dashboard checkout if:
    // 1. It's an external provider booking
    // 2. It has an originalBranchId (set by dashboard checkout flow)
    // 3. Status is 'scheduled' (not checked in to internal garage)
    return Boolean(
      booking.isExternalProvider && 
      booking.originalBranchId && 
      booking.status === 'scheduled'
    )
  }

  // Professional modal helper functions
  const showError = (message: string) => {
    setModalStates(prev => ({
      ...prev,
      errorMessage: message,
      showErrorAlert: true
    }))
  }

  const showSuccess = (message: string) => {
    setModalStates(prev => ({
      ...prev,
      successMessage: message,
      showSuccessAlert: true
    }))
  }

  const closeError = () => {
    setModalStates(prev => ({
      ...prev,
      showErrorAlert: false,
      errorMessage: ''
    }))
  }

  const closeSuccess = () => {
    setModalStates(prev => ({
      ...prev,
      showSuccessAlert: false,
      successMessage: ''
    }))
  }

  // Format date for display
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  // Format work required
  const formatWorkRequired = (workRequired: string | string[]): string =>
    localizeWorkRequired(t, workRequired, t('serviceBookings.workFallback.service'), ', ')

  // Get status color - USING YOUR PALETTE
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'bg-[#C5D9D0] text-[#012619] dark:bg-[#025940]/20 dark:text-[#72A68E]'
      case 'checked_in_to_garage':
        return 'bg-[#72A68E]/30 text-[#012619] dark:bg-[#72A68E]/20 dark:text-[#72A68E]'
      case 'in-progress':
        return 'bg-[#72A68E]/50 text-[#012619] dark:bg-[#025940]/30 dark:text-[#C5D9D0]'
      case 'cancelled':
        return 'bg-[#0D0D0D]/10 text-[#0D0D0D] dark:bg-[#0D0D0D]/30 dark:text-[#C5D9D0]'
      case 'scheduled':
      default:
        return 'bg-[#025940]/20 text-[#025940] dark:bg-[#025940]/30 dark:text-[#72A68E]'
    }
  }

  // Get status label
  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'completed':
        return t('serviceBookings.status.completed')
      case 'checked_in_to_garage':
        return t('serviceBookings.status.atGarage')
      case 'in-progress':
        return t('serviceBookings.status.inProgress')
      case 'cancelled':
        return t('serviceBookings.status.cancelled')
      case 'scheduled':
      default:
        return t('serviceBookings.status.scheduled')
    }
  }

  // Professional check-in to garage handler
  const handleCheckInToGarage = (booking: ServiceBooking) => {
    setModalStates(prev => ({
      ...prev,
      checkInBooking: booking,
      showCheckInConfirm: true
    }))
  }

  const handleCheckInConfirm = async () => {
    const booking = modalStates.checkInBooking
    if (!booking) return

    try {
      await onCheckInToGarage(booking)
      setModalStates(prev => ({
        ...prev,
        showCheckInConfirm: false,
        checkInBooking: null
      }))
      showSuccess(
        booking.externalProvider?.garageName
          ? t('serviceBookings.checkin.successMessage', {
              registration: booking.registration,
              garageName: booking.externalProvider.garageName,
            })
          : t('serviceBookings.checkin.successMessageNoGarage', {
              registration: booking.registration,
            })
      )
    } catch (error) {
      logger.error('Error checking in to garage:', error)
      showError(t('serviceBookings.checkin.errorMessage'))
    }
  }

  return (
    <>
      {/* Dark overlay */}
      <div className="fixed inset-0 bg-[#012619]/70 flex items-center justify-center p-2 sm:p-4 z-50">
        {/* Modal container */}
        <div className="bg-white dark:bg-[#0D0D0D] rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh] sm:max-h-[90vh] border border-[#025940]/20 dark:border-[#025940]/40">
          
          {/* Header with gradient using palette colors */}
          <div className="flex-shrink-0 flex items-center justify-between p-4 sm:p-6 border-b border-[#72A68E]/30 dark:border-[#025940]/50 bg-gradient-to-r from-[#025940] to-[#72A68E] dark:from-[#012619] dark:to-[#025940] rounded-t-xl">
            <div className="flex items-center space-x-3 min-w-0 flex-1">
              <div className="flex-shrink-0 p-2 bg-white/20 dark:bg-[#72A68E]/20 rounded-lg backdrop-blur-sm">
                <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg sm:text-xl font-bold text-white truncate">
                  {t('serviceBookings.dayModal.title')}
                </h2>
                <p className="text-xs sm:text-sm text-[#C5D9D0] truncate">
                  {formatDate(selectedDate)}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="flex-shrink-0 text-white/80 hover:text-white hover:bg-white/20 ml-2"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0 bg-gradient-to-b from-white to-[#C5D9D0]/10 dark:from-[#0D0D0D] dark:to-[#012619]/30">
            {/* Add New Booking Button */}
            <div className="mb-4 sm:mb-6">
              <Button
                onClick={() => onAddBooking(selectedDate)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#025940] hover:bg-[#012619] text-white"
              >
                <Plus className="w-4 h-4" />
                {t('serviceBookings.dayModal.addNewBooking')}
              </Button>
            </div>

            {/* Bookings List */}
            {bookings.length === 0 ? (
              <div className="text-center py-8 sm:py-12">
                <Calendar className="w-10 h-10 sm:w-12 sm:h-12 text-[#72A68E] mx-auto mb-3 sm:mb-4" />
                <p className="text-base sm:text-lg font-medium text-[#025940] dark:text-[#C5D9D0] mb-2">
                  {t('serviceBookings.dayModal.noBookingsForDay')}
                </p>
                <p className="text-sm sm:text-base text-[#025940]/70 dark:text-[#72A68E]">
                  {t('serviceBookings.dayModal.noBookingsHint')}
                </p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {bookings.map((booking) => {
                  const isExternalCheckout = isDashboardExternalGarageCheckout(booking)
                  
                  return (
                    <Card key={booking.id} className="hover:shadow-md transition-shadow overflow-hidden border-[#72A68E]/30 dark:border-[#025940]/40 bg-white dark:bg-[#012619]/50">
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex flex-col gap-3 sm:gap-4">
                          {/* Main Info */}
                          <div className="space-y-3">
                            {/* Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <Car className="w-4 h-4 sm:w-5 sm:h-5 text-[#025940] dark:text-[#72A68E] flex-shrink-0" />
                                  <h3 className="text-base sm:text-lg font-semibold text-[#012619] dark:text-[#C5D9D0]">
                                    {booking.registration}
                                  </h3>
                                </div>
                                {/* ✅ FIXED: Enhanced status badge for external checkouts */}
                                <Badge className={`${getStatusColor(booking.status)} text-xs border-0 ${isExternalCheckout ? 'flex items-center gap-1' : ''}`}>
                                  {isExternalCheckout && <ExternalLink className="w-3 h-3" />}
                                  {isExternalCheckout ? t('serviceBookings.dayModal.atExternalGarage') : getStatusLabel(booking.status)}
                                </Badge>
                                {booking.isExternalProvider && !isExternalCheckout && (
                                  <Badge className="bg-[#025940]/10 text-[#025940] dark:bg-[#025940]/20 dark:text-[#72A68E] border border-[#025940]/30 dark:border-[#025940]/50 text-xs">
                                    <ExternalLink className="w-3 h-3 mr-1" />
                                    {t('serviceBookings.dayModal.externalBadge')}
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Vehicle & Time Details */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 text-xs sm:text-sm">
                              <div className="flex items-center gap-2">
                                <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-[#72A68E] flex-shrink-0" />
                                <span className="text-[#025940] dark:text-[#C5D9D0] truncate">
                                  {booking.isExternalProvider && booking.externalProvider?.customTime 
                                    ? booking.externalProvider.customTime 
                                    : booking.timeSlot}
                                </span>
                              </div>
                              
                              {booking.make && booking.model && (
                                <div className="flex items-center gap-2">
                                  <Car className="w-3 h-3 sm:w-4 sm:h-4 text-[#72A68E] flex-shrink-0" />
                                  <span className="text-[#025940] dark:text-[#C5D9D0] truncate">
                                    {booking.make} {booking.model}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Work Required */}
                            <div className="flex items-start gap-2">
                              <Wrench className="w-3 h-3 sm:w-4 sm:h-4 text-[#72A68E] mt-0.5 flex-shrink-0" />
                              <span className="text-[#025940] dark:text-[#C5D9D0] text-xs sm:text-sm break-words">
                                {formatWorkRequired(booking.workRequired)}
                              </span>
                            </div>

                            {/* External Provider Info */}
                            {booking.isExternalProvider && booking.externalProvider && (
                              <div className="bg-[#72A68E]/10 dark:bg-[#025940]/20 p-2 sm:p-3 rounded-md space-y-1 border border-[#72A68E]/30 dark:border-[#025940]/40">
                                <div className="flex items-center gap-2">
                                  <Building className="w-3 h-3 sm:w-4 sm:h-4 text-[#025940] dark:text-[#72A68E] flex-shrink-0" />
                                  <span className="font-medium text-[#012619] dark:text-[#C5D9D0] text-xs sm:text-sm truncate">
                                    {booking.externalProvider.garageName}
                                  </span>
                                </div>
                                {booking.externalProvider.address && (
                                  <div className="flex items-start gap-2">
                                    <MapPin className="w-3 h-3 sm:w-4 sm:h-4 text-[#025940] dark:text-[#72A68E] mt-0.5 flex-shrink-0" />
                                    <span className="text-xs sm:text-sm text-[#025940]/80 dark:text-[#C5D9D0]/80 break-words">
                                      {booking.externalProvider.address}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Notes */}
                            {booking.notes && (
                              <div className="text-xs sm:text-sm text-[#025940]/80 dark:text-[#C5D9D0]/80 bg-[#C5D9D0]/20 dark:bg-[#025940]/10 p-2 rounded break-words">
                                <strong>{t('serviceBookings.dayModal.notesLabel')}</strong> {booking.notes}
                              </div>
                            )}

                            {/* Check-in to Garage Info */}
                            {booking.status === 'checked_in_to_garage' && booking.checkedInToGarageAt && (
                              <div className="bg-[#72A68E]/20 dark:bg-[#025940]/30 p-2 sm:p-3 rounded-md border border-[#72A68E]/40 dark:border-[#025940]/50">
                                <div className="text-xs sm:text-sm text-[#012619] dark:text-[#C5D9D0]">
                                  <strong>{t('serviceBookings.dayModal.checkedIntoGarage')}</strong> {booking.checkedInToGarageAt.toLocaleDateString('en-GB')} at {booking.checkedInToGarageAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                  {booking.checkedInToGarageByName && (
                                    <span>{t('serviceBookings.dayModal.checkedInBy', { name: booking.checkedInToGarageByName })}</span>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* ✅ FIXED: Warning banner for external garage checkouts */}
                            {isExternalCheckout && (
                              <div className="bg-[#025940]/10 dark:bg-[#025940]/20 p-2 sm:p-3 rounded-md border border-[#025940]/30 dark:border-[#025940]/50">
                                <div className="flex items-start gap-2">
                                  <AlertCircle className="w-4 h-4 text-[#025940] dark:text-[#72A68E] flex-shrink-0 mt-0.5" />
                                  <div className="text-xs text-[#025940] dark:text-[#C5D9D0]">
                                    <p className="font-semibold mb-1">{t('serviceBookings.dayModal.managedFromDashboardTitle')}</p>
                                    <p>{t('serviceBookings.dayModal.managedFromDashboardBody')}</p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex flex-wrap gap-2 pt-2 border-t border-[#72A68E]/20 dark:border-[#025940]/30">
                            {/* ✅ FIXED: Check-in Garage button - HIDE for dashboard external garage checkouts */}
                            {booking.status === 'scheduled' && 
                             booking.isExternalProvider && 
                             !isExternalCheckout && ( // ← CRITICAL FIX
                              <Button
                                size="sm"
                                onClick={() => handleCheckInToGarage(booking)}
                                className="flex-1 sm:flex-initial flex items-center justify-center gap-1 bg-[#72A68E]/20 hover:bg-[#72A68E]/30 text-[#025940] dark:text-[#72A68E] border border-[#72A68E]/40 dark:border-[#025940]/50 text-xs"
                              >
                                <LogIn className="w-3 h-3" />
                                <span className="hidden sm:inline">{t('serviceBookings.action.checkInGarage')}</span>
                                <span className="sm:hidden">{t('serviceBookings.action.checkInShort')}</span>
                              </Button>
                            )}
                            
                            {/* ✅ FIXED: Complete button - HIDE for dashboard external garage checkouts */}
                            {(booking.status === 'scheduled' || booking.status === 'checked_in_to_garage' || booking.status === 'in-progress') && 
                             !isExternalCheckout && ( // ← CRITICAL FIX
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onMarkCompleted(booking)}
                                className="flex-1 sm:flex-initial flex items-center justify-center gap-1 bg-[#C5D9D0]/30 hover:bg-[#C5D9D0]/50 text-[#025940] border-[#72A68E] text-xs"
                              >
                                <CheckCircle className="w-3 h-3" />
                                {t('serviceBookings.action.complete')}
                              </Button>
                            )}
                            
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onBookingEdit(booking)}
                              className="flex-1 sm:flex-initial flex items-center justify-center gap-1 text-xs border-[#72A68E]/50 text-[#025940] dark:text-[#72A68E] hover:bg-[#72A68E]/10"
                            >
                              <Edit className="w-3 h-3" />
                              {t('serviceBookings.action.edit')}
                            </Button>
                            
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => booking.id && onBookingDelete(booking.id)}
                              className="flex-1 sm:flex-initial flex items-center justify-center gap-1 text-[#012619] dark:text-[#C5D9D0] hover:bg-[#0D0D0D]/10 dark:hover:bg-[#C5D9D0]/10 border-[#0D0D0D]/30 dark:border-[#C5D9D0]/30 text-xs"
                            >
                              <Trash2 className="w-3 h-3" />
                              {t('serviceBookings.action.delete')}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Professional Modal Dialogs */}
      <ConfirmationModal
        isOpen={modalStates.showCheckInConfirm}
        onClose={() => setModalStates(prev => ({ ...prev, showCheckInConfirm: false, checkInBooking: null }))}
        onConfirm={handleCheckInConfirm}
        title={t('serviceBookings.checkin.confirmTitle')}
        message={modalStates.checkInBooking ?
          t('serviceBookings.checkin.confirmMessage', {
            registration: modalStates.checkInBooking.registration,
            garageName: modalStates.checkInBooking.externalProvider?.garageName || t('serviceBookings.checkin.fallbackExternalGarage'),
          }) :
          t('serviceBookings.checkin.confirmFallback')
        }
        confirmText={t('serviceBookings.checkin.confirmText')}
        cancelText={t('serviceBookings.common.cancel')}
        variant="warning"
      />

      <AlertModal
        isOpen={modalStates.showErrorAlert}
        onClose={closeError}
        title={t('serviceBookings.common.errorTitle')}
        message={modalStates.errorMessage}
        variant="error"
        actionText={t('serviceBookings.common.ok')}
      />

      <AlertModal
        isOpen={modalStates.showSuccessAlert}
        onClose={closeSuccess}
        title={t('serviceBookings.common.successTitle')}
        message={modalStates.successMessage}
        variant="success"
        actionText={t('serviceBookings.common.ok')}
      />
    </>
  )
}