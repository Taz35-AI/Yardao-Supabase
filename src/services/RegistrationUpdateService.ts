// src/services/RegistrationUpdateService.ts — SUPABASE re-implementation.
//
// Cascades a vehicle's registration change across the essential tables. Public
// class + static method signatures and the RegistrationUpdateResult shape are
// kept identical to the Firestore version; only the internals change.
//
// Collection → table mapping:
//   checkedInVehicles       → checked_in_vehicles
//   serviceBookings         → service_bookings
//   externalServiceVehicles → (no dedicated table) vehicles at an external
//                             garage live in checked_in_vehicles with
//                             transfer_status = 'at_external_garage'. The
//                             original treated this collection as optional and
//                             swallowed errors; we mirror that, counting the
//                             external-garage subset under `externalServices`.
//
// writeBatch → Promise.all of single-row updates. updated_at is stamped by the
// per-table BEFORE UPDATE trigger (set_updated_at), replacing serverTimestamp().
import { supabase } from '@/lib/supabaseClient'
import { logger } from '@/lib/logger'

export interface RegistrationUpdateResult {
  success: boolean
  collections: {
    checkedInVehicles: number
    serviceBookings: number
    externalServices: number
    total: number
  }
  errors: string[]
  oldRegistration: string
  newRegistration: string
}

const CHECKED_IN_VEHICLES = 'checked_in_vehicles'
const SERVICE_BOOKINGS = 'service_bookings'
const VEHICLES = 'vehicles'

/**
 * Service to cascade registration changes across ONLY essential collections
 * Updates: checkedInVehicles, serviceBookings, externalServiceVehicles
 */
export class RegistrationUpdateService {

