// src/components/common/Modals/ReserveVehicleModal.tsx
// Admin-only: reserve a vehicle currently in the yard (by registration) with a
// note, or clear an existing reservation. A reserved vehicle is blocked from
// checkout / hire and flagged "Reserved" on the yard map.
'use client'

import React, { useState } from 'react'
import { Lock, X, Search, Trash2 } from 'lucide-react'
import type { CheckedInVehicle } from '@/types'

interface Props {
  isOpen: boolean
  onClose: () => void
  getVehicleByRegistration: (reg: string) => CheckedInVehicle | null
  reserveVehicle: (id: string, note: string) => Promise<void>
  unreserveVehicle: (id: string) => Promise<void>
  showSuccess: (m: string) => void
  showError: (m: string) => void
}

export function ReserveVehicleModal({
  isOpen,
  onClose,
  getVehicleByRegistration,
  reserveVehicle,
  unreserveVehicle,
  showSuccess,
  showError,
}: Props) {
  const [reg, setReg] = useState('')
  const [note, setNote] = useState('')
  const [match, setMatch] = useState<CheckedInVehicle | null>(null)
  const [searched, setSearched] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!isOpen) return null

  const reset = () => { setReg(''); setNote(''); setMatch(null); setSearched(false) }
  const close = () => { reset(); onClose() }

  const doFind = () => {
    const v = getVehicleByRegistration(reg)
    setMatch(v)
    setSearched(true)
    setNote(v?.reservedNote || '')
  }

  const doReserve = async () => {
    if (!match) return
    setBusy(true)
    try {
      await reserveVehicle(match.id, note)
      showSuccess(`${match.registration} reserved`)
      close()
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to reserve vehicle')
    } finally { setBusy(false) }
  }

  const doUnreserve = async () => {
    if (!match) return
    setBusy(true)
    try {
      await unreserveVehicle(match.id)
      showSuccess(`Reservation removed from ${match.registration}`)
      close()
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to remove reservation')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={close}>
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-[#012619] px-5 py-4 flex items-center gap-3 text-white">
          <Lock className="w-5 h-5 text-[#b3f243] flex-shrink-0" />
          <div className="flex-1">
            <h2 className="text-base font-bold">Reserve a vehicle</h2>
            <p className="text-[11px] text-[#a9c6b9]">Holds a vehicle in the yard — blocks checkout &amp; hire.</p>
          </div>
          <button onClick={close} className="text-white/80 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Registration</label>
            <div className="flex gap-2">
              <input
                value={reg}
                onChange={e => { setReg(e.target.value); setSearched(false); setMatch(null) }}
                onKeyDown={e => { if (e.key === 'Enter') doFind() }}
                placeholder="e.g. WN75PVK"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white uppercase focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940]"
              />
              <button
                onClick={doFind}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#025940] text-white px-3 py-2 text-sm font-semibold hover:bg-[#013b2c]"
              >
                <Search className="w-4 h-4" /> Find
              </button>
            </div>
          </div>

          {searched && !match && (
            <p className="text-sm text-red-600 dark:text-red-400">
              No vehicle with that registration is currently in this yard.
            </p>
          )}

          {match && (
            <>
              <div className="rounded-xl border border-[#d9e3de] dark:border-gray-700 bg-[#f8faf9] dark:bg-gray-800 p-3">
                <p className="font-mono font-bold text-sm text-[#012619] dark:text-white">{match.registration}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {match.make} {match.model}{match.isReserved ? ' · currently reserved' : ''}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Reservation note</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={3}
                  placeholder="e.g. Held for John Smith, collecting Friday"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940]"
                />
              </div>

              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={doReserve}
                  className="flex-1 rounded-xl bg-[#8fcc16] text-[#06251a] font-bold py-2.5 text-sm hover:opacity-90 disabled:opacity-50"
                >
                  {match.isReserved ? 'Update reservation' : 'Reserve vehicle'}
                </button>
                {match.isReserved && (
                  <button
                    disabled={busy}
                    onClick={doUnreserve}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 px-3 py-2.5 text-sm font-semibold hover:bg-red-100 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" /> Remove
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
