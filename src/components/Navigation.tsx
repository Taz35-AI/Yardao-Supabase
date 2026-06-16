// src/components/Navigation.tsx
// ✅ UPDATED: Mobile bottom navigation bar + branch selector in top bar
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useSidebar } from '@/contexts/SidebarContext'
import { Button } from '@/components/ui/Button'
import { UserThemeToggle } from '@/components/UserThemeToggle'
import { NotificationBell } from '@/components/common/NotificationBell'
import { BranchSelector } from '@/components/navigation/BranchSelector'
import { useT } from '@/lib/i18n'
import { userProfileService } from '@/lib/firestore'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

import {
  LogOut,
  Menu,
  X,
  Plus,
  Users,
  CarIcon,
  PaintbrushIcon,
  LayoutDashboard,
  BarChart3,
  Wrench,
  Truck,
  ClipboardCheck,
  Building2,
  Package,
  User,
  Settings,
} from 'lucide-react'

// ─── Nav icon components ──────────────────────────────────────────────────
// Theme-aware Lucide SVGs (replacing the old raster /Navigation/*.png images).
// They render with `currentColor`, so they inherit the active/inactive text
// colour of their nav item automatically and stay crisp at any DPI.
const DashboardIcon  = ({ className }: { className?: string }) => <LayoutDashboard className={className} />
const ReportsIcon    = ({ className }: { className?: string }) => <BarChart3 className={className} />
const FleetIcon      = ({ className }: { className?: string }) => <CarIcon className={className} />
const ServiceIcon    = ({ className }: { className?: string }) => <Wrench className={className} />
const DeliveriesIcon = ({ className }: { className?: string }) => <Truck className={className} />
const CheckoutIcon   = ({ className }: { className?: string }) => <ClipboardCheck className={className} />
const BranchIcon     = ({ className }: { className?: string }) => <Building2 className={className} />
const ProfileIcon    = ({ className }: { className?: string }) => <User className={className} />
const SettingsIcon   = ({ className }: { className?: string }) => <Settings className={className} />
const StockIcon      = ({ className }: { className?: string }) => <Package className={className} />
const CustomersIcon  = ({ className }: { className?: string }) => <Users className={className} />

// ─── Bottom nav items (5 slots: Yard | Fleet | [+] | Stock | Settings) ───
// These are shown to admins only. Non-admins still get the hamburger menu.
const BOTTOM_NAV_ADMIN = [
  { href: '/dashboard',        label: 'Yard',    labelKey: 'nav.yard',       Icon: DashboardIcon },
  { href: '/fleet',            label: 'Fleet',   labelKey: 'nav.fleet',      Icon: FleetIcon     },
  { href: '/stock',            label: 'Stock',   labelKey: 'nav.stockShort', Icon: StockIcon     },
  { href: '/service-bookings', label: 'Service', labelKey: 'nav.service',    Icon: ServiceIcon   },
]

const BOTTOM_NAV_MEMBER = [
  { href: '/dashboard',      label: 'Yard',    labelKey: 'nav.yard',       Icon: DashboardIcon },
  { href: '/stock',          label: 'Stock',   labelKey: 'nav.stockShort', Icon: StockIcon     },
  { href: '/service-bookings', label: 'Service', labelKey: 'nav.service',  Icon: ServiceIcon  },
  { href: '/profile',        label: 'Profile', labelKey: 'nav.profile',    Icon: ProfileIcon   },
]

// ─────────────────────────────────────────────────────────────────────────────

