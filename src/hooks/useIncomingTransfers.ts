// src/hooks/useIncomingTransfers.ts — SUPABASE re-implementation.
// Optimized hook to load ONLY vehicles being transferred TO the current branch.
// This stays cheap on Supabase too: the initial select + the realtime filter
// are both scoped to (organization_id, transfer_status='in_transit',
// target_branch_id=branchId) so only the handful of in-transit vehicles for
// this branch are ever fetched/streamed.
//
// Data-layer swap only — the public return ({ incomingVehicles, loading, error })
// and the mapped CheckedInVehicle shape are kept identical. Firestore onSnapshot
// becomes: initial select → refetch on any postgres_changes for the org's
// checked_in_vehicles, re-applying the same filter + branch exclusion.

'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAppState } from '@/hooks/common/useAppState'
import { supabase } from '@/lib/supabaseClient'
import { userProfileService } from '@/lib/firestore'
import type { CheckedInVehicle } from '@/types'
import { logger } from '@/lib/logger'

const CHECKED_IN_VEHICLES = 'checked_in_vehicles'

interface UseIncomingTransfersProps {
  branchId: string
}

// timestamptz/date columns arrive as ISO strings — revive to Date to match the
// Firestore .toDate() behaviour the consumers expect.
const toDate = (v: any) => (v ? new Date(v) : v)

// snake_case row → the exact CheckedInVehicle shape the original built.
function mapRow(data: any): CheckedInVehicle {
  return {
    id: data.id,
    vehicleId: data.vehicle_id || null,
    registration: data.registration || '',
    make: data.make || '',
    model: data.model || '',
    colour: data.colour,
    size: data.size || '',
    condition: data.condition || '',
    status: data.status || 'Pending checks',
    userId: data.user_id || '',
    organizationId: data.organization_id || '',
    branchId: data.branch_id || '',
    mileage: data.mileage,
    notes: data.notes,
    comments: data.comments,
    contract: data.contract || null,
    contractColor: data.contract_color || null,
    insuranceStatus: data.insurance_status || null,
    motExpiry: data.mot_expiry,
    taxExpiry: data.tax_expiry,
    location: data.location,
    bay: data.bay,
    updatedAt: toDate(data.updated_at),
    createdAt: toDate(data.created_at),
    checkInTime: data.check_in_time,
    hireStatus: data.hire_status || 'In Yard',
    originalStatus: data.original_status,
    hiredAt: toDate(data.hired_at),
    hiredBy: data.hired_by,
    hiredByName: data.hired_by_name,
    hireNotes: data.hire_notes,

    // Transfer status fields
    transferStatus: data.transfer_status || null,
    targetBranchId: data.target_branch_id || null,
    targetBranchName: data.target_branch_name || null,
    transferInitiatedAt: toDate(data.transfer_initiated_at),
    transferInitiatedBy: data.transfer_initiated_by,
    transferInitiatedByName: data.transfer_initiated_by_name,

    // External garage fields
    externalGarageId: data.external_garage_id || null,
    externalGarageName: data.external_garage_name || null,
    serviceBookingId: data.service_booking_id || null,
    checkedOutToGarageAt: toDate(data.checked_out_to_garage_at),
    checkedOutToGarageBy: data.checked_out_to_garage_by,
    checkedOutToGarageByName: data.checked_out_to_garage_by_name,

    lastEditLog: data.last_edit_log,
  } as CheckedInVehicle
}

export function useIncomingTransfers({ branchId }: UseIncomingTransfersProps) {
  const { user } = useAuth()
  const { isAppActive } = useAppState()
  const [incomingVehicles, setIncomingVehicles] = useState<CheckedInVehicle[]>([])
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
      // (org + in_transit + target branch). Mirrors the Firestore composite query.
      const fetchIncoming = async () => {
        try {
          const { data, error: fetchError } = await supabase
            .from(CHECKED_IN_VEHICLES)
            .select('*')
            .eq('organization_id', organizationId)
            .eq('transfer_status', 'in_transit')
            .eq('target_branch_id', branchId) // 🚀 This is the key optimization!
            .order('transfer_initiated_at', { ascending: false })
          if (fetchError) throw fetchError

          logger.log(`📦 Incoming transfers snapshot for ${branchId}: ${(data ?? []).length} vehicles`)

          const vehicles: CheckedInVehicle[] = []
          ;(data ?? []).forEach((row) => {
            // Only include vehicles that are NOT already at this branch
            // (they should still be at the source branch)
            if (row.branch_id !== branchId) {
              vehicles.push(mapRow(row))
              logger.log(`✅ Incoming transfer: ${row.registration} from ${row.branch_id} → ${branchId}`)
            }
          })

          setIncomingVehicles(vehicles)
          setLoading(false)
          setError(null)
        } catch (err) {
          logger.error('❌ Error in incoming transfers subscription:', err)
          setError('Failed to load incoming transfers')
          setLoading(false)
        }
      }

      // initial fetch
      fetchIncoming()

      // refetch on any change to this org's checked_in_vehicles
      const channel = supabase
        .channel(`incoming_transfers:${organizationId}:${branchId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: CHECKED_IN_VEHICLES,
            filter: `organization_id=eq.${organizationId}`,
          },
          () => {
            fetchIncoming()
          }
        )
        .subscribe()

      unsubscribeRef.current = () => {
        supabase.removeChannel(channel)
      }
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
