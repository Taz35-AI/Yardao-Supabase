// src/lib/services/supplierCostAccessService.ts
// Allow-list of admins (besides the org owner) who may see supplier rental
// costs. Stored in organization_settings.supplier_cost_access_user_ids
// (migration 0072). The owner always has access and is never on the list.

import { supabase } from '@/lib/supabaseClient'
import { logger } from '@/lib/logger'

const TABLE = 'organization_settings'

export const supplierCostAccessService = {
  async getAccessUserIds(organizationId: string): Promise<string[]> {
    if (!organizationId) return []
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('supplier_cost_access_user_ids')
        .eq('organization_id', organizationId)
        .maybeSingle()
      if (error) throw error
      const raw = data?.supplier_cost_access_user_ids
      return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
    } catch (err) {
      logger.error('supplierCostAccessService.getAccessUserIds failed:', err)
      return []
    }
  },

  async saveAccessUserIds(organizationId: string, userIds: string[]): Promise<void> {
    const { error } = await supabase
      .from(TABLE)
      .update({ supplier_cost_access_user_ids: Array.from(new Set(userIds)) })
      .eq('organization_id', organizationId)
    if (error) throw error
  },
}