export function Navigation() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { isSidebarCollapsed, toggleSidebar } = useSidebar()
  const t = useT()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [userRole, setUserRole] = useState<'admin' | 'member' | 'mechanic' | null>(null)
  const [loadingRole, setLoadingRole] = useState(true)

  useEffect(() => {
    if (!isSidebarCollapsed) {
      setIsAnimating(true)
      const timer = setTimeout(() => setIsAnimating(false), 150)
      return () => clearTimeout(timer)
    }
  }, [isSidebarCollapsed])

  useEffect(() => {
    const loadUserRole = async () => {
      if (user?.uid) {
        try {
          const profile = await userProfileService.getProfile(user.uid)
          setUserRole(profile?.role || 'member')
        } catch {
          setUserRole('member')
        } finally {
          setLoadingRole(false)
        }
      }
    }
    loadUserRole()
  }, [user])

  // ── Haptics ──────────────────────────────────────────────────────────────
  const triggerLightHaptic = async () => {
    try { await Haptics.impact({ style: ImpactStyle.Light }) } catch {}
  }
  const triggerMediumHaptic = async () => {
    try { await Haptics.impact({ style: ImpactStyle.Medium }) } catch {}
  }
  const triggerErrorHaptic = async () => {
    try { await Haptics.notification({ type: NotificationType.Error }) } catch {}
  }

  const handleLogout = async () => {
    try {
      await triggerMediumHaptic()
      await logout()
      setIsMobileMenuOpen(false)
    } catch {
      await triggerErrorHaptic()
    }
  }

  const handleToggleSidebar = () => { triggerLightHaptic(); toggleSidebar() }
  const toggleMobileMenu  = () => { triggerLightHaptic(); setIsMobileMenuOpen(p => !p) }
  const closeMobileMenu   = () => setIsMobileMenuOpen(false)
  const handleNavClick    = async () => { await triggerLightHaptic() }

  // ── All nav items (hamburger / desktop sidebar) ───────────────────────────
  const allNavItems = [
    { href: '/dashboard',          label: 'Yard',                 labelKey: 'nav.yard',           icon: DashboardIcon,  active: pathname === '/dashboard'          || pathname.startsWith('/dashboard'),          group: 'main',       requiresAdmin: false },
    { href: '/reports',            label: 'Reports',              labelKey: 'nav.reports',        icon: ReportsIcon,    active: pathname === '/reports'            || pathname.startsWith('/reports'),            group: 'main',       requiresAdmin: true  },
    { href: '/fleet',              label: 'Fleet',                labelKey: 'nav.fleet',          icon: FleetIcon,      active: pathname === '/fleet'              || pathname.startsWith('/fleet'),              group: 'main',       requiresAdmin: true  },
    { href: '/service-bookings',   label: 'Service',              labelKey: 'nav.service',        icon: ServiceIcon,    active: pathname === '/service-bookings'   || pathname.startsWith('/service-bookings'),   group: 'operations', requiresAdmin: false },
    { href: '/customers',          label: 'Garage Customers',     labelKey: 'nav.customers',      icon: CustomersIcon,  active: pathname === '/customers'          || pathname.startsWith('/customers'),          group: 'operations', requiresAdmin: true  },
    { href: '/deliveries-defleet', label: 'Deliveries & Defleet', labelKey: 'nav.deliveries',     icon: DeliveriesIcon, active: pathname === '/deliveries-defleet' || pathname.startsWith('/deliveries-defleet'), group: 'operations', requiresAdmin: true  },
    { href: '/checkout-history',   label: 'Checkout',             labelKey: 'nav.checkout',       icon: CheckoutIcon,   active: pathname === '/checkout-history'   || pathname.startsWith('/checkout-history'),   group: 'operations', requiresAdmin: true  },
    { href: '/branch-overview',    label: 'Branch Overview',      labelKey: 'nav.branchOverview', icon: BranchIcon,     active: pathname === '/branch-overview'    || pathname.startsWith('/branch-overview'),    group: 'operations', requiresAdmin: false },
    { href: '/stock',              label: 'Stock & Parts',        labelKey: 'nav.stock',          icon: StockIcon,      active: pathname === '/stock'              || pathname.startsWith('/stock'),              group: 'operations', requiresAdmin: false },
    { href: '/bodyshop',           label: 'Bodyshop',             labelKey: 'nav.bodyshop',       icon: PaintbrushIcon, active: pathname === '/bodyshop'            || pathname.startsWith('/bodyshop'),           group: 'operations', requiresAdmin: false },
    { href: '/profile',            label: 'Profile',              labelKey: 'nav.profile',        icon: ProfileIcon,    active: pathname === '/profile'            || pathname.startsWith('/profile'),            group: 'account',    requiresAdmin: false },
    { href: '/settings',           label: 'Settings',             labelKey: 'nav.settings',       icon: SettingsIcon,   active: pathname === '/settings'           || pathname.startsWith('/settings'),           group: 'account',    requiresAdmin: false },
  ]

  const navItems = userRole === 'admin'
    ? allNavItems
    : allNavItems.filter(item => !item.requiresAdmin)

  const primaryNavItems   = navItems.filter(item => item.group === 'main')
  const secondaryNavItems = navItems.filter(item => item.group === 'operations')
  const utilityNavItems   = navItems.filter(item => item.group === 'account')

  // Desktop sidebar groups
  const mainNavItems       = navItems.filter(item => item.group === 'main')
  const operationsNavItems = navItems.filter(item => item.group === 'operations')
  const accountNavItems    = navItems.filter(item => item.group === 'account')

  // Bottom nav items depending on role
  const bottomNavItems = userRole === 'admin' ? BOTTOM_NAV_ADMIN : BOTTOM_NAV_MEMBER

  // ── Loading spinner ───────────────────────────────────────────────────────
  if (loadingRole) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-[#012619] to-[#025940]">
        <div className="animate-spin w-12 h-12 border-4 border-[#C5D9D0] border-t-[#b3f243] rounded-full" />
      </div>
    )
  }

  return (
    <>
      {/* ── Global styles ── */}
      <style jsx global>{`
        .branch-selector-wrapper > button,
        .branch-selector-wrapper > button span { color: #b3f243 !important; }

        .branch-selector-in-sidebar .branch-dropdown {
          width: calc(256px - 2rem) !important;
          max-width: calc(256px - 2rem) !important;
          left: 1rem !important;
          right: 1rem !important;
        }

        .branch-selector-collapsed .branch-dropdown {
          position: fixed !important;
          left: 88px !important;
          top: auto !important;
          width: 240px !important;
          max-width: 240px !important;
        }

        /* Branch selector in mobile top bar – compact pill style */
        .mobile-branch-selector button {
          color: #b3f243 !important;
          font-size: 12px !important;
          padding: 4px 8px !important;
          gap: 4px !important;
        }
        .mobile-branch-selector .branch-dropdown {
          left: 0 !important;
          right: auto !important;
          min-width: 200px !important;
          top: calc(100% + 4px) !important;
        }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════════════
          MOBILE: Top bar
      ══════════════════════════════════════════════════════════════════════ */}
      <nav
        className="md:hidden fixed top-0 left-0 right-0 z-50 bg-[#012619] border-b border-[#025940] shadow-lg"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="w-full px-3">
          <div className="flex items-center h-[4.5rem] gap-2">

            {/* Left: branch selector (flexes/truncates so the logo stays centred) */}
            <div className="flex-1 min-w-0 flex justify-start">
              <div
                className="mobile-branch-selector branch-selector-wrapper flex items-center px-2 py-1 rounded-lg border border-[#b3f243]/30 relative max-w-full"
                style={{ backgroundColor: 'rgba(179,242,67,0.08)' }}
              >
                <BranchSelector />
              </div>
            </div>

            {/* Centre: logo only — no YARDAO text, so it can be big & visible */}
            <Link href="/dashboard" className="flex-shrink-0" onClick={handleNavClick}>
              <img src="/yardao-logo.png" alt="Yardao" className="h-12 sm:h-14 w-auto object-contain drop-shadow-[0_1px_4px_rgba(0,0,0,0.35)]" />
            </Link>

            {/* Right: Notifications + Hamburger */}
            <div className="flex-1 flex items-center justify-end gap-2">
              <NotificationBell inSidebar={false} />
              <button
                onClick={toggleMobileMenu}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                aria-label="Open menu"
              >
                {isMobileMenuOpen ? <X className="h-5 w-5 text-white" /> : <Menu className="h-5 w-5 text-white" />}
              </button>
            </div>
          </div>
        </div>

        {/* ── Hamburger slide-down menu ── */}
        {/* Compact spacing on mobile so all items (incl. logout) fit above the
            bottom nav. Container height = viewport − top bar (4rem) − bottom nav
            with safe-area (~6rem). Bottom padding adds breathing room. */}
        {isMobileMenuOpen && (
          <div className="border-t border-[#025940]/30 bg-[#012619]">
            <div
              className="px-2 pt-3 overflow-y-auto"
              style={{
                maxHeight: 'calc(100dvh - 4.5rem - env(safe-area-inset-top, 0px) - 6rem - env(safe-area-inset-bottom, 0px))',
                paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
              }}
            >

              {/* Primary nav */}
              {primaryNavItems.length > 0 && (
                <div>
                  <h3 className="px-3 text-[10px] font-semibold text-[#72A68E] uppercase tracking-wider mb-1.5">{t('nav.main')}</h3>
                  <div className="space-y-0.5">
                    {primaryNavItems.map(item => {
                      const Icon = item.icon
                      return (
                        <Link
                          key={item.href}
                          data-tour={`nav-${item.href}`}
                          href={item.href}
                          onClick={() => { handleNavClick(); closeMobileMenu() }}
                          className={`flex items-center px-3 py-2 text-sm font-semibold transition-all duration-150 rounded-r-lg mr-4 ${
                            item.active
                              ? 'bg-[#025940] text-white border-r-4 border-[#72A68E]'
                              : 'text-[#C5D9D0] hover:text-white hover:bg-[#025940]/50 border-r-4 border-transparent hover:border-[#025940]'
                          }`}
                        >
                          <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
                          <span>{t(item.labelKey)}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Secondary nav */}
              {secondaryNavItems.length > 0 && (
                <div>
                  <h3 className="px-3 text-[10px] font-semibold text-[#72A68E] uppercase tracking-wider mb-1.5 mt-2">{t('nav.operations')}</h3>
                  <div className="space-y-0.5">
                    {secondaryNavItems.map(item => {
                      const Icon = item.icon
                      return (
                        <Link
                          key={item.href}
                          data-tour={`nav-${item.href}`}
                          href={item.href}
                          onClick={() => { handleNavClick(); closeMobileMenu() }}
                          className={`flex items-center px-3 py-2 text-sm font-semibold transition-all duration-150 rounded-r-lg mr-4 ${
                            item.active
                              ? 'bg-[#025940] text-white border-r-4 border-[#72A68E]'
                              : 'text-[#C5D9D0] hover:text-white hover:bg-[#025940]/50 border-r-4 border-transparent hover:border-[#025940]'
                          }`}
                        >
                          <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
                          <span className="whitespace-pre-line">{t(item.labelKey)}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Utility nav */}
              {utilityNavItems.length > 0 && (
                <div>
                  <h3 className="px-3 text-[10px] font-semibold text-[#72A68E] uppercase tracking-wider mb-1.5 mt-2">{t('nav.account')}</h3>
                  <div className="space-y-0.5">
                    {utilityNavItems.map(item => {
                      const Icon = item.icon
                      return (
                        <Link
                          key={item.href}
                          data-tour={`nav-${item.href}`}
                          href={item.href}
                          onClick={() => { handleNavClick(); closeMobileMenu() }}
                          className={`flex items-center px-3 py-2 text-sm font-semibold transition-all duration-150 rounded-r-lg mr-4 ${
                            item.active
                              ? 'bg-[#025940] text-white border-r-4 border-[#72A68E]'
                              : 'text-[#C5D9D0] hover:text-white hover:bg-[#025940]/50 border-r-4 border-transparent hover:border-[#025940]'
                          }`}
                        >
                          <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
                          <span>{t(item.labelKey)}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Account + logout */}
              <div className="pt-2.5 mt-2.5 border-t-2 border-[#025940]/30">
                <div className="flex items-center justify-between px-3 py-1.5 mb-2">
                  <span className="text-sm text-[#C5D9D0]">{t('nav.theme')}</span>
                  <UserThemeToggle />
                </div>

                {user && (
                  <div className="px-3 py-2 bg-[#025940]/20 rounded-lg border border-[#025940]/30">
                    <div className="mb-2">
                      <p className="text-sm font-medium text-white truncate">{user.displayName || 'User'}</p>
                      <p className="text-xs text-[#C5D9D0] truncate">{user.email}</p>
                    </div>
                    <Button
                      onClick={() => { handleLogout(); closeMobileMenu() }}
                      variant="ghost"
                      className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-900/20 border border-red-500/30 hover:border-red-400 py-2 h-auto"
                    >
                      <LogOut className="w-4 h-4 mr-3" />
                      {t('nav.logout')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ══════════════════════════════════════════════════════════════════════
          MOBILE: Bottom navigation bar
          Hidden on md+ (desktop uses the sidebar instead)
      ══════════════════════════════════════════════════════════════════════ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#012619] border-t border-[#025940] shadow-[0_-4px_20px_rgba(0,0,0,0.3)]"
           style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className={`flex items-end px-2 pt-2 pb-2 ${pathname.startsWith('/dashboard') ? 'justify-around' : 'justify-evenly'}`}>

          {/* Slot 1 */}
          <BottomNavItem
            href={bottomNavItems[0].href}
            label={t(bottomNavItems[0].labelKey)}
            Icon={bottomNavItems[0].Icon}
            active={pathname === bottomNavItems[0].href || pathname.startsWith(bottomNavItems[0].href)}
            onClick={handleNavClick}
          />

          {/* Slot 2 */}
          <BottomNavItem
            href={bottomNavItems[1].href}
            label={t(bottomNavItems[1].labelKey)}
            Icon={bottomNavItems[1].Icon}
            active={pathname === bottomNavItems[1].href || pathname.startsWith(bottomNavItems[1].href)}
            onClick={handleNavClick}
          />

          {/* Centre FAB – only on dashboard */}
          {pathname.startsWith('/dashboard') && (
            <div className="flex flex-col items-center -mt-5">
              <button
                onClick={async () => {
                  await triggerLightHaptic()
                  window.dispatchEvent(new CustomEvent('yardao:open-checkin'))
                }}
                className="w-14 h-14 rounded-full bg-[#b3f243] shadow-lg shadow-[#b3f243]/30 flex items-center justify-center active:scale-95 transition-transform border-4 border-[#012619]"
                aria-label="Add vehicle"
              >
                <Plus className="w-7 h-7 text-[#012619]" strokeWidth={3} />
              </button>
              <span className="text-[9px] font-semibold text-[#4a6a5a] mt-1 leading-none">{t('nav.add')}</span>
            </div>
          )}

          {/* Slot 3 */}
          <BottomNavItem
            href={bottomNavItems[2].href}
            label={t(bottomNavItems[2].labelKey)}
            Icon={bottomNavItems[2].Icon}
            active={pathname === bottomNavItems[2].href || pathname.startsWith(bottomNavItems[2].href)}
            onClick={handleNavClick}
          />

          {/* Slot 4 */}
          <BottomNavItem
            href={bottomNavItems[3].href}
            label={t(bottomNavItems[3].labelKey)}
            Icon={bottomNavItems[3].Icon}
            active={pathname === bottomNavItems[3].href || pathname.startsWith(bottomNavItems[3].href)}
            onClick={handleNavClick}
          />

        </div>
      </nav>

      {/* ══════════════════════════════════════════════════════════════════════
          DESKTOP: Left Sidebar (unchanged)
      ══════════════════════════════════════════════════════════════════════ */}
      <aside
        className={`hidden md:flex fixed left-0 top-0 h-screen bg-[#012619] border-r border-[#025940] shadow-2xl transition-all duration-300 ease-in-out z-50 flex-col overflow-hidden ${
          isSidebarCollapsed ? 'w-32' : 'w-64'
        }`}
      >
        {/* Sidebar header — logo centered in both states; collapsed width stays
            as wide as the logo (not minimised to a thin strip). */}
        <div className="relative flex flex-col items-center px-3 py-4 border-b border-[#025940] flex-shrink-0">
          <Link href="/dashboard" className="group" onClick={handleNavClick}>
            <img src="/yardao-logo.png" alt="Yardao" className="h-16 sm:h-20 w-auto max-w-full object-contain group-hover:scale-105 transition-transform" />
          </Link>
          <button
            onClick={handleToggleSidebar}
            className={`p-1.5 rounded-lg text-[#72A68E] hover:text-white hover:bg-[#025940]/50 transition-colors ${
              isSidebarCollapsed ? 'mt-2' : 'absolute top-2 right-2'
            }`}
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>

        {/* Branch selector in sidebar */}
        {!isSidebarCollapsed && (
          <div className={`px-4 py-3 border-b border-[#025940] flex-shrink-0 transition-all duration-300 ${isAnimating ? 'opacity-0' : 'opacity-100'}`}>
            <div
              className="px-3 py-2 rounded-md border shadow-sm transition-all duration-200 hover:shadow-md branch-selector-wrapper"
              style={{ backgroundColor: 'rgba(179, 242, 67, 0.1)', borderColor: '#b3f243', boxShadow: '0 0 10px rgba(179, 242, 67, 0.2)' }}
            >
              <BranchSelector />
            </div>
          </div>
        )}

        {/* Scrollable nav area */}
        <div className="flex-1 overflow-y-auto py-4">

          {/* Main group */}
          {mainNavItems.length > 0 && (
            <div className="mb-6">
              {!isSidebarCollapsed && (
                <h3 className={`px-4 text-xs font-semibold text-[#72A68E] uppercase tracking-wider mb-2 transition-all duration-300 ${isAnimating ? 'opacity-0' : 'opacity-100'}`}>
                  {t('nav.main')}
                </h3>
              )}
              <div className="space-y-1 px-2">
                {mainNavItems.map(item => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      data-tour={`nav-${item.href}`}
                      href={item.href}
                      onClick={handleNavClick}
                      className={`group relative flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        item.active
                          ? 'bg-[#025940] text-white border-l-4 border-[#72A68E] shadow-sm'
                          : 'text-[#C5D9D0] hover:text-white hover:bg-[#025940]/50 border-l-4 border-transparent hover:border-[#025940]'
                      }`}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      {!isSidebarCollapsed && (
                        <span className={`ml-3 whitespace-nowrap transition-all duration-300 ${isAnimating ? 'opacity-0' : 'opacity-100'}`}>
                          {t(item.labelKey)}
                        </span>
                      )}
                      {isSidebarCollapsed && (
                        <div className="absolute left-full ml-2 px-2 py-1 bg-[#012619] text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap border border-[#025940] shadow-lg z-50">
                          {t(item.labelKey)}
                        </div>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Operations group */}
          {operationsNavItems.length > 0 && (
            <div className="mb-6">
              {!isSidebarCollapsed && (
                <h3 className={`px-4 text-xs font-semibold text-[#72A68E] uppercase tracking-wider mb-2 transition-all duration-300 ${isAnimating ? 'opacity-0' : 'opacity-100'}`}>
                  {t('nav.operations')}
                </h3>
              )}
              <div className="space-y-1 px-2">
                {operationsNavItems.map(item => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      data-tour={`nav-${item.href}`}
                      href={item.href}
                      onClick={handleNavClick}
                      className={`group relative flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        item.active
                          ? 'bg-[#025940] text-white border-l-4 border-[#72A68E] shadow-sm'
                          : 'text-[#C5D9D0] hover:text-white hover:bg-[#025940]/50 border-l-4 border-transparent hover:border-[#025940]'
                      }`}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      {!isSidebarCollapsed && (
                        <span className={`ml-3 whitespace-nowrap transition-all duration-300 ${isAnimating ? 'opacity-0' : 'opacity-100'}`}>
                          {t(item.labelKey)}
                        </span>
                      )}
                      {isSidebarCollapsed && (
                        <div className="absolute left-full ml-2 px-2 py-1 bg-[#012619] text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap border border-[#025940] shadow-lg z-50">
                          {t(item.labelKey)}
                        </div>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Account group */}
          {accountNavItems.length > 0 && (
            <div className="mb-6">
              {!isSidebarCollapsed && (
                <h3 className={`px-4 text-xs font-semibold text-[#72A68E] uppercase tracking-wider mb-2 transition-all duration-300 ${isAnimating ? 'opacity-0' : 'opacity-100'}`}>
                  {t('nav.account')}
                </h3>
              )}
              <div className="space-y-1 px-2">
                {accountNavItems.map(item => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      data-tour={`nav-${item.href}`}
                      href={item.href}
                      onClick={handleNavClick}
                      className={`group relative flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        item.active
                          ? 'bg-[#025940] text-white border-l-4 border-[#72A68E] shadow-sm'
                          : 'text-[#C5D9D0] hover:text-white hover:bg-[#025940]/50 border-l-4 border-transparent hover:border-[#025940]'
                      }`}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      {!isSidebarCollapsed && (
                        <span className={`ml-3 whitespace-nowrap transition-all duration-300 ${isAnimating ? 'opacity-0' : 'opacity-100'}`}>
                          {t(item.labelKey)}
                        </span>
                      )}
                      {isSidebarCollapsed && (
                        <div className="absolute left-full ml-2 px-2 py-1 bg-[#012619] text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap border border-[#025940] shadow-lg z-50">
                          {t(item.labelKey)}
                        </div>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar bottom actions */}
        <div className="border-t border-[#025940] p-4 space-y-2 flex-shrink-0">
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} text-[#C5D9D0] hover:text-white transition-colors`}>
            {!isSidebarCollapsed && (
              <span className={`text-sm transition-all duration-300 ${isAnimating ? 'opacity-0' : 'opacity-100'}`}>
                {t('nav.notifications')}
              </span>
            )}
            <NotificationBell inSidebar={true} />
          </div>

          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} text-[#C5D9D0] hover:text-white transition-colors`}>
            {!isSidebarCollapsed && (
              <span className={`text-sm transition-all duration-300 ${isAnimating ? 'opacity-0' : 'opacity-100'}`}>
                {t('nav.theme')}
              </span>
            )}
            <UserThemeToggle />
          </div>

          {user && (
            <div className={`pt-2 border-t border-[#025940] ${isSidebarCollapsed ? 'text-center' : ''} transition-all duration-300 ${isAnimating ? 'opacity-0' : 'opacity-100'}`}>
              {!isSidebarCollapsed && (
                <div className="mb-2">
                  <p className="text-xs font-medium text-white truncate">{user.displayName || 'User'}</p>
                  <p className="text-xs text-[#72A68E] truncate">{user.email}</p>
                </div>
              )}
              <Button
                onClick={handleLogout}
                variant="ghost"
                size="sm"
                className={`text-red-400 hover:text-red-300 hover:bg-red-900/20 ${isSidebarCollapsed ? 'w-full justify-center px-0' : 'w-full justify-start'}`}
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                {!isSidebarCollapsed && (
                  <span className={`ml-2 transition-all duration-300 ${isAnimating ? 'opacity-0' : 'opacity-100'}`}>
                    {t('nav.logout')}
                  </span>
                )}
              </Button>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

// ─── Reusable bottom nav tab ─────────────────────────────────────────────────
function BottomNavItem({
  href,
  label,
  Icon,
  active,
  onClick,
}: {
  href: string
  label: string
  Icon: React.ComponentType<{ className?: string }>
  active: boolean
  onClick: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 min-w-[52px] active:scale-95 transition-transform"
    >
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
          active
            ? 'bg-[#025940] shadow-md shadow-[#025940]/40'
            : 'bg-transparent'
        }`}
      >
        <Icon
          className={`w-6 h-6 transition-all duration-200 ${
            active ? 'text-white' : 'text-[#72A68E]'
          }`}
        />
      </div>
      <span
        className={`text-[9px] font-semibold leading-none transition-colors ${
          active ? 'text-[#b3f243]' : 'text-[#4a6a5a]'
        }`}
      >
        {label}
      </span>
    </Link>
  )
}