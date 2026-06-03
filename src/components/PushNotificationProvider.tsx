// src/components/PushNotificationProvider.tsx
// Initializes push notifications globally in the app
// Silent initialization - no UI, just sets up FCM in background

'use client'

import { useEffect } from 'react'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/lib/logger'

interface PushNotificationProviderProps {
  children: React.ReactNode
}

export function PushNotificationProvider({ children }: PushNotificationProviderProps) {
  logger.log('🔥🔥🔥 COMPONENT TOP - BEFORE ANYTHING')
  
  try {
    logger.log('🔥 PushNotificationProvider rendered!')
    
    const { user } = useAuth()
    logger.log('👥 User in provider:', user ? 'LOGGED IN' : 'NOT LOGGED IN')
    
    const { permissionStatus, fcmToken, error, isSupported } = usePushNotifications()
    
    logger.log('📊 Push notification state:', { isSupported, permissionStatus, hasToken: !!fcmToken, error })

    // Log status for debugging (optional - remove in production if desired)
    useEffect(() => {
      if (!isSupported) {
        logger.log('📱 Push notifications: Not available (web platform)')
        return
      }

      if (!user) {
        logger.log('📱 Push notifications: Waiting for user authentication')
        return
      }

      if (error) {
        logger.error('📱 Push notifications error:', error)
        return
      }

      if (permissionStatus === 'granted' && fcmToken) {
        logger.log('✅ Push notifications: Active and ready')
        logger.log('🔑 FCM Token:', fcmToken.substring(0, 20) + '...')
      } else if (permissionStatus === 'denied') {
        logger.log('⚠️ Push notifications: Permission denied by user')
      } else if (permissionStatus === 'prompt') {
        logger.log('📱 Push notifications: Requesting permission...')
      }
    }, [isSupported, user, permissionStatus, fcmToken, error])

    logger.log('🔥 RETURNING CHILDREN')
    // This component doesn't render anything - just initializes push notifications
    return <>{children}</>
    
  } catch (err) {
    logger.error('💥💥💥 PROVIDER CRASHED:', err)
    return <>{children}</>
  }
}