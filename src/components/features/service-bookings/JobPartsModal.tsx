// src/components/features/service-bookings/JobPartsModal.tsx
// 🧩 Live job-parts capture (B1 flow). Opened from an in-progress job card.
// Lets staff record the parts used ON THIS JOB while it's live — searchable
// against live stock. Each part added decrements stock immediately and is
// stamped with this booking's id (migration 0039), so invoicing can later
// pull exactly one job's parts instead of a fuzzy 10-day window.
//
// ✅ STYLE: premium forest theme — solid #012619 header + lime chip,
//    hairline borders, no gradients/glow/scale. Mirrors the restyled stock page.

'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { X, Package, Search, Plus, Trash2, Check } from 'lucide-react'
import { ServiceBooking } from '@/types/serviceBookings'
import { StockPart, PartUsageRecord } from '@/types/stock'
import { stockService } from '@/lib/services/stockService'
import { vehicleService, userProfileService } from '@/lib/firestore'
import { useAuth } from '@/contexts/AuthContext'
import { normalizeReg } from '@/lib/utils/registration'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'
import { toast } from 'sonner'

interface JobPartsModalProps {
  isOpen: boolean
  onClose: () => void
  booking: ServiceBooking
  /** Notify the parent so it can refresh the card's parts count. */
  onChanged?: () => void
}

