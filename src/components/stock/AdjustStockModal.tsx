// src/components/stock/AdjustStockModal.tsx
// Stock Adjustment Modal - Add or remove stock without vehicle/order linking
// ✅ RETHEMED: Full Yardao brand palette — dark green #012619, medium #025940, teal #72A68E, accent #b3f243
// ✅ REDESIGNED: Compact, single-section layout — sexy but simple

'use client'

import React, { useState, useEffect } from 'react'
import { X, Scale, Plus, Minus, AlertCircle } from 'lucide-react'
import { stockService } from '@/lib/services/stockService'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { userProfileService } from '@/lib/firestore'
import { toast } from 'sonner'
import { StockPart } from '@/types/stock'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

interface AdjustStockModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  part: StockPart | null
}

const ADJUSTMENT_REASONS = [
  { value: 'count_correction', label: 'Stock Count Correction' },
  { value: 'damaged',          label: 'Damaged / Defective' },
  { value: 'lost_stolen',      label: 'Lost / Stolen' },
  { value: 'return_supplier',  label: 'Return to Supplier' },
  { value: 'transfer',         label: 'Transfer to Another Location' },
  { value: 'expired',          label: 'Expired / Obsolete' },
  { value: 'other',            label: 'Other' },
]

export function AdjustStockModal({ isOpen, onClose, onSuccess, part }: AdjustStockModalProps) {
  const t = useT()
  const reasonLabel = (v: string) =>
    t(
      v === 'count_correction' ? 'stock.adjust.reasonCountCorrection'
        : v === 'damaged'         ? 'stock.adjust.reasonDamaged'
        : v === 'lost_stolen'     ? 'stock.adjust.reasonLost'
        : v === 'return_supplier' ? 'stock.adjust.reasonReturn'
        : v === 'transfer'        ? 'stock.adjust.reasonTransfer'
        : v === 'expired'         ? 'stock.adjust.reasonExpired'
        : 'stock.adjust.reasonOther'
    )
  const { user } = useAuth()
  const { canManageStockPrices } = usePermissions()
  const [organizationId, setOrganizationId]   = useState<string | null>(null)
  const [userDisplayName, setUserDisplayName] = useState<string>('Unknown')
  const [loading, setLoading]                 = useState(false)

  // Form state
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'remove'>('remove')
  const [quantity, setQuantity]             = useState(1)
  const [reason, setReason]                 = useState<
    'count_correction' | 'damaged' | 'lost_stolen' |
    'return_supplier'  | 'transfer' | 'expired'     | 'other'
  >('count_correction')
  const [notes, setNotes] = useState('')

  // ── Fetch user / org ──────────────────────────────────────────────────────
  useEffect(() => {
    const fetchUserData = async () => {
      if (user?.uid && isOpen) {
        try {
          const profile = await userProfileService.getProfile(user.uid)
          if (profile?.organizationId) {
            setOrganizationId(profile.organizationId)
            setUserDisplayName(profile.displayName || 'Unknown')
          }
        } catch (error) {
          logger.error('Error fetching user data:', error)
        }
      }
    }
    fetchUserData()
  }, [user, isOpen])

  // ── Reset on open ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setAdjustmentType('remove')
      setQuantity(1)
      setReason('count_correction')
      setNotes('')
    }
  }, [isOpen, part])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const calculateNewStock = () => {
    if (!part) return 0
    return adjustmentType === 'add'
      ? part.quantity + quantity
      : part.quantity - quantity
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!canManageStockPrices) { toast.error(t('stock.invoicing.onlyManagerWrite')); return }
    if (!user || !organizationId || !part) {
      toast.error(t('stock.adjust.missingInfo'))
      return
    }
    if (quantity <= 0) {
      toast.error(t('stock.adjust.qtyGtZero'))
      return
    }
    if (adjustmentType === 'remove' && quantity > part.quantity) {
      toast.error(t('stock.adjust.cannotRemoveMore'))
      return
    }

    setLoading(true)
    try {
      await stockService.adjustStock(
        part.id!,
        adjustmentType,
        quantity,
        reason,
        notes,
        user.uid,
        userDisplayName,
        organizationId
      )
      toast.success(t(adjustmentType === 'add' ? 'stock.adjust.adjustedIncreased' : 'stock.adjust.adjustedDecreased'))
      onSuccess()
      onClose()
    } catch (error: any) {
      logger.error('Error adjusting stock:', error)
      toast.error(error.message || t('stock.adjust.adjustFail'))
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !part) return null

  const newStock    = calculateNewStock()
  const stockChange = adjustmentType === 'add' ? quantity : -quantity
  const isInvalid   = newStock < 0

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#0d1f18] rounded-2xl shadow-2xl w-full max-w-md border border-[#C5D9D0] dark:border-[#025940]/50 overflow-hidden">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-[#025940] to-[#012619] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <Scale className="w-4.5 h-4.5 text-[#b3f243]" />
            </div>
            <div>
              <p className="text-base font-bold text-white leading-tight">{t('stock.adjust.title')}</p>
              <p className="text-xs text-[#C5D9D0] truncate max-w-[220px]">{part.partName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          {/* ── Current → New stock strip ── */}
          <div className="flex items-center justify-between bg-[#025940]/8 dark:bg-[#025940]/20 rounded-xl px-4 py-3 border border-[#C5D9D0] dark:border-[#025940]/40">
            <div>
              <p className="text-[10px] font-bold text-[#72A68E] uppercase tracking-wider">{t('stock.adjust.current')}</p>
              <p className="text-2xl font-black text-[#025940] dark:text-[#72A68E]">
                {part.unit === 'pieces' ? Math.round(part.quantity) : part.quantity.toFixed(1)}
                <span className="text-sm font-semibold ml-1 text-gray-400">{part.unit}</span>
              </p>
            </div>

            {/* Arrow */}
            <div className={`flex flex-col items-center ${isInvalid ? 'text-red-500' : adjustmentType === 'add' ? 'text-[#b3f243]' : 'text-[#72A68E]'}`}>
              <span className="text-xl font-black">{stockChange > 0 ? `+${stockChange}` : stockChange}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider">{t('stock.adjust.change')}</span>
            </div>

            <div>
              <p className="text-[10px] font-bold text-[#72A68E] uppercase tracking-wider text-right">{t('stock.adjust.newLabel')}</p>
              <p className={`text-2xl font-black text-right ${isInvalid ? 'text-red-500' : 'text-[#012619] dark:text-white'}`}>
                {part.unit === 'pieces' ? Math.round(newStock) : newStock.toFixed(1)}
                <span className="text-sm font-semibold ml-1 text-gray-400">{part.unit}</span>
              </p>
            </div>
          </div>

          {/* ── Negative stock warning ── */}
          {isInvalid && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-xs font-semibold text-red-600 dark:text-red-400">{t('stock.adjust.cannotBelowZero')}</p>
            </div>
          )}

          {/* ── Add / Remove toggle ── */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAdjustmentType('add')}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                adjustmentType === 'add'
                  ? 'bg-gradient-to-r from-[#025940] to-[#012619] text-[#b3f243] shadow-lg shadow-[#025940]/30'
                  : 'bg-[#025940]/8 dark:bg-[#025940]/20 text-[#025940] dark:text-[#72A68E] border border-[#C5D9D0] dark:border-[#025940]/40 hover:bg-[#025940]/15'
              }`}
            >
              <Plus className="w-4 h-4" />
              {t('stock.adjust.addStock')}
            </button>
            <button
              type="button"
              onClick={() => setAdjustmentType('remove')}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                adjustmentType === 'remove'
                  ? 'bg-gradient-to-r from-[#7f1d1d] to-[#991b1b] text-white shadow-lg shadow-red-900/30'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30'
              }`}
            >
              <Minus className="w-4 h-4" />
              {t('stock.adjust.removeStock')}
            </button>
          </div>

          {/* ── Quantity + Reason on one row ── */}
          <div className="grid grid-cols-2 gap-3">
            {/* Quantity */}
            <div>
              <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                {t('stock.adjust.quantity')}
              </label>
              <input
                type="number"
                min={part.unit === 'liters' ? '0.1' : '1'}
                step={part.unit === 'liters' ? '0.1' : '1'}
                max={adjustmentType === 'remove' ? part.quantity : undefined}
                value={quantity}
                onChange={(e) => setQuantity(part.unit === 'liters' ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0)}
                className="w-full px-4 py-3 border-2 border-[#C5D9D0] dark:border-[#025940]/50 rounded-xl focus:border-[#025940] dark:focus:border-[#72A68E] focus:ring-4 focus:ring-[#025940]/15 dark:bg-[#012619]/50 dark:text-white font-black text-xl text-center transition-all"
                required
              />
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                {t('stock.adjust.reason')}
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as typeof reason)}
                className="w-full px-3 py-3 border-2 border-[#C5D9D0] dark:border-[#025940]/50 rounded-xl focus:border-[#025940] dark:focus:border-[#72A68E] focus:ring-4 focus:ring-[#025940]/15 dark:bg-[#012619]/50 dark:text-white text-xs font-semibold transition-all"
                required
              >
                {ADJUSTMENT_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{reasonLabel(r.value)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Notes ── */}
          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
              {t('stock.adjust.notes')} <span className="text-gray-400 normal-case font-normal">{t('stock.adjust.notesOptional')}</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-4 py-3 border-2 border-[#C5D9D0] dark:border-[#025940]/50 rounded-xl focus:border-[#025940] dark:focus:border-[#72A68E] focus:ring-4 focus:ring-[#025940]/15 dark:bg-[#012619]/50 dark:text-white text-sm resize-none transition-all placeholder:text-gray-400"
              placeholder={t('stock.adjust.notesPlaceholder')}
            />
          </div>

          {/* ── Actions ── */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-3 rounded-xl font-semibold text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {t('stock.btn.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || isInvalid}
              className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg ${
                adjustmentType === 'add'
                  ? 'bg-gradient-to-r from-[#025940] to-[#012619] text-[#b3f243] shadow-[#025940]/30 hover:shadow-[#025940]/50'
                  : 'bg-gradient-to-r from-[#7f1d1d] to-[#991b1b] text-white shadow-red-900/30 hover:shadow-red-900/50'
              }`}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  {t('stock.adjust.saving')}
                </>
              ) : (
                <>
                  {adjustmentType === 'add' ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                  {t(adjustmentType === 'add' ? 'stock.adjust.confirmAddition' : 'stock.adjust.confirmRemoval')}
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}