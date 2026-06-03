// src/services/damageSyncService.ts — SUPABASE re-implementation.
// Syncs damagePins between the fleet `vehicles` table and `checked_in_vehicles`.
// Mirrors the InsuranceSyncService pattern. Public exports + signatures unchanged.
//
// Data layer swapped from Firestore to Supabase. Firestore writeBatch → parallel
// Promise.all of single-row .update()s (not atomic — acceptable here).
// damagePins is stored verbatim in the `damage_pins` jsonb column (camelCase shape
// preserved by the jsonb-passthrough convention).
//
// Photo uploads moved from Firebase Storage → Supabase Storage. uploadDamagePhoto
// keeps its signature (returns a public URL string) and uploads into the
// `damage-photos` bucket (path: {orgId}/{registration}/{pinId}_{ts}.jpg).
// NOTE: the `damage-photos` storage bucket must exist + be readable; it is infra
// config (not a SQL table), so it is provisioned in the Supabase dashboard /
// storage config rather than in a table migration.

import { supabase } from '@/lib/supabaseClient'
import { logger } from '@/lib/logger'
import { DamagePin } from '@/components/common/DamageMapper/DamageMapper'

const VEHICLES = 'vehicles'
const CHECKED_IN = 'checked_in_vehicles'
const DAMAGE_PHOTO_BUCKET = 'damage-photos'

export interface DamageSyncResult {
  success: boolean
  updatedFleetRecord: boolean
  updatedYardRecords: number
  error?: string
  method?: 'id-based' | 'registration-based'
}

export async function compressImage(
  base64: string,
  maxWidth = 1200,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')

      // Scale down if wider than maxWidth, keep aspect ratio
      let { width, height } = img
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }

      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)

      // quality 0.82 = ~80% smaller than raw, visually identical
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.src = base64
  })
}

