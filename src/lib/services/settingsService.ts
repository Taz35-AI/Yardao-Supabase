// src/lib/services/settingsService.ts — SUPABASE re-implementation.
//
// ⚠️ Data-layer swap: every EXPORT, TYPE and method SIGNATURE below is kept
// identical to the original Firestore version; only the INTERNALS change.
//
// The Firestore doc `organizationSettings/{organizationId}` becomes a single
// row in public.organization_settings keyed by the unique organization_id.
// suppliers / from_companies / to_companies / insurance_policies /
// contract_default_statuses are jsonb columns (added in migration 0010); their
// element shapes (FromCompanyDetails, InsurancePolicy, …) are stored verbatim
// so the camel-cased contents pass through untouched. RLS scopes every query
// to the caller's org.

import { supabase } from '@/lib/supabaseClient'
import { logger } from '@/lib/logger'
import { VehicleStatus } from '@/types'

const TABLE = 'organization_settings'

// Map of contractId → default check-in VehicleStatus to apply when a vehicle
// is checked in under that contract. Contracts not in the map fall back to
// the form's hardcoded default ('Pending checks').
export type ContractDefaultStatuses = Record<string, VehicleStatus>

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FromCompanyDetails {
  name: string
  address: string
  postcode: string
  vatNumber: string
  companyRegNo: string
  logo?: string            // base64 data URL, shown top-right on the invoice
  partsMarkupPercent?: number  // % added on top of part costs (parts only)
  discountPercent?: number     // % discount applied to the net (own invoice line)
  labourRate?: number          // £/hour override for invoices from this company
  // Bank / payment details — shown bottom-left of the invoice so customers can pay.
  bankName?: string
  sortCode?: string
  accountNumber?: string
}

export interface ToCompanyDetails {
  name: string
  address: string
  postcode: string
  email?: string
}

// ✅ NEW: Insurance Policy stored in organizationSettings
export interface InsurancePolicy {
  id: string           // crypto.randomUUID() generated client-side
  name: string         // e.g. "Fleet Policy A"
  provider: string     // e.g. "Aviva"
  policyNumber: string // e.g. "AV-2024-001234"
  expiryDate: string   // ISO date "YYYY-MM-DD"
  notes?: string
  createdAt: string    // ISO timestamp
}

interface OrganizationSettings {
  suppliers: string[]
  fromCompanies: FromCompanyDetails[]
  toCompanies: ToCompanyDetails[]
  insurancePolicies: InsurancePolicy[] // ✅ NEW
  contractDefaultStatuses?: ContractDefaultStatuses // per-contract check-in default
  createdAt?: string
  updatedAt?: string
}

// ✅ NEW: Check-in / service preferences (jsonb column service_settings, migration 0043)
export interface ServiceSettings {
  // Require a mileage reading to check a vehicle into the yard.
  captureMileageOnCheckIn: boolean
  // Flag vehicles that are overdue for a service (mileage since last service).
  serviceDueEnabled: boolean
  // Miles-since-last-service that trips the "service due" flag.
  serviceDueThresholdMiles: number
}

// Sensible defaults applied whenever the column is null / a field is missing,
// so the feature works out of the box and old orgs don't need a backfill.
export const DEFAULT_SERVICE_SETTINGS: ServiceSettings = {
  captureMileageOnCheckIn: true,
  serviceDueEnabled: true,
  serviceDueThresholdMiles: 10000,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Ensure the settings row exists before updating it. */
async function ensureSettingsDoc(organizationId: string): Promise<void> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('organization_id')
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    const { error: insertError } = await supabase.from(TABLE).insert({
      organization_id: organizationId,
      suppliers: [],
      from_companies: [],
      to_companies: [],
      insurance_policies: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    if (insertError) throw insertError
  }
}

/** Fetch the single settings row for an org (or null if it doesn't exist). */
async function getSettingsRow(organizationId: string): Promise<any | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw error
  return data
}

// ── Service ───────────────────────────────────────────────────────────────────

