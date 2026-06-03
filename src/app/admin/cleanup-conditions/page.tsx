// src/app/admin/cleanup-conditions/page.tsx
// COMPLETE CLEANUP PAGE - Just navigate to /admin/cleanup-conditions

'use client'

import React, { useState, useEffect } from 'react'
import { Trash2, AlertTriangle, CheckCircle, ArrowLeft, Database } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { collection, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useRouter } from 'next/navigation'

interface CleanupResult {
  success: boolean
  totalRecords?: number
  uniqueConditions?: number
  duplicatesRemoved?: number
  finalCount?: number
  error?: string
  details?: Array<{
    name: string
    duplicateCount: number
    kept: string
    deleted: string[]
  }>
}

export default function CleanupConditionsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<CleanupResult | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [preview, setPreview] = useState<CleanupResult | null>(null)

  // Load organization ID
  useEffect(() => {
    if (!user) return

    const loadOrgId = async () => {
      const profile = await userProfileService.getProfile(user.uid)
      if (profile?.organizationId) {
        setOrganizationId(profile.organizationId)
      }
    }

    loadOrgId()
  }, [user])

  // Analyze duplicates (preview only, don't delete)
  const analyzeConditions = async () => {
    if (!organizationId) {
      alert('No organization ID found')
      return
    }

    setAnalyzing(true)
    setPreview(null)

    try {
      const q = query(
        collection(db, 'conditionCategories'),
        where('organizationId', '==', organizationId)
      )
      const snapshot = await getDocs(q)

      const groups = new Map<string, Array<{ id: string; name: string; createdAt: string }>>()

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data()
        const normalizedName = data.name.trim().toLowerCase()

        if (!groups.has(normalizedName)) {
          groups.set(normalizedName, [])
        }

        groups.get(normalizedName)!.push({
          id: docSnap.id,
          name: data.name,
          createdAt: data.createdAt || new Date().toISOString()
        })
      })

      // Find duplicates
      const details: CleanupResult['details'] = []
      let duplicateCount = 0

      for (const [normalizedName, conditions] of groups.entries()) {
        if (conditions.length > 1) {
          conditions.sort((a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          )

          const [keep, ...toDelete] = conditions

          details.push({
            name: keep.name,
            duplicateCount: toDelete.length,
            kept: keep.id,
            deleted: toDelete.map(d => d.id)
          })

          duplicateCount += toDelete.length
        }
      }

      setPreview({
        success: true,
        totalRecords: snapshot.docs.length,
        uniqueConditions: groups.size,
        duplicatesRemoved: duplicateCount,
        finalCount: snapshot.docs.length - duplicateCount,
        details
      })

    } catch (error) {
      setPreview({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setAnalyzing(false)
    }
  }

  // Execute cleanup (actually delete duplicates)
  const executeCleanup = async () => {
    if (!organizationId) {
      alert('No organization ID found')
      return
    }

    const confirmed = window.confirm(
      '⚠️ FINAL CONFIRMATION\n\n' +
      'This will permanently delete duplicate condition records from Firestore.\n\n' +
      'This action CANNOT be undone.\n\n' +
      'Continue?'
    )

    if (!confirmed) return

    setLoading(true)
    setResult(null)

    try {
      const q = query(
        collection(db, 'conditionCategories'),
        where('organizationId', '==', organizationId)
      )
      const snapshot = await getDocs(q)

      const groups = new Map<string, Array<{ id: string; name: string; createdAt: string }>>()

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data()
        const normalizedName = data.name.trim().toLowerCase()

        if (!groups.has(normalizedName)) {
          groups.set(normalizedName, [])
        }

        groups.get(normalizedName)!.push({
          id: docSnap.id,
          name: data.name,
          createdAt: data.createdAt || new Date().toISOString()
        })
      })

      let deletedCount = 0
      const details: CleanupResult['details'] = []

      for (const [normalizedName, conditions] of groups.entries()) {
        if (conditions.length > 1) {
          conditions.sort((a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          )

          const [keep, ...toDelete] = conditions

          for (const duplicate of toDelete) {
            await deleteDoc(doc(db, 'conditionCategories', duplicate.id))
            deletedCount++
          }

          details.push({
            name: keep.name,
            duplicateCount: toDelete.length,
            kept: keep.id,
            deleted: toDelete.map(d => d.id)
          })
        }
      }

      setResult({
        success: true,
        totalRecords: snapshot.docs.length,
        uniqueConditions: groups.size,
        duplicatesRemoved: deletedCount,
        finalCount: snapshot.docs.length - deletedCount,
        details
      })

      // Auto-redirect after success
      setTimeout(() => {
        router.push('/dashboard')
      }, 5000)

    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-amber-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Authentication Required
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Please log in to access this page.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/dashboard')}
            className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>

          <div className="flex items-center gap-3 mb-2">
            <Database className="w-8 h-8 text-red-600" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Cleanup Duplicate Conditions
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Remove duplicate condition records from your Firestore database
          </p>
        </div>

        {/* Warning Card */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-bold text-amber-900 dark:text-amber-200 text-lg mb-2">
                ⚠️ Important Information
              </h3>
              <ul className="space-y-2 text-sm text-amber-800 dark:text-amber-300">
                <li>• This tool removes duplicate condition records from your database</li>
                <li>• For each duplicate set, the <strong>oldest record is kept</strong></li>
                <li>• All newer duplicates are <strong>permanently deleted</strong></li>
                <li>• Use "Analyze" first to preview what will be deleted</li>
                <li>• This action cannot be undone</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={analyzeConditions}
              disabled={analyzing || loading || !organizationId}
              className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg shadow-md transition-all"
            >
              <Database className={`w-5 h-5 ${analyzing ? 'animate-pulse' : ''}`} />
              {analyzing ? 'Analyzing...' : '1. Analyze Duplicates'}
            </button>

            <button
              onClick={executeCleanup}
              disabled={loading || analyzing || !preview || preview.duplicatesRemoved === 0 || !organizationId}
              className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold rounded-lg shadow-md transition-all"
            >
              <Trash2 className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Cleaning...' : '2. Execute Cleanup'}
            </button>
          </div>
        </div>

        {/* Preview Results */}
        {preview && preview.success && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              📊 Analysis Results
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {preview.totalRecords}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Total Records</div>
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {preview.uniqueConditions}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Unique Conditions</div>
              </div>

              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {preview.duplicatesRemoved}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Duplicates Found</div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {preview.finalCount}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Final Count</div>
              </div>
            </div>

            {preview.details && preview.details.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                  Duplicate Details:
                </h4>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {preview.details.map((detail, idx) => (
                    <div key={idx} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          "{detail.name}"
                        </span>
                        <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                          {detail.duplicateCount} duplicate{detail.duplicateCount > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                        <div>✅ Will keep: {detail.kept}</div>
                        <div>🗑️ Will delete: {detail.deleted.join(', ')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {preview.duplicatesRemoved === 0 && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span className="font-semibold text-green-800 dark:text-green-200">
                    No duplicates found! Your database is clean. ✨
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Execution Results */}
        {result && (
          <div
            className={`rounded-xl shadow-lg p-6 ${
              result.success
                ? 'bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800'
            }`}
          >
            {result.success ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                  <h3 className="text-2xl font-bold text-green-800 dark:text-green-200">
                    ✅ Cleanup Successful!
                  </h3>
                </div>

                <div className="space-y-2 text-green-800 dark:text-green-200 mb-4">
                  <p>• Removed <strong>{result.duplicatesRemoved}</strong> duplicate records</p>
                  <p>• Your database now has <strong>{result.finalCount}</strong> unique conditions</p>
                  <p>• Redirecting to dashboard in 5 seconds...</p>
                </div>

                <button
                  onClick={() => router.push('/dashboard')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Go to Dashboard Now
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
                  <h3 className="text-2xl font-bold text-red-800 dark:text-red-200">
                    ❌ Cleanup Failed
                  </h3>
                </div>

                <p className="text-red-800 dark:text-red-200">
                  {result.error || 'Unknown error occurred'}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}