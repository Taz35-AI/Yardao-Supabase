// src/lib/services/yardLayoutService.ts — SUPABASE re-implementation.
// One row per branch in yard_layouts (unique on organization_id + branch_id).
// Public signatures identical to the Firestore version.

import { supabase } from '@/lib/supabaseClient'
import { YardLayout } from '@/types/yardLayout'
import { logger } from '@/lib/logger'

const TABLE = 'yard_layouts'

export const yardLayoutService = {
  async getLayout(
    branchId: string,
    organizationId: string,
  ): Promise<YardLayout | null> {
    if (!branchId || !organizationId) {
      throw new Error('branchId and organizationId are required')
    }

    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('branch_id', branchId)
        .maybeSingle()
      if (error) throw error

      if (!data) {
        logger.log(`📋 No yard layout exists yet for branch: ${branchId}`)
        return null
      }

      return {
        branchId: data.branch_id || branchId,
        organizationId: data.organization_id,
        spaces: data.spaces || {},
        blocks: Array.isArray(data.blocks) ? data.blocks : [],
        updatedAt: data.updated_at,
        updatedBy: data.updated_by,
        updatedByName: data.updated_by_name,
      }
    } catch (err) {
      logger.error('❌ Failed to load yard layout:', err)
      throw err
    }
  },

  async saveLayout(
    layout: Omit<YardLayout, 'updatedAt'> & { updatedBy: string; updatedByName?: string },
  ): Promise<void> {
    if (!layout.branchId || !layout.organizationId) {
      throw new Error('branchId and organizationId are required')
    }

    try {
      const { error } = await supabase.from(TABLE).upsert(
        {
          organization_id: layout.organizationId,
          branch_id: layout.branchId,
          spaces: layout.spaces || {},
          blocks: layout.blocks || [],
          updated_at: new Date().toISOString(),
          updated_by: layout.updatedBy,
          updated_by_name: layout.updatedByName || '',
        },
        { onConflict: 'organization_id,branch_id' },
      )
      if (error) throw error

      const spaceCount = Object.keys(layout.spaces || {}).length
      const blockCount = (layout.blocks || []).length
      logger.log(`✅ Saved yard layout for ${layout.branchId} — ${spaceCount} spaces, ${blockCount} blocks`)
    } catch (err) {
      logger.error('❌ Failed to save yard layout:', err)
      throw err
    }
  },

  // Pure helper — unchanged.
  findSpaceById(layout: YardLayout | null, spaceId: string) {
    if (!layout) return null
    for (const coord of Object.keys(layout.spaces)) {
      const sp = layout.spaces[coord]
      if (sp.id === spaceId) return { coord, space: sp }
    }
    return null
  },
}
