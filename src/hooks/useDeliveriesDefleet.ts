// src/hooks/useDeliveriesDefleet.ts — SUPABASE re-implementation.
// Owns the org's delivery/defleet planning log. Despite the "defleet" name this
// is a STANDALONE log (its own table — see 0020_deliveries.sql), NOT a view of
// defleeted vehicles. Data-layer swap only: the public
// UseDeliveriesDefleetReturn API (entries, loading, error, createEntry,
// updateEntry, deleteEntry, refreshEntries) and the DeliveryDefleelEntry shape
// are kept identical.
//
// Firestore onSnapshot → initial select (ordered date desc, created_at desc)
// then refetch on any postgres_changes for the org's deliveries_defleet rows.
// CRUD: addDoc/updateDoc/deleteDoc → insert/update/delete. serverTimestamp() →
// now()/server default. The keep-the-listener-alive-across-app-state-churn
// optimization (activeOrgRef) and the dedicated unmount-only cleanup are
// preserved 1:1.
// ✅ BATTERY FIX preserved: listener still pauses/resumes with app state.
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAppState } from '@/hooks/common/useAppState'
import { supabase } from '@/lib/supabaseClient'
import { wireResyncTriggers, onReconnectRefetch } from '@/lib/realtime/resync'
import { userProfileService } from '@/lib/firestore'
import { toCamel } from '@/lib/dbMap'
import type { DeliveryDefleelEntry } from '@/components/features/deliveries-defleet/DeliveriesDefleetContent'
import { logger } from '@/lib/logger'

const DELIVERIES_DEFLEET = 'deliveries_defleet'

interface UseDeliveriesDefleetReturn {
  entries: DeliveryDefleelEntry[]
  loading: boolean
  error: string | null
  createEntry: (entryData: Omit<DeliveryDefleelEntry, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'>) => Promise<boolean>
  updateEntry: (entryId: string, entryData: Omit<DeliveryDefleelEntry, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'>) => Promise<boolean>
  deleteEntry: (entryId: string) => Promise<boolean>
  refreshEntries: () => void
}

// timestamptz columns arrive as ISO strings — revive to Date to match the
// Firestore .toDate() behaviour the original used.
const toDate = (v: any) => (v ? new Date(v) : v)

// snake_case row → DeliveryDefleelEntry. toCamel maps every top-level key (so
// new columns flow through automatically, mirroring the original `...data`
// spread), then createdAt/updatedAt are revived to Date.
function mapRow(row: any): DeliveryDefleelEntry {
  const e = toCamel<any>(row)!
  e.createdAt = toDate(e.createdAt)
  e.updatedAt = toDate(e.updatedAt)
  return e as DeliveryDefleelEntry
}

// DeliveryDefleelEntry (camelCase) → deliveries_defleet row (snake_case).
// Explicit so we never write id/createdAt and the operationType/isCompleted/
// isFleetVehicle/defleet* keys map to the right columns.
function entryToRow(
  entryData: Omit<DeliveryDefleelEntry, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'>
): Record<string, any> {
  const out: Record<string, any> = {
    date: entryData.date,
    operation_type: entryData.operationType,
    registration: entryData.registration,
    make: entryData.make,
    model: entryData.model,
  }
  if (entryData.notes !== undefined) out.notes = entryData.notes
  if (entryData.isCompleted !== undefined) out.is_completed = entryData.isCompleted
  if (entryData.completedAt !== undefined) out.completed_at = entryData.completedAt
  if (entryData.completedBy !== undefined) out.completed_by = entryData.completedBy
  if (entryData.expectedArrival !== undefined) out.expected_arrival = entryData.expectedArrival
  if (entryData.supplier !== undefined) out.supplier = entryData.supplier
  if (entryData.isFleetVehicle !== undefined) out.is_fleet_vehicle = entryData.isFleetVehicle
  if (entryData.defleetReason !== undefined) out.defleet_reason = entryData.defleetReason
  if (entryData.defleetDestination !== undefined) out.defleet_destination = entryData.defleetDestination
  return out
}

// ⚠️ Implementation hook. Do NOT call this directly from components —
// every call mounts its own realtime listener. Consume the shared
// instance via `useDeliveriesDefleet()` from
// '@/contexts/DeliveriesDefleetContext', which calls this exactly once
// inside DeliveriesDefleetProvider.
export function useDeliveriesDefleetInternal(): UseDeliveriesDefleetReturn {
  const { user } = useAuth()
  const { isAppActive } = useAppState()
  const [entries, setEntries] = useState<DeliveryDefleelEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userProfile, setUserProfile] = useState<any>(null)

  // Ref for managing subscription (the realtime channel cleanup fn)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  // Org the live listener is currently bound to. Lets us KEEP an active
  // listener across re-renders (app-state/visibility churn) and only
  // re-subscribe when the organization actually changes — instead of
  // tearing it down and re-reading the whole table every time.
  const activeOrgRef = useRef<string | null>(null)

  // Get user profile
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (user) {
        try {
          const profile = await userProfileService.getProfile(user.uid)
          setUserProfile(profile)
        } catch (error) {
          logger.error('Error fetching user profile:', error)
        }
      }
    }

