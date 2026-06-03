// src/types/serviceBookingTypes.ts - Complete Type Definitions
import { ServiceBooking } from '@/types/serviceBookings'
import { Vehicle } from '@/lib/firestore'
import type { PartsStatus } from '@/lib/utils/partsStatus'

/**
 * Form data structure for service booking creation/editing
 */
export interface ServiceBookingFormData {
  registration: string
  make: string
  model: string
  timeSlot: string
  customTime: string
  workRequired: string[]
  customWork: string
  notes: string
  isCustomVehicle: boolean
  isExternalProvider: boolean
  externalProvider: {
    garageName: string
    address: string
  }
  // 👤 Mechanic assignment — optional. Empty string means "Unassigned".
  assignedMechanicId?: string
  assignedMechanicName?: string
  // 🕐 Number of consecutive time slots this booking spans (1 = single slot,
  // i.e. the legacy default). Picker enforces consecutive selection.
  slotCount?: number
  // 👥 Customer contact details. Form-side these are always strings (defaulted
  // to '') so the input components stay controlled; the validator enforces
  // name + phone at submit time. Email is optional.
  customerName: string
  customerPhone: string
  customerEmail: string
  // 🧩 Parts state. Form-side it's always a string ('' = none) so the
  // selector stays controlled; only written to the booking when set.
  partsStatus: PartsStatus | ''
}

/**
 * Vehicle match result from search
 */
export interface VehicleMatch {
  registration: string
  make: string
  model: string
  isFleetVehicle: boolean
}

/**
 * Slot occupancy tracking
 *
 * 🛠️ Bay-cap aware. When a `bayCount` is supplied to the calculator we also
 * report:
 *   - `isFull`: every bay in the cap is taken
 *   - `availableBay`: the lowest unoccupied bay number, or null when full
 * Legacy callers that don't pass a cap get the original behaviour
 * (`nextAvailableBay = max + 1`, `isFull = false`).
 */
export interface SlotOccupancy {
  slotId: string
  bookings: ServiceBooking[]
  baysInUse: number[]
  nextAvailableBay: number
  isFull?: boolean
  availableBay?: number | null
  bayCount?: number
}

/**
 * Form validation errors
 */
export interface ServiceBookingFormErrors {
  date?: string
  registration?: string
  timeSlot?: string
  customTime?: string
  garageName?: string
  address?: string
  workRequired?: string
  customWork?: string
  make?: string
  model?: string
  customerName?: string
  customerPhone?: string
  customerEmail?: string
}

/**
 * Props for ServiceBookingModal
 */
export interface ServiceBookingModalProps {
  isOpen: boolean
  onClose: () => void
  selectedDate: Date | null
  vehicles: Vehicle[]
  existingBooking?: ServiceBooking | null
  onSave: (booking: Omit<ServiceBooking, 'id' | 'createdAt' | 'organizationId' | 'createdBy' | 'createdByName'>) => Promise<boolean>
  isTimeSlotAvailable: (date: string, timeSlot: string) => boolean
  // 🛠️ Optional cap from the user's branch. Drives slot-occupancy display
  // and the "all bays full" guard. Omitting it preserves the legacy
  // unbounded behaviour.
  bayCount?: number
}

/**
 * Props for form section components
 */
export interface DateSectionProps {
  selectedDate: Date | null
  onDateChange: (dateString: string) => void
  error?: string
  /** When true, the date picker won't enforce `min=today`. Used in EDIT
   *  mode so a booking that already lives on a past day can be re-saved
   *  (e.g. adding a forgotten extra job) without the browser rejecting
   *  the existing date. Defaults to false → unchanged behaviour for new
   *  bookings. */
  allowPastDates?: boolean
}

export interface ProviderSectionProps {
  isExternalProvider: boolean
  onProviderTypeChange: (isExternal: boolean) => void
}

export interface ExternalProviderSectionProps {
  formData: ServiceBookingFormData
  onGarageSelect: (garageName: string) => void
  onProviderChange: (field: string, value: string) => void
  errors: ServiceBookingFormErrors
  externalGaragesLoading: boolean
  externalGarages: any[]
}

export interface TimeSlotSectionProps {
  selectedDate: Date | null
  selectedTimeSlot: string
  onTimeSlotSelect: (slotId: string) => void
  slotOccupancy: Map<string, SlotOccupancy>
  existingBooking?: ServiceBooking | null
  error?: string
  // 🕐 Multi-slot support — when supplied, the picker behaves as a
  // range-selector. `slotCount` is the number of consecutive slots from
  // `selectedTimeSlot`. Omitting these props preserves the old single-slot
  // behaviour exactly.
  slotCount?: number
  onSlotCountChange?: (count: number) => void
}

export interface VehicleSectionProps {
  formData: ServiceBookingFormData
  vehicles: Vehicle[]
  onInputChange: (field: string, value: string | boolean) => void
  onVehicleSelect: (vehicle: VehicleMatch) => void
  errors: ServiceBookingFormErrors
}

export interface WorkRequiredSectionProps {
  workRequired: string[]
  customWork: string
  onWorkTypeToggle: (workType: string) => void
  onCustomWorkChange: (value: string) => void
  errors: ServiceBookingFormErrors
}

export interface NotesSectionProps {
  notes: string
  onNotesChange: (value: string) => void
}

/**
 * Props for utility components
 */
export interface SlotIndicatorProps {
  bookingCount: number
  isSelected: boolean
  slotLabel: string
  nextAvailableBay?: number
  bookings?: ServiceBooking[]
  isHovered?: boolean
}

export interface VehicleSearchDropdownProps {
  searchResults: VehicleMatch[]
  showResults: boolean
  onVehicleSelect: (vehicle: VehicleMatch) => void
}

export interface GarageSelectorProps {
  selectedGarageName: string
  selectedAddress: string
  externalGarages: any[]
  loading: boolean
  onGarageSelect: (garageName: string) => void
  onCustomGarageChange: (field: string, value: string) => void
  errors: ServiceBookingFormErrors
}