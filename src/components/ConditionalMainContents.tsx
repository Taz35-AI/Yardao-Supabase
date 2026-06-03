// src/components/ConditionalMainContent.tsx
// This component conditionally applies sidebar spacing based on the current route
// Auth pages (login, register, forgot-password) render with NO spacing
// Dashboard pages render with dynamic sidebar spacing

'use client'

import { usePathname } from 'next/navigation'
import { DynamicMainContent } from './DynamicMainContent'

interface ConditionalMainContentProps {
  children: React.ReactNode
}

export function ConditionalMainContent({ children }: ConditionalMainContentProps) {
  const pathname = usePathname()

  // Pages that should NOT have ANY sidebar spacing or padding (full-width auth pages)
  const fullWidthPages = [
    '/',                 // Homepage
    '/login',            // Login page  
    '/register',         // Register page
    '/forgot-password',  // Forgot password page
    '/reset-password'    // Reset password page
  ]

  const isFullWidth = fullWidthPages.includes(pathname)

  // ✅ For auth pages: This should NEVER run because ConditionalProviders handles it
  // But as a safety net, return children with no wrapper
  if (isFullWidth) {
    return <>{children}</>
  }

  // ✅ For authenticated pages with sidebar: Apply dynamic spacing
  return <DynamicMainContent>{children}</DynamicMainContent>
}