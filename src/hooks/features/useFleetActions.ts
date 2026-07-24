// src/hooks/features/useFleetActions.ts
// ✅ COMPLETE FILE - ALL FEATURES PRESERVED + DEFLEET SUPPORT ADDED
// ✅ Date Acquired is automatically handled via spread operators - NO CHANGES NEEDED

import { useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService, vehicleService } from '@/lib/firestore'
import { ContractSyncService } from '@/services/contractSyncService'
import { InsuranceSyncService } from '@/services/insuranceSyncService'
import { ConditionSyncService } from '@/services/conditionSyncService'
import { BulkInsuranceService } from '@/services/bulkInsuranceService'
import { enhancedVehicleService } from '@/lib/services/enhancedVehicleService' // ✅ ADDED: Import defleet service
import { supabase } from '@/lib/supabaseClient'
import { InsuranceStatus, FleetVehicle, DefleetReason } from '@/types' // ✅ ADDED: DefleetReason
import { DamageSyncService, ensurePinPhotosUploaded } from '@/services/damageSyncService'
import { logger } from '@/lib/logger'

// Import the SyncNotification type from the component file
import type { ContractSyncNotification } from '@/components/common/notifications/contractSyncNotification'
import { RegistrationUpdateService } from '@/services/RegistrationUpdateService'
import { MotTaxSyncService } from '@/services/motTaxSyncService'
import { activityLogService } from '@/lib/services/activityLogService'

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

      // Look up an existing vehicle by (cleaned) registration. The service
      // normalises the reg the same way the original loop did.
      const existing = await vehicleService.getVehicleByRegistration(
        userProfile.organizationId,
        registration
      )

      if (!existing) return false // No duplicate found

      // Skip if we're checking for update (exclude current vehicle)
      if (excludeId && existing.id === excludeId) return false

      return true // Duplicate found
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

      setDeletingVehicle(true)

      const userDisplayName = userProfile.displayName || user.email || 'Unknown User'

      // Soft-defleet via the ported service: it finds every branch instance
      // (by id + registration), preserves history, removes them, marks the
      // fleet vehicle as defleeted, and flags any service bookings.
      const result = await enhancedVehicleService.defleetVehicle(vehicleId, {
        reason: defleetReason,
        reasonDetails: defleetReasonDetails || '',
        defleetDate: defleetDate || new Date().toISOString().split('T')[0],
        userId: user.uid,
        userDisplayName,
      })

      if (!result.success) {
        throw new Error(result.errors.join(', ') || 'Failed to defleet vehicle')
      }

      const branchCount = result.removedFromBranches
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
        insuranceStatus: vehicleData.insuranceStatus || 'Not Insured',
        currentStatus: 'in_fleet',
        createdAt: new Date().toISOString()
      }
      
      await fleetData.addVehicle(processedVehicleData)

      activityLogService.log({
        organizationId: userProfile.organizationId, actorId: user.uid, actorName: userProfile.displayName || user.email || 'Unknown User',
        actionType: 'vehicle_added', registration: processedVehicleData.registration,
        summary: `Vehicle added to fleet: ${[processedVehicleData.make, processedVehicleData.model].filter(Boolean).join(' ') || processedVehicleData.registration}`,
      })

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

        activityLogService.log({
          organizationId: userProfile.organizationId, actorId: user.uid, actorName: userDisplayName,
          actionType: 'registration_changed', registration: newRegistration, entityId: vehicleId,
          summary: `Registration changed: ${oldRegistration} → ${newRegistration}`,
          details: { from: oldRegistration, to: newRegistration },
        })

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
      // MOT / road-tax expiry changes must cascade to the yard too ("fleet page
      // is the bible") so staff don't re-enter them on the Yard page.
      const motChanged = 'motExpiry' in updates && updates.motExpiry !== currentVehicle.motExpiry
      const taxChanged = 'taxExpiry' in updates && updates.taxExpiry !== currentVehicle.taxExpiry
      

      
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
      
      // Damage-pin photos must live in Storage, never as base64 in the row —
      // convert before the write so neither the fleet row nor the yard sync
      // ever persists base64.
      if (Array.isArray(processedUpdates.damagePins) && processedUpdates.damagePins.length > 0) {
        processedUpdates.damagePins = await ensurePinPhotosUploaded(
          processedUpdates.damagePins,
          userProfile.organizationId,
          currentVehicle.registration,
        )
      }

      // Update the vehicle in fleet
      await fleetData.updateVehicle(vehicleId, processedUpdates)

      // ── Activity feed: fleet-side field changes (with the actor) ──
      {
        const actor = { organizationId: userProfile.organizationId, actorId: user.uid, actorName: userDisplayName, registration: currentVehicle.registration, entityId: vehicleId }
        if (conditionChanged) activityLogService.log({ ...actor, actionType: 'condition_changed', summary: `Condition: ${currentVehicle.condition || '—'} → ${processedUpdates.condition}`, details: { from: currentVehicle.condition, to: processedUpdates.condition } })
        if (contractChanged) activityLogService.log({ ...actor, actionType: 'contract_changed', summary: processedUpdates.contract ? `Contract set to ${processedUpdates.contract}` : 'Contract removed', details: { from: currentVehicle.contract, to: processedUpdates.contract } })
        if (insuranceChanged) activityLogService.log({ ...actor, actionType: 'insurance_changed', summary: `Insurance: ${processedUpdates.insuranceStatus}`, details: { from: currentVehicle.insuranceStatus, to: processedUpdates.insuranceStatus } })
        if (motChanged) activityLogService.log({ ...actor, actionType: 'status_changed', summary: `MOT expiry set to ${processedUpdates.motExpiry || '—'}`, details: { motExpiry: processedUpdates.motExpiry } })
        if (taxChanged) activityLogService.log({ ...actor, actionType: 'status_changed', summary: `Road tax expiry set to ${processedUpdates.taxExpiry || '—'}`, details: { taxExpiry: processedUpdates.taxExpiry } })
      }

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
      
      // ── Sync MOT / road-tax expiry to yard if changed ────────────────
      if (motChanged || taxChanged) {
        try {
          const motTaxData: { motExpiry?: string | null; taxExpiry?: string | null } = {}
          if (motChanged) motTaxData.motExpiry = processedUpdates.motExpiry ?? null
          if (taxChanged) motTaxData.taxExpiry = processedUpdates.taxExpiry ?? null

          const motTaxResult = await MotTaxSyncService.syncFromFleetToYard(
            vehicleId,
            currentVehicle.registration,
            motTaxData,
            userProfile.organizationId,
            user.uid,
            userDisplayName,
          )

          if (motTaxResult.success && motTaxResult.updatedYardRecords > 0) {
            const label = motChanged && taxChanged ? 'MOT & road tax' : motChanged ? 'MOT' : 'Road tax'
            setSyncNotification({
              type: 'success',
              message: `📅 ${label} synced to ${motTaxResult.updatedYardRecords} yard record${motTaxResult.updatedYardRecords > 1 ? 's' : ''}!`,
              details: {
                fleetUpdated: false,
                yardUpdated: motTaxResult.updatedYardRecords,
                syncType: 'update'
              }
            })
          }
        } catch (syncError) {
          logger.error('MOT/tax sync to yard failed:', syncError)
          // Don't throw — fleet update already succeeded
        }
      }

