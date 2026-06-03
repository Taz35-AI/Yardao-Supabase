// src/services/pushNotificationService.ts
import { PushNotifications, Token, ActionPerformed } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { supabase } from '@/lib/supabaseClient'
import { logger } from '@/lib/logger'

export class PushNotificationService {
  private static instance: PushNotificationService
  private isInitialized = false

  private constructor() {}

  static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService()
    }
    return PushNotificationService.instance
  }

  /**
   * Initialize push notifications - ONLY ON ANDROID
   */
  async initialize(userId: string, organizationId: string): Promise<void> {
    // 🔥 CRITICAL: Only run on native Android app, NOT web
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      logger.log('⏭️ Push notifications skipped: Not running on Android native platform')
      return
    }

    if (this.isInitialized) {
      logger.log('⏭️ Push notifications already initialized')
      return
    }

    try {
      logger.log('🔔 Initializing push notifications for Android...')

      // Request permission
      const permStatus = await PushNotifications.requestPermissions()
      
      if (permStatus.receive !== 'granted') {
        logger.log('⚠️ Push notification permission denied')
        return
      }

      // Register with FCM
      await PushNotifications.register()

      // Listen for registration success
      await PushNotifications.addListener('registration', async (token: Token) => {
        logger.log('✅ FCM Token received:', token.value)
        await this.saveFCMToken(userId, organizationId, token.value)
      })

      // Listen for registration errors
      await PushNotifications.addListener('registrationError', (error: any) => {
        logger.error('❌ FCM Registration error:', error)
      })

      // Handle incoming notifications when app is in foreground
      await PushNotifications.addListener('pushNotificationReceived', (notification: any) => {
        logger.log('📬 Push notification received (foreground):', notification)
        // You can show a custom in-app notification here if desired
      })

      // Handle notification tap (when app is in background)
      await PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
        logger.log('🔔 Push notification tapped:', action)
        
        // Handle navigation based on notification data
        const data = action.notification.data
        if (data?.type === 'service_booking') {
          // Navigate to service bookings page
          window.location.href = '/dashboard/service-booking'
        }
      })

      this.isInitialized = true
      logger.log('✅ Push notifications initialized successfully')
    } catch (error) {
      logger.error('❌ Error initializing push notifications:', error)
      throw error
    }
  }

  /**
   * Save FCM token to Supabase for backend to send notifications
   */
  private async saveFCMToken(userId: string, organizationId: string, token: string): Promise<void> {
    try {
      // One settings/token row per user (unique on user_id). Upsert so a
      // re-registration just refreshes the token — mirrors setDoc({ merge: true }).
      const { error } = await supabase
        .from('notification_settings')
        .upsert(
          {
            user_id: userId,
            organization_id: organizationId,
            token,
            platform: 'android',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
      if (error) throw error

      logger.log('✅ FCM token saved to Supabase')
    } catch (error) {
      logger.error('❌ Error saving FCM token:', error)
      throw error
    }
  }

  /**
   * Cleanup listeners when user logs out
   */
  async cleanup(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return

    try {
      await PushNotifications.removeAllListeners()
      this.isInitialized = false
      logger.log('🧹 Push notification listeners cleaned up')
    } catch (error) {
      logger.error('❌ Error cleaning up push notifications:', error)
    }
  }
}

export const pushNotificationService = PushNotificationService.getInstance()