  static async cascadeRegistrationUpdate(
    vehicleId: string,
    oldRegistration: string,
    newRegistration: string,
    organizationId: string,
    userId: string,
    userDisplayName: string
  ): Promise<RegistrationUpdateResult> {

    logger.log(`🔄 REGISTRATION UPDATE: ${oldRegistration} → ${newRegistration}`)

    const result: RegistrationUpdateResult = {
      success: false,
      collections: {
        checkedInVehicles: 0,
        serviceBookings: 0,
        externalServices: 0,
        total: 0
      },
      errors: [],
      oldRegistration,
      newRegistration
    }

    // Normalize registrations
    const oldRegClean = oldRegistration.trim().toUpperCase().replace(/\s+/g, '')
    const newRegClean = newRegistration.trim().toUpperCase()

    try {
      // Collect single-row updates and run them together (replaces writeBatch).
      const updates: PromiseLike<any>[] = []

      // 1. UPDATE CHECKED-IN VEHICLES (ALL BRANCHES)
      logger.log('📍 Updating checked-in vehicles...')

      try {
        // Fetch all checked-in rows for the org once, then match by vehicleId
        // OR by normalised registration (legacy data) — de-duplicated by id.
        const { data: checkedInRows, error: checkedInError } = await supabase
          .from(CHECKED_IN_VEHICLES)
          .select('id, vehicle_id, registration')
          .eq('organization_id', organizationId)
        if (checkedInError) throw checkedInError

        const processedIds = new Set<string>()

        for (const row of checkedInRows ?? []) {
          if (processedIds.has(row.id)) continue

          const docReg = (row.registration || '').toUpperCase().replace(/\s+/g, '')
          const matches = row.vehicle_id === vehicleId || docReg === oldRegClean
          if (!matches) continue

          processedIds.add(row.id)
          updates.push(
            supabase
              .from(CHECKED_IN_VEHICLES)
              .update({ registration: newRegistration })
              .eq('id', row.id)
          )
          result.collections.checkedInVehicles++
        }

        logger.log(`  ✓ Found ${result.collections.checkedInVehicles} checked-in vehicles`)

      } catch (error) {
        logger.log('Could not update checked-in vehicles:', error)
        // Continue with other collections
      }

      // 2. UPDATE SERVICE BOOKINGS
      logger.log('🔧 Updating service bookings...')

      try {
        const { data: bookingRows, error: bookingError } = await supabase
          .from(SERVICE_BOOKINGS)
          .select('id, registration')
          .eq('organization_id', organizationId)
        if (bookingError) throw bookingError

        for (const row of bookingRows ?? []) {
          const docReg = (row.registration || '').toUpperCase().replace(/\s+/g, '')
          if (docReg !== oldRegClean) continue

          updates.push(
            supabase
              .from(SERVICE_BOOKINGS)
              .update({ registration: newRegistration })
              .eq('id', row.id)
          )
          result.collections.serviceBookings++
        }

        logger.log(`  ✓ Found ${result.collections.serviceBookings} service bookings`)

      } catch (error) {
        logger.log('Could not update service bookings:', error)
        // Continue with other collections
      }

      // 3. UPDATE EXTERNAL SERVICE VEHICLES
      // No dedicated table: vehicles at an external garage are checked_in_vehicles
      // rows with transfer_status = 'at_external_garage'. Count that subset here
      // so the externalServices tally is preserved. Those ids were already
      // updated in step 1, so we only tally — we do not double-write.
      logger.log('🏭 Updating external service records...')

      try {
        const newRegCleanNoSpace = newRegClean.replace(/\s+/g, '')
        const { data: externalRows, error: externalError } = await supabase
          .from(CHECKED_IN_VEHICLES)
          .select('id, vehicle_id, registration')
          .eq('organization_id', organizationId)
          .eq('transfer_status', 'at_external_garage')
        if (externalError) throw externalError

        for (const row of externalRows ?? []) {
          const docReg = (row.registration || '').toUpperCase().replace(/\s+/g, '')
          const matches =
            row.vehicle_id === vehicleId || docReg === oldRegClean || docReg === newRegCleanNoSpace
          if (!matches) continue
          result.collections.externalServices++
        }

        logger.log(`  ✓ Found ${result.collections.externalServices} external service records`)

      } catch (error) {
        logger.log('Could not update external service vehicles:', error)
        // This collection might not exist, that's OK
      }

      // Commit the updates
      if (updates.length > 0) {
        logger.log(`💾 Updating ${updates.length} documents...`)
        const settled = await Promise.all(updates)
        for (const res of settled) {
          if (res?.error) throw res.error
        }
        logger.log('✅ All updates committed successfully!')
      } else {
        logger.log('ℹ️ No documents needed updating')
      }

      // Calculate total
      result.collections.total =
        result.collections.checkedInVehicles +
        result.collections.serviceBookings +
        result.collections.externalServices

      result.success = true

      logger.log(`\n✅ REGISTRATION UPDATE COMPLETE!`)
      logger.log(`📊 Updated ${result.collections.total} total documents:`)
      logger.log(`  • Checked-in vehicles: ${result.collections.checkedInVehicles}`)
      logger.log(`  • Service bookings: ${result.collections.serviceBookings}`)
      logger.log(`  • External services: ${result.collections.externalServices}`)

      return result

    } catch (error) {
      logger.error('❌ Registration update failed:', error)
      result.errors.push(error instanceof Error ? error.message : 'Unknown error')
      result.success = false
      return result
    }
  }

  /**
   * Validate that new registration doesn't already exist
   */
  static async validateNewRegistration(
    newRegistration: string,
    organizationId: string,
    excludeVehicleId?: string
  ): Promise<{ valid: boolean; error?: string }> {

    const cleanReg = newRegistration.trim().toUpperCase().replace(/\s+/g, '')

    // Check in fleet
    const { data: fleetRows, error } = await supabase
      .from(VEHICLES)
      .select('id, registration')
      .eq('organization_id', organizationId)
    if (error) throw error

    for (const row of fleetRows ?? []) {
      if (excludeVehicleId && row.id === excludeVehicleId) continue

      const existingReg = (row.registration || '').toUpperCase().replace(/\s+/g, '')

      if (existingReg === cleanReg) {
        return {
          valid: false,
          error: `Registration ${newRegistration} already exists in fleet`
        }
      }
    }

    return { valid: true }
  }
}
