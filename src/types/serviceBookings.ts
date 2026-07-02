// src/types/serviceBookings.ts - Updated with service bay support and extended time slots
import type { PartsStatus } from '@/lib/utils/partsStatus'

export interface ServiceBooking {
  id: string
  date: string // YYYY-MM-DD format
  timeSlot: string // e.g., "08:30-10:00" or custom time for external
  registration: string
  make?: string
  model?: string
  workRequired: string | string[] // Support both for backward compatibility
  isCustomVehicle: boolean
  notes?: string
  organizationId: string
  createdBy: string
  createdByName: string
  createdAt: Date
  updatedAt?: Date
  // Attribution snapshots — written by the client on update/delete so the
  // Cloud Function triggers can include "by X" in push notifications.
  lastModifiedBy?: string
  lastModifiedByName?: string
  cancelledBy?: string
  cancelledByName?: string
  status: 'scheduled' | 'checked_in_to_garage' | 'in-progress' | 'completed' | 'cancelled'
  
  
  // Service bay assignment for managing multiple concurrent bookings
  serviceBay?: number // 1 for main bay, 2+ for additional bays
  
  // New fields for external provider - both optional with defaults
  isExternalProvider?: boolean // Default to false
  externalProvider?: {
    garageName: string
    address: string
    customTime: string // For external providers - free text time
  } // Only present if isExternalProvider is true
  
  // Track when vehicle was checked into garage
  checkedInToGarageAt?: Date
  checkedInToGarageBy?: string
  checkedInToGarageByName?: string
  
  // Branch tracking fields for multi-branch support
  originalBranchId?: string | null        // e.g., 'main', 'fairview', 'kensington'
  originalBranchName?: string | null      // e.g., 'Main Branch', 'Fairview Barking', 'Kensington'
  vehicleRemovedFromBranch?: boolean      // Track if vehicle was removed from branch during service
  
  // ✅ NEW: Dashboard completion tracking
  completedFromDashboard?: boolean        // Flag when completed via Dashboard return
  completedAt?: Date                      // When it was completed
  completedBy?: string                    // User ID who completed it
  completedByName?: string                // User display name who completed it

  // 👤 Mechanic assignment — optional. When set, identifies the mechanic
  // responsible for this booking. Both fields are written together (or
  // both cleared together) by the assignment UI.
  assignedMechanicId?: string | null      // userProfiles UID of the assigned mechanic
  assignedMechanicName?: string | null    // Display name snapshot for fast row rendering

  // 🕐 Multi-slot bookings (e.g. engine replacement that spans the day).
  // `timeSlot` is the START slot; `slotCount` says how many consecutive
  // slots from there the booking occupies. Optional + defaults to 1 so
  // existing single-slot bookings behave exactly as before.
  slotCount?: number

  // 👥 Customer contact details for this booking. Optional in storage so
  // bookings created before these fields existed still load. The form
  // requires customerName + customerPhone at submit time; email is fully
  // optional. Stored on the booking record (not a separate customers
  // collection) — callers can copy them out later if a CRM is added.
  customerName?: string
  customerPhone?: string
  customerEmail?: string

  // 🧩 Parts state for this job. Optional/undefined = no parts to order
  // (so old bookings are unaffected and most in-stock jobs show no chip).
  // Manual flag — staff set it on the form and advance it from the
  // workshop grid. See lib/utils/partsStatus.
  partsStatus?: PartsStatus

  // 🛞 Odometer reading captured at "Mark Complete" for INTERNAL workshop
  // jobs only (optional). Feeds the per-vehicle Service History. External /
  // garage completions never set this — they show "Not recorded".
  mileage?: number

  // 🧾 Invoicing (migration 0040). `invoiceId` links the invoice raised from
  // this job (null/undefined = none). `noInvoiceNeeded` marks cash / close-
  // customer jobs that deliberately won't be invoiced, so they don't show as
  // "Not invoiced". A completed job with neither set is flagged for invoicing.
  invoiceId?: string | null
  noInvoiceNeeded?: boolean

  // ⏭️ Carry-over (migration 0055). When an unfinished job is carried to another
  // day, the SAME booking is re-dated; `carriedOverSlots` banks the slots it
  // occupied on previous days so the invoice bills the TOTAL hours across every
  // day (labour = carriedOverSlots + slotCount). `carriedOverCount` is how many
  // times it has spilled over. Both default 0 → unaffected jobs.
  carriedOverSlots?: number
  carriedOverCount?: number
}

export interface TimeSlot {
  id: string
  label: string
  startTime: string
  endTime: string
  available?: boolean // Add optional available property
}

export interface ServiceBookingFormData {
  registration: string
  make: string
  model: string
  timeSlot: string
  customTime: string // For external providers
  workRequired: string[]
  customWork: string
  notes: string
  isCustomVehicle: boolean
  isExternalProvider: boolean
  externalProvider: {
    garageName: string
    address: string
  }
  serviceBay?: number // Bay assignment for conflict resolution
  assignedMechanicId?: string | null
  assignedMechanicName?: string | null
  slotCount?: number // 🕐 Number of consecutive slots this booking spans
}

export interface BookingConflict {
  date: string
  timeSlot: string
  existingBooking: ServiceBooking
  availableBay?: number // Next available service bay
}

export interface BookingStats {
  totalBookings: number
  completedBookings: number
  inProgressBookings: number
  scheduledBookings: number
  checkedInToGarageBookings: number
  thisWeekBookings: number
  completionRate: number
}

export interface DayDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  selectedDate: Date
  bookings: ServiceBooking[]
  onBookingEdit: (booking: ServiceBooking) => void
  onBookingDelete: (bookingId: string) => void
  onMarkCompleted: (booking: ServiceBooking) => void
  onCheckInToGarage: (booking: ServiceBooking) => void
  onAddBooking: (date: Date) => void
}

// Branch-aware vehicle checkout record interface for external garage tracking
export interface BranchAwareCheckoutRecord {
  // Vehicle Details
  registration: string
  make: string
  model: string
  colour: string
  size: string
  condition: string
  status: string
  mileage: string
  contract?: string | null
  contractColor?: string | null
  motExpiry?: string
  taxExpiry?: string
  comments?: string
  notes?: string
  
  // Branch Information - critical for returning vehicles to correct branch
  originalBranchId: string
  originalBranchName: string
  
  // Checkout Information
  checkedOutDate: Date
  checkedOutBy: string
  checkedOutByName: string
  
  // Organization
  organizationId: string
  
  // Service Context
  isExternalGarageCheckout: boolean
  externalGarageName?: string
  serviceBookingId?: string
  
  // Additional context
  originalCheckInDate: Date
  originalCheckedInBy?: string
  originalCheckedInByName?: string
}

// Service Bay Confirmation Modal Options
export interface ServiceBayConfirmOptions {
  conflictingBookings: ServiceBooking[]
  availableBay: number
  onConfirm: (useBay: number) => void
  onCancel: () => void
}