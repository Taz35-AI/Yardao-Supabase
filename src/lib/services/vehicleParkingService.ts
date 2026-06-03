// src/lib/services/vehicleParkingService.ts
// Manages the link between a checked-in vehicle and a parking space.
// The link is stored as `parkingSpaceId` on the vehicle's checkedInVehicles doc.
// We do NOT mutate the yard layout doc — spaces are passive containers,
// vehicles are the active records.
//
// ✨ PHASE 2.5a SELF-HEALING:
//   findVehicleOnSpace now also verifies the vehicle it finds is actually
//   "in yard" — i.e. not on hire, not in transit, not at an external garage.
//   If it finds a stale reference (a vehicle that left the yard but kept its
//   parkingSpaceId), it auto-cleans the orphaned reference and treats the
//   slot as free. This means even if a code path forgets to clear the field,
//   the system corrects itself the next time someone tries to use that space.
//
// 👤 ACTOR ATTRIBUTION (optional):
//   Each parking write accepts an optional `actor` describing the user who
//   triggered the action. When provided, we stamp `parkedBy`, `parkedByName`,
//   and `parkedAt` on the affected vehicle docs so the UI can show "Last
//   moved by …" tooltips. Omitting the actor preserves the original
//   no-attribution behaviour exactly — fully backward compatible.

import {
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logger } from '@/lib/logger'

const VEHICLES_COLLECTION = 'checkedInVehicles'

// Optional actor describing who performed the parking action.
export interface ParkingActor {
  uid: string
  name: string
}

// A vehicle is considered "in yard" (and therefore validly occupying a
// parking space) only when it's NOT in any of these states.
function isVehicleActuallyInYard(data: any): boolean {
  if (!data) return false
  if (data.hireStatus === 'Out on Hire') return false
  if (data.transferStatus === 'in_transit') return false
  if (data.transferStatus === 'at_external_garage') return false
  return true
}

// Build the partial update payload that records who performed a parking action.
// Returns an empty object when no actor is supplied so the caller can spread
// it safely without changing the doc shape.
function actorFields(actor?: ParkingActor) {
  if (!actor) return {}
  return {
    parkedBy: actor.uid,
    parkedByName: actor.name,
    parkedAt: serverTimestamp(),
  }
}

