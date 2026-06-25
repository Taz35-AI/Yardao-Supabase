// src/components/ConditionalProviders.tsx
// FIXED - Handles trailing slashes!

'use client'

import { usePathname } from 'next/navigation'
import { Providers } from '@/components/Providers'
import { SidebarProvider } from '@/contexts/SidebarContext'
import { ServiceBookingsProvider } from '@/contexts/ServiceBookingsContext'
import { HireProvider } from '@/contexts/HireContext'
import { FleetDataProvider } from '@/contexts/FleetDataContext'
import { YardDataProvider } from '@/contexts/YardDataContext'
import { DeliveriesDefleetProvider } from '@/contexts/DeliveriesDefleetContext'
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt'
import { AutoLogoutProvider } from '@/components/AutoLogoutProvider'
import { HapticWrapper } from '@/components/HapticWrapper'
import { PushNotificationProvider } from '@/components/PushNotificationProvider'
import { KeyboardOptimizationProvider } from '@/hooks/useKeyboardOptimization'
import { DynamicMainContent } from '@/components/DynamicMainContent'
import SystemBars from '@/components/SystemBars'
import { logger } from '@/lib/logger'

interface ConditionalProvidersProps {
  children: React.ReactNode
}

export function ConditionalProviders({ children }: ConditionalProvidersProps) {
  const pathname = usePathname()

  // Remove trailing slash for comparison (except for root '/')
  const cleanPathname = pathname.endsWith('/') && pathname !== '/' 
    ? pathname.slice(0, -1) 
    : pathname

  const authPages = [
    '/',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/reset-password-required'
  ]

  const isAuthPage = authPages.includes(cleanPathname)

  logger.log('🔍 [ConditionalProviders] pathname:', pathname, '| cleaned:', cleanPathname, '| isAuthPage:', isAuthPage)

  // ✅ AUTH PAGES: Providers only (for AuthContext), NO main wrapper!
  if (isAuthPage) {
    logger.log('✅ [ConditionalProviders] Rendering AUTH PAGE (no main wrapper)')
    return (
      <Providers>
        <PWAInstallPrompt />
        <SystemBars />
        {children}
      </Providers>
    )
  }

  // ✅ DASHBOARD PAGES: Full provider stack + DynamicMainContent
  // ServiceBookingsProvider sits inside Providers (so it has AuthContext) and
  // wraps everything else (so a single shared listener serves all consumers:
  // dashboard layers, ServiceBookingsContent, useNotifications via
  // NotificationBell/ServiceBanner). The provider self-gates by pathname so
  // the listener only opens on /dashboard or /service-bookings.
  logger.log('📊 [ConditionalProviders] Rendering DASHBOARD PAGE (with main wrapper)')
  return (
    <SidebarProvider>
      <Providers>
        <FleetDataProvider>
          <YardDataProvider>
            <ServiceBookingsProvider>
              <HireProvider>
              <DeliveriesDefleetProvider>
                <HapticWrapper>
                  <PushNotificationProvider>
                    <KeyboardOptimizationProvider>
                      <AutoLogoutProvider
                        timeoutMinutes={120}
                        warningMinutes={2}
                        enabled={true}
                      >
                        <PWAInstallPrompt />
                        <SystemBars />

                        <DynamicMainContent>
                          {children}
                        </DynamicMainContent>
                      </AutoLogoutProvider>
                    </KeyboardOptimizationProvider>
                  </PushNotificationProvider>
                </HapticWrapper>
              </DeliveriesDefleetProvider>
              </HireProvider>
            </ServiceBookingsProvider>
          </YardDataProvider>
        </FleetDataProvider>
      </Providers>
    </SidebarProvider>
  )
}