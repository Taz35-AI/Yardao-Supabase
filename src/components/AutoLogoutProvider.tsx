//src/components/AutoLogoutProvider.tsx - Production settings
'use client'

import React from 'react'
import { useAutoLogout } from '@/hooks/useAutoLogout'

interface AutoLogoutProviderProps {
  children: React.ReactNode
  timeoutMinutes?: number
  warningMinutes?: number
  enabled?: boolean
}

export function AutoLogoutProvider({
  children,
  timeoutMinutes = 10,      // 🎯 PRODUCTION: 10 minutes total
  warningMinutes = 0.5,    // 🎯 PRODUCTION: 30 seconds warning (0.30 minutes)
  enabled = true
}: AutoLogoutProviderProps) {
  // Initialize auto-logout functionality
  useAutoLogout({
    timeoutMinutes,
    warningMinutes,
    enabled
  })

  // This component doesn't render anything except its children
  return <>{children}</>
}