// src/services/notesCleanupService.ts — SUPABASE re-implementation.
//
// Bulk prunes stale text from checked_in_vehicles notes/comments. Public class
// instance, exported singleton, method signatures and result/operation shapes
// are kept identical to the Firestore version; only the internals change.
//
//   checkedInVehicles → checked_in_vehicles  (notes, comments, last_edit_log)
//   deleteField()     → set column to null   (Postgres has no field-delete)
//   serverTimestamp() → handled by the BEFORE UPDATE trigger (set_updated_at)
//   writeBatch        → Promise.all of single-row updates
//   lastEditLog AuditLog object is stored verbatim in the last_edit_log jsonb
//   column (camelCase keys pass through, per dbMap conventions).
import { supabase } from '@/lib/supabaseClient'
import { AuditLog } from '@/types'
import { logger } from '@/lib/logger'

logger.log('🔧 NotesCleanupService loading...')

const CHECKED_IN_VEHICLES = 'checked_in_vehicles'

export interface NotesCleanupOperation {
  targetText: string
  mode: 'word' | 'phrase' | 'contains'
  fields: ('notes' | 'comments')[]
  action: 'remove_word' | 'clear_field' // remove specific text or clear entire field
}

export interface NotesCleanupResult {
  totalVehicles: number
  modifiedVehicles: number
  operationDetails: {
    vehicleId: string
    registration: string
    fieldsModified: string[]
    originalValues: Record<string, string>
    newValues: Record<string, string>
  }[]
  errors: string[]
}

class NotesCleanupService {
  constructor() {
    logger.log('🔧 NotesCleanupService instance created')
  }

  private createAuditLog(userDisplayName: string, userId: string, operation: NotesCleanupOperation): AuditLog {
    logger.log('📝 Creating audit log for user:', userDisplayName)
    return {
      action: `Bulk notes cleanup: ${operation.action} "${operation.targetText}" from ${operation.fields.join(', ')}`,
      by: userId,
      byDisplayName: userDisplayName,
      timestamp: new Date().toISOString()
    }
  }

  private processTextRemoval(
    text: string,
    targetText: string,
    mode: NotesCleanupOperation['mode'],
    action: NotesCleanupOperation['action']
  ): { modified: boolean; newText: string } {
    logger.log('🔍 Processing text removal:', { text: text?.substring(0, 50), targetText, mode, action })

    if (!text || !targetText) {
      return { modified: false, newText: text }
    }

    if (action === 'clear_field') {
      // If the field contains the target text, clear the entire field
      const contains = this.textContainsTarget(text, targetText, mode)
      logger.log('🎯 Clear field check:', { contains })
      return {
        modified: contains,
        newText: contains ? '' : text
      }
    }

    // action === 'remove_word' - remove only the specific text
    let newText = text
    let modified = false

    switch (mode) {
      case 'word':
        // Remove whole words only (word boundaries)
        const wordRegex = new RegExp(`\\b${this.escapeRegex(targetText)}\\b`, 'gi')
        if (wordRegex.test(text)) {
          newText = text.replace(wordRegex, '').replace(/\s+/g, ' ').trim()
          modified = true
        }
        break

      case 'phrase':
        // Remove exact phrase matches
        const phraseRegex = new RegExp(this.escapeRegex(targetText), 'gi')
        if (phraseRegex.test(text)) {
          newText = text.replace(phraseRegex, '').replace(/\s+/g, ' ').trim()
          modified = true
        }
        break

      case 'contains':
        // Remove any occurrence (case-insensitive)
        const lowerText = text.toLowerCase()
        const lowerTarget = targetText.toLowerCase()
        if (lowerText.includes(lowerTarget)) {
          const containsRegex = new RegExp(this.escapeRegex(targetText), 'gi')
          newText = text.replace(containsRegex, '').replace(/\s+/g, ' ').trim()
          modified = true
        }
        break
    }

    logger.log('✂️ Text processing result:', { modified, originalLength: text.length, newLength: newText.length })
    return { modified, newText }
  }

