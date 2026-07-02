// 📁 src/types/index.ts - UPDATED WITH VEHICLE ID RELATIONSHIPS + DATE ACQUIRED + DEFLEET SUPPORT
import { logger } from '@/lib/logger'
import { DamagePin, VehicleDiagramType } from '@/components/common/DamageMapper/DamageMapper'
// Vehicle Status Types - 4-Status System
export type VehicleStatus = 'Ready' | 'Pending checks' | 'Repairs needed' | 'Non-Starter'

// NEW: Vehicle Hire Status Types
export type VehicleHireStatus = 'In Yard' | 'Out on Hire'

// 🆕 NEW: Insurance Status Types
export type InsuranceStatus = 'Insured' | 'Not Insured'

// ✅ NEW: Defleet Reason Types
export type DefleetReason = 
  | 'Sold' 
  | 'Scrapped' 
  | 'Trade-In' 
  | 'End of Lease' 
  | 'Accident Write-Off' 
  | 'Theft' 
  | 'Other'

// Legacy status mapping for backward compatibility
export type LegacyVehicleStatus = 'Needs Checking' | VehicleStatus

// NEW: Contract Interface
export interface Contract {
  id: string
  name: string
  organizationId: string
  isDefault: boolean
  color?: string // NEW: Color field for visual distinction
  createdAt: Date | string
  updatedAt?: Date | string
  createdBy: string
}

// NEW: External Garage Management Interface
export interface ExternalGarage {
  id: string
  name: string
  address: string
  organizationId: string
  createdBy: string
  createdAt: Date | string
  updatedAt?: Date | string
  isActive: boolean
}

// Form data for external garage creation/editing
export interface ExternalGarageFormData {
  name: string
  address: string
}

// API response for external garage operations
export interface ExternalGarageResponse extends ApiResponse<ExternalGarage> {}
export interface ExternalGarageListResponse extends ApiResponse<ExternalGarage[]> {}

// NEW: Hire State Interface
export interface VehicleHireState {
  hireStatus: VehicleHireStatus
  originalStatus?: VehicleStatus // Preserve original status when out on hire
  hiredAt?: Date | string
  hiredBy?: string
  hiredByName?: string
  hireNotes?: string
}

// NEW: Audit Log Interface
export interface AuditLog {
  action: string
  by: string
  byDisplayName?: string
  timestamp: Date | string
}

// 🔧 UPDATED: Vehicle Interfaces - UPDATED with ID-based relationships
export interface CheckedInVehicle {
  id: string
  
  // 🔧 NEW: ID-based relationship to fleet inventory
  vehicleId?: string | null // Reference to the vehicle in fleet inventory
  
  registration: string
  make: string
  model: string
  colour?: string
  size: string
  condition: string
  status: VehicleStatus
  mileage?: string
  // Service-due flag (migration 0043): set at check-in when the vehicle's
  // mileage is >= threshold past its last recorded service. Self-resets each
  // yard stay because the checked-in row is recreated on every check-in.
  serviceDue?: boolean
  serviceDueMiles?: number | null      // how many miles past the threshold
  lastServiceMileage?: number | null   // odometer at the last recorded service
  notes?: string
  comments?: string
  motExpiry?: string
  taxExpiry?: string
  userId: string
  organizationId: string
  location?: string
  bay?: string
  // ✅ NEW: Yard layout — stable id of the parking space (links to yardLayouts/{branchId}/spaces/*.id)
  parkingSpaceId?: string | null
  // ✅ NEW: Parking attribution — who last changed this vehicle's parking
  // state (park / move / force-move / unpark) and when. Reflects the most
  // recent parking-state change only; other edits don't touch these fields.
  parkedBy?: string
  parkedByName?: string
  parkedAt?: Date | any
  updatedAt?: Date
  createdAt?: Date
  checkInTime?: any
  branchId?: string
  vehicleDiagramType?: VehicleDiagramType | null   // which PNG to show
  damagePins?: DamagePin[]                          // array of placed pins
  
  // 🔧 FIXED: Contract fields with proper null handling
  contract?: string | null
  contractColor?: string | null

  // ✅ ADD THESE NEW FIELDS FOR TRANSFER TRACKING:
  
  // Transfer status fields
  transferStatus?: 'in_transit' | 'at_external_garage' | null
  
