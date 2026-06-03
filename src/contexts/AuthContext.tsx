// src/contexts/AuthContext.tsx — SUPABASE auth (drop-in replacement).
// Public contract (useAuth) is unchanged: { user, loading, signUp, signIn,
// logout, resetPassword, sendVerificationEmail, profile, profileLoading,
// profileError, refreshProfile }. `user` is a Firebase-User-compatible shape
// (uid/email/emailVerified/displayName) so consumers like
// `const user = (await signIn(...)).user; user.uid` keep working unchanged.
'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import type { Session, User as SupabaseUser } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import { userProfileService } from '@/lib/firestore'
import { PushNotifications } from '@capacitor/push-notifications'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Capacitor } from '@capacitor/core'
import { logger } from '@/lib/logger'

// Firebase-User-compatible projection of a Supabase user.
export interface AppUser {
  uid: string
  id: string
  email: string | null
  emailVerified: boolean
  displayName: string | null
}

export interface AppUserCredential {
  user: AppUser
}

const mapUser = (u: SupabaseUser | null | undefined): AppUser | null => {
  if (!u) return null
  return {
    uid: u.id,
    id: u.id,
    email: u.email ?? null,
    emailVerified: !!(u.email_confirmed_at || (u as any).confirmed_at),
    displayName: (u.user_metadata?.displayName as string) ?? (u.user_metadata?.display_name as string) ?? null,
  }
}

type Profile = Awaited<ReturnType<typeof userProfileService.getProfile>>

interface AuthContextType {
  user: AppUser | null
  loading: boolean
  signUp: (email: string, password: string) => Promise<AppUserCredential>
  signIn: (email: string, password: string) => Promise<AppUserCredential>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  sendVerificationEmail: () => Promise<void>
  profile: Profile
  profileLoading: boolean
  profileError: boolean
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
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState(false)
  const uidRef = useRef<string | null>(null)

  // Persist the FCM token onto the signed-in user's profile.
  const saveFcmToken = async (uid: string) => {
    try {
      const storedToken = localStorage.getItem('fcm_token')
      if (storedToken) {
        await supabase.from('profiles').update({ fcm_token: storedToken }).eq('id', uid)
        logger.log('✅ [FCM] Token saved to user profile')
      }
    } catch (error) {
      logger.error('❌ [FCM] Failed to save token to user profile:', error)
    }
  }

  // Silent re-fetch (no spinner flicker).
  const refreshProfile = useCallback(async () => {
    const uid = uidRef.current
    if (!uid) return
    try {
      const p = await userProfileService.getProfile(uid)
      setProfile(p ?? null)
      setProfileError(false)
    } catch (err) {
      logger.error('AuthContext: profile refresh failed', err)
    }
  }, [])

  // Initialize FCM at app startup (native only). Unchanged from the original.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      logger.log('⚠️ [FCM] Not a native platform, skipping FCM initialization')
      return
    }

    logger.log('🔥 [FCM] Initializing push notifications at app startup...')

    const initializeFCM = async () => {
      try {
        const permResult = await PushNotifications.checkPermissions()
        logger.log(`📋 [FCM] Current permission: ${permResult.receive}`)

        if (permResult.receive === 'prompt' || permResult.receive === 'prompt-with-rationale') {
          const requestResult = await PushNotifications.requestPermissions()
          if (requestResult.receive !== 'granted') {
            logger.log('⚠️ [FCM] Permission denied')
            return
          }
        } else if (permResult.receive === 'denied') {
          logger.log('⚠️ [FCM] Permission previously denied')
          return
        }

        try {
          await LocalNotifications.requestPermissions()
        } catch (localErr) {
          logger.log('⚠️ [FCM] Local notification permission request failed (non-critical):', localErr)
        }

        await PushNotifications.register()

        PushNotifications.addListener('registration', async (token) => {
          try {
            localStorage.setItem('fcm_token', token.value)
            localStorage.setItem('fcm_token_timestamp', Date.now().toString())
            logger.log('✅ [FCM] Token stored in localStorage')
          } catch (err) {
            logger.error('❌ [FCM] Failed to store token in localStorage:', err)
          }
        })

        PushNotifications.addListener('registrationError', (error) => {
          logger.error('❌ [FCM] Registration error:', error)
        })

        PushNotifications.addListener('pushNotificationReceived', async (notification) => {
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
          } catch (err) {
            logger.error('❌ [FCM] Failed to show local notification:', err)
          }
        })

        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          handleNotificationTap(action.notification.data)
        })

        LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
          handleNotificationTap(action.notification.extra)
        })

        logger.log('✅ [FCM] Push notifications initialized successfully')
      } catch (error) {
        logger.error('❌ [FCM] Initialization failed:', error)
      }
    }

    initializeFCM()
  }, [])

  const handleNotificationTap = (data: any) => {
    if (!data) return
    if (data.type === 'service_today' || data.type === 'service_created') {
      window.location.href = '/bookings'
    } else if (data.type === 'mot_expired' || data.type === 'mot_expiring') {
      window.location.href = '/fleet'
    }
  }

  // Subscribe to auth state. getSession() resolves the persisted session on
  // load; onAuthStateChange fires on sign-in/out and token refresh.
  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      const mapped = mapUser(session?.user)
      uidRef.current = mapped?.uid ?? null
      setUser(mapped)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event: string, session: Session | null) => {
        const mapped = mapUser(session?.user)
        uidRef.current = mapped?.uid ?? null
        setUser(mapped)
        setLoading(false)

        if (mapped && Capacitor.isNativePlatform()) {
          await saveFcmToken(mapped.uid)
        }
      }
    )

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  // Fetch the profile ONCE when the signed-in user changes (with a single
  // retry on a cold/transient miss, exactly as the original did).
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

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
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

  // Bounded re-validation: silently re-fetch on tab focus + every 10 min while
  // visible, so a mid-session role/active change takes effect without a read
  // on every navigation.
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

  const signUp = async (email: string, password: string): Promise<AppUserCredential> => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    return { user: mapUser(data.user) as AppUser }
  }

  const signIn = async (email: string, password: string): Promise<AppUserCredential> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const mapped = mapUser(data.user) as AppUser

    // Update last login + persist FCM token (non-fatal, mirrors original).
    if (mapped) {
      try {
        await userProfileService.updateLastLogin(mapped.uid)
        if (Capacitor.isNativePlatform()) await saveFcmToken(mapped.uid)
      } catch (error) {
        logger.error('Failed to update last login timestamp:', error)
      }
    }
    return { user: mapped }
  }

  const logout = async () => {
    try {
      setUser(null)
      uidRef.current = null
      await supabase.auth.signOut()
      if (typeof window !== 'undefined') window.location.href = '/login'
    } catch (error) {
      logger.error('Logout error:', error)
      if (typeof window !== 'undefined') window.location.href = '/login'
    }
  }

  const resetPassword = async (email: string) => {
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/reset-password-required` : undefined
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) throw error
  }

  const sendVerificationEmail = async () => {
    const email = user?.email
    if (!email) return
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    if (error) throw error
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
