// src/lib/organizationService.ts — SUPABASE re-implementation.
// Standalone organizationService (distinct from the organizationService inside
// firestore.ts). Public interface + method signatures are kept identical; only
// the internals swap Firestore → Supabase. Its own Organization interface is
// preserved verbatim.

import { supabase } from '@/lib/supabaseClient'
import { toCamel, toCamelList, toSnake } from '@/lib/dbMap'
import { conditionService } from './conditionService'
import { logger } from '@/lib/logger'

export interface Organization {
  id?: string
  name: string
  description?: string
  createdBy: string
  createdAt: string
  updatedAt: string
  memberCount: number
}

const ORGANIZATIONS_COLLECTION = 'organizations'

export const organizationService = {
  /**
   * ✅ FIXED: Create organization AND initialize default conditions atomically
   * This ensures conditions are created ONCE during org creation.
   *
   * Org creation is delegated to the create_organization SECURITY DEFINER RPC
   * (migration 0003): it inserts the org, joins the caller as admin and seeds
   * the default conditions in one RLS-safe transaction — a direct client INSERT
   * would be blocked because the new org_id JWT claim doesn't exist yet. We then
   * refresh the session so the re-issued JWT carries org_id, and call
   * initializeDefaultConditions (idempotent — returns the already-seeded rows).
   */
  async createOrganization(
    organization: Omit<Organization, 'id' | 'createdAt' | 'updatedAt' | 'memberCount'>
  ): Promise<Organization> {
    logger.log('🏢 Creating organization:', organization.name)

    try {
      // Step 1: Create organization (RLS-safe via RPC)
      const { data: orgId, error } = await supabase.rpc('create_organization', {
        p_name: organization.name,
        p_description: organization.description ?? null,
      })
      if (error) throw error

      logger.log(`✅ Organization created with ID: ${orgId}`)

      // Re-issue the JWT so it carries the new org_id claim; without this the
      // RLS-scoped reads/writes below would be empty/denied.
      await supabase.auth.refreshSession()

      // Step 2: ✅ CRITICAL FIX - Initialize default conditions IMMEDIATELY.
      // Idempotent: the RPC already seeded them, so this returns the existing set.
      logger.log('🎨 Initializing default conditions for new organization...')
      try {
        await conditionService.initializeDefaultConditions(orgId as string)
        logger.log('✅ Default conditions initialized')
      } catch (error) {
        logger.error('❌ Failed to initialize conditions:', error)
        // Rollback: Delete the organization if condition creation fails
        await supabase.from(ORGANIZATIONS_COLLECTION).delete().eq('id', orgId as string)
        throw new Error('Failed to initialize organization conditions')
      }

      const created = await this.getOrganization(orgId as string)
      if (!created) throw new Error('Failed to create organization')
      return created
    } catch (error) {
      logger.error('❌ Failed to create organization:', error)
      throw new Error('Failed to create organization')
    }
  },

  async getOrganization(organizationId: string): Promise<Organization | null> {
    const { data, error } = await supabase
      .from(ORGANIZATIONS_COLLECTION)
      .select('*')
      .eq('id', organizationId)
      .maybeSingle()
    if (error) throw error
    return toCamel<Organization>(data)
  },

  async getAllOrganizations(): Promise<Organization[]> {
    const { data, error } = await supabase.from(ORGANIZATIONS_COLLECTION).select('*')
    if (error) throw error
    return toCamelList<Organization>(data)
  },

  async updateOrganization(
    organizationId: string,
    updates: Partial<Omit<Organization, 'id' | 'createdAt' | 'createdBy'>>
  ): Promise<void> {
    const updateData = {
      ...updates,
      updatedAt: new Date().toISOString(),
    }
    const { error } = await supabase
      .from(ORGANIZATIONS_COLLECTION)
      .update(toSnake(updateData))
      .eq('id', organizationId)
    if (error) throw error
  },

  async deleteOrganization(organizationId: string): Promise<void> {
    const { error } = await supabase.from(ORGANIZATIONS_COLLECTION).delete().eq('id', organizationId)
    if (error) throw error
  },

  async incrementMemberCount(organizationId: string): Promise<void> {
    const org = await this.getOrganization(organizationId)
    if (org) {
      await this.updateOrganization(organizationId, {
        memberCount: org.memberCount + 1,
      })
    }
  },

  async decrementMemberCount(organizationId: string): Promise<void> {
    const org = await this.getOrganization(organizationId)
    if (org && org.memberCount > 0) {
      await this.updateOrganization(organizationId, {
        memberCount: org.memberCount - 1,
      })
    }
  },
}
