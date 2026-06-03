// src/services/notesCleanupService.ts - FIXED: Proper field clearing and deletion
import { db } from '@/lib/firebase'
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  writeBatch,
  serverTimestamp,
  deleteField
} from 'firebase/firestore'
import { AuditLog } from '@/types'
import { logger } from '@/lib/logger'

logger.log('🔧 NotesCleanupService loading...')

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
      const vehiclesQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId)
      )

      const vehiclesSnapshot = await getDocs(vehiclesQuery)
      result.totalVehicles = vehiclesSnapshot.docs.length
      logger.log(`📋 Found ${result.totalVehicles} vehicles to check`)

      if (result.totalVehicles === 0) {
        logger.log('⚠️ No vehicles found for organization')
        return result
      }

      // Process vehicles in batches (Firestore batch limit is 500)
      const batchSize = 500
      const vehicles = vehiclesSnapshot.docs
      const auditLog = this.createAuditLog(userDisplayName, userId, operation)

      for (let i = 0; i < vehicles.length; i += batchSize) {
        const batch = writeBatch(db)
        const batchVehicles = vehicles.slice(i, i + batchSize)
        let batchModifiedCount = 0

        logger.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}, vehicles ${i + 1}-${Math.min(i + batchSize, vehicles.length)}`)

        for (const vehicleDoc of batchVehicles) {
          try {
            const vehicleData = vehicleDoc.data()
            const vehicleId = vehicleDoc.id
            const registration = vehicleData.registration || 'Unknown'

            logger.log(`🚗 Processing vehicle: ${registration} (${vehicleId})`)

            const updateData: any = {}
            const fieldsModified: string[] = []
            const originalValues: Record<string, string> = {}
            const newValues: Record<string, string> = {}
            let vehicleModified = false

            // Process each specified field
            for (const field of operation.fields) {
              const currentValue = vehicleData[field] || ''
              originalValues[field] = currentValue

              logger.log(`🔍 Checking field '${field}' for vehicle ${registration}:`, currentValue?.substring(0, 100))

              const { modified, newText } = this.processTextRemoval(
                currentValue,
                operation.targetText,
                operation.mode,
                operation.action
              )

              if (modified) {
                // CRITICAL FIX: Handle empty field clearing properly
                if (newText === '' || newText.trim() === '') {
                  // Use deleteField() to completely remove the field from Firestore
                  // This ensures the field is truly empty and not cached
                  updateData[field] = deleteField()
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

            // If any field was modified, add to batch
            if (vehicleModified) {
              // CRITICAL: Always update these fields to ensure fresh data
              updateData.lastEditLog = auditLog
              updateData.updatedAt = serverTimestamp()

              batch.update(doc(db, 'checkedInVehicles', vehicleId), updateData)
              
              result.operationDetails.push({
                vehicleId,
                registration,
                fieldsModified,
                originalValues,
                newValues
              })

              batchModifiedCount++
              logger.log(`📝 Vehicle ${registration} queued for update`)
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error'
            logger.error(`❌ Error processing vehicle ${vehicleDoc.id}:`, error)
            result.errors.push(`Vehicle ${vehicleDoc.id}: ${errorMsg}`)
          }
        }

        // Commit the batch if there are modifications
        if (batchModifiedCount > 0) {
          logger.log(`💾 Committing batch with ${batchModifiedCount} modifications`)
          await batch.commit()
          result.modifiedVehicles += batchModifiedCount
          logger.log(`✅ Batch committed successfully`)
          
          // CRITICAL: Add a small delay to ensure Firestore consistency
          await new Promise(resolve => setTimeout(resolve, 250))
        } else {
          logger.log(`⏭️ No modifications in this batch, skipping commit`)
        }
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
      const vehiclesQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId)
      )

      const vehiclesSnapshot = await getDocs(vehiclesQuery)
      const affectedVehicles: any[] = []

      logger.log(`📊 Preview: Found ${vehiclesSnapshot.docs.length} vehicles to analyze`)

      for (const vehicleDoc of vehiclesSnapshot.docs) {
        const vehicleData = vehicleDoc.data()
        const registration = vehicleData.registration || 'Unknown'
        const fieldsAffected: string[] = []
        const changes: Record<string, { from: string; to: string }> = {}

        for (const field of operation.fields) {
          const currentValue = vehicleData[field] || ''
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
            id: vehicleDoc.id,
            registration,
            fieldsAffected,
            changes
          })
          logger.log(`🎯 Vehicle ${registration} will be affected in fields:`, fieldsAffected)
        }
      }

      logger.log(`👀 Preview complete: ${affectedVehicles.length} vehicles will be affected`)

      return {
        totalVehicles: vehiclesSnapshot.docs.length,
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