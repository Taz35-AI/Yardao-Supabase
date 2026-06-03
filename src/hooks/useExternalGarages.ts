// src/hooks/useExternalGarages.ts
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { externalGarageService } from '@/lib/externalGarageService'
import type { ExternalGarage, ExternalGarageFormData } from '@/types'
import { logger } from '@/lib/logger'

interface UseExternalGaragesOptions {
  includeInactive?: boolean
  autoRefresh?: boolean
  refreshInterval?: number
}

interface UseExternalGaragesReturn {
  // Data
  garages: ExternalGarage[]
  activeGarages: ExternalGarage[]
  loading: boolean
  error: string | null

  // Operations
  createGarage: (data: ExternalGarageFormData) => Promise<ExternalGarage | null>
  updateGarage: (id: string, data: Partial<ExternalGarageFormData>) => Promise<boolean>
  deleteGarage: (id: string) => Promise<boolean>
  toggleGarageStatus: (id: string) => Promise<boolean>
  refreshGarages: () => Promise<void>

  // Utilities
  getGarageById: (id: string) => ExternalGarage | undefined
  isGarageNameExists: (name: string, excludeId?: string) => Promise<boolean>
  
  // State management
  clearError: () => void
}

export function useExternalGarages(
  options: UseExternalGaragesOptions = {}
): UseExternalGaragesReturn {
  const { user } = useAuth()
  const {
    includeInactive = false,
    autoRefresh = false,
    refreshInterval = 30000 // 30 seconds
  } = options

  // State
  const [garages, setGarages] = useState<ExternalGarage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userProfile, setUserProfile] = useState<any>(null)

  // Load user profile to get organizationId
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!user?.uid) {
        setUserProfile(null)
        return
      }

      try {
        const { userProfileService } = await import('@/lib/firestore')
        const profile = await userProfileService.getProfile(user.uid)
        setUserProfile(profile)
      } catch (error) {
        logger.error('Error loading user profile in hook:', error)
      }
    }

    loadUserProfile()
  }, [user])

  // Get user's organization ID from profile
  const organizationId = userProfile?.organizationId

  // Memoized active garages
  const activeGarages = useMemo(() => {
    return garages.filter(garage => garage.isActive)
  }, [garages])

  // Clear error function
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Load garages from Firestore
  const loadGarages = useCallback(async (showLoading = true) => {
    if (!organizationId) {
      setGarages([])
      setLoading(false)
      return
    }

    try {
      if (showLoading) setLoading(true)
      setError(null)

      const fetchedGarages = includeInactive 
        ? await externalGarageService.getAllExternalGarages(organizationId)
        : await externalGarageService.getExternalGarages(organizationId)

      setGarages(fetchedGarages)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load external garages'
      logger.error('Error loading external garages:', err)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [organizationId, includeInactive])

  // Refresh garages function
  const refreshGarages = useCallback(async () => {
    await loadGarages(false)
  }, [loadGarages])

  // Check if garage name exists - MOVED UP to avoid circular dependency
  const isGarageNameExists = useCallback(async (
    name: string,
    excludeId?: string
  ): Promise<boolean> => {
    if (!organizationId) return false
    
    try {
      return await externalGarageService.isGarageNameExists(name, organizationId, excludeId)
    } catch (err) {
      logger.error('Error checking garage name existence:', err)
      return false
    }
  }, [organizationId])

  // Create new garage
  const createGarage = useCallback(async (
    data: ExternalGarageFormData
  ): Promise<ExternalGarage | null> => {
    if (!organizationId || !user) {
      logger.error('Create garage failed: Missing organizationId or user', { organizationId, user: !!user })
      setError('User not authenticated or organization not found')
      return null
    }

    if (!user.uid) {
      logger.error('Create garage failed: Missing user.uid', { user })
      setError('User authentication incomplete')
      return null
    }

    try {
      setError(null)
      
      logger.log('Creating garage with data:', { data, organizationId, userId: user.uid })
      
      // Check if name already exists
      const nameExists = await isGarageNameExists(data.name)
      
      if (nameExists) {
        setError('A garage with this name already exists')
        return null
      }

      const newGarage = await externalGarageService.createExternalGarage(
        data,
        organizationId,
        user.uid
      )

      logger.log('Garage created successfully:', newGarage)

      // Update local state
      setGarages(prev => [...prev, newGarage].sort((a, b) => a.name.localeCompare(b.name)))
      
      return newGarage
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create external garage'
      logger.error('Error creating external garage:', err)
      setError(errorMessage)
      return null
    }
  }, [organizationId, user, isGarageNameExists])

  // Update existing garage
  const updateGarage = useCallback(async (
    id: string,
    data: Partial<ExternalGarageFormData>
  ): Promise<boolean> => {
    if (!organizationId) {
      setError('Organization not found')
      return false
    }

    try {
      setError(null)

      // Check if name already exists (if name is being updated)
      if (data.name) {
        const nameExists = await isGarageNameExists(data.name, id)
        
        if (nameExists) {
          setError('A garage with this name already exists')
          return false
        }
      }

      await externalGarageService.updateExternalGarage(id, data, organizationId)

      // Update local state
      setGarages(prev => prev.map(garage => {
        if (garage.id === id) {
          return {
            ...garage,
            ...data,
            name: data.name?.trim() || garage.name,
            address: data.address?.trim() || garage.address,
            updatedAt: new Date()
          }
        }
        return garage
      }).sort((a, b) => a.name.localeCompare(b.name)))

      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update external garage'
      logger.error('Error updating external garage:', err)
      setError(errorMessage)
      return false
    }
  }, [organizationId, isGarageNameExists])

  // Toggle garage active status
  const toggleGarageStatus = useCallback(async (id: string): Promise<boolean> => {
    if (!organizationId) {
      setError('Organization not found')
      return false
    }

    try {
      setError(null)
      const newStatus = await externalGarageService.toggleExternalGarageStatus(id, organizationId)

      // Update local state
      setGarages(prev => prev.map(garage => 
        garage.id === id 
          ? { ...garage, isActive: newStatus, updatedAt: new Date() }
          : garage
      ))

      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update garage status'
      logger.error('Error toggling garage status:', err)
      setError(errorMessage)
      return false
    }
  }, [organizationId])

  // Delete garage (soft delete)
  const deleteGarage = useCallback(async (id: string): Promise<boolean> => {
    if (!organizationId) {
      setError('Organization not found')
      return false
    }

    try {
      setError(null)
      await externalGarageService.deleteExternalGarage(id, organizationId)

      // Update local state
      if (includeInactive) {
        // Mark as inactive if showing inactive items
        setGarages(prev => prev.map(garage => 
          garage.id === id 
            ? { ...garage, isActive: false, updatedAt: new Date() }
            : garage
        ))
      } else {
        // Remove from list if only showing active items
        setGarages(prev => prev.filter(garage => garage.id !== id))
      }

      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete external garage'
      logger.error('Error deleting external garage:', err)
      setError(errorMessage)
      return false
    }
  }, [organizationId, includeInactive])

  // Get garage by ID
  const getGarageById = useCallback((id: string): ExternalGarage | undefined => {
    return garages.find(garage => garage.id === id)
  }, [garages])

  // Load garages on mount and when dependencies change
  useEffect(() => {
    loadGarages(true)
  }, [loadGarages])

  // Auto-refresh if enabled
  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return

    const interval = setInterval(() => {
      refreshGarages()
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, refreshGarages])

  return {
    // Data
    garages,
    activeGarages,
    loading,
    error,

    // Operations
    createGarage,
    updateGarage,
    deleteGarage,
    toggleGarageStatus,
    refreshGarages,

    // Utilities
    getGarageById,
    isGarageNameExists,

    // State management
    clearError
  }
}