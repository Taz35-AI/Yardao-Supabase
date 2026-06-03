// src/components/yard/layout/YardLayoutMobileViewer.tsx
// Mobile-first read-only yard layout viewer.
// - Compact grid (28px cells) so a busy yard fits on a small screen
// - Pinch-zoom via native scroll/CSS — no custom gesture handling
// - Tap a space → bottom sheet shows status + actions
// - NO layout editing on mobile by design (admin uses desktop)
//
// This component takes vehicles as a prop and looks up which space each
// vehicle is parked at via parkingSpaceId. It is purely presentational —
// the parent owns the data and the action handlers.
//
// ✨ PHASE 4: Merged spaces (trailers, transporters) render as a single
// MobileMergedSpaceTile spanning multiple cells. Tapping anywhere on the
// merged tile opens the bottom sheet for that space.

'use client'

import React, { useState, useMemo } from 'react'
import {
  ParkingSpace,
  BuildingBlock,
} from '@/types/yardLayout'
import {
  colLetter,
  coordKey,
  getSpaceAt,
  isCellCoveredByBlock,
  calculateBounds,
  countSpaces,
  findSpaceById,
  // ✨ Phase 4: merged-space helpers
  getSpaceFootprint,
  isMergedSpace,
} from '@/lib/utils/yardLayoutUtils'
import { BRAND, BRAND_ALPHA, LIGHT_BLOCK_COLORS } from '@/constants/brand'
import { Lock, Search, ChevronLeft } from 'lucide-react'

// ─── Sizing for mobile ────────────────────────────────────────────────────
const M_CELL = 28
const M_ROW_HEAD_W = 22
const M_COL_HEAD_H = 18

// ─── Vehicle shape (lightweight, only what we need) ──────────────────────
export interface MobileVehicle {
  id: string
  registration: string
  parkingSpaceId?: string | null
  // Optional extras to show in the sheet:
  make?: string
  model?: string
  checkInTime?: Date | string
}

interface YardLayoutMobileViewerProps {
  branchName: string
  spaces: Record<string, ParkingSpace>
  blocks: BuildingBlock[]
  vehicles: MobileVehicle[]
  onBack?: () => void
  // Callbacks let the parent decide what these actions actually do
  onParkVehicle?: (spaceId: string) => void
  onMoveVehicle?: (vehicleId: string) => void
  onCheckOutVehicle?: (vehicleId: string) => void
  onViewVehicle?: (vehicleId: string) => void
}

