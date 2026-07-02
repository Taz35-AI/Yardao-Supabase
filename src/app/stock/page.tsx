// src/app/stock/page.tsx
// Stock Management Page with tabs: Stock | Order History | Parts Used Today (admin) | Invoicing (admin)
// ✅ UPDATED: Sticky tab bar, compact mobile header, brand colours
// ✅ NEW: Parts Used Today tab (admin only)

'use client'

import React, { useState, useEffect } from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Navigation } from '@/components/Navigation'
import { Package, FileText, History, TrendingDown } from 'lucide-react'
import { StockTab } from '@/components/stock/StockTab'
import { InvoicingTab } from '@/components/stock/InvoicingTab'
import { OrderHistoryTab } from '@/components/stock/OrderHistoryTab'
import { PartsUsedTodayTab } from '@/components/stock/PartsUsedTodayTab'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { isAdminRole } from '@/lib/permissions'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

export default function StockPage() {
  const t = useT()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'stock' | 'history' | 'usedtoday' | 'invoicing'>('stock')
  const [userProfile, setUserProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  // Bumped by the mobile bottom-nav "+" FAB to open the Add Part modal. We also
  // switch to the Stock tab so it works no matter which tab is showing.
  const [addPartSignal, setAddPartSignal] = useState(0)

  useEffect(() => {
    const handler = () => {
      setActiveTab('stock')
      setAddPartSignal(n => n + 1)
    }
    window.addEventListener('yardao:open-addpart', handler)
    return () => window.removeEventListener('yardao:open-addpart', handler)
  }, [])

  // Load user profile to check admin status
  useEffect(() => {
    const loadProfile = async () => {
      if (user?.uid) {
        try {
          const profile = await userProfileService.getProfile(user.uid)
          setUserProfile(profile)
        } catch (error) {
          logger.error('Error loading profile:', error)
        } finally {
          setLoading(false)
        }
      }
    }
    loadProfile()
  }, [user])

  // Admin OR Garage Manager may SEE the invoicing / used-today tabs (write
  // actions inside are gated separately to owner + Garage Manager).
  const isAdmin = isAdminRole(userProfile?.role)

  // If user tries to access admin tabs but isn't admin, redirect to stock
  useEffect(() => {
    if (!loading && (activeTab === 'invoicing' || activeTab === 'usedtoday') && !isAdmin) {
      setActiveTab('stock')
    }
  }, [activeTab, isAdmin, loading])

  if (loading) {
    return (
      <ProtectedRoute>
        {/* ✅ FIXED: Brand background instead of blue gradient */}
        <div className="min-h-screen bg-[#f6f8f7] dark:bg-gray-900">
          <Navigation />
          <div className="flex items-center justify-center h-screen">
            <div className="animate-spin w-12 h-12 border-4 border-[#025940] border-t-transparent rounded-full" />
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      {/* ✅ FIXED: Brand background instead of blue gradient */}
      <div className="min-h-screen bg-[#f6f8f7] dark:bg-gray-900">
        <Navigation />
        
        {/* FIXED: Match branch-overview padding - w-full with py-1 */}
        <div className="w-full px-2 sm:px-4 lg:px-8 py-1">
          {/* Header - Compact on mobile */}
          <div className="mb-3 sm:mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-[#012619] to-[#025940] flex items-center justify-center flex-shrink-0">
                <Package className="w-4 h-4 sm:w-5 sm:h-5 text-[#b3f243]" />
              </div>
              <div>
                {/* ✅ FIXED: Brand dark green instead of gray-900 */}
                <h1 className="text-xl sm:text-2xl font-extrabold text-[#012619] dark:text-white tracking-tight">
                  {t('stock.page.title')}
                </h1>
                {/* ✅ FIXED: Brand muted green instead of gray-500 */}
                <p className="text-xs sm:text-sm text-[#72A68E] dark:text-gray-400 hidden sm:block">
                  {t('stock.page.subtitle')}
                </p>
              </div>
            </div>
          </div>

          {/* Tab Navigation - Sticky */}
          {/* ✅ FIXED: Brand background + border instead of white/gray */}
          <div className="sticky top-0 z-20 bg-[#f6f8f7]/90 dark:bg-gray-800 backdrop-blur-xl rounded-xl shadow-sm border border-[#e2e8e5] dark:border-gray-700 mb-4">
            {/* ✅ FIXED: Brand border instead of gray */}
            <div className="flex border-b border-[#e2e8e5] dark:border-gray-700 overflow-x-auto">
              <button
                onClick={() => setActiveTab('stock')}
                className={`flex-1 flex items-center justify-center space-x-2 px-4 sm:px-6 py-3 sm:py-3.5 font-semibold text-sm transition-all whitespace-nowrap ${
                  activeTab === 'stock'
                    // ✅ FIXED: Lime underline + dark green text for active tab
                    ? 'text-[#012619] dark:text-[#72A68E] border-b-2 border-[#b3f243] dark:border-[#72A68E]'
                    : 'text-[#72A68E] dark:text-gray-400 hover:text-[#012619] dark:hover:text-white'
                }`}
              >
                <Package className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>{t('stock.page.tabStock')}</span>
              </button>
              
              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 flex items-center justify-center space-x-2 px-4 sm:px-6 py-3 sm:py-3.5 font-semibold text-sm transition-all whitespace-nowrap ${
                  activeTab === 'history'
                    // ✅ FIXED: Lime underline + dark green text for active tab
                    ? 'text-[#012619] dark:text-[#72A68E] border-b-2 border-[#b3f243] dark:border-[#72A68E]'
                    : 'text-[#72A68E] dark:text-gray-400 hover:text-[#012619] dark:hover:text-white'
                }`}
              >
                <History className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>{t('stock.page.tabOrders')}</span>
              </button>
              
              {/* Parts Used Today Tab - Admin Only */}
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('usedtoday')}
                  className={`flex-1 flex items-center justify-center space-x-2 px-4 sm:px-6 py-3 sm:py-3.5 font-semibold text-sm transition-all whitespace-nowrap ${
                    activeTab === 'usedtoday'
                      // ✅ FIXED: Lime underline + dark green text for active tab
                      ? 'text-[#012619] dark:text-[#72A68E] border-b-2 border-[#b3f243] dark:border-[#72A68E]'
                      : 'text-[#72A68E] dark:text-gray-400 hover:text-[#012619] dark:hover:text-white'
                  }`}
                >
                  <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">{t('stock.page.tabUsedToday')}</span>
                  <span className="sm:hidden">{t('stock.page.tabUsedTodayShort')}</span>
                </button>
              )}
              
              {/* Invoicing Tab - Admin Only */}
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('invoicing')}
                  className={`flex-1 flex items-center justify-center space-x-2 px-4 sm:px-6 py-3 sm:py-3.5 font-semibold text-sm transition-all whitespace-nowrap ${
                    activeTab === 'invoicing'
                      // ✅ FIXED: Lime underline + dark green text for active tab
                      ? 'text-[#012619] dark:text-[#72A68E] border-b-2 border-[#b3f243] dark:border-[#72A68E]'
                      : 'text-[#72A68E] dark:text-gray-400 hover:text-[#012619] dark:hover:text-white'
                  }`}
                >
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>{t('stock.page.tabInvoicing')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === 'stock' && <StockTab autoOpenAddSignal={addPartSignal} />}
          {activeTab === 'history' && <OrderHistoryTab />}
          {activeTab === 'usedtoday' && isAdmin && <PartsUsedTodayTab />}
          {activeTab === 'invoicing' && isAdmin && <InvoicingTab />}
        </div>
      </div>
    </ProtectedRoute>
  )
}