  // Branch transfer fields
  sourceBranchId?: string | null        // ✅ NEW: Source branch ID for display
  sourceBranchName?: string | null      // ✅ NEW: Source branch name for display  
  targetBranchId?: string | null
  targetBranchName?: string | null
  transferInitiatedAt?: Date | string
  transferInitiatedBy?: string
  transferInitiatedByName?: string
  
  // External garage fields  
  externalGarageId?: string | null 
  externalGarageName?: string | null
  serviceBookingId?: string | null
  checkedOutToGarageAt?: Date | string
  checkedOutToGarageBy?: string
  checkedOutToGarageByName?: string
  
  // 🆕 NEW: Insurance Status field
  insuranceStatus?: InsuranceStatus | null

  // ✅ NEW: Insurance Policy fields
  insurancePolicyId?: string | null
  insurancePolicyName?: string | null
  insurancePolicyExpiry?: string | null
  
  // NEW: Hire functionality
  hireStatus: VehicleHireStatus
  originalStatus?: VehicleStatus // Store original status when out on hire
  hiredAt?: Date | string
  hiredBy?: string
  hiredByName?: string
  hireNotes?: string
  currentHireHistoryId?: string | null  // Links to active hire history record
  currentAgreementLineId?: string | null // Links to the active Hire-Management line (contract)

  // NEW: Audit log field
  lastEditLog?: AuditLog
}

// 🔧 UPDATED: VehicleCheckInData interface with ID relationships
export interface VehicleCheckInData {
  id?: string
  
  // 🔧 NEW: ID-based relationship to fleet inventory
  vehicleId?: string | null // Reference to the vehicle in fleet inventory
  
  registration: string
  make: string
  model: string
  colour: string
  size: string
  condition: string
  status: VehicleStatus
  mileage: string
  mileageNotAvailable?: boolean
  notes: string
  motExpiry?: string
  taxExpiry?: string
  comments?: string

  // 🔧 FIXED: Contract fields with proper null handling
  contract?: string | null
  contractColor?: string | null
  
  // 🆕 NEW: Insurance Status field
  insuranceStatus?: InsuranceStatus | null
  insurancePolicyId?: string | null
  insurancePolicyName?: string | null
  insurancePolicyExpiry?: string | null
  
  // NEW: Hire functionality (optional for check-in)
  hireStatus?: VehicleHireStatus
  originalStatus?: VehicleStatus
  hiredAt?: Date | string
  hiredBy?: string
  hiredByName?: string
  hireNotes?: string
  
  // NEW: Audit log field
  lastEditLog?: AuditLog
}


// NEW: Hire Action Interfaces
export interface SetOutOnHireData {
  vehicleId: string
  hireNotes?: string
}

export interface QuickCheckInData {
  vehicleId: string
  returnNotes?: string
  // Return mileage captured at quick check-in (return from hire). Optional —
  // present only when the org requires mileage and the user supplied it.
  mileage?: string
}

// NEW: Hire Analytics
export interface HireAnalytics {
  totalOutOnHire: number
  totalInYard: number
  hiresByBranch: Record<string, number>
  averageHireDuration: number
  currentHires: CheckedInVehicle[]
}

// 🔧 UPDATED: Vehicle interface (Fleet Inventory) - Now the master record + DEFLEET SUPPORT
export interface Vehicle {
  id?: string // Firestore document ID - this is the primary key
  registration: string // Still unique, but not the primary lookup key
  make: string
  model: string
  colour: string
  size: string
  motExpiry: string
  taxExpiry: string
  comments: string
  condition: string
  createdAt: string
  organizationId: string
  createdBy: string
  
  // 🔧 FIXED: Contract fields with proper null handling
  contract?: string | null
  contractColor?: string | null
  
  // 🆕 NEW: Insurance Status field
  insuranceStatus?: InsuranceStatus | null
  insurancePolicyId?: string | null
  insurancePolicyName?: string | null
  insurancePolicyExpiry?: string | null
  
  // 🔧 NEW: Current status tracking
  currentStatus?: 'in_fleet' | 'checked_in' | 'external_service' | 'sold' | 'scrapped' | 'defleeted' // ✅ ADDED 'defleeted'
  currentLocation?: string // Branch ID where it's currently located
  lastKnownLocation?: string
  updatedAt?: string
  
  // ✨ NEW: Date Acquired field
  dateAcquired?: string | null // When vehicle was acquired by the business (ISO format YYYY-MM-DD)
  
