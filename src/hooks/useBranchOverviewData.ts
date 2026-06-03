// src/hooks/useBranchOverviewData.ts
// ✅ BATTERY FIX: PROPERLY PAUSES/RESUMES LISTENERS WHEN APP GOES TO BACKGROUND
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAppState } from '@/hooks/common/useAppState'
import { 
  collection, 
  query, 
  where, 
  onSnapshot,
  orderBy
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { userProfileService } from '@/lib/firestore'
import type { BranchVehicle } from '@/types/branch-overview'
import { logger } from '@/lib/logger'

export function useBranchOverviewData() {
  const { user } = useAuth()
  const { isAppActive } = useAppState()
  const [allVehicles, setAllVehicles] = useState<BranchVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)

  // Ref for managing subscription
  const unsubscribeRef = useRef<(() => void) | null>(null)

  // Load user's organization
  useEffect(() => {
    if (!user) {
      setOrganizationId(null)
      return
    }

    const loadOrganization = async () => {
      try {
        const userProfile = await userProfileService.getProfile(user.uid)
        if (userProfile?.organizationId) {
          setOrganizationId(userProfile.organizationId)
        } else {
          setError('No organization found')
        }
      } catch (err) {
        logger.error('Error loading user organization:', err)
        setError('Failed to load organization')
      }
    }

    loadOrganization()
  }, [user])

  // Determine if we should have an active listener
  const shouldHaveActiveListener = useCallback(() => {
    if (!user || !organizationId) return false
    if (!isAppActive) return false // Stop when app in background
    return true
  }, [user, organizationId, isAppActive])

  // 🔥 CRITICAL FIX: Properly manage listener lifecycle based on app state
  useEffect(() => {
    // Helper function to cleanup listener
    const cleanupListener = () => {
      if (unsubscribeRef.current) {
        logger.log('🧹 UNSUBSCRIBING from branch overview listener')
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    }

    // Helper function to setup listener
    const setupListener = () => {
      // Don't setup if we already have one
      if (unsubscribeRef.current) {
        logger.log('⚠️ Branch overview listener already exists, skipping setup')
        return
      }

      if (!organizationId) {
        logger.log('⚠️ No organization ID, cannot setup branch overview listener')
        return
      }

      logger.log('🔥 CREATING new branch overview listener')
      setLoading(true)
      setError(null)

      // Query ALL vehicles for the organization (across all branches)
      const vehiclesQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId),
        orderBy('createdAt', 'desc')
      )

      // Set up real-time listener
      const unsubscribe = onSnapshot(
        vehiclesQuery,
        (snapshot) => {
          logger.log(`📦 Branch overview snapshot: ${snapshot.docs.length} vehicles`)
          
          const vehicles: BranchVehicle[] = []
          
          snapshot.docs.forEach(doc => {
            const data = doc.data()
            vehicles.push({
              id: doc.id,
              registration: data.registration || '',
              make: data.make || '',
              model: data.model || '',
              colour: data.colour,
              size: data.size,
              status: data.status,
              condition: data.condition,
              contract: data.contract,
              contractColor: data.contractColor,
              branchId: data.branchId || 'main',
              createdAt: data.createdAt?.toDate?.() || data.createdAt,
              mileage: data.mileage,
              notes: data.notes,
              comments: data.comments,
              
              // HIRE STATUS FIELDS - Include all hire-related data
              hireStatus: data.hireStatus || 'In Yard',
              hiredBy: data.hiredBy,
              hiredByName: data.hiredByName,
              hiredAt: data.hiredAt?.toDate?.() || data.hiredAt,
              hireNotes: data.hireNotes,
              originalStatus: data.originalStatus,
              returnedFromHireAt: data.returnedFromHireAt?.toDate?.() || data.returnedFromHireAt,
              returnedFromHireBy: data.returnedFromHireBy,
              returnedFromHireByName: data.returnedFromHireByName,
              returnNotes: data.returnNotes
            })
          })
          
          // Debug logging to help identify hire status
          const hiredVehicles = vehicles.filter(v => v.hireStatus === 'Out on Hire')
          logger.log(`📊 Loaded ${vehicles.length} vehicles across all branches`)
          logger.log(`🚗 Found ${hiredVehicles.length} vehicles out on hire:`, 
            hiredVehicles.map(v => ({
              registration: v.registration,
              hireStatus: v.hireStatus,
              hiredBy: v.hiredByName,
              hiredAt: v.hiredAt
            }))
          )
          
          setAllVehicles(vehicles)
          setLoading(false)
          setError(null)
        },
        (error) => {
          logger.error('❌ Error in branch overview subscription:', error)
          setError('Failed to load vehicles')
          setLoading(false)
        }
      )

      unsubscribeRef.current = unsubscribe
    }

    // MAIN LOGIC: Decide whether to have a listener or not
    const shouldListen = shouldHaveActiveListener()
    
    logger.log('🎯 Branch overview listener decision:', {
      shouldListen,
      hasUser: !!user,
      hasOrg: !!organizationId,
      isAppActive,
      currentListener: !!unsubscribeRef.current
    })

    if (shouldListen) {
      // We should have a listener - create one if we don't
      if (!unsubscribeRef.current) {
        logger.log('✅ CONDITIONS MET: Setting up branch overview listener')
        setupListener()
      } else {
        logger.log('ℹ️ Branch overview listener already active, keeping it')
      }
    } else {
      // We should NOT have a listener - remove it if we have one
      if (unsubscribeRef.current) {
        logger.log('🛑 CONDITIONS NOT MET: Removing branch overview listener')
        logger.log('Reason:', 
          !user ? 'No user' : 
          !organizationId ? 'No org' : 
          !isAppActive ? '🔴 APP IN BACKGROUND' : 
          'Unknown'
        )
        cleanupListener()
        setLoading(false)
      } else if (!user || !organizationId) {
        // No listener and no user/org - clear data
        setAllVehicles([])
        setLoading(false)
      }
    }

    // Cleanup on unmount
    return () => {
      logger.log('🧹 Component unmounting, cleaning up branch overview')
      cleanupListener()
    }
  }, [shouldHaveActiveListener, organizationId])

  return {
    allVehicles,
    loading,
    error
  }
}

// Export types for convenience
export type { BranchVehicle, VehicleGroup, BranchData } from '@/types/branch-overview'