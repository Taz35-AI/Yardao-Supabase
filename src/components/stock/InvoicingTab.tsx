// src/components/stock/InvoicingTab.tsx
// 🔥 PREMIUM REDESIGN: Ultra-modern, enterprise-level UI matching StockTab
// ✅ PRESERVED: All features - search, create, view, delete (admin only), status badges
// ✅ NEW: 70% smaller summary cards, glassmorphism, gradient borders, card layout

'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { FileText, Plus, Eye, Search, Trash2, Calendar, Building2, PoundSterling, X, Pencil, FileSpreadsheet } from 'lucide-react'
import { stockService } from '@/lib/services/stockService'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { userProfileService } from '@/lib/firestore'
import { Invoice } from '@/types/stock'
import { CreateInvoiceModal } from './CreateInvoiceModal'
import { ViewInvoiceModal } from './ViewInvoiceModal'
import { ExportInvoicesModal } from './ExportInvoicesModal'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

type PeriodKey = 'today' | '3d' | '7d' | 'all' | 'custom'

const PERIODS: { id: PeriodKey; labelKey: string }[] = [
  { id: 'today', labelKey: 'stock.invoicing.periodToday' },
  { id: '3d', labelKey: 'stock.invoicing.period3d' },
  { id: '7d', labelKey: 'stock.invoicing.period7d' },
  { id: 'all', labelKey: 'stock.invoicing.periodAll' },
  { id: 'custom', labelKey: 'stock.invoicing.periodCustom' },
]