  // ✅ NEW: Defleet tracking fields
  isDefleeted?: boolean              // Quick filter flag
  defleetDate?: string | null               // When it was defleeted (user-provided date)
  defleetProcessedDate?: string      // When the defleet was processed in system
  defleetReason?: DefleetReason      // Why it was defleeted
  defleetReasonDetails?: string      // Additional details/comments
  defleetedBy?: string               // User ID who defleeted it
  defleetedByName?: string           // User display name
}

// 🔧 UPDATED: FleetVehicle interface with proper relationships + DEFLEET SUPPORT
export interface FleetVehicle {
  id: string // Firestore document ID
  registration: string
  make: string
  model: string
  colour?: string
  size: string
  motExpiry?: string
  taxExpiry?: string
  hasRecall?: boolean // DVSA outstanding safety recall (set by the bulk DVLA refresh)
  comments?: string
  condition: string
  organizationId: string
  createdBy: string
  createdAt: Date | string

  // 🔧 FIXED: Contract fields with proper null handling
  contract?: string | null
  contractColor?: string | null
  contractId?: string | null // Stable link to the contract doc (source of truth)

  // 🆕 NEW: Insurance Status field
  insuranceStatus?: InsuranceStatus | null

  // ✅ NEW: Insurance Policy fields
  insurancePolicyId?: string | null
  insurancePolicyName?: string | null
  insurancePolicyExpiry?: string | null
  
  
  // 🔧 NEW: Current status tracking
  currentStatus?: 'in_fleet' | 'checked_in' | 'external_service' | 'sold' | 'scrapped' | 'defleeted' // ✅ ADDED 'defleeted'
  currentLocation?: string
  lastKnownLocation?: string
  vehicleDiagramType?: VehicleDiagramType | null   // which PNG to show
  damagePins?: DamagePin[]                          // array of placed pins
  
  // ✨ NEW: Date Acquired field
  dateAcquired?: string | null // When vehicle was acquired by the business (ISO format YYYY-MM-DD)
  
  // ✅ NEW: Defleet tracking fields
  isDefleeted?: boolean
  defleetDate?: string | null
  defleetProcessedDate?: string
  defleetReason?: DefleetReason
  defleetReasonDetails?: string
  defleetedBy?: string
  defleetedByName?: string

}

// User and Organization Interfaces - COMPLETE with all your original properties
export interface UserProfile {
  id?: string
  uid: string
  displayName: string
  email: string
  organizationId: string
  organizationName?: string
  themePreference: 'light' | 'dark' | 'system'
  role: 'admin' | 'member' | 'mechanic' | 'garage_manager'
  createdAt: Date | string
  updatedAt?: Date | string
  requiresPasswordReset?: boolean
  emailVerified?: boolean
  createdBy?: string // For members created by admins
  
  // All your original properties preserved
  isActive?: boolean // User active status - defaults to true if undefined
  isDeleted?: boolean // Soft delete flag - defaults to false if undefined
  deletedAt?: string // Timestamp when user was deleted
  deletedBy?: string // UID of admin who deleted the user
  
  // 🔧 NEW: Last login tracking for admin visibility
  lastLoginAt?: Date | string // Timestamp of user's last login
  notificationsEnabled?: boolean  // ✅ add this line
  // ✨ PHASE 3: User-level dashboard preferences
  defaultView?: 'pipeline' | 'table' | 'cards' | 'layout' // Preferred yard view on load
  defaultBranchSlug?: string // Branch slug (e.g. "fairview-bray") to land on by default
  languagePreference?: 'en' | 'ro' | 'bg' | 'pl' // 🌐 App language (cross-device; instant pref is localStorage)
  hasCompletedTour?: boolean // 🧭 Whether the user has seen the guided dashboard tour
}

export interface Organization {
  id: string
  name: string
  description?: string
  createdBy: string
  createdAt: Date | string
  updatedAt?: Date | string
  memberCount?: number
}

// Condition and Organization Interfaces - COMPLETE
export interface ConditionCategory {
  id: string
  name: string
  organizationId: string
  isDefault: boolean
  color?: string
  severity?: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
  createdAt: Date | string
}

// Navigation Types - COMPLETE
export interface NavItem {
  href: string
  label: string
  icon: any
  active?: boolean
  badge?: number | string
  children?: NavItem[]
}

// 🔧 UPDATED: Analytics Interfaces - COMPLETE with insurance breakdown + contract breakdown + hire analytics
export interface Analytics {
  // Core counts
  totalCount: number
  readyCount: number
  needsCheckingCount: number // Legacy support
  pendingChecksCount: number // NEW: For 'Pending checks' status
  repairsNeededCount: number // NEW: For 'Repairs needed' status
  nonStarterCount: number // NEW: For 'Non-Starter' status
  
