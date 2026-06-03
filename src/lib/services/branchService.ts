// src/lib/services/branchService.ts — SUPABASE re-implementation.
// Branch management service. Public interface + every method signature are kept
// identical; only the internals swap Firestore → Supabase. Branch.createdAt is
// revived into a Date (matching the Firestore .toDate() behaviour).
//
// branch refs are TEXT: checked_in_vehicles.branch_id is a text column that
// carries the branch uuid as a string (or the 'main' literal), so the
// vehicle-guard / migration queries compare against the branch id string.

import { supabase } from '@/lib/supabaseClient'
import { Branch, BranchMigration } from '@/types/branch'
import { toCamel, toCamelList } from '@/lib/dbMap'
import { logger } from '@/lib/logger'

const BRANCHES_COLLECTION = 'branches'
const MIGRATIONS_COLLECTION = 'branch_migrations'
const CHECKED_IN_VEHICLES = 'checked_in_vehicles'

const toDate = (v: any) => (v ? new Date(v) : new Date())

// Row → Branch: snake→camel + revive createdAt into a Date.
function rowToBranch(row: any): Branch {
  const b = toCamel<any>(row)!
  b.createdAt = toDate(b.createdAt)
  return b as Branch
}

// Sort so the main branch is always first, then alphabetical by name.
function sortBranches(branches: Branch[]): Branch[] {
  return branches.sort((a, b) => {
    if (a.isMain) return -1
    if (b.isMain) return 1
    return a.name.localeCompare(b.name)
  })
}

