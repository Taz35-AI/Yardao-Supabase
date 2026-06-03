// src/contexts/AuthContext.tsx - Fixed logout redirect handling
'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { 
  User,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  UserCredential
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { userProfileService } from '@/lib/firestore'
import { PushNotifications } from '@capacitor/push-notifications'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Capacitor } from '@capacitor/core'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logger } from '@/lib/logger'

// Profile shape mirrors whatever userProfileService.getProfile returns,
// without needing to import the type name (robust to its location).
type Profile = Awaited<ReturnType<typeof userProfileService.getProfile>>

interface AuthContextType {
  user: User | null
  loading: boolean
  signUp: (email: string, password: string) => Promise<UserCredential>
  signIn: (email: string, password: string) => Promise<UserCredential>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  sendVerificationEmail: () => Promise<void>
  // 🪪 Shared user profile — fetched ONCE per auth change here (not per
  // navigation). ProtectedRoute consumes this instead of re-reading
  // userProfiles on every route. `profileLoading` is true only during the
  // initial fetch; background refreshes are silent.
  profile: Profile
  profileLoading: boolean
  profileError: boolean
  /** Force a fresh profile read (call after mutating role/active/settings). */
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState(false)

  // Silent re-fetch (no spinner flicker) — used by bounded refresh and
  // callable after a screen mutates role/active/settings.
  const refreshProfile = useCallback(async () => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    try {
      const p = await userProfileService.getProfile(uid)
      setProfile(p ?? null)
      setProfileError(false)
    } catch (err) {
      logger.error('AuthContext: profile refresh failed', err)
      // Keep the last good profile on a transient refresh failure.
    }
  }, [])

  // 🔥 NEW: Initialize FCM at app startup (before any authentication)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      logger.log('⚠️ [FCM] Not a native platform, skipping FCM initialization')
      return
    }

    logger.log('🔥 [FCM] Initializing push notifications at app startup...')
    
    const initializeFCM = async () => {
      try {
        // Check permission status
        const permResult = await PushNotifications.checkPermissions()
        logger.log(`📋 [FCM] Current permission: ${permResult.receive}`)

        // Request permission if needed
        if (permResult.receive === 'prompt' || permResult.receive === 'prompt-with-rationale') {
          logger.log('📋 [FCM] Requesting permission...')
          const requestResult = await PushNotifications.requestPermissions()
          logger.log(`✅ [FCM] Permission result: ${requestResult.receive}`)
          
          if (requestResult.receive !== 'granted') {
            logger.log('⚠️ [FCM] Permission denied')
            return
          }
        } else if (permResult.receive === 'denied') {
          logger.log('⚠️ [FCM] Permission previously denied')
          return
        }

        // Request local notification permission for foreground notifications
        try {
          const localPermResult = await LocalNotifications.requestPermissions()
          logger.log(`✅ [FCM] Local notification permission: ${localPermResult.display}`)
        } catch (localErr) {
          logger.log('⚠️ [FCM] Local notification permission request failed (non-critical):', localErr)
        }

        // Register for push notifications
        logger.log('📋 [FCM] Registering for push notifications...')
        await PushNotifications.register()

        // Listen for token registration
        PushNotifications.addListener('registration', async (token) => {
          logger.log('✅ [FCM] Token received:', token.value.substring(0, 30) + '...')
          
          // Store token in localStorage immediately (device-level storage)
          try {
            localStorage.setItem('fcm_token', token.value)
            localStorage.setItem('fcm_token_timestamp', Date.now().toString())
            logger.log('✅ [FCM] Token stored in localStorage')
          } catch (err) {
            logger.error('❌ [FCM] Failed to store token in localStorage:', err)
          }
        })

        // Listen for registration errors
        PushNotifications.addListener('registrationError', (error) => {
          logger.error('❌ [FCM] Registration error:', error)
        })

        // Handle foreground notifications (show local notification)
        PushNotifications.addListener('pushNotificationReceived', async (notification) => {
          logger.log('📬 [FCM] Notification received (foreground):', notification.title)
          
          try {
            await LocalNotifications.schedule({
              notifications: [{
                id: Date.now(),
                title: notification.title || 'Yardao Notification',
                body: notification.body || 'You have a new notification',
                extra: notification.data,
                schedule: undefined,
                channelId: 'yardao_notifications',
                smallIcon: 'ic_launcher',
                largeIcon: 'ic_launcher',
              }]
            })
            logger.log('✅ [FCM] Local notification displayed')
          } catch (err) {
            logger.error('❌ [FCM] Failed to show local notification:', err)
          }
        })

        // Handle notification taps (background/foreground)
        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          logger.log('👆 [FCM] Notification tapped:', action.notification.data)
          handleNotificationTap(action.notification.data)
        })

        // Handle local notification taps
        LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
          logger.log('👆 [FCM] Local notification tapped:', action.notification.extra)
          handleNotificationTap(action.notification.extra)
        })

        logger.log('✅ [FCM] Push notifications initialized successfully')
      } catch (error) {
        logger.error('❌ [FCM] Initialization failed:', error)
      }
    }

    initializeFCM()
  }, []) // Empty dependency - run once on mount

  // Handle notification navigation
  const handleNotificationTap = (data: any) => {
    if (!data) return
    
    logger.log('🚗 [FCM] Processing notification tap...')
    
    if (data.type === 'service_today' || data.type === 'service_created') {
      window.location.href = '/bookings'
    } else if (data.type === 'mot_expired' || data.type === 'mot_expiring') {
      window.location.href = '/fleet'
    }
  }

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user)
      setLoading(false)

      // 🔥 NEW: When user logs in, save FCM token to their profile
      if (user && Capacitor.isNativePlatform()) {
        try {
          const storedToken = localStorage.getItem('fcm_token')
          if (storedToken) {
            logger.log('💾 [FCM] Saving token to user profile...')
            const userRef = doc(db, 'userProfiles', user.uid)
            await updateDoc(userRef, {
              fcmToken: storedToken,
              updatedAt: new Date().toISOString()
            })
            logger.log('✅ [FCM] Token saved to user profile')
          }
        } catch (error) {
          logger.error('❌ [FCM] Failed to save token to user profile:', error)
        }
      }
    })

    return unsubscribe
  }, [])

  // Fetch the profile ONCE when the signed-in user changes. This replaces
  // ProtectedRoute's per-navigation getProfile read.
  useEffect(() => {
    let cancelled = false
    const uid = user?.uid
    if (!uid) {
      setProfile(null)
      setProfileLoading(false)
      setProfileError(false)
      return
    }
    setProfileLoading(true)
    setProfileError(false)

    // Cold reloads occasionally return null / throw on the very first
    // Firestore read before the client is warm. Retry ONCE before
    // declaring the profile missing — otherwise ProtectedRoute would log
    // the (actually signed-in) user straight back out to /login on
    // refresh. profileLoading stays true through the retry so the gate
    // shows its spinner instead of evicting.
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
    const load = async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const p = await userProfileService.getProfile(uid)
          if (cancelled) return
          if (p) {
            setProfile(p)
            setProfileError(false)
            setProfileLoading(false)
            return
          }
          if (attempt === 0) {
            await sleep(800)
            if (cancelled) return
            continue
          }
          // Still null after a retry → genuinely no profile.
          setProfile(null)
          setProfileLoading(false)
          return
        } catch (err) {
          if (cancelled) return
          if (attempt === 0) {
            await sleep(800)
            if (cancelled) return
            continue
          }
          logger.error('AuthContext: profile load failed (after retry)', err)
          setProfile(null)
          setProfileError(true)
          setProfileLoading(false)
          return
        }
      }
    }
    load()

    return () => {
      cancelled = true
    }
  }, [user?.uid])

  // Bounded re-validation so a mid-session deactivation/role change still
  // takes effect quickly WITHOUT a read on every navigation: silently
  // re-fetch when the tab regains visibility and on a 10-minute interval
  // (only while visible, so a backgrounded tab costs nothing).
  useEffect(() => {
    if (!user?.uid) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshProfile()
    }
    document.addEventListener('visibilitychange', onVisible)
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refreshProfile()
    }, 10 * 60 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(id)
    }
  }, [user?.uid, refreshProfile])

  const signUp = async (email: string, password: string): Promise<UserCredential> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    return userCredential
  }

  const signIn = async (email: string, password: string): Promise<UserCredential> => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    
    // Update last login timestamp after successful login
    if (userCredential.user) {
      try {
        await userProfileService.updateLastLogin(userCredential.user.uid)
        
        // 🔥 NEW: Save FCM token to user profile on login
        if (Capacitor.isNativePlatform()) {
          const storedToken = localStorage.getItem('fcm_token')
          if (storedToken) {
            const userRef = doc(db, 'userProfiles', userCredential.user.uid)
            await updateDoc(userRef, {
              fcmToken: storedToken,
              updatedAt: new Date().toISOString()
            })
          }
        }
      } catch (error) {
        logger.error('Failed to update last login timestamp:', error)
        // Don't throw error to avoid breaking the login flow
      }
    }
    
    return userCredential
  }

  const logout = async () => {
    try {
      // Clear any local state first
      setUser(null)
      
      // 🔥 NOTE: We keep the FCM token in localStorage so notifications still work after logout
      // The token stays on the device, just not linked to the user profile
      
      // Then sign out from Firebase
      await signOut(auth)
      
      // Force redirect to login page using window.location for reliability
      // This ensures complete page refresh and clears any cached state
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      }
    } catch (error) {
      logger.error('Logout error:', error)
      // Even on error, force redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      }
    }
  }

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email)
  }

  const sendVerificationEmail = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser)
    }
  }

  const value = {
    user,
    loading,
    signUp,
    signIn,
    logout,
    resetPassword,
    sendVerificationEmail,
    profile,
    profileLoading,
    profileError,
    refreshProfile,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}