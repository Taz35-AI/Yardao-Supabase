// src/app/offline/page.tsx - NEW OFFLINE PAGE
'use client'

import React, { useEffect, useState } from 'react'
import { appNavigate } from '@/lib/nav'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Home, 
  AlertCircle,
  Smartphone,
  Monitor
} from 'lucide-react'

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(true)
  const [isRetrying, setIsRetrying] = useState(false)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    setIsOnline(navigator.onLine)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleRetry = async () => {
    setIsRetrying(true)
    
    try {
      // Try to fetch a small resource to test connection
      await fetch('/manifest.webmanifest', { 
        method: 'HEAD',
        cache: 'no-cache'
      })
      
      // If successful, redirect to home
      appNavigate('/')
    } catch (error) {
      // Still offline, show error
      setTimeout(() => setIsRetrying(false), 1000)
    }
  }

  const goHome = () => {
    appNavigate('/')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Status Icon */}
        <div className="text-center">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${
            isOnline 
              ? 'bg-green-100 dark:bg-green-900/20' 
              : 'bg-red-100 dark:bg-red-900/20'
          }`}>
            {isOnline ? (
              <Wifi className="w-10 h-10 text-green-600 dark:text-green-400" />
            ) : (
              <WifiOff className="w-10 h-10 text-red-600 dark:text-red-400" />
            )}
          </div>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              {isOnline ? (
                <>
                  <Wifi className="w-5 h-5 text-green-600" />
                  Connection Restored
                </>
              ) : (
                <>
                  <WifiOff className="w-5 h-5 text-red-600" />
                  You're Offline
                </>
              )}
            </CardTitle>
            <CardDescription>
              {isOnline 
                ? "Your internet connection has been restored. You can now access all features."
                : "No internet connection detected. Some features may be limited."
              }
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {isOnline ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Connection restored! You can now sync your data.</span>
                </div>
                <Button 
                  onClick={goHome} 
                  className="w-full"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Return to Dashboard
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Offline Features */}
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h3 className="font-semibold text-sm text-blue-800 dark:text-blue-200 mb-2">
                    Available Offline:
                  </h3>
                  <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                    <li>• View cached vehicle data</li>
                    <li>• Access previous fleet reports</li>
                    <li>• Browse saved documents</li>
                    <li>• Use basic calculator tools</li>
                  </ul>
                </div>

                {/* Limited Features */}
                <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg">
                  <h3 className="font-semibold text-sm text-amber-800 dark:text-amber-200 mb-2">
                    Requires Connection:
                  </h3>
                  <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
                    <li>• Real-time data sync</li>
                    <li>• New vehicle check-ins</li>
                    <li>• Export functions</li>
                    <li>• User authentication</li>
                  </ul>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2">
                  <Button 
                    onClick={handleRetry} 
                    disabled={isRetrying}
                    className="w-full"
                    variant={isRetrying ? "secondary" : "default"}
                  >
                    {isRetrying ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    {isRetrying ? 'Checking Connection...' : 'Try Again'}
                  </Button>
                  
                  <Button 
                    onClick={goHome} 
                    variant="outline"
                    className="w-full"
                  >
                    <Home className="w-4 h-4 mr-2" />
                    Continue Offline
                  </Button>
                </div>
              </div>
            )}

            {/* Tips */}
            <div className="border-t pt-4 mt-4">
              <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100 mb-2">
                Connection Tips:
              </h4>
              <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                <li>• Check your WiFi or mobile data</li>
                <li>• Try moving to a different location</li>
                <li>• Restart your router if using WiFi</li>
                <li>• Contact IT support if issues persist</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* App Info */}
        <div className="text-center text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center justify-center gap-4">
            <span className="flex items-center gap-1">
              <Smartphone className="w-3 h-3" />
              PWA Enabled
            </span>
            <span className="flex items-center gap-1">
              <Monitor className="w-3 h-3" />
              Offline Ready
            </span>
          </div>
          <p className="mt-2">YARD - STATUS v1.0.0</p>
        </div>
      </div>
    </div>
  )
}