  // NEW: Hire counts
  inYardCount: number
  outOnHireCount: number
  
  // 🆕 NEW: Insurance counts
  insuredCount: number
  notInsuredCount: number
  unknownInsuranceCount: number
  
  // Mileage and expiry data
  avgMileage: number
  motExpiringCount: number
  taxExpiringCount: number
  
  // Breakdown data
  conditionBreakdown: Record<string, number>
  locationBreakdown: Record<string, number>
  sizeBreakdown: Record<string, number>
  statusBreakdown: Record<string, number>
  contractBreakdown: Record<string, number> // NEW: Contract breakdown
  insuranceBreakdown: Record<string, number> // 🆕 NEW: Insurance breakdown
  
  // Status analytics
  statusCounts: {
    ready: number
    pendingChecks: number
    repairsNeeded: number
    nonStarter: number
  }
  statusPercentages: {
    ready: number
    pendingChecks: number
    repairsNeeded: number
    nonStarter: number
  }
  
  // Time-based analytics
  todayCheckIns: number
  weekCheckIns: number
  averageStayTime: number
  
  // NEW: Hire analytics
  hireAnalytics: HireAnalytics
}

// Enhanced dashboard analytics interface - COMPLETE
export interface DashboardAnalytics extends Analytics {
  // Additional dashboard-specific analytics
  utilizationRate?: number
  peakHours?: Record<string, number>
  dailyTrends?: Record<string, number>
}

// 🔧 UPDATED: Filter and Sort Configurations - COMPLETE with insurance filter + DEFLEET FILTER
export interface FilterConfig {
  search: string
  excludeKeywords: string // Your original property
  size: string
  condition: string
  status: string
  contract: string // NEW: Contract filter
  insuranceStatus: string // 🆕 NEW: Insurance filter
  motExpiring: boolean
  dateFrom: string
  dateTo: string
  showDefleeted?: boolean // ✅ NEW: Toggle to show/hide defleeted vehicles
}

export interface SortConfig {
  key: string
  direction: 'asc' | 'desc'
}

// 🔧 UPDATED: Form Data Interfaces with ID relationships and insurance
export interface VehicleFormData {
  id?: string
  
  // 🔧 NEW: ID-based relationship to fleet inventory
  vehicleId?: string | null // Reference to the vehicle in fleet inventory
  
  registration: string
  make: string
  model: string
  colour: string
  size: string
  condition: string
  status: VehicleStatus
  mileage: string
  // Set when the user ticks "odometer not available" — lets a genuine
  // non-runner / unreadable-dash vehicle through the mandatory-mileage gate.
  mileageNotAvailable?: boolean
  notes: string
  motExpiry?: string
  taxExpiry?: string
  comments?: string
  vehicleDiagramType?: VehicleDiagramType | string | null
  damagePins?: DamagePin[]
  
  // 🔧 FIXED: Contract fields with proper optional handling
  contract?: string
  contractColor?: string
  
  // 🆕 NEW: Insurance Status field
  insuranceStatus: InsuranceStatus | null
  insurancePolicyId?: string | null
  insurancePolicyName?: string | null
  insurancePolicyExpiry?: string | null
  
  // NEW: Audit log field
  lastEditLog?: AuditLog
}

export interface ProfileFormData {
  displayName: string
  email: string
  themePreference: 'light' | 'dark' | 'system'
}

export interface PasswordFormData {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

// 🔧 UPDATED: Modal and UI State Interfaces - COMPLETE with insurance modal
export interface ModalState {
  showCheckInForm: boolean
  showEditModal: boolean
  showDetailModal: boolean
  showSizeModal: boolean
  showConditionModal: boolean
  showStatusModal: boolean
  showContractModal: boolean // NEW: Contract modal
  showInsuranceModal: boolean // 🆕 NEW: Insurance modal
  selectedVehicle: CheckedInVehicle | null
}

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
}

// Status Configuration Interface - COMPLETE
export interface StatusConfig {
  icon: any
  color: string
  bgColor: string
  borderColor: string
  label: string
  description: string
}

// 🔧 UPDATED: Vehicle Update Interface with ID relationships and insurance
export interface VehicleUpdateData {
  condition?: string
  status?: VehicleStatus
  comments?: string
  notes?: string
  mileage?: string
  location?: string
  bay?: string
  
