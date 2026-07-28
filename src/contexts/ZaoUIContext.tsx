// src/contexts/ZaoUIContext.tsx
// Lets any page suppress the floating Zao assistant while a full-screen modal
// is open. Zao is rendered globally (layout.tsx) but the modal state lives in
// the pages, so this thin context bridges the two. Safe to call the hook
// outside the provider — it no-ops.

'use client'

import { createContext, useContext, useMemo, useState, useCallback } from 'react'

interface ZaoUIValue {
  suppressed: boolean
  setSuppressed: (v: boolean) => void
}

const ZaoUIContext = createContext<ZaoUIValue>({
  suppressed: false,
  setSuppressed: () => {},
})

export function ZaoUIProvider({ children }: { children: React.ReactNode }) {
  const [suppressed, setSuppressedState] = useState(false)
  const setSuppressed = useCallback((v: boolean) => setSuppressedState(v), [])
  const value = useMemo(() => ({ suppressed, setSuppressed }), [suppressed, setSuppressed])
  return <ZaoUIContext.Provider value={value}>{children}</ZaoUIContext.Provider>
}

export function useZaoUI(): ZaoUIValue {
  return useContext(ZaoUIContext)
}
