// src/components/yard/layout/ParkVehicleModal.tsx
// Opens when the user clicks an empty parking space on the dashboard layout.
//
// Two tabs:
//   • Unparked (default) — checked-in vehicles with NO space. Pick → park
//     it on the clicked space.
//   • Parked — vehicles already on a space. Pick → MOVE it here (vacates
//     its old space). A no-drag alternative to dragging across the yard,
//     handy on phone/tablet and rainy days. Each row shows the vehicle's
//     current space and an explicit "Move here" action so the relocate
//     intent (and the freed old spot) is unmistakable.

'use client'

import React, { useState, useMemo } from 'react'
import { CheckedInVehicle } from '@/types'
import { ParkingSpace } from '@/types/yardLayout'
import { coordKey } from '@/lib/utils/yardLayoutUtils'
import { getVehicleChipColor } from '@/lib/utils/vehicleColorUtils'
import { BRAND } from '@/constants/brand'
import { X, Search, Car, MapPin, ArrowRightLeft, Truck } from 'lucide-react'

interface ParkVehicleModalProps {
  /** The (empty) space the user wants to park/move a vehicle into */
  space: ParkingSpace
  /** All checked-in vehicles in the current branch (parked + unparked) */
  vehicles: CheckedInVehicle[]
  /** All spaces — used to label a parked vehicle's CURRENT space */
  spaces: ParkingSpace[]
  /** Submitting state from useVehicleParking */
  busy?: boolean
  /** Park an unparked vehicle here */
  onPick: (vehicleId: string) => void
  /** Move an already-parked vehicle here (frees its old space) */
  onMove: (vehicleId: string) => void
  /**
   * Cancel a stuck transfer for an in-transit vehicle that's physically back in
   * this yard (the other branch never received it). Surfaced in the Unparked tab
   * so the user can clear the transfer instead of parking a still-in-transit
   * vehicle. The parent shows a confirmation, then the vehicle becomes a normal
   * unparked vehicle that can be parked.
   */
  onCancelTransfer?: (vehicleId: string) => void
  onClose: () => void
}

type Tab = 'unparked' | 'parked'

function matchesTerm(v: CheckedInVehicle, term: string): boolean {
  if (!term) return true
  const reg = (v.registration || '').toLowerCase()
  const make = (v.make || '').toLowerCase()
  const model = (v.model || '').toLowerCase()
  return (
    reg.includes(term) ||
    make.includes(term) ||
    model.includes(term) ||
    `${make} ${model}`.includes(term)
  )
}

