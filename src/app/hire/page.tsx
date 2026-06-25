// src/app/hire/page.tsx
// Hire Management — P1 shell.
'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Navigation } from '@/components/Navigation'
import { Car, Lock } from 'lucide-react'
import { HireHub } from '@/components/features/hire/HireHub'
import { useHireAccess } from '@/hooks/useHireAccess'
import { useT } from '@/lib/i18n'

export default function HirePage() {
  const t = useT()
  const router = useRouter()
  const { loading, allowed } = useHireAccess()

  // Not on the allow-list → bounce back to the yard (defence in depth; the
  // rental_* tables are also locked by RLS in migration 0050).
  useEffect(() => {
    if (!loading && !allowed) router.replace('/dashboard')
  }, [loading, allowed, router])

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#f6f8f7] dark:bg-gray-900">
        <Navigation />
        <div className="w-full px-2 sm:px-4 lg:px-8 py-1">
          <div className="mb-3 sm:mb-4">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#012619] via-[#024733] to-[#025940] px-4 py-3.5 sm:px-5 sm:py-4 shadow-md">
              <div className="pointer-events-none absolute -right-8 -top-10 w-40 h-40 rounded-full bg-[#b3f243]/10 blur-3xl" />
              <div className="pointer-events-none absolute right-6 bottom-0 opacity-[0.06]">
                <Car className="w-24 h-24 text-[#b3f243]" />
              </div>
              <div className="relative flex items-center gap-3">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#b3f243]/15 ring-1 ring-[#b3f243]/30 flex items-center justify-center flex-shrink-0">
                  <Car className="w-5 h-5 sm:w-6 sm:h-6 text-[#b3f243]" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight leading-tight">
                    {t('hire.pageTitle')}
                  </h1>
                  <p className="text-xs sm:text-sm text-[#9ec7b5] mt-0.5">
                    {t('hire.pageSubtitle')}
                  </p>
                </div>
              </div>
            </div>
          </div>
          {loading ? (
            <div className="py-20 text-center text-sm text-[#72A68E]">…</div>
          ) : allowed ? (
            <HireHub />
          ) : (
            <div className="py-20 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#025940]/8 flex items-center justify-center text-[#72A68E] mb-3">
                <Lock className="w-7 h-7" />
              </div>
              <p className="text-sm font-bold text-[#012619] dark:text-white">{t('hire.accessDeniedTitle')}</p>
              <p className="text-[12.5px] text-[#72A68E] mt-1 max-w-sm">{t('hire.accessDeniedHint')}</p>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
