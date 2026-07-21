// src/lib/services/spareKeyService.ts
// Head-office spare-key box log (migration 0063). One row per physical key:
// box + numbered slot + registration. One key per slot (unique org+box+slot).
// Defensive: missing table → [] like the other services.

import { supabase } from '@/lib/supabaseClient'
import { toCamel, toCamelList } from '@/lib/dbMap'
import { logger } from '@/lib/logger'

const TABLE = 'spare_keys'
const LOG = 'spare_key_log'
const BOXES = 'spare_key_boxes'
const ONE_KEY = 'spare_key_one_key'
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

/** A permanent key-box history event (migration 0064). Never edited/deleted. */
export interface SpareKeyEvent {
  id: string
  organizationId: string
  registration: string
  action: 'added' | 'moved' | 'removed'
  box?: string | null
  slot?: number | null
  fromBox?: string | null
  fromSlot?: number | null
  note?: string | null
  actorId?: string | null
  actorName?: string | null
  createdAt: string
}

export const spareKeyService = {
  /** Write a history event. Best-effort — never blocks the main operation. */
  async logEvent(input: {
    organizationId: string
    registration: string
    action: 'added' | 'moved' | 'removed'
    box?: string | null
    slot?: number | null
    fromBox?: string | null
    fromSlot?: number | null
    note?: string | null
    actorId?: string | null
    actorName?: string | null
  }): Promise<void> {
    try {
      const { error } = await supabase.from(LOG).insert({
        organization_id: input.organizationId,
        registration: normKeyReg(input.registration),
        action: input.action,
        box: input.box ?? null,
        slot: input.slot ?? null,
        from_box: input.fromBox ?? null,
        from_slot: input.fromSlot ?? null,
        note: input.note?.trim() || null,
        actor_id: input.actorId ?? null,
        actor_name: input.actorName ?? null,
      })
      if (error) throw error
    } catch (err) {
      logger.error('spareKeyService.logEvent failed (run migration 0064?):', err)
    }
  },

  /** History for a registration — matches on any plate token (dual plates). */
  async getHistoryForReg(organizationId: string, registration: string, limit = 20): Promise<SpareKeyEvent[]> {
    if (!organizationId || !registration) return []
    const tokens = keyRegTokens(registration).filter((t) => t.length >= 3)
    if (!tokens.length) return []
    try {
      const { data, error } = await supabase
        .from(LOG)
        .select('*')
        .eq('organization_id', organizationId)
        .or(tokens.map((t) => `registration.ilike.%${t}%`).join(','))
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return toCamelList<SpareKeyEvent>(data)
    } catch (err) {
      logger.error('spareKeyService.getHistoryForReg failed:', err)
      return []
    }
  },

  /** Remove a key from the box — logs a permanent 'removed' event (with the
   *  why-note) before deleting the live row. */
  async removeKey(
    key: Pick<SpareKey, 'id' | 'organizationId' | 'registration' | 'box' | 'slot'>,
    opts: { note?: string | null; actorId?: string | null; actorName?: string | null },
  ): Promise<void> {
    await this.logEvent({
      organizationId: key.organizationId,
      registration: key.registration,
      action: 'removed',
      box: key.box,
      slot: key.slot,
      note: opts.note ?? null,
      actorId: opts.actorId ?? null,
      actorName: opts.actorName ?? null,
    })
    const { error } = await supabase.from(TABLE).delete().eq('id', key.id)
    if (error) throw error
  },

  /** Declared boxes (migration 0065) — lets an EMPTY box exist before any key
   *  is assigned to it. `name` is the SHORT badge code ('B8', 'MN'), `label`
   *  the optional full name ('MOTORNATION'). Unioned with key-referenced boxes. */
  async getBoxes(organizationId: string): Promise<{ name: string; label: string | null }[]> {
    if (!organizationId) return []
    try {
      const { data, error } = await supabase
        .from(BOXES)
        .select('*')
        .eq('organization_id', organizationId)
      if (error) throw error
      return (data || []).map((r: any) => ({ name: String(r.name), label: r.label ?? null }))
    } catch (err) {
      logger.error('spareKeyService.getBoxes failed (run migration 0065?):', err)
      return []
    }
  },

  /** Create an empty box. A duplicate code is treated as success. */
  async addBox(
    organizationId: string,
    name: string,
    label?: string | null,
    createdByName?: string | null,
  ): Promise<void> {
    const clean = name.trim().toUpperCase()
    if (!organizationId || !clean) return
    const row: Record<string, any> = {
      organization_id: organizationId,
      name: clean,
      label: label?.trim() || null,
      created_by_name: createdByName ?? null,
    }
    let { error } = await supabase.from(BOXES).insert(row)
    if (error && /label/.test(error.message || '')) {
      // DB predates the label column — insert without it rather than fail.
      delete row.label
      ;({ error } = await supabase.from(BOXES).insert(row))
    }
    if (error && (error as any).code !== '23505') throw error
  },

  /** Registrations flagged "came with only 1 key" (migration 0066) — these are
   *  excluded from the missing-spare list since a spare will never exist. */
  async getOneKeyRegs(organizationId: string): Promise<string[]> {
    if (!organizationId) return []
    try {
      const { data, error } = await supabase
        .from(ONE_KEY)
        .select('registration')
        .eq('organization_id', organizationId)
      if (error) throw error
      return (data || []).map((r: any) => String(r.registration))
    } catch (err) {
      logger.error('spareKeyService.getOneKeyRegs failed (run migration 0066?):', err)
      return []
    }
  },

  /** Flag a registration as one-key. A duplicate is treated as success. */
  async markOneKey(organizationId: string, registration: string, createdByName?: string | null): Promise<void> {
    const reg = normKeyReg(registration)
    if (!organizationId || !reg) return
    const { error } = await supabase.from(ONE_KEY).insert({
      organization_id: organizationId,
      registration: reg,
      created_by_name: createdByName ?? null,
    })
    if (error && (error as any).code !== '23505') throw error
  },

  /** Remove the one-key flag — the vehicle goes back into the missing list. */
  async unmarkOneKey(organizationId: string, registration: string): Promise<void> {
    const reg = normKeyReg(registration)
    if (!organizationId || !reg) return
    const { error } = await supabase
      .from(ONE_KEY)
      .delete()
      .eq('organization_id', organizationId)
      .eq('registration', reg)
    if (error) throw error
  },

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
    await this.logEvent({
      organizationId: input.organizationId,
      registration: input.registration,
      action: 'added',
      box: input.box ?? null,
      slot: input.slot ?? null,
      actorId: input.createdBy ?? null,
      actorName: input.createdByName ?? null,
    })
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

  /** DANGER: wipe EVERY key for the org (fresh re-import). Each key gets a
   *  permanent 'removed' event first (one bulk insert), so searching an old
   *  reg later still explains when and why its key disappeared. */
  async clearAll(
    organizationId: string,
    opts: { note?: string | null; actorId?: string | null; actorName?: string | null },
  ): Promise<number> {
    if (!organizationId) return 0
    const keys = await this.getKeys(organizationId)
    if (keys.length === 0) return 0
    try {
      const { error } = await supabase.from(LOG).insert(
        keys.map((k) => ({
          organization_id: organizationId,
          registration: normKeyReg(k.registration),
          action: 'removed',
          box: k.box,
          slot: k.slot,
          note: opts.note?.trim() || null,
          actor_id: opts.actorId ?? null,
          actor_name: opts.actorName ?? null,
        })),
      )
      if (error) throw error
    } catch (err) {
      logger.error('spareKeyService.clearAll log failed (run migration 0064?):', err)
    }
    const { error } = await supabase.from(TABLE).delete().eq('organization_id', organizationId)
    if (error) throw error
    return keys.length
  },
}
