// src/components/PWAInstallPrompt.tsx - Updated with fixed install button removed
'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { X, Download, Smartphone, Monitor } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
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

  return (
    <>
      {/* Main Install Prompt */}
      {showInstallPrompt && deferredPrompt && (
        <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-md">
          <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-800 rounded-lg flex items-center justify-center">
                    <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-gray-900 dark:text-white">
                    Install Yardao
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                    Get quick access and work offline. Install our app for the best fleet management experience!
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <Button
                      onClick={handleInstallClick}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5"
                    >
                      <Download className="w-3 h-3 mr-1.5" />
                      Install
                    </Button>
                    <Button
                      onClick={handleDismiss}
                      variant="ghost"
                      size="sm"
                      className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 text-xs px-2 py-1.5"
                    >
                      Not now
                    </Button>
                  </div>
                </div>
                <Button
                  onClick={handleDismiss}
                  variant="ghost"
                  size="sm"
                  className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* iOS Install Instructions */}
      {showInstallPrompt && isIOS && (
        <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-md">
          <Card className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                    <Smartphone className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm text-gray-900 dark:text-white">
                    Install Yardao
                  </h3>
                  <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                    <p>Tap the share button below and then "Add to Home Screen"</p>
                    <div className="mt-2 text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded">
                      1. Tap <span className="font-mono">□</span> Share button<br/>
                      2. Scroll and tap "Add to Home Screen"<br/>
                      3. Tap "Add" to confirm
                    </div>
                  </div>
                </div>
                <Button
                  onClick={handleDismiss}
                  variant="ghost"
                  size="sm"
                  className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* REMOVED: Development/Fallback Manual Install Button - this was the persistent button */}
      {/* 
      {showManualInstallButton && (
        <div className="fixed bottom-20 right-4 z-40">
          <Button
            onClick={deferredPrompt ? handleInstallClick : () => setShowInstallPrompt(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
            size="sm"
          >
            <Download className="w-4 h-4 mr-2" />
            Install Yardao
          </Button>
        </div>
      )}
      */}
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