export const branchService = {
  // Create the main branch (used during migration)
  async createMainBranch(organizationId: string, userId: string, userName: string): Promise<string> {
    const { data, error } = await supabase
      .from(BRANCHES_COLLECTION)
      .insert({
        slug: 'main',
        name: 'Main Branch',
        is_main: true,
        organization_id: organizationId,
        created_by: userId,
        created_by_name: userName,
        is_active: true,
        vehicle_count: 0,
      })
      .select('id')
      .single()
    if (error) throw error

    return data.id as string
  },

  // Create a new branch
  async createBranch(branchData: {
    name: string
    slug: string
    organizationId: string
    createdBy: string
    createdByName?: string
    // 🛠️ Optional service bay count. When omitted the field is left unset
    // and consumers fall back to DEFAULT_SERVICE_BAY_COUNT.
    serviceBayCount?: number
  }): Promise<string> {
    // Check if slug already exists for this organization
    const { data: existing, error: existingError } = await supabase
      .from(BRANCHES_COLLECTION)
      .select('id')
      .eq('organization_id', branchData.organizationId)
      .eq('slug', branchData.slug)
      .limit(1)
    if (existingError) throw existingError

    if (existing && existing.length > 0) {
      throw new Error('A branch with this slug already exists')
    }

    const newBranch: Record<string, any> = {
      name: branchData.name,
      slug: branchData.slug,
      organization_id: branchData.organizationId,
      created_by: branchData.createdBy,
      created_by_name: branchData.createdByName,
      is_main: false,
      is_active: true,
      vehicle_count: 0,
      // Only persist the bay count when explicitly provided so the field
      // stays "unset" for branches that weren't given a value at creation.
      ...(typeof branchData.serviceBayCount === 'number' && {
        service_bay_count: branchData.serviceBayCount,
      }),
    }

    const { data, error } = await supabase
      .from(BRANCHES_COLLECTION)
      .insert(newBranch)
      .select('id')
      .single()
    if (error) throw error

    return data.id as string
  },

  // Get all branches for an organization
  async getBranches(organizationId: string): Promise<Branch[]> {
    const { data, error } = await supabase
      .from(BRANCHES_COLLECTION)
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
    if (error) throw error

    const branches = (data ?? []).map(rowToBranch)

    // Sort so main branch is always first
    return sortBranches(branches)
  },

  // Subscribe to branches (for real-time updates)
  subscribeToBranches(
    organizationId: string,
    callback: (branches: Branch[]) => void
  ): () => void {
    // Initial fetch, then re-query on any change to this org's branches.
    const refresh = async () => {
      try {
        const branches = await this.getBranches(organizationId)
        callback(branches)
      } catch (error) {
        logger.error('Error in branches subscription refresh:', error)
      }
    }

    refresh()

    const channel = supabase
      .channel(`branches:${organizationId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: BRANCHES_COLLECTION,
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          refresh()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  },

  // Get branch by slug
  async getBranchBySlug(organizationId: string, slug: string): Promise<Branch | null> {
    const { data, error } = await supabase
      .from(BRANCHES_COLLECTION)
      .select('*')
      .eq('organization_id', organizationId)
      .eq('slug', slug)
      .eq('is_active', true)
      .limit(1)
    if (error) throw error

    if (!data || data.length === 0) return null

    return rowToBranch(data[0])
  },

  // Update branch
  async updateBranch(branchId: string, updates: Partial<Branch>): Promise<void> {
    const { error } = await supabase
      .from(BRANCHES_COLLECTION)
      .update({
        ...mapBranchUpdates(updates),
        updated_at: new Date().toISOString(),
      })
      .eq('id', branchId)
    if (error) throw error
  },

  // Soft delete branch (only if no vehicles)
  async deleteBranch(branchId: string): Promise<void> {
    // Resolve the branch's org first (get-by-id) so the vehicle-guard
    // query can be org-scoped — tightened tenant rules reject a
    // checkedInVehicles query that isn't constrained to the org.
    const { data: branchSnap } = await supabase
      .from(BRANCHES_COLLECTION)
      .select('organization_id')
      .eq('id', branchId)
      .maybeSingle()
    const branchOrgId = branchSnap?.organization_id

    // Check if branch has vehicles
    const { data: vehicles, error: vehiclesError } = await supabase
      .from(CHECKED_IN_VEHICLES)
      .select('id')
      .eq('organization_id', branchOrgId)
      .eq('branch_id', branchId)
      .limit(1)
    if (vehiclesError) throw vehiclesError

    if (vehicles && vehicles.length > 0) {
      throw new Error('Cannot delete branch with vehicles. Please transfer or check out all vehicles first.')
    }

    const { error } = await supabase
      .from(BRANCHES_COLLECTION)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', branchId)
    if (error) throw error
  },

  // Migration functions
  async checkMigrationStatus(organizationId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from(MIGRATIONS_COLLECTION)
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (error) throw error

    if (!data) return false

    return (toCamel<BranchMigration>(data) as BranchMigration).migrationCompleted === true
  },

  async runMigration(organizationId: string, userId: string, userName: string): Promise<void> {
    // Check if migration already done
    const { data: migrationDoc, error: migrationError } = await supabase
      .from(MIGRATIONS_COLLECTION)
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (migrationError) throw migrationError

    if (migrationDoc && migrationDoc.migration_completed) {
      logger.log('Migration already completed for organization:', organizationId)
      return
    }

    // Create main branch
    const { error: branchError } = await supabase.from(BRANCHES_COLLECTION).insert({
      slug: 'main',
      name: 'Main Branch',
      is_main: true,
      organization_id: organizationId,
      created_by: userId,
      created_by_name: userName,
      is_active: true,
      vehicle_count: 0,
    })
    if (branchError) throw branchError

    // Get all vehicles for this organization
    const { data: vehicles, error: vehiclesError } = await supabase
      .from(CHECKED_IN_VEHICLES)
      .select('id')
      .eq('organization_id', organizationId)
    if (vehiclesError) throw vehiclesError

    const vehicleCount = vehicles?.length ?? 0

    // Update all vehicles with branchId = 'main'
    const { error: updateError } = await supabase
      .from(CHECKED_IN_VEHICLES)
      .update({ branch_id: 'main', updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
    if (updateError) throw updateError

    // Mark migration as complete
    const { error: completeError } = await supabase.from(MIGRATIONS_COLLECTION).upsert(
      {
        organization_id: organizationId,
        migration_completed: true,
        migration_date: new Date().toISOString(),
        migrated_vehicle_count: vehicleCount,
      },
      { onConflict: 'organization_id' }
    )
    if (completeError) throw completeError

    logger.log(`Migration completed: ${vehicleCount} vehicles updated with branchId='main'`)
  },
}

// Map a Partial<Branch> (camelCase) to a snake_case branches update payload.
// Inlined rather than using dbMap.toSnake so id/createdAt (which must never be
// written) and the camel→snake of the location/bay fields are handled explicitly.
function mapBranchUpdates(updates: Partial<Branch>): Record<string, any> {
  const out: Record<string, any> = {}
  if (updates.slug !== undefined) out.slug = updates.slug
  if (updates.name !== undefined) out.name = updates.name
  if (updates.isMain !== undefined) out.is_main = updates.isMain
  if (updates.isActive !== undefined) out.is_active = updates.isActive
  if (updates.createdByName !== undefined) out.created_by_name = updates.createdByName
  if (updates.vehicleCount !== undefined) out.vehicle_count = updates.vehicleCount
  if (updates.address !== undefined) out.address = updates.address
  if (updates.postcode !== undefined) out.postcode = updates.postcode
  if (updates.latitude !== undefined) out.latitude = updates.latitude
  if (updates.longitude !== undefined) out.longitude = updates.longitude
  if (updates.serviceBayCount !== undefined) out.service_bay_count = updates.serviceBayCount
  return out
}
