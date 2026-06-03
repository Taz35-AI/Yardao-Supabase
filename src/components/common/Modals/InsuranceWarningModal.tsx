// src/components/common/modals/InsuranceWarningModal.tsx
// Restyled: Yardao brand colours — red urgency preserved where it matters
// All logic and props unchanged
'use client'

import React from 'react'
import { Button } from '@/components/ui/Button'
import { Shield, AlertTriangle, X } from 'lucide-react'

interface InsuranceWarningModalProps {
  isOpen: boolean
  onClose: () => void
  vehicleRegistration: string
  action: 'checkout' | 'hire'
}

export function InsuranceWarningModal({
  isOpen,
  onClose,
  vehicleRegistration,
  action
}: InsuranceWarningModalProps) {
  if (!isOpen) return null

  const actionText = action === 'checkout' ? 'Check Out' : 'Set Out on Hire'
  const actionVerb = action === 'checkout' ? 'check out' : 'hire out'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full mx-auto overflow-hidden border border-[#e2e8e5] dark:border-gray-700">

        {/* ── Header — brand dark green with red shield (danger signal) ── */}
        <div className="bg-[#012619] px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-xl border border-red-500/30">
              <Shield className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">Insurance Required</p>
              <p className="text-[#72A68E] text-xs mt-0.5">
                {vehicleRegistration} · Not Insured
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#72A68E] hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="p-5 space-y-4">

          {/* Main message */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 p-2.5 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-900/40">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#012619] dark:text-white mb-1">
                Cannot {actionText} Vehicle
              </p>
              <p className="text-xs text-[#4a5e54] dark:text-gray-400 leading-relaxed">
                <span className="font-bold text-[#012619] dark:text-white">{vehicleRegistration}</span> cannot be {actionVerb} without active insurance.
              </p>
            </div>
          </div>

          {/* Warning box — red left border, intentional danger colour */}
          <div className="bg-red-50 dark:bg-red-900/10 rounded-xl px-4 py-3 border border-red-100 dark:border-red-900/30" style={{ borderLeft: '3px solid #ef4444' }}>
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-red-700 dark:text-red-300 leading-relaxed">
                This vehicle must be added back onto insurance before it can {actionVerb}.
              </p>
            </div>
          </div>

          {/* Instructions — brand green accent */}
          <div className="bg-[#f0f4f2] dark:bg-gray-800 rounded-xl px-4 py-3 border border-[#e2e8e5] dark:border-gray-700" style={{ borderLeft: '3px solid #b3f243' }}>
            <p className="text-xs font-bold text-[#012619] dark:text-white mb-2">To proceed, you must:</p>
            <ol className="space-y-1 text-xs text-[#4a5e54] dark:text-gray-400">
              <li className="flex items-start gap-1.5">
                <span className="font-bold text-[#025940] flex-shrink-0">1.</span>
                Update the vehicle's insurance status
              </li>
              <li className="flex items-start gap-1.5">
                <span className="font-bold text-[#025940] flex-shrink-0">2.</span>
                Verify insurance is active before proceeding
              </li>
            </ol>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="bg-[#f8faf9] dark:bg-gray-800/50 border-t border-[#e2e8e5] dark:border-gray-700 px-5 py-3">
          <Button
            onClick={onClose}
            className="w-full bg-[#025940] hover:bg-[#012619] text-white font-semibold py-2.5 text-sm border-0 shadow-none transition-all"
          >
            Understood
          </Button>
        </div>

      </div>
    </div>
  )
}

export default InsuranceWarningModal