// src/components/stock/ExportInvoicesModal.tsx
// 📊 Export completed jobs to Excel — ONE ROW PER COMPLETED BOOKING in the
// chosen date range (so cash / un-invoiced jobs still appear). Labour from the
// booking, parts cost from the parts logged to the job, invoice net/gross
// joined in when a matching invoice exists.

'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { X, FileSpreadsheet, Download } from 'lucide-react'
import { Invoice } from '@/types/stock'
import { supabase } from '@/lib/supabaseClient'
import { toCamelList } from '@/lib/dbMap'
import {
  RangeKey,
  JobBooking,
  getRangeDates,
  inRange,
  buildJobReportRows,
  downloadInvoiceReport,
} from '@/lib/utils/invoiceReport'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

interface ExportInvoicesModalProps {
  isOpen: boolean
  onClose: () => void
  invoices: Invoice[]
  organizationId: string | null
}

const RANGES: { key: RangeKey; labelKey: string }[] = [
  { key: '7d', labelKey: 'stock.export.last7' },
  { key: '30d', labelKey: 'stock.export.last30' },
  { key: '3m', labelKey: 'stock.export.last3m' },
  { key: '6m', labelKey: 'stock.export.last6m' },
  { key: 'custom', labelKey: 'stock.export.custom' },
]

export function ExportInvoicesModal({ isOpen, onClose, invoices, organizationId }: ExportInvoicesModalProps) {
  const t = useT()
  const [rangeKey, setRangeKey] = useState<RangeKey>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [downloading, setDownloading] = useState(false)

  // Completed bookings + per-job parts cost, loaded once when the modal opens.
  const [bookings, setBookings] = useState<JobBooking[]>([])
  const [partsCost, setPartsCost] = useState<Record<string, number>>({})
  const [loadingData, setLoadingData] = useState(false)

  useEffect(() => {
    if (!isOpen || !organizationId) return
    let cancelled = false

    const load = async () => {
      setLoadingData(true)
      try {
        const [bookingsRes, usageRes] = await Promise.all([
          supabase
            .from('service_bookings')
            .select('id, registration, date, notes, customer_name, slot_count, time_slot, is_external_provider, external_provider')
            .eq('organization_id', organizationId)
            .eq('status', 'completed'),
          supabase
            .from('part_usage')
            .select('service_booking_id, total_cost')
            .eq('organization_id', organizationId),
        ])
        if (cancelled) return
        if (bookingsRes.error) throw bookingsRes.error

        setBookings(toCamelList<JobBooking>(bookingsRes.data || []))

        const costMap: Record<string, number> = {}
        ;(usageRes.data || []).forEach((r: any) => {
          const id = r.service_booking_id
          if (!id) return
          costMap[id] = (costMap[id] || 0) + (Number(r.total_cost) || 0)
        })
        setPartsCost(costMap)
      } catch (error) {
        logger.error('Error loading export data:', error)
        toast.error(t('stock.export.fail'))
      } finally {
        if (!cancelled) setLoadingData(false)
      }
    }

    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, organizationId])

  const { fromStr, toStr } = getRangeDates(rangeKey, customFrom, customTo, new Date())
  const count = useMemo(
    () => bookings.filter(b => inRange(b.date, fromStr, toStr)).length,
    [bookings, fromStr, toStr],
  )

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const rows = buildJobReportRows(bookings, invoices, partsCost, fromStr, toStr)
      if (rows.length === 0) {
        toast.error(t('stock.export.noneInRange'))
        return
      }
      await downloadInvoiceReport(rows, `completed-jobs_${fromStr}_to_${toStr}.xlsx`)
      toast.success(t('stock.export.done', { count: rows.length }))
      onClose()
    } catch (error) {
      logger.error('Invoice export failed:', error)
      toast.error(t('stock.export.fail'))
    } finally {
      setDownloading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-[#e2e8e5] dark:border-gray-700 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 rounded-t-2xl bg-[#012619] flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#b3f243] flex items-center justify-center flex-shrink-0">
              <FileSpreadsheet className="w-5 h-5 text-[#012619]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-white leading-tight truncate">{t('stock.export.title')}</h3>
              <p className="text-xs text-[#C5D9D0]">{t('stock.export.subtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0">
            <X className="w-5 h-5 text-[#C5D9D0]" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Range picker */}
          <div>
            <label className="block text-xs font-semibold text-[#72A68E] uppercase tracking-wide mb-2">
              {t('stock.export.rangeLabel')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {RANGES.map(r => {
                const active = rangeKey === r.key
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setRangeKey(r.key)}
                    className={`px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                      active
                        ? 'border-[#025940] bg-[#f0f7f4] dark:bg-[#025940]/20 text-[#025940] dark:text-[#72A68E]'
                        : 'border-[#e2e8e5] dark:border-gray-700 hover:border-[#72A68E] text-gray-600 dark:text-gray-300'
                    } ${r.key === 'custom' ? 'col-span-2' : ''}`}
                  >
                    {t(r.labelKey)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Custom dates */}
          {rangeKey === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">{t('stock.export.from')}</label>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#e2e8e5] dark:border-gray-600 bg-white dark:bg-gray-700 text-[#012619] dark:text-white focus:border-[#025940] focus:ring-2 focus:ring-[#025940]/20 outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">{t('stock.export.to')}</label>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={e => setCustomTo(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#e2e8e5] dark:border-gray-600 bg-white dark:bg-gray-700 text-[#012619] dark:text-white focus:border-[#025940] focus:ring-2 focus:ring-[#025940]/20 outline-none"
                />
              </div>
            </div>
          )}

          {/* Count preview */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#f6f8f7] dark:bg-gray-900/40 border border-[#e2e8e5] dark:border-gray-700">
            <span className="text-xs text-[#72A68E]">{t('stock.export.rangePreview', { from: fromStr, to: toStr })}</span>
            <span className="text-sm font-semibold tabular-nums text-[#012619] dark:text-white">
              {loadingData ? '…' : t('stock.export.countInRange', { count })}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-[#e2e8e5] dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-gray-700 border border-[#e2e8e5] dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            {t('stock.btn.cancel')}
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading || loadingData || count === 0}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#025940] text-white hover:bg-[#012619] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading
              ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <Download className="w-4 h-4" />}
            {t(downloading ? 'stock.export.downloading' : 'stock.export.download')}
          </button>
        </div>
      </div>
    </div>
  )
}
