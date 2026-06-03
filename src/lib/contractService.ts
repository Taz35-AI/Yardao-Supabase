// src/lib/contractService.ts — SUPABASE re-implementation.
// Standalone contractService (distinct from the contractService inside
// firestore.ts). Public interface + method signatures + the per-org read cache
// are kept identical; only the internals swap Firestore → Supabase.

import { supabase } from '@/lib/supabaseClient'
import { toCamel, toCamelList, toSnake } from '@/lib/dbMap'
import { Contract } from '@/types'
import { logger } from '@/lib/logger'

const CONTRACTS_COLLECTION = 'contracts'

// ── Read cache ────────────────────────────────────────────────────────────────
// Contracts are reference data (name/colour/isDefault) that change ~never but
// were re-read in full on every form mount / branch remount. Cache the per-org
// list for the browser session; every write below busts it so edits show
// immediately on the editing device. TTL is a safety net for edits made on a
// different device. (Same pattern as conditionService.)
const CONTRACTS_TTL_MS = 5 * 60 * 1000
const contractsCache = new Map<string, { data: Contract[]; ts: number }>()

function clearContractsCache(organizationId?: string) {
  if (organizationId) contractsCache.delete(organizationId)
  else contractsCache.clear()
}

export const contractService = {
  /** Clear the in-memory contracts cache (one org, or all). */
  invalidate(organizationId?: string) {
    clearContractsCache(organizationId)
  },

  /**
   * Get all contracts for an organization.
   * Served from the session cache when fresh; pass { force: true } to bypass.
   */
  async getContracts(
    organizationId: string,
    opts?: { force?: boolean }
  ): Promise<Contract[]> {
    if (!opts?.force) {
      const cached = contractsCache.get(organizationId)
      if (cached && Date.now() - cached.ts < CONTRACTS_TTL_MS) {
        return cached.data.map(c => ({ ...c }))
      }
    }
    try {
      logger.log('📋 Getting contracts for organization:', organizationId)

      const { data, error } = await supabase
        .from(CONTRACTS_COLLECTION)
        .select('*')
        .eq('organization_id', organizationId)
        .order('name', { ascending: true })
      if (error) throw error

      const contracts = toCamelList<Contract>(data)

      logger.log('✅ Retrieved contracts:', contracts.length)
      contractsCache.set(organizationId, { data: contracts, ts: Date.now() })
      return contracts.map(c => ({ ...c }))
    } catch (error) {
      logger.error('❌ Error getting contracts:', error)
      throw error
    }
  },

  /**
   * Add a new contract
   */
  async addContract(contract: Omit<Contract, 'id' | 'createdAt'>): Promise<Contract> {
    try {
      const cleanName = (contract.name || '').trim()
      if (!cleanName) {
        throw new Error('Contract name is required')
      }

      // Guard: contract names must be unique within an organization. Duplicate
      // names are the root cause of inconsistent badge colours (a vehicle can
      // match the wrong same-named contract), so we reject them up front.
      const existing = await this.getContracts(contract.organizationId, { force: true })
      const duplicate = existing.find(
        c => c.name.trim().toLowerCase() === cleanName.toLowerCase()
      )
      if (duplicate) {
        throw new Error(`A contract named "${cleanName}" already exists.`)
      }

      logger.log('➕ Adding new contract:', cleanName, 'with color:', contract.color)

      const contractData = {
        ...contract,
        name: cleanName,
        isDefault: contract.isDefault || false,
        color: contract.color || '#025940', // Default to brand green if no color provided
      }

      const { data, error } = await supabase
        .from(CONTRACTS_COLLECTION)
        .insert(toSnake(contractData))
        .select()
        .single()
      if (error) throw error
      const newContract = toCamel<Contract>(data) as Contract
      clearContractsCache(contract.organizationId)

      logger.log('✅ Contract added successfully:', newContract.id)
      return newContract
    } catch (error) {
      logger.error('❌ Error adding contract:', error)
      throw error
    }
  },

  /**
   * Update an existing contract
   */
  async updateContract(
    contractId: string,
    updates: Partial<Pick<Contract, 'name' | 'color'>>
  ): Promise<void> {
    try {
      logger.log('📝 Updating contract:', contractId, updates)

      const { error } = await supabase
        .from(CONTRACTS_COLLECTION)
        .update(toSnake({ ...updates, updatedAt: new Date().toISOString() }))
        .eq('id', contractId)
      if (error) throw error
      clearContractsCache()

      logger.log('✅ Contract updated successfully')
    } catch (error) {
      logger.error('❌ Error updating contract:', error)
      throw error
    }
  },

  /**
   * Delete a contract
   */
  async deleteContract(contractId: string): Promise<void> {
    try {
      logger.log('🗑️ Deleting contract:', contractId)

      const { error } = await supabase.from(CONTRACTS_COLLECTION).delete().eq('id', contractId)
      if (error) throw error
      clearContractsCache()

      logger.log('✅ Contract deleted successfully')
    } catch (error) {
      logger.error('❌ Error deleting contract:', error)
      throw error
    }
  },

  /**
   * Initialize default contracts for a new organization
   */
  async initializeDefaultContracts(organizationId: string, createdBy: string): Promise<Contract[]> {
    logger.log('🚀 Creating default contracts for organization:', organizationId)

    const defaultContracts = [
      {
        name: 'Standard Contract',
        color: '#025940', // Brand green
        organizationId,
        isDefault: true,
        createdBy,
      },
      {
        name: 'Premium Contract',
        color: '#10b981', // Green
        organizationId,
        isDefault: false,
        createdBy,
      },
      {
        name: 'Emergency Contract',
        color: '#ef4444', // Red
        organizationId,
        isDefault: false,
        createdBy,
      },
    ]

    const createdContracts: Contract[] = []

    for (const contractData of defaultContracts) {
      try {
        const contract = await this.addContract(contractData)
        createdContracts.push(contract)
        logger.log(`✅ Created contract: ${contract.name}`)
      } catch (error) {
        logger.error(`❌ Failed to create contract ${contractData.name}:`, error)
      }
    }

    logger.log(`🎉 Created ${createdContracts.length} default contracts`)
    return createdContracts
  },

  /**
   * Check if contracts exist for an organization
   */
  async hasContracts(organizationId: string): Promise<boolean> {
    try {
      const contracts = await this.getContracts(organizationId)
      return contracts.length > 0
    } catch (error) {
      logger.error('Error checking if contracts exist:', error)
      return false
    }
  },

  /**
   * Get default contract for an organization
   */
  async getDefaultContract(organizationId: string): Promise<Contract | null> {
    try {
      const contracts = await this.getContracts(organizationId)
      return contracts.find(contract => contract.isDefault) || null
    } catch (error) {
      logger.error('Error getting default contract:', error)
      return null
    }
  },
}

export default contractService
