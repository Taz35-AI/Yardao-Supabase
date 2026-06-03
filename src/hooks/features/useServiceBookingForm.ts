// src/hooks/features/useServiceBookingForm.ts - Form State & Logic Management
import { useState, useEffect } from 'react'
import { ServiceBooking } from '@/types/serviceBookings'
import { 
  ServiceBookingFormData, 
  ServiceBookingFormErrors 
} from '@/types/serviceBookingTypes'
import { TIME_SLOTS } from '@/components/features/service-bookings/ServiceBookingsContent'

// Normalises a (possibly legacy) timeSlot+slotCount pair to the new 30-min
// granularity. Legacy bookings stored a 90-min slot id like "08:30-10:00"
// with slotCount=1; the modal's TimeSlotSection iterates the new 30-min
// TIME_SLOTS and wouldn't match that id, leaving the user with no slot
// selected on edit. We translate it to the new start id + correct count
// so the multi-slot picker highlights the actual occupied range.
function normaliseSlotForEdit(
  timeSlot: string,
  storedSlotCount?: number,
): { timeSlot: string; slotCount: number } {
  const fallback = { timeSlot, slotCount: storedSlotCount && storedSlotCount >= 1 ? storedSlotCount : 1 }
  const m = timeSlot?.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/)
  if (!m) return fallback
  const startMin = Number(m[1]) * 60 + Number(m[2])
  const endMin   = Number(m[3]) * 60 + Number(m[4])
  const duration = endMin - startMin
  if (duration <= 30) return fallback
  const startTime = `${m[1]}:${m[2]}`
  const newStart = TIME_SLOTS.find(s => s.startTime === startTime)
  if (!newStart) return fallback
  return {
    timeSlot: newStart.id,
    slotCount: Math.max(1, Math.round(duration / 30)),
  }
}

const initialFormData: ServiceBookingFormData = {
  registration: '',
  make: '',
  model: '',
  timeSlot: '',
  customTime: '',
  workRequired: [],
  customWork: '',
  notes: '',
  isCustomVehicle: false,
  isExternalProvider: false,
  externalProvider: {
    garageName: '',
    address: ''
  },
  assignedMechanicId: '',
  assignedMechanicName: '',
  slotCount: 1,
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  partsStatus: '',
}

export function useServiceBookingForm(
  existingBooking?: ServiceBooking | null,
  isOpen?: boolean
) {
  const [formData, setFormData] = useState<ServiceBookingFormData>(initialFormData)
  const [errors, setErrors] = useState<ServiceBookingFormErrors>({})
  const [localSelectedDate, setLocalSelectedDate] = useState<Date | null>(null)

  // Initialize form with existing booking data
  useEffect(() => {
    if (existingBooking) {
      let workRequiredArray: string[]
      if (Array.isArray(existingBooking.workRequired)) {
        workRequiredArray = existingBooking.workRequired
      } else if (typeof existingBooking.workRequired === 'string') {
        workRequiredArray = [existingBooking.workRequired]
      } else {
        workRequiredArray = []
      }

      // Translate legacy 90-min slot ids → new 30-min start + correct span
      // so the multi-slot picker highlights the right range when editing.
      const normalised = existingBooking.isExternalProvider
        ? { timeSlot: '', slotCount: 1 }
        : normaliseSlotForEdit(existingBooking.timeSlot, existingBooking.slotCount)

      setFormData({
        registration: existingBooking.registration,
        make: existingBooking.make || '',
        model: existingBooking.model || '',
        timeSlot: normalised.timeSlot,
        customTime: existingBooking.isExternalProvider && existingBooking.externalProvider?.customTime || '',
        // Every saved job reloads as a removable chip (no membership gate,
        // so nothing is lost regardless of which jobs were picked). The
        // free-text "custom work" box starts empty and only captures NEW
        // ad-hoc text; prepareWorkRequiredData re-appends it on save.
        workRequired: workRequiredArray,
        customWork: '',
        notes: existingBooking.notes || '',
        isCustomVehicle: existingBooking.isCustomVehicle,
        isExternalProvider: existingBooking.isExternalProvider || false,
        externalProvider: {
          garageName: existingBooking.externalProvider?.garageName || '',
          address: existingBooking.externalProvider?.address || ''
        },
        assignedMechanicId: existingBooking.assignedMechanicId || '',
        assignedMechanicName: existingBooking.assignedMechanicName || '',
        slotCount: normalised.slotCount,
        // Old bookings created before customer fields existed get blank
        // strings — the form will require name + phone before save.
        customerName: existingBooking.customerName || '',
        customerPhone: existingBooking.customerPhone || '',
        customerEmail: existingBooking.customerEmail || '',
        partsStatus: existingBooking.partsStatus || '',
      })

      if (existingBooking.date) {
        const [year, month, day] = existingBooking.date.split('-').map(Number)
        setLocalSelectedDate(new Date(year, month - 1, day))
      }
    } else {
      setFormData(initialFormData)
    }
  }, [existingBooking, isOpen])

  // Handle input changes
  const handleInputChange = (field: string, value: string | boolean | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field as keyof ServiceBookingFormErrors]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  // 🔥 FIXED: Handle external provider changes - now handles BOTH top-level and nested fields
  const handleExternalProviderChange = (field: string, value: string) => {
    // Check if this is a top-level field (customTime) or nested field (garageName, address)
    if (field === 'customTime') {
      // Handle top-level customTime field
      setFormData(prev => ({
        ...prev,
        customTime: value
      }))
      // Clear error for customTime
      if (errors.customTime) {
        setErrors(prev => ({ ...prev, customTime: '' }))
      }
    } else {
      // Handle nested externalProvider fields (garageName, address)
      setFormData(prev => ({
        ...prev,
        externalProvider: {
          ...prev.externalProvider,
          [field]: value
        }
      }))
      // Clear error for the specific nested field
      if (errors[field as keyof ServiceBookingFormErrors]) {
        setErrors(prev => ({ ...prev, [field]: '' }))
      }
    }
  }

  // Handle provider type change
  const handleProviderTypeChange = (isExternal: boolean) => {
    setFormData(prev => ({
      ...prev,
      isExternalProvider: isExternal,
      timeSlot: isExternal ? '' : prev.timeSlot,
      customTime: isExternal ? prev.customTime : ''
    }))
  }

  // Handle work type selection (multiple)
  const handleWorkTypeToggle = (workType: string) => {
    setFormData(prev => ({
      ...prev,
      workRequired: prev.workRequired.includes(workType)
        ? prev.workRequired.filter(w => w !== workType)
        : [...prev.workRequired, workType]
    }))
  }

  // Clear specific error
  const clearError = (field: keyof ServiceBookingFormErrors) => {
    setErrors(prev => ({ ...prev, [field]: '' }))
  }

  return {
    formData,
    errors,
    localSelectedDate,
    setFormData,
    setErrors,
    setLocalSelectedDate,
    handleInputChange,
    handleExternalProviderChange,
    handleProviderTypeChange,
    handleWorkTypeToggle,
    clearError
  }
}