export function YardLayoutMobileViewer({
  branchName,
  spaces,
  blocks,
  vehicles,
  onBack,
  onParkVehicle,
  onMoveVehicle,
  onCheckOutVehicle,
  onViewVehicle,
}: YardLayoutMobileViewerProps) {
  const [selectedCoord, setSelectedCoord] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // ── Build a map of spaceId → vehicle for fast lookup ───────────────────
  const vehicleBySpaceId = useMemo(() => {
    const map = new Map<string, MobileVehicle>()
    vehicles.forEach((v) => {
      if (v.parkingSpaceId) map.set(v.parkingSpaceId, v)
    })
    return map
  }, [vehicles])

  const totalSpaces = countSpaces(spaces)
  const occupiedCount = vehicleBySpaceId.size
  const freeCount = totalSpaces - occupiedCount

  const bounds = calculateBounds(spaces, blocks, false /* not edit mode on mobile */)

  // ── Find space by current label or coord (for search) ──────────────────
  const matchSearch = (sp: ParkingSpace, q: string) => {
    if (!q) return true
    const t = q.toLowerCase().trim()
    const veh = vehicleBySpaceId.get(sp.id)
    return (
      sp.label.toLowerCase().includes(t) ||
      (veh?.registration || '').toLowerCase().includes(t)
    )
  }

  // For "search results" mode — show a list when user has typed something
  const searchHits = useMemo(() => {
    if (!search.trim()) return []
    return Object.entries(spaces)
      .filter(([_, sp]) => matchSearch(sp, search))
      .slice(0, 8)
  }, [search, spaces, vehicleBySpaceId])

  const selectedSpace = selectedCoord ? spaces[selectedCoord] : null
  const selectedVehicle = selectedSpace
    ? vehicleBySpaceId.get(selectedSpace.id)
    : null

  // ────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden"
      style={{ background: BRAND.bg }}
    >
      {/* HEADER */}
      <div
        className="flex items-center justify-between px-3 py-2.5 flex-shrink-0"
        style={{ background: BRAND.darkest, color: BRAND.white }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs"
          style={{ color: 'rgba(255,255,255,0.85)' }}
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <h1 className="text-sm font-semibold">{branchName}</h1>
        <div style={{ width: 40 }} /> {/* spacer for visual balance */}
      </div>

      {/* STATS BAR */}
      <div
        className="flex gap-1.5 px-3 py-1.5 text-[10px] flex-shrink-0"
        style={{ background: BRAND.darkest, color: 'rgba(255,255,255,0.85)' }}
      >
        <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
          Total <b style={{ color: BRAND.accent }}>{totalSpaces}</b>
        </span>
        <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
          Free <b style={{ color: BRAND.accent }}>{freeCount}</b>
        </span>
        <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
          Occupied <b style={{ color: BRAND.accent }}>{occupiedCount}</b>
        </span>
      </div>

      {/* INFO BANNER — layout editing notice */}
      <div
        className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] flex-shrink-0"
        style={{ background: '#fef3c7', color: '#78350f' }}
      >
        <Lock className="w-3 h-3" />
        Layout editing is desktop-only
      </div>

      {/* SEARCH */}
      <div
        className="px-3 py-2 border-b flex-shrink-0"
        style={{ background: BRAND.white, borderColor: BRAND.border }}
      >
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: BRAND.mid }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reg or space (e.g. A1)"
            className="w-full pl-8 pr-2.5 py-1.5 rounded-md border text-xs"
            style={{
              background: BRAND.bg,
              borderColor: BRAND.border,
              color: BRAND.darkest,
            }}
          />
        </div>

        {/* Search results dropdown */}
        {search.trim() && searchHits.length > 0 && (
          <div
            className="mt-2 rounded-md border overflow-hidden"
            style={{ borderColor: BRAND.border }}
          >
            {searchHits.map(([coord, sp]) => {
              const veh = vehicleBySpaceId.get(sp.id)
              return (
                <button
                  key={coord}
                  onClick={() => {
                    setSelectedCoord(coord)
                    setSearch('')
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-left border-b last:border-b-0"
                  style={{ background: BRAND.white, borderColor: BRAND.border }}
                >
                  <span className="text-xs font-mono font-semibold" style={{ color: BRAND.darkest }}>
                    {sp.label}
                  </span>
                  <span className="text-[10px]" style={{ color: veh ? BRAND.error : BRAND.mid }}>
                    {veh ? `🔴 ${veh.registration}` : '⚪ Free'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        {search.trim() && searchHits.length === 0 && (
          <p className="mt-2 text-center text-[10px] py-2" style={{ color: BRAND.mid }}>
            No matches for &quot;{search}&quot;
          </p>
        )}
      </div>

      {/* CANVAS — scrollable grid */}
      <div className="flex-1 overflow-auto" style={{
        backgroundImage: `radial-gradient(circle, rgba(1,38,25,0.1) 1px, transparent 1px)`,
        backgroundSize: '8px 8px',
      }}>
        <div
          className="m-3 inline-block rounded border"
          style={{ background: BRAND.white, borderColor: BRAND.border, position: 'relative' }}
        >
          <table className="border-collapse">
            <thead>
              <tr>
                <th
                  style={{
                    width: M_ROW_HEAD_W,
                    height: M_COL_HEAD_H,
                    background: BRAND.darkest,
                  }}
                />
                {Array.from({ length: bounds.cols }).map((_, i) => (
                  <th
                    key={i}
                    className="text-[8px] font-semibold border-b border-r"
                    style={{
                      width: M_CELL,
                      height: M_COL_HEAD_H,
                      background: '#fafbfa',
                      color: BRAND.mid,
                      borderColor: BRAND.border,
                    }}
                  >
                    {colLetter(i + 1)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: bounds.rows }).map((_, rIdx) => {
                const row = rIdx + 1
                return (
                  <tr key={row}>
                    <th
                      className="text-[8px] font-semibold border-b border-r"
                      style={{
                        width: M_ROW_HEAD_W,
                        height: M_CELL,
                        background: '#fafbfa',
                        color: BRAND.mid,
                        borderColor: BRAND.border,
                      }}
                    >
                      {row}
                    </th>
                    {Array.from({ length: bounds.cols }).map((_, cIdx) => {
                      const col = cIdx + 1
                      const sp = getSpaceAt({ spaces }, col, row)
                      const covered = !sp && isCellCoveredByBlock(blocks, col, row)
                      // ✨ Phase 4: in-cell MobileSpaceTile only renders for
                      // 1×1 spaces. Merged spaces render via the absolute
                      // MobileMergedSpaceTile after this table.
                      const showInCellTile = !!sp && !isMergedSpace(sp)
                      return (
                        <td
                          key={col}
                          className="relative"
                          style={{
                            width: M_CELL,
                            height: M_CELL,
                            background: sp ? BRAND.white : (covered ? 'transparent' : BRAND.bg),
                            borderRight: '1px dashed #e8ece9',
                            borderBottom: '1px dashed #e8ece9',
                            pointerEvents: covered ? 'none' : 'auto',
                          }}
                        >
                          {showInCellTile && sp && (
                            <MobileSpaceTile
                              space={sp}
                              occupied={vehicleBySpaceId.has(sp.id)}
                              onTap={() => setSelectedCoord(coordKey(col, row))}
                            />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Building blocks overlay */}
          {blocks.map(b => (
            <MobileBlockTile key={b.id} block={b} />
          ))}

          {/* ✨ Phase 4: Merged spaces — rendered absolute over the grid,
              spanning the full footprint. Tap → opens bottom sheet at the
              anchor coord (same key as where the space lives in `spaces`). */}
          {Object.values(spaces)
            .filter(sp => isMergedSpace(sp))
            .map(sp => {
              const occupied = vehicleBySpaceId.has(sp.id)
              const vehicle = vehicleBySpaceId.get(sp.id) || null
              return (
                <MobileMergedSpaceTile
                  key={sp.id}
                  space={sp}
                  occupied={occupied}
                  vehicle={vehicle}
                  onTap={() => setSelectedCoord(coordKey(sp.col, sp.row))}
                />
              )
            })}
        </div>
      </div>

      {/* BOTTOM SHEET */}
      {selectedSpace && (
        <MobileBottomSheet
          space={selectedSpace}
          vehicle={selectedVehicle}
          onClose={() => setSelectedCoord(null)}
          onParkVehicle={onParkVehicle}
          onMoveVehicle={onMoveVehicle}
          onCheckOutVehicle={onCheckOutVehicle}
          onViewVehicle={onViewVehicle}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// MOBILE SPACE TILE
// ════════════════════════════════════════════════════════════════════════

function MobileSpaceTile({
  space,
  occupied,
  onTap,
}: {
  space: ParkingSpace
  occupied: boolean
  onTap: () => void
}) {
  return (
    <button
      onClick={onTap}
      className="absolute inset-[2px] rounded grid place-items-center transition-transform active:scale-90"
      style={{
        background: occupied ? BRAND.error : '#cfd6d2',
      }}
      aria-label={`Space ${space.label} ${occupied ? 'occupied' : 'free'}`}
    >
      <span
        className="block rounded-full"
        style={{
          width: 6,
          height: 6,
          background: occupied ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)',
        }}
      />
    </button>
  )
}

// ════════════════════════════════════════════════════════════════════════
// MOBILE BLOCK TILE
// ════════════════════════════════════════════════════════════════════════

function MobileBlockTile({ block }: { block: BuildingBlock }) {
  const left = M_ROW_HEAD_W + (block.col - 1) * M_CELL
  const top = M_COL_HEAD_H + (block.row - 1) * M_CELL
  const width = block.w * M_CELL
  const height = block.h * M_CELL
  const isLight = LIGHT_BLOCK_COLORS.has(block.color)
  const isGradient = block.color.startsWith('linear-gradient')

  let radius = '4px'
  if (block.shape === 'rounded') radius = '7px'
  if (block.shape === 'capsule') radius = '999px'

  return (
    <div
      className="absolute grid place-items-center text-center font-bold pointer-events-none"
      style={{
        left: left + 1,
        top: top + 1,
        width: width - 2,
        height: height - 2,
        ...(isGradient ? { background: block.color } : { backgroundColor: block.color }),
        color: isLight ? BRAND.darkest : BRAND.white,
        fontSize: '7px',
        letterSpacing: '0.3px',
        padding: '2px',
        borderRadius: radius,
        zIndex: 3,
        overflow: 'hidden',
        lineHeight: 1,
      }}
    >
      {block.label}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// ✨ Phase 4: MOBILE MERGED SPACE TILE — multi-cell parking space
// ════════════════════════════════════════════════════════════════════════
// Read-only multi-cell tile for the mobile viewer. Renders absolute over
// the grid (like MobileBlockTile) so a 1×3 trailer bay shows as one wide
// red/grey rectangle. Tapping it opens the bottom sheet at the anchor
// coord, same as a 1×1 space.

function MobileMergedSpaceTile({
  space,
  occupied,
  vehicle,
  onTap,
}: {
  space: ParkingSpace
  occupied: boolean
  vehicle: MobileVehicle | null
  onTap: () => void
}) {
  const { w, h } = getSpaceFootprint(space)
  const left = M_ROW_HEAD_W + (space.col - 1) * M_CELL
  const top = M_COL_HEAD_H + (space.row - 1) * M_CELL
  const width = w * M_CELL
  const height = h * M_CELL

  // Show the reg if occupied (more useful for staff at a glance), otherwise
  // the space label. Tile is small so the font stays at 7px to match blocks.
  const text = occupied && vehicle ? vehicle.registration : space.label

  return (
    <button
      onClick={onTap}
      className="absolute rounded grid place-items-center text-center select-none transition-transform active:scale-95"
      style={{
        left: left + 1,
        top: top + 1,
        width: width - 2,
        height: height - 2,
        background: occupied ? BRAND.error : '#cfd6d2',
        color: occupied ? BRAND.white : BRAND.darkest,
        fontSize: '7px',
        fontWeight: 700,
        letterSpacing: '0.3px',
        padding: '2px',
        zIndex: 2,
        overflow: 'hidden',
        lineHeight: 1.1,
      }}
      aria-label={`Space ${space.label} ${occupied ? `occupied by ${vehicle?.registration || 'vehicle'}` : 'free'} (${w}×${h} merged)`}
    >
      {text}
    </button>
  )
}

// ════════════════════════════════════════════════════════════════════════
// BOTTOM SHEET
// ════════════════════════════════════════════════════════════════════════

interface MobileBottomSheetProps {
  space: ParkingSpace
  vehicle: MobileVehicle | null | undefined
  onClose: () => void
  onParkVehicle?: (spaceId: string) => void
  onMoveVehicle?: (vehicleId: string) => void
  onCheckOutVehicle?: (vehicleId: string) => void
  onViewVehicle?: (vehicleId: string) => void
}

function MobileBottomSheet({
  space,
  vehicle,
  onClose,
  onParkVehicle,
  onMoveVehicle,
  onCheckOutVehicle,
  onViewVehicle,
}: MobileBottomSheetProps) {
  const occupied = !!vehicle
  const coord = coordKey(space.col, space.row)
  // ✨ Phase 4: footprint info to show beneath the title for merged spaces
  const { w, h } = getSpaceFootprint(space)
  const merged = isMergedSpace(space)

  // close when clicking the dimmed backdrop
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-xl border-t shadow-2xl"
        style={{ background: BRAND.white, borderColor: BRAND.border }}
        role="dialog"
        aria-label={`Space ${space.label}`}
      >
        <div className="w-9 h-1 rounded-full mx-auto my-2" style={{ background: BRAND.border }} />

        <div className="px-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-base font-mono font-bold" style={{ color: BRAND.darkest }}>
              {space.label}
              {space.label !== coord && (
                <span className="text-xs font-normal ml-1.5" style={{ color: BRAND.mid }}>
                  ({coord})
                </span>
              )}
            </h4>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={
                occupied
                  ? { background: '#fee2e2', color: '#991b1b' }
                  : { background: '#d1fae5', color: '#065f46' }
              }
            >
              {occupied ? 'Occupied' : 'Free'}
            </span>
          </div>

          {/* ✨ Phase 4: footprint label so users know it's a multi-cell space */}
          {merged && (
            <p className="text-[10px] mb-2 font-semibold" style={{ color: BRAND.mid }}>
              {w} × {h} merged space ({w * h} cells)
            </p>
          )}

          <p className="text-[11px] mb-3" style={{ color: BRAND.mid, lineHeight: 1.5 }}>
            {occupied ? (
              <>
                Vehicle <b style={{ color: BRAND.darkest, fontFamily: 'monospace' }}>{vehicle!.registration}</b> is parked here.
                {vehicle!.make && vehicle!.model && (
                  <><br />{vehicle!.make} {vehicle!.model}</>
                )}
              </>
            ) : (
              <>This space is empty.<br />You can park a vehicle here.</>
            )}
          </p>

          <div className="grid grid-cols-2 gap-2">
            {!occupied && (
              <button
                onClick={() => {
                  onParkVehicle?.(space.id)
                  onClose()
                }}
                className="col-span-2 px-3 py-2.5 rounded-md text-xs font-semibold text-white"
                style={{ background: BRAND.dark }}
                disabled={!onParkVehicle}
              >
                + Park a vehicle here
              </button>
            )}
            {occupied && (
              <>
                <button
                  onClick={() => {
                    onViewVehicle?.(vehicle!.id)
                    onClose()
                  }}
                  className="col-span-2 px-3 py-2.5 rounded-md text-xs font-semibold text-white"
                  style={{ background: BRAND.dark }}
                  disabled={!onViewVehicle}
                >
                  View vehicle details
                </button>
                <button
                  onClick={() => {
                    onMoveVehicle?.(vehicle!.id)
                    onClose()
                  }}
                  className="px-3 py-2.5 rounded-md text-xs font-semibold border"
                  style={{
                    background: BRAND.white,
                    borderColor: BRAND.border,
                    color: BRAND.darkest,
                  }}
                  disabled={!onMoveVehicle}
                >
                  Move
                </button>
                <button
                  onClick={() => {
                    onCheckOutVehicle?.(vehicle!.id)
                    onClose()
                  }}
                  className="px-3 py-2.5 rounded-md text-xs font-semibold border"
                  style={{
                    background: BRAND.white,
                    borderColor: '#fecaca',
                    color: '#b91c1c',
                  }}
                  disabled={!onCheckOutVehicle}
                >
                  Check out
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}