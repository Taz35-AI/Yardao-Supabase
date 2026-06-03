// src/components/DynamicMainContent.tsx
// FIXED - Handles trailing slashes!

'use client'

import { usePathname } from 'next/navigation'
import { useSidebar } from '@/contexts/SidebarContext'
import { logger } from '@/lib/logger'

interface DynamicMainContentProps {
  children: React.ReactNode
}

export function DynamicMainContent({ children }: DynamicMainContentProps) {
  const pathname = usePathname()
  const { isSidebarCollapsed } = useSidebar()

  // Remove trailing slash for comparison
  const cleanPathname = pathname.endsWith('/') && pathname !== '/' 
    ? pathname.slice(0, -1) 
    : pathname

  const authPages = [
    '/',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password'
  ]

  const isAuthPage = authPages.includes(cleanPathname)

  logger.log('🔍 [DynamicMainContent] pathname:', pathname, '| cleaned:', cleanPathname, '| isAuthPage:', isAuthPage)

  // ✅ If we're on an auth page, return children with NO wrapper
  if (isAuthPage) {
    logger.log('✅ [DynamicMainContent] Auth page detected! NO main wrapper!')
    return <>{children}</>
  }

  // ✅ Dashboard pages get the main wrapper with sidebar spacing
  logger.log('📊 [DynamicMainContent] Dashboard page - adding main wrapper')
  return (
    <main
      className={`pt-[calc(5rem+env(safe-area-inset-top,0px))] md:pt-0 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0 transition-all duration-300 ${
        isSidebarCollapsed ? 'md:ml-32' : 'md:ml-64'
      }`}
    >
      {children}
    </main>
  )
}