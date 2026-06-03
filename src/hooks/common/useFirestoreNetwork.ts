// src/hooks/common/useFirestoreNetwork.ts
// Hook to control Firestore network connection based on app visibility
// This completely disconnects WebSocket when app is hidden = MASSIVE battery savings
// ZERO functional impact - data syncs instantly when app resumes

'use client'

import { useEffect, useRef } from 'react'
import { enableNetwork, disableNetwork } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useTabVisibility } from './useTabVisibility'
import { logger } from '@/lib/logger'

export function useFirestoreNetwork() {
  const { isVisible } = useTabVisibility()
  const isInitialMount = useRef(true)

  useEffect(() => {
    let mounted = true

    const handleNetworkChange = async () => {
      if (!mounted) return

      try {
        if (isVisible) {
          // Tab is visible - enable network (reconnect WebSocket)
          logger.log('🌐 Firestore: Enabling network (tab visible)')
          await enableNetwork(db)
          logger.log('✅ Firestore: Network enabled, WebSocket connected')
        } else {
          // Tab is hidden - disable network (disconnect WebSocket completely)
          logger.log('📴 Firestore: Disabling network (tab hidden)')
          await disableNetwork(db)
          logger.log('✅ Firestore: Network disabled, WebSocket disconnected, battery saved')
        }
      } catch (error) {
        // Ignore errors during network state changes (usually means already in that state)
        logger.log('ℹ️ Firestore network state change:', error)
      }
    }

    // Skip network toggle on initial mount (already connected)
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    handleNetworkChange()

    return () => {
      mounted = false
    }
  }, [isVisible])
}