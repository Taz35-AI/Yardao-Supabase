// src/hooks/common/useNavigation.ts - Updated with Deliveries & Defleet and improved logout
'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { appNavigate } from '@/lib/nav'
import {
  LayoutDashboard,
  Car, 
  History, 
  Settings, 
  User,
  Calendar,
  Truck
} from 'lucide-react'
import { logger } from '@/lib/logger'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<any>
  active: boolean
}

export function useNavigation() {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // Navigation items - UPDATED with Deliveries & Defleet
  const navItems: NavItem[] = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      active: pathname === '/dashboard'
    },
    {
      label: 'Fleet Inventory',
      href: '/fleet',
      icon: Car,
      active: pathname === '/fleet'
    },
    {
      label: 'Service Bookings',
      href: '/service-bookings',
      icon: Calendar,
      active: pathname === '/service-bookings'
    },
    {
      label: 'Deliveries & Defleet',
      href: '/deliveries-defleet',
      icon: Truck,
      active: pathname === '/deliveries-defleet'
    },
    {
      label: 'Checkout History',
      href: '/checkout-history',
      icon: History,
      active: pathname === '/checkout-history'
    },
    {
      label: 'Profile',
      href: '/profile',
      icon: User,
      active: pathname === '/profile'
    },
    {
      label: 'Settings',
      href: '/settings',
      icon: Settings,
      active: pathname === '/settings'
    }
  ]

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  const toggleMobileMenu = () => setIsMobileMenuOpen(open => !open)
  const closeMobileMenu  = () => setIsMobileMenuOpen(false)

  const handleLogout = async () => {
    try {
      // Close any open menus first
      closeMobileMenu()
      
      // Call logout from AuthContext
      // Note: The logout function in AuthContext now handles the redirect
      // using window.location.href, so we don't need router.push here
      await logout()
      
      // The logout function in AuthContext already handles the redirect,
      // but keeping this as a fallback won't hurt since the page will
      // already be navigating away
    } catch (error) {
      logger.error('Error signing out:', error)
      // Force redirect even on error as a fallback
      appNavigate('/login')
    }
  }

  return {
    user,
    navItems,
    isMobileMenuOpen,
    toggleMobileMenu,
    closeMobileMenu,
    handleLogout,
    pathname
  }
}