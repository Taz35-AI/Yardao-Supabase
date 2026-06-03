// src/components/HapticWrapper.tsx
'use client'

import { useGlobalHaptics } from '@/hooks/useGlobalHaptics'

export function HapticWrapper({ children }: { children: React.ReactNode }) {
  useGlobalHaptics()
  return <>{children}</>
}