// src/components/common/Modals/ReservationBlockedModal.tsx
// Shown when someone tries to check out / hire a RESERVED vehicle.
'use client'

import React from 'react'
import { AlertOctagon, X } from 'lucide-react'
import type { CheckedInVehicle } from '@/types'

interface Props {
  vehicle: CheckedInVehicle | null
  onClose: () => void
}

export function ReservationBlockedModal({ vehicle, onClose }: Props) {
  if (!vehicle) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-red-600 px-5 py-4 flex items-center gap-3 text-white">
          <AlertOctagon className="w-6 h-6 flex-shrink-0" />
          <h2 className="text-base font-bold flex-1">This vehicle cannot go out</h2>
          <button onClick={onClose} className="text-white/80 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            <span className="font-mono font-bold">{vehicle.registration}</span> is{' '}
            <span className="text-red-600 dark:text-red-400 font-bold">RESERVED</span> and cannot be
            checked out or set out on hire.
          </p>

          {vehicle.reservedNote && (
            <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400 mb-1">
                Reservation note
              </p>
              <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                {vehicle.reservedNote}
              </p>
            </div>
          )}

          {vehicle.reservedBy && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Reserved by {vehicle.reservedBy}
            </p>
          )}

          <p className="text-xs text-gray-500 dark:text-gray-400">
            An admin can remove the reservation from the Reserve panel.
          </p>

          <button
            onClick={onClose}
            className="w-full rounded-xl bg-gray-900 dark:bg-gray-700 text-white font-semibold py-2.5 text-sm hover:opacity-90"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
