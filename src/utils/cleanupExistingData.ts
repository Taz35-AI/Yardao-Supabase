// src/utils/cleanupExistingData.ts — SUPABASE re-implementation.
// One-time utility to clean existing vehicle data. Exported function names,
// signatures and result shapes are kept identical to the Firestore version;
// only the internals change.
//
//   fleet             → vehicles            (the fleet master record)
//   checkedInVehicles → checked_in_vehicles
//   updatedAt         → stamped by each table's BEFORE UPDATE trigger
//   writeBatch        → Promise.all of single-row updates

import { supabase } from '@/lib/supabaseClient'
import { logger } from '@/lib/logger'

// Helper function to clean and normalize string data
const cleanString = (value: any): string => {
  if (!value) return ''

  return String(value)
    .trim() // Remove leading/trailing whitespace
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/[\t\n\r]/g, ' ') // Replace tabs and newlines with space
    .replace(/[""'']/g, '') // Remove smart quotes
    .replace(/^\s+|\s+$/g, '') // Extra trim for good measure
}

interface CleanupResult {
  totalProcessed: number
  totalUpdated: number
  errors: string[]
  updates: Array<{
    id: string
    registration: string
    before: { make: string; model: string }
    after: { make: string; model: string }
  }>
}

/**
 * Clean existing fleet vehicles in the database
 */
export async function cleanupFleetVehicles(organizationId: string): Promise<CleanupResult> {
  logger.log('🧹 Starting fleet vehicle cleanup...')

  const result: CleanupResult = {
    totalProcessed: 0,
    totalUpdated: 0,
    errors: [],
    updates: []
  }

  try {
    // Query all fleet vehicles for the organization
    const { data: rows, error } = await supabase
      .from('vehicles')
      .select('id, registration, make, model')
      .eq('organization_id', organizationId)
    if (error) throw error

    logger.log(`📊 Found ${(rows ?? []).length} fleet vehicles to process`)

    // Collect single-row updates (replaces writeBatch).
    const updates: PromiseLike<any>[] = []

    for (const data of rows ?? []) {
      result.totalProcessed++

      // Clean make and model
      const cleanedMake = cleanString(data.make)
      const cleanedModel = cleanString(data.model)

      // Check if cleaning actually changed anything
      const needsUpdate = cleanedMake !== data.make || cleanedModel !== data.model

      if (needsUpdate) {
        result.totalUpdated++

        // Log the change
        result.updates.push({
          id: data.id,
          registration: data.registration || 'Unknown',
          before: {
            make: data.make || '',
            model: data.model || ''
          },
          after: {
            make: cleanedMake,
            model: cleanedModel
          }
        })

        // Queue the update (updated_at is stamped by the table trigger)
        updates.push(
          supabase
            .from('vehicles')
            .update({ make: cleanedMake, model: cleanedModel })
            .eq('id', data.id)
        )
      }
    }

    // Commit all queued updates
    if (updates.length > 0) {
      const settled = await Promise.all(updates)
      for (const res of settled) {
        if (res?.error) throw res.error
      }
      logger.log(`✅ Committed ${updates.length} updates`)
    }

    logger.log(`✨ Fleet cleanup complete: ${result.totalUpdated} of ${result.totalProcessed} vehicles updated`)

  } catch (error) {
    logger.error('❌ Error during fleet cleanup:', error)
    result.errors.push(`Fleet cleanup error: ${error instanceof Error ? error.message : String(error)}`)
  }

  return result
}

/**
 * Clean existing checked-in vehicles (yard) in the database
 */
