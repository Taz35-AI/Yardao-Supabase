// src/components/admin/DataCleanupButton.tsx
// Component to trigger data cleanup - add this to your Settings page

'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { cleanupAllVehicleData } from '@/utils/cleanupExistingData'
import { Sparkles, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { logger } from '@/lib/logger'

export function DataCleanupButton() {
  const { user } = useAuth()
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleCleanup = async () => {
    if (!user) {
      setError('You must be logged in to run cleanup')
      return
    }

    const confirmed = window.confirm(
      '⚠️ Data Cleanup Warning\n\n' +
      'This will clean all vehicle make and model data by:\n' +
      '• Removing extra spaces\n' +
      '• Removing tabs and special characters\n' +
      '• Fixing formatting issues\n\n' +
      'This action will modify your database directly.\n\n' +
      'Do you want to proceed?'
    )

    if (!confirmed) return

    setIsRunning(true)
    setError(null)
    setResult(null)

    try {
      // Get user's organization
      const userProfile = await userProfileService.getProfile(user.uid)
      if (!userProfile?.organizationId) {
        throw new Error('No organization found for user')
      }

      logger.log('🧹 Starting data cleanup for organization:', userProfile.organizationId)

      // Run the cleanup
      const cleanupResult = await cleanupAllVehicleData(userProfile.organizationId)
      
      setResult(cleanupResult)
      
      // Show success message
      if (cleanupResult.summary.totalUpdated > 0) {
        alert(
          `✅ Cleanup Successful!\n\n` +
          `Processed: ${cleanupResult.summary.totalProcessed} vehicles\n` +
          `Updated: ${cleanupResult.summary.totalUpdated} vehicles\n` +
          `${cleanupResult.summary.duplicatesFound.length > 0 ? 
            `\n⚠️ Potential duplicates found:\n${cleanupResult.summary.duplicatesFound.join('\n')}` : 
            ''
          }\n\n` +
          `Please refresh the page to see the changes.`
        )
      } else {
        alert('✅ No vehicles needed cleaning. Your data is already clean!')
      }
      
    } catch (err) {
      logger.error('❌ Cleanup failed:', err)
      setError(err instanceof Error ? err.message : 'Cleanup failed')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <Sparkles className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Clean Vehicle Data
          </h3>
          
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Fix duplicate "Kia Sportage" and other vehicle entries by cleaning make/model data.
            This removes extra spaces, tabs, and formatting issues from all vehicles.
          </p>

          {/* Status Messages */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  Cleanup Failed
                </p>
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            </div>
          )}

          {result && !error && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">
                    Cleanup Complete
                  </p>
                  <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
                    <p>• Fleet: {result.fleet.totalUpdated}/{result.fleet.totalProcessed} updated</p>
                    <p>• Yard: {result.yard.totalUpdated}/{result.yard.totalProcessed} updated</p>
                    {result.summary.duplicatesFound.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-green-300 dark:border-green-700">
                        <p className="font-medium mb-1">Potential duplicates found:</p>
                        {result.summary.duplicatesFound.map((dup: string, i: number) => (
                          <p key={i} className="ml-2">- {dup}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Button */}
          <Button
            onClick={handleCleanup}
            disabled={isRunning}
            className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running Cleanup...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Run Data Cleanup
              </>
            )}
          </Button>

          {result && (
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              className="ml-3"
            >
              Refresh Page
            </Button>
          )}
        </div>
      </div>

      {/* Additional Info */}
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <p className="font-medium mb-2">What this does:</p>
          <p>• Removes extra spaces between and around words</p>
          <p>• Removes tabs, newlines, and special characters</p>
          <p>• Fixes "Kia Sportage" vs "Kia  Sportage" duplicates</p>
          <p>• Cleans both Fleet and Yard (checked-in) vehicles</p>
          <p>• Updates all records in real-time</p>
        </div>
      </div>
    </div>
  )
}