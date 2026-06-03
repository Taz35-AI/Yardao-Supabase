// src/lib/conditionService.ts — SUPABASE re-implementation.
// Standalone conditionService (distinct from the conditionService inside
// firestore.ts). Public interface + method signatures + the per-org read cache
// are kept identical; only the internals swap Firestore → Supabase.
//
// order ↔ sort_order: the DB column is `sort_order` (0001) but the TS contract
// exposes `order`. rowToCondition revives sort_order→order on read; conditionToRow
// maps order→sort_order on write (same approach as firestore.ts).

import { supabase } from '@/lib/supabaseClient'
import { toCamel, toSnake } from '@/lib/dbMap'
import { logger } from '@/lib/logger'

export interface ConditionCategory {
  id: string
  name: string
  order: number
  organizationId: string
  color: string
  severity: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
  isDefault: boolean
  isEditable: boolean
  createdAt: string
  updatedAt?: string
}

const CONDITIONS_COLLECTION = 'condition_categories'

// snake→camel + sort_order→order
function rowToCondition(row: any): ConditionCategory {
  const c = toCamel<any>(row)!
  return { ...c, order: c.sortOrder ?? 0 } as ConditionCategory
}
// camel→snake + order→sort_order
function conditionToRow(c: Record<string, any>): Record<string, any> {
  const { order, ...rest } = c
  const row = toSnake(rest)
  if (order !== undefined) row.sort_order = order
  return row
}

// ── Read cache ────────────────────────────────────────────────────────────────
// conditionCategories is reference data that changes ~never, yet it was being
// re-read in full on every context mount / branch remount. Cache the per-org
// list for the browser session; every write below busts it so edits are
// reflected immediately on the device that made them. The TTL is a safety net
// so a change made on a DIFFERENT device still propagates within a few minutes.
const CONDITIONS_TTL_MS = 5 * 60 * 1000
const conditionsCache = new Map<string, { data: ConditionCategory[]; ts: number }>()

function clearConditionsCache(organizationId?: string) {
  if (organizationId) conditionsCache.delete(organizationId)
  else conditionsCache.clear()
}