export function InvoicingTab() {
  const t = useT()
  const { user } = useAuth()
  // Only the owner / Garage Manager may create, edit or delete invoices.
  const { canCreateInvoices, canEditInvoices } = usePermissions()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // 📅 Period filter for the list + stats (current day / 3d / 7d / all / custom).
  const [periodKey, setPeriodKey] = useState<PeriodKey>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  // When set, the create modal opens in EDIT mode for this invoice.
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)

  const openCreate = () => {
    if (!canCreateInvoices) { toast.error(t('stock.invoicing.onlyManagerWrite')); return }
    setEditingInvoice(null)
    setShowCreateModal(true)
  }
  const openEdit = (invoice: Invoice) => {
    if (!canEditInvoices) { toast.error(t('stock.invoicing.onlyManagerWrite')); return }
    setEditingInvoice(invoice)
    setShowCreateModal(true)
  }

  // Fetch organizationId and user profile
  useEffect(() => {
    const fetchUserData = async () => {
      if (user?.uid) {
        try {
          const profile = await userProfileService.getProfile(user.uid)
          if (profile?.organizationId) {
            setOrganizationId(profile.organizationId)
            setUserProfile(profile)
          }
        } catch (error) {
          logger.error('Error fetching organization:', error)
          toast.error(t('stock.invoicing.loadOrgFail'))
        }
      }
    }
    fetchUserData()
  }, [user])

  useEffect(() => {
    if (organizationId) {
      loadInvoices()
    }
  }, [organizationId])

  const loadInvoices = async () => {
    if (!organizationId) return
    
    setLoading(true)
    try {
      const data = await stockService.getInvoices(organizationId)
      setInvoices(data)
    } catch (error) {
      logger.error('Error loading invoices:', error)
      toast.error(t('stock.invoicing.loadInvoicesFail'))
    } finally {
      setLoading(false)
    }
  }

  const handleViewInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice)
    setShowViewModal(true)
  }

  const handleDeleteInvoice = async (invoice: Invoice) => {
    // Only owner / Garage Manager may delete an invoice.
    if (!canEditInvoices) {
      toast.error(t('stock.invoicing.onlyManagerWrite'))
      return
    }

    if (!window.confirm(t('stock.invoicing.confirmDelete', { number: invoice.invoiceNumber }))) {
      return
    }

    setDeletingId(invoice.id!)
    try {
      await stockService.deleteInvoice(invoice.id!)
      toast.success(t('stock.invoicing.deleted'))
      await loadInvoices()
    } catch (error) {
      logger.error('Error deleting invoice:', error)
      toast.error(t('stock.invoicing.deleteFail'))
    } finally {
      setDeletingId(null)
    }
  }

  // Period filter → inclusive YYYY-MM-DD bounds (null = all time). invoiceDate
  // is a YYYY-MM-DD string, so plain string comparison is correct.
  const dateBounds = useMemo<{ from: string; to: string } | null>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0)
    const ymd = (x: Date) =>
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
    const todayStr = ymd(d)
    if (periodKey === 'all') return null
    if (periodKey === 'today') return { from: todayStr, to: todayStr }
    if (periodKey === 'custom') {
      if (!customFrom && !customTo) return null
      const from = customFrom || '0000-01-01'
      const to = customTo || todayStr
      return from <= to ? { from, to } : { from: to, to: from }
    }
    const back = periodKey === '3d' ? 2 : 6 // inclusive of today
    const fromD = new Date(d); fromD.setDate(fromD.getDate() - back)
    return { from: ymd(fromD), to: todayStr }
  }, [periodKey, customFrom, customTo])

  // Invoices within the selected period — drives the stat pills. Search narrows
  // the list below but leaves the period summary intact.
  const periodInvoices = useMemo(() => {
    if (!dateBounds) return invoices
    return invoices.filter(inv => {
      const d = inv.invoiceDate || ''
      return d >= dateBounds.from && d <= dateBounds.to
    })
  }, [invoices, dateBounds])

  const filteredInvoices = periodInvoices.filter(inv =>
    inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.vehicleRegistration.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.toCompany.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Summary stats — over the selected period so the pills match what's shown.
  const totalInvoices = periodInvoices.length
  const totalValue = periodInvoices.reduce((sum, inv) => sum + inv.total, 0)
  const paidCount = periodInvoices.filter(inv => inv.status === 'paid').length
  const issuedCount = periodInvoices.filter(inv => inv.status === 'issued').length
  const draftCount = periodInvoices.filter(inv => inv.status === 'draft').length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-[#C5D9D0] border-t-[#025940] rounded-full animate-spin" />
        <p className="ml-4 text-gray-600 dark:text-gray-400 text-sm">{t('stock.invoicing.loading')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 🔥 ULTRA COMPACT STATS - Horizontal Mini Pills (70% smaller on mobile) */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Total Invoices */}
        <div className="group flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-[#025940] dark:hover:border-[#72A68E] hover:shadow-md transition-all cursor-pointer">
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-gradient-to-br from-[#025940] to-[#012619] flex items-center justify-center flex-shrink-0">
            <FileText className="w-3 h-3 sm:w-4 sm:h-4 text-[#b3f243]" />
          </div>
          <div>
            <p className="text-[9px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide leading-tight">{t('stock.invoicing.statTotal')}</p>
            <p className="text-sm sm:text-lg font-black text-gray-900 dark:text-white leading-tight">{totalInvoices}</p>
          </div>
        </div>

        {/* Total Value */}
        <div className="group flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-[#025940] dark:hover:border-[#72A68E] hover:shadow-md transition-all cursor-pointer">
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center flex-shrink-0">
            <PoundSterling className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
          </div>
          <div>
            <p className="text-[9px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide leading-tight">{t('stock.invoicing.statValue')}</p>
            <p className="text-sm sm:text-lg font-black text-gray-900 dark:text-white leading-tight">£{totalValue.toFixed(0)}</p>
          </div>
        </div>

        {/* Paid */}
        <div className="group flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 hover:border-green-400 dark:hover:border-green-600 hover:shadow-md transition-all cursor-pointer">
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center flex-shrink-0">
            <FileText className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
          </div>
          <div>
            <p className="text-[9px] sm:text-xs text-green-700 dark:text-green-400 font-medium uppercase tracking-wide leading-tight">{t('stock.invoicing.statPaid')}</p>
            <p className="text-sm sm:text-lg font-black text-green-900 dark:text-green-100 leading-tight">{paidCount}</p>
          </div>
        </div>

        {/* Issued */}
        <div className="group flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-md transition-all cursor-pointer">
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
            <FileText className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
          </div>
          <div>
            <p className="text-[9px] sm:text-xs text-blue-700 dark:text-blue-400 font-medium uppercase tracking-wide leading-tight">{t('stock.invoicing.statIssued')}</p>
            <p className="text-sm sm:text-lg font-black text-blue-900 dark:text-blue-100 leading-tight">{issuedCount}</p>
          </div>
        </div>

        {/* Draft */}
        <div className="group flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 hover:shadow-md transition-all cursor-pointer">
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center flex-shrink-0">
            <FileText className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
          </div>
          <div>
            <p className="text-[9px] sm:text-xs text-gray-600 dark:text-gray-400 font-medium uppercase tracking-wide leading-tight">{t('stock.invoicing.statDraft')}</p>
            <p className="text-sm sm:text-lg font-black text-gray-900 dark:text-gray-100 leading-tight">{draftCount}</p>
          </div>
        </div>
      </div>

      {/* 📅 Period filter — narrows the list AND the stat pills to a date window */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriodKey(p.id)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
              periodKey === p.id
                ? 'bg-[#025940] text-white border-[#025940]'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-[#72A68E]'
            }`}
          >
            {t(p.labelKey)}
          </button>
        ))}
        {periodKey === 'custom' && (
          <div className="flex items-center gap-1.5 ml-1">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              aria-label={t('stock.invoicing.periodFrom')}
              className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-[#025940] focus:ring-1 focus:ring-[#025940]/30 outline-none"
            />
            <span className="text-xs text-gray-400">–</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              aria-label={t('stock.invoicing.periodTo')}
              className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-[#025940] focus:ring-1 focus:ring-[#025940]/30 outline-none"
            />
          </div>
        )}
      </div>

      {/* 🔥 PREMIUM ACTION BAR - Glass Effect */}
      <div className="sticky top-0 z-30 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl py-3 -mx-2 px-2 sm:-mx-4 sm:px-4 lg:-mx-8 lg:px-8 border-b border-gray-200/60 dark:border-gray-700/60 shadow-sm">
        <div className="flex gap-2 items-center flex-wrap">
          {/* Search - Glass Effect */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#72A68E]" />
            <input
              type="text"
              placeholder={t('stock.invoicing.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] dark:focus:border-[#72A68E] transition-all text-sm font-medium"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Export to Excel */}
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-sm font-semibold bg-white dark:bg-gray-800 border border-[#025940]/40 dark:border-[#72A68E]/40 text-[#025940] dark:text-[#72A68E] hover:bg-[#025940]/8 dark:hover:bg-[#025940]/20 transition-colors whitespace-nowrap"
            title={t('stock.export.title')}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>{t('stock.export.button')}</span>
          </button>

          {/* Create Invoice Button - Hero CTA — owner / Garage Manager only */}
          {canCreateInvoices && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-sm font-bold bg-gradient-to-r from-[#025940] to-[#012619] text-[#b3f243] shadow-lg shadow-[#025940]/30 transition-all hover:shadow-xl hover:shadow-[#025940]/40 hover:scale-105 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>{t('stock.invoicing.createInvoice')}</span>
          </button>
          )}
        </div>

        {/* Result count */}
        <div className="mt-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
          {t(filteredInvoices.length === 1 ? 'stock.invoicing.countOne' : 'stock.invoicing.countMany', { count: filteredInvoices.length })}
          {searchTerm && t('stock.invoicing.filteredFrom', { total: invoices.length })}
        </div>
      </div>

      {/* 🔥 PREMIUM INVOICES LIST - Card Layout */}
      {filteredInvoices.length === 0 ? (
        <div className="py-12 text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <FileText className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {searchTerm ? t('stock.invoicing.emptyFound') : t('stock.invoicing.emptyYet')}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {searchTerm ? t('stock.invoicing.emptyTrySearch') : t('stock.invoicing.emptyCreateFirst')}
          </p>
          {!searchTerm && canCreateInvoices && (
            <button
              onClick={openCreate}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-[#025940] to-[#012619] text-[#b3f243] shadow-lg shadow-[#025940]/30 hover:scale-105 transition-all"
            >
              <Plus className="w-4 h-4 inline mr-1.5" />
              {t('stock.invoicing.createFirst')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredInvoices.map((invoice) => (
            <div
              key={invoice.id}
              className="group bg-white dark:bg-gray-800 rounded-xl border-l-4 border-l-[#025940] border-gray-200 dark:border-gray-700 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 relative overflow-hidden"
            >
              {/* Gradient border on hover */}
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#025940]/0 via-[#72A68E]/0 to-[#b3f243]/0 group-hover:from-[#025940]/10 group-hover:via-[#72A68E]/10 group-hover:to-[#b3f243]/10 transition-all duration-300 pointer-events-none" />
              
              {/* Main Row */}
              <div className="relative flex items-center p-3 sm:p-4 gap-3 flex-wrap sm:flex-nowrap">
                {/* Invoice Number & Date */}
                <div className="flex flex-col min-w-[120px]">
                  <span className="text-sm font-bold text-gray-900 dark:text-white font-mono">
                    {invoice.invoiceNumber}
                  </span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3 h-3 text-gray-400" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(invoice.invoiceDate).toLocaleDateString('en-GB')}
                    </span>
                  </div>
                </div>

                {/* Vehicle & Company Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      {invoice.vehicleRegistration}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Building2 className="w-3 h-3 text-[#025940] dark:text-[#72A68E]" />
                    <span className="truncate">{invoice.toCompany}</span>
                  </div>
                </div>

                {/* Total Amount */}
                <div className="text-right min-w-[80px]">
                  <p className="text-sm sm:text-lg font-black text-[#025940] dark:text-[#72A68E]">
                    £{invoice.total.toFixed(2)}
                  </p>
                </div>

                {/* Status Badge */}
                <div className="flex-shrink-0">
                  <span className={`inline-flex px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-semibold ${
                    invoice.status === 'paid' 
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : invoice.status === 'issued'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}>
                    {t(invoice.status === 'paid' ? 'stock.invoicing.statusPaid' : invoice.status === 'issued' ? 'stock.invoicing.statusIssued' : 'stock.invoicing.statusDraft')}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* View Button */}
                  <button
                    onClick={() => handleViewInvoice(invoice)}
                    className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                    title={t('stock.invoicing.viewInvoice')}
                  >
                    <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>

                  {/* Edit Button — owner / Garage Manager only */}
                  {canEditInvoices && (
                  <button
                    onClick={() => openEdit(invoice)}
                    className="p-2 text-[#025940] dark:text-[#72A68E] hover:bg-[#025940]/10 dark:hover:bg-[#025940]/20 rounded-lg transition-all"
                    title={t('stock.invoicing.editInvoice')}
                  >
                    <Pencil className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  )}

                  {/* Delete Button — owner / Garage Manager only */}
                  {canEditInvoices && (
                    <button
                      onClick={() => handleDeleteInvoice(invoice)}
                      disabled={deletingId === invoice.id}
                      className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all disabled:opacity-50"
                      title={t('stock.invoicing.deleteInvoice')}
                    >
                      {deletingId === invoice.id ? (
                        <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-red-600/30 border-t-red-600 rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      <CreateInvoiceModal
        isOpen={showCreateModal}
        editInvoice={editingInvoice}
        onClose={() => {
          setShowCreateModal(false)
          setEditingInvoice(null)
        }}
        onSuccess={loadInvoices}
      />

      <ViewInvoiceModal
        isOpen={showViewModal}
        onClose={() => {
          setShowViewModal(false)
          setSelectedInvoice(null)
        }}
        invoice={selectedInvoice}
        onStatusChange={loadInvoices}
        onEdit={(inv) => {
          setShowViewModal(false)
          setSelectedInvoice(null)
          openEdit(inv)
        }}
      />

      <ExportInvoicesModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        invoices={invoices}
        organizationId={organizationId}
      />
    </div>
  )
}