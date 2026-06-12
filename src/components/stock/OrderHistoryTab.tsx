// src/components/stock/OrderHistoryTab.tsx
// 🔥 PREMIUM REDESIGN: calm, flat, brand-first UI matching StockTab (visual only)
// ✅ PRESERVED: Every single feature - individual delete, delete all, filtering, sorting
// ✅ STYLE RULES: no gradients/glow/scale effects; white cards + #e2e8e5 hairlines;
//    status = dots; solid #025940 primary buttons; red outline for destructive

'use client'

import React, { useState, useEffect } from 'react'
import { Package, Calendar, User, TrendingUp, Building2, Trash2, AlertTriangle, PoundSterling } from 'lucide-react'
import { stockService } from '@/lib/services/stockService'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { OrderHistoryRecord } from '@/types/stock'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

export function OrderHistoryTab() {
  const t = useT()
  const { user } = useAuth()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [orders, setOrders] = useState<OrderHistoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deletingSingleId, setDeletingSingleId] = useState<string | null>(null)

  // Fetch organizationId
  useEffect(() => {
    const fetchOrganizationId = async () => {
      if (user?.uid) {
        try {
          const profile = await userProfileService.getProfile(user.uid)
          if (profile?.organizationId) {
            setOrganizationId(profile.organizationId)
          }
        } catch (error) {
          logger.error('Error fetching organization:', error)
          toast.error(t('stock.orders.loadOrgFail'))
        }
      }
    }
    fetchOrganizationId()
  }, [user])

  // Load order history
  useEffect(() => {
    if (organizationId) {
      loadOrders()
    }
  }, [organizationId])

  const loadOrders = async () => {
    if (!organizationId) return
    
    setLoading(true)
    try {
      const history = await stockService.getOrderHistory(organizationId)
      setOrders(history)
    } catch (error) {
      logger.error('Error loading order history:', error)
      toast.error(t('stock.orders.loadHistoryFail'))
    } finally {
      setLoading(false)
    }
  }

  // DELETE ALL HISTORY
  const handleDeleteAllHistory = async () => {
    if (!organizationId) return
    
    setDeleting(true)
    try {
      await stockService.deleteAllOrderHistory(organizationId)
      toast.success(t('stock.orders.allDeleted'))
      setOrders([])
      setShowDeleteAllModal(false)
    } catch (error) {
      logger.error('Error deleting all history:', error)
      toast.error(t('stock.orders.deleteHistoryFail'))
    } finally {
      setDeleting(false)
    }
  }

  // DELETE SINGLE ORDER
  const handleDeleteOrder = async (orderId: string, partName: string, quantity: number) => {
    if (!confirm(t('stock.orders.confirmDeleteOrder', { qty: quantity, name: partName }))) {
      return
    }

    setDeletingSingleId(orderId)
    try {
      await stockService.deleteOrderHistoryRecord(orderId)
      toast.success(t('stock.orders.orderDeleted'))
      loadOrders()
    } catch (error) {
      logger.error('Error deleting order:', error)
      toast.error(t('stock.orders.deleteOrderFail'))
    } finally {
      setDeletingSingleId(null)
    }
  }

  // Calculate totals
  const totalOrders = orders.length
  const totalValue = orders.reduce((sum, order) => sum + order.totalCost, 0)
  const totalItems = orders.reduce((sum, order) => sum + order.quantityOrdered, 0)

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-[#C5D9D0] border-t-[#025940] rounded-full animate-spin" />
        <p className="ml-4 text-gray-600 dark:text-gray-400 text-sm">{t('stock.orders.loading')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 🔥 ULTRA COMPACT STATS - Horizontal Mini Pills (70% smaller on mobile) */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Total Orders */}
        <div className="group flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 hover:border-[#72A68E] dark:hover:border-[#72A68E] transition-colors cursor-pointer">
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-[#012619] flex items-center justify-center flex-shrink-0">
            <Package className="w-3 h-3 sm:w-4 sm:h-4 text-[#b3f243]" />
          </div>
          <div>
            <p className="text-[9px] sm:text-xs text-[#72A68E] dark:text-gray-400 font-medium uppercase tracking-wide leading-tight">{t('stock.orders.statOrders')}</p>
            <p className="text-sm sm:text-lg font-semibold tabular-nums text-[#012619] dark:text-white leading-tight">{totalOrders}</p>
          </div>
        </div>

        {/* Total Value */}
        <div className="group flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 hover:border-[#72A68E] dark:hover:border-[#72A68E] transition-colors cursor-pointer">
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-[#012619] flex items-center justify-center flex-shrink-0">
            <PoundSterling className="w-3 h-3 sm:w-4 sm:h-4 text-[#b3f243]" />
          </div>
          <div>
            <p className="text-[9px] sm:text-xs text-[#72A68E] dark:text-gray-400 font-medium uppercase tracking-wide leading-tight">{t('stock.orders.statValue')}</p>
            <p className="text-sm sm:text-lg font-semibold tabular-nums text-[#012619] dark:text-white leading-tight">£{totalValue.toFixed(0)}</p>
          </div>
        </div>

        {/* Total Items */}
        <div className="group flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 hover:border-[#72A68E] dark:hover:border-[#72A68E] transition-colors cursor-pointer">
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-[#012619] flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-[#b3f243]" />
          </div>
          <div>
            <p className="text-[9px] sm:text-xs text-[#72A68E] dark:text-gray-400 font-medium uppercase tracking-wide leading-tight">{t('stock.orders.statItems')}</p>
            <p className="text-sm sm:text-lg font-semibold tabular-nums text-[#012619] dark:text-white leading-tight">{Math.round(totalItems)}</p>
          </div>
        </div>
      </div>

      {/* 🔥 PREMIUM ACTION BAR - Glass Effect */}
      <div className="sticky top-0 z-30 bg-[#f6f8f7] dark:bg-gray-900 py-3 -mx-2 px-2 sm:-mx-4 sm:px-4 lg:-mx-8 lg:px-8 border-b border-[#e2e8e5] dark:border-gray-700/60">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-[#025940] dark:text-[#72A68E]" />
            <span className="text-sm sm:text-base font-semibold text-[#012619] dark:text-white">
              {t('stock.orders.last3Months')}
            </span>
            <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              ({t(totalOrders === 1 ? 'stock.orders.countOne' : 'stock.orders.countMany', { count: totalOrders })})
            </span>
          </div>

          {/* Delete All Button */}
          <button
            onClick={() => setShowDeleteAllModal(true)}
            disabled={orders.length === 0}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-sm font-semibold bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">{t('stock.orders.deleteAllHistory')}</span>
            <span className="sm:hidden">{t('stock.orders.deleteAll')}</span>
          </button>
        </div>
      </div>

      {/* 🔥 PREMIUM ORDER CARDS - Gradient borders, hover effects */}
      {orders.length === 0 ? (
        <div className="py-12 text-center">
          <div className="w-20 h-20 bg-[#f0f7f4] dark:bg-[#025940]/20 border border-[#e2e8e5] dark:border-[#025940]/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Package className="w-10 h-10 text-[#72A68E]" />
          </div>
          <h3 className="text-xl font-semibold text-[#012619] dark:text-white mb-2">
            {t('stock.orders.emptyTitle')}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('stock.orders.emptyBody')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <div
              key={order.id}
              className="group bg-white dark:bg-gray-800 rounded-xl border border-[#e2e8e5] dark:border-gray-700 border-l-4 border-l-[#72A68E] transition-shadow duration-200 hover:shadow-sm relative overflow-hidden"
            >

              {/* Main Row */}
              <div className="relative flex items-center p-3 sm:p-4 gap-3 flex-wrap sm:flex-nowrap">
                {/* Date */}
                <div className="flex items-center gap-2 min-w-[100px] sm:min-w-[120px]">
                  <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-900 dark:text-white font-medium">
                    {formatDate(order.orderedAt)}
                  </span>
                </div>

                {/* Part Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-semibold text-[#012619] dark:text-white truncate">
                      {order.partName}
                    </span>
                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-lg text-[10px] sm:text-xs font-mono text-gray-700 dark:text-gray-300 flex-shrink-0">
                      {order.partNumber}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                    {order.supplier ? (
                      <>
                        <Building2 className="w-3 h-3 text-[#025940] dark:text-[#72A68E]" />
                        <span>{order.supplier}</span>
                      </>
                    ) : (
                      <span>{t('stock.orders.noSupplier')}</span>
                    )}
                    <span className="text-gray-400">•</span>
                    <User className="w-3 h-3" />
                    <span>{order.orderedByName}</span>
                  </div>
                </div>

                {/* Quantity Badge */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="px-3 py-1.5 rounded-xl text-xs font-semibold tabular-nums bg-[#f0f7f4] dark:bg-[#025940]/20 text-[#025940] dark:text-[#72A68E]">
                    {order.unit === 'pieces' ? Math.round(order.quantityOrdered) : order.quantityOrdered.toFixed(1)} {order.unit}
                  </div>
                </div>

                {/* Price Info */}
                <div className="text-right min-w-[80px] sm:min-w-[100px]">
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    £{order.netPrice.toFixed(2)} {t('stock.orders.each')}
                  </p>
                  <p className="text-sm sm:text-lg font-semibold tabular-nums text-[#025940] dark:text-[#72A68E]">
                    £{order.totalCost.toFixed(2)}
                  </p>
                </div>

                {/* Type Badge */}
                <div className="flex-shrink-0">
                  <span className={`inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-medium ${
                    order.orderType === 'initial'
                      ? 'text-gray-600 dark:text-gray-400'
                      : 'text-[#025940] dark:text-[#72A68E]'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      order.orderType === 'initial' ? 'bg-gray-400' : 'bg-[#025940] dark:bg-[#72A68E]'
                    }`}></span>
                    {order.orderType === 'initial' ? t('stock.orders.typeInitial') : t('stock.orders.typeRestock')}
                  </span>
                </div>

                {/* Delete Button */}
                <button
                  onClick={() => handleDeleteOrder(order.id!, order.partName, order.quantityOrdered)}
                  disabled={deletingSingleId === order.id}
                  className="flex-shrink-0 p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all disabled:opacity-50"
                  title={t('stock.orders.deleteOrder')}
                >
                  {deletingSingleId === order.id ? (
                    <div className="w-5 h-5 border-2 border-red-600/30 border-t-red-600 rounded-full animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 🔥 PREMIUM DELETE ALL MODAL */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-red-200 dark:border-red-800 animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-white" />
              </div>

              <h3 className="text-2xl font-semibold text-center text-[#012619] dark:text-white mb-2">
                {t('stock.orders.delAllTitle')}
              </h3>

              <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
                {t('stock.orders.delAllBody1')} <span className="font-bold text-red-600 dark:text-red-400">{orders.length}</span> {t('stock.orders.delAllBody2')}
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteAllModal(false)}
                  disabled={deleting}
                  className="flex-1 px-4 py-3 bg-white dark:bg-gray-700 text-[#012619] dark:text-gray-200 border border-[#e2e8e5] dark:border-gray-600 hover:bg-[#f6f8f7] dark:hover:bg-gray-600 rounded-xl font-semibold transition-colors disabled:opacity-50"
                >
                  {t('stock.btn.cancel')}
                </button>
                <button
                  onClick={handleDeleteAllHistory}
                  disabled={deleting}
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>{t('stock.orders.deleting')}</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-5 h-5" />
                      <span>{t('stock.orders.deleteAll')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}