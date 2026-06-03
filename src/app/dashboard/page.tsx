// src/app/dashboard/page.tsx
// Fixed to prevent infinite re-renders with query parameters

'use client'

import React, { Suspense, useMemo, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'

// Dynamically import DashboardContent to avoid SSR issues
const DashboardContent = dynamic(() => import('./DashboardContent'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-slate-800">
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    </div>
  )
})

// Wrap the component that uses useSearchParams in Suspense
function DashboardWithBranch() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useAuth()
  // Track whether we've checked the user's default branch preference yet so
  // we don't keep redirecting if they explicitly navigated to /dashboard.
  const [defaultBranchChecked, setDefaultBranchChecked] = useState(false)

  // ✨ PHASE 3: On first load, if the URL has no `?branch=` param AND the user
  // has a defaultBranchSlug saved in their profile, redirect there. After this
  // initial check we never redirect again — the user can navigate freely.
  useEffect(() => {
    if (defaultBranchChecked) return
    if (!user?.uid) return
    const urlBranch = searchParams.get('branch')
    if (urlBranch) {
      setDefaultBranchChecked(true)
      return
    }
    let cancelled = false
    userProfileService.getProfile(user.uid)
      .then(profile => {
        if (cancelled) return
        const slug = profile?.defaultBranchSlug
        if (slug && slug !== 'main') {
          router.replace(`/dashboard?branch=${slug}`)
        }
      })
      .finally(() => {
        if (!cancelled) setDefaultBranchChecked(true)
      })
    return () => { cancelled = true }
  }, [user?.uid, defaultBranchChecked, searchParams, router])

  // Memoize the branchId to prevent unnecessary re-renders
  const branchId = useMemo(() => {
    const branch = searchParams.get('branch')
    return branch || 'main'
  }, [searchParams])

  // Use key prop to force remount when branch changes
  // This ensures clean state when switching branches
  return <DashboardContent key={branchId} branchId={branchId} />
}

// Main page component
export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-slate-800">
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading dashboard...</p>
          </div>
        </div>
      </div>
    }>
      <DashboardWithBranch />
    </Suspense>
  )
}