export async function cleanupCheckedInVehicles(organizationId: string): Promise<CleanupResult> {
  logger.log('🧹 Starting checked-in vehicles cleanup...')

  const result: CleanupResult = {
    totalProcessed: 0,
    totalUpdated: 0,
    errors: [],
    updates: []
  }

  try {
    // Query all checked-in vehicles for the organization
    const { data: rows, error } = await supabase
      .from('checked_in_vehicles')
      .select('id, registration, make, model')
      .eq('organization_id', organizationId)
    if (error) throw error

    logger.log(`📊 Found ${(rows ?? []).length} checked-in vehicles to process`)

    // Collect single-row updates (replaces writeBatch).
    const updates: PromiseLike<any>[] = []

    for (const data of rows ?? []) {
      result.totalProcessed++

      // Clean make and model
      const cleanedMake = cleanString(data.make)
      const cleanedModel = cleanString(data.model)

      // Check if cleaning actually changed anything
      const needsUpdate = cleanedMake !== data.make || cleanedModel !== data.model

      if (needsUpdate) {
        result.totalUpdated++

        // Log the change
        result.updates.push({
          id: data.id,
          registration: data.registration || 'Unknown',
          before: {
            make: data.make || '',
            model: data.model || ''
          },
          after: {
            make: cleanedMake,
            model: cleanedModel
          }
        })

        // Queue the update (updated_at is stamped by the table trigger)
        updates.push(
          supabase
            .from('checked_in_vehicles')
            .update({ make: cleanedMake, model: cleanedModel })
            .eq('id', data.id)
        )
      }
    }

    // Commit all queued updates
    if (updates.length > 0) {
      const settled = await Promise.all(updates)
      for (const res of settled) {
        if (res?.error) throw res.error
      }
      logger.log(`✅ Committed ${updates.length} updates`)
    }

    logger.log(`✨ Yard cleanup complete: ${result.totalUpdated} of ${result.totalProcessed} vehicles updated`)

  } catch (error) {
    logger.error('❌ Error during yard cleanup:', error)
    result.errors.push(`Yard cleanup error: ${error instanceof Error ? error.message : String(error)}`)
  }

  return result
}

/**
 * Main cleanup function - cleans both fleet and yard vehicles
 */
export async function cleanupAllVehicleData(organizationId: string): Promise<{
  fleet: CleanupResult
  yard: CleanupResult
  summary: {
    totalProcessed: number
    totalUpdated: number
    totalErrors: number
    duplicatesFound: string[]
  }
}> {
  logger.log('🚀 Starting complete vehicle data cleanup...')
  logger.log(`Organization ID: ${organizationId}`)

  // Clean fleet vehicles
  const fleetResult = await cleanupFleetVehicles(organizationId)

  // Clean checked-in vehicles
  const yardResult = await cleanupCheckedInVehicles(organizationId)

  // Find potential duplicates after cleaning
  const duplicatesFound = findDuplicates([...fleetResult.updates, ...yardResult.updates])

  // Create summary
  const summary = {
    totalProcessed: fleetResult.totalProcessed + yardResult.totalProcessed,
    totalUpdated: fleetResult.totalUpdated + yardResult.totalUpdated,
    totalErrors: fleetResult.errors.length + yardResult.errors.length,
    duplicatesFound
  }

  // Log detailed results
  logger.log('📋 Cleanup Summary:')
  logger.log(`- Total vehicles processed: ${summary.totalProcessed}`)
  logger.log(`- Total vehicles updated: ${summary.totalUpdated}`)
  logger.log(`- Total errors: ${summary.totalErrors}`)

  if (duplicatesFound.length > 0) {
    logger.log('⚠️ Potential duplicates found after cleaning:')
    duplicatesFound.forEach(dup => logger.log(`  - ${dup}`))
  }

  // Log some example updates
  if (fleetResult.updates.length > 0) {
    logger.log('\n📝 Example fleet updates:')
    fleetResult.updates.slice(0, 5).forEach(update => {
      logger.log(`  ${update.registration}: "${update.before.make} ${update.before.model}" → "${update.after.make} ${update.after.model}"`)
    })
  }

  if (yardResult.updates.length > 0) {
    logger.log('\n📝 Example yard updates:')
    yardResult.updates.slice(0, 5).forEach(update => {
      logger.log(`  ${update.registration}: "${update.before.make} ${update.before.model}" → "${update.after.make} ${update.after.model}"`)
    })
  }

  logger.log('\n✅ Cleanup complete!')

  return {
    fleet: fleetResult,
    yard: yardResult,
    summary
  }
}

/**
 * Helper function to find potential duplicates
 */
function findDuplicates(updates: CleanupResult['updates']): string[] {
  const seen = new Map<string, number>()
  const duplicates: string[] = []

  updates.forEach(update => {
    const key = `${update.after.make.toLowerCase()}-${update.after.model.toLowerCase()}`
    const count = seen.get(key) || 0
    seen.set(key, count + 1)

    if (count === 1) { // Second occurrence
      duplicates.push(`${update.after.make} ${update.after.model}`)
    }
  })

  return [...new Set(duplicates)] // Remove duplicate duplicate entries (meta!)
}
