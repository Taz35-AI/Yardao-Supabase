// src/lib/services/enhancedVehicleService.ts — SUPABASE re-implementation.
// Defleet / restore / hard-delete + their pre-flight checks. Public method
// signatures and return shapes are identical to the Firestore version.

import { supabase } from '@/lib/supabaseClient'
import { activityLogService } from '@/lib/services/activityLogService'
import { toCamel, toCamelList, toSnake } from '@/lib/dbMap'
import { Vehicle, DefleetReason } from '@/types'
import { logger } from '@/lib/logger'

const VEHICLES = 'vehicles'
const CHECKED_IN = 'checked_in_vehicles'
const SERVICE_BOOKINGS = 'service_bookings'

// Fetch a fleet vehicle row (camelCased) + its raw org id.
async function getFleetVehicle(vehicleId: string): Promise<{ vehicle: Vehicle | null; orgId: string | null }> {
  const { data } = await supabase.from(VEHICLES).select('*').eq('id', vehicleId).maybeSingle()
  return { vehicle: toCamel<Vehicle>(data), orgId: data?.organization_id ?? null }
}

// All checked_in_vehicles rows for a fleet vehicle (by id OR registration), deduped.
async function findBranchInstances(orgId: string, vehicleId: string, registration: string): Promise<any[]> {
  const [byId, byReg] = await Promise.all([
    supabase.from(CHECKED_IN).select('*').eq('organization_id', orgId).eq('vehicle_id', vehicleId),
    supabase.from(CHECKED_IN).select('*').eq('organization_id', orgId).eq('registration', registration),
  ])
  const seen = new Set<string>()
  const out: any[] = []
  for (const row of [...(byId.data ?? []), ...(byReg.data ?? [])]) {
    if (!seen.has(row.id)) {
      seen.add(row.id)
      out.push(toCamel<any>(row))
    }
  }
  return out
}

