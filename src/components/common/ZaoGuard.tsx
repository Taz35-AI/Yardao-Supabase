// src/components/common/ZaoGuard.tsx
// Renders Zao only on the yard page (/dashboard)
'use client'

import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useZaoUI } from '@/contexts/ZaoUIContext'
import { SpeechEnabledGroqAssistant } from './SpeechEnabledGroqAssistant'

const ZAO_ALLOWED_PAGES = ['/dashboard']

export function ZaoGuard() {
  const { user } = useAuth()
  const pathname = usePathname()
  const { suppressed } = useZaoUI()

  const isAllowed = ZAO_ALLOWED_PAGES.some(page => pathname.startsWith(page))

  // Hidden while a full-screen modal is open (edit / detail / check-in) so the
  // floating button never sits on top of modal content.
  if (!user || !isAllowed || suppressed) return null

  return <SpeechEnabledGroqAssistant />
}