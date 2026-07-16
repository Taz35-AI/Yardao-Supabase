// src/lib/services/spareKeyService.ts
// Head-office spare-key box log (migration 0063). One row per physical key:
// box + numbered slot + registration. One key per slot (unique org+box+slot).
// Defensive: missing table → [] like the other services.

import { supabase } from '@/lib/supabaseClient'
import { toCamel, toCamelList } from '@/lib/dbMap'
import { logger } from '@/lib/logger'

const TABLE = 'spare_keys'
const nowIso = () => new Date().toISOString()

export const normKeyReg = (s?: string | null) => (s || '').toUpperCase().replace(/\s+/g, '')

/**
 * A key's registration can carry TWO plates — a private plate plus the fleet
 * reg, e.g. "41WP (HK72XXL)", "2HDN/LO75WMC", "11NLB-YB72TNV". Return every
 * plate-like token (plus the whole normalised string) so searching and fleet
 * matching hit on EITHER.
 */
export const keyRegTokens = (s?: string | null): string[] => {
  const raw = (s || '').toUpperCase()
  const tokens = raw.split(/[^A-Z0-9]+/).filter((t) => t.length >= 2)
  return Array.from(new Set([normKeyReg(raw), ...tokens].filter(Boolean)))
}

export interface SpareKey {
  id: string
  organizationId: string
  registration: string
  /** NULL box/slot = the key is in the QUEUE, waiting to be assigned a slot. */
  box: string | null
  slot: number | null
  make?: string | null
  model?: string | null
  vehicleType?: string | null
  logbook: boolean
  notes?: string | null
  createdBy?: string | null
  createdByName?: string | null
  createdAt: string
  updatedAt?: string | null
  updatedByName?: string | null
}

export class SlotOccupiedError extends Error {
  constructor(box: string, slot: number) {
    super(`Slot ${slot} in ${box} is already occupied`)
    this.name = 'SlotOccupiedError'
  }
}

export const spareKeyService = {
  async getKeys(organizationId: string): Promise<SpareKey[]> {
    if (!organizationId) return []
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('organization_id', organizationId)
        .order('box', { ascending: true })
        .order('slot', { ascending: true })
      if (error) throw error
      return toCamelList<SpareKey>(data)
    } catch (err) {
      logger.error('spareKeyService.getKeys failed (run migration 0063?):', err)
      return []
    }
  },

  async addKey(input: {
    organizationId: string
    registration: string
    /** Omit box/slot (null) to add the key to the QUEUE. */
    box?: string | null
    slot?: number | null
    make?: string | null
    model?: string | null
    vehicleType?: string | null
    logbook?: boolean
    notes?: string | null
    createdBy?: string | null
    createdByName?: string | null
  }): Promise<string> {
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        organization_id: input.organizationId,
        registration: normKeyReg(input.registration),
        box: input.box ? input.box.trim().toUpperCase() : null,
        slot: input.slot ?? null,
        make: input.make?.trim() || null,
        model: input.model?.trim() || null,
        vehicle_type: input.vehicleType?.trim() || null,
        logbook: !!input.logbook,
        notes: input.notes?.trim() || null,
        created_by: input.createdBy ?? null,
        created_by_name: input.createdByName ?? null,
      })
      .select('id')
      .single()
    if (error) {
      if ((error as any).code === '23505') throw new SlotOccupiedError(String(input.box), Number(input.slot))
      throw error
    }
    return data.id as string
  },

  /** Patch a key (move box/slot, toggle logbook, notes …). Passing box/slot as
   *  explicit null moves the key back to the QUEUE. */
  async updateKey(id: string, patch: {
    registration?: string
    box?: string | null
    slot?: number | null
    make?: string | null
    model?: string | null
    vehicleType?: string | null
    logbook?: boolean
    notes?: string | null
    updatedByName?: string | null
  }): Promise<void> {
    const row: Record<string, any> = { updated_at: nowIso() }
    if (patch.registration !== undefined) row.registration = normKeyReg(patch.registration)
    if (patch.box !== undefined) row.box = patch.box ? patch.box.trim().toUpperCase() : null
    if (patch.slot !== undefined) row.slot = patch.slot ?? null
    if (patch.make !== undefined) row.make = patch.make?.trim() || null
    if (patch.model !== undefined) row.model = patch.model?.trim() || null
    if (patch.vehicleType !== undefined) row.vehicle_type = patch.vehicleType?.trim() || null
    if (patch.logbook !== undefined) row.logbook = patch.logbook
    if (patch.notes !== undefined) row.notes = patch.notes?.trim() || null
    if (patch.updatedByName !== undefined) row.updated_by_name = patch.updatedByName
    const { error } = await supabase.from(TABLE).update(row).eq('id', id)
    if (error) {
      if ((error as any).code === '23505') throw new SlotOccupiedError(String(patch.box), Number(patch.slot))
      throw error
    }
  },

  async deleteKey(id: string): Promise<void> {
    const { error } = await supabase.from(TABLE).delete().eq('id', id)
    if (error) throw error
  },
}