export const settingsService = {

  // ==================== SUPPLIERS ====================

  async getSuppliers(organizationId: string): Promise<string[]> {
    try {
      const row = await getSettingsRow(organizationId)
      if (row) {
        return (row.suppliers as string[]) || []
      }
      return []
    } catch (error) {
      logger.error('Error getting suppliers:', error)
      throw error
    }
  },

  async saveSuppliers(organizationId: string, suppliers: string[]): Promise<void> {
    try {
      await ensureSettingsDoc(organizationId)
      const { error } = await supabase
        .from(TABLE)
        .update({ suppliers, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
      if (error) throw error
    } catch (error) {
      logger.error('Error saving suppliers:', error)
      throw error
    }
  },

  // ==================== FROM COMPANIES ====================

  async getFromCompanies(organizationId: string): Promise<FromCompanyDetails[]> {
    try {
      const row = await getSettingsRow(organizationId)
      if (row) {
        return (row.from_companies as FromCompanyDetails[]) || []
      }
      return []
    } catch (error) {
      logger.error('Error getting from companies:', error)
      throw error
    }
  },

  async saveFromCompanies(organizationId: string, fromCompanies: FromCompanyDetails[]): Promise<void> {
    try {
      await ensureSettingsDoc(organizationId)
      const { error } = await supabase
        .from(TABLE)
        .update({ from_companies: fromCompanies, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
      if (error) throw error
    } catch (error) {
      logger.error('Error saving from companies:', error)
      throw error
    }
  },

  // ==================== TO COMPANIES ====================

  async getToCompanies(organizationId: string): Promise<ToCompanyDetails[]> {
    try {
      const row = await getSettingsRow(organizationId)
      if (row) {
        return (row.to_companies as ToCompanyDetails[]) || []
      }
      return []
    } catch (error) {
      logger.error('Error getting to companies:', error)
      throw error
    }
  },

  async saveToCompanies(organizationId: string, toCompanies: ToCompanyDetails[]): Promise<void> {
    try {
      await ensureSettingsDoc(organizationId)
      const { error } = await supabase
        .from(TABLE)
        .update({ to_companies: toCompanies, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
      if (error) throw error
    } catch (error) {
      logger.error('Error saving to companies:', error)
      throw error
    }
  },

  // ==================== INSURANCE POLICIES ====================

  async getInsurancePolicies(organizationId: string): Promise<InsurancePolicy[]> {
    try {
      const row = await getSettingsRow(organizationId)
      if (row) {
        return (row.insurance_policies as InsurancePolicy[]) || []
      }
      return []
    } catch (error) {
      logger.error('Error getting insurance policies:', error)
      throw error
    }
  },

  async saveInsurancePolicies(organizationId: string, insurancePolicies: InsurancePolicy[]): Promise<void> {
    try {
      await ensureSettingsDoc(organizationId)
      const { error } = await supabase
        .from(TABLE)
        .update({ insurance_policies: insurancePolicies, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
      if (error) throw error
    } catch (error) {
      logger.error('Error saving insurance policies:', error)
      throw error
    }
  },

  // ==================== CONTRACT DEFAULT STATUSES ====================

  async getContractDefaultStatuses(organizationId: string): Promise<ContractDefaultStatuses> {
    try {
      const row = await getSettingsRow(organizationId)
      if (row) {
        return (row.contract_default_statuses as ContractDefaultStatuses) || {}
      }
      return {}
    } catch (error) {
      logger.error('Error getting contract default statuses:', error)
      throw error
    }
  },

  async saveContractDefaultStatuses(
    organizationId: string,
    contractDefaultStatuses: ContractDefaultStatuses
  ): Promise<void> {
    try {
      await ensureSettingsDoc(organizationId)
      const { error } = await supabase
        .from(TABLE)
        .update({ contract_default_statuses: contractDefaultStatuses, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
      if (error) throw error
    } catch (error) {
      logger.error('Error saving contract default statuses:', error)
      throw error
    }
  },

  // ==================== SERVICE / CHECK-IN SETTINGS ====================

  /** Org's check-in/service preferences, defaults applied for any missing field. */
  async getServiceSettings(organizationId: string): Promise<ServiceSettings> {
    try {
      const row = await getSettingsRow(organizationId)
      const stored = (row?.service_settings as Partial<ServiceSettings> | null) || {}
      return {
        captureMileageOnCheckIn:
          typeof stored.captureMileageOnCheckIn === 'boolean'
            ? stored.captureMileageOnCheckIn
            : DEFAULT_SERVICE_SETTINGS.captureMileageOnCheckIn,
        serviceDueEnabled:
          typeof stored.serviceDueEnabled === 'boolean'
            ? stored.serviceDueEnabled
            : DEFAULT_SERVICE_SETTINGS.serviceDueEnabled,
        serviceDueThresholdMiles:
          typeof stored.serviceDueThresholdMiles === 'number' && stored.serviceDueThresholdMiles > 0
            ? stored.serviceDueThresholdMiles
            : DEFAULT_SERVICE_SETTINGS.serviceDueThresholdMiles,
      }
    } catch (error) {
      logger.error('Error getting service settings:', error)
      // Never break check-in over a settings read — fall back to defaults.
      return { ...DEFAULT_SERVICE_SETTINGS }
    }
  },

  async saveServiceSettings(organizationId: string, settings: ServiceSettings): Promise<void> {
    try {
      await ensureSettingsDoc(organizationId)
      const { error } = await supabase
        .from(TABLE)
        .update({ service_settings: settings, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
      if (error) throw error
    } catch (error) {
      logger.error('Error saving service settings:', error)
      throw error
    }
  },

  // ==================== INVOICE LABOUR RATE ====================

  /** Org-wide default labour rate (£/hour). Falls back to 50 until set. */
  async getDefaultLabourRate(organizationId: string): Promise<number> {
    try {
      const row = await getSettingsRow(organizationId)
      const v = row?.default_labour_rate
      return typeof v === 'number' && v > 0 ? v : (v != null && Number(v) > 0 ? Number(v) : 50)
    } catch (error) {
      logger.error('Error getting default labour rate:', error)
      return 50
    }
  },

  async saveDefaultLabourRate(organizationId: string, rate: number): Promise<void> {
    try {
      await ensureSettingsDoc(organizationId)
      const { error } = await supabase
        .from(TABLE)
        .update({ default_labour_rate: rate, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
      if (error) throw error
    } catch (error) {
      logger.error('Error saving default labour rate:', error)
      throw error
    }
  },
}
