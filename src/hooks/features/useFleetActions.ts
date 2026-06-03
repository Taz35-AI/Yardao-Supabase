// src/hooks/features/useFleetActions.ts
// ✅ COMPLETE FILE - ALL FEATURES PRESERVED + DEFLEET SUPPORT ADDED
// ✅ Date Acquired is automatically handled via spread operators - NO CHANGES NEEDED

import { useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { ContractSyncService } from '@/services/contractSyncService'
import { InsuranceSyncService } from '@/services/insuranceSyncService'
import { ConditionSyncService } from '@/services/conditionSyncService'
import { BulkInsuranceService } from '@/services/bulkInsuranceService'
import { enhancedVehicleService } from '@/lib/services/enhancedVehicleService' // ✅ ADDED: Import defleet service
import { InsuranceStatus, FleetVehicle, DefleetReason } from '@/types' // ✅ ADDED: DefleetReason
import { DamageSyncService } from '@/services/damageSyncService'
import { 
  collection, 
  query, 
  where, 
  getDocs,
  writeBatch,
  doc,
  deleteDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logger } from '@/lib/logger'

// Import the SyncNotification type from the component file
import type { ContractSyncNotification } from '@/components/common/notifications/contractSyncNotification'
import { RegistrationUpdateService } from '@/services/RegistrationUpdateService'

interface SyncNotification {
  type: 'success' | 'warning' | 'error' | 'info'
  message: string
  details?: {
    fleetUpdated: boolean | number
    yardUpdated: number
    syncType: 'contract' | 'insurance' | 'condition' | 'bulk_insurance' | 'add' | 'update' | 'delete' | 'defleet' | 'clear' | 'bulk_import' // ✅ ADDED: 'defleet'
    processedVehicles?: string[]
    errors?: string[]
  }
}

// NEW: Duplicate modal state interface
interface DuplicateModalState {
  isOpen: boolean
  duplicates: Array<{
    registration: string
    make?: string
    model?: string
  }>
  totalCount: number
  onConfirm: () => void
  onCancel: () => void
}

interface FleetDataHook {
  vehicles?: FleetVehicle[]
  addVehicle?: (vehicleData: any) => Promise<void>
  updateVehicle?: (vehicleId: string, updates: any) => Promise<void>
  deleteVehicle?: (vehicleId: string) => Promise<void>
  clearAllVehicles?: () => Promise<void>
  bulkAddVehicles?: (vehicles: any[]) => Promise<void>
  refreshData?: () => Promise<void> // NEW: Auto refresh function
  // Local-only optimistic patch (no Firestore I/O) — mirror a committed
  // write instead of re-downloading the whole fleet.
  applyLocalVehiclePatch?: (patch: any, predicate: (v: any) => boolean) => void
  loading?: boolean
  error?: string | null
  [key: string]: any
}

export function useFleetActions(fleetData: FleetDataHook | any) {
  const { user } = useAuth()
  const [addingVehicle, setAddingVehicle] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)
  const [bulkInsuranceLoading, setBulkInsuranceLoading] = useState(false)
  const [deletingVehicle, setDeletingVehicle] = useState(false)
  
  const [syncNotification, setSyncNotification] = useState<SyncNotification | null>(null)
  
  // NEW: Duplicate modal state
  const [duplicateModal, setDuplicateModal] = useState<DuplicateModalState>({
    isOpen: false,
    duplicates: [],
    totalCount: 0,
    onConfirm: () => {},
    onCancel: () => {}
  })

  const getUserDisplayName = async (): Promise<string> => {
    if (!user) return 'Unknown User'
    try {
      const profile = await userProfileService.getProfile(user.uid)
      return profile?.displayName || user.displayName || user.email || 'Unknown User'
    } catch {
      return user.displayName || user.email || 'Unknown User'
    }
  }

  // NEW: Check if a vehicle with the same registration already exists
  const checkDuplicateRegistration = useCallback(async (registration: string, excludeId?: string): Promise<boolean> => {
    if (!user) return false
    
    try {
      const userProfile = await userProfileService.getProfile(user.uid)
      if (!userProfile?.organizationId || !registration) return false
      
      // Clean the registration for comparison
      const cleanReg = registration.trim().toUpperCase().replace(/\s+/g, '')
      
      // Query for existing vehicles with the same registration
      const vehiclesQuery = query(
        collection(db, 'vehicles'),
        where('organizationId', '==', userProfile.organizationId)
      )
      
      const snapshot = await getDocs(vehiclesQuery)
      
      // Check each vehicle's registration
      for (const doc of snapshot.docs) {
        // Skip if we're checking for update (exclude current vehicle)
        if (excludeId && doc.id === excludeId) continue
        
        const vehicleData = doc.data()
        const existingReg = (vehicleData.registration || '').toUpperCase().replace(/\s+/g, '')
        
        if (existingReg === cleanReg) {
          return true // Duplicate found
        }
      }
      
      return false // No duplicate found
    } catch (error) {
      logger.error('Error checking for duplicate registration:', error)
      return false
    }
  }, [user])

  // ✅ FIXED: Delete vehicle now properly marks as defleeted with all parameters
  const handleDeleteVehicle = async (
    vehicleId: string,
    vehicle: FleetVehicle,
    defleetReason: DefleetReason,
    defleetReasonDetails: string,
    defleetDate: string
  ) => {
    if (!user) {
      throw new Error('User not authenticated')
    }

    try {
      // Get user profile for organization ID
      const userProfile = await userProfileService.getProfile(user.uid)
      if (!userProfile?.organizationId) {
        throw new Error('User organization not found')
      }

      logger.log(`🚗 Starting defleet process for ${vehicle.registration}...`)
      logger.log(`📋 Defleet details:`, { defleetReason, defleetReasonDetails, defleetDate })

      logger.log(`🔍 Searching for ${vehicle.registration} across ALL branches...`)

      // Find all branch instances
      const branchVehiclesByIdQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', userProfile.organizationId),
        where('vehicleId', '==', vehicleId)
      )
      
      const cleanReg = vehicle.registration.toUpperCase().replace(/\s+/g, '')
      const branchVehiclesByRegQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', userProfile.organizationId)
      )
      
      const [byIdSnapshot, byRegSnapshot] = await Promise.all([
        getDocs(branchVehiclesByIdQuery),
        getDocs(branchVehiclesByRegQuery)
      ])

      // Combine results
      const branchVehicleDocs = new Map()
      const branchInfo = new Map()
      
      byIdSnapshot.forEach(docSnap => {
        const data = docSnap.data()
        branchVehicleDocs.set(docSnap.id, docSnap)
        const branchId = data.branchId || 'main'
        branchInfo.set(docSnap.id, { branchId, registration: data.registration })
      })
      
      byRegSnapshot.forEach(docSnap => {
        const data = docSnap.data()
        const docReg = (data.registration || '').toUpperCase().replace(/\s+/g, '')
        
        if (docReg === cleanReg && !branchVehicleDocs.has(docSnap.id)) {
          branchVehicleDocs.set(docSnap.id, docSnap)
          const branchId = data.branchId || 'main'
          branchInfo.set(docSnap.id, { branchId, registration: data.registration })
        }
      })

      const branchCount = branchVehicleDocs.size
      logger.log(`✅ Found ${branchCount} instance(s) across branches`)

      setDeletingVehicle(true)

      // Delete from all branches if found
      if (branchCount > 0) {
        logger.log(`🗑️ Removing ${vehicle.registration} from ${branchCount} branch location(s)...`)
        
        const batch = writeBatch(db)
        let batchCount = 0
        const deletedBranches: string[] = []
        
        branchVehicleDocs.forEach((docSnap: any, docId: string) => {
          if (batchCount >= 500) {
            throw new Error('Too many branch instances to delete in one operation')
          }
          
          const info = branchInfo.get(docId)
          if (info && !deletedBranches.includes(info.branchId)) {
            deletedBranches.push(info.branchId)
          }
          
          batch.delete(docSnap.ref)
          batchCount++
          logger.log(`Queued deletion from branch: ${info?.branchId || 'unknown'}`)
        })
        
        await batch.commit()
        logger.log(`✅ Successfully removed ${vehicle.registration} from branches: ${deletedBranches.join(', ')}`)
      }

      // ✅ CRITICAL FIX: Mark as defleeted instead of deleting
      logger.log('🏷️ Marking vehicle as defleeted in fleet inventory...')
      
      const userDisplayName = userProfile.displayName || user.email || 'Unknown User'
      
      // Build defleet update data with NO undefined values
      const defleetUpdateData: any = {
        isDefleeted: true,
        defleetDate: defleetDate || new Date().toISOString().split('T')[0],
        defleetProcessedDate: new Date().toISOString(),
        defleetReason: defleetReason,
        defleetReasonDetails: defleetReasonDetails || '',
        defleetedBy: user.uid,
        defleetedByName: userDisplayName,
        currentStatus: 'defleeted',
        updatedAt: serverTimestamp()
      }

      // ✅ Remove any undefined values to prevent Firestore errors
      Object.keys(defleetUpdateData).forEach(key => {
        if (defleetUpdateData[key] === undefined) {
          delete defleetUpdateData[key]
        }
      })

      await updateDoc(doc(db, 'vehicles', vehicleId), defleetUpdateData)
      logger.log(`✅ ${vehicle.registration} marked as defleeted in fleet inventory`)

      // Show success notification
      setSyncNotification({
        type: 'success',
        message: branchCount > 0 
          ? `✅ ${vehicle.registration} has been DEFLEETED! Removed from ${branchCount} branch location${branchCount > 1 ? 's' : ''} and marked as defleeted in fleet inventory.`
          : `✅ ${vehicle.registration} has been DEFLEETED from inventory.`,
        details: {
          fleetUpdated: true,
          yardUpdated: branchCount,
          syncType: 'defleet'
        }
      })

      setTimeout(() => setSyncNotification(null), 5000)

    } catch (error) {
      logger.error('❌ Failed to defleet vehicle:', error)
      setSyncNotification({
        type: 'error',
        message: `❌ Failed to defleet vehicle: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {
          fleetUpdated: false,
          yardUpdated: 0,
          syncType: 'defleet'
        }
      })
      setTimeout(() => setSyncNotification(null), 8000)
      throw error
    } finally {
      setDeletingVehicle(false)
    }
  }

  // ⚠️ PRESERVED: Handle clear all vehicles
  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to clear all vehicles? This action cannot be undone.')) {
      return
    }

    setClearingAll(true)
    try {
      await fleetData.clearAllVehicles()
      
      setSyncNotification({
        type: 'success',
        message: '✅ All vehicles cleared successfully!',
        details: {
          fleetUpdated: true,
          yardUpdated: 0,
          syncType: 'clear'
        }
      })
      
      setTimeout(() => setSyncNotification(null), 5000)
    } catch (error) {
      logger.error('Failed to clear vehicles:', error)
      setSyncNotification({
        type: 'error',
        message: '❌ Failed to clear vehicles',
        details: {
          fleetUpdated: false,
          yardUpdated: 0,
          syncType: 'clear'
        }
      })
      setTimeout(() => setSyncNotification(null), 8000)
      throw error
    } finally {
      setClearingAll(false)
    }
  }

  // ⚠️ PRESERVED: Handle add vehicle with duplicate check
  // ✅ Date Acquired is automatically included via spread operator
  const handleAddVehicle = async (vehicleData: any) => {
    if (!user) {
      throw new Error('User not authenticated')
    }

    setAddingVehicle(true)
    try {
      const userProfile = await userProfileService.getProfile(user.uid)
      if (!userProfile?.organizationId) {
        throw new Error('User organization not found')
      }

      // Check for duplicate registration BEFORE adding
      const isDuplicate = await checkDuplicateRegistration(vehicleData.registration)
      
      if (isDuplicate) {
        // Set error notification
        setSyncNotification({
          type: 'error',
          message: `A vehicle with registration "${vehicleData.registration}" already exists in the fleet inventory!`,
          details: {
            fleetUpdated: false,
            yardUpdated: 0,
            syncType: 'add'
          }
        })
        
        setTimeout(() => setSyncNotification(null), 8000)
        setAddingVehicle(false)
        
        // Simply return without throwing - function returns void
        return
      }

      // Normalize the registration for consistency
      // ✅ The spread operator automatically includes dateAcquired if present
      const processedVehicleData = {
        ...vehicleData, // ✅ This includes dateAcquired
        registration: vehicleData.registration.trim().toUpperCase(),
        organizationId: userProfile.organizationId,
        createdBy: user.uid,
        contract: vehicleData.contract?.trim() || null,
        contractColor: null,
        insuranceStatus: vehicleData.insuranceStatus || null,
        currentStatus: 'in_fleet',
        createdAt: new Date().toISOString()
      }
      
      await fleetData.addVehicle(processedVehicleData)
      
      // Show success notification
      setSyncNotification({
        type: 'success',
        message: `✅ Vehicle ${processedVehicleData.registration} added successfully!`,
        details: {
          fleetUpdated: true,
          yardUpdated: 0,
          syncType: 'add'
        }
      })
      
      setTimeout(() => setSyncNotification(null), 5000)
      
    } catch (error) {
      logger.error('Failed to add vehicle:', error)
      
      // Show error notification for real errors
      setSyncNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to add vehicle',
        details: {
          fleetUpdated: false,
          yardUpdated: 0,
          syncType: 'add'
        }
      })
      
      setTimeout(() => setSyncNotification(null), 8000)
      throw error // Only throw for real errors
    } finally {
      setAddingVehicle(false)
    }
  }

  // ⚠️ PRESERVED: Handle update vehicle with condition sync
  // ✅ Date Acquired is automatically included via spread operator
  const handleUpdateVehicle = async (vehicleId: string, updates: any) => {
    if (!user) {
      throw new Error('User not authenticated')
    }

    try {
      const userProfile = await userProfileService.getProfile(user.uid)
      if (!userProfile?.organizationId) {
        throw new Error('User organization not found')
      }

      const userDisplayName = await getUserDisplayName()
      const currentVehicle = fleetData.vehicles?.find((vehicle: FleetVehicle) => vehicle.id === vehicleId)
      if (!currentVehicle) {
        throw new Error('Vehicle not found')
      }

      // Check if registration is being changed
      const registrationChanged = updates.registration && 
        updates.registration.trim().toUpperCase() !== currentVehicle.registration.trim().toUpperCase()
      
      // If registration is changing, validate and cascade the update
      if (registrationChanged) {
        const oldRegistration = currentVehicle.registration
        const newRegistration = updates.registration.trim().toUpperCase()
        
        logger.log(`📝 REGISTRATION CHANGE DETECTED: ${oldRegistration} → ${newRegistration}`)
        
        // Validate new registration doesn't already exist
        const validation = await RegistrationUpdateService.validateNewRegistration(
          newRegistration,
          userProfile.organizationId,
          vehicleId
        )
        
        if (!validation.valid) {
          throw new Error(validation.error || `Registration ${newRegistration} already exists`)
        }
        
        // Show loading notification for cascade update
        setSyncNotification({
          type: 'info',
          message: `🔄 Updating registration across all systems...`,
          details: {
            fleetUpdated: false,
            yardUpdated: 0,
            syncType: 'update'
          }
        })
        
        // Perform cascade update FIRST
        const cascadeResult = await RegistrationUpdateService.cascadeRegistrationUpdate(
          vehicleId,
          oldRegistration,
          newRegistration,
          userProfile.organizationId,
          user.uid,
          userDisplayName
        )
        
        if (!cascadeResult.success) {
          throw new Error(`Failed to update registration across system: ${cascadeResult.errors.join(', ')}`)
        }
        
        // Update the registration in the updates object
        updates.registration = newRegistration
        
        // Show cascade success notification
        setSyncNotification({
          type: 'success',
          message: `✅ Registration updated everywhere! Changed from ${oldRegistration} to ${newRegistration}`,
          details: {
            fleetUpdated: 1, // Fleet was updated by the main update call
            yardUpdated: cascadeResult.collections.checkedInVehicles,
            syncType: 'update',
            processedVehicles: [`Updated in ${cascadeResult.collections.total} places`]
          }
        })
        
        logger.log(`✅ CASCADE UPDATE COMPLETE:`)
        logger.log(`  - Fleet: 1 (already updated)`)
        logger.log(`  - Checked In: ${cascadeResult.collections.checkedInVehicles}`)
        logger.log(`  - Service Bookings: ${cascadeResult.collections.serviceBookings}`)
        logger.log(`  - External Services: ${cascadeResult.collections.externalServices}`)
        logger.log(`  - TOTAL: ${cascadeResult.collections.total + 1} documents updated`)
      }

      // Check for other changes (contract, insurance, condition)
      const contractChanged = 'contract' in updates && updates.contract !== currentVehicle.contract
      const insuranceChanged = 'insuranceStatus' in updates && updates.insuranceStatus !== currentVehicle.insuranceStatus
      const conditionChanged = 'condition' in updates && updates.condition !== currentVehicle.condition
      

      
      // ✅ The spread operator automatically includes dateAcquired if present
      const processedUpdates = { ...updates }
      
      if ('contract' in updates) {
        const trimmedContract = updates.contract?.trim() || null
        processedUpdates.contract = trimmedContract
        if (!trimmedContract) {
          // Contract removed → clear its colour + id too.
          processedUpdates.contractColor = null
          processedUpdates.contractId = null
        }
        // else: keep the contractColor + contractId the edit form already
        // resolved for the newly-selected contract. (The previous code forced
        // contractColor = null here, which dropped the new contract's colour
        // and — with a stale contractId — made the badge keep the OLD colour.)
      }
      
      // Update the vehicle in fleet
      await fleetData.updateVehicle(vehicleId, processedUpdates)

      // CONDITION SYNC
      if (conditionChanged) {
        logger.log('🔄 AUTO-SYNCING CONDITION FROM FLEET TO YARD...', processedUpdates.condition)
        
        try {
          const conditionSyncResult = await ConditionSyncService.syncConditionFromFleetToYard(
            vehicleId,
            { condition: processedUpdates.condition },
            userProfile.organizationId,
            user.uid,
            userDisplayName,
            true // isVehicleId flag
          )

          if (conditionSyncResult?.success && conditionSyncResult.updatedYardRecords > 0) {
            logger.log('✅ CONDITION SYNCED TO YARD VEHICLES')
            setSyncNotification({
              type: 'success',
              message: `✅ Condition "${processedUpdates.condition}" synced to ${conditionSyncResult.updatedYardRecords} yard location${conditionSyncResult.updatedYardRecords > 1 ? 's' : ''}!`,
              details: {
                fleetUpdated: true,
                yardUpdated: conditionSyncResult.updatedYardRecords,
                syncType: 'condition'
              }
            })
          } else if (conditionSyncResult?.success && conditionSyncResult.updatedYardRecords === 0) {
            logger.log('✅ Fleet condition updated (vehicle not in any yard)')
            setSyncNotification({
              type: 'success',
              message: `✅ Condition updated to "${processedUpdates.condition}" in fleet inventory.`,
              details: {
                fleetUpdated: true,
                yardUpdated: 0,
                syncType: 'condition'
              }
            })
          }
        } catch (syncError) {
          logger.error('Condition sync to yard failed:', syncError)
          // Don't throw - fleet update succeeded even if sync failed
        }
      }

      // Sync contract to yard if changed
      if (contractChanged) {
        try {
          const contractSyncResult = await ContractSyncService.syncContractFromFleetToYard(
            vehicleId,
            { 
              contract: processedUpdates.contract, 
              contractColor: processedUpdates.contractColor 
            },
            userProfile.organizationId,
            user.uid,
            userDisplayName,
            true // isVehicleId flag
          )

          if (contractSyncResult.success && contractSyncResult.updatedYardRecords > 0) {
            if (!conditionChanged) { // Only show if condition wasn't also updated
              setSyncNotification({
                type: 'success',
                message: `🎉 Contract updated and synced to ${contractSyncResult.updatedYardRecords} yard record${contractSyncResult.updatedYardRecords !== 1 ? 's' : ''}!`,
                details: {
                  fleetUpdated: false,
                  yardUpdated: contractSyncResult.updatedYardRecords,
                  syncType: 'contract'
                }
              })
            }
          }
        } catch (syncError) {
          logger.error('Contract sync error:', syncError)
        }
      }

      // Sync insurance to yard if changed
      if (insuranceChanged) {
        try {
          const insuranceSyncResult = await InsuranceSyncService.syncInsuranceFromFleetToYard(
            vehicleId,
            { insuranceStatus: processedUpdates.insuranceStatus },
            userProfile.organizationId,
            user.uid,
            userDisplayName,
            true // isVehicleId flag
          )

          if (insuranceSyncResult.success && insuranceSyncResult.updatedYardRecords > 0) {
            if (!conditionChanged && !contractChanged) { // Only show if other syncs didn't happen
              setSyncNotification({
                type: 'success',
                message: `🛡️ Insurance updated and synced to ${insuranceSyncResult.updatedYardRecords} yard record${insuranceSyncResult.updatedYardRecords !== 1 ? 's' : ''}!`,
                details: {
                  fleetUpdated: false,
                  yardUpdated: insuranceSyncResult.updatedYardRecords,
                  syncType: 'insurance'
                }
              })
            }
          }
        } catch (syncError) {
          logger.error('Insurance sync error:', syncError)
        }
      }

      // ── Sync damage pins to yard if changed ──────────────────────────
      const damageChanged = 'damagePins' in updates
      if (damageChanged) {
        try {
          await DamageSyncService.syncDamageFromFleetToYard(
            vehicleId,
            processedUpdates.damagePins || [],
            userProfile.organizationId,
            user.uid,
            userDisplayName,
            true // isVehicleId flag
          )
          logger.log('✅ Damage pins synced to yard')
        } catch (syncError) {
          logger.error('Damage sync to yard failed:', syncError)
          // Don't throw — fleet update already succeeded
        }
      }
      
// ── Sync vehicleDiagramType to yard (always, if set) ─────────────
const diagramType = processedUpdates.vehicleDiagramType || currentVehicle.vehicleDiagramType
if (diagramType) {
  try {
    const yardSnap = await getDocs(query(
      collection(db, 'checkedInVehicles'),
      where('organizationId', '==', userProfile.organizationId),
      where('registration', '==', currentVehicle.registration.trim().toUpperCase())
    ))
    if (!yardSnap.empty) {
      const batch = writeBatch(db)
      yardSnap.forEach(d => batch.update(d.ref, { vehicleDiagramType: diagramType }))
      await batch.commit()
      logger.log(`✅ vehicleDiagramType synced to ${yardSnap.size} yard record(s)`)
    }
  } catch (syncError) {
    logger.error('vehicleDiagramType yard sync failed:', syncError)
  }
}

      // Show generic success if no specific sync happened and not registration change
      if (!contractChanged && !insuranceChanged && !conditionChanged && !registrationChanged) {
        setSyncNotification({
          type: 'success',
          message: '✅ Vehicle updated successfully!',
          details: {
            fleetUpdated: true,
            yardUpdated: 0,
            syncType: 'update'
          }
        })
      }

      setTimeout(() => setSyncNotification(null), 10000)

    } catch (error) {
      logger.error('Failed to update vehicle:', error)
      
      setSyncNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to update vehicle',
        details: {
          fleetUpdated: false,
          yardUpdated: 0,
          syncType: 'update'
        }
      })
      
      setTimeout(() => setSyncNotification(null), 8000)
      throw error
    }
  }

  // ⚠️ PRESERVED: Handle bulk insurance update with auto-refresh - FIXED: No window.confirm
  const handleBulkInsurance = async (
    insuranceStatus: InsuranceStatus = 'Insured',
    vehicleIds?: string[]
  ) => {
    if (!user) {
      throw new Error('User not authenticated')
    }

    setBulkInsuranceLoading(true)

    try {
      const userProfile = await userProfileService.getProfile(user.uid)
      if (!userProfile?.organizationId) {
        throw new Error('User organization not found')
      }

      const userDisplayName = await getUserDisplayName()

      const result = await BulkInsuranceService.bulkUpdateInsurance({
        organizationId: userProfile.organizationId,
        userId: user.uid,
        userDisplayName,
        insuranceStatus,
        vehicleIds,
        syncToYard: true
      })

      if (result.success) {
        // Mirror the write locally instead of re-downloading the whole fleet.
        // bulkUpdateInsurance returns the REGISTRATIONS it set (not ids).
        const updatedRegs = new Set(result.processedVehicles)
        fleetData.applyLocalVehiclePatch?.(
          { insuranceStatus },
          (v: any) => updatedRegs.has(v.registration),
        )

        setSyncNotification({
          type: 'success',
          message: `🎉 Bulk insurance update completed! ${result.fleetUpdated} vehicles updated.`,
          details: {
            fleetUpdated: result.fleetUpdated,
            yardUpdated: result.yardSynced,
            syncType: 'bulk_insurance',
            processedVehicles: result.processedVehicles,
            errors: result.errors
          }
        })

        setTimeout(() => setSyncNotification(null), 10000)
      } else {
        throw new Error(`Bulk insurance update failed: ${result.errors.join(', ')}`)
      }

    } catch (error) {
      logger.error('Bulk insurance update failed:', error)
      setSyncNotification({
        type: 'error',
        message: `❌ Bulk insurance update failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {
          fleetUpdated: false,
          yardUpdated: 0,
          syncType: 'bulk_insurance'
        }
      })
      
      setTimeout(() => setSyncNotification(null), 8000)
      throw error
    } finally {
      setBulkInsuranceLoading(false)
    }
  }

  // ⚠️ PRESERVED: Handle bulk import with duplicate checking using professional modal
  // ✅ Date Acquired is automatically included via spread operator
  const handleBulkImport = async (vehicles: any[]) => {
    try {
      const errors: string[] = []
      const warnings: string[] = []
      const vehiclesToAdd: any[] = []
      const vehiclesToUpdate: any[] = []
      
      // Check each vehicle for duplicates
      for (const vehicle of vehicles) {
        const cleanReg = vehicle.registration.trim().toUpperCase().replace(/\s+/g, '')
        
        // Find if vehicle already exists
        const existingVehicle = fleetData.vehicles?.find((v: FleetVehicle) => {
          const existingReg = (v.registration || '').toUpperCase().replace(/\s+/g, '')
          return existingReg === cleanReg
        })
        
        if (existingVehicle) {
          warnings.push(`Vehicle ${vehicle.registration} already exists and will be updated`)
          vehiclesToUpdate.push({
            id: existingVehicle.id,
            data: {
              ...vehicle, // ✅ This includes dateAcquired
              registration: vehicle.registration.trim().toUpperCase(),
              contract: vehicle.contract?.trim() || null,
              contractColor: null,
              insuranceStatus: vehicle.insuranceStatus || null
            },
            existingVehicle // Keep reference for modal display
          })
        } else {
          vehiclesToAdd.push({
            ...vehicle, // ✅ This includes dateAcquired
            registration: vehicle.registration.trim().toUpperCase(),
            contract: vehicle.contract?.trim() || null,
            contractColor: null,
            insuranceStatus: vehicle.insuranceStatus || null
          })
        }
      }
      
      // Show modal if any duplicates found
      if (warnings.length > 0) {
        return new Promise<void>((resolve, reject) => {
          setDuplicateModal({
            isOpen: true,
            duplicates: vehiclesToUpdate.map(v => ({
              registration: v.data.registration,
              make: v.existingVehicle.make,
              model: v.existingVehicle.model
            })),
            totalCount: warnings.length,
            onConfirm: async () => {
              setDuplicateModal(prev => ({ ...prev, isOpen: false }))
              try {
                // Process updates for existing vehicles
                for (const update of vehiclesToUpdate) {
                  await fleetData.updateVehicle(update.id, update.data)
                }
                
                // Add new vehicles
                if (vehiclesToAdd.length > 0) {
                  await fleetData.bulkAddVehicles(vehiclesToAdd)
                }
                
                setSyncNotification({
                  type: 'success',
                  message: `✅ Import completed! Added ${vehiclesToAdd.length} new vehicle${vehiclesToAdd.length !== 1 ? 's' : ''}, updated ${vehiclesToUpdate.length} existing vehicle${vehiclesToUpdate.length !== 1 ? 's' : ''}.`,
                  details: {
                    fleetUpdated: true,
                    yardUpdated: 0,
                    syncType: 'bulk_import'
                  }
                })
                
                setTimeout(() => setSyncNotification(null), 10000)
                resolve()
              } catch (error) {
                logger.error('Import failed:', error)
                setSyncNotification({
                  type: 'error',
                  message: `❌ Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  details: {
                    fleetUpdated: false,
                    yardUpdated: 0,
                    syncType: 'bulk_import'
                  }
                })
                setTimeout(() => setSyncNotification(null), 8000)
                reject(error)
              }
            },
            onCancel: () => {
              setDuplicateModal(prev => ({ ...prev, isOpen: false }))
              reject(new Error('Import cancelled by user'))
            }
          })
        })
      }
      
      // No duplicates, proceed directly
      // Process updates for existing vehicles
      for (const update of vehiclesToUpdate) {
        await fleetData.updateVehicle(update.id, update.data)
      }
      
      // Add new vehicles
      if (vehiclesToAdd.length > 0) {
        await fleetData.bulkAddVehicles(vehiclesToAdd)
      }
      
      setSyncNotification({
        type: 'success',
        message: `✅ Import completed! Added ${vehiclesToAdd.length} vehicle${vehiclesToAdd.length !== 1 ? 's' : ''}.`,
        details: {
          fleetUpdated: true,
          yardUpdated: 0,
          syncType: 'bulk_import'
        }
      })
      
      setTimeout(() => setSyncNotification(null), 10000)
      
    } catch (error) {
      if (error instanceof Error && error.message === 'Import cancelled by user') {
        // User cancelled, just return without showing error
        return
      }
      
      logger.error('Failed to import vehicles:', error)
      setSyncNotification({
        type: 'error',
        message: `❌ Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {
          fleetUpdated: false,
          yardUpdated: 0,
          syncType: 'bulk_import'
        }
      })
      setTimeout(() => setSyncNotification(null), 8000)
      throw error
    }
  }

  return {
    // State
    addingVehicle,
    clearingAll,
    bulkInsuranceLoading,
    deletingVehicle,
    syncNotification,
    setSyncNotification,
    duplicateModal, // NEW: Export duplicate modal state

    // Actions
    handleAddVehicle,
    handleUpdateVehicle,
    handleDeleteVehicle, // ✅ NOW REQUIRES DEFLEET PARAMETERS
    handleClearAll,
    handleBulkImport,
    handleBulkInsurance
  }
}

export default useFleetActions