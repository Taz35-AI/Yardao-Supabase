// src/components/PWAInstallPrompt.tsx - Updated with fixed install button removed
'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { X, Download, Share } from 'lucide-react'
import { logger } from '@/lib/logger'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
  }
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isInStandaloneMode, setIsInStandaloneMode] = useState(false)
  const [userDismissed, setUserDismissed] = useState(false)

  // Check if user has previously dismissed the prompt
  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-install-dismissed')
    const dismissedTime = localStorage.getItem('pwa-install-dismissed-time')
    
    if (dismissed === 'true' && dismissedTime) {
      const dismissTime = new Date(dismissedTime).getTime()
      const currentTime = new Date().getTime()
      const hoursSinceDismiss = (currentTime - dismissTime) / (1000 * 60 * 60)
      
      // Show again after 24 hours
      if (hoursSinceDismiss < 24) {
        setUserDismissed(true)
      } else {
        // Reset dismissal after 24 hours
        localStorage.removeItem('pwa-install-dismissed')
        localStorage.removeItem('pwa-install-dismissed-time')
      }
    }
  }, [])

  // Detect platform and installation state
  useEffect(() => {
    // Check if iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOS(iOS)

    // Check if already in standalone mode
    const standalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone ||
      document.referrer.includes('android-app://')
    
    setIsInStandaloneMode(standalone)

    // Check if already installed (for Chrome/Edge)
    const checkInstalled = () => {
      if ('getInstalledRelatedApps' in navigator) {
        ;(navigator as any).getInstalledRelatedApps().then((relatedApps: any[]) => {
          setIsInstalled(relatedApps.length > 0)
        })
      }
    }

    checkInstalled()
  }, [])

  // Handle beforeinstallprompt event
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      logger.log('beforeinstallprompt fired')
      e.preventDefault()
      setDeferredPrompt(e)
      
      // Only show if user hasn't dismissed recently and not already installed
      if (!userDismissed && !isInstalled && !isInStandaloneMode) {
        // Delay showing the prompt to improve user experience
        setTimeout(() => {
          setShowInstallPrompt(true)
        }, 5000) // Show after 5 seconds
      }
    }

    const handleAppInstalled = () => {
      logger.log('PWA was installed')
      setIsInstalled(true)
      setShowInstallPrompt(false)
      setDeferredPrompt(null)
      
      // Clear dismissal flags
      localStorage.removeItem('pwa-install-dismissed')
      localStorage.removeItem('pwa-install-dismissed-time')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [userDismissed, isInstalled, isInStandaloneMode])

  // iOS Safari never fires beforeinstallprompt, so surface the "Add to Home
  // Screen" hint ourselves (when not already installed / not dismissed).
  useEffect(() => {
    if (!isIOS || isInStandaloneMode || isInstalled || userDismissed) return
    const t = setTimeout(() => setShowInstallPrompt(true), 5000)
    return () => clearTimeout(t)
  }, [isIOS, isInStandaloneMode, isInstalled, userDismissed])

  const handleInstallClick = useCallback(async () => {
    if (!deferredPrompt) {
      logger.log('No deferred prompt available')
      return
    }

    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      
      logger.log(`User ${outcome} the install prompt`)
      
      if (outcome === 'accepted') {
        setIsInstalled(true)
      } else {
        // User dismissed, store timestamp
        localStorage.setItem('pwa-install-dismissed', 'true')
        localStorage.setItem('pwa-install-dismissed-time', new Date().toISOString())
        setUserDismissed(true)
      }
      
      setShowInstallPrompt(false)
      setDeferredPrompt(null)
    } catch (error) {
      logger.error('Error during PWA installation:', error)
    }
  }, [deferredPrompt])

  const handleDismiss = useCallback(() => {
    setShowInstallPrompt(false)
    localStorage.setItem('pwa-install-dismissed', 'true')
    localStorage.setItem('pwa-install-dismissed-time', new Date().toISOString())
    setUserDismissed(true)
  }, [])

  // REMOVED: Manual install button logic - this was causing the persistent button
  // const showManualInstallButton = process.env.NODE_ENV === 'development' || 
  //   (!isInstalled && !isInStandaloneMode && (isIOS || deferredPrompt))

  // Don't show anything if already installed or in standalone mode
  if (isInstalled || isInStandaloneMode) {
    return null
  }

  // Shared: a big, obvious close button (≥44px tap target) so it's easy to dismiss.
  const CloseButton = (
    <button
      onClick={handleDismiss}
      aria-label="Dismiss"
      className="absolute top-2 right-2 p-2.5 rounded-full text-gray-400 hover:text-gray-700 dark:text-[#72A68E] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#025940]/40 transition-colors"
    >
      <X className="w-5 h-5" />
    </button>
  )

  return (
    <>
      {/* Install prompt (Android / Chromium) — branded, bottom-anchored, above
          the daily banner, clear of the safe-area + easy to dismiss. */}
      {showInstallPrompt && deferredPrompt && !isIOS && (
        <div
          className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-md"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="relative bg-white dark:bg-[#012619] rounded-2xl shadow-2xl border border-[#72A68E]/30 dark:border-[#025940] p-4">
            {CloseButton}
            <div className="flex items-start gap-3 pr-8">
              <img src="/web-app-manifest-192x192.png" alt="Yardao" className="w-11 h-11 rounded-xl flex-shrink-0 shadow-sm" />
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-[#012619] dark:text-white">Install Yardao</h3>
                <p className="text-xs text-gray-600 dark:text-[#C5D9D0] mt-0.5 leading-relaxed">
                  Quick access from your home screen — works offline.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleInstallClick}
                className="flex-1 inline-flex items-center justify-center gap-1.5 bg-[#025940] hover:bg-[#012619] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                <Download className="w-4 h-4" /> Install
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2.5 text-sm font-medium text-gray-500 dark:text-[#72A68E] hover:bg-gray-100 dark:hover:bg-[#025940]/30 rounded-xl transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS "Add to Home Screen" hint — branded (iOS can't auto-install). */}
      {showInstallPrompt && isIOS && (
        <div
          className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-md"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="relative bg-white dark:bg-[#012619] rounded-2xl shadow-2xl border border-[#72A68E]/30 dark:border-[#025940] p-4">
            {CloseButton}
            <div className="flex items-start gap-3 pr-8">
              <img src="/web-app-manifest-192x192.png" alt="Yardao" className="w-11 h-11 rounded-xl flex-shrink-0 shadow-sm" />
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-[#012619] dark:text-white">Add Yardao to your Home Screen</h3>
                <p className="text-xs text-gray-600 dark:text-[#C5D9D0] mt-1 leading-relaxed">
                  Tap the <Share className="inline w-3.5 h-3.5 -mt-0.5" /> <span className="font-semibold">Share</span> icon, then <span className="font-semibold">“Add to Home Screen”</span>.
                </p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="mt-3 w-full py-2.5 text-sm font-semibold text-[#025940] dark:text-[#72A68E] bg-[#025940]/10 dark:bg-[#025940]/20 hover:bg-[#025940]/20 rounded-xl transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// Helper hook for other components to check PWA status
export function usePWAStatus() {
  const [isInstalled, setIsInstalled] = useState(false)
  const [isInStandaloneMode, setIsInStandaloneMode] = useState(false)
  const [canInstall, setCanInstall] = useState(false)

  useEffect(() => {
    const checkPWAStatus = () => {
      // Check if in standalone mode
      const standalone = 
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone ||
        document.referrer.includes('android-app://')
      
      setIsInStandaloneMode(standalone)

      // Check if can install (has beforeinstallprompt been fired)
      const handleBeforeInstallPrompt = () => {
        setCanInstall(true)
      }

      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      
      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      }
    }

    checkPWAStatus()
  }, [])

  return { isInstalled, isInStandaloneMode, canInstall }
}