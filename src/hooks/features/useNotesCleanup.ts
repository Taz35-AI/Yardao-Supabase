// src/hooks/features/useNotesCleanup.ts - DEBUG VERSION
'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { notesCleanupService, NotesCleanupOperation, NotesCleanupResult } from '@/services/notesCleanupService'
import { logger } from '@/lib/logger'

logger.log('🪝 useNotesCleanup hook loading...')

export interface NotesCleanupHookReturn {
  isOperationRunning: boolean
  previewResults: any[]
  isPreviewLoading: boolean
  lastOperationResult: NotesCleanupResult | null
  previewCleanup: (operation: NotesCleanupOperation) => Promise<void>
  executeCleanup: (operation: NotesCleanupOperation) => Promise<NotesCleanupResult>
  clearPreview: () => void
  clearLastResult: () => void
}

export function useNotesCleanup(organizationId: string): NotesCleanupHookReturn {
  logger.log('🪝 useNotesCleanup hook called with organizationId:', organizationId)
  
  const { user } = useAuth()
  const [isOperationRunning, setIsOperationRunning] = useState(false)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [previewResults, setPreviewResults] = useState<any[]>([])
  const [lastOperationResult, setLastOperationResult] = useState<NotesCleanupResult | null>(null)

  logger.log('🔍 Hook state:', {
    user: user ? { uid: user.uid, email: user.email } : null,
    organizationId,
    isOperationRunning,
    isPreviewLoading,
    previewResultsLength: previewResults.length
  })

  const previewCleanup = async (operation: NotesCleanupOperation) => {
    logger.log('👀 previewCleanup called with operation:', operation)
    
    if (!user || !organizationId) {
      const error = 'User not authenticated or no organization'
      logger.error('❌', error)
      throw new Error(error)
    }

    setIsPreviewLoading(true)
    logger.log('🔄 Setting preview loading to true')
    
    try {
      logger.log('📊 Calling notesCleanupService.previewNotesCleanup...')
      const preview = await notesCleanupService.previewNotesCleanup(organizationId, operation)
      logger.log('✅ Preview completed:', preview)
      
      setPreviewResults(preview.affectedVehicles)
      logger.log('📋 Preview results set:', preview.affectedVehicles.length, 'vehicles affected')
    } catch (error) {
      logger.error('💥 Preview failed:', error)
      throw error
    } finally {
      setIsPreviewLoading(false)
      logger.log('🔄 Setting preview loading to false')
    }
  }

  const executeCleanup = async (operation: NotesCleanupOperation): Promise<NotesCleanupResult> => {
    logger.log('🚀 executeCleanup called with operation:', operation)
    
    if (!user || !organizationId) {
      const error = 'User not authenticated or no organization'
      logger.error('❌', error)
      throw new Error(error)
    }

    setIsOperationRunning(true)
    logger.log('🔄 Setting operation running to true')
    
    try {
      const userDisplayName = user.displayName || user.email || 'Unknown User'
      logger.log('👤 Using display name:', userDisplayName)
      
      logger.log('🧹 Calling notesCleanupService.performNotesCleanup...')
      const result = await notesCleanupService.performNotesCleanup(
        organizationId,
        operation,
        userDisplayName,
        user.uid
      )
      
      logger.log('✅ Cleanup operation completed:', result)
      setLastOperationResult(result)
      setPreviewResults([]) // Clear preview after execution
      
      return result
    } catch (error) {
      logger.error('💥 Cleanup operation failed:', error)
      throw error
    } finally {
      setIsOperationRunning(false)
      logger.log('🔄 Setting operation running to false')
    }
  }

  const clearPreview = () => {
    logger.log('🧹 Clearing preview results')
    setPreviewResults([])
  }

  const clearLastResult = () => {
    logger.log('🧹 Clearing last operation result')
    setLastOperationResult(null)
  }

  const hookReturn = {
    isOperationRunning,
    previewResults,
    isPreviewLoading,
    lastOperationResult,
    previewCleanup,
    executeCleanup,
    clearPreview,
    clearLastResult
  }

  logger.log('🪝 useNotesCleanup returning:', {
    isOperationRunning,
    previewResultsLength: previewResults.length,
    isPreviewLoading,
    hasLastResult: !!lastOperationResult
  })

  return hookReturn
}

logger.log('✅ useNotesCleanup hook exported')