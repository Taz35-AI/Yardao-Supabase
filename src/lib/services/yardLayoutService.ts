// src/lib/services/yardLayoutService.ts
// Firestore service for yard layout management
// Storage pattern: ONE document per branch at yardLayouts/{branchId}
// We use getDoc + setDoc instead of onSnapshot because the layout
// changes infrequently and we want to save Firestore read costs.

import {
  doc,
  getDoc,
  setDoc,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { YardLayout } from '@/types/yardLayout'
import { logger } from '@/lib/logger'

const COLLECTION = 'yardLayouts'

export const yardLayoutService = {
  /**
   * Load the yard layout for a specific branch.
   * Returns null if no layout exists yet (admin hasn't created one).
   * Always scopes by both branchId AND organizationId for safety.
   */
  async getLayout(
    branchId: string,
    organizationId: string,
  ): Promise<YardLayout | null> {
    if (!branchId || !organizationId) {
      throw new Error('branchId and organizationId are required')
    }

    try {
      const ref = doc(db, COLLECTION, branchId)
      const snap = await getDoc(ref)

      if (!snap.exists()) {
        logger.log(`📋 No yard layout exists yet for branch: ${branchId}`)
        return null
      }

      const data = snap.data()

      // Defensive check — if the doc was somehow created under the wrong org,
      // refuse to return it. Belt and braces alongside Firestore rules.
      if (data.organizationId !== organizationId) {
        logger.error('❌ yardLayout doc organizationId mismatch')
        return null
      }

      return {
        branchId: data.branchId || branchId,
        organizationId: data.organizationId,
        spaces: data.spaces || {},
        blocks: Array.isArray(data.blocks) ? data.blocks : [],
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
        updatedByName: data.updatedByName,
      }
    } catch (err) {
      logger.error('❌ Failed to load yard layout:', err)
      throw err
    }
  },

  /**
   * Save (create or overwrite) the yard layout for a branch.
   * The doc id IS the branchId — guarantees one layout per branch.
   */
  async saveLayout(
    layout: Omit<YardLayout, 'updatedAt'> & { updatedBy: string; updatedByName?: string },
  ): Promise<void> {
    if (!layout.branchId || !layout.organizationId) {
      throw new Error('branchId and organizationId are required')
    }

    try {
      const ref = doc(db, COLLECTION, layout.branchId)
      await setDoc(ref, {
        branchId: layout.branchId,
        organizationId: layout.organizationId,
        spaces: layout.spaces || {},
        blocks: layout.blocks || [],
        updatedAt: Timestamp.now(),
        updatedBy: layout.updatedBy,
        updatedByName: layout.updatedByName || '',
      })

      const spaceCount = Object.keys(layout.spaces || {}).length
      const blockCount = (layout.blocks || []).length
      logger.log(`✅ Saved yard layout for ${layout.branchId} — ${spaceCount} spaces, ${blockCount} blocks`)
    } catch (err) {
      logger.error('❌ Failed to save yard layout:', err)
      throw err
    }
  },

  /**
   * Quick lookup: find a parking space by its stable id across the whole layout.
   * Used by check-in flow to confirm a space still exists / is free.
   */
  findSpaceById(layout: YardLayout | null, spaceId: string) {
    if (!layout) return null
    for (const coord of Object.keys(layout.spaces)) {
      const sp = layout.spaces[coord]
      if (sp.id === spaceId) return { coord, space: sp }
    }
    return null
  },
}