  // 🔧 FIXED: Contract fields with proper null handling
  contract?: string | null
  contractColor?: string | null
  
  // 🆕 NEW: Insurance Status field
  insuranceStatus?: InsuranceStatus | null
  
  
  // ✅ NEW: Insurance Policy fields
  insurancePolicyId?: string | null
  insurancePolicyName?: string | null
  insurancePolicyExpiry?: string | null
  
  // NEW: Hire functionality
  hireStatus: VehicleHireStatus
  
  // NEW: Audit log field
  lastEditLog?: AuditLog
  
  // ✨ NEW: Date Acquired field
  dateAcquired?: string
}

// Export and Import Interfaces - COMPLETE with all your original properties
export interface ExportData {
  vehicles: CheckedInVehicle[]
  fleet: FleetVehicle[]
  conditions: ConditionCategory[]
  contracts: Contract[] // NEW: Contracts in export
  externalGarages: ExternalGarage[] // NEW: External garages in export
  exportDate: string
  organizationId: string
}

export interface ImportResult {
  success: boolean
  imported: number
  skipped: number
  errors: string[]
}

// Form validation types - COMPLETE
export interface ValidationError {
  field: string
  message: string
}

export interface FormState<T> {
  data: T
  errors: ValidationError[]
  loading: boolean
  touched: Record<keyof T, boolean>
}

// API response types - COMPLETE
export interface ApiResponse<T> {
  data?: T
  error?: string
  success: boolean
}

// Theme types - COMPLETE
export type ThemeMode = 'light' | 'dark' | 'system'

// Component props types - COMPLETE
export interface BaseComponentProps {
  className?: string
  children?: React.ReactNode
}

export interface LoadingComponentProps extends BaseComponentProps {
  text?: string
  size?: 'sm' | 'md' | 'lg'
}

export interface ErrorComponentProps extends BaseComponentProps {
  error: string | Error
  retry?: () => void
}

// User Management Types - COMPLETE
export interface CreateUserData {
  email: string
  displayName: string
  temporaryPassword: string
  organizationId: string
  organizationName: string
  createdBy: string
}

// Utility Types - COMPLETE
export type VehicleField = keyof CheckedInVehicle
export type SortableField = 'registration' | 'make' | 'model' | 'condition' | 'status' | 'createdAt' | 'checkInTime' | 'contract' | 'insuranceStatus' | 'dateAcquired' // ✨ NEW: Added dateAcquired to sortable fields

// Constants - COMPLETE
export const VEHICLE_STATUSES: VehicleStatus[] = ['Ready', 'Pending checks', 'Repairs needed', 'Non-Starter']
export const LEGACY_STATUS_MAP: Record<string, VehicleStatus> = {
  'Needs Checking': 'Pending checks',
  'Ready': 'Ready',
  'Pending checks': 'Pending checks',
  'Repairs needed': 'Repairs needed',
  'Non-Starter': 'Non-Starter'
}

// 🆕 NEW: Insurance Status Constants
export const INSURANCE_STATUSES: InsuranceStatus[] = ['Insured', 'Not Insured']

// ✅ NEW: Defleet Reason Constants
export const DEFLEET_REASONS: DefleetReason[] = [
  'Sold',
  'Scrapped',
  'Trade-In',
  'End of Lease',
  'Accident Write-Off',
  'Theft',
  'Other'
]

// Helper function to normalize status - COMPLETE
export const normalizeVehicleStatus = (status: string | undefined): VehicleStatus => {
  if (!status) return 'Pending checks'
  
  const normalizedStatus = status.toLowerCase().trim()
  
  switch (normalizedStatus) {
    case 'needs checking':
    case 'pending checks':
      return 'Pending checks'
    case 'ready':
      return 'Ready'
    case 'repairs needed':
      return 'Repairs needed'
    case 'non-starter':
      return 'Non-Starter'
    default:
      logger.log(`Unknown status "${status}", defaulting to "Pending checks"`)
      return 'Pending checks'
  }
}

// Helper function to check if status is valid - COMPLETE
export const isValidVehicleStatus = (status: string): status is VehicleStatus => {
  return VEHICLE_STATUSES.includes(status as VehicleStatus)
}

// 🆕 NEW: Insurance Status Helper Functions
export const isValidInsuranceStatus = (status: string): status is InsuranceStatus => {
  return INSURANCE_STATUSES.includes(status as InsuranceStatus)
}

