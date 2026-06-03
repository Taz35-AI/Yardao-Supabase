// src/hooks/useDeliveriesDefleet.ts
// ✅ BATTERY FIX: PROPERLY PAUSES/RESUMES LISTENERS WHEN APP GOES TO BACKGROUND
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAppState } from '@/hooks/common/useAppState'
import { 
  collection, 
  addDoc, 
  updateDoc,
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  getDocs
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { userProfileService } from '@/lib/firestore'
import type { DeliveryDefleelEntry } from '@/components/features/deliveries-defleet/DeliveriesDefleetContent'
import { logger } from '@/lib/logger'

interface UseDeliveriesDefleetReturn {
  entries: DeliveryDefleelEntry[]
  loading: boolean
  error: string | null
  createEntry: (entryData: Omit<DeliveryDefleelEntry, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'>) => Promise<boolean>
  updateEntry: (entryId: string, entryData: Omit<DeliveryDefleelEntry, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'createdByName'>) => Promise<boolean>
  deleteEntry: (entryId: string) => Promise<boolean>
  refreshEntries: () => void
}

// ⚠️ Implementation hook. Do NOT call this directly from components —
// every call mounts its own Firestore listener. Consume the shared
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

  // Ref for managing subscription
  const unsubscribeRef = useRef<(() => void) | null>(null)
  // Org the live listener is currently bound to. Lets us KEEP an active
  // listener across re-renders (app-state/visibility churn) and only
  // re-subscribe when the organization actually changes — instead of
  // tearing it down and re-reading the whole collection every time.
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

      logger.log('🔥 CREATING new deliveries/defleet listener')
      setLoading(true)
      setError(null)

      const entriesQuery = query(
        collection(db, 'deliveriesDefleet'),
        where('organizationId', '==', userProfile.organizationId),
        orderBy('date', 'desc'),
        orderBy('createdAt', 'desc')
      )

      const unsubscribe = onSnapshot(
        entriesQuery,
        (snapshot) => {
          logger.log(`📦 Deliveries/defleet snapshot: ${snapshot.docs.length} entries`)
          
          const entriesData: DeliveryDefleelEntry[] = []
          snapshot.forEach((doc) => {
            const data = doc.data()
            entriesData.push({
              id: doc.id,
              ...data,
              createdAt: data.createdAt?.toDate?.() || data.createdAt,
              updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
            } as DeliveryDefleelEntry)
          })
          
          setEntries(entriesData)
          setLoading(false)
          setError(null)
        },
        (error) => {
          logger.error('❌ Error in deliveries/defleet subscription:', error)
          setError('Failed to load entries. Please try again.')
          setLoading(false)
        }
      )

      unsubscribeRef.current = unsubscribe
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
    // caused a full collection re-read on every app-state event. Genuine
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
        ...entryData,
        organizationId: userProfile.organizationId,
        createdBy: user.uid,
        createdByName: user.displayName || user.email || 'Unknown User',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }

      logger.log('📤 Creating Firestore document with:', newEntry)

      const docRef = await addDoc(collection(db, 'deliveriesDefleet'), newEntry)
      logger.log('✅ Document created with ID:', docRef.id)
      
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
        ...entryData,
        updatedAt: serverTimestamp()
      }

      await updateDoc(doc(db, 'deliveriesDefleet', entryId), updateData)
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
      await deleteDoc(doc(db, 'deliveriesDefleet', entryId))
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
      // Force a fresh query to Firestore (bypasses cache)
      const entriesQuery = query(
        collection(db, 'deliveriesDefleet'),
        where('organizationId', '==', userProfile.organizationId),
        orderBy('date', 'desc'),
        orderBy('createdAt', 'desc')
      )

      const snapshot = await getDocs(entriesQuery)
      const entriesData: DeliveryDefleelEntry[] = []
      
      snapshot.forEach((doc) => {
        const data = doc.data()
        entriesData.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
        } as DeliveryDefleelEntry)
      })
      
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