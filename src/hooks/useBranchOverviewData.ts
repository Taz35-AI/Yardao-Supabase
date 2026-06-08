// src/hooks/useBranchOverviewData.ts — SUPABASE re-implementation.
// Loads ALL of the org's checked-in vehicles (across every branch) for the
// branch-overview screen. Data-layer swap only: the public return
// ({ allVehicles, loading, error }) and the mapped BranchVehicle shape are kept
// identical. Firestore onSnapshot → initial select (ordered created_at desc)
// then refetch on any postgres_changes for the org's checked_in_vehicles.
// ✅ BATTERY FIX preserved: listener still pauses/resumes with app state.
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAppState } from '@/hooks/common/useAppState'
import { supabase } from '@/lib/supabaseClient'
import { wireResyncTriggers, onReconnectRefetch } from '@/lib/realtime/resync'
import { userProfileService } from '@/lib/firestore'
import type { BranchVehicle } from '@/types/branch-overview'
import { logger } from '@/lib/logger'

const CHECKED_IN_VEHICLES = 'checked_in_vehicles'

// timestamptz/date columns arrive as ISO strings — revive to Date to match the
// Firestore .toDate() behaviour the consumers expect.
const toDate = (v: any) => (v ? new Date(v) : v)

// snake_case row → the exact BranchVehicle shape the original built.
function mapRow(data: any): BranchVehicle {
  return {
    id: data.id,
    registration: data.registration || '',
    make: data.make || '',
    model: data.model || '',
    colour: data.colour,
    size: data.size,
    status: data.status,
    condition: data.condition,
    contract: data.contract,
    contractColor: data.contract_color,
    branchId: data.branch_id || 'main',
    createdAt: toDate(data.created_at),
    mileage: data.mileage,
    notes: data.notes,
    comments: data.comments,

    // HIRE STATUS FIELDS - Include all hire-related data
    hireStatus: data.hire_status || 'In Yard',
    hiredBy: data.hired_by,
    hiredByName: data.hired_by_name,
    hiredAt: toDate(data.hired_at),
    hireNotes: data.hire_notes,
    originalStatus: data.original_status,
    // returnedFromHire* / returnNotes were ad-hoc Firestore-only fields on the
    // vehicle doc. The Supabase hire model clears all hire fields on return and
    // keeps the return ledger in hire_history (0012), so these columns don't
    // exist on checked_in_vehicles — the optional BranchVehicle fields stay
    // undefined here, exactly as for any Firestore vehicle that never set them.
    returnedFromHireAt: toDate(data.returned_from_hire_at),
    returnedFromHireBy: data.returned_from_hire_by,
    returnedFromHireByName: data.returned_from_hire_by_name,
    returnNotes: data.return_notes,
  } as BranchVehicle
}

export function useBranchOverviewData() {
  const { user } = useAuth()
  const { isAppActive } = useAppState()
  const [allVehicles, setAllVehicles] = useState<BranchVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)

  // Ref for managing subscription (the realtime channel cleanup fn)
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
      const fetchVehicles = async () => {
        try {
          const { data, error: fetchError } = await supabase
            .from(CHECKED_IN_VEHICLES)
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false })
          if (fetchError) throw fetchError

          logger.log(`📦 Branch overview snapshot: ${(data ?? []).length} vehicles`)

          const vehicles: BranchVehicle[] = (data ?? []).map(mapRow)

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
        } catch (err) {
          logger.error('❌ Error in branch overview subscription:', err)
          setError('Failed to load vehicles')
          setLoading(false)
        }
      }

      // initial fetch
      fetchVehicles()

      // refetch on any change to this org's checked_in_vehicles
      const channel = supabase
        .channel(`branch_overview:${organizationId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: CHECKED_IN_VEHICLES,
            filter: `organization_id=eq.${organizationId}`,
          },
          () => {
            fetchVehicles()
          }
        )
        // Leg-2 resync: refetch when realtime reconnects after a drop.
        .subscribe(onReconnectRefetch(fetchVehicles))

      // Leg-2 resync: refetch on tab focus / network back online too.
      const stopResync = wireResyncTriggers(fetchVehicles)
      unsubscribeRef.current = () => {
        stopResync()
        supabase.removeChannel(channel)
      }
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
