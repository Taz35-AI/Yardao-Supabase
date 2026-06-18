// src/hooks/usePushNotifications.ts
// Enhanced FCM token management with detailed Android 15 logging
// Handles permissions, token storage, and updates with better debugging
// AMENDED: Added LocalNotifications for foreground notification display

'use client'

import { useEffect, useState, useRef } from 'react'
import { PushNotifications } from '@capacitor/push-notifications'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '@/contexts/AuthContext'
import { appNavigate } from '@/lib/nav'
import { supabase } from '@/lib/supabaseClient'
import { logger } from '@/lib/logger'

// 🔕 Push registration needs Firebase configured natively (google-services.json
// on Android, APNs on iOS). Until that's wired, calling PushNotifications.register()
// crashes the app on launch ("Default FirebaseApp is not initialized") — and a
// native crash can't be caught by JS try/catch. Keep this false until FCM is set
// up, then flip to true to re-enable the whole flow below unchanged.
const PUSH_NOTIFICATIONS_ENABLED = true

export function usePushNotifications() {
  logger.log('🔥 [HOOK] usePushNotifications hook called')
  
  const { user } = useAuth()
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'>('prompt')
  const [fcmToken, setFcmToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  
  // Store pending token that arrived before user was ready
  const pendingTokenRef = useRef<string | null>(null)
  const initAttemptedRef = useRef(false)

  // Initialize push notifications once
  useEffect(() => {
    logger.log('🔥 [HOOK] Initialization useEffect triggered')
    logger.log(`🔥 [HOOK] - Is native: ${Capacitor.isNativePlatform()}`)
    logger.log(`🔥 [HOOK] - Is initialized: ${isInitialized}`)
    logger.log(`🔥 [HOOK] - User exists: ${!!user}`)
    logger.log(`🔥 [HOOK] - Init attempted: ${initAttemptedRef.current}`)
    
    // Only run on native platforms (Android/iOS)
    if (!Capacitor.isNativePlatform()) {
      logger.log('⚠️ [HOOK] Skipping: Not a native platform')
      return
    }

    // 🔕 Skip until Firebase/FCM is configured natively — otherwise register()
    // crashes the app on launch. Re-enable via PUSH_NOTIFICATIONS_ENABLED.
    if (!PUSH_NOTIFICATIONS_ENABLED) {
      logger.log('🔕 [HOOK] Push notifications disabled (FCM not configured yet) — skipping native init')
      return
    }

    // Initialize once, regardless of user status
    if (!initAttemptedRef.current) {
      logger.log('✅ [HOOK] Starting initialization...')
      initAttemptedRef.current = true
      initializePushNotifications()
      setIsInitialized(true)
    } else {
      logger.log('ℹ️ [HOOK] Already initialized, skipping')
    }
  }, []) // Empty dependency array - only run once on mount

  // Save pending token when user becomes available
  useEffect(() => {
    logger.log('🔥 [HOOK] Token save useEffect triggered')
    logger.log(`🔥 [HOOK] - User exists: ${!!user}`)
    logger.log(`🔥 [HOOK] - Pending token exists: ${!!pendingTokenRef.current}`)
    
    if (user && pendingTokenRef.current) {
      logger.log('✅ [HOOK] User authenticated, saving pending FCM token')
      saveFCMToken(pendingTokenRef.current)
      pendingTokenRef.current = null
    }
  }, [user])

  async function initializePushNotifications() {
    const platform = Capacitor.getPlatform()
    logger.log('='.repeat(60))
    logger.log('🔥 [INIT] Starting push notification initialization')
    logger.log(`🔥 [INIT] Platform: ${platform}`)
    logger.log(`🔥 [INIT] Android Version: Likely Android 15`)
    logger.log('='.repeat(60))

    try {
      // Step 1: Check current permission status
      logger.log('📋 [INIT] Step 1: Checking current permissions...')
      const permResult = await PushNotifications.checkPermissions()
      logger.log(`✅ [INIT] Current permission: ${permResult.receive}`)
      setPermissionStatus(permResult.receive)

      // Step 2: Request permission if needed
      if (permResult.receive === 'prompt' || permResult.receive === 'prompt-with-rationale') {
        logger.log('📋 [INIT] Step 2: Permission not granted, requesting...')
        logger.log('📱 [INIT] User should see permission dialog now...')
        
        const requestResult = await PushNotifications.requestPermissions()
        logger.log(`✅ [INIT] Permission request result: ${requestResult.receive}`)
        setPermissionStatus(requestResult.receive)

        if (requestResult.receive !== 'granted') {
          const errorMsg = 'Push notification permission denied by user'
          logger.error(`❌ [INIT] ${errorMsg}`)
          logger.error('❌ [INIT] User must grant permission in system settings to receive notifications')
          setError(errorMsg)
          return
        }
        
        logger.log('✅ [INIT] Permission granted by user!')
      } else if (permResult.receive === 'denied') {
        const errorMsg = 'Push notification permission previously denied. Please enable in device settings.'
        logger.error(`❌ [INIT] ${errorMsg}`)
        logger.error('❌ [INIT] Device: Settings → Apps → Yardao → Notifications → Enable')
        setError(errorMsg)
        return
      } else {
        logger.log('✅ [INIT] Step 2: Permission already granted, skipping request')
      }

      // Step 2.5: Request LOCAL notification permission (for foreground notifications)
      logger.log('📋 [INIT] Step 2.5: Requesting LOCAL notification permission...')
      try {
        const localPermResult = await LocalNotifications.requestPermissions()
        logger.log(`✅ [INIT] Local notification permission: ${localPermResult.display}`)
      } catch (localErr) {
        logger.log('⚠️ [INIT] Local notification permission request failed (non-critical):', localErr)
        // Non-critical - continue with initialization
      }

      // Step 3: Register for push notifications
      logger.log('📋 [INIT] Step 3: Registering for push notifications...')
      await PushNotifications.register()
      logger.log('✅ [INIT] Registration initiated successfully')
      logger.log('⏳ [INIT] Waiting for FCM token from Firebase...')

      // Step 4: Setup listeners
      logger.log('📋 [INIT] Step 4: Setting up FCM event listeners...')
      setupListeners()
      logger.log('✅ [INIT] Event listeners configured')
      
      logger.log('='.repeat(60))
      logger.log('✅ [INIT] Initialization complete - waiting for token')
      logger.log('='.repeat(60))
      
    } catch (err) {
      logger.error('='.repeat(60))
      logger.error('❌ [INIT] Initialization failed with error:')
      logger.error(err)
      logger.error('='.repeat(60))
      setError(err instanceof Error ? err.message : 'Failed to initialize push notifications')
    }
  }

  function setupListeners() {
    logger.log('🔔 [LISTENERS] Setting up FCM event listeners...')
    
    // Registration success - token received
    PushNotifications.addListener('registration', async (token) => {
      logger.log('='.repeat(60))
      logger.log('✅ [TOKEN] FCM token received from Firebase!')
      logger.log(`🔑 [TOKEN] Token (first 30 chars): ${token.value.substring(0, 30)}...`)
      logger.log(`🔑 [TOKEN] Token length: ${token.value.length} characters`)
      logger.log('='.repeat(60))
      
      setFcmToken(token.value)
      
      // Save token immediately if user is available, otherwise store for later
      if (user) {
        logger.log('👤 [TOKEN] User available, saving to Supabase immediately')
        await saveFCMToken(token.value)
      } else {
        logger.log('⏳ [TOKEN] User not available yet, storing in pendingTokenRef')
        logger.log('⏳ [TOKEN] Will save to Supabase when user logs in')
        pendingTokenRef.current = token.value
      }
    })

    // Registration error
    PushNotifications.addListener('registrationError', (error) => {
      logger.error('='.repeat(60))
      logger.error('❌ [TOKEN] FCM registration error:')
      logger.error(error)
      logger.error('='.repeat(60))
      setError('Failed to register for push notifications')
    })

    // 🔥 AMENDED: Notification received while app is in FOREGROUND
    // Now shows a LOCAL notification so user sees it even when app is open!
    PushNotifications.addListener('pushNotificationReceived', async (notification) => {
      logger.log('='.repeat(60))
      logger.log('📬 [NOTIFICATION] Push notification received (FOREGROUND)')
      logger.log('📬 [NOTIFICATION] Title:', notification.title)
      logger.log('📬 [NOTIFICATION] Body:', notification.body)
      logger.log('📬 [NOTIFICATION] Data:', notification.data)
      logger.log('='.repeat(60))
      
      // 🔥 FIX: Show a LOCAL notification so user sees it even in foreground!
      // This creates a system notification banner even when app is open
      try {
        await LocalNotifications.schedule({
          notifications: [
            {
              id: Date.now(), // Unique ID based on timestamp
              title: notification.title || 'Yardao Notification',
              body: notification.body || 'You have a new notification',
              // Copy over the data so tapping works correctly
              extra: notification.data,
              // Show immediately
              schedule: undefined,
              // Android-specific settings
              channelId: 'yardao_notifications',
              smallIcon: 'ic_launcher',
              largeIcon: 'ic_launcher',
            }
          ]
        })
        logger.log('✅ [NOTIFICATION] Local notification scheduled for foreground display')
      } catch (err) {
        logger.error('❌ [NOTIFICATION] Failed to show local notification:', err)
        // Non-critical error - continue execution
      }
    })

    // Notification tapped/opened (works for BOTH push and local notifications)
    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      logger.log('='.repeat(60))
      logger.log('👆 [NOTIFICATION] Push notification tapped/opened')
      logger.log('👆 [NOTIFICATION] Title:', notification.notification.title)
      logger.log('👆 [NOTIFICATION] Data:', notification.notification.data)
      logger.log('='.repeat(60))
      
      // Handle navigation based on notification data
      handleNotificationTap(notification.notification.data)
    })

    // 🔥 NEW: Handle LOCAL notification taps (from foreground notifications)
    LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
      logger.log('='.repeat(60))
      logger.log('👆 [LOCAL] Local notification tapped/opened')
      logger.log('👆 [LOCAL] Title:', notification.notification.title)
      logger.log('👆 [LOCAL] Data:', notification.notification.extra)
      logger.log('='.repeat(60))
      
      // Extra data contains the original push notification data
      handleNotificationTap(notification.notification.extra)
    })

    logger.log('✅ [LISTENERS] All FCM and Local listeners configured')
  }

  // 🔥 NEW: Centralized notification tap handler (for both push and local)
  function handleNotificationTap(data: any) {
    logger.log('🚗 [NAVIGATION] Processing notification tap...')
    
    if (data?.type === 'service_today' || data?.type === 'service_created') {
      logger.log('🚗 [NAVIGATION] Navigating to /bookings')
      appNavigate('/bookings')
    } else if (data?.type === 'mot_expired' || data?.type === 'mot_expiring') {
      logger.log('🚗 [NAVIGATION] Navigating to /fleet')
      appNavigate('/fleet')
    } else {
      logger.log('🚗 [NAVIGATION] No specific navigation for notification type:', data?.type)
    }
  }

  // Save FCM token to user's Supabase profile
  async function saveFCMToken(token: string) {
    logger.log('='.repeat(60))
    logger.log('💾 [SAVE] Saving FCM token to Supabase')
    logger.log(`💾 [SAVE] Token (first 30 chars): ${token.substring(0, 30)}...`)

    if (!user) {
      logger.log('⚠️ [SAVE] Cannot save: No user authenticated')
      logger.log('⚠️ [SAVE] Token stored in pendingTokenRef for later')
      logger.log('='.repeat(60))
      return
    }

    const userId = user.uid
    logger.log(`💾 [SAVE] User ID: ${userId}`)
    logger.log(`💾 [SAVE] User Email: ${user.email}`)

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ fcm_token: token })
        .eq('id', userId)
      if (updateError) throw updateError
      logger.log('✅ [SAVE] FCM token saved to Supabase successfully!')
      logger.log(`✅ [SAVE] Table/row: profiles/${userId}`)
      logger.log('✅ [SAVE] Edge Functions can now send notifications to this device')
      logger.log('='.repeat(60))
    } catch (err) {
      logger.error('='.repeat(60))
      logger.error('❌ [SAVE] Error saving FCM token to Supabase:')
      logger.error(err)
      logger.log('='.repeat(60))
      setError('Failed to save notification token')
      
      // Store token for retry if save fails
      if (!pendingTokenRef.current) {
        logger.log('💾 [SAVE] Storing in pendingTokenRef for retry')
        pendingTokenRef.current = token
      }
    }
  }

  // Manually request permissions (if user wants to enable later)
  async function requestPermissions() {
    logger.log('='.repeat(60))
    logger.log('📱 [MANUAL] Manual permission request initiated')
    try {
      const result = await PushNotifications.requestPermissions()
      logger.log(`✅ [MANUAL] Permission result: ${result.receive}`)
      setPermissionStatus(result.receive)
      
      if (result.receive === 'granted') {
        logger.log('✅ [MANUAL] Permission granted, registering...')
        await PushNotifications.register()
        
        // Also request local notification permission
        try {
          await LocalNotifications.requestPermissions()
          logger.log('✅ [MANUAL] Local notification permission also requested')
        } catch (localErr) {
          logger.log('⚠️ [MANUAL] Local notification permission request failed (non-critical):', localErr)
        }
        
        logger.log('='.repeat(60))
        return true
      }
      logger.log('❌ [MANUAL] Permission not granted')
      logger.log('='.repeat(60))
      return false
    } catch (err) {
      logger.error('❌ [MANUAL] Error requesting permissions:', err)
      logger.log('='.repeat(60))
      return false
    }
  }

  // Get current notification channels (Android only)
  async function listChannels() {
    logger.log('📋 [CHANNELS] Listing notification channels...')
    try {
      const result = await PushNotifications.listChannels()
      logger.log('✅ [CHANNELS] Channels:', result.channels)
      return result.channels
    } catch (err) {
      logger.error('❌ [CHANNELS] Error listing channels:', err)
      return []
    }
  }

  return {
    permissionStatus,
    fcmToken,
    error,
    requestPermissions,
    listChannels,
    isSupported: Capacitor.isNativePlatform()
  }
}