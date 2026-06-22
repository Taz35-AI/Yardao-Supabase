// src/hooks/useBranches.ts
// UPDATED - Supports branch creation with location data (address, lat/lng)

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { branchService } from '@/lib/services/branchService'
import { Branch } from '@/types/branch'
import { logger } from '@/lib/logger'

export function useBranches() {
  const { user } = useAuth()
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.uid) {
      setBranches([])
      setLoading(false)
      setError(null)
      return
    }

    let unsubscribe: (() => void) | null = null
    let isMounted = true

    const loadBranches = async () => {
      try {
        if (!isMounted) return
        
        setLoading(true)
        setError(null)

        // Get user profile for organizationId
        const userProfile = await userProfileService.getProfile(user.uid)
        if (!userProfile?.organizationId) {
          if (isMounted) {
            setError('No organization found')
            setLoading(false)
          }
          return
        }

        if (!isMounted) return

        // Subscribe to branches
        unsubscribe = branchService.subscribeToBranches(
          userProfile.organizationId,
          (updatedBranches) => {
            if (isMounted) {
              setBranches(updatedBranches)
              setLoading(false)
            }
          }
        )

      } catch (err) {
        if (isMounted) {
          logger.error('Error loading branches:', err)
          setError(err instanceof Error ? err.message : 'Failed to load branches')
          setLoading(false)
        }
      }
    }

    loadBranches()

    return () => {
      isMounted = false
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [user?.uid])

  // UPDATED: createBranch now accepts optional locationData and bay count
  const createBranch = useCallback(async (
    name: string,
    slug: string,
    locationData?: {
      address?: string
      postcode?: string
      latitude?: number
      longitude?: number
    },
    // 🛠️ Optional service bay count for the new branch.
    serviceBayCount?: number,
    // 🏷️ Optional custom bay names (display only). Index 0 = bay 1.
    serviceBayNames?: string[],
  ) => {
    if (!user) throw new Error('User not authenticated')

    try {
      const userProfile = await userProfileService.getProfile(user.uid)
      if (!userProfile?.organizationId) {
        throw new Error('No organization found')
      }

      // Validate slug (alphanumeric and hyphens only)
      const slugRegex = /^[a-z0-9-]+$/
      if (!slugRegex.test(slug)) {
        throw new Error('Slug must contain only lowercase letters, numbers, and hyphens')
      }

      await branchService.createBranch({
        name,
        slug,
        organizationId: userProfile.organizationId,
        createdBy: user.uid,
        createdByName: userProfile.displayName || user.email || 'Unknown User',
        ...locationData, // Spread location data if provided
        ...(typeof serviceBayCount === 'number' && { serviceBayCount }),
        ...(Array.isArray(serviceBayNames) && serviceBayNames.length > 0 && { serviceBayNames }),
      })

      return true
    } catch (err) {
      logger.error('Error creating branch:', err)
      throw err
    }
  }, [user])

  const updateBranch = useCallback(async (branchId: string, updates: Partial<Branch>) => {
    if (!user) throw new Error('User not authenticated')

    try {
      await branchService.updateBranch(branchId, updates)
      return true
    } catch (err) {
      logger.error('Error updating branch:', err)
      throw err
    }
  }, [user])

  const deleteBranch = useCallback(async (branchId: string) => {
    if (!user) throw new Error('User not authenticated')

    try {
      await branchService.deleteBranch(branchId)
      return true
    } catch (err) {
      logger.error('Error deleting branch:', err)
      throw err
    }
  }, [user])

  const getBranchBySlug = useCallback(async (slug: string): Promise<Branch | null> => {
    if (!user?.uid) return null

    try {
      const userProfile = await userProfileService.getProfile(user.uid)
      if (!userProfile?.organizationId) return null

      return await branchService.getBranchBySlug(userProfile.organizationId, slug)
    } catch (err) {
      logger.error('Error getting branch by slug:', err)
      return null
    }
  }, [user?.uid])

  return {
    branches,
    loading,
    error,
    createBranch,
    updateBranch,
    deleteBranch,
    getBranchBySlug
  }
}