// src/hooks/useIncomingTransfers.ts
// Optimized hook to load ONLY vehicles being transferred TO the current branch
// This is 90% cheaper than loading all vehicles across all branches!

'use client'

import { useState, useEffect, useRef } from 'react'
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
import type { CheckedInVehicle } from '@/types'
import { logger } from '@/lib/logger'

interface UseIncomingTransfersProps {
  branchId: string
}

export function useIncomingTransfers({ branchId }: UseIncomingTransfersProps) {
  const { user } = useAuth()
  const { isAppActive } = useAppState()
  const [incomingVehicles, setIncomingVehicles] = useState<CheckedInVehicle[]>([])
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

  // Manage listener lifecycle
  useEffect(() => {
    // Cleanup function
    const cleanupListener = () => {
      if (unsubscribeRef.current) {
        logger.log('🧹 UNSUBSCRIBING from incoming transfers listener')
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    }

    // Setup function
    const setupListener = () => {
      if (unsubscribeRef.current) {
        logger.log('⚠️ Incoming transfers listener already exists, skipping setup')
        return
      }

      if (!organizationId) {
        logger.log('⚠️ No organization ID, cannot setup incoming transfers listener')
        return
      }

      logger.log(`🔥 CREATING incoming transfers listener for branch: ${branchId}`)
      setLoading(true)
      setError(null)

      // 🎯 OPTIMIZED QUERY: Only load vehicles where targetBranchId === current branch
      // This means we only load 1-10 vehicles instead of 500+!
      const incomingQuery = query(
        collection(db, 'checkedInVehicles'),
        where('organizationId', '==', organizationId),
        where('transferStatus', '==', 'in_transit'),
        where('targetBranchId', '==', branchId), // 🚀 This is the key optimization!
        orderBy('transferInitiatedAt', 'desc')
      )

      const unsubscribe = onSnapshot(
        incomingQuery,
        (snapshot) => {
          logger.log(`📦 Incoming transfers snapshot for ${branchId}: ${snapshot.docs.length} vehicles`)
          
          const vehicles: CheckedInVehicle[] = []
          
          snapshot.docs.forEach(doc => {
            const data = doc.data()
            
            // Only include vehicles that are NOT already at this branch
            // (they should still be at the source branch)
            if (data.branchId !== branchId) {
              vehicles.push({
                id: doc.id,
                vehicleId: data.vehicleId || null,
                registration: data.registration || '',
                make: data.make || '',
                model: data.model || '',
                colour: data.colour,
                size: data.size || '',
                condition: data.condition || '',
                status: data.status || 'Pending checks',
                userId: data.userId || '',
                organizationId: data.organizationId || '',
                branchId: data.branchId || '',
                mileage: data.mileage,
                notes: data.notes,
                comments: data.comments,
                contract: data.contract || null,
                contractColor: data.contractColor || null,
                insuranceStatus: data.insuranceStatus || null,
                motExpiry: data.motExpiry,
                taxExpiry: data.taxExpiry,
                location: data.location,
                bay: data.bay,
                updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
                createdAt: data.createdAt?.toDate?.() || data.createdAt,
                checkInTime: data.checkInTime,
                hireStatus: data.hireStatus || 'In Yard',
                originalStatus: data.originalStatus,
                hiredAt: data.hiredAt?.toDate?.() || data.hiredAt,
                hiredBy: data.hiredBy,
                hiredByName: data.hiredByName,
                hireNotes: data.hireNotes,
                
                // Transfer status fields
                transferStatus: data.transferStatus || null,
                targetBranchId: data.targetBranchId || null,
                targetBranchName: data.targetBranchName || null,
                transferInitiatedAt: data.transferInitiatedAt?.toDate?.() || data.transferInitiatedAt,
                transferInitiatedBy: data.transferInitiatedBy,
                transferInitiatedByName: data.transferInitiatedByName,
                
                // External garage fields
                externalGarageId: data.externalGarageId || null,
                externalGarageName: data.externalGarageName || null,
                serviceBookingId: data.serviceBookingId || null,
                checkedOutToGarageAt: data.checkedOutToGarageAt?.toDate?.() || data.checkedOutToGarageAt,
                checkedOutToGarageBy: data.checkedOutToGarageBy,
                checkedOutToGarageByName: data.checkedOutToGarageByName,
                
                lastEditLog: data.lastEditLog
              })
              
              logger.log(`✅ Incoming transfer: ${data.registration} from ${data.branchId} → ${branchId}`)
            }
          })
          
          setIncomingVehicles(vehicles)
          setLoading(false)
          setError(null)
        },
        (error) => {
          logger.error('❌ Error in incoming transfers subscription:', error)
          setError('Failed to load incoming transfers')
          setLoading(false)
        }
      )

      unsubscribeRef.current = unsubscribe
    }

    // Decide whether to have a listener
    const shouldListen = user && organizationId && isAppActive

    if (shouldListen) {
      if (!unsubscribeRef.current) {
        logger.log('✅ Setting up incoming transfers listener')
        setupListener()
      }
    } else {
      if (unsubscribeRef.current) {
        logger.log('🛑 Removing incoming transfers listener')
        cleanupListener()
        setLoading(false)
      }
    }

    // Cleanup on unmount
    return () => {
      cleanupListener()
    }
  }, [user, organizationId, branchId, isAppActive])

  return {
    incomingVehicles,
    loading,
    error
  }
}