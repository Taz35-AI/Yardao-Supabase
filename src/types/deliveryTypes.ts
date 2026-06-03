// src/types/deliveryTypes.ts
import { DeliveryDefleelEntry, DeliveryOperationType } from '@/components/features/deliveries-defleet/DeliveriesDefleetContent'

/**
 * Extended entry type for editing state
 */
export interface EditingEntry extends DeliveryDefleelEntry {
  isEditing?: boolean
  hasChanges?: boolean
  editDate?: string
}

/**
 * Form data structure for new entry creation
 */
export interface NewEntryData {
  operationType: DeliveryOperationType
  date: string
  registration: string
  make: string
  model: string
  notes: string
  expectedArrival: string
  supplier: string
  isFleetVehicle: boolean
  defleetReason: string
  defleetDestination: string
}

/**
 * Props for VehicleSearchInput component
 */
export interface VehicleSearchInputProps {
  value: string
  onChange: (value: string) => void
  onVehicleSelect: (vehicle: any) => void
  vehicles: any[]
  operationType: DeliveryOperationType
  placeholder?: string
}

/**
 * Props for EntryCard component
 */
export interface EntryCardProps {
  entry: DeliveryDefleelEntry
  onEdit: (entryId: string) => void
  onDelete: (entryId: string) => void
  onMarkComplete?: (entryId: string) => void
}

/**
 * Props for NewEntryForm component
 */
export interface NewEntryFormProps {
  newEntryData: NewEntryData
  vehicles: any[]
  onDataChange: (field: keyof NewEntryData, value: any) => void
  onVehicleSelect: (vehicle: any) => void
  onSubmit: () => void
  onCancel: () => void
}

/**
 * Props for DayDetailsModal component
 */
export interface DayDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  selectedDate: Date | null
  entries: DeliveryDefleelEntry[]
  vehicles: any[]
  onUpdateEntry: (
    entryId: string,
    entryData: Omit<DeliveryDefleelEntry, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'>
  ) => Promise<boolean>
  onDeleteEntry: (entryId: string) => Promise<boolean>
  onCreateEntry: (
    entryData: Omit<DeliveryDefleelEntry, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'>
  ) => Promise<boolean>
  onMarkComplete?: (entryId: string) => Promise<boolean>
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