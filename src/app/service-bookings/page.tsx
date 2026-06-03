// src/app/service-bookings/page.tsx
// ✅ PRESERVED: ProtectedRoute, Navigation, ServiceBookingsContent — all untouched
// ✨ UPDATED: Removed outer bg-gradient and px padding — ServiceBookingsContent owns its own layout/bg now
'use client'

import React from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Navigation } from '@/components/Navigation'
import { ServiceBookingsContent } from '@/components/features/service-bookings/ServiceBookingsContent'

export default function ServiceBookingsPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#f0f4f2] dark:bg-[#0a130e]">
  <Navigation />
  <div className="md:ml-4 lg:ml-2">
    <ServiceBookingsContent />
  </div>
</div>
    </ProtectedRoute>
  )
}