// src/hooks/useConditionManagement.ts - Updated with Color Lookup Cache
// ✅ FIXED: NEVER initializes conditions - only loads what exists from organization creation
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { conditionService, ConditionCategory } from '@/lib/conditionService'
import { userProfileService } from '@/lib/firestore'
import { updateConditionLookup } from '@/lib/conditionUtils'
import { logger } from '@/lib/logger'

export function useConditionManagement() {
  const { user } = useAuth()
  const [conditions, setConditions] = useState<ConditionCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setConditions([])
      setLoading(false)
      return
    }

    const loadUserOrganization = async () => {
      try {
        const profile = await userProfileService.getProfile(user.uid)
        if (profile?.organizationId) {
          setOrganizationId(profile.organizationId)
        }
      } catch (err) {
        setError('Failed to load user organization')
      }
    }

    loadUserOrganization()
  }, [user])

  // HELPER: Check if conditions are old format
  const hasOldConditions = (conditions: ConditionCategory[]): boolean => {
    const oldConditionNames = [
      'perfect bodywork',
      'good bodywork', 
      'decent bodywork',
      'needs bodywork',
      'major bodywork needed',
      'major bodywork required',
      'needs repair',
      'non-starter'
    ]
    
    return conditions.some(condition => 
      oldConditionNames.includes(condition.name.toLowerCase())
    )
  }

  // HELPER: Reset old conditions
  const resetOldConditions = async (existingConditions: ConditionCategory[]) => {
    logger.log('🔄 Found old condition format, resetting to new format...')
    logger.log('Old conditions:', existingConditions.map(c => c.name))
    
    try {
      // Delete all old conditions
      logger.log('🗑️ Deleting old conditions...')
      for (const condition of existingConditions) {
        await conditionService.deleteCondition(condition.id)
        logger.log(`Deleted: ${condition.name}`)
      }
      
      // Create new conditions
      logger.log('✨ Creating new conditions...')
      const newConditions = await conditionService.initializeDefaultConditions(organizationId!)
      logger.log('New conditions created:', newConditions.map(c => c.name))
      
      return newConditions
    } catch (err) {
      logger.error('❌ Error during condition reset:', err)
      throw err
    }
  }

  // ✅ HELPER: Deduplicate conditions by name (case-insensitive)
  const deduplicateConditions = useCallback((conditions: ConditionCategory[]): ConditionCategory[] => {
    const seen = new Map<string, ConditionCategory>()
    
    conditions.forEach(condition => {
      const normalizedName = condition.name.trim().toLowerCase()
      
      // Keep the first occurrence of each unique name
      if (!seen.has(normalizedName)) {
        seen.set(normalizedName, condition)
      } else {
        // If duplicate found, log it for debugging
        logger.log(`⚠️ [useConditionManagement] Duplicate condition found: "${condition.name}" (ID: ${condition.id})`)
      }
    })
    
    const uniqueConditions = Array.from(seen.values())
    
    // If we found duplicates, log summary
    if (uniqueConditions.length < conditions.length) {
      logger.log(`🧹 [useConditionManagement] Removed ${conditions.length - uniqueConditions.length} duplicate condition(s)`)
      logger.log('📋 [useConditionManagement] Unique conditions:', uniqueConditions.map(c => `${c.name} (${c.id})`))
    }
    
    return uniqueConditions
  }, [])

  // Update conditions and refresh lookup cache
  const updateConditionsState = (newConditions: ConditionCategory[]) => {
    setConditions(newConditions)
    // Update the lookup cache whenever conditions change
    updateConditionLookup(newConditions)
  }

  useEffect(() => {
    if (!organizationId) return

    const loadConditions = async () => {
      try {
        setLoading(true)
        logger.log('📋 [useConditionManagement] Loading conditions for organization:', organizationId)
        
        const conditionsData = await conditionService.getConditions(organizationId)
        logger.log(`📊 [useConditionManagement] Found ${conditionsData.length} conditions:`, conditionsData.map(c => `${c.name} (${c.color})`))
        
        // ✅ CRITICAL FIX: Handle three cases - never initialize here
        if (conditionsData.length === 0) {
          // ❌ This should NEVER happen if org was created properly
          // Conditions should have been created atomically during organization creation
          logger.error('⚠️ [useConditionManagement] No conditions found! Organization was not properly initialized.')
          logger.error('⚠️ [useConditionManagement] Conditions should be created during organization creation.')
          setError('No conditions found for organization. Please contact support.')
          setConditions([])
        } else if (hasOldConditions(conditionsData)) {
          // Old conditions found - reset them (migration case)
          logger.log('🔄 [useConditionManagement] Old conditions detected, performing reset...')
          const newConditions = await resetOldConditions(conditionsData)
          updateConditionsState(newConditions)
          logger.log('✅ [useConditionManagement] Conditions successfully reset')
        } else {
          // Modern conditions - use as is (normal case)
          logger.log('✅ [useConditionManagement] Modern conditions found, using existing')
          
          // ✅ Deduplicate any duplicates that might exist
          const uniqueConditions = deduplicateConditions(conditionsData)
          updateConditionsState(uniqueConditions)
        }
      } catch (err) {
        logger.error('❌ [useConditionManagement] Error loading conditions:', err)
        setError(err instanceof Error ? err.message : 'Failed to load conditions')
      } finally {
        setLoading(false)
      }
    }

    loadConditions()
  }, [organizationId, deduplicateConditions])

  const addCondition = async (
    name: string, 
    color: string = '#6b7280', 
    severity: ConditionCategory['severity'] = 'good'
  ): Promise<ConditionCategory | null> => {
    if (!organizationId) return null

    try {
      logger.log(`🆕 [useConditionManagement] Adding new condition: "${name}" with color: ${color}`)
      const newCondition = await conditionService.addCondition({
        name,
        order: conditions.length,
        organizationId,
        color,
        severity,
        isDefault: false,
        isEditable: true
      })
      
      const updatedConditions = [...conditions, newCondition]
      updateConditionsState(updatedConditions)
      logger.log(`✅ [useConditionManagement] Successfully added condition: "${name}" with color: ${color}`)
      return newCondition
    } catch (err) {
      logger.error('❌ [useConditionManagement] Error adding condition:', err)
      throw new Error(err instanceof Error ? err.message : 'Failed to add condition')
    }
  }

  const updateCondition = async (
    conditionId: string, 
    updates: Partial<Pick<ConditionCategory, 'name' | 'color' | 'severity'>>
  ): Promise<void> => {
    try {
      logger.log(`🔄 [useConditionManagement] Updating condition ${conditionId}:`, updates)
      await conditionService.updateCondition(conditionId, updates)
      
      const updatedConditions = conditions.map(c => 
        c.id === conditionId ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
      )
      updateConditionsState(updatedConditions)
      logger.log(`✅ [useConditionManagement] Successfully updated condition ${conditionId}`)
    } catch (err) {
      logger.error('❌ [useConditionManagement] Error updating condition:', err)
      throw new Error(err instanceof Error ? err.message : 'Failed to update condition')
    }
  }

  const deleteCondition = async (conditionId: string): Promise<void> => {
    const condition = conditions.find(c => c.id === conditionId)
    if (!condition) throw new Error('Condition not found')
    
    // Prevent deletion if it's the only condition
    if (conditions.length === 1) {
      throw new Error('Cannot delete the last remaining condition')
    }

    try {
      logger.log(`🗑️ [useConditionManagement] Deleting condition: "${condition.name}"`)
      await conditionService.deleteCondition(conditionId)
      
      const updatedConditions = conditions.filter(c => c.id !== conditionId)
      updateConditionsState(updatedConditions)
      logger.log(`✅ [useConditionManagement] Successfully deleted condition: "${condition.name}"`)
    } catch (err) {
      logger.error('❌ [useConditionManagement] Error deleting condition:', err)
      throw new Error(err instanceof Error ? err.message : 'Failed to delete condition')
    }
  }

  const reorderConditions = async (newOrder: ConditionCategory[]): Promise<void> => {
    try {
      logger.log(`🔀 [useConditionManagement] Reordering conditions`)
      const updates = newOrder.map((condition, index) => ({
        id: condition.id,
        order: index
      }))
      
      await conditionService.reorderConditions(updates)
      
      const reorderedConditions = newOrder.map((condition, index) => ({ ...condition, order: index }))
      updateConditionsState(reorderedConditions)
      logger.log(`✅ [useConditionManagement] Conditions reordered successfully`)
    } catch (err) {
      logger.error('❌ [useConditionManagement] Error reordering conditions:', err)
      throw new Error(err instanceof Error ? err.message : 'Failed to reorder conditions')
    }
  }

  // Manual reset function for admin/testing use
  const forceResetConditions = async (): Promise<void> => {
    if (!organizationId) throw new Error('No organization ID')
    
    try {
      setLoading(true)
      logger.log('🔄 [useConditionManagement] Manual reset triggered...')
      
      // Delete all existing conditions
      for (const condition of conditions) {
        await conditionService.deleteCondition(condition.id)
      }
      
      // Create new default conditions
      const newConditions = await conditionService.initializeDefaultConditions(organizationId)
      updateConditionsState(newConditions)
      
      logger.log('✅ [useConditionManagement] Manual reset completed')
    } catch (err) {
      logger.error('❌ [useConditionManagement] Manual reset failed:', err)
      throw new Error(err instanceof Error ? err.message : 'Failed to reset conditions')
    } finally {
      setLoading(false)
    }
  }

  return {
    conditions,
    loading,
    error,
    organizationId,
    addCondition,
    updateCondition,
    deleteCondition,
    reorderConditions,
    forceResetConditions
  }
}