export function ParkVehicleModal({
  space,
  vehicles,
  spaces,
  busy = false,
  onPick,
  onMove,
  onCancelTransfer,
  onClose,
}: ParkVehicleModalProps) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('unparked')

  const spaceLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of spaces) m.set(s.id, s.label)
    return m
  }, [spaces])

  const term = search.trim().toLowerCase()

  const unparked = useMemo(
    () =>
      vehicles
        .filter((v) => !v.parkingSpaceId)
        .filter((v) => matchesTerm(v, term))
        // In-transit vehicles float to the top so the stuck transfer is the
        // first thing the user sees; everything else stays alphabetical.
        .sort((a, b) => {
          const at = a.transferStatus === 'in_transit' ? 0 : 1
          const bt = b.transferStatus === 'in_transit' ? 0 : 1
          if (at !== bt) return at - bt
          return (a.registration || '').localeCompare(b.registration || '')
        }),
    [vehicles, term],
  )

  const inTransitCount = useMemo(
    () => unparked.filter((v) => v.transferStatus === 'in_transit').length,
    [unparked],
  )

  const parked = useMemo(
    () =>
      vehicles
        // already on a space, but not on THIS target (it's empty anyway)
        .filter((v) => !!v.parkingSpaceId && v.parkingSpaceId !== space.id)
        .filter((v) => matchesTerm(v, term))
        .sort((a, b) => (a.registration || '').localeCompare(b.registration || '')),
    [vehicles, term, space.id],
  )

  // ── Esc to close ───────────────────────────────────────────────────────
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const coord = coordKey(space.col, space.row)
  const list = tab === 'unparked' ? unparked : parked

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center"
      style={{ background: 'rgba(1,38,25,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Park a vehicle on space ${space.label}`}
    >
      <div
        className="w-[480px] max-w-[94vw] max-h-[80vh] flex flex-col rounded-lg overflow-hidden shadow-2xl"
        style={{ background: BRAND.white }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ background: BRAND.darkest, color: BRAND.white }}
        >
          <div>
            <h3 className="text-sm font-semibold">Park a vehicle</h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.7)' }}>
              On space <b style={{ color: BRAND.accent }}>{space.label}</b>
              {space.label !== coord && (
                <span style={{ opacity: 0.6 }}> ({coord})</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* TABS */}
        <div className="flex flex-shrink-0 border-b" style={{ borderColor: BRAND.border }}>
          {(['unparked', 'parked'] as const).map((t) => {
            const active = tab === t
            const n = t === 'unparked' ? unparked.length : parked.length
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 px-4 py-2.5 text-xs font-bold transition-colors"
                style={{
                  background: active ? BRAND.white : BRAND.bg,
                  color: active ? BRAND.darkest : BRAND.mid,
                  borderBottom: active ? `2px solid ${BRAND.dark}` : '2px solid transparent',
                }}
              >
                {t === 'unparked' ? 'Unparked' : 'Parked'}{' '}
                <span style={{ opacity: 0.6 }}>({n})</span>
              </button>
            )
          })}
        </div>

        {/* SEARCH */}
        <div className="px-4 py-3 border-b flex-shrink-0" style={{ borderColor: BRAND.border, background: BRAND.bg }}>
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: BRAND.mid }}
            />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search registration, make, model…"
              className="w-full pl-8 pr-3 py-2 rounded-md border text-sm"
              style={{ background: BRAND.white, borderColor: BRAND.border, color: BRAND.darkest }}
            />
          </div>
          <p className="text-[11px] mt-2" style={{ color: BRAND.mid }}>
            {tab === 'unparked'
              ? `${unparked.length} unparked vehicle${unparked.length === 1 ? '' : 's'} available`
              : `${parked.length} parked vehicle${parked.length === 1 ? '' : 's'} — pick one to move it here`}
          </p>
        </div>

        {/* LIST */}
        <div className="flex-1 overflow-y-auto">
          {/* In-transit heads-up — these vehicles are physically here but flagged
              checked out to another branch that never received them. */}
          {tab === 'unparked' && inTransitCount > 0 && (
            <div
              className="px-4 py-2 flex items-start gap-1.5 text-[11px]"
              style={{ background: 'rgba(245,158,11,0.12)', color: '#92400e', borderBottom: `1px solid ${BRAND.border}` }}
            >
              <Truck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                <b>{inTransitCount}</b> vehicle{inTransitCount === 1 ? ' is' : 's are'} checked out / in
                transit but still here. Tap to cancel the transfer and keep{' '}
                {inTransitCount === 1 ? 'it' : 'them'} in this yard.
              </span>
            </div>
          )}
          {list.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Car className="w-8 h-8 mx-auto mb-2" style={{ color: BRAND.mid, opacity: 0.5 }} />
              <p className="text-sm font-medium" style={{ color: BRAND.darkest }}>
                {term
                  ? 'No matches'
                  : tab === 'unparked'
                    ? 'No unparked vehicles'
                    : 'No parked vehicles'}
              </p>
              <p className="text-[11px] mt-1" style={{ color: BRAND.mid }}>
                {term
                  ? 'Try a different search term'
                  : tab === 'unparked'
                    ? 'Every checked-in vehicle is already parked'
                    : 'Nothing is parked yet'}
              </p>
            </div>
          ) : (
            <ul role="listbox">
              {list.map((v) => {
                const chip = getVehicleChipColor(v)
                const isParked = tab === 'parked'
                const inTransit = !isParked && v.transferStatus === 'in_transit'
                const currentLabel = isParked
                  ? spaceLabelById.get(v.parkingSpaceId as string) || 'unknown'
                  : null
                const handleRowClick = () => {
                  if (inTransit) {
                    onCancelTransfer?.(v.id)
                    return
                  }
                  if (isParked) {
                    onMove(v.id)
                    return
                  }
                  onPick(v.id)
                }
                return (
                  <li key={v.id} role="option">
                    <button
                      onClick={handleRowClick}
                      disabled={busy}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left border-b transition-colors hover:bg-[#fafbfa] disabled:opacity-60"
                      style={{
                        borderColor: BRAND.border,
                        background: inTransit ? 'rgba(245,158,11,0.08)' : undefined,
                      }}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: inTransit ? '#f59e0b' : chip.background }}
                        aria-hidden="true"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-mono font-bold text-sm" style={{ color: BRAND.darkest }}>
                          {v.registration || '—'}
                        </div>
                        <div className="text-[11px] truncate" style={{ color: BRAND.mid }}>
                          {[v.make, v.model].filter(Boolean).join(' ') || 'No make/model'}
                          {isParked && (
                            <>
                              {' '}· currently on{' '}
                              <b style={{ color: BRAND.dark }}>{currentLabel}</b>
                            </>
                          )}
                        </div>
                        {inTransit && (
                          <div
                            className="text-[11px] font-semibold truncate mt-0.5 flex items-center gap-1"
                            style={{ color: '#b45309' }}
                          >
                            <ArrowRightLeft className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">
                              {v.targetBranchName
                                ? `Checked out to ${v.targetBranchName} · tap to cancel`
                                : 'Checked out / in transit · tap to cancel'}
                            </span>
                          </div>
                        )}
                      </div>
                      {inTransit ? (
                        <span
                          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md flex-shrink-0"
                          style={{ background: '#fde68a', color: '#92400e' }}
                        >
                          <Truck className="w-3 h-3" />
                          In transit
                        </span>
                      ) : isParked ? (
                        <span
                          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md flex-shrink-0"
                          style={{ background: BRAND.dark, color: BRAND.white }}
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                          Move here
                        </span>
                      ) : (
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: chip.background, color: chip.text }}
                        >
                          {chip.label}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* FOOTER */}
        <div
          className="flex items-center justify-between gap-2 px-4 py-3 border-t flex-shrink-0"
          style={{ background: BRAND.bg, borderColor: BRAND.border }}
        >
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: BRAND.mid }}>
            <MapPin className="w-3 h-3" />
            {tab === 'unparked'
              ? 'Click a vehicle to park here'
              : 'Pick a parked vehicle to move it here'}
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs font-medium border"
            style={{ background: BRAND.white, borderColor: BRAND.border, color: BRAND.darkest }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
