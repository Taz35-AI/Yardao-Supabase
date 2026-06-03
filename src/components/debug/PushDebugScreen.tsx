// src/components/debug/PushDebugScreen.tsx
// Temporary debug component to verify push notification setup
// Remove this file once push notifications are working

'use client'

import { useState, useEffect } from 'react'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useAuth } from '@/contexts/AuthContext'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logger } from '@/lib/logger'

export function PushDebugScreen() {
  const { fcmToken, permissionStatus, isSupported, requestPermissions } = usePushNotifications()
  const { user } = useAuth()
  const [firestoreToken, setFirestoreToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  // Fetch token from Firestore to verify it was saved
  useEffect(() => {
    if (!user) return

    const fetchFirestoreToken = async () => {
      try {
        const userRef = doc(db, 'userProfiles', user.uid)
        const userDoc = await getDoc(userRef)
        
        if (userDoc.exists()) {
          const data = userDoc.data()
          setFirestoreToken(data.fcmToken || null)
        }
      } catch (error) {
        logger.error('Error fetching Firestore token:', error)
      }
    }

    fetchFirestoreToken()
  }, [user, fcmToken]) // Re-fetch when fcmToken changes

  const handleCopyToken = () => {
    if (fcmToken) {
      navigator.clipboard.writeText(fcmToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleRequestPermission = async () => {
    setLoading(true)
    await requestPermissions()
    setLoading(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'granted':
        return 'text-green-600 dark:text-green-400'
      case 'denied':
        return 'text-red-600 dark:text-red-400'
      default:
        return 'text-yellow-600 dark:text-yellow-400'
    }
  }

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case 'granted':
        return '✅'
      case 'denied':
        return '❌'
      default:
        return '⚠️'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 space-y-6">
          
          {/* Header */}
          <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              🔥 Push Notification Debug
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Verify your FCM token and notification setup
            </p>
          </div>

          {/* Platform Check */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Platform
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {isSupported ? 'Native (Android/iOS)' : 'Web Browser'}
                </p>
              </div>
              <div className="text-2xl">
                {isSupported ? '📱' : '🌐'}
              </div>
            </div>
          </div>

          {/* User Status */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
              User Status
            </p>
            {user ? (
              <div className="space-y-1">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  ✅ Logged in as: <span className="font-mono">{user.email}</span>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  UID: <span className="font-mono">{user.uid}</span>
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                ❌ Not logged in
              </p>
            )}
          </div>

          {/* Permission Status */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Permission Status
              </p>
              <span className="text-2xl">{getStatusEmoji(permissionStatus)}</span>
            </div>
            <p className={`text-lg font-semibold ${getStatusColor(permissionStatus)}`}>
              {permissionStatus.toUpperCase()}
            </p>
            
            {permissionStatus !== 'granted' && isSupported && (
              <button
                onClick={handleRequestPermission}
                disabled={loading}
                className="mt-3 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Requesting...' : 'Request Permission'}
              </button>
            )}

            {permissionStatus === 'denied' && (
              <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-xs text-red-600 dark:text-red-400">
                  <strong>Permission Denied!</strong><br />
                  To fix: Uninstall app → Reinstall → Grant permission when prompted
                </p>
              </div>
            )}
          </div>

          {/* FCM Token (Local) */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
              FCM Token (Local State)
            </p>
            {fcmToken ? (
              <div className="space-y-2">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded p-3 font-mono text-xs break-all">
                  {fcmToken}
                </div>
                <button
                  onClick={handleCopyToken}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                >
                  {copied ? '✅ Copied!' : '📋 Copy Token'}
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No token available yet
              </p>
            )}
          </div>

          {/* Firestore Token */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
              FCM Token (Saved in Firestore)
            </p>
            {!user ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Log in to check Firestore token
              </p>
            ) : firestoreToken ? (
              <div className="space-y-2">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded p-3 font-mono text-xs break-all">
                  {firestoreToken}
                </div>
                {fcmToken === firestoreToken ? (
                  <p className="text-sm text-green-600 dark:text-green-400">
                    ✅ Tokens match! Everything is synced.
                  </p>
                ) : (
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    ⚠️ Tokens don't match. Token may still be saving...
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-red-500 dark:text-red-400">
                ❌ No token saved in Firestore yet
              </p>
            )}
          </div>

          {/* Status Summary */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-3">
              System Status
            </p>
            <div className="space-y-2">
              <StatusItem
                label="Native Platform"
                value={isSupported}
                requirement="Required for push notifications"
              />
              <StatusItem
                label="User Logged In"
                value={!!user}
                requirement="Required to save token"
              />
              <StatusItem
                label="Permission Granted"
                value={permissionStatus === 'granted'}
                requirement="Required to receive notifications"
              />
              <StatusItem
                label="Token Generated"
                value={!!fcmToken}
                requirement="Required to send notifications"
              />
              <StatusItem
                label="Token Saved to Firestore"
                value={!!firestoreToken}
                requirement="Required for Cloud Functions"
              />
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
              📝 Testing Instructions
            </p>
            <ol className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1 list-decimal list-inside">
              <li>Ensure all status items above show green checkmarks</li>
              <li>Copy your FCM token using the button above</li>
              <li>Go to Firebase Console → Cloud Messaging</li>
              <li>Click "Send your first message"</li>
              <li>Paste your token and send test notification</li>
              <li>Check if notification appears on your device</li>
            </ol>
          </div>

        </div>
      </div>
    </div>
  )
}

// Helper component for status items
function StatusItem({
  label,
  value,
  requirement
}: {
  label: string
  value: boolean
  requirement: string
}) {
  return (
    <div className="flex items-start space-x-3">
      <div className="flex-shrink-0 mt-0.5">
        {value ? (
          <span className="text-green-500 text-lg">✅</span>
        ) : (
          <span className="text-red-500 text-lg">❌</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          {label}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {requirement}
        </p>
      </div>
    </div>
  )
}