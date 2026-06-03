// src/app/deliveries-defleet/page.tsx
// RESTYLED: Background and layout wrapper now matches Service Bookings page exactly
// ALL functionality preserved — ProtectedRoute, Navigation, DeliveriesDefleetContent untouched
'use client'

import React from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Navigation } from '@/components/Navigation'
import { DeliveriesDefleetContent } from '@/components/features/deliveries-defleet/DeliveriesDefleetContent'

export default function DeliveriesDefleetPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#f0f4f2] dark:bg-[#0a130e]">
        <Navigation />

        {/* Sidebar spacing + top-bar offset — identical to Service Bookings page */}
        <div className="md:ml-4 lg:ml-2 pt-14 md:pt-0">
          <DeliveriesDefleetContent />
        </div>
      </div>
    </ProtectedRoute>
  )
}