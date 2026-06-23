// src/lib/services/hireSettingsService.ts
// Org hire preferences, including the RENAMABLE agreement label. Stored in
// organization_settings.hire_settings (jsonb). Falls back to defaults.

import { supabase } from '@/lib/supabaseClient'
import { logger } from '@/lib/logger'
import { DEFAULT_HIRE_SETTINGS, type HireSettings } from '@/types/hire'

const TABLE = 'organization_settings'

export const hireSettingsService = {
  async getHireSettings(organizationId: string): Promise<HireSettings> {
    if (!organizationId) return DEFAULT_HIRE_SETTINGS
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('hire_settings')
        .eq('organization_id', organizationId)
        .single()
      if (error) throw error
      const raw = (data?.hire_settings ?? {}) as Partial<HireSettings>
      return { ...DEFAULT_HIRE_SETTINGS, ...raw }
    } catch (err) {
      logger.error('hireSettingsService.getHireSettings failed (using defaults):', err)
      return DEFAULT_HIRE_SETTINGS
    }
  },

  async saveHireSettings(organizationId: string, settings: HireSettings): Promise<void> {
    const { error } = await supabase
      .from(TABLE)
      .update({ hire_settings: settings })
      .eq('organization_id', organizationId)
    if (error) throw error
  },
}
