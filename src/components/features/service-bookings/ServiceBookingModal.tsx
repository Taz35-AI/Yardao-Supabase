// src/components/features/service-bookings/ServiceBookingModal.tsx - REFACTORED VERSION
'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { X, Calendar, CheckCircle, Settings, Wrench } from 'lucide-react'

// Types
import { ServiceBookingModalProps, VehicleMatch } from '@/types/serviceBookingTypes'

// Custom Hooks
import { useServiceBookingForm } from '@/hooks/features/useServiceBookingForm'
import { useSlotOccupancy } from '@/hooks/features/useSlotOccupancy'
import { useExternalGarages } from '@/hooks/useExternalGarages'
import { useServiceBookings } from '@/hooks/useServiceBookings'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

// Utilities
import { 
  formatDate, 
  parseDateFromInput, 
  getDisplayDate 
} from '@/utils/serviceBookings/dateHelpers'
import { 
  validateServiceBookingForm, 
  hasValidationErrors,
  prepareWorkRequiredData,
  safeStringTrim
} from '@/utils/serviceBookings/validationHelpers'

// Section Components
import { DateSection } from './modal-sections/DateSection'
import { ProviderSection } from './modal-sections/ProviderSection'
import { ExternalProviderSection } from './modal-sections/ExternalProviderSection'
import { TimeSlotSection } from './modal-sections/TimeSlotSection'
import { VehicleSection } from './modal-sections/VehicleSection'
import { WorkRequiredSection } from './modal-sections/WorkRequiredSection'
import { NotesSection } from './modal-sections/NotesSection'
import { MechanicSection } from './modal-sections/MechanicSection'
import { CustomerSection } from './modal-sections/CustomerSection'

