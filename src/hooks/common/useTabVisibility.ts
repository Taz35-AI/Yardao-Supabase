// src/hooks/common/useTabVisibility.ts
// Hook to detect when browser tab becomes inactive/active
// This will pause Firebase listeners when tab is hidden to save CPU

'use client'

import { useState, useEffect } from 'react'
import { logger } from '@/lib/logger'

interface TabVisibilityState {
  isVisible: boolean
  visibilityState: 'visible' | 'hidden'
  hasFocus: boolean
}

export function useTabVisibility() {
  const [tabState, setTabState] = useState<TabVisibilityState>(() => ({
    isVisible: typeof document !== 'undefined' ? !document.hidden : true,
    visibilityState: typeof document !== 'undefined' ? (document.hidden ? 'hidden' : 'visible') : 'visible',
    hasFocus: typeof document !== 'undefined' ? document.hasFocus() : true
  }))

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return

    const handleVisibilityChange = () => {
      setTabState({
        isVisible: !document.hidden,
        visibilityState: document.hidden ? 'hidden' : 'visible',
        hasFocus: document.hasFocus()
      })
      
      // Log for debugging (can remove in production)
      logger.log('🔍 Tab visibility changed:', {
        hidden: document.hidden,
        visible: !document.hidden,
        hasFocus: document.hasFocus()
      })
    }

    const handleFocusChange = () => {
      setTabState(prev => ({
        ...prev,
        hasFocus: document.hasFocus()
      }))
    }

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocusChange)
    window.addEventListener('blur', handleFocusChange)

    // Cleanup listeners
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocusChange)
      window.removeEventListener('blur', handleFocusChange)
    }
  }, [])

  return tabState
}