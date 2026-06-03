// src/components/Providers.tsx
// Updated to include Firestore network control for battery optimization

'use client'

import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from 'next-themes'
import { LanguageProvider, LanguageSync } from '@/lib/i18n'
import { useFirestoreNetwork } from '@/hooks/common/useFirestoreNetwork'

// Network controller component
function FirestoreNetworkController() {
  useFirestoreNetwork()
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AuthProvider>
        {/* Add network controller - automatically manages WebSocket based on visibility */}
        <FirestoreNetworkController />
        <LanguageProvider>
          <LanguageSync />
          {children}
        </LanguageProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}