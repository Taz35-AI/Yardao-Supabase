// src/components/features/service-bookings/ServiceBookingsList.tsx - Updated with Check-in Garage functionality
// ✅ SURGICAL FIX: Added isDashboardExternalGarageCheckout to prevent double check-in
'use client'

import React, { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'

// Professional Modal Components
import { ConfirmationModal } from '@/components/common/Modals/ConfirmationModal'
import { AlertModal } from '@/components/common/Modals/AlertModal'

// shared types
import type { ServiceBooking } from '@/types/serviceBookings'

import {
  Clock,
  Car,
  Wrench,
  Edit,
  Trash2,
  Search,
  Filter,
  MapPin,
  ExternalLink,
  AlertCircle // ✅ SURGICAL FIX: Added for warning banner
} from 'lucide-react'
import { logger } from '@/lib/logger'
import { useT, localizeWorkRequired } from '@/lib/i18n'

interface ServiceBookingsListProps {
  bookings: ServiceBooking[]
  onBookingEdit: (booking: ServiceBooking) => void
  onBookingDelete: (bookingId: string) => void
  onStatusChange: (bookingData: Omit<ServiceBooking, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'>) => Promise<boolean>
  onMarkCompleted: (booking: ServiceBooking) => void
  onCheckInToGarage: (booking: ServiceBooking) => void // NEW
}

// Modal states interface
interface ModalStates {
  showCheckInConfirm: boolean
  showErrorAlert: boolean
  showSuccessAlert: boolean
  errorMessage: string
  successMessage: string
  checkInBooking: ServiceBooking | null
}

export function ServiceBookingsList({
  bookings,
  onBookingEdit,
  onBookingDelete,
  onStatusChange,
  onMarkCompleted,
  onCheckInToGarage // NEW
}: ServiceBookingsListProps) {
  const t = useT()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [providerFilter, setProviderFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'date' | 'status' | 'registration'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // Professional Modal States
  const [modalStates, setModalStates] = useState<ModalStates>({
    showCheckInConfirm: false,
    showErrorAlert: false,
    showSuccessAlert: false,
    errorMessage: '',
    successMessage: '',
    checkInBooking: null
  })

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

  // ✅ SURGICAL FIX: Helper to detect Dashboard external garage checkouts
  // This prevents showing "Check-in Garage" for vehicles already at external garage
  const isDashboardExternalGarageCheckout = (booking: ServiceBooking): boolean => {
    return Boolean(
      booking.isExternalProvider && 
      booking.originalBranchId && 
      booking.status === 'scheduled'
    )
  }

  // Filter and sort bookings
  const filteredAndSortedBookings = useMemo(() => {
    let filtered = bookings.filter(booking => {
      const matchesSearch = searchTerm === '' || 
        booking.registration.toLowerCase().includes(searchTerm.toLowerCase()) ||
        booking.make?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        booking.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (Array.isArray(booking.workRequired) 
          ? booking.workRequired.some(work => work.toLowerCase().includes(searchTerm.toLowerCase()))
          : (booking.workRequired || '').toLowerCase().includes(searchTerm.toLowerCase())
        ) ||
        (booking.isExternalProvider && booking.externalProvider?.garageName?.toLowerCase().includes(searchTerm.toLowerCase()))

      const matchesStatus = statusFilter === 'all' || booking.status === statusFilter
      
      const matchesProvider = providerFilter === 'all' || 
        (providerFilter === 'internal' && !booking.isExternalProvider) ||
        (providerFilter === 'external' && booking.isExternalProvider)

      return matchesSearch && matchesStatus && matchesProvider
    })

    // Sort bookings
    filtered.sort((a, b) => {
      let comparison = 0
      
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime()
          break
        case 'status':
          comparison = a.status.localeCompare(b.status)
          break
        case 'registration':
          comparison = a.registration.localeCompare(b.registration)
          break
      }
      
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [bookings, searchTerm, statusFilter, providerFilter, sortBy, sortOrder])

  // Format date helper
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  // Format work required helper
  const formatWorkRequired = (workRequired: string | string[]): string =>
    localizeWorkRequired(t, workRequired, t('serviceBookings.workFallback.service'), ', ')

  // Get status color - UPDATED with new status
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
      case 'checked_in_to_garage':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400'
      case 'in-progress':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
      case 'cancelled':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
      case 'scheduled':
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
    }
  }

  // Get status label - UPDATED with new status  
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

  // Handle sort change
  const handleSort = (field: 'date' | 'status' | 'registration') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
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
          : t('serviceBookings.checkin.successMessage', {
              registration: booking.registration,
              garageName: t('serviceBookings.checkin.fallbackExternalGarage'),
            })
      )
    } catch (error) {
      logger.error('Error checking in to garage:', error)
      showError(t('serviceBookings.checkin.errorMessage'))
    }
  }

  return (
    <div className="space-y-6">
      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            {t('serviceBookings.list.filtersTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('serviceBookings.list.searchPlaceholder')}
              className="pl-10"
            />
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Status Filter - UPDATED with new status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('serviceBookings.list.statusLabel')}
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="all">{t('serviceBookings.list.statusAll')}</option>
                <option value="scheduled">{t('serviceBookings.status.scheduled')}</option>
                <option value="checked_in_to_garage">{t('serviceBookings.status.atGarage')}</option>
                <option value="in-progress">{t('serviceBookings.status.inProgress')}</option>
                <option value="completed">{t('serviceBookings.status.completed')}</option>
                <option value="cancelled">{t('serviceBookings.status.cancelled')}</option>
              </select>
            </div>

            {/* Provider Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('serviceBookings.list.providerTypeLabel')}
              </label>
              <select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="all">{t('serviceBookings.list.providerAll')}</option>
                <option value="internal">{t('serviceBookings.list.providerInternal')}</option>
                <option value="external">{t('serviceBookings.list.providerExternal')}</option>
              </select>
            </div>

            {/* Sort */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('serviceBookings.list.sortByLabel')}
              </label>
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split('-') as [typeof sortBy, typeof sortOrder]
                  setSortBy(field)
                  setSortOrder(order)
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="date-asc">{t('serviceBookings.list.sortDateAsc')}</option>
                <option value="date-desc">{t('serviceBookings.list.sortDateDesc')}</option>
                <option value="registration-asc">{t('serviceBookings.list.sortRegAsc')}</option>
                <option value="registration-desc">{t('serviceBookings.list.sortRegDesc')}</option>
                <option value="status-asc">{t('serviceBookings.list.sortStatusAsc')}</option>
                <option value="status-desc">{t('serviceBookings.list.sortStatusDesc')}</option>
              </select>
            </div>
          </div>

          {/* Results Summary */}
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {t('serviceBookings.list.resultsSummary', { shown: filteredAndSortedBookings.length, total: bookings.length })}
          </div>
        </CardContent>
      </Card>

      {/* Bookings List */}
      <div className="space-y-4">
        {filteredAndSortedBookings.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <img src="/calendar.svg" alt="" className="w-12 h-12 object-contain mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {t('serviceBookings.list.emptyTitle')}
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {searchTerm || statusFilter !== 'all' || providerFilter !== 'all'
                  ? t('serviceBookings.list.emptyFiltered')
                  : t('serviceBookings.list.emptyNoBookings')
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredAndSortedBookings.map((booking) => {
            // ✅ SURGICAL FIX: Check if this is a dashboard external garage checkout
            const isExternalCheckout = isDashboardExternalGarageCheckout(booking)
            
            return (
              <Card key={booking.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Main Info */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <img src="/calendar.svg" alt="" className="w-4 h-4 object-contain" />
                          <span className="font-medium">{formatDate(booking.date)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span>
                            {booking.isExternalProvider && booking.externalProvider?.customTime
                              ? booking.externalProvider.customTime
                              : booking.timeSlot
                            }
                          </span>
                        </div>
                        {/* ✅ SURGICAL FIX: Enhanced status badge for external checkouts */}
                        <Badge className={`${getStatusColor(booking.status)} ${isExternalCheckout ? 'flex items-center gap-1' : ''}`}>
                          {isExternalCheckout && <ExternalLink className="w-3 h-3" />}
                          {isExternalCheckout ? t('serviceBookings.list.badgeAtExternalGarage') : getStatusLabel(booking.status)}
                        </Badge>
                        {booking.isExternalProvider && !isExternalCheckout && (
                          <Badge variant="outline" className="text-purple-600 border-purple-300">
                            <ExternalLink className="w-3 h-3 mr-1" />
                            {t('serviceBookings.list.badgeExternal')}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Car className="w-4 h-4 text-gray-400" />
                          <span className="font-semibold">{booking.registration}</span>
                          {booking.make && booking.model && (
                            <span className="text-gray-600 dark:text-gray-400">
                              {booking.make} {booking.model}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <Wrench className="w-4 h-4 text-gray-400 mt-0.5" />
                        <span className="text-sm">
                          {formatWorkRequired(booking.workRequired)}
                        </span>
                      </div>

                      {/* External Provider Info */}
                      {booking.isExternalProvider && booking.externalProvider && (
                        <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-md space-y-1">
                          <div className="flex items-center gap-2">
                            <img src="/external.svg" alt="" className="w-4 h-4 object-contain" />
                            <span className="font-medium text-purple-900 dark:text-purple-100">
                              {booking.externalProvider.garageName}
                            </span>
                          </div>
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-purple-600 mt-0.5" />
                            <span className="text-sm text-purple-800 dark:text-purple-200">
                              {booking.externalProvider.address}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* NEW: Check-in to Garage Info */}
                      {booking.status === 'checked_in_to_garage' && booking.checkedInToGarageAt && (
                        <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-md">
                          <div className="text-sm text-orange-800 dark:text-orange-200">
                            <strong>{t('serviceBookings.list.checkedIntoGarageLabel')}</strong> {booking.checkedInToGarageAt.toLocaleDateString('en-GB')} at {booking.checkedInToGarageAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            {booking.checkedInToGarageByName && (
                              <span>{t('serviceBookings.list.checkedInBySuffix', { name: booking.checkedInToGarageByName })}</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ✅ SURGICAL FIX: Warning banner for external garage checkouts */}
                      {isExternalCheckout && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-blue-700 dark:text-blue-300">
                              <p className="font-semibold">{t('serviceBookings.list.managedFromDashboard')}</p>
                              <p className="text-xs">{t('serviceBookings.list.managedFromDashboardDetail')}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {booking.notes && (
                        <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                          <strong>{t('serviceBookings.list.notesLabel')}</strong> {booking.notes}
                        </div>
                      )}

                      {/* Meta Info */}
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {t('serviceBookings.list.createdByMeta', { name: booking.createdByName, date: new Date(booking.createdAt).toLocaleDateString('en-GB') })}
                      </div>
                    </div>

                    {/* Actions - UPDATED with new button logic */}
                    <div className="flex sm:flex-col gap-2">
                      {/* ✅ SURGICAL FIX: Hide Check-in Garage button for Dashboard external garage checkouts */}
                      {booking.status === 'scheduled' && 
                       booking.isExternalProvider && 
                       !isExternalCheckout && ( // ← THIS IS THE FIX
                        <Button
                          size="sm"
                          onClick={() => handleCheckInToGarage(booking)}
                          className="flex items-center gap-1 bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-300"
                        >
                          <img src="/external.svg" alt="" className="w-3 h-3 object-contain" />
                          {t('serviceBookings.action.checkInGarage')}
                        </Button>
                      )}
                      
                      {/* ✅ SURGICAL FIX: Hide Complete button for Dashboard external garage checkouts */}
                      {(booking.status === 'scheduled' || booking.status === 'checked_in_to_garage' || booking.status === 'in-progress') && 
                       !isExternalCheckout && ( // ← THIS IS THE FIX
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onMarkCompleted(booking)}
                          className="flex items-center gap-1 bg-green-50 hover:bg-green-100 text-green-700 border-green-300"
                        >
                          <img src="/completed.svg" alt="" className="w-3 h-3 object-contain" />
                          {t('serviceBookings.action.complete')}
                        </Button>
                      )}
                      
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onBookingEdit(booking)}
                        className="flex items-center gap-1"
                      >
                        <Edit className="w-3 h-3" />
                        {t('serviceBookings.action.edit')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => booking.id && onBookingDelete(booking.id)}
                        className="flex items-center gap-1 text-red-600 hover:text-red-700 hover:border-red-300"
                      >
                        <Trash2 className="w-3 h-3" />
                        {t('serviceBookings.action.delete')}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Professional Modal Dialogs */}
      <ConfirmationModal
        isOpen={modalStates.showCheckInConfirm}
        onClose={() => setModalStates(prev => ({ ...prev, showCheckInConfirm: false, checkInBooking: null }))}
        onConfirm={handleCheckInConfirm}
        title={t('serviceBookings.list.checkInModalTitle')}
        message={modalStates.checkInBooking ?
          t('serviceBookings.list.checkInModalMessage', {
            registration: modalStates.checkInBooking.registration,
            garageName: modalStates.checkInBooking.externalProvider?.garageName || t('serviceBookings.checkin.fallbackExternalGarage'),
          }) :
          t('serviceBookings.list.checkInModalMessageFallback')
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
    </div>
  )
}

// Default export
export default ServiceBookingsList