    fetchUserProfile()
  }, [user])

  // Determine if we should have an active listener
  const shouldHaveActiveListener = useCallback(() => {
    if (!user || !userProfile?.organizationId) return false
    if (!isAppActive) return false // Stop when app in background
    return true
  }, [user, userProfile?.organizationId, isAppActive])

  // 🔥 CRITICAL FIX: Properly manage listener lifecycle based on app state
  useEffect(() => {
    // Helper function to cleanup listener
    const cleanupListener = () => {
      if (unsubscribeRef.current) {
        logger.log('🧹 UNSUBSCRIBING from deliveries/defleet listener')
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    }

    // Helper function to setup listener
    const setupListener = () => {
      // Don't setup if we already have one
      if (unsubscribeRef.current) {
        logger.log('⚠️ Deliveries/defleet listener already exists, skipping setup')
        return
      }

      if (!userProfile?.organizationId) {
        logger.log('⚠️ No organization ID, cannot setup deliveries/defleet listener')
        return
      }

      const orgId = userProfile.organizationId
      logger.log('🔥 CREATING new deliveries/defleet listener')
      setLoading(true)
      setError(null)

      const fetchEntries = async () => {
        try {
          const { data, error: fetchError } = await supabase
            .from(DELIVERIES_DEFLEET)
            .select('*')
            .eq('organization_id', orgId)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
          if (fetchError) throw fetchError

          logger.log(`📦 Deliveries/defleet snapshot: ${(data ?? []).length} entries`)

          const entriesData: DeliveryDefleelEntry[] = (data ?? []).map(mapRow)

          setEntries(entriesData)
          setLoading(false)
          setError(null)
        } catch (err) {
          logger.error('❌ Error in deliveries/defleet subscription:', err)
          setError('Failed to load entries. Please try again.')
          setLoading(false)
        }
      }

      // initial fetch
      fetchEntries()

      // refetch on any change to this org's deliveries_defleet rows
      const channel = supabase
        .channel(`deliveries_defleet:${orgId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: DELIVERIES_DEFLEET,
            filter: `organization_id=eq.${orgId}`,
          },
          () => {
            fetchEntries()
          }
        )
        // Leg-2 resync: refetch when realtime reconnects after a drop.
        .subscribe(onReconnectRefetch(fetchEntries))

      // Leg-2 resync: refetch on tab focus / network back online too.
      const stopResync = wireResyncTriggers(fetchEntries)
      unsubscribeRef.current = () => {
        stopResync()
        supabase.removeChannel(channel)
      }
    }

    // MAIN LOGIC: Decide whether to have a listener or not
    const shouldListen = shouldHaveActiveListener()

    logger.log('🎯 Deliveries/defleet listener decision:', {
      shouldListen,
      hasUser: !!user,
      hasProfile: !!userProfile,
      hasOrg: !!userProfile?.organizationId,
      isAppActive,
      currentListener: !!unsubscribeRef.current
    })

    const currentOrg = userProfile?.organizationId ?? null

    if (shouldListen) {
      // Already listening for this org → KEEP IT. A re-render driven by
      // app-state/visibility churn no longer tears the listener down, so
      // it costs ZERO extra reads and the live connection stays hot.
      if (unsubscribeRef.current && activeOrgRef.current === currentOrg) {
        logger.log('ℹ️ Deliveries/defleet listener already active for this org, keeping it')
      } else {
        // No listener yet, OR the organization genuinely changed → (re)subscribe.
        if (unsubscribeRef.current) {
          logger.log(`🔀 Deliveries/defleet org changed (${activeOrgRef.current} → ${currentOrg}) — re-subscribing`)
          cleanupListener()
        } else {
          logger.log('✅ CONDITIONS MET: Setting up deliveries/defleet listener')
        }
        setupListener()
        activeOrgRef.current = currentOrg
      }
    } else {
      // We should NOT have a listener - remove it if we have one
      if (unsubscribeRef.current) {
        logger.log('🛑 CONDITIONS NOT MET: Removing deliveries/defleet listener')
        logger.log('Reason:',
          !user ? 'No user' :
          !userProfile ? 'No profile' :
          !userProfile?.organizationId ? 'No org' :
          !isAppActive ? '🔴 APP IN BACKGROUND' :
          'Unknown'
        )
        cleanupListener()
        activeOrgRef.current = null
        setLoading(false)
      } else if (!user || !userProfile?.organizationId) {
        // No listener and no user/org - ensure loading is false
        setLoading(false)
      }
    }

    // NOTE: deliberately NO per-run cleanup return here. Tearing the
    // listener down on every dependency change (shouldHaveActiveListener
    // changes identity on every isAppActive toggle) is exactly what
    // caused a full table re-read on every app-state event. Genuine
    // teardown is handled above (shouldListen === false) and on true
    // unmount by the dedicated effect below.
  }, [shouldHaveActiveListener, userProfile?.organizationId])

  // True-unmount cleanup ONLY (empty deps → cleans on provider/component
  // teardown, e.g. logout). Does NOT run on app-state/visibility/org
  // dependency changes, so it cannot cause re-reads.
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        logger.log('🧹 Deliveries/defleet listener: final cleanup on unmount')
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
      activeOrgRef.current = null
    }
  }, [])

  const createEntry = async (
    entryData: Omit<DeliveryDefleelEntry, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'>
  ): Promise<boolean> => {
    logger.log('🔄 createEntry called with:', entryData)
    logger.log('👤 User:', user)
    logger.log('🏢 UserProfile:', userProfile)

    if (!user || !userProfile) {
      logger.log('❌ User not authenticated')
      setError('User not authenticated')
      return false
    }

    try {
      setError(null)

      const newEntry = {
        ...entryToRow(entryData),
        organization_id: userProfile.organizationId,
        created_by: user.uid,
        created_by_name: user.displayName || user.email || 'Unknown User',
        // created_at / updated_at default to now() server-side
      }

      logger.log('📤 Creating deliveries_defleet row with:', newEntry)

      const { data, error: insertError } = await supabase
        .from(DELIVERIES_DEFLEET)
        .insert(newEntry)
        .select('id')
        .single()
      if (insertError) throw insertError

      logger.log('✅ Document created with ID:', data.id)

      return true
    } catch (error) {
      logger.error('💥 Error creating delivery/defleet entry:', error)
      setError('Failed to create entry. Please try again.')
      return false
    }
  }

  const updateEntry = async (
    entryId: string,
    entryData: Omit<DeliveryDefleelEntry, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'>
  ): Promise<boolean> => {
    if (!user || !userProfile) {
      setError('User not authenticated')
      return false
    }

    try {
      setError(null)

      const updateData = {
        ...entryToRow(entryData),
        updated_at: new Date().toISOString()
      }

      const { error: updateError } = await supabase
        .from(DELIVERIES_DEFLEET)
        .update(updateData)
        .eq('id', entryId)
      if (updateError) throw updateError
      return true
    } catch (error) {
      logger.error('Error updating delivery/defleet entry:', error)
      setError('Failed to update entry. Please try again.')
      return false
    }
  }

  const deleteEntry = async (entryId: string): Promise<boolean> => {
    if (!user) {
      setError('User not authenticated')
      return false
    }

    try {
      setError(null)
      const { error: deleteError } = await supabase
        .from(DELIVERIES_DEFLEET)
        .delete()
        .eq('id', entryId)
      if (deleteError) throw deleteError
      return true
    } catch (error) {
      logger.error('Error deleting delivery/defleet entry:', error)
      setError('Failed to delete entry. Please try again.')
      return false
    }
  }

  const refreshEntries = async () => {
    logger.log('🔄 Manual refresh requested')

    if (!user || !userProfile?.organizationId) {
      logger.log('❌ Cannot refresh - no user or organization')
      return
    }

    // Only refresh if app is active
    if (!isAppActive) {
      logger.log('⚠️ Cannot refresh - app is in background')
      return
    }

    // Temporarily show loading state for user feedback
    setLoading(true)

    try {
      // Force a fresh query (initial-select equivalent of the live listener)
      const { data, error: fetchError } = await supabase
        .from(DELIVERIES_DEFLEET)
        .select('*')
        .eq('organization_id', userProfile.organizationId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (fetchError) throw fetchError

      const entriesData: DeliveryDefleelEntry[] = (data ?? []).map(mapRow)

      setEntries(entriesData)
      logger.log('✅ Manual refresh completed:', entriesData.length, 'entries loaded')

    } catch (error) {
      logger.error('💥 Error during manual refresh:', error)
      setError('Failed to refresh entries. Please try again.')
    } finally {
      // Stop loading after a short delay to give user feedback
      setTimeout(() => {
        setLoading(false)
      }, 500)
    }
  }

  return {
    entries,
    loading,
    error,
    createEntry,
    updateEntry,
    deleteEntry,
    refreshEntries
  }
}