export const conditionService = {
  /** Clear the in-memory conditions cache (one org, or all). */
  invalidate(organizationId?: string) {
    clearConditionsCache(organizationId)
  },

  /**
   * Get all conditions for an organization.
   * Served from the session cache when fresh; pass { force: true } to bypass
   * (used by correctness-critical paths like init / duplicate cleanup).
   */
  async getConditions(
    organizationId: string,
    opts?: { force?: boolean }
  ): Promise<ConditionCategory[]> {
    if (!opts?.force) {
      const cached = conditionsCache.get(organizationId)
      if (cached && Date.now() - cached.ts < CONDITIONS_TTL_MS) {
        // Return a copy so callers can sort/mutate without corrupting the cache
        return cached.data.map(c => ({ ...c }))
      }
    }

    const { data: rows, error } = await supabase
      .from(CONDITIONS_COLLECTION)
      .select('*')
      .eq('organization_id', organizationId)
      .order('sort_order', { ascending: true })
    if (error) throw error

    const data = (rows ?? []).map(rowToCondition)

    conditionsCache.set(organizationId, { data, ts: Date.now() })
    return data.map(c => ({ ...c }))
  },

  /**
   * ✅ NEW: Check if a condition with this name already exists
   * This prevents duplicate conditions from being created
   */
  async conditionExists(organizationId: string, name: string): Promise<boolean> {
    const normalizedName = name.trim()
    const { data: rows, error } = await supabase
      .from(CONDITIONS_COLLECTION)
      .select('name')
      .eq('organization_id', organizationId)
    if (error) throw error

    // Check case-insensitive match
    return (rows ?? []).some(
      (r: any) => (r.name ?? '').trim().toLowerCase() === normalizedName.toLowerCase()
    )
  },

  /**
   * ✅ FIXED: Add condition with duplicate prevention
   * Now checks if condition exists before adding
   */
  async addCondition(condition: Omit<ConditionCategory, 'id' | 'createdAt'>): Promise<ConditionCategory> {
    // ✅ CRITICAL FIX: Check for duplicates before adding
    const exists = await this.conditionExists(condition.organizationId, condition.name)

    if (exists) {
      logger.log(`⚠️ Condition "${condition.name}" already exists for this organization. Skipping duplicate creation.`)

      // Return the existing condition instead of creating a duplicate
      const allConditions = await this.getConditions(condition.organizationId)
      const existingCondition = allConditions.find(
        c => c.name.trim().toLowerCase() === condition.name.trim().toLowerCase()
      )

      if (existingCondition) {
        logger.log(`✅ Returning existing condition: "${existingCondition.name}" (ID: ${existingCondition.id})`)
        return existingCondition
      }
    }

    // Create new condition if it doesn't exist
    const conditionData = {
      ...condition,
      name: condition.name.trim(), // ✅ Always trim whitespace
      createdAt: new Date().toISOString(),
      isDefault: condition.isDefault ?? false,
      isEditable: condition.isEditable ?? true,
    }

    logger.log(`✅ Creating new condition: "${conditionData.name}"`)
    const { data, error } = await supabase
      .from(CONDITIONS_COLLECTION)
      .insert(conditionToRow(conditionData))
      .select()
      .single()
    if (error) throw error
    clearConditionsCache(condition.organizationId)
    return rowToCondition(data)
  },

  /**
   * Update an existing condition
   */
  async updateCondition(
    conditionId: string,
    updates: Partial<Pick<ConditionCategory, 'name' | 'color' | 'severity' | 'order'>>
  ): Promise<void> {
    // ✅ Trim name if provided
    const cleanUpdates = { ...updates }
    if (cleanUpdates.name) {
      cleanUpdates.name = cleanUpdates.name.trim()
    }

    const { error } = await supabase
      .from(CONDITIONS_COLLECTION)
      .update(conditionToRow({ ...cleanUpdates, updatedAt: new Date().toISOString() }))
      .eq('id', conditionId)
    if (error) throw error
    // No orgId on this signature — clear all (rare admin op, zero risk)
    clearConditionsCache()
  },

  /**
   * Delete a condition
   */
  async deleteCondition(conditionId: string): Promise<void> {
    const { error } = await supabase.from(CONDITIONS_COLLECTION).delete().eq('id', conditionId)
    if (error) throw error
    clearConditionsCache()
  },

  /**
   * Reorder conditions
   */
  async reorderConditions(conditionUpdates: Array<{ id: string; order: number }>): Promise<void> {
    const updatePromises = conditionUpdates.map(({ id, order }) =>
      supabase
        .from(CONDITIONS_COLLECTION)
        .update({ sort_order: order, updated_at: new Date().toISOString() })
        .eq('id', id)
        .then(({ error }) => {
          if (error) throw error
        })
    )
    await Promise.all(updatePromises)
    clearConditionsCache()
  },

  /**
   * ✅ COMPLETELY FIXED: Initialize default conditions with duplicate prevention
   *
   * NOW FIXED:
   * 1. ✅ Checks if ANY conditions exist first
   * 2. ✅ Returns existing conditions if found
   * 3. ✅ Each addCondition() call checks for duplicates
   * 4. ✅ Sequential creation prevents race conditions
   */
  async initializeDefaultConditions(organizationId: string): Promise<ConditionCategory[]> {
    logger.log('🚀 Initializing default conditions for organization:', organizationId)

    // ✅ CRITICAL FIX #1: Check if conditions already exist
    // Force a fresh read — correctness here matters more than the cache.
    const existingConditions = await this.getConditions(organizationId, { force: true })

    if (existingConditions.length > 0) {
      logger.log(`⚠️ Organization already has ${existingConditions.length} condition(s). Skipping initialization.`)
      logger.log('Existing conditions:', existingConditions.map(c => `${c.name} (ID: ${c.id})`))
      return existingConditions
    }

    logger.log('✅ No existing conditions found. Creating defaults...')

    const defaultConditions = [
      {
        name: 'Excellent',
        order: 0,
        color: '#16a34a', // Dark green - perfect condition
        severity: 'excellent' as const,
        organizationId,
        isDefault: true,
        isEditable: true,
      },
      {
        name: 'Good',
        order: 1,
        color: '#22c55e', // Light green - good condition
        severity: 'good' as const,
        organizationId,
        isDefault: true,
        isEditable: true,
      },
      {
        name: 'Fair',
        order: 2,
        color: '#eab308', // Yellow/amber - needs attention
        severity: 'fair' as const,
        organizationId,
        isDefault: true,
        isEditable: true,
      },
      {
        name: 'Poor',
        order: 3,
        color: '#f97316', // Orange - significant issues
        severity: 'poor' as const,
        organizationId,
        isDefault: true,
        isEditable: true,
      },
      {
        name: 'Critical',
        order: 4,
        color: '#ef4444', // Red - major problems
        severity: 'critical' as const,
        organizationId,
        isDefault: true,
        isEditable: true,
      },
    ]

    logger.log('📝 Creating default conditions:', defaultConditions.map(c => `${c.name} (${c.color})`))

    // ✅ CRITICAL FIX #2: Create conditions SEQUENTIALLY (not with Promise.all)
    // This prevents race conditions where multiple conditions try to check existence simultaneously
    const results: ConditionCategory[] = []

    for (const condition of defaultConditions) {
      try {
        logger.log(`Adding condition: ${condition.name}`)
        const newCondition = await this.addCondition(condition)
        results.push(newCondition)
      } catch (error) {
        logger.error(`❌ Failed to add condition "${condition.name}":`, error)
        // Continue with next condition even if one fails
      }
    }

    logger.log(`✅ Successfully created ${results.length}/${defaultConditions.length} default conditions`)
    clearConditionsCache(organizationId)
    return results
  },

  /**
   * ✅ NEW: Clean up duplicate conditions in database
   * Use this ONCE to clean existing duplicates
   */
  async cleanupDuplicates(organizationId: string): Promise<number> {
    logger.log('🧹 Starting duplicate cleanup for organization:', organizationId)

    const allConditions = await this.getConditions(organizationId, { force: true })
    logger.log(`Found ${allConditions.length} total condition records`)

    if (allConditions.length === 0) {
      logger.log('No conditions to clean up')
      return 0
    }

    // Group conditions by normalized name (case-insensitive, trimmed)
    const groups = new Map<string, ConditionCategory[]>()

    allConditions.forEach(condition => {
      const normalizedName = condition.name.trim().toLowerCase()
      if (!groups.has(normalizedName)) {
        groups.set(normalizedName, [])
      }
      groups.get(normalizedName)!.push(condition)
    })

    let deletedCount = 0

    // For each group with duplicates, keep the first one and delete the rest
    for (const [normalizedName, conditions] of groups.entries()) {
      if (conditions.length > 1) {
        logger.log(`⚠️ Found ${conditions.length} duplicates of "${normalizedName}":`)
        conditions.forEach(c => logger.log(`   - ${c.name} (ID: ${c.id}, Created: ${c.createdAt})`))

        // Sort by creation date (keep oldest) to maintain data consistency
        conditions.sort((a, b) => {
          const dateA = new Date(a.createdAt).getTime()
          const dateB = new Date(b.createdAt).getTime()
          if (dateA !== dateB) return dateA - dateB
          return a.order - b.order
        })

        // Keep the first one (oldest), delete the rest
        const [keep, ...remove] = conditions
        logger.log(`✅ Keeping: ${keep.name} (ID: ${keep.id})`)
        logger.log(`🗑️  Deleting: ${remove.map(c => `${c.name} (${c.id})`).join(', ')}`)

        for (const duplicate of remove) {
          try {
            await this.deleteCondition(duplicate.id)
            deletedCount++
            logger.log(`   ✓ Deleted ${duplicate.id}`)
          } catch (error) {
            logger.error(`   ✗ Failed to delete ${duplicate.id}:`, error)
          }
        }
      }
    }

    logger.log(`✅ Cleanup complete! Deleted ${deletedCount} duplicate condition record(s)`)
    clearConditionsCache(organizationId)
    return deletedCount
  },
}