  private textContainsTarget(
    text: string,
    targetText: string,
    mode: NotesCleanupOperation['mode']
  ): boolean {
    if (!text || !targetText) return false

    switch (mode) {
      case 'word':
        const wordRegex = new RegExp(`\\b${this.escapeRegex(targetText)}\\b`, 'i')
        return wordRegex.test(text)

      case 'phrase':
        return text.toLowerCase().includes(targetText.toLowerCase())

      case 'contains':
        return text.toLowerCase().includes(targetText.toLowerCase())

      default:
        return false
    }
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  async performNotesCleanup(
    organizationId: string,
    operation: NotesCleanupOperation,
    userDisplayName: string,
    userId: string
  ): Promise<NotesCleanupResult> {
    logger.log('🚀 Starting notes cleanup operation:', {
      organizationId,
      operation,
      userDisplayName,
      userId
    })

    const result: NotesCleanupResult = {
      totalVehicles: 0,
      modifiedVehicles: 0,
      operationDetails: [],
      errors: []
    }

    try {
      // Get all checked-in vehicles for the organization
      logger.log('📊 Querying vehicles for organization:', organizationId)
      const { data: vehicles, error: vehiclesError } = await supabase
        .from(CHECKED_IN_VEHICLES)
        .select('id, registration, notes, comments')
        .eq('organization_id', organizationId)
      if (vehiclesError) throw vehiclesError

      result.totalVehicles = (vehicles ?? []).length
      logger.log(`📋 Found ${result.totalVehicles} vehicles to check`)

      if (result.totalVehicles === 0) {
        logger.log('⚠️ No vehicles found for organization')
        return result
      }

      const auditLog = this.createAuditLog(userDisplayName, userId, operation)

      // Collect single-row updates (replaces writeBatch); commit together.
      const pendingUpdates: { id: string; updateData: Record<string, any> }[] = []

      for (const vehicleData of vehicles ?? []) {
        try {
          const vehicleId = vehicleData.id
          const registration = vehicleData.registration || 'Unknown'

          logger.log(`🚗 Processing vehicle: ${registration} (${vehicleId})`)

          const updateData: any = {}
          const fieldsModified: string[] = []
          const originalValues: Record<string, string> = {}
          const newValues: Record<string, string> = {}
          let vehicleModified = false

          // Process each specified field
          for (const field of operation.fields) {
            const currentValue = (vehicleData as any)[field] || ''
            originalValues[field] = currentValue

            logger.log(`🔍 Checking field '${field}' for vehicle ${registration}:`, currentValue?.substring(0, 100))

            const { modified, newText } = this.processTextRemoval(
              currentValue,
              operation.targetText,
              operation.mode,
              operation.action
            )

            if (modified) {
              // Handle empty field clearing properly. Postgres has no field
              // delete, so we null the column (equivalent to deleteField()).
              if (newText === '' || newText.trim() === '') {
                updateData[field] = null
                newValues[field] = '(empty - field deleted)'
                logger.log(`🗑️ Field '${field}' will be DELETED for ${registration}`)
              } else {
                updateData[field] = newText
                newValues[field] = newText
                logger.log(`✏️ Field '${field}' will be UPDATED for ${registration}`)
              }

              fieldsModified.push(field)
              vehicleModified = true
            } else {
              newValues[field] = currentValue
              logger.log(`⏭️ Field '${field}' unchanged for ${registration}`)
            }
          }

          // If any field was modified, queue the update
          if (vehicleModified) {
            // Stamp the audit log. updated_at is set by the table's trigger.
            updateData.last_edit_log = auditLog

            pendingUpdates.push({ id: vehicleId, updateData })

            result.operationDetails.push({
              vehicleId,
              registration,
              fieldsModified,
              originalValues,
              newValues
            })

            logger.log(`📝 Vehicle ${registration} queued for update`)
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          logger.error(`❌ Error processing vehicle ${vehicleData.id}:`, error)
          result.errors.push(`Vehicle ${vehicleData.id}: ${errorMsg}`)
        }
      }

      // Commit all queued updates together
      if (pendingUpdates.length > 0) {
        logger.log(`💾 Committing ${pendingUpdates.length} modifications`)
        const settled = await Promise.all(
          pendingUpdates.map(({ id, updateData }) =>
            supabase.from(CHECKED_IN_VEHICLES).update(updateData).eq('id', id)
          )
        )
        for (const res of settled) {
          if (res?.error) throw res.error
        }
        result.modifiedVehicles = pendingUpdates.length
        logger.log(`✅ Updates committed successfully`)
      } else {
        logger.log(`⏭️ No modifications, skipping commit`)
      }

      logger.log('🎉 Notes cleanup operation completed:', {
        totalVehicles: result.totalVehicles,
        modifiedVehicles: result.modifiedVehicles,
        errorCount: result.errors.length
      })

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to perform notes cleanup'
      logger.error('💥 Notes cleanup operation failed:', error)
      result.errors.push(`Operation failed: ${errorMsg}`)
      throw new Error(errorMsg)
    }

    return result
  }

  // Preview function to show what would be modified without actually changing anything
  async previewNotesCleanup(
    organizationId: string,
    operation: NotesCleanupOperation
  ): Promise<{
    totalVehicles: number
    affectedVehicles: {
      id: string
      registration: string
      fieldsAffected: string[]
      changes: Record<string, { from: string; to: string }>
    }[]
  }> {
    logger.log('👀 Starting preview for notes cleanup:', { organizationId, operation })

    try {
      const { data: vehicles, error } = await supabase
        .from(CHECKED_IN_VEHICLES)
        .select('id, registration, notes, comments')
        .eq('organization_id', organizationId)
      if (error) throw error

      const affectedVehicles: any[] = []

      logger.log(`📊 Preview: Found ${(vehicles ?? []).length} vehicles to analyze`)

      for (const vehicleData of vehicles ?? []) {
        const registration = vehicleData.registration || 'Unknown'
        const fieldsAffected: string[] = []
        const changes: Record<string, { from: string; to: string }> = {}

        for (const field of operation.fields) {
          const currentValue = (vehicleData as any)[field] || ''
          const { modified, newText } = this.processTextRemoval(
            currentValue,
            operation.targetText,
            operation.mode,
            operation.action
          )

          if (modified) {
            fieldsAffected.push(field)
            changes[field] = {
              from: currentValue,
              to: newText === '' ? '(empty - field will be deleted)' : newText
            }
          }
        }

        if (fieldsAffected.length > 0) {
          affectedVehicles.push({
            id: vehicleData.id,
            registration,
            fieldsAffected,
            changes
          })
          logger.log(`🎯 Vehicle ${registration} will be affected in fields:`, fieldsAffected)
        }
      }

      logger.log(`👀 Preview complete: ${affectedVehicles.length} vehicles will be affected`)

      return {
        totalVehicles: (vehicles ?? []).length,
        affectedVehicles
      }
    } catch (error) {
      logger.error('💥 Preview failed:', error)
      throw error
    }
  }
}

const notesCleanupServiceInstance = new NotesCleanupService()
logger.log('✅ NotesCleanupService instance exported')

export const notesCleanupService = notesCleanupServiceInstance