export async function uploadDamagePhoto(
  orgId: string,
  registration: string,
  pinId: string,
  base64: string
): Promise<string> {
  const path = `${orgId}/${registration}/${pinId}_${Date.now()}.jpg`

  // 🔥 Compress before upload
  const compressed = await compressImage(base64)

  const res = await fetch(compressed)
  const blob = await res.blob()

  const { error } = await supabase.storage
    .from(DAMAGE_PHOTO_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
  if (error) throw error

  const { data } = supabase.storage.from(DAMAGE_PHOTO_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

// ─── Strip undefined from every pin before any write ─────────────────────────
// Defensive: keeps the stored jsonb clean (no undefined-valued keys) when a user
// removes a photo (e.g. photoBase64 / photoUrl becomes undefined).
function cleanPins(pins: DamagePin[]): Record<string, any>[] {
  return pins.map(pin => {
    const cleaned: Record<string, any> = {}
    for (const [key, value] of Object.entries(pin)) {
      if (value !== undefined) cleaned[key] = value
    }
    return cleaned
  })
}

export class DamageSyncService {
  /**
   * MAIN: Sync damage pins from yard check-in → fleet inventory
   * Prefer vehicleId (fast), fall back to registration.
   */
  static async syncDamageFromYardToFleet(
    identifier: string,
    damagePins: DamagePin[],
    organizationId: string,
    userId: string,
    userDisplayName: string,
    isVehicleId = false
  ): Promise<DamageSyncResult> {
    if (isVehicleId) {
      return this._syncYardToFleetById(identifier, damagePins, organizationId, userId, userDisplayName)
    }
    return this._syncYardToFleetByRegistration(identifier, damagePins, organizationId, userId, userDisplayName)
  }

  /**
   * MAIN: Sync damage pins from fleet inventory → all yard records
   */
  static async syncDamageFromFleetToYard(
    identifier: string,
    damagePins: DamagePin[],
    organizationId: string,
    userId: string,
    userDisplayName: string,
    isVehicleId = false
  ): Promise<DamageSyncResult> {
    if (isVehicleId) {
      return this._syncFleetToYardById(identifier, damagePins, organizationId, userId, userDisplayName)
    }
    return this._syncFleetToYardByRegistration(identifier, damagePins, organizationId, userId, userDisplayName)
  }

  // ── Private: Yard → Fleet by vehicleId ──────────────────────────────────────
  private static async _syncYardToFleetById(
    vehicleId: string,
    damagePins: DamagePin[],
    organizationId: string,
    userId: string,
    userDisplayName: string
  ): Promise<DamageSyncResult> {
    try {
      logger.log(`[DamageSync] Yard→Fleet by ID: ${vehicleId}`)
      const cleanedPins = cleanPins(damagePins)

      // 1. Update fleet record
      const { error: fleetError } = await supabase
        .from(VEHICLES)
        .update({
          damage_pins: cleanedPins,
          last_damage_update: {
            updatedBy: userId,
            updatedByName: userDisplayName,
            updatedAt: new Date().toISOString(),
            source: 'yard_sync_id',
            pinCount: damagePins.length,
          },
        })
        .eq('id', vehicleId)
      if (fleetError) throw fleetError

      // 2. Update all yard records with the same vehicleId
      const { data: yardRows } = await supabase
        .from(CHECKED_IN)
        .select('id')
        .eq('organization_id', organizationId)
        .eq('vehicle_id', vehicleId)
      let updatedYardRecords = 0

      await Promise.all(
        (yardRows ?? []).map(async (yardRow) => {
          await supabase
            .from(CHECKED_IN)
            .update({ damage_pins: cleanedPins })
            .eq('id', yardRow.id)
          updatedYardRecords++
        })
      )

      logger.log(`[DamageSync] Yard→Fleet ID sync done: fleet + ${updatedYardRecords} yard records`)

      return { success: true, updatedFleetRecord: true, updatedYardRecords, method: 'id-based' }
    } catch (error) {
      logger.error('[DamageSync] Yard→Fleet ID sync failed:', error)
      return {
        success: false,
        updatedFleetRecord: false,
        updatedYardRecords: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        method: 'id-based',
      }
    }
  }

  // ── Private: Yard → Fleet by registration ───────────────────────────────────
  private static async _syncYardToFleetByRegistration(
    registration: string,
    damagePins: DamagePin[],
    organizationId: string,
    userId: string,
    userDisplayName: string
  ): Promise<DamageSyncResult> {
    try {
      const cleanReg = registration.toUpperCase().trim()
      logger.log(`[DamageSync] Yard→Fleet by reg: ${cleanReg}`)

      const cleanedPins = cleanPins(damagePins)
      let updatedFleetRecord = false
      let updatedYardRecords = 0

      // Fleet
      const { data: fleetRows } = await supabase
        .from(VEHICLES)
        .select('id')
        .eq('organization_id', organizationId)
        .eq('registration', cleanReg)

      if (fleetRows && fleetRows.length > 0) {
        const { error } = await supabase
          .from(VEHICLES)
          .update({
            damage_pins: cleanedPins,
            last_damage_update: {
              updatedBy: userId,
              updatedByName: userDisplayName,
              updatedAt: new Date().toISOString(),
              source: 'yard_sync_registration',
              pinCount: damagePins.length,
            },
          })
          .eq('id', fleetRows[0].id)
        if (error) throw error
        updatedFleetRecord = true
      }

      // Yard
      const { data: yardRows } = await supabase
        .from(CHECKED_IN)
        .select('id')
        .eq('organization_id', organizationId)
        .eq('registration', cleanReg)

      await Promise.all(
        (yardRows ?? []).map(async (yardRow) => {
          await supabase
            .from(CHECKED_IN)
            .update({ damage_pins: cleanedPins })
            .eq('id', yardRow.id)
          updatedYardRecords++
        })
      )

      return { success: true, updatedFleetRecord, updatedYardRecords, method: 'registration-based' }
    } catch (error) {
      logger.error('[DamageSync] Yard→Fleet reg sync failed:', error)
      return {
        success: false,
        updatedFleetRecord: false,
        updatedYardRecords: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        method: 'registration-based',
      }
    }
  }

  // ── Private: Fleet → Yard by vehicleId ──────────────────────────────────────
  private static async _syncFleetToYardById(
    vehicleId: string,
    damagePins: DamagePin[],
    organizationId: string,
    userId: string,
    userDisplayName: string
  ): Promise<DamageSyncResult> {
    try {
      const cleanedPins = cleanPins(damagePins)
      const { data: yardRows } = await supabase
        .from(CHECKED_IN)
        .select('id')
        .eq('organization_id', organizationId)
        .eq('vehicle_id', vehicleId)
      let updatedYardRecords = 0

      await Promise.all(
        (yardRows ?? []).map(async (yardRow) => {
          await supabase
            .from(CHECKED_IN)
            .update({ damage_pins: cleanedPins })
            .eq('id', yardRow.id)
          updatedYardRecords++
        })
      )

      return { success: true, updatedFleetRecord: false, updatedYardRecords, method: 'id-based' }
    } catch (error) {
      logger.error('[DamageSync] Fleet→Yard ID sync failed:', error)
      return {
        success: false,
        updatedFleetRecord: false,
        updatedYardRecords: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        method: 'id-based',
      }
    }
  }

  // ── Private: Fleet → Yard by registration ───────────────────────────────────
  private static async _syncFleetToYardByRegistration(
    registration: string,
    damagePins: DamagePin[],
    organizationId: string,
    userId: string,
    userDisplayName: string
  ): Promise<DamageSyncResult> {
    try {
      const cleanReg = registration.toUpperCase().trim()
      const cleanedPins = cleanPins(damagePins)
      const { data: yardRows } = await supabase
        .from(CHECKED_IN)
        .select('id')
        .eq('organization_id', organizationId)
        .eq('registration', cleanReg)
      let updatedYardRecords = 0

      await Promise.all(
        (yardRows ?? []).map(async (yardRow) => {
          await supabase
            .from(CHECKED_IN)
            .update({ damage_pins: cleanedPins })
            .eq('id', yardRow.id)
          updatedYardRecords++
        })
      )

      return { success: true, updatedFleetRecord: false, updatedYardRecords, method: 'registration-based' }
    } catch (error) {
      logger.error('[DamageSync] Fleet→Yard reg sync failed:', error)
      return {
        success: false,
        updatedFleetRecord: false,
        updatedYardRecords: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        method: 'registration-based',
      }
    }
  }
}
