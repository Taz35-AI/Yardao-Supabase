// src/components/common/Modals/ReserveVehicleModal.tsx
// Admin-only: reserve a vehicle currently in the yard (search by partial reg)
// with a note, view/clear currently-reserved vehicles. A reserved vehicle is
// blocked from checkout / hire and flagged "Reserved" on the yard map.
'use client'

import React, { useMemo, useState } from 'react'
import { Lock, X, Search, Trash2, ChevronLeft } from 'lucide-react'
import type { CheckedInVehicle } from '@/types'

interface Props {
  isOpen: boolean
  onClose: () => void
  vehicles: CheckedInVehicle[]                 // vehicles currently in the yard
  reserveVehicle: (id: string, note: string) => Promise<void>
  unreserveVehicle: (id: string) => Promise<void>
  showSuccess: (m: string) => void
  showError: (m: string) => void
}

const normReg = (s?: string | null) => (s || '').toUpperCase().replace(/\s+/g, '')

export function ReserveVehicleModal({
  isOpen,
  onClose,
  vehicles,
  reserveVehicle,
  unreserveVehicle,
  showSuccess,
  showError,
}: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CheckedInVehicle | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const reserved = useMemo(
    () => vehicles.filter(v => v.isReserved),
    [vehicles],
  )

  const matches = useMemo(() => {
    const q = normReg(query)
    if (q.length < 2) return []
    return vehicles
      .filter(v => normReg(v.registration).includes(q))
      .slice(0, 8)
  }, [vehicles, query])

  if (!isOpen) return null

  const reset = () => { setQuery(''); setSelected(null); setNote(''); }
  const close = () => { reset(); onClose() }

  const pick = (v: CheckedInVehicle) => {
    setSelected(v)
    setNote(v.reservedNote || '')
    setQuery('')
  }

  const doReserve = async () => {
    if (!selected) return
    setBusy(true)
    try {
      await reserveVehicle(selected.id, note)
      showSuccess(`${selected.registration} reserved`)
      setSelected(null); setNote('')
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to reserve vehicle')
    } finally { setBusy(false) }
  }

  const doUnreserve = async (v: CheckedInVehicle) => {
    setBusy(true)
    try {
      await unreserveVehicle(v.id)
      showSuccess(`Reservation removed from ${v.registration}`)
      if (selected?.id === v.id) { setSelected(null); setNote('') }
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to remove reservation')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={close}>
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-[#012619] px-5 py-4 flex items-center gap-3 text-white flex-shrink-0">
          <Lock className="w-5 h-5 text-[#b3f243] flex-shrink-0" />
          <div className="flex-1">
            <h2 className="text-base font-bold">Reserve a vehicle</h2>
            <p className="text-[11px] text-[#a9c6b9]">Holds a vehicle in the yard — blocks checkout &amp; hire.</p>
          </div>
          <button onClick={close} className="text-white/80 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {!selected ? (
            <>
              {/* Search by partial registration */}
              <div className="relative">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Find a vehicle</label>
                <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus-within:border-[#025940] transition-colors">
                  <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Type part of a reg, e.g. 250"
                    autoFocus
                    className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-white uppercase min-w-0"
                  />
                </div>

                {normReg(query).length >= 2 && (
                  <div className="mt-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
                    {matches.length === 0 ? (
                      <p className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">No vehicles in the yard match that.</p>
                    ) : (
                      matches.map(v => (
                        <button
                          key={v.id}
                          onClick={() => pick(v)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[#f0faf4] dark:hover:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700 last:border-0"
                        >
                          <span className="font-mono font-bold text-sm text-[#012619] dark:text-white">{v.registration}</span>
                          <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                            {v.make} {v.model}{v.isReserved ? ' · reserved' : ''}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Currently reserved list */}
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#8a9e94] mb-2">
                  Reserved vehicles ({reserved.length})
                </p>
                {reserved.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">No vehicles are currently reserved.</p>
                ) : (
                  <div className="space-y-2">
                    {reserved.map(v => (
                      <div key={v.id} className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/20 p-2.5">
                        <button onClick={() => pick(v)} className="flex-1 text-left min-w-0">
                          <p className="font-mono font-bold text-sm text-[#012619] dark:text-white">{v.registration}</p>
                          {v.reservedNote && (
                            <p className="text-[11px] text-gray-600 dark:text-gray-300 truncate">{v.reservedNote}</p>
                          )}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => doUnreserve(v)}
                          title="Remove reservation"
                          className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 px-2 py-1 text-[11px] font-semibold hover:bg-red-100 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Selected vehicle — add / edit reservation */
            <>
              <button onClick={() => { setSelected(null); setNote('') }} className="inline-flex items-center gap-1 text-xs font-semibold text-[#025940] dark:text-[#72A68E]">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>

              <div className="rounded-xl border border-[#d9e3de] dark:border-gray-700 bg-[#f8faf9] dark:bg-gray-800 p-3">
                <p className="font-mono font-bold text-sm text-[#012619] dark:text-white">{selected.registration}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selected.make} {selected.model}{selected.isReserved ? ' · currently reserved' : ''}
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
                  {selected.isReserved ? 'Update reservation' : 'Reserve vehicle'}
                </button>
                {selected.isReserved && (
                  <button
                    disabled={busy}
                    onClick={() => doUnreserve(selected)}
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
