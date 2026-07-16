// src/app/fleet/keys/page.tsx
// Fleet subpage: head-office spare-key box log.
'use client'

import ProtectedRoute from '@/components/ProtectedRoute'
import { Navigation } from '@/components/Navigation'
import { KeyBoxLog } from '@/components/fleet/KeyBoxLog'

export default function FleetKeysPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#f6f8f7] dark:bg-gray-900">
        <Navigation />
        <div className="w-full max-w-6xl mx-auto px-2 sm:px-4 lg:px-8 py-2 pb-24">
          <KeyBoxLog />
        </div>
      </div>
    </ProtectedRoute>
  )
}
