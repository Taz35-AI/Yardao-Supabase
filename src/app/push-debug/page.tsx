// src/app/push-debug/page.tsx
// Debug page for testing push notifications
// Navigate to /push-debug to use this page

'use client'

import { useState, useEffect } from 'react'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useAuth } from '@/contexts/AuthContext'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import ProtectedRoute from '@/components/ProtectedRoute'
import { logger } from '@/lib/logger'

export default function PushDebugPage() {
  const { fcmToken, permissionStatus, isSupported, requestPermissions, listChannels } = usePushNotifications()
  const { user } = useAuth()
  const [firestoreToken, setFirestoreToken] = useState<string | null>(null)
  const [channels, setChannels] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showChannels, setShowChannels] = useState(false)

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

  const handleListChannels = async () => {
    const channelList = await listChannels()
    setChannels(channelList)
    setShowChannels(true)
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
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-slate-800">
        
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              🔥 Push Notification Debug
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Verify your FCM token and notification setup
            </p>
          </div>

          <div className="space-y-6">
            {/* Platform Check */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                    Platform
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400">
                    {isSupported ? '📱 Native (Android/iOS)' : '🌐 Web Browser'}
                  </p>
                </div>
                <div className="text-4xl">
                  {isSupported ? '📱' : '🌐'}
                </div>
              </div>
              {!isSupported && (
                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    ⚠️ Push notifications only work on native mobile platforms. Please test on a real Android or iOS device.
                  </p>
                </div>
              )}
            </div>

            {/* User Status */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                User Status
              </h2>
              {user ? (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-green-500 text-xl">✅</span>
                    <span className="text-gray-900 dark:text-white font-medium">Logged In</span>
                  </div>
                  <div className="ml-7 space-y-1">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      <span className="font-medium">Email:</span> {user.email}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 font-mono">
                      UID: {user.uid}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <span className="text-red-500 text-xl">❌</span>
                  <span className="text-gray-600 dark:text-gray-400">Not logged in</span>
                </div>
              )}
            </div>

            {/* Permission Status */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Permission Status
                </h2>
                <span className="text-3xl">{getStatusEmoji(permissionStatus)}</span>
              </div>
              
              <p className={`text-2xl font-bold mb-4 ${getStatusColor(permissionStatus)}`}>
                {permissionStatus.toUpperCase()}
              </p>
              
              {permissionStatus !== 'granted' && isSupported && (
                <button
                  onClick={handleRequestPermission}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {loading ? 'Requesting...' : 'Request Permission'}
                </button>
              )}

              {permissionStatus === 'denied' && (
                <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-2">
                    Permission Denied!
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400 mb-3">
                    To fix this, you need to:
                  </p>
                  <ol className="text-xs text-red-600 dark:text-red-400 space-y-1 list-decimal list-inside">
                    <li>Uninstall the Yardao app completely</li>
                    <li>Reinstall the app</li>
                    <li>Grant permission when prompted</li>
                  </ol>
                  <p className="text-xs text-red-500 dark:text-red-500 mt-3 italic">
                    Or enable manually: Settings → Apps → Yardao → Notifications → Enable
                  </p>
                </div>
              )}
            </div>

            {/* FCM Token (Local) */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                FCM Token (Local State)
              </h2>
              {fcmToken ? (
                <div className="space-y-3">
                  <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                    <p className="font-mono text-xs break-all text-gray-700 dark:text-gray-300">
                      {fcmToken}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>Length: {fcmToken.length} characters</span>
                    <span>Valid: {fcmToken.length > 100 ? '✅' : '❌'}</span>
                  </div>
                  <button
                    onClick={handleCopyToken}
                    className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    {copied ? '✅ Copied!' : '📋 Copy Token'}
                  </button>
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                  No token available yet. Grant permission to generate token.
                </p>
              )}
            </div>

            {/* Firestore Token */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                FCM Token (Saved in Firestore)
              </h2>
              {!user ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                  Log in to check Firestore token
                </p>
              ) : firestoreToken ? (
                <div className="space-y-3">
                  <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                    <p className="font-mono text-xs break-all text-gray-700 dark:text-gray-300">
                      {firestoreToken}
                    </p>
                  </div>
                  {fcmToken === firestoreToken ? (
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                        ✅ Tokens match! Everything is synced correctly.
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <p className="text-sm text-yellow-600 dark:text-yellow-400">
                        ⚠️ Tokens don't match. Token may still be saving...
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">
                    ❌ No token saved in Firestore yet
                  </p>
                </div>
              )}
            </div>

            {/* Notification Channels (Android) */}
            {isSupported && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  Notification Channels (Android)
                </h2>
                <button
                  onClick={handleListChannels}
                  className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium mb-3"
                >
                  🔔 List Channels
                </button>
                
                {showChannels && (
                  <div className="space-y-2">
                    {channels.length > 0 ? (
                      channels.map((channel, index) => (
                        <div
                          key={index}
                          className="p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg"
                        >
                          <p className="font-mono text-sm text-gray-900 dark:text-white mb-1">
                            {channel.id}
                          </p>
                          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                            <span>{channel.name}</span>
                            <span className={channel.id === 'yardao_notifications' ? 'text-green-600 dark:text-green-400 font-medium' : ''}>
                              {channel.id === 'yardao_notifications' && '✅ Correct'}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
                        No channels found
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Status Summary */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                System Status
              </h2>
              <div className="space-y-3">
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
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl shadow-lg p-6">
              <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center">
                <span className="mr-2">📝</span>
                Testing Instructions
              </h2>
              <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-2 list-decimal list-inside">
                <li>Ensure all status items above show green checkmarks ✅</li>
                <li>Copy your FCM token using the "Copy Token" button</li>
                <li>Go to <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">Firebase Console</a> → Cloud Messaging</li>
                <li>Click "Send your first message"</li>
                <li>Enter title and body, then paste your token</li>
                <li>Click "Test" and check if notification appears on your device</li>
              </ol>
              
              <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-700">
                <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-2">
                  Expected Channel ID:
                </p>
                <code className="text-xs bg-white dark:bg-gray-900 px-2 py-1 rounded border border-blue-200 dark:border-blue-700">
                  yardao_notifications
                </code>
              </div>
            </div>

            {/* Troubleshooting */}
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl shadow-lg p-6">
              <h2 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-3 flex items-center">
                <span className="mr-2">🔧</span>
                Common Issues
              </h2>
              <div className="space-y-3 text-sm">
                <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-700">
                  <p className="font-medium text-red-900 dark:text-red-100 mb-1">
                    No permission dialog appears
                  </p>
                  <p className="text-red-700 dark:text-red-300 text-xs">
                    Fix: Uninstall app completely, then reinstall
                  </p>
                </div>
                
                <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-700">
                  <p className="font-medium text-red-900 dark:text-red-100 mb-1">
                    Token received but not in Firestore
                  </p>
                  <p className="text-red-700 dark:text-red-300 text-xs">
                    Fix: Check Firestore rules allow write to userProfiles
                  </p>
                </div>
                
                <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-700">
                  <p className="font-medium text-red-900 dark:text-red-100 mb-1">
                    Notifications not appearing
                  </p>
                  <p className="text-red-700 dark:text-red-300 text-xs">
                    Fix: Settings → Apps → Yardao → Battery → Unrestricted
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </ProtectedRoute>
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
    <div className="flex items-start space-x-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
      <div className="flex-shrink-0 mt-0.5">
        {value ? (
          <span className="text-green-500 text-xl">✅</span>
        ) : (
          <span className="text-red-500 text-xl">❌</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          {label}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {requirement}
        </p>
      </div>
    </div>
  )
}