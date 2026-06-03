// src/components/common/Modals/DefleetVehicleModal.tsx
// Restyled: Yardao brand colours — consistent with modal suite
// ALL logic, state, validation, DEFLEET_REASONS, props fully preserved
'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { X, Trash2, AlertTriangle, Calendar } from 'lucide-react'
import { FleetVehicle, DefleetReason } from '@/types'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

// ─── Props ────────────────────────────────────────────────────────────────────

interface DefleetVehicleModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (reason: DefleetReason, details: string, defleetDate: string) => Promise<void>
  vehicle: FleetVehicle
}

// ─── Defleet reasons (unchanged) ─────────────────────────────────────────────

const DEFLEET_REASONS: { value: DefleetReason; label: string; description: string }[] = [
  { value: 'Sold',               label: 'Sold',               description: 'Vehicle has been sold to a customer' },
  { value: 'Trade-In',           label: 'Trade-In',           description: 'Vehicle traded in for another' },
  { value: 'End of Lease',       label: 'End of Lease',       description: 'Lease period has ended' },
  { value: 'Scrapped',           label: 'Scrapped',           description: 'Vehicle scrapped/dismantled' },
  { value: 'Accident Write-Off', label: 'Accident Write-Off', description: 'Total loss from accident' },
  { value: 'Theft',              label: 'Theft',              description: 'Vehicle was stolen' },
  { value: 'Other',              label: 'Other',              description: 'Other reason (specify below)' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export const DefleetVehicleModal: React.FC<DefleetVehicleModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  vehicle
}) => {
  const [selectedReason, setSelectedReason] = useState<DefleetReason | ''>('')
  const [details, setDetails]               = useState('')
  const [defleetDate, setDefleetDate]       = useState(() => new Date().toISOString().split('T')[0])
  const [isSubmitting, setIsSubmitting]     = useState(false)
  const t = useT()

  if (!isOpen) return null

  // ── Submit handler (unchanged) ──
  const handleSubmit = async () => {
    if (!selectedReason) {
      alert(t('fleet.defleet.alertNoReason'))
      return
    }
    if (selectedReason === 'Other' && !details.trim()) {
      alert(t('fleet.defleet.alertOtherDetails'))
      return
    }
    if (!defleetDate) {
      alert(t('fleet.defleet.alertNoDate'))
      return
    }

    try {
      setIsSubmitting(true)
      await onConfirm(selectedReason, details.trim(), defleetDate)
      onClose()
      setSelectedReason('')
      setDetails('')
      setDefleetDate(new Date().toISOString().split('T')[0])
    } catch (error) {
      logger.error('Failed to defleet vehicle:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit = Boolean(selectedReason) &&
    Boolean(defleetDate) &&
    !(selectedReason === 'Other' && !details.trim()) &&
    !isSubmitting

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col border border-[#e2e8e5] dark:border-gray-700">

        {/* ── Header — brand dark green, red trash icon signals danger ── */}
        <div className="flex-shrink-0 bg-[#012619] px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 p-2 bg-red-500/20 rounded-xl border border-red-500/30">
              <Trash2 className="w-4 h-4 text-red-400" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-sm">{t('fleet.defleet.title')}</p>
              <p className="text-[#72A68E] text-xs mt-0.5 truncate">
                {vehicle.registration} · {vehicle.make} {vehicle.model}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-[#72A68E] hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">

          {/* Warning banner — intentional amber/yellow, it's a destructive action warning */}
          <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-xl px-4 py-3" style={{ borderLeft: '3px solid #f59e0b' }}>
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-0.5">
                {t('fleet.defleet.warningTitle')}
              </p>
              <p className="text-[10px] text-amber-700/80 dark:text-amber-400/70 leading-relaxed">
                {t('fleet.defleet.warningBody')}
              </p>
            </div>
          </div>

          {/* Vehicle details */}
          <div>
            <p className="text-[10px] font-bold text-[#8a9e94] uppercase tracking-widest mb-2">{t('fleet.defleet.sectionVehicle')}</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: t('fleet.defleet.regLabel'), value: vehicle.registration },
                { label: t('fleet.defleet.makeModelLabel'), value: `${vehicle.make} ${vehicle.model}` },
                { label: t('fleet.defleet.colourLabel'),       value: vehicle.colour || '—' },
                { label: t('fleet.defleet.sizeLabel'),         value: vehicle.size   || '—' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[#f8faf9] dark:bg-gray-800 rounded-xl px-3 py-2.5 border border-[#e2e8e5] dark:border-gray-700">
                  <p className="text-[10px] text-[#8a9e94] font-medium">{label}</p>
                  <p className="text-xs font-bold text-[#012619] dark:text-white mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Defleet date */}
          <div>
            <p className="text-xs text-[#8a9e94] font-medium mb-1.5">
              {t('fleet.defleet.dateLabel')} <span className="text-red-500">*</span>
            </p>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8a9e94]" />
              <input
                type="date"
                value={defleetDate}
                onChange={e => setDefleetDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                disabled={isSubmitting}
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] shadow-sm"
              />
            </div>
            <p className="text-[10px] text-[#8a9e94] mt-1">
              {t('fleet.defleet.dateHint')}
            </p>
          </div>

          {/* Reason selection — dropdown */}
          <div>
            <p className="text-xs text-[#8a9e94] font-medium mb-1.5">
              {t('fleet.defleet.reasonLabel')} <span className="text-red-500">*</span>
            </p>
            <select
              value={selectedReason}
              onChange={e => setSelectedReason(e.target.value as DefleetReason | '')}
              disabled={isSubmitting}
              className="w-full px-3 py-2.5 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] shadow-sm"
            >
              <option value="">{t('fleet.defleet.reasonPlaceholderOption')}</option>
              {DEFLEET_REASONS.map(reason => (
                <option key={reason.value} value={reason.value}>{t(`fleet.defleetReasonLabel.${reason.value}`)}</option>
              ))}
            </select>
            {/* Show description of selected reason as a hint */}
            {selectedReason && (
              <p className="text-[10px] text-[#72A68E] mt-1.5">
                {t(`fleet.defleetReasonDesc.${selectedReason}`)}
              </p>
            )}
          </div>

          {/* Additional details */}
          <div>
            <p className="text-xs text-[#8a9e94] font-medium mb-1.5">
              {t('fleet.defleet.additionalDetailsLabel')}
              {selectedReason === 'Other' && <span className="text-red-500 ml-1">*</span>}
            </p>
            <textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder={t('fleet.defleet.detailsPlaceholder')}
              rows={3}
              disabled={isSubmitting}
              className="w-full px-3 py-2.5 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] resize-none shadow-sm placeholder-[#c8d5ce]"
            />
            <p className="text-[10px] text-[#8a9e94] mt-1">
              {t('fleet.defleet.detailsHint')}
            </p>
          </div>
        </div>

        {/* ── Action bar ── */}
        <div className="flex-shrink-0 bg-[#f8faf9] dark:bg-gray-800/80 border-t border-[#e2e8e5] dark:border-gray-700 px-4 sm:px-5 py-3 flex gap-3">
          {/* Cancel */}
          <Button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 bg-[#f0f4f2] dark:bg-gray-700 text-[#4a5e54] dark:text-gray-300 hover:bg-[#e2e8e5] dark:hover:bg-gray-600 font-semibold py-2.5 text-sm border border-[#c8d5ce] dark:border-gray-600 shadow-none"
          >
            {t('fleet.defleet.cancelBtn')}
          </Button>

          {/* Confirm Defleet — red, intentional danger signal */}
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 text-sm border-0 shadow-none flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{t('fleet.defleet.processingBtn')}</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>{t('fleet.defleet.confirmBtn')}</span>
              </>
            )}
          </Button>
        </div>

      </div>
    </div>
  )
}