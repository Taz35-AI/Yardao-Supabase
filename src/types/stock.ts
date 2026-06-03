// src/types/stock.ts
// Stock Management Types for Yardao
// ✅ ENHANCED: Added StockAdjustment type for stock corrections
// ✅ NEW: makeModel is now an array to support multiple makes/models per part

export interface StockPart {
  id?: string
  partName: string
  partNumber: string
  makeModel: string[]  // ✅ CHANGED: Now accepts multiple makes/models
  quantity: number
  netPrice: number
  restockTarget: number
  unit: 'pieces' | 'liters'
  supplier?: string
  comments?: string  // ✅ NEW: Optional comments field
  organizationId: string
  createdAt: string
  createdBy: string
  updatedAt?: string
  lastUsedDate?: string
  totalUsageCount?: number
  isOneOff?: boolean              // ← ADD THIS
  linkedRegistration?: string | null  // ← ADD THIS
  linkedVehicleId?: string | null     // ← ADD THIS
}

export interface OrderHistoryRecord {
  id?: string
  partId: string
  partName: string
  partNumber: string
  supplier?: string
  quantityOrdered: number
  unit: 'pieces' | 'liters'
  netPrice: number
  totalCost: number
  orderedBy: string
  orderedByName: string
  orderedAt: string
  organizationId: string
  orderType: 'initial' | 'restock'
}

export interface PartUsageRecord {
  id?: string
  partId: string
  partName: string
  partNumber: string
  vehicleId: string
  vehicleRegistration: string
  /** Canonical reg key (uppercase, no spaces). Present on rows written
   *  after the custom-vehicle parts work; the join key for non-fleet
   *  vehicles whose usage can't be fetched by vehicleId. */
  vehicleRegistrationKey?: string
  quantityUsed: number
  unit: 'pieces' | 'liters'
  usedBy: string
  usedByName: string
  usedAt: string
  notes?: string
  organizationId: string
  netPrice: number
  totalCost: number
}

// ✅ NEW: Stock Adjustment interface
export interface StockAdjustment {
  id?: string
  partId: string
  partName: string
  partNumber: string
  adjustmentType: 'add' | 'remove'
  quantity: number
  reason: 'count_correction' | 'damaged' | 'lost_stolen' | 'return_supplier' | 'transfer' | 'expired' | 'other'
  notes: string
  previousStock: number
  newStock: number
  adjustedBy: string
  adjustedByName: string
  adjustedAt: string
  organizationId: string
  unit: 'pieces' | 'liters'
}

export interface LabourLine {
  id: string
  description: string
  hours: number
  rate: number
  total: number
}

export interface InvoicePart {
  partId: string
  partName: string
  partNumber: string
  quantity: number
  unitPrice: number
  total: number
}

export interface Invoice {
  id?: string
  invoiceNumber: string
  invoiceDate: string
  vehicleId: string
  vehicleRegistration: string
  vehicleMake?: string
  vehicleModel?: string
  vehicleMileage?: string   // odometer reading, shown as "ODO: " on the invoice
  fromCompany: string
  toCompany: string
  parts: InvoicePart[]
  labour: LabourLine[]
  subtotal: number
  discount?: number          // amount deducted (applied to the net, before VAT)
  discountPercent?: number   // the % used, for the record
  markupPercent?: number     // parts markup % applied, for the record
  vat?: number
  total: number
  fromLogo?: string          // base64 logo of the invoicing business
  createdAt: string
  createdBy: string
  createdByName: string
  organizationId: string
  status: 'draft' | 'issued' | 'paid'
}

// Labour presets for quick add
export const LABOUR_PRESETS = {
  service: { description: 'Service', hours: 1.5 },
  brakePadsFront: { description: 'Brake Pads Front', hours: 1 },
  brakePadsRear: { description: 'Brake Pads Rear', hours: 1 },
  driveshafts: { description: 'Driveshafts', hours: 2 },
  tyreNSF: { description: 'Tyre NSF', hours: 0.333 },
  tyreOSF: { description: 'Tyre OSF', hours: 0.333 },
  tyreNSR: { description: 'Tyre NSR', hours: 0.333 },
  tyreOSR: { description: 'Tyre OSR', hours: 0.333 },
} as const

export const DEFAULT_LABOUR_RATE = 50 // £50/hour default
export const VAT_RATE = 0.20 // 20% VAT