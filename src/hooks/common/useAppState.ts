// src/hooks/common/useAppState.ts
// FIXED: Camera / permission dialogs no longer collapse the app.
// - Removed window blur (fires on camera, keyboard, any OS overlay — useless)
// - visibilitychange "hidden" is debounced by 3 seconds
//   → Camera returns in <1s  →  timer cancelled  →  nothing happens
//   → Real backgrounding stays hidden 3s+  →  listeners pause as intended

'use client'

import { useEffect, useState, useRef } from 'react'
import { logger } from '@/lib/logger'

interface AppStateHook {
  isAppActive: boolean
  isAppInBackground: boolean
}

export function useAppState(): AppStateHook {
  const [isAppActive, setIsAppActive] = useState(true)
  const backgroundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor !== undefined

    logger.log('========================================')
    logger.log('🔥 useAppState INITIALIZING')
    logger.log('Is Capacitor:', isCapacitor)
    logger.log('========================================')

    if (isCapacitor) {
      // ── CAPACITOR NATIVE PATH ──────────────────────────────────────────────
      logger.log('📱 Loading @capacitor/app plugin...')

      let listenerHandle: any = null

      import('@capacitor/app')
        .then(({ App }) => {
          logger.log('✅ @capacitor/app loaded successfully!')
          logger.log('📱 Registering appStateChange listener...')

          App.addListener('appStateChange', ({ isActive }) => {
            logger.log('========================================')
            logger.log('📱 CAPACITOR APP STATE EVENT RECEIVED')
            logger.log(`isActive: ${isActive}`)
            logger.log(`Status: ${isActive ? 'ACTIVE ✅' : 'BACKGROUND 🔴'}`)
            logger.log('========================================')

            if (isActive) {
              // Cancel pending background timer — app came back quickly (camera, dialog, etc.)
              if (backgroundTimerRef.current) {
                clearTimeout(backgroundTimerRef.current)
                backgroundTimerRef.current = null
                logger.log('✅ Background timer cancelled — returned before threshold')
              }
              setIsAppActive(true)
              logger.log('✅✅✅ APP RETURNED TO FOREGROUND ✅✅✅')
            } else {
              // Wait 3s before treating as genuine background
              logger.log('⏳ App backgrounded — waiting 3s before pausing listeners...')
              backgroundTimerRef.current = setTimeout(() => {
                backgroundTimerRef.current = null
                logger.error('🛑🛑🛑 APP CONFIRMED IN BACKGROUND 🛑🛑🛑')
                logger.error('⏸️ All Firestore listeners should now PAUSE')
                setIsAppActive(false)
              }, 3000)
            }
          }).then(handle => {
            listenerHandle = handle
            logger.log('✅ appStateChange listener registered successfully!')
            logger.log('Listener handle:', listenerHandle)
          }).catch(err => {
            logger.error('❌ Failed to register listener:', err)
          })
        })
        .catch(error => {
          logger.error('❌ Failed to load @capacitor/app')
          logger.error('Error:', error)
          logger.log('📱 Falling back to Page Visibility API...')
          setupPageVisibilityListener()
        })

      return () => {
        if (backgroundTimerRef.current) {
          clearTimeout(backgroundTimerRef.current)
        }
        if (listenerHandle) {
          logger.log('🧹 Cleaning up Capacitor listener')
          listenerHandle.remove()
        }
      }

    } else {
      // ── WEB BROWSER PATH ───────────────────────────────────────────────────
      logger.log('🌐 Using Page Visibility API (Web mode)')
      return setupPageVisibilityListener()
    }

    function setupPageVisibilityListener() {
      if (typeof document === 'undefined') return

      logger.log('👁️ Setting up Page Visibility listener (debounced)')

      const handleVisibilityChange = () => {
        const isVisible = !document.hidden

        logger.log('========================================')
        logger.log('👁️ PAGE VISIBILITY CHANGED')
        logger.log(`Status: ${isVisible ? 'VISIBLE ✅' : 'HIDDEN 🔴'}`)
        logger.log('========================================')

        if (isVisible) {
          // Cancel any pending background timer — page came back quickly
          if (backgroundTimerRef.current) {
            clearTimeout(backgroundTimerRef.current)
            backgroundTimerRef.current = null
            logger.log('✅ Background timer cancelled — tab visible again')
          }
          setIsAppActive(true)
          logger.log('✅ Browser tab visible')
        } else {
          // Debounce: only act if hidden for 3+ seconds
          // Camera on mobile hides the page for ~300-800ms then restores it.
          // The home button / app switch keeps it hidden indefinitely.
          logger.log('⏳ Tab hidden — waiting 3s before pausing listeners...')
          backgroundTimerRef.current = setTimeout(() => {
            backgroundTimerRef.current = null
            logger.error('🛑 Browser tab confirmed hidden for 3s — pausing listeners')
            setIsAppActive(false)
          }, 3000)
        }
      }

      // NOTE: blur/focus deliberately removed.
      // window blur fires on: camera open, keyboard open, permission dialogs,
      // any OS-level overlay — far too noisy to be useful here.
      // visibilitychange with debounce is sufficient and correct.

      document.addEventListener('visibilitychange', handleVisibilityChange)

      return () => {
        logger.log('🧹 Cleaning up Page Visibility listeners')
        if (backgroundTimerRef.current) {
          clearTimeout(backgroundTimerRef.current)
        }
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
  }, [])

  return {
    isAppActive,
    isAppInBackground: !isAppActive
  }
}