// src/app/customers/page.tsx
// Standalone customers page. Layout mirrors /service-bookings: ProtectedRoute
// + Navigation shell + a content component that owns its own internal layout.
'use client'

import React from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Navigation } from '@/components/Navigation'
import { CustomersContent } from '@/components/features/customers/CustomersContent'

export default function CustomersPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#f0f4f2] dark:bg-[#0a130e]">
        <Navigation />
        <div className="md:ml-4 lg:ml-2 pt-14 md:pt-0">
          <CustomersContent />
        </div>
      </div>
    </ProtectedRoute>
  )
}
