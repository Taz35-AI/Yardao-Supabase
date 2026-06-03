// src/utils/serviceBookings/validationHelpers.ts - Form Validation Logic
import { ServiceBookingFormData, ServiceBookingFormErrors } from '@/types/serviceBookingTypes'

/**
 * Safe string trim utility
 */
export const safeStringTrim = (value: any): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  return String(value).trim()
}

/**
 * Validate complete service booking form
 */
export const validateServiceBookingForm = (
  formData: ServiceBookingFormData,
  localSelectedDate: Date | null
): ServiceBookingFormErrors => {
  const errors: ServiceBookingFormErrors = {}

  // Date validation
  if (!localSelectedDate) {
    errors.date = 'Date is required'
  }

  // Registration validation
  if (!safeStringTrim(formData.registration)) {
    errors.registration = 'Registration is required'
  }

  // External provider validation
  if (formData.isExternalProvider) {
    if (!safeStringTrim(formData.customTime)) {
      errors.customTime = 'Time is required for external providers'
    }
    if (!safeStringTrim(formData.externalProvider.garageName)) {
      errors.garageName = 'Please select a garage or enter a custom garage name'
    }
    if (!safeStringTrim(formData.externalProvider.address)) {
      errors.address = 'Garage address is required'
    }
  } else {
    // In-house validation
    if (!formData.timeSlot) {
      errors.timeSlot = 'Time slot is required'
    }
  }

  // Work required validation — at least one preselected type OR free-text custom work
  if (formData.workRequired.length === 0 && !safeStringTrim(formData.customWork)) {
    errors.workRequired = 'At least one work type is required'
  }

  // Custom vehicle validation — flag make and model independently so each
  // empty field highlights its own input (the form binds the Model box to
  // errors.model; a single combined error left Model unable to ever go red).
  if (formData.isCustomVehicle) {
    if (!safeStringTrim(formData.make)) {
      errors.make = 'Make is required for custom vehicles'
    }
    if (!safeStringTrim(formData.model)) {
      errors.model = 'Model is required for custom vehicles'
    }
  }

  // 👥 Customer details — all three fields are OPTIONAL. We only sanity-
  // check format when something IS entered, so a typo doesn't silently
  // save, but a blank booking (e.g. internal fleet job with no end-customer)
  // goes through fine.
  const phone = safeStringTrim(formData.customerPhone)
  if (phone && !/^[+()\d\s\-]{6,}$/.test(phone)) {
    // Tolerant pattern: digits + spaces + + ( ) - . At least 6 chars so
    // we catch obvious typos without rejecting international formats.
    errors.customerPhone = 'Phone number looks invalid'
  }
  const email = safeStringTrim(formData.customerEmail)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.customerEmail = 'Email looks invalid'
  }

  return errors
}

/**
 * Check if form has any validation errors
 */
export const hasValidationErrors = (errors: ServiceBookingFormErrors): boolean => {
  return Object.keys(errors).length > 0
}

/**
 * Prepare work required data for save
 */
export const prepareWorkRequiredData = (
  workRequired: string[],
  customWork: string
): string | string[] => {
  if (workRequired.length > 0 || customWork.trim()) {
    const workArray = [...workRequired]
    if (customWork.trim()) {
      workArray.push(customWork.trim())
    }
    return workArray.length === 1 ? workArray[0] : workArray
  }
  return 'Service'
}