export const enhancedVehicleService = {
  async defleetVehicle(
    vehicleId: string,
    options: {
      reason: DefleetReason
      reasonDetails?: string
      defleetDate: string
      userId: string
      userDisplayName: string
      preserveHistory?: boolean
    }
  ): Promise<{
    success: boolean
    defleeted: boolean
    removedFromBranches: number
    preservedInHistory: boolean
    errors: string[]
  }> {
    const result = {
      success: false,
      defleeted: false,
      removedFromBranches: 0,
      preservedInHistory: false,
      errors: [] as string[],
    }

    try {
      logger.log(`🚗 Starting defleet process for vehicle ID: ${vehicleId}`)

      const { vehicle: fleetVehicle, orgId } = await getFleetVehicle(vehicleId)
      if (!fleetVehicle || !orgId) {
        throw new Error('Vehicle not found in fleet inventory')
      }
      logger.log(`Found fleet vehicle: ${fleetVehicle.registration}`)

      const branchVehicles = await findBranchInstances(orgId, vehicleId, fleetVehicle.registration)
      logger.log(`Found ${branchVehicles.length} instances in branches`)

      // Step 3: Preserve history if requested (default true)
      if (options.preserveHistory !== false && branchVehicles.length > 0) {
        try {
          const { checkoutHistoryService } = await import('@/lib/checkoutHistoryService')
          for (const branchVehicle of branchVehicles) {
            await checkoutHistoryService.addCheckoutRecord({
              registration: branchVehicle.registration,
              make: branchVehicle.make || fleetVehicle.make,
              model: branchVehicle.model || fleetVehicle.model,
              colour: branchVehicle.colour || fleetVehicle.colour,
              size: branchVehicle.size || fleetVehicle.size,
              condition: branchVehicle.condition,
              status: branchVehicle.status,
              mileage: branchVehicle.mileage,
              contract: branchVehicle.contract,
              contractColor: branchVehicle.contractColor,
              insuranceStatus: branchVehicle.insuranceStatus,
              motExpiry: branchVehicle.motExpiry || fleetVehicle.motExpiry,
              taxExpiry: branchVehicle.taxExpiry || fleetVehicle.taxExpiry,
              notes: branchVehicle.notes,
              comments: branchVehicle.comments,
              originalBranchId: branchVehicle.branchId || 'unknown',
              originalBranchName: branchVehicle.branchId || 'Unknown Branch',
              checkedOutDate: new Date(),
              checkedOutBy: options.userId,
              checkedOutByName: options.userDisplayName,
              organizationId: branchVehicle.organizationId,
              originalCheckInDate: branchVehicle.checkInTime ? new Date(branchVehicle.checkInTime) : new Date(),
              originalCheckedInBy: branchVehicle.userId,
              originalCheckedInByName: branchVehicle.lastEditLog?.editedByName || 'Unknown',
              // extra context (stored, not part of the typed contract)
              ...( { vehicleId, deletionReason: `DEFLEETED - ${options.reason}: ${options.reasonDetails || 'No additional details'}` } as any ),
            })
          }
          result.preservedInHistory = true
          logger.log(`✅ Preserved ${branchVehicles.length} branch records in history`)
        } catch (error) {
          logger.error('Failed to preserve history:', error)
          result.errors.push(`Failed to preserve history: ${error}`)
        }
      }

      // Step 4: Delete from all branches
      if (branchVehicles.length > 0) {
        const ids = branchVehicles.map((b) => b.id)
        const { error } = await supabase.from(CHECKED_IN).delete().in('id', ids)
        if (error) throw error
        result.removedFromBranches = branchVehicles.length
        logger.log(`✅ Deleted from ${branchVehicles.length} branches`)
      }

      // Step 5: SOFT DELETE — mark defleeted in fleet inventory (NOT delete)
      const { error: upErr } = await supabase
        .from(VEHICLES)
        .update(
          toSnake({
            isDefleeted: true,
            defleetDate: options.defleetDate,
            defleetProcessedDate: new Date().toISOString(),
            defleetReason: options.reason,
            defleetReasonDetails: options.reasonDetails || '',
            defleetedBy: options.userId,
            defleetedByName: options.userDisplayName,
            currentStatus: 'defleeted',
          })
        )
        .eq('id', vehicleId)
      if (upErr) throw upErr
      result.defleeted = true
      logger.log(`✅ Marked as defleeted in fleet inventory`)

      activityLogService.log({
        organizationId: orgId, actorId: options.userId, actorName: options.userDisplayName,
        actionType: 'defleet', registration: fleetVehicle.registration, entityId: vehicleId,
        summary: `Defleeted: ${options.reason}${options.reasonDetails ? ` — ${options.reasonDetails}` : ''}`,
        details: { reason: options.reason, details: options.reasonDetails || '' },
      })

      // Step 6: Flag any service bookings for this vehicle
      try {
        const { error: sbErr } = await supabase
          .from(SERVICE_BOOKINGS)
          .update({
            vehicle_defleeted: true,
            vehicle_defleeted_at: new Date().toISOString(),
            vehicle_defleeted_by: options.userId,
            notes: `Vehicle defleeted: ${options.reason} - ${options.reasonDetails || 'No additional details'}`,
          })
          .eq('organization_id', orgId)
          .eq('registration', fleetVehicle.registration)
        if (sbErr) throw sbErr
      } catch (error) {
        logger.error('Failed to update service bookings:', error)
        result.errors.push(`Failed to update service bookings: ${error}`)
      }

      result.success = true
      logger.log('✅ Complete vehicle defleet successful')
    } catch (error) {
      logger.error('❌ Vehicle defleet failed:', error)
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
      result.success = false
    }

    return result
  },

  async restoreVehicle(
    vehicleId: string,
    options: { userId: string; userDisplayName: string }
  ): Promise<{ success: boolean; errors: string[] }> {
    const result = { success: false, errors: [] as string[] }
    try {
      const { vehicle } = await getFleetVehicle(vehicleId)
      if (!vehicle) {
        throw new Error('Vehicle not found in fleet inventory')
      }

      const { error } = await supabase
        .from(VEHICLES)
        .update({
          is_defleeted: false,
          current_status: 'in_fleet',
          defleet_date: null,
          defleet_processed_date: null,
          defleet_reason: null,
          defleet_reason_details: null,
          defleeted_by: null,
          defleeted_by_name: null,
          restored_at: new Date().toISOString(),
          restored_by: options.userId,
          restored_by_name: options.userDisplayName,
        })
        .eq('id', vehicleId)
      if (error) throw error

      result.success = true
      logger.log(`✅ Vehicle ${vehicleId} restored to active fleet`)
    } catch (error) {
      logger.error('❌ Vehicle restore failed:', error)
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
    }
    return result
  },

  async canDefleetVehicle(vehicleId: string): Promise<{
    canDefleet: boolean
    reasons: string[]
    branchCount: number
    isOnHire: boolean
    isInService: boolean
  }> {
    const result = {
      canDefleet: true,
      reasons: [] as string[],
      branchCount: 0,
      isOnHire: false,
      isInService: false,
    }

    try {
      const { vehicle, orgId } = await getFleetVehicle(vehicleId)
      if (!vehicle || !orgId) {
        result.canDefleet = false
        result.reasons.push('Vehicle not found in fleet inventory')
        return result
      }

      if (vehicle.isDefleeted) {
        result.canDefleet = false
        result.reasons.push('Vehicle is already defleeted')
        return result
      }

      const { data: branchRows } = await supabase
        .from(CHECKED_IN)
        .select('*')
        .eq('organization_id', orgId)
        .eq('vehicle_id', vehicleId)
      const branches = toCamelList<any>(branchRows)
      result.branchCount = branches.length

      branches.forEach((data) => {
        if (data.status === 'On Hire' || data.hireStatus === 'Out on Hire') {
          result.isOnHire = true
          result.canDefleet = false
          result.reasons.push(`Vehicle is currently out on hire from ${data.branchId || 'a branch'}`)
        }
      })

      const { data: serviceRows } = await supabase
        .from(SERVICE_BOOKINGS)
        .select('status')
        .eq('organization_id', orgId)
        .eq('registration', vehicle.registration)
      const activeServiceBookings = (serviceRows ?? []).filter((d) =>
        ['scheduled', 'checked_in_to_garage'].includes(d.status)
      )

      if (activeServiceBookings.length > 0) {
        result.isInService = true
        result.canDefleet = false
        result.reasons.push('Vehicle is currently in service')
      }

      if (result.isOnHire || result.isInService) {
        result.canDefleet = false
      }
    } catch (error) {
      logger.error('Error checking if vehicle can be defleeted:', error)
      result.canDefleet = false
      result.reasons.push('Error checking vehicle status')
    }

    return result
  },

  async deleteVehicleCompletely(
    vehicleId: string,
    options?: {
      preserveHistory?: boolean
      userId?: string
      userDisplayName?: string
      reason?: string
    }
  ): Promise<{
    success: boolean
    deletedFromFleet: boolean
    deletedFromBranches: number
    preservedInHistory: boolean
    errors: string[]
  }> {
    const result = {
      success: false,
      deletedFromFleet: false,
      deletedFromBranches: 0,
      preservedInHistory: false,
      errors: [] as string[],
    }

    try {
      logger.log(`🗑️ Starting complete vehicle deletion for ID: ${vehicleId}`)

      const { vehicle: fleetVehicle, orgId } = await getFleetVehicle(vehicleId)
      if (!fleetVehicle || !orgId) {
        throw new Error('Vehicle not found in fleet inventory')
      }
      logger.log(`Found fleet vehicle: ${fleetVehicle.registration}`)

      const branchVehicles = await findBranchInstances(orgId, vehicleId, fleetVehicle.registration)
      logger.log(`Found ${branchVehicles.length} instances in branches`)

      if (options?.preserveHistory && branchVehicles.length > 0) {
        try {
          const { checkoutHistoryService } = await import('@/lib/checkoutHistoryService')
          for (const branchVehicle of branchVehicles) {
            await checkoutHistoryService.addCheckoutRecord({
              registration: branchVehicle.registration,
              make: branchVehicle.make || fleetVehicle.make,
              model: branchVehicle.model || fleetVehicle.model,
              colour: branchVehicle.colour || fleetVehicle.colour,
              size: branchVehicle.size || fleetVehicle.size,
              condition: branchVehicle.condition,
              status: branchVehicle.status,
              mileage: branchVehicle.mileage,
              contract: branchVehicle.contract,
              contractColor: branchVehicle.contractColor,
              insuranceStatus: branchVehicle.insuranceStatus,
              motExpiry: branchVehicle.motExpiry || fleetVehicle.motExpiry,
              taxExpiry: branchVehicle.taxExpiry || fleetVehicle.taxExpiry,
              notes: branchVehicle.notes,
              comments: branchVehicle.comments,
              originalBranchId: branchVehicle.branchId || 'unknown',
              originalBranchName: branchVehicle.branchId || 'Unknown Branch',
              checkedOutDate: new Date(),
              checkedOutBy: options.userId || 'system',
              checkedOutByName: options.userDisplayName || 'System Deletion',
              organizationId: branchVehicle.organizationId,
              originalCheckInDate: branchVehicle.checkInTime ? new Date(branchVehicle.checkInTime) : new Date(),
              originalCheckedInBy: branchVehicle.userId,
              originalCheckedInByName: branchVehicle.lastEditLog?.editedByName || 'Unknown',
              ...( { vehicleId, deletionReason: options.reason || 'Deleted from fleet inventory' } as any ),
            })
          }
          result.preservedInHistory = true
          logger.log(`✅ Preserved ${branchVehicles.length} branch records in history`)
        } catch (error) {
          logger.error('Failed to preserve history:', error)
          result.errors.push(`Failed to preserve history: ${error}`)
        }
      }

      if (branchVehicles.length > 0) {
        const ids = branchVehicles.map((b) => b.id)
        const { error } = await supabase.from(CHECKED_IN).delete().in('id', ids)
        if (error) throw error
        result.deletedFromBranches = branchVehicles.length
        logger.log(`✅ Deleted from ${branchVehicles.length} branches`)
      }

      const { error: delErr } = await supabase.from(VEHICLES).delete().eq('id', vehicleId)
      if (delErr) throw delErr
      result.deletedFromFleet = true
      logger.log(`✅ Deleted from fleet inventory`)

      try {
        const { error: sbErr } = await supabase
          .from(SERVICE_BOOKINGS)
          .update({
            vehicle_deleted: true,
            vehicle_deleted_at: new Date().toISOString(),
            vehicle_deleted_by: options?.userId || 'system',
            notes: `Vehicle deleted from fleet: ${options?.reason || 'No reason provided'}`,
          })
          .eq('organization_id', orgId)
          .eq('registration', fleetVehicle.registration)
        if (sbErr) throw sbErr
      } catch (error) {
        logger.error('Failed to update service bookings:', error)
        result.errors.push(`Failed to update service bookings: ${error}`)
      }

      result.success = true
      logger.log('✅ Complete vehicle deletion successful')
    } catch (error) {
      logger.error('❌ Vehicle deletion failed:', error)
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
      result.success = false
    }

    return result
  },

  async canDeleteVehicle(vehicleId: string): Promise<{
    canDelete: boolean
    reasons: string[]
    branchCount: number
    isOnHire: boolean
    isInService: boolean
  }> {
    const result = {
      canDelete: true,
      reasons: [] as string[],
      branchCount: 0,
      isOnHire: false,
      isInService: false,
    }

    try {
      const { vehicle, orgId } = await getFleetVehicle(vehicleId)
      if (!vehicle || !orgId) {
        result.canDelete = false
        result.reasons.push('Vehicle not found in fleet inventory')
        return result
      }

      const { data: branchRows } = await supabase
        .from(CHECKED_IN)
        .select('*')
        .eq('organization_id', orgId)
        .eq('vehicle_id', vehicleId)
      const branches = toCamelList<any>(branchRows)
      result.branchCount = branches.length

      branches.forEach((data) => {
        if (data.hireStatus === 'Out on Hire') {
          result.isOnHire = true
          result.canDelete = false
          result.reasons.push(`Vehicle is currently out on hire from ${data.branchId || 'a branch'}`)
        }
      })

      const { data: serviceRows } = await supabase
        .from(SERVICE_BOOKINGS)
        .select('status')
        .eq('organization_id', orgId)
        .eq('registration', vehicle.registration)
      const activeServiceBookings = (serviceRows ?? []).filter((d) =>
        ['scheduled', 'checked_in_to_garage'].includes(d.status)
      )

      if (activeServiceBookings.length > 0) {
        result.isInService = true
        result.canDelete = false
        result.reasons.push('Vehicle is currently in service')
      }
    } catch (error) {
      logger.error('Error checking if vehicle can be deleted:', error)
      result.canDelete = false
      result.reasons.push('Error checking vehicle status')
    }

    return result
  },
}