export function JobPartsModal({ isOpen, onClose, booking, onChanged }: JobPartsModalProps) {
  const t = useT()
  const { user } = useAuth()

  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [userName, setUserName] = useState('Unknown')
  const [loading, setLoading] = useState(true)

  // Parts already recorded against this job + the live stock list to add from.
  const [jobParts, setJobParts] = useState<PartUsageRecord[]>([])
  const [stockParts, setStockParts] = useState<StockPart[]>([])
  // Fleet vehicle id for this booking's reg ('' = custom / non-fleet, matched
  // by registration key instead — same path as the parts scan-out).
  const [vehicleId, setVehicleId] = useState('')

  const [search, setSearch] = useState('')
  const [selectedPart, setSelectedPart] = useState<StockPart | null>(null)
  const [addQty, setAddQty] = useState('1')
  const [processing, setProcessing] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const isJobReal = !!booking.id && !booking.id.startsWith('garage-')

  // ── Load everything when the modal opens ──────────────────────────────────
  useEffect(() => {
    if (!isOpen || !user?.uid) return
    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const profile = await userProfileService.getProfile(user.uid)
        const orgId = profile?.organizationId
        if (!orgId) return
        if (cancelled) return
        setOrganizationId(orgId)
        setUserName(profile?.displayName || 'Unknown')

        const [parts, stock, vehicles] = await Promise.all([
          isJobReal ? stockService.getUsageByBooking(orgId, booking.id) : Promise.resolve([]),
          stockService.getParts(orgId),
          booking.isCustomVehicle ? Promise.resolve([]) : vehicleService.getVehicles(orgId),
        ])
        if (cancelled) return

        setJobParts(parts)
        setStockParts(stock)

        // Resolve the fleet vehicle id by normalised registration so the usage
        // row links to the fleet record too (not just the booking).
        const key = normalizeReg(booking.registration)
        const match = vehicles.find(v => normalizeReg(v.registration) === key)
        setVehicleId(match?.id || '')
      } catch (error) {
        logger.error('Error loading job parts:', error)
        toast.error(t('stock.jobParts.loadFail'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user?.uid, booking.id])

  // Reset the add-row whenever the modal is reopened.
  useEffect(() => {
    if (isOpen) {
      setSearch('')
      setSelectedPart(null)
      setAddQty('1')
    }
  }, [isOpen])

  const refresh = async () => {
    if (!organizationId) return
    const [parts, stock] = await Promise.all([
      stockService.getUsageByBooking(organizationId, booking.id),
      stockService.getParts(organizationId),
    ])
    setJobParts(parts)
    setStockParts(stock)
    onChanged?.()
  }

  // Search matches on name or part number; hide parts already with no stock at
  // the very bottom is unnecessary — show all matches, surface stock on each.
  const searchResults = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return []
    return stockParts
      .filter(p =>
        p.partName.toLowerCase().includes(term) ||
        (p.partNumber || '').toLowerCase().includes(term),
      )
      .slice(0, 8)
  }, [search, stockParts])

  const total = useMemo(
    () => jobParts.reduce((sum, p) => sum + (p.totalCost || 0), 0),
    [jobParts],
  )

  const handleAdd = async () => {
    if (!organizationId || !user?.uid || !selectedPart?.id) return
    const qty = parseFloat(addQty)
    if (isNaN(qty) || qty <= 0) {
      toast.error(t('stock.jobParts.invalidQty'))
      return
    }
    if (qty > selectedPart.quantity) {
      toast.error(t('stock.jobParts.notEnoughStock'))
      return
    }

    setProcessing(true)
    try {
      await stockService.removePartQuantity(
        selectedPart.id,
        qty,
        vehicleId,
        booking.registration,
        user.uid,
        userName,
        organizationId,
        undefined,
        booking.id, // ← stamp the job link
      )
      await refresh()
      setSelectedPart(null)
      setSearch('')
      setAddQty('1')
      toast.success(t('stock.jobParts.added', { name: selectedPart.partName }))
    } catch (error: any) {
      logger.error('Error adding part to job:', error)
      // Friendly hint if the 0039 column isn't in the database yet.
      const msg = String(error?.message || error?.code || '')
      if (msg.includes('service_booking_id') || error?.code === '42703') {
        toast.error(t('stock.jobParts.migrationNeeded'))
      } else {
        toast.error(t('stock.jobParts.addFail'))
      }
    } finally {
      setProcessing(false)
    }
  }

  const handleRemove = async (usage: PartUsageRecord) => {
    if (!usage.id) return
    setRemovingId(usage.id)
    try {
      await stockService.deletePartUsage(usage.id)
      await refresh()
      toast.success(t('stock.jobParts.removed', { name: usage.partName }))
    } catch (error) {
      logger.error('Error removing part from job:', error)
      toast.error(t('stock.jobParts.removeFail'))
    } finally {
      setRemovingId(null)
    }
  }

  if (!isOpen) return null

  const vehicleName = [booking.make, booking.model].filter(Boolean).join(' ')

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg border border-[#e2e8e5] dark:border-gray-700 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header — solid forest + lime chip ── */}
        <div className="flex items-center justify-between p-5 rounded-t-2xl bg-[#012619] flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#b3f243] flex items-center justify-center flex-shrink-0">
              <Package className="w-5 h-5 text-[#012619]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-white leading-tight truncate">
                {t('stock.jobParts.title')}
              </h3>
              <p className="text-xs text-[#C5D9D0] truncate">
                {booking.registration}{vehicleName ? ` · ${vehicleName}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5 text-[#C5D9D0]" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Add-a-part search */}
          <div>
            <label className="block text-xs font-semibold text-[#72A68E] uppercase tracking-wide mb-2">
              {t('stock.jobParts.addLabel')}
            </label>

            {selectedPart ? (
              /* Chosen part → set quantity + confirm */
              <div className="flex items-center gap-2 p-3 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-[#f6f8f7] dark:bg-gray-900/40">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#012619] dark:text-white truncate">{selectedPart.partName}</p>
                  <p className="text-[11px] font-mono text-[#72A68E]">
                    {selectedPart.partNumber} · {t('stock.jobParts.inStock', {
                      qty: selectedPart.unit === 'liters' ? selectedPart.quantity.toFixed(1) : Math.round(selectedPart.quantity),
                      unit: selectedPart.unit,
                    })}
                  </p>
                </div>
                <input
                  type="number"
                  min={selectedPart.unit === 'liters' ? '0.1' : '1'}
                  step={selectedPart.unit === 'liters' ? '0.1' : '1'}
                  value={addQty}
                  onChange={e => setAddQty(e.target.value)}
                  className="w-16 px-2 py-2 rounded-lg border border-[#e2e8e5] dark:border-gray-600 bg-white dark:bg-gray-700 text-[#012619] dark:text-white text-center text-sm font-semibold tabular-nums focus:border-[#025940] focus:ring-2 focus:ring-[#025940]/20 outline-none"
                  autoFocus
                />
                <button
                  onClick={handleAdd}
                  disabled={processing}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-[#025940] text-white hover:bg-[#012619] transition-colors disabled:opacity-50"
                >
                  {processing
                    ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <Check className="w-4 h-4" />}
                  {t('stock.jobParts.add')}
                </button>
                <button
                  onClick={() => { setSelectedPart(null); setSearch('') }}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              /* Search field + results */
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#72A68E]" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('stock.jobParts.searchPlaceholder')}
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-700 text-[#012619] dark:text-white text-sm focus:border-[#025940] focus:ring-2 focus:ring-[#025940]/20 outline-none transition-colors"
                />
                {search.trim() && (
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-700 border border-[#e2e8e5] dark:border-gray-600 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                    {searchResults.length === 0 ? (
                      <div className="p-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                        {t('stock.jobParts.noMatches')}
                      </div>
                    ) : (
                      searchResults.map(part => {
                        const out = part.quantity <= 0
                        return (
                          <button
                            key={part.id}
                            onClick={() => { if (!out) { setSelectedPart(part); setAddQty('1') } }}
                            disabled={out}
                            className="w-full px-3 py-2.5 text-left hover:bg-[#f0f7f4] dark:hover:bg-[#025940]/20 transition-colors border-b border-[#e2e8e5] dark:border-gray-600 last:border-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-[#012619] dark:text-white truncate">{part.partName}</p>
                              <p className="text-[11px] font-mono text-[#72A68E]">{part.partNumber}</p>
                            </div>
                            <span className={`flex items-center gap-1.5 text-[11px] font-medium flex-shrink-0 ${out ? 'text-red-600 dark:text-red-400' : 'text-[#025940] dark:text-[#72A68E]'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${out ? 'bg-red-500' : 'bg-[#72A68E]'}`} />
                              {out
                                ? t('stock.jobParts.outOfStock')
                                : t('stock.jobParts.inStock', {
                                    qty: part.unit === 'liters' ? part.quantity.toFixed(1) : Math.round(part.quantity),
                                    unit: part.unit,
                                  })}
                            </span>
                          </button>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Parts on this job */}
          <div>
            <label className="block text-xs font-semibold text-[#72A68E] uppercase tracking-wide mb-2">
              {t('stock.jobParts.onJobLabel')}
            </label>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-[#C5D9D0] border-t-[#025940] rounded-full animate-spin" />
              </div>
            ) : jobParts.length === 0 ? (
              <div className="py-8 text-center">
                <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-[#f0f7f4] dark:bg-[#025940]/20 border border-[#e2e8e5] dark:border-gray-700 flex items-center justify-center">
                  <Package className="w-6 h-6 text-[#72A68E]" />
                </div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('stock.jobParts.emptyTitle')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('stock.jobParts.emptyHint')}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {jobParts.map(part => (
                  <div
                    key={part.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 border-l-4 border-l-[#72A68E]"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#012619] dark:text-white truncate">{part.partName}</p>
                      <p className="text-[11px] font-mono text-[#72A68E]">{part.partNumber}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-[#f0f7f4] dark:bg-[#025940]/20 text-[#025940] dark:text-[#72A68E] text-xs font-semibold tabular-nums flex-shrink-0">
                      {part.unit === 'liters' ? `${part.quantityUsed.toFixed(1)}L` : `×${part.quantityUsed}`}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-[#012619] dark:text-white min-w-[56px] text-right flex-shrink-0">
                      £{(part.totalCost || 0).toFixed(2)}
                    </span>
                    <button
                      onClick={() => handleRemove(part)}
                      disabled={removingId === part.id}
                      className="p-1.5 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50"
                      title={t('stock.jobParts.remove')}
                    >
                      {removingId === part.id
                        ? <div className="w-4 h-4 border-2 border-red-400/40 border-t-red-500 rounded-full animate-spin" />
                        : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer — running total + done ── */}
        <div className="flex items-center justify-between gap-3 p-4 border-t border-[#e2e8e5] dark:border-gray-700 flex-shrink-0">
          <div className="text-sm">
            <span className="text-[#72A68E] font-medium">{t('stock.jobParts.totalLabel')} </span>
            <span className="font-semibold tabular-nums text-[#012619] dark:text-white">£{total.toFixed(2)}</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-[#025940] text-white hover:bg-[#012619] transition-colors"
          >
            {t('stock.jobParts.done')}
          </button>
        </div>
      </div>
    </div>
  )
}
