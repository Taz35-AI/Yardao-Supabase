// src/components/common/Modals/ReservationHireConfirmModal.tsx
// Shown when a RESERVED vehicle that's assigned to a hire agreement is being set
// out on hire — confirms the intent before releasing it.
'use client'

import React from 'react'
import { AlertTriangle, X } from 'lucide-react'
import type { CheckedInVehicle } from '@/types'

interface Props {
  vehicle: CheckedInVehicle | null
  contractLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ReservationHireConfirmModal({ vehicle, contractLabel, onConfirm, onCancel }: Props) {
  if (!vehicle) return null
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-amber-500 px-5 py-4 flex items-center gap-3 text-white">
          <AlertTriangle className="w-6 h-6 flex-shrink-0" />
          <h2 className="text-base font-bold flex-1">This vehicle is reserved</h2>
          <button onClick={onCancel} className="text-white/80 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-900 dark:text-gray-100">
            <span className="font-mono font-bold">{vehicle.registration}</span> is reserved
            {contractLabel ? (
              <> for <span className="font-bold">{contractLabel}</span></>
            ) : null}
            . Set it out on hire anyway?
          </p>

          {vehicle.reservedNote && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-1">
                Reservation note
              </p>
              <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{vehicle.reservedNote}</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-semibold py-2.5 text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              No, keep reserved
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 rounded-xl bg-[#025940] text-white font-bold py-2.5 text-sm hover:bg-[#013b2c]"
            >
              Yes, set out on hire
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