export const getInsuranceStatusConfig = (status: InsuranceStatus | null) => {
  if (!status) {
    return {
      label: 'Unknown',
      color: 'text-gray-500',
      bgColor: 'bg-gray-100 dark:bg-gray-700',
      borderColor: 'border-gray-300 dark:border-gray-600',
      textColor: 'text-gray-700 dark:text-gray-300'
    }
  }

  switch (status) {
    case 'Insured':
      return {
        label: 'Insured',
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-50 dark:bg-green-900/20',
        borderColor: 'border-green-300 dark:border-green-600',
        textColor: 'text-green-700 dark:text-green-300'
      }
    case 'Not Insured':
      return {
        label: 'Not Insured',
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-50 dark:bg-red-900/20',
        borderColor: 'border-red-300 dark:border-red-600',
        textColor: 'text-red-700 dark:text-red-300'
      }
    default:
      return {
        label: 'Unknown',
        color: 'text-gray-500',
        bgColor: 'bg-gray-100 dark:bg-gray-700',
        borderColor: 'border-gray-300 dark:border-gray-600',
        textColor: 'text-gray-700 dark:text-gray-300'
      }
  }
}

export const canPerformAction = (insuranceStatus: InsuranceStatus | null | undefined): boolean => {
  return insuranceStatus === 'Insured'
}

export const getInsuranceWarningMessage = (action: 'checkout' | 'hire', registration: string): string => {
  const actionText = action === 'checkout' ? 'check out' : 'hire out'
  return `Vehicle ${registration} cannot be ${actionText} without insurance. It needs to be added back on insurance before going out!`
}

// ✅ NEW: Defleet Helper Functions
export const isValidDefleetReason = (reason: string): reason is DefleetReason => {
  return DEFLEET_REASONS.includes(reason as DefleetReason)
}

export const getDefleetReasonLabel = (reason: DefleetReason): string => {
  return reason
}

export const isVehicleDefleeted = (vehicle: Vehicle | FleetVehicle): boolean => {
  return vehicle.isDefleeted === true
}

// NEW: Helper functions for hire functionality
export const isVehicleInYard = (vehicle: CheckedInVehicle): boolean => {
  return vehicle.hireStatus === 'In Yard'
}

export const isVehicleOutOnHire = (vehicle: CheckedInVehicle): boolean => {
  return vehicle.hireStatus === 'Out on Hire'
}

export const getDisplayStatus = (vehicle: CheckedInVehicle): VehicleStatus => {
  if (vehicle.hireStatus === 'Out on Hire' && vehicle.originalStatus) {
    return vehicle.originalStatus
  }
  return vehicle.status
}

export const createHireAuditLog = (action: 'hired' | 'returned', userDisplayName: string, userId: string, notes?: string): AuditLog => {
  const actionText = action === 'hired' 
    ? `Set out on hire by ${userDisplayName}${notes ? ` - ${notes}` : ''}`
    : `Returned from hire by ${userDisplayName}${notes ? ` - ${notes}` : ''}`
  
  return {
    action: actionText,
    by: userId,
    byDisplayName: userDisplayName,
    timestamp: new Date()
  }
}

// 🔧 UPDATED: Helper function to create complete analytics object - COMPLETE with insurance breakdown + contract breakdown + hire analytics
export const createCompleteAnalytics = (partialAnalytics: Partial<Analytics> = {}): Analytics => {
  return {
    totalCount: partialAnalytics.totalCount || 0,
    readyCount: partialAnalytics.readyCount || 0,
    needsCheckingCount: partialAnalytics.needsCheckingCount || 0,
    pendingChecksCount: partialAnalytics.pendingChecksCount || 0,
    repairsNeededCount: partialAnalytics.repairsNeededCount || 0,
    nonStarterCount: partialAnalytics.nonStarterCount || 0,
    inYardCount: partialAnalytics.inYardCount || 0,
    outOnHireCount: partialAnalytics.outOnHireCount || 0,
    insuredCount: partialAnalytics.insuredCount || 0, // 🆕 NEW
    notInsuredCount: partialAnalytics.notInsuredCount || 0, // 🆕 NEW
    unknownInsuranceCount: partialAnalytics.unknownInsuranceCount || 0, // 🆕 NEW
    avgMileage: partialAnalytics.avgMileage || 0,
    motExpiringCount: partialAnalytics.motExpiringCount || 0,
    taxExpiringCount: partialAnalytics.taxExpiringCount || 0,
    conditionBreakdown: partialAnalytics.conditionBreakdown || {},
    locationBreakdown: partialAnalytics.locationBreakdown || {},
    sizeBreakdown: partialAnalytics.sizeBreakdown || {},
    statusBreakdown: partialAnalytics.statusBreakdown || {},
    contractBreakdown: partialAnalytics.contractBreakdown || {}, // NEW: Contract breakdown
    insuranceBreakdown: partialAnalytics.insuranceBreakdown || {}, // 🆕 NEW: Insurance breakdown
    statusCounts: partialAnalytics.statusCounts || {
      ready: 0,
      pendingChecks: 0,
      repairsNeeded: 0,
      nonStarter: 0
    },
    statusPercentages: partialAnalytics.statusPercentages || {
      ready: 0,
      pendingChecks: 0,
      repairsNeeded: 0,
      nonStarter: 0
    },
    hireAnalytics: partialAnalytics.hireAnalytics || {
      totalOutOnHire: 0,
      totalInYard: 0,
      hiresByBranch: {},
      averageHireDuration: 0,
      currentHires: []
    },
    todayCheckIns: partialAnalytics.todayCheckIns || 0,
    weekCheckIns: partialAnalytics.weekCheckIns || 0,
    averageStayTime: partialAnalytics.averageStayTime || 0
  }
}

