// src/components/common/ZaoGuard.tsx
// Renders Zao only on yard (/dashboard), fleet, and service-bookings pages
'use client'

import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { SpeechEnabledGroqAssistant } from './SpeechEnabledGroqAssistant'

const ZAO_ALLOWED_PAGES = ['/dashboard', '/fleet', '/service-bookings']

export function ZaoGuard() {
  const { user } = useAuth()
  const pathname = usePathname()

  const isAllowed = ZAO_ALLOWED_PAGES.some(page => pathname.startsWith(page))

  if (!user || !isAllowed) return null

  return <SpeechEnabledGroqAssistant />
}