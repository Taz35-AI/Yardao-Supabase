// src/lib/services/vehicleParkingService.ts — SUPABASE re-implementation.
// Manages the link between a checked-in vehicle and a parking space.
// The link is stored as `parking_space_id` on the checked_in_vehicles row.
// Spaces are passive containers; vehicles are the active records.
//
// ✨ PHASE 2.5a SELF-HEALING preserved: findVehicleOnSpace verifies the vehicle
// it finds is actually "in yard" (not on hire / in transit / at garage). Stale
// references are auto-cleared so the slot is treated as free.
//
// 👤 ACTOR ATTRIBUTION preserved: each write optionally stamps parked_by /
// parked_by_name / parked_at. Omitting the actor preserves no-attribution.
// Public signatures are identical to the Firestore version.

import { supabase } from '@/lib/supabaseClient'
import { logger } from '@/lib/logger'

const TABLE = 'checked_in_vehicles'

export interface ParkingActor {
  uid: string
  name: string
}

// A vehicle validly occupies a space only when it's NOT in any of these states.
function isVehicleActuallyInYard(data: any): boolean {
  if (!data) return false
  if (data.hire_status === 'Out on Hire') return false
  if (data.transfer_status === 'in_transit') return false
  if (data.transfer_status === 'at_external_garage') return false
  return true
}

// Partial update payload recording who performed a parking action.
function actorFields(actor?: ParkingActor) {
  if (!actor) return {}
  return {
    parked_by: actor.uid,
    parked_by_name: actor.name,
    parked_at: new Date().toISOString(),
  }
}

export const vehicleParkingService = {
  async assignVehicleToSpace(
    vehicleId: string,
    spaceId: string,
    branchId: string,
    actor?: ParkingActor,
  ): Promise<void> {
    if (!vehicleId || !spaceId) {
      throw new Error('vehicleId and spaceId are required')
    }

    const { data: vehicle } = await supabase
      .from(TABLE)
      .select('organization_id')
      .eq('id', vehicleId)
      .maybeSingle()
    if (!vehicle) {
      throw new Error('Vehicle not found')
    }
    const organizationId = vehicle.organization_id

    const occupiedBy = await vehicleParkingService.findVehicleOnSpace(spaceId, branchId, organizationId)
    if (occupiedBy && occupiedBy !== vehicleId) {
      throw new Error('Another vehicle is already parked on this space')
    }

    const { error } = await supabase
      .from(TABLE)
      .update({ parking_space_id: spaceId, ...actorFields(actor) })
      .eq('id', vehicleId)
    if (error) throw error

    logger.log(`✅ Vehicle ${vehicleId} parked at space ${spaceId}${actor ? ` by ${actor.name}` : ''}`)
  },

  async forceAssignVehicleToSpace(
    vehicleId: string,
    spaceId: string,
    branchId: string,
    actor?: ParkingActor,
  ): Promise<void> {
    if (!vehicleId || !spaceId) {
      throw new Error('vehicleId and spaceId are required')
    }

    const { data: vehicle } = await supabase
      .from(TABLE)
      .select('organization_id')
      .eq('id', vehicleId)
      .maybeSingle()
    const organizationId = vehicle?.organization_id

    const occupant = await vehicleParkingService.findVehicleOnSpace(spaceId, branchId, organizationId)
    if (occupant && occupant !== vehicleId) {
      const { error: clearErr } = await supabase
        .from(TABLE)
        .update({ parking_space_id: null, ...actorFields(actor) })
        .eq('id', occupant)
      if (clearErr) throw clearErr
      logger.log(`↩ Vehicle ${occupant} unparked (overwritten)`)
    }

    const { error } = await supabase
      .from(TABLE)
      .update({ parking_space_id: spaceId, ...actorFields(actor) })
      .eq('id', vehicleId)
    if (error) throw error
    logger.log(`✅ Vehicle ${vehicleId} parked at space ${spaceId} (forced)${actor ? ` by ${actor.name}` : ''}`)
  },

  async unassignVehicle(vehicleId: string, actor?: ParkingActor): Promise<void> {
    if (!vehicleId) throw new Error('vehicleId is required')
    const { error } = await supabase
      .from(TABLE)
      .update({ parking_space_id: null, ...actorFields(actor) })
      .eq('id', vehicleId)
    if (error) throw error
    logger.log(`↩ Vehicle ${vehicleId} unparked${actor ? ` by ${actor.name}` : ''}`)
  },

  async findVehicleOnSpace(
    spaceId: string,
    branchId: string,
    organizationId: string,
  ): Promise<string | null> {
    if (!spaceId || !branchId || !organizationId) return null
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('id, hire_status, transfer_status')
        .eq('organization_id', organizationId)
        .eq('parking_space_id', spaceId)
        .eq('branch_id', branchId)
      if (error) throw error
      if (!data || data.length === 0) return null

      for (const row of data) {
        if (isVehicleActuallyInYard(row)) {
          return row.id
        }
        // Self-heal: clear the orphaned reference silently.
        try {
          await supabase.from(TABLE).update({ parking_space_id: null }).eq('id', row.id)
          logger.log(
            `🧹 Self-heal: cleared orphaned parkingSpaceId on vehicle ${row.id} ` +
            `(hireStatus=${row.hire_status}, transferStatus=${row.transfer_status})`,
          )
        } catch (cleanupErr) {
          logger.error('Self-heal cleanup failed (non-fatal):', cleanupErr)
        }
      }
      return null
    } catch (err) {
      logger.error('findVehicleOnSpace error:', err)
      return null
    }
  },
}