// Helper function to check if user is active - COMPLETE
export const isUserActive = (user: UserProfile): boolean => {
  return user.isActive !== false
}

// Helper function to check if user is deleted - COMPLETE
export const isUserDeleted = (user: UserProfile): boolean => {
  return user.isDeleted === true
}

// Service booking interface - COMPLETE with External Provider Support
export interface ServiceBooking {
  id: string
  date: string
  timeSlot?: string
  customTime?: string
  registration: string
  make?: string
  model?: string
  workRequired: string | string[]
  isCustomVehicle: boolean
  notes?: string
  organizationId: string
  createdBy: string
  createdByName: string
  createdAt: Date
  updatedAt?: Date
  lastModifiedBy?: string
  lastModifiedByName?: string
  cancelledBy?: string
  cancelledByName?: string
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled' | 'checked_in_to_garage'
  isExternalProvider?: boolean
  externalProvider?: {
    garageName: string
    address: string
    customTime?: string
  }
  
  // NEW: Branch tracking fields
  originalBranchId?: string | null
  originalBranchName?: string | null
  vehicleRemovedFromBranch?: boolean
}

// Time slot interface for service bookings - COMPLETE
export interface TimeSlot {
  id: string
  label: string
  startTime: string
  endTime: string
  available?: boolean
}

// Checkout history interface - COMPLETE
export interface CheckoutHistory {
  id: string
  vehicleId: string
  registration: string
  make?: string
  model?: string
  condition?: string
  status?: VehicleStatus
  checkInTime: Date | string
  checkOutTime: Date | string
  duration?: number // in hours
  organizationId: string
  checkedOutBy: string
  checkedOutByName?: string
  notes?: string
  auditLog?: AuditLog
}

// 🔧 UPDATED: Fleet management interfaces - COMPLETE with insurance
export interface FleetImportData {
  registration: string
  make: string
  model: string
  colour: string
  size: string
  condition: string
  motExpiry?: string
  taxExpiry?: string
  comments?: string
  contract?: string // NEW: Contract field
  insuranceStatus?: InsuranceStatus // 🆕 NEW: Insurance field
  dateAcquired?: string | null // ✨ NEW: Date Acquired field
  vehicleDiagramType?: VehicleDiagramType | null   // which PNG to show
  damagePins?: DamagePin[]                          // array of placed pins
}

// Enhanced vehicle interfaces with fleet integration - COMPLETE
export interface VehicleWithFleetData extends CheckedInVehicle {
  isFromFleet?: boolean
  fleetId?: string
  lastFleetUpdate?: Date | string
}

// Reporting interfaces - COMPLETE
export interface ReportData {
  id: string
  title: string
  type: 'vehicle' | 'condition' | 'status' | 'analytics' | 'contract' | 'insurance' | 'external_garage' // 🆕 NEW: Added insurance type
  dateRange: {
    from: string
    to: string
  }
  filters: FilterConfig
  data: any[]
  generatedAt: Date | string
  generatedBy: string
  organizationId: string
}

// Notification interfaces - COMPLETE
export interface NotificationPreferences {
  id: string
  userId: string
  emailNotifications: boolean
  motExpiryAlerts: boolean
  taxExpiryAlerts: boolean
  dailyReports: boolean
  weeklyReports: boolean
  organizationId: string
}

