// src/lib/services/settingsService.ts
// ✅ EXTENDED: Added Insurance Policies management

import { db } from '@/lib/firebase'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { logger } from '@/lib/logger'
import { VehicleStatus } from '@/types'

const COLLECTION = 'organizationSettings'

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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Ensure the settings doc exists before updating it */
async function ensureSettingsDoc(organizationId: string): Promise<void> {
  const docRef = doc(db, COLLECTION, organizationId)
  const docSnap = await getDoc(docRef)
  if (!docSnap.exists()) {
    await setDoc(docRef, {
      suppliers: [],
      fromCompanies: [],
      toCompanies: [],
      insurancePolicies: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export const settingsService = {

  // ==================== SUPPLIERS ====================

  async getSuppliers(organizationId: string): Promise<string[]> {
    try {
      const docSnap = await getDoc(doc(db, COLLECTION, organizationId))
      if (docSnap.exists()) {
        return (docSnap.data() as OrganizationSettings).suppliers || []
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
      await updateDoc(doc(db, COLLECTION, organizationId), {
        suppliers,
        updatedAt: new Date().toISOString(),
      })
    } catch (error) {
      logger.error('Error saving suppliers:', error)
      throw error
    }
  },

  // ==================== FROM COMPANIES ====================

  async getFromCompanies(organizationId: string): Promise<FromCompanyDetails[]> {
    try {
      const docSnap = await getDoc(doc(db, COLLECTION, organizationId))
      if (docSnap.exists()) {
        return (docSnap.data() as OrganizationSettings).fromCompanies || []
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
      await updateDoc(doc(db, COLLECTION, organizationId), {
        fromCompanies,
        updatedAt: new Date().toISOString(),
      })
    } catch (error) {
      logger.error('Error saving from companies:', error)
      throw error
    }
  },

  // ==================== TO COMPANIES ====================

  async getToCompanies(organizationId: string): Promise<ToCompanyDetails[]> {
    try {
      const docSnap = await getDoc(doc(db, COLLECTION, organizationId))
      if (docSnap.exists()) {
        return (docSnap.data() as OrganizationSettings).toCompanies || []
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
      await updateDoc(doc(db, COLLECTION, organizationId), {
        toCompanies,
        updatedAt: new Date().toISOString(),
      })
    } catch (error) {
      logger.error('Error saving to companies:', error)
      throw error
    }
  },

  // ==================== INSURANCE POLICIES ====================

  async getInsurancePolicies(organizationId: string): Promise<InsurancePolicy[]> {
    try {
      const docSnap = await getDoc(doc(db, COLLECTION, organizationId))
      if (docSnap.exists()) {
        return (docSnap.data() as OrganizationSettings).insurancePolicies || []
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
      await updateDoc(doc(db, COLLECTION, organizationId), {
        insurancePolicies,
        updatedAt: new Date().toISOString(),
      })
    } catch (error) {
      logger.error('Error saving insurance policies:', error)
      throw error
    }
  },

  // ==================== CONTRACT DEFAULT STATUSES ====================

  async getContractDefaultStatuses(organizationId: string): Promise<ContractDefaultStatuses> {
    try {
      const docSnap = await getDoc(doc(db, COLLECTION, organizationId))
      if (docSnap.exists()) {
        return (docSnap.data() as OrganizationSettings).contractDefaultStatuses || {}
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
      await updateDoc(doc(db, COLLECTION, organizationId), {
        contractDefaultStatuses,
        updatedAt: new Date().toISOString(),
      })
    } catch (error) {
      logger.error('Error saving contract default statuses:', error)
      throw error
    }
  },
}