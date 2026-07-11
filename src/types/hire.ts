// src/types/hire.ts
// Hire Management — TypeScript mirror of migrations 0046–0049 (camelCase).
// Spine: RentalCustomer → HireAgreement → HireAgreementVehicle (line).
// The vehicle LINE is the unit of proration.

export type HireRateType = 'weekly' | 'monthly'
export type HireDurationUnit = 'weeks' | 'months'
export type HireAgreementStatus = 'draft' | 'active' | 'completed' | 'cancelled'
export type HireLineStatus = 'scheduled' | 'active' | 'returned' | 'swapped' | 'cancelled'
export type HireCreditReason = 'downtime' | 'early_return' | 'manual'
export type HireCreditStatus = 'suggested' | 'approved' | 'ignored' | 'resolved'

/** A rental hire customer — SEPARATE from garage/service customers. */
export interface RentalCustomer {
  id: string
  organizationId: string
  name: string
  isBusiness: boolean
  companyName?: string | null
  accountNo?: string | null
  contactName?: string | null
  phone?: string | null
  email?: string | null
  billingEmail?: string | null
  billingAddress?: string | null
  accountManager?: string | null
  // Richer B2B record (migration 0053). All optional.
  address?: string | null
  companyNumber?: string | null
  vatNumber?: string | null
  website?: string | null
  bankAccountName?: string | null
  bankSortCode?: string | null
  bankAccountNumber?: string | null
  /** Per-customer PCN/damage admin fee (ex VAT), e.g. 15 or 25 (migration 0062). */
  pcnAdminFee?: number | null
  notes?: string | null
  isActive: boolean
  createdAt: string
  updatedAt?: string | null
}

// ── PCNs & damages charge ledger (migration 0062) ────────────────────────────

export type HireChargeType = 'pcn' | 'damage'
export type HirePcnKind = 'nominated' | 'paid'
export type HireChargeStatus = 'outstanding' | 'paid' | 'waived'

export interface HireCharge {
  id: string
  organizationId: string
  chargeType: HireChargeType
  pcnKind?: HirePcnKind | null
  reference?: string | null
  issuer?: string | null
  registration?: string | null
  vehicleId?: string | null
  customerId?: string | null
  customerName?: string | null
  agreementId?: string | null
  agreementReference?: string | null
  lineId?: string | null
  incidentDate?: string | null // YYYY-MM-DD
  description?: string | null
  baseAmount: number
  adminFee: number
  vatAmount: number
  totalAmount: number
  status: HireChargeStatus
  paidAt?: string | null
  notes?: string | null
  createdBy?: string | null
  createdByName?: string | null
  createdAt: string
  updatedAt?: string | null
}

/** A document on a hire customer. Fleet insurance (with expiry) gates hiring. */
export interface RentalCustomerDocument {
  id: string
  organizationId: string
  customerId: string
  docType: string // 'fleet_insurance' | 'credit_agreement' | ...
  reference?: string | null
  expiryDate?: string | null // YYYY-MM-DD
  fileUrl?: string | null
  notes?: string | null
  createdAt: string
}

/** The hire agreement (renamable in UI) — the spine. */
export interface HireAgreement {
  id: string
  organizationId: string
  branchId?: string | null
  branchName?: string | null
  customerId?: string | null
  customerName?: string | null
  reference?: string | null
  startDate: string // YYYY-MM-DD
  durationValue: number
  durationUnit: HireDurationUnit
  endDate?: string | null // computed
  rateType: HireRateType
  rateAmount: number
  /** Weekly only: weekday to bill on (0=Sun…6=Sat). null = same as start day. */
  chargeDay?: number | null
  /** Rolling/flexi: 4-week minimum then open-ended (no fixed end_date). */
  isRolling?: boolean
  currency: string
  status: HireAgreementStatus
  notes?: string | null
  createdBy?: string | null
  createdByName?: string | null
  createdAt: string
  updatedAt?: string | null
}

/** A vehicle line on an agreement — the unit of proration. */
export interface HireAgreementVehicle {
  id: string
  organizationId: string
  agreementId: string
  vehicleId?: string | null
  registration?: string | null
  make?: string | null
  model?: string | null
  scheduledStart?: string | null // YYYY-MM-DD
  scheduledEnd?: string | null
  actualOutAt?: string | null
  actualReturnAt?: string | null
  status: HireLineStatus
  swappedFromLineId?: string | null
  swappedToLineId?: string | null
  lineRateType?: HireRateType | null
  lineRateAmount?: number | null
  notes?: string | null
  createdAt: string
  updatedAt?: string | null
}

/** Swap log entry — one line closed, the next opened on the same agreement. */
export interface HireSwap {
  id: string
  organizationId: string
  agreementId?: string | null
  fromLineId?: string | null
  fromRegistration?: string | null
  toLineId?: string | null
  toRegistration?: string | null
  swappedAt: string
  reason?: string | null
  performedBy?: string | null
  performedByName?: string | null
  createdAt: string
}

/** A suggested credit (downtime / early return) — visibility only. */
export interface HireCredit {
  id: string
  organizationId: string
  agreementId?: string | null
  lineId?: string | null
  vehicleId?: string | null
  registration?: string | null
  reason: HireCreditReason
  periodStart?: string | null
  periodEnd?: string | null
  days?: number | null
  dailyRate?: number | null
  estimatedCredit?: number | null
  status: HireCreditStatus
  reviewedBy?: string | null
  reviewedByName?: string | null
  notes?: string | null
  createdAt: string
  updatedAt?: string | null
}

/** Org hire preferences, incl. the renamable agreement label. */
export interface HireSettings {
  agreementLabelSingular: string
  agreementLabelPlural: string
  prorationBasis: 'calendar'
  /** UIDs (besides the org owner) allowed to see/use the Hire section. */
  accessUserIds: string[]
}

export const DEFAULT_HIRE_SETTINGS: HireSettings = {
  agreementLabelSingular: 'Hire Agreement',
  agreementLabelPlural: 'Hire Agreements',
  prorationBasis: 'calendar',
  accessUserIds: [],
}