// Settings interfaces - COMPLETE
export interface OrganizationSettings {
  id: string
  organizationId: string
  motExpiryThreshold: number // days before expiry to alert
  taxExpiryThreshold: number // days before expiry to alert
  defaultVehicleStatus: VehicleStatus
  allowBulkOperations: boolean
  requireApprovalForCheckout: boolean
  enableAuditLogging: boolean
  timezone: string
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
  currency: string
  updatedAt?: Date | string
  updatedBy?: string
}

// Dashboard widgets interface - COMPLETE
export interface DashboardWidget {
  id: string
  type: 'summary' | 'chart' | 'table' | 'metric'
  title: string
  position: {
    x: number
    y: number
    width: number
    height: number
  }
  config: Record<string, any>
  isVisible: boolean
  organizationId: string
  createdBy: string
}

// 🔧 UPDATED: Advanced filtering interface - COMPLETE with insurance filter
export interface AdvancedFilterConfig extends FilterConfig {
  tags?: string[]
  location?: string
  bay?: string
  userId?: string
  lastEditedBy?: string
  createdAfter?: string
  createdBefore?: string
  updatedAfter?: string
  updatedBefore?: string
  hasServiceBooking?: boolean
  expiringMot?: boolean
  expiringTax?: boolean
  customFields?: Record<string, any>
}

// Bulk operation interfaces - COMPLETE
export interface BulkOperation {
  id: string
  type: 'checkout' | 'update' | 'delete' | 'move'
  vehicleIds: string[]
  status: 'pending' | 'in-progress' | 'completed' | 'failed'
  progress: number // 0-100
  startedAt?: Date | string
  completedAt?: Date | string
  startedBy: string
  results?: {
    successful: number
    failed: number
    errors: string[]
  }
  organizationId: string
}

// Integration interfaces - COMPLETE
export interface ExternalIntegration {
  id: string
  name: string
  type: 'api' | 'webhook' | 'file' | 'database'
  isActive: boolean
  config: Record<string, any>
  lastSync?: Date | string
  syncStatus: 'success' | 'error' | 'pending'
  organizationId: string
}

// Template interfaces for common operations - COMPLETE
export interface VehicleTemplate {
  id: string
  name: string
  description?: string
  defaultValues: Partial<VehicleFormData>
  isDefault: boolean
  organizationId: string
  createdBy: string
  createdAt: Date | string
}

// Permission and role interfaces - COMPLETE
export interface Permission {
  id: string
  name: string
  description: string
  resource: string
  action: string
}

export interface Role {
  id: string
  name: string
  description: string
  permissions: Permission[]
  isDefault: boolean
  organizationId: string
}

// Enhanced user profile with role-based permissions - COMPLETE
export interface EnhancedUserProfile extends UserProfile {
  roleDetails?: Role
  lastLoginAt?: Date | string
  preferences?: {
    dashboard: {
      defaultView: 'table' | 'cards'
      itemsPerPage: number
      defaultFilters: Partial<FilterConfig>
    }
    notifications: NotificationPreferences
  }
}

// Activity log interface for tracking user actions - COMPLETE
export interface ActivityLog {
  id: string
  userId: string
  userDisplayName?: string
  action: string
  resource: string
  resourceId?: string
  details?: Record<string, any>
  timestamp: Date | string
  organizationId: string
  ipAddress?: string
  userAgent?: string
}

// System health and monitoring - COMPLETE
export interface SystemMetrics {
  totalUsers: number
  totalOrganizations: number
  totalVehicles: number
  systemUptime: number
  memoryUsage: number
  diskUsage: number
  responseTime: number
  errorRate: number
  timestamp: Date | string
}

// Feature flag interface - COMPLETE
export interface FeatureFlag {
  id: string
  name: string
  description: string
  isEnabled: boolean
  rolloutPercentage: number
  targetUsers?: string[]
  targetOrganizations?: string[]
  conditions?: Record<string, any>
}

// Backup and restore interfaces - COMPLETE
export interface BackupData {
  id: string
  organizationId: string
  type: 'full' | 'partial'
  size: number
  createdAt: Date | string
  createdBy: string
  status: 'creating' | 'completed' | 'failed'
  downloadUrl?: string
  expiresAt?: Date | string
}

// Migration interfaces for data updates - COMPLETE
export interface MigrationTask {
  id: string
  name: string
  description: string
  version: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  startedAt?: Date | string
  completedAt?: Date | string
  error?: string
}