export function ServiceBookingModal({
  isOpen,
  onClose,
  selectedDate,
  vehicles,
  existingBooking,
  onSave,
  isTimeSlotAvailable,
  bayCount,
}: ServiceBookingModalProps) {
  const t = useT()
  // External data hooks
  const { activeGarages: externalGarages, loading: externalGaragesLoading } = useExternalGarages()
  const { bookings } = useServiceBookings()

  // Form state management
  const {
    formData,
    errors,
    localSelectedDate,
    setErrors,
    setFormData,
    setLocalSelectedDate,
    handleInputChange,
    handleExternalProviderChange,
    handleProviderTypeChange,
    handleWorkTypeToggle
  } = useServiceBookingForm(existingBooking, isOpen)

  // Slot occupancy management — bayCount drives the cap-aware "isFull" check.
  const { slotOccupancy } = useSlotOccupancy(
    localSelectedDate,
    bookings,
    existingBooking,
    formData.isExternalProvider,
    bayCount,
  )

  // 🛠️ When the user has picked a slot, surface whether that slot is full
  // so we can disable Save and show a helpful message inline instead of
  // letting the parent throw an error after submit.
  const selectedSlotOccupancy = formData.timeSlot
    ? slotOccupancy.get(formData.timeSlot)
    : undefined
  const slotIsFull = !!selectedSlotOccupancy?.isFull

  const [saving, setSaving] = useState(false)

  // Initialize local date when modal opens or selectedDate changes
  useEffect(() => {
    if (isOpen && selectedDate) {
      setLocalSelectedDate(new Date(selectedDate))
    }
  }, [isOpen, selectedDate, setLocalSelectedDate])

  // Handle date change
  const handleDateChange = (dateString: string) => {
    if (dateString) {
      const newDate = parseDateFromInput(dateString)
      setLocalSelectedDate(newDate)
      if (!formData.isExternalProvider) {
        handleInputChange('timeSlot', '')
      }
      if (errors.date) {
        setErrors(prev => ({ ...prev, date: '' }))
      }
    }
  }

  // Handle external garage selection
  const handleExternalGarageSelect = (garageName: string) => {
    const selectedGarage = externalGarages.find(garage => garage.name === garageName)
    if (selectedGarage) {
      handleExternalProviderChange('garageName', selectedGarage.name)
      handleExternalProviderChange('address', selectedGarage.address)
    } else {
      handleExternalProviderChange('garageName', '')
      handleExternalProviderChange('address', '')
    }
  }

  // Handle vehicle selection from search results
  const handleVehicleSelect = (vehicle: VehicleMatch) => {
    handleInputChange('registration', vehicle.registration)
    handleInputChange('make', vehicle.make)
    handleInputChange('model', vehicle.model)
    handleInputChange('isCustomVehicle', !vehicle.isFleetVehicle)
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate form
    const validationErrors = validateServiceBookingForm(formData, localSelectedDate)
    
    if (hasValidationErrors(validationErrors) || !localSelectedDate) {
      setErrors(validationErrors)
      return
    }

    setSaving(true)
    
    try {
      const finalWorkRequired = prepareWorkRequiredData(
        formData.workRequired,
        formData.customWork
      )

      const bookingData = {
        date: formatDate(localSelectedDate),
        timeSlot: formData.isExternalProvider ? 'EXTERNAL' : formData.timeSlot,
        registration: safeStringTrim(formData.registration).toUpperCase(),
        make: safeStringTrim(formData.make),
        model: safeStringTrim(formData.model),
        workRequired: finalWorkRequired,
        isCustomVehicle: formData.isCustomVehicle,
        notes: safeStringTrim(formData.notes),
        status: existingBooking?.status || 'scheduled' as const,
        isExternalProvider: formData.isExternalProvider,
        // 👤 Mechanic assignment — empty string from the dropdown means
        // "Unassigned"; persist as null so the field is queryable and
        // distinguishable from "field never written".
        assignedMechanicId: formData.assignedMechanicId
          ? formData.assignedMechanicId
          : null,
        assignedMechanicName: formData.assignedMechanicName
          ? formData.assignedMechanicName
          : null,
        // 🕐 Multi-slot span. Always send a number; default to 1 for the
        // legacy single-slot behaviour.
        slotCount:
          typeof formData.slotCount === 'number' && formData.slotCount >= 1
            ? formData.slotCount
            : 1,
        // 👥 Customer details — all optional, all conditionally included
        // so old bookings stay clean of empty strings.
        ...(safeStringTrim(formData.customerName) && {
          customerName: safeStringTrim(formData.customerName),
        }),
        ...(safeStringTrim(formData.customerPhone) && {
          customerPhone: safeStringTrim(formData.customerPhone),
        }),
        ...(safeStringTrim(formData.customerEmail) && {
          customerEmail: safeStringTrim(formData.customerEmail),
        }),
        ...(formData.isExternalProvider && {
          externalProvider: {
            garageName: safeStringTrim(formData.externalProvider.garageName),
            address: safeStringTrim(formData.externalProvider.address),
            customTime: safeStringTrim(formData.customTime)
          }
        })
      }

      const success = await onSave(bookingData)
      if (success) {
        onClose()
      }
    } catch (error) {
      logger.error('Error saving booking:', error)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-2 sm:p-4 z-50">
      <div className="w-full max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        
        {/* Beautiful Header with Gradient */}
        <div className="flex-shrink-0 bg-gradient-to-r from-[#025940] via-[#025940] to-[#72A68E] text-white p-3 sm:p-4 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-24 h-24 bg-white rounded-full transform -translate-x-12 -translate-y-12"></div>
            <div className="absolute bottom-0 right-0 w-20 h-20 bg-[#C5D9D0] rounded-full transform translate-x-10 translate-y-10"></div>
          </div>

          <div className="relative flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-white/20 backdrop-blur-sm rounded-lg border border-white/30">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-black leading-tight">
                  {existingBooking ? t('serviceBookings.modal.titleEdit') : t('serviceBookings.modal.titleNew')}
                </h1>
                <div className="flex items-center space-x-2 text-[#C5D9D0] text-[11px]">
                  <span className="font-medium">
                    {localSelectedDate && getDisplayDate(localSelectedDate)}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-gradient-to-br from-white via-slate-50/50 to-[#C5D9D0]/30 dark:from-gray-800 dark:via-gray-800/80 dark:to-gray-700/50">
          <form onSubmit={handleSubmit} className="space-y-3">

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

              {/* Left Column - Date, Provider & Vehicle */}
              <div className="space-y-3">
                <div className="flex items-center space-x-1.5 mb-1">
                  <Settings className="w-4 h-4 text-[#025940] dark:text-[#72A68E]" />
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">{t('serviceBookings.modal.bookingDetailsHeading')}</h2>
                </div>
                
                <DateSection
                  selectedDate={localSelectedDate}
                  onDateChange={handleDateChange}
                  error={errors.date}
                  allowPastDates={!!existingBooking}
                />

                <ProviderSection
                  isExternalProvider={formData.isExternalProvider}
                  onProviderTypeChange={handleProviderTypeChange}
                />

                {formData.isExternalProvider && (
                  <ExternalProviderSection
                    formData={formData}
                    onGarageSelect={handleExternalGarageSelect}
                    onProviderChange={handleExternalProviderChange}
                    errors={errors}
                    externalGaragesLoading={externalGaragesLoading}
                    externalGarages={externalGarages}
                  />
                )}

                {!formData.isExternalProvider && (
                  <TimeSlotSection
                    selectedDate={localSelectedDate}
                    selectedTimeSlot={formData.timeSlot}
                    onTimeSlotSelect={(slotId) => handleInputChange('timeSlot', slotId)}
                    slotOccupancy={slotOccupancy}
                    existingBooking={existingBooking}
                    error={errors.timeSlot}
                    slotCount={formData.slotCount ?? 1}
                    onSlotCountChange={(count) =>
                      setFormData(prev => ({ ...prev, slotCount: count }))
                    }
                  />
                )}

                <VehicleSection
                  formData={formData}
                  vehicles={vehicles}
                  onInputChange={handleInputChange}
                  onVehicleSelect={handleVehicleSelect}
                  errors={errors}
                />
              </div>

              {/* Right Column - Work Required & Notes */}
              <div className="space-y-3">
                <div className="flex items-center space-x-1.5 mb-1">
                  <Wrench className="w-4 h-4 text-[#025940] dark:text-[#72A68E]" />
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">{t('serviceBookings.modal.workAndNotesHeading')}</h2>
                </div>

                <CustomerSection
                  customerName={formData.customerName}
                  customerPhone={formData.customerPhone}
                  customerEmail={formData.customerEmail}
                  onCustomerChange={(field, value) => handleInputChange(field, value)}
                  errors={errors}
                />

                <WorkRequiredSection
                  workRequired={formData.workRequired}
                  customWork={formData.customWork}
                  onWorkTypeToggle={handleWorkTypeToggle}
                  onCustomWorkChange={(value) => handleInputChange('customWork', value)}
                  errors={errors}
                />

                <MechanicSection
                  mechanicId={formData.assignedMechanicId}
                  mechanicName={formData.assignedMechanicName}
                  onMechanicChange={(id, name) => {
                    handleInputChange('assignedMechanicId', id)
                    handleInputChange('assignedMechanicName', name)
                  }}
                />

                <NotesSection
                  notes={formData.notes}
                  onNotesChange={(value) => handleInputChange('notes', value)}
                />
              </div>
            </div>
          </form>
        </div>

        {/* Action Buttons */}
        <div className="flex-shrink-0 bg-white/80 dark:bg-gray-800/80 border-t border-gray-200/50 dark:border-gray-600/50 p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white font-semibold text-xs py-2 px-4 rounded-lg shadow transition-all"
            >
              {t('serviceBookings.common.cancel')}
            </Button>

            <Button
              type="submit"
              onClick={handleSubmit}
              disabled={saving || slotIsFull}
              title={
                slotIsFull
                  ? t('serviceBookings.modal.slotFullTitle', {
                      count: bayCount ?? selectedSlotOccupancy?.bayCount ?? '',
                    })
                  : undefined
              }
              className="flex-1 bg-gradient-to-r from-[#025940] to-[#72A68E] hover:from-[#025940]/90 hover:to-[#72A68E]/90 text-white font-semibold text-xs py-2 px-4 rounded-lg shadow flex items-center justify-center space-x-1.5 transition-all disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{existingBooking ? t('serviceBookings.modal.updating') : t('serviceBookings.modal.creating')}</span>
                </>
              ) : slotIsFull ? (
                <>
                  <span>{t('serviceBookings.modal.slotFullButton')}</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{existingBooking ? t('serviceBookings.modal.updateBooking') : t('serviceBookings.modal.createBooking')}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ServiceBookingModal