// ── Sync vehicleDiagramType to yard when it CHANGED (incl. clearing to null) ──
//    Previously: `const dt = new || current; if (dt) …` — which fell back to the
//    OLD value on clear and was guarded by truthiness, so clearing the diagram
//    never reached the yard. Now we sync the new value (null included) on change.
if ('vehicleDiagramType' in updates &&
    (processedUpdates.vehicleDiagramType ?? null) !== (currentVehicle.vehicleDiagramType ?? null)) {
  const newDiagramType = processedUpdates.vehicleDiagramType ?? null
  try {
    const { data: updated, error: syncError } = await supabase
      .from('checked_in_vehicles')
      .update({ vehicle_diagram_type: newDiagramType })
      .eq('organization_id', userProfile.organizationId)
      .eq('registration', currentVehicle.registration.trim().toUpperCase())
      .select('id')
    if (syncError) throw syncError
    if (updated && updated.length > 0) {
      logger.log(`✅ vehicleDiagramType (${newDiagramType ?? 'cleared'}) synced to ${updated.length} yard record(s)`)
    }
  } catch (syncError) {
    logger.error('vehicleDiagramType yard sync failed:', syncError)
  }
}

// ── Sync core details (make / model / colour / size) to yard when changed ──
//    These are denormalised onto checked_in_vehicles, so a fleet correction
//    must follow the vehicle into the yard (fleet is the source of truth).
{
  const detailPatch: Record<string, string | null> = {}
  if ('make' in updates   && (processedUpdates.make   ?? null) !== (currentVehicle.make   ?? null)) detailPatch.make   = processedUpdates.make   ?? null
  if ('model' in updates  && (processedUpdates.model  ?? null) !== (currentVehicle.model  ?? null)) detailPatch.model  = processedUpdates.model  ?? null
  if ('colour' in updates && (processedUpdates.colour ?? null) !== (currentVehicle.colour ?? null)) detailPatch.colour = processedUpdates.colour ?? null
  if ('size' in updates   && (processedUpdates.size   ?? null) !== (currentVehicle.size   ?? null)) detailPatch.size   = processedUpdates.size   ?? null
  if (Object.keys(detailPatch).length > 0) {
    try {
      const { data: updated, error: detailErr } = await supabase
        .from('checked_in_vehicles')
        .update(detailPatch)
        .eq('organization_id', userProfile.organizationId)
        .eq('registration', currentVehicle.registration.trim().toUpperCase())
        .select('id')
      if (detailErr) throw detailErr
      if (updated && updated.length > 0) {
        logger.log(`✅ Vehicle details (${Object.keys(detailPatch).join(', ')}) synced to ${updated.length} yard record(s)`)
      }
    } catch (detailErr) {
      logger.error('Vehicle details yard sync failed:', detailErr)
    }
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