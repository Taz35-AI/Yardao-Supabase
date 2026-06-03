// src/components/common/Modals/PolicyPickerModal.tsx
// Shown when user toggles a vehicle to "Insured" — pick which policy it's on
// Mobile-first, full-screen on mobile, centred sheet on desktop

'use client'

import React, { useEffect, useRef } from 'react'
import { Shield, Calendar, Hash, Building2, AlertTriangle, X, CheckCircle } from 'lucide-react'
import { InsurancePolicy } from '@/lib/services/settingsService'

// ── Helpers ────────────────────────────────────────────────────────────────────

function getDaysUntilExpiry(expiryDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(expiryDate).getTime() - today.getTime()) / 86_400_000)
}

function formatDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

function getExpiryBadge(expiryDate: string) {
  const days = getDaysUntilExpiry(expiryDate)
  if (days < 0)   return { label: 'EXPIRED',     bg: 'bg-red-100 dark:bg-red-900/30',    text: 'text-red-600 dark:text-red-400',    border: 'border-red-300 dark:border-red-700' }
  if (days <= 30) return { label: `${days}d left`, bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-300 dark:border-amber-700' }
  return           { label: `${days}d left`,       bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-600 dark:text-green-400', border: 'border-green-300 dark:border-green-700' }
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface PolicyPickerModalProps {
  isOpen: boolean
  vehicleRegistration: string
  policies: InsurancePolicy[]
  onSelect: (policy: InsurancePolicy) => void
  onCancel: () => void
  /** If provided, shows which policy is currently assigned */
  currentPolicyId?: string | null
}

// ── Component ──────────────────────────────────────────────────────────────────

export function PolicyPickerModal({
  isOpen,
  vehicleRegistration,
  policies,
  onSelect,
  onCancel,
  currentPolicyId,
}: PolicyPickerModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on backdrop click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onCancel()
  }

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onCancel])

  // Lock body scroll on mobile
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
    >
      <div className="
        w-full sm:max-w-md bg-white dark:bg-gray-900
        rounded-t-2xl sm:rounded-2xl shadow-2xl
        flex flex-col max-h-[90vh] sm:max-h-[80vh]
        overflow-hidden
      ">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2e8e5] dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#f0faf4] dark:bg-[#025940]/30 flex items-center justify-center">
              <Shield className="w-4 h-4 text-[#025940] dark:text-[#72A68E]" />
            </div>
            <div>
              <p className="font-bold text-sm text-gray-900 dark:text-white">Select Insurance Policy</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{vehicleRegistration}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {policies.length === 0 ? (
            <div className="text-center py-12 px-6">
              <Shield className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">No policies configured</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Go to Settings → Insurance Policies to add your first policy.
              </p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {policies.map(policy => {
                const badge = getExpiryBadge(policy.expiryDate)
                const days = getDaysUntilExpiry(policy.expiryDate)
                const isExpired = days < 0
                const isCurrent = policy.id === currentPolicyId

                return (
                  <button
                    key={policy.id}
                    onClick={() => !isExpired && onSelect(policy)}
                    disabled={isExpired}
                    className={`
                      w-full text-left p-4 rounded-xl border transition-all
                      ${isCurrent
                        ? 'border-[#025940] bg-[#f0faf4] dark:bg-[#025940]/20 dark:border-[#025940]'
                        : isExpired
                          ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 opacity-60 cursor-not-allowed'
                          : 'border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-[#025940] dark:hover:border-[#72A68E] hover:bg-[#f8faf9] dark:hover:bg-[#025940]/10 active:scale-[0.98]'
                      }
                    `}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Icon */}
                        <div className={`
                          w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5
                          ${isCurrent    ? 'bg-[#025940] text-white' :
                            isExpired   ? 'bg-red-100 dark:bg-red-900/30' :
                                          'bg-gray-100 dark:bg-gray-700'}
                        `}>
                          {isExpired
                            ? <AlertTriangle className="w-4 h-4 text-red-500" />
                            : isCurrent
                              ? <CheckCircle className="w-4 h-4" />
                              : <Shield className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                          }
                        </div>

                        {/* Name + provider */}
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold truncate ${isCurrent ? 'text-[#025940] dark:text-[#72A68E]' : 'text-gray-900 dark:text-white'}`}>
                            {policy.name}
                            {isCurrent && <span className="ml-2 text-xs font-normal">(current)</span>}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3 h-3" />
                            {policy.provider}
                          </p>
                        </div>
                      </div>

                      {/* Expiry badge */}
                      {isExpired && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border} flex-shrink-0`}>
                          EXPIRED
                        </span>
                      )}
                    </div>

                    {/* Policy number + expiry */}
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-600">
                        <Hash className="w-3 h-3" />
                        {policy.policyNumber}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}>
                        <Calendar className="w-3 h-3" />
                        Expires {formatDisplayDate(policy.expiryDate)}
                      </span>
                    </div>

                    {policy.notes && (
                      <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500 italic truncate">
                        {policy.notes}
                      </p>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-4 py-3 border-t border-[#e2e8e5] dark:border-gray-700 flex-shrink-0">
          <button
            onClick={onCancel}
            className="w-full py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
          >
            Cancel — keep as Not Insured
          </button>
        </div>
      </div>
    </div>
  )
}