export const vehicleParkingService = {
  /**
   * Assign a vehicle to a parking space (by stable space id, NOT label).
   * If another vehicle is already on that space, this will throw — caller
   * should check first or use forceAssign below.
   */
  async assignVehicleToSpace(
    vehicleId: string,
    spaceId: string,
    branchId: string,
    actor?: ParkingActor,
  ): Promise<void> {
    if (!vehicleId || !spaceId) {
      throw new Error('vehicleId and spaceId are required')
    }

    // Defensive: verify the vehicle doc actually exists before writing
    const vehicleRef = doc(db, VEHICLES_COLLECTION, vehicleId)
    const snap = await getDoc(vehicleRef)
    if (!snap.exists()) {
      throw new Error('Vehicle not found')
    }
    const organizationId = snap.data()?.organizationId

    // Check no other vehicle is already on this space (within this branch).
    // findVehicleOnSpace below is self-healing — if a stale ghost reference
    // is found, it clears it and returns null, so this assignment proceeds.
    const occupiedBy = await vehicleParkingService.findVehicleOnSpace(spaceId, branchId, organizationId)
    if (occupiedBy && occupiedBy !== vehicleId) {
      throw new Error('Another vehicle is already parked on this space')
    }

    await updateDoc(vehicleRef, {
      parkingSpaceId: spaceId,
      updatedAt: serverTimestamp(),
      ...actorFields(actor),
    })

    logger.log(`✅ Vehicle ${vehicleId} parked at space ${spaceId}${actor ? ` by ${actor.name}` : ''}`)
  },

  /**
   * Move a vehicle to a different space, replacing whoever was there.
   * Used by drag-and-drop where the user has explicitly chosen to overwrite.
   */
  async forceAssignVehicleToSpace(
    vehicleId: string,
    spaceId: string,
    branchId: string,
    actor?: ParkingActor,
  ): Promise<void> {
    if (!vehicleId || !spaceId) {
      throw new Error('vehicleId and spaceId are required')
    }

    // Resolve org from the vehicle doc so the occupancy lookup is
    // org-scoped (tightened tenant rules reject an unscoped query).
    const vehicleSnap = await getDoc(doc(db, VEHICLES_COLLECTION, vehicleId))
    const organizationId = vehicleSnap.data()?.organizationId

    // First, kick out whoever is currently on the target space
    const occupant = await vehicleParkingService.findVehicleOnSpace(spaceId, branchId, organizationId)
    if (occupant && occupant !== vehicleId) {
      await updateDoc(doc(db, VEHICLES_COLLECTION, occupant), {
        parkingSpaceId: null,
        updatedAt: serverTimestamp(),
        // Stamp attribution on the displaced vehicle too — they were moved
        // off the slot by `actor`, so future tooltips/audits show the cause.
        ...actorFields(actor),
      })
      logger.log(`↩ Vehicle ${occupant} unparked (overwritten)`)
    }

    await updateDoc(doc(db, VEHICLES_COLLECTION, vehicleId), {
      parkingSpaceId: spaceId,
      updatedAt: serverTimestamp(),
      ...actorFields(actor),
    })
    logger.log(`✅ Vehicle ${vehicleId} parked at space ${spaceId} (forced)${actor ? ` by ${actor.name}` : ''}`)
  },

  /**
   * Remove a vehicle from any parking space (sets parkingSpaceId to null).
   */
  async unassignVehicle(vehicleId: string, actor?: ParkingActor): Promise<void> {
    if (!vehicleId) throw new Error('vehicleId is required')
    const vehicleRef = doc(db, VEHICLES_COLLECTION, vehicleId)
    await updateDoc(vehicleRef, {
      parkingSpaceId: null,
      updatedAt: serverTimestamp(),
      ...actorFields(actor),
    })
    logger.log(`↩ Vehicle ${vehicleId} unparked${actor ? ` by ${actor.name}` : ''}`)
  },

  /**
   * Find which vehicle (if any) is CURRENTLY VALIDLY parked on a given space.
   *
   * ✨ PHASE 2.5a SELF-HEALING: queries Firestore for any vehicle pointing
   * at this space, then validates that the vehicle is actually "in yard".
   * If we find a stale ghost (vehicle is on hire / in transit / at garage),
   * we auto-clean it by writing parkingSpaceId: null and treat the slot
   * as free. This means the system survives even if a future code path
   * forgets to clear parkingSpaceId — it just heals itself on next access.
   */
  async findVehicleOnSpace(
    spaceId: string,
    branchId: string,
    organizationId: string,
  ): Promise<string | null> {
    if (!spaceId || !branchId || !organizationId) return null
    try {
      const q = query(
        collection(db, VEHICLES_COLLECTION),
        where('organizationId', '==', organizationId),
        where('parkingSpaceId', '==', spaceId),
        where('branchId', '==', branchId),
      )
      const snap = await getDocs(q)
      if (snap.empty) return null

      // Walk every match and return the FIRST that's actually in yard.
      // Stale ghosts get auto-cleaned on the way through.
      for (const docSnap of snap.docs) {
        const data = docSnap.data()
        if (isVehicleActuallyInYard(data)) {
          return docSnap.id
        }
        // Self-heal: this vehicle has a parkingSpaceId but isn't actually
        // in the yard. Clear the orphaned reference silently.
        try {
          await updateDoc(doc(db, VEHICLES_COLLECTION, docSnap.id), {
            parkingSpaceId: null,
            updatedAt: serverTimestamp(),
          })
          logger.log(
            `🧹 Self-heal: cleared orphaned parkingSpaceId on vehicle ${docSnap.id} ` +
            `(hireStatus=${data.hireStatus}, transferStatus=${data.transferStatus})`,
          )
        } catch (cleanupErr) {
          logger.error('Self-heal cleanup failed (non-fatal):', cleanupErr)
        }
      }

      // Every vehicle pointing at this space was a ghost — slot is free
      return null
    } catch (err) {
      logger.error('findVehicleOnSpace error:', err)
      return null
    }
  },
}
