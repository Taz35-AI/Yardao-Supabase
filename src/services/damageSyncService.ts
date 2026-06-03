// src/services/damageSyncService.ts
// Syncs damagePins between the fleet `vehicles` collection and `checkedInVehicles`
// Mirrors the InsuranceSyncService pattern exactly.
// ✅ FIX: cleanPinsForFirestore() strips undefined values before every Firestore write

import {
  doc,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logger } from '@/lib/logger'
import { DamagePin } from '@/components/common/DamageMapper/DamageMapper'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'

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
  const storage = getStorage()
  const path = `damage-photos/${orgId}/${registration}/${pinId}_${Date.now()}.jpg`
  const storageRef = ref(storage, path)

  // 🔥 Compress before upload
  const compressed = await compressImage(base64)

  const res = await fetch(compressed)
  const blob = await res.blob()
  
  await uploadBytes(storageRef, blob)
  return await getDownloadURL(storageRef)
}

// ─── Strip undefined from every pin before any Firestore write ───────────────
// Firestore throws "Unsupported field value: undefined" when a pin has e.g.
// photoBase64: undefined or photoUrl: undefined after the user removes a photo.
function cleanPinsForFirestore(pins: DamagePin[]): Record<string, any>[] {
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
      const cleanedPins = cleanPinsForFirestore(damagePins)
      const batch = writeBatch(db)

      // 1. Update fleet record
      const fleetRef = doc(db, 'vehicles', vehicleId)
      batch.update(fleetRef, {
        damagePins: cleanedPins,
        updatedAt: serverTimestamp(),
        lastDamageUpdate: {
          updatedBy: userId,
          updatedByName: userDisplayName,
          updatedAt: new Date(),
          source: 'yard_sync_id',
          pinCount: damagePins.length,
        },
      })

      // 2. Update all yard records with the same vehicleId
      const yardQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId),
        where('vehicleId', '==', vehicleId)
      )
      const yardSnap = await getDocs(yardQuery)
      let updatedYardRecords = 0

      yardSnap.docs.forEach(yardDoc => {
        batch.update(doc(db, 'checkedInVehicles', yardDoc.id), {
          damagePins: cleanedPins,
          updatedAt: serverTimestamp(),
        })
        updatedYardRecords++
      })

      await batch.commit()
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

      const cleanedPins = cleanPinsForFirestore(damagePins)
      const batch = writeBatch(db)
      let updatedFleetRecord = false
      let updatedYardRecords = 0

      // Fleet
      const fleetQuery = query(
        collection(db, 'vehicles'),
        where('organizationId', '==', organizationId),
        where('registration', '==', cleanReg)
      )
      const fleetSnap = await getDocs(fleetQuery)
      if (!fleetSnap.empty) {
        batch.update(doc(db, 'vehicles', fleetSnap.docs[0].id), {
          damagePins: cleanedPins,
          updatedAt: serverTimestamp(),
          lastDamageUpdate: {
            updatedBy: userId,
            updatedByName: userDisplayName,
            updatedAt: new Date(),
            source: 'yard_sync_registration',
            pinCount: damagePins.length,
          },
        })
        updatedFleetRecord = true
      }

      // Yard
      const yardQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId),
        where('registration', '==', cleanReg)
      )
      const yardSnap = await getDocs(yardQuery)
      yardSnap.docs.forEach(yardDoc => {
        batch.update(doc(db, 'checkedInVehicles', yardDoc.id), {
          damagePins: cleanedPins,
          updatedAt: serverTimestamp(),
        })
        updatedYardRecords++
      })

      await batch.commit()
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
      const cleanedPins = cleanPinsForFirestore(damagePins)
      const batch = writeBatch(db)
      const yardQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId),
        where('vehicleId', '==', vehicleId)
      )
      const yardSnap = await getDocs(yardQuery)
      let updatedYardRecords = 0

      yardSnap.docs.forEach(yardDoc => {
        batch.update(doc(db, 'checkedInVehicles', yardDoc.id), {
          damagePins: cleanedPins,
          updatedAt: serverTimestamp(),
        })
        updatedYardRecords++
      })

      if (updatedYardRecords > 0) await batch.commit()
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
      const cleanedPins = cleanPinsForFirestore(damagePins)
      const batch = writeBatch(db)
      const yardQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId),
        where('registration', '==', cleanReg)
      )
      const yardSnap = await getDocs(yardQuery)
      let updatedYardRecords = 0

      yardSnap.docs.forEach(yardDoc => {
        batch.update(doc(db, 'checkedInVehicles', yardDoc.id), {
          damagePins: cleanedPins,
          updatedAt: serverTimestamp(),
        })
        updatedYardRecords++
      })

      if (updatedYardRecords > 0) await batch.commit()
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