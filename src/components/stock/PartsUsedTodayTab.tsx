// src/components/stock/PartsUsedTodayTab.tsx
// 🔥 COMPACT REDESIGN: Accordion rows — all features preserved
// ✅ PRESERVED: All features - daily tracking, midnight reset, stock levels, grouping
// ✅ NEW: Collapsible rows save ~60% vertical space, inline stock status, single-line header

'use client'

import React, { useState, useEffect } from 'react'
import { Package, Calendar, TrendingDown, AlertCircle, RefreshCw, Layers, PoundSterling, Clock, ChevronDown } from 'lucide-react'
import { stockService } from '@/lib/services/stockService'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { PartUsageRecord, StockPart } from '@/types/stock'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

export function PartsUsedTodayTab() {
  const t = useT()
  const { user } = useAuth()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [usageRecords, setUsageRecords] = useState<PartUsageRecord[]>([])
  const [todayRecords, setTodayRecords] = useState<PartUsageRecord[]>([])
  const [stockParts, setStockParts] = useState<StockPart[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggleExpanded = (partId: string) => {
    setExpanded(prev => ({ ...prev, [partId]: !prev[partId] }))
  }

  // Fetch organization
  useEffect(() => {
    const fetchOrg = async () => {
      if (user?.uid) {
        try {
          const profile = await userProfileService.getProfile(user.uid)
          if (profile?.organizationId) {
            setOrganizationId(profile.organizationId)
          }
        } catch (error) {
          logger.error('Error fetching organization:', error)
        }
      }
    }
    fetchOrg()
  }, [user])

  // Load usage records and current stock
  const loadUsageRecords = async () => {
    if (!organizationId) return

    setLoading(true)
    try {
      // Load usage records
      const records = await stockService.getAllUsageRecords(organizationId)
      setUsageRecords(records)

      // Load current stock levels
      const parts = await stockService.getParts(organizationId)
      setStockParts(parts)

      // Filter for today's records
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayISO = today.toISOString()

      const todaysUsage = records.filter(record => {
        const recordDate = new Date(record.usedAt)
        recordDate.setHours(0, 0, 0, 0)
        return recordDate.toISOString() === todayISO
      })

      setTodayRecords(todaysUsage)
    } catch (error) {
      logger.error('Error loading usage records:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsageRecords()
  }, [organizationId])

  // Get current stock level for a part
  const getCurrentStock = (partId: string): { quantity: number; unit: string } | null => {
    const part = stockParts.find(p => p.id === partId)
    return part ? { quantity: part.quantity, unit: part.unit } : null
  }

  // Group records by part
  const groupedByPart = todayRecords.reduce((acc, record) => {
    const key = record.partId
    if (!acc[key]) {
      acc[key] = {
        partName: record.partName,
        partNumber: record.partNumber,
        totalQuantity: 0,
        totalCost: 0,
        unit: record.unit,
        records: []
      }
    }
    acc[key].totalQuantity += record.quantityUsed
    acc[key].totalCost += record.totalCost
    acc[key].records.push(record)
    return acc
  }, {} as Record<string, {
    partName: string
    partNumber: string
    totalQuantity: number
    totalCost: number
    unit: string
    records: PartUsageRecord[]
  }>)

  const totalPartsUsed = Object.keys(groupedByPart).length
  const totalQuantity = Object.values(groupedByPart).reduce((sum, group) => sum + group.totalQuantity, 0)
  const totalValue = Object.values(groupedByPart).reduce((sum, group) => sum + group.totalCost, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-[#C5D9D0] border-t-[#025940] rounded-full animate-spin" />
        <p className="ml-4 text-gray-600 dark:text-gray-400 text-sm">{t('stock.usedToday.loading')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">

      {/* ── SINGLE-ROW HEADER: title + stat pills + refresh ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">

        {/* Title + date */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#025940] to-[#012619] flex items-center justify-center flex-shrink-0">
            <Calendar className="w-4 h-4 text-[#b3f243]" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white leading-none">{t('stock.usedToday.title')}</p>
            <p className="text-[10px] text-[#72A68E] mt-0.5">
              {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{t('stock.usedToday.resetsMidnight')}
            </p>
          </div>
        </div>

        {/* Stat pills + refresh */}
        <div className="flex items-center gap-2 flex-wrap">

          {/* Parts Used */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-[#025940] to-[#012619] flex items-center justify-center flex-shrink-0">
              <Package className="w-3 h-3 text-[#b3f243]" />
            </div>
            <span className="text-xs font-black text-gray-900 dark:text-white">{totalPartsUsed}</span>
            <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">{t('stock.usedToday.statParts')}</span>
          </div>

          {/* Total Quantity */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center flex-shrink-0">
              <TrendingDown className="w-3 h-3 text-white" />
            </div>
            <span className="text-xs font-black text-gray-900 dark:text-white">{totalQuantity}</span>
            <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">{t('stock.usedToday.statQty')}</span>
          </div>

          {/* Total Value */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center flex-shrink-0">
              <PoundSterling className="w-3 h-3 text-white" />
            </div>
            <span className="text-xs font-black text-gray-900 dark:text-white">£{totalValue.toFixed(0)}</span>
            <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">{t('stock.usedToday.statValue')}</span>
          </div>

          {/* Refresh */}
          <button
            onClick={loadUsageRecords}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-[#025940] to-[#012619] text-[#b3f243] shadow-lg shadow-[#025940]/30 hover:shadow-xl hover:shadow-[#025940]/40 hover:scale-105 transition-all whitespace-nowrap"
            title={t('stock.usedToday.refresh')}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('stock.usedToday.refresh')}</span>
          </button>
        </div>
      </div>

      {/* ── INFO BANNER ── */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-800">
        <AlertCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
        <p className="text-xs text-gray-700 dark:text-gray-300">
          <span className="font-bold">{t('stock.usedToday.autoResets')}</span> {t('stock.usedToday.prevDays')}
        </p>
      </div>

      {/* ── PARTS LIST ── */}
      {totalPartsUsed === 0 ? (
        <div className="py-12 text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">{t('stock.usedToday.emptyTitle')}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('stock.usedToday.emptyBody')}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {Object.entries(groupedByPart)
            .sort((a, b) => b[1].totalCost - a[1].totalCost)
            .map(([partId, group]) => {
              const currentStock = getCurrentStock(partId)
              const stockStatus = currentStock
                ? currentStock.quantity < 5
                  ? 'critical'
                  : currentStock.quantity < 10
                  ? 'low'
                  : 'ok'
                : null
              const isOpen = expanded[partId]

              return (
                <div
                  key={partId}
                  className="group bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 border-l-[#025940] overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 relative"
                >
                  {/* Gradient overlay on hover */}
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#025940]/0 via-[#72A68E]/0 to-[#b3f243]/0 group-hover:from-[#025940]/5 group-hover:via-[#72A68E]/5 group-hover:to-[#b3f243]/5 transition-all duration-300 pointer-events-none" />

                  {/* ── Clickable summary row ── */}
                  <button
                    onClick={() => toggleExpanded(partId)}
                    className="relative w-full flex items-center gap-2 sm:gap-3 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                  >
                    {/* Part name + number */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-white truncate leading-none">
                        {group.partName}
                      </p>
                      <p className="text-[10px] text-[#72A68E] font-mono mt-0.5">{group.partNumber}</p>
                    </div>

                    {/* Stock badge — preserves critical/low/ok logic */}
                    {currentStock && (
                      <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md flex-shrink-0 whitespace-nowrap ${
                        stockStatus === 'critical'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          : stockStatus === 'low'
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                          : 'bg-[#C5D9D0]/40 dark:bg-[#025940]/20 text-[#025940] dark:text-[#72A68E]'
                      }`}>
                        <Layers className="w-3 h-3 flex-shrink-0" />
                        {currentStock.quantity} {currentStock.unit}
                        {stockStatus === 'critical' && t('stock.usedToday.critical')}
                        {stockStatus === 'low' && t('stock.usedToday.low')}
                      </span>
                    )}

                    {/* Qty used pill */}
                    <span className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-gradient-to-r from-[#025940] to-[#012619] text-[#b3f243] text-xs font-black shadow-md">
                      {group.totalQuantity} {group.unit}
                    </span>

                    {/* Cost */}
                    <span className="flex-shrink-0 text-xs font-bold text-emerald-600 dark:text-emerald-400 min-w-[52px] text-right">
                      £{group.totalCost.toFixed(2)}
                    </span>

                    {/* Expand chevron */}
                    <ChevronDown className={`w-4 h-4 flex-shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* ── Expanded usage records ── */}
                  {isOpen && (
                    <div className="relative border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                      {group.records.map((record, idx) => (
                        <div
                          key={record.id || idx}
                          className="flex items-start gap-3 px-3 py-2.5 hover:bg-[#025940]/5 dark:hover:bg-[#025940]/10 transition-colors"
                        >
                          {/* Reg plate */}
                          <span className="flex-shrink-0 px-2 py-0.5 rounded-md bg-[#012619] text-[#b3f243] text-xs font-black font-mono tracking-wide">
                            {record.vehicleRegistration}
                          </span>

                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-semibold text-[#025940] dark:text-[#72A68E]">
                                {record.usedByName}
                              </span>
                              <Clock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {new Date(record.usedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            {record.notes && (
                              <div className="mt-1.5 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                <p className="text-xs text-gray-700 dark:text-gray-300">
                                  💬 {record.notes}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Qty + cost */}
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs font-black text-gray-900 dark:text-white">
                              {record.quantityUsed} {record.unit}
                            </p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400">
                              £{record.totalCost.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}