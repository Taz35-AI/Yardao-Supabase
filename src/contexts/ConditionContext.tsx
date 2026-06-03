// src/contexts/ConditionContext.tsx - FIXED: Added deduplication
// ✅ FIXED: NEVER initializes conditions - only loads what exists from organization creation
'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { conditionService, ConditionCategory } from '@/lib/conditionService'
import { userProfileService } from '@/lib/firestore'
import { updateConditionLookup } from '@/lib/conditionUtils'
import { logger } from '@/lib/logger'

interface ConditionContextType {
  conditions: ConditionCategory[]
  loading: boolean
  error: string | null
  refreshConditions: () => Promise<void>
}

const ConditionContext = createContext<ConditionContextType | undefined>(undefined)

export function ConditionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [conditions, setConditions] = useState<ConditionCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)

  // ✅ FIXED: Deduplicate conditions by name
  const deduplicateConditions = useCallback((conditions: ConditionCategory[]): ConditionCategory[] => {
    const seen = new Map<string, ConditionCategory>()
    
    conditions.forEach(condition => {
      const normalizedName = condition.name.trim().toLowerCase()
      
      // Keep the first occurrence of each unique name
      if (!seen.has(normalizedName)) {
        seen.set(normalizedName, condition)
      } else {
        // If duplicate found, log it for debugging
        logger.log(`⚠️ [ConditionContext] Duplicate condition found: "${condition.name}" (ID: ${condition.id})`)
      }
    })
    
    const uniqueConditions = Array.from(seen.values())
    
    // If we found duplicates, log summary
    if (uniqueConditions.length < conditions.length) {
      logger.log(`🧹 [ConditionContext] Removed ${conditions.length - uniqueConditions.length} duplicate condition(s)`)
      logger.log('📋 [ConditionContext] Unique conditions:', uniqueConditions.map(c => `${c.name} (${c.id})`))
    }
    
    return uniqueConditions
  }, [])

  // Load user organization
  useEffect(() => {
    if (!user) {
      setConditions([])
      setOrganizationId(null)
      setLoading(false)
      return
    }

    const loadUserOrganization = async () => {
      try {
        const profile = await userProfileService.getProfile(user.uid)
        if (profile?.organizationId) {
          setOrganizationId(profile.organizationId)
        } else {
          setError('No organization found')
          setLoading(false)
        }
      } catch (err) {
        logger.error('[ConditionContext] Error loading user organization:', err)
        setError('Failed to load user organization')
        setLoading(false)
      }
    }

    loadUserOrganization()
  }, [user])

  // Load conditions when organization is available
  useEffect(() => {
    if (!organizationId) return

    loadConditions()
  }, [organizationId, deduplicateConditions])

  const loadConditions = async () => {
    if (!organizationId) return

    try {
      setLoading(true)
      setError(null)
      
      logger.log('🔍 [ConditionContext] Loading conditions for organization:', organizationId)
      const conditionsData = await conditionService.getConditions(organizationId)
      
      logger.log(`📋 [ConditionContext] Loaded ${conditionsData.length} condition(s) from database:`, conditionsData.map(c => `${c.name} (${c.color})`))
      
      // ✅ CRITICAL FIX: NEVER initialize conditions here
      // Conditions should already exist from organization creation
      if (conditionsData.length === 0) {
        logger.error('⚠️ [ConditionContext] No conditions found! Organization may not be properly initialized.')
        logger.error('⚠️ [ConditionContext] Conditions should have been created during organization setup.')
        setError('No conditions found. Please contact support.')
        setConditions([])
      } else {
        // ✅ FIXED: Deduplicate conditions before setting state
        const uniqueConditions = deduplicateConditions(conditionsData)
        
        setConditions(uniqueConditions)
        // Update the global lookup cache
        updateConditionLookup(uniqueConditions)
        
        logger.log(`✅ [ConditionContext] Loaded ${uniqueConditions.length} unique condition(s)`)
      }
      
    } catch (err) {
      logger.error('❌ [ConditionContext] Error loading conditions:', err)
      setError(err instanceof Error ? err.message : 'Failed to load conditions')
    } finally {
      setLoading(false)
    }
  }

  const refreshConditions = async () => {
    logger.log('🔄 [ConditionContext] Refreshing conditions...')
    await loadConditions()
  }

  return (
    <ConditionContext.Provider value={{
      conditions,
      loading,
      error,
      refreshConditions
    }}>
      {children}
    </ConditionContext.Provider>
  )
}

export function useConditionContext() {
  const context = useContext(ConditionContext)
  if (context === undefined) {
    throw new Error('useConditionContext must be used within a ConditionProvider')
  }
  return context
}