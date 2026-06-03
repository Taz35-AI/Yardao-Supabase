// src/components/yard/layout/YardLayoutView.tsx
// Read-only yard layout viewer for the dashboard.
// Shows the saved branch layout with checked-in vehicles overlaid as
// coloured chips on their assigned parking spaces.
//
// VIEWPORT (Figma-style):
//   • Right-click + drag to pan (desktop)
//   • Pointer-event drag with edge-auto-scroll on touch
//   • Ctrl + scroll wheel to zoom (anchored on cursor)
//
// INTERACTIONS:
//   • Click empty space → ParkVehicleModal
//   • Click occupied space → onViewVehicle (existing detail modal)
//   • Drag chip from UnparkedVehiclesBar → empty space → parks
//   • Drag occupied chip → empty space → moves
//   • Drag occupied chip → UnparkedVehiclesBar → unparks  ✨ NEW v9
//
// PHASE 2.5 v9 UPDATES:
//   • Undo toast — 5-second window after every park / move / unpark
//   • Drag-to-unpark — drop a parked chip onto the strip to unpark it
//   • Hit-testing during pointer-event drag detects unpark zone via
//     data-unpark-zone="1" attribute on UnparkedVehiclesBar's root div
//
// ✨ PHASE 4: Merged spaces (trailers, transporters) render as a single
// MergedSpaceTile spanning multiple cells. All interactions (click to
// park / view, drag-to-move, drag-to-unpark, search highlight) work
// identically — the tile is just bigger.

'use client'

import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { CheckedInVehicle } from '@/types'
import { useYardLayout } from '@/hooks/useYardLayout'
import { useVehicleParking } from '@/hooks/useVehicleParking'
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
  // ✨ Phase 4: merged-space helpers
  getSpaceFootprint,
  isMergedSpace,
} from '@/lib/utils/yardLayoutUtils'
import { BRAND, BRAND_ALPHA, LIGHT_BLOCK_COLORS } from '@/constants/brand'
import { getVehicleChipColor } from '@/lib/utils/vehicleColorUtils'
import { ParkVehicleModal } from './ParkVehicleModal'
import { UnparkedVehiclesBar } from './UnparkedVehiclesBar'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  AlertTriangle,
  Map as MapIcon,
  Settings,
  Search,
  X,
  Undo2,
} from 'lucide-react'

// ─── Sizing — must match the editor for layout consistency ─────────────────
const CELL_PX = 56
const ROW_HEAD_W = 40
const COL_HEAD_H = 36
const ZOOM_MIN = 0.25
const ZOOM_MAX = 2.0
const ZOOM_STEP = 0.1

// Drag-edge auto-scroll thresholds
const EDGE_SCROLL_PX = 50
const EDGE_SCROLL_SPEED = 12

// ✨ Phase 2.5c: how long the Undo toast stays visible
const UNDO_TOAST_DURATION_MS = 5000

interface YardLayoutViewProps {
  branchId: string
  branchName?: string
  vehicles: CheckedInVehicle[]
  onViewVehicle: (vehicle: CheckedInVehicle) => void
  onOpenLayoutEditor?: () => void
  // Cancel a stuck transfer for an in-transit vehicle surfaced in the Park modal.
  onCancelTransfer?: (vehicleId: string) => void
  className?: string
}

// ✨ Phase 2.5c: tracks the most recent reversible action so we can undo
type LastAction =
  | { type: 'park'; vehicleId: string; spaceId: string }
  | { type: 'move'; vehicleId: string; fromSpaceId: string; toSpaceId: string }
  | { type: 'unpark'; vehicleId: string; fromSpaceId: string }
  | { type: 'force-move'; vehicleId: string; fromSpaceId: string | null; toSpaceId: string; displacedVehicleId: string }

interface ToastState {
  msg: string
  key: number
  tone?: 'ok' | 'warn'
  undoAction?: LastAction
}

export function YardLayoutView({
  branchId,
  branchName,
  vehicles,
  onViewVehicle,
  onOpenLayoutEditor,
  onCancelTransfer,
  className = '',
}: YardLayoutViewProps) {
  const { layout, loading, error } = useYardLayout(branchId)
  const parking = useVehicleParking()

  // Default to 60% so the whole yard fits on screen without the user
  // having to zoom out first. They can zoom in/out freely from here.
  const [zoom, setZoom] = useState(0.6)
  const [parkingTarget, setParkingTarget] = useState<ParkingSpace | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [draggingVehicleId, setDraggingVehicleId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  // ✨ Phase 2.5b: when true, the unparked bar visually advertises drop
  const [hoveringUnparkZone, setHoveringUnparkZone] = useState(false)
  const canvasApiRef = useRef<{ scrollToSpace: (spaceId: string) => void } | null>(null)
  // Bar's DOM ref so the canvas's pointer-event drag can hit-test it
  const unparkBarRef = useRef<HTMLDivElement>(null)

  // ── Toast plumbing ─────────────────────────────────────────────────────
  // ✨ Phase 2.5c: toast can now carry an undoAction — when present a button
  //                appears in the toast that triggers reversal.
  const showToast = useCallback((
    msg: string,
    tone: 'ok' | 'warn' = 'ok',
    undoAction?: LastAction,
  ) => {
    setToast({ msg, key: Date.now(), tone, undoAction })
  }, [])

  useEffect(() => {
    if (!toast) return
    const duration = toast.undoAction ? UNDO_TOAST_DURATION_MS : 2400
    const t = setTimeout(() => setToast(null), duration)
    return () => clearTimeout(t)
  }, [toast])

  // ── Build space-id → vehicle map for fast lookup ──────────────────────
  const vehicleBySpaceId = useMemo(() => {
    const map = new Map<string, CheckedInVehicle>()
    vehicles.forEach(v => {
      if (v.parkingSpaceId) map.set(v.parkingSpaceId, v)
    })
    return map
  }, [vehicles])

  // ── Bounds ─────────────────────────────────────────────────────────────
  const spaces = layout?.spaces || {}
  const blocks = layout?.blocks || []
  const bounds = useMemo(
    () => calculateBounds(spaces, blocks, /* isEditMode */ false),
    [spaces, blocks],
  )

  // ── Search matching ────────────────────────────────────────────────────
  const matchedSpaceIds = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (term.length < 1) return new Set<string>()
    const set = new Set<string>()
    vehicles.forEach(v => {
      if (!v.parkingSpaceId) return
      const reg = (v.registration || '').toLowerCase()
      const make = (v.make || '').toLowerCase()
      const model = (v.model || '').toLowerCase()
      const contract = (v.contract || '').toLowerCase()
      if (
        reg.includes(term) ||
        make.includes(term) ||
        model.includes(term) ||
        contract.includes(term)
      ) {
        set.add(v.parkingSpaceId)
      }
    })
    return set
  }, [search, vehicles])

  useEffect(() => {
    if (matchedSpaceIds.size === 0) return
    const firstId = matchedSpaceIds.values().next().value as string | undefined
    if (firstId && canvasApiRef.current) {
      const t = setTimeout(() => canvasApiRef.current?.scrollToSpace(firstId), 30)
      return () => clearTimeout(t)
    }
  }, [matchedSpaceIds])

  // ════════════════════════════════════════════════════════════════════
  // ACTION HANDLERS — wired with undo support
  // ════════════════════════════════════════════════════════════════════

  // ── Park a vehicle ─────────────────────────────────────────────────────
  const handlePark = useCallback(async (vehicleId: string, space: ParkingSpace) => {
    const ok = await parking.assignVehicleToSpace(vehicleId, space.id, branchId)
    if (ok) {
      const v = vehicles.find(x => x.id === vehicleId)
      showToast(
        `${v?.registration || 'Vehicle'} parked at ${space.label}`,
        'ok',
        { type: 'park', vehicleId, spaceId: space.id },
      )
      setParkingTarget(null)
    } else if (parking.error) {
      showToast(parking.error, 'warn')
    }
  }, [branchId, parking, vehicles, showToast])

  // ── Move a vehicle ─────────────────────────────────────────────────────
  const handleMove = useCallback(async (vehicleId: string, targetSpace: ParkingSpace) => {
    // Capture the vehicle's CURRENT space before we move it (for undo)
    const movedVehicle = vehicles.find(v => v.id === vehicleId)
    const fromSpaceId = movedVehicle?.parkingSpaceId || null

    // Already on target space — no-op
    if (fromSpaceId === targetSpace.id) return

    const occupant = vehicleBySpaceId.get(targetSpace.id)
    if (occupant && occupant.id !== vehicleId) {
      // Target is occupied — confirm before overwriting
      const ok = window.confirm(
        `${targetSpace.label} is occupied by ${occupant.registration}. Move ${
          movedVehicle?.registration || 'vehicle'
        } here anyway? (The other vehicle will become unparked.)`,
      )
      if (!ok) return
      const success = await parking.forceAssignVehicleToSpace(vehicleId, targetSpace.id, branchId)
      if (success) {
        showToast(
          `Moved to ${targetSpace.label}`,
          'ok',
          {
            type: 'force-move',
            vehicleId,
            fromSpaceId,
            toSpaceId: targetSpace.id,
            displacedVehicleId: occupant.id,
          },
        )
      } else if (parking.error) {
        showToast(parking.error, 'warn')
      }
      return
    }

    const success = await parking.assignVehicleToSpace(vehicleId, targetSpace.id, branchId)
    if (success) {
      // If vehicle had a previous space → it's a move, otherwise a park
      if (fromSpaceId) {
        showToast(
          `Moved to ${targetSpace.label}`,
          'ok',
          { type: 'move', vehicleId, fromSpaceId, toSpaceId: targetSpace.id },
        )
      } else {
        showToast(
          `Parked at ${targetSpace.label}`,
          'ok',
          { type: 'park', vehicleId, spaceId: targetSpace.id },
        )
      }
    } else if (parking.error) {
      showToast(parking.error, 'warn')
    }
  }, [branchId, parking, vehicleBySpaceId, vehicles, showToast])

  // ── Unpark a vehicle (drag to unparked bar) ────────────────────────────
  const handleUnpark = useCallback(async (vehicleId: string) => {
    const v = vehicles.find(x => x.id === vehicleId)
    const fromSpaceId = v?.parkingSpaceId
    if (!fromSpaceId) {
      // Already unparked — silent no-op
      return
    }
    const ok = await parking.unassignVehicle(vehicleId)
    if (ok) {
      showToast(
        `${v?.registration || 'Vehicle'} unparked`,
        'ok',
        { type: 'unpark', vehicleId, fromSpaceId },
      )
    } else if (parking.error) {
      showToast(parking.error, 'warn')
    }
  }, [parking, vehicles, showToast])

  // ── UNDO handler — reverses the last action ────────────────────────────
  const handleUndo = useCallback(async () => {
    const action = toast?.undoAction
    if (!action) return

    setToast(null) // dismiss the toast immediately

    switch (action.type) {
      case 'park': {
        // Undo park = unpark
        await parking.unassignVehicle(action.vehicleId)
        showToast('Park undone', 'ok')
        break
      }
      case 'move': {
        // Undo move = put vehicle back on its previous space
        // Verify previous space is still free first
        const occupant = vehicleBySpaceId.get(action.fromSpaceId)
        if (occupant && occupant.id !== action.vehicleId) {
          showToast('Cannot undo — original space now occupied', 'warn')
          return
        }
        await parking.assignVehicleToSpace(action.vehicleId, action.fromSpaceId, branchId)
        showToast('Move undone', 'ok')
        break
      }
      case 'unpark': {
        // Undo unpark = re-park on the original space (if still free)
        const occupant = vehicleBySpaceId.get(action.fromSpaceId)
        if (occupant) {
          showToast('Cannot undo — space is now occupied', 'warn')
          return
        }
        await parking.assignVehicleToSpace(action.vehicleId, action.fromSpaceId, branchId)
        showToast('Unpark undone', 'ok')
        break
      }
      case 'force-move': {
        // Undo force-move = put both vehicles back where they were.
        // First put the displaced vehicle back on the target space (the one
        // it was kicked from), then put the moved vehicle back where it came.
        await parking.assignVehicleToSpace(action.displacedVehicleId, action.toSpaceId, branchId)
        if (action.fromSpaceId) {
          await parking.assignVehicleToSpace(action.vehicleId, action.fromSpaceId, branchId)
        } else {
          await parking.unassignVehicle(action.vehicleId)
        }
        showToast('Move undone', 'ok')
        break
      }
    }
  }, [toast, parking, vehicleBySpaceId, branchId, showToast])

  // ── Zoom controls ──────────────────────────────────────────────────────
  const zoomIn = () => setZoom(z => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))
  const zoomOut = () => setZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))

  // ── Top-level loading / error / empty states ──────────────────────────
  if (loading) {
    return (
      <div className={`${className} p-12 flex items-center justify-center rounded-md border`} style={{ background: BRAND.white, borderColor: BRAND.border }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-3" style={{ borderColor: BRAND.dark }} />
          <p className="text-sm" style={{ color: BRAND.mid }}>Loading yard layout…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`${className} p-6 rounded-md border`} style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
        <p className="text-sm font-semibold text-red-800">Failed to load yard layout</p>
        <p className="text-xs text-red-600 mt-1">{error}</p>
      </div>
    )
  }

  if (!layout || (Object.keys(layout.spaces).length === 0 && layout.blocks.length === 0)) {
    return (
      <div
        className={`${className} p-10 text-center rounded-md border`}
        style={{ background: BRAND.white, borderColor: BRAND.border }}
      >
        <div
          className="w-14 h-14 rounded-full mx-auto mb-3 grid place-items-center"
          style={{ background: BRAND_ALPHA.midSoft }}
        >
          <MapIcon className="w-6 h-6" style={{ color: BRAND.dark }} />
        </div>
        <h3 className="text-base font-semibold" style={{ color: BRAND.darkest }}>
          No yard layout for this branch yet
        </h3>
        <p className="text-sm mt-1 max-w-md mx-auto" style={{ color: BRAND.mid }}>
          Design your yard in Settings → Branches. Add parking spaces and buildings,
          save the layout, and you'll see it here with all your checked-in vehicles
          mapped onto it.
        </p>
        {onOpenLayoutEditor && (
          <button
            onClick={onOpenLayoutEditor}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white"
            style={{ background: BRAND.dark }}
          >
            <Settings className="w-4 h-4" />
            Open layout editor
          </button>
        )}
      </div>
    )
  }

  const totalSpaces = Object.keys(spaces).length
  const occupiedCount = vehicleBySpaceId.size
  const freeCount = totalSpaces - occupiedCount

  return (
        <div className={`${className} flex flex-col gap-2`}>
          {/* ✨ Inject the global keyframe animation for search-match pulses */}
          <SearchMatchStyles />
 
          {/* UNPARKED VEHICLES STRIP — also acts as a drop target to unpark */}
          <UnparkedVehiclesBar
        vehicles={vehicles}
        onDragStart={(id) => setDraggingVehicleId(id)}
        onDragEnd={() => setDraggingVehicleId(null)}
        isReceivingDrop={hoveringUnparkZone}
        onUnparkDrop={handleUnpark}
        dropZoneRef={unparkBarRef}
      />

      {/* SEARCH + HEADER */}
      <div
        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 px-3 py-2 rounded-md border"
        style={{ background: BRAND.white, borderColor: BRAND.border }}
      >
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          <MapIcon className="w-4 h-4 flex-shrink-0" style={{ color: BRAND.dark }} />
          <span className="text-sm font-semibold whitespace-nowrap" style={{ color: BRAND.darkest }}>
            Yard map {branchName && <span className="font-normal" style={{ color: BRAND.mid }}>· {branchName}</span>}
          </span>
          <span className="ml-auto sm:ml-2 flex items-center gap-1.5 flex-wrap">
            <Stat label="Total" value={totalSpaces} />
            <Stat label="Free" value={freeCount} tone="ok" />
            <Stat label="Occupied" value={occupiedCount} tone="warn" />
          </span>
        </div>

        {/* Zoom controls — moved into the header row */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={zoomOut}
            disabled={zoom <= ZOOM_MIN}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" style={{ color: BRAND.darkest }} />
          </button>
          <button
            onClick={() => setZoom(0.6)}
            className="px-2 py-1 rounded hover:bg-gray-100 text-xs font-mono font-semibold tabular-nums"
            style={{ color: BRAND.darkest, minWidth: 56 }}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={zoomIn}
            disabled={zoom >= ZOOM_MAX}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" style={{ color: BRAND.darkest }} />
          </button>
          <span className="w-px h-4 mx-1" style={{ background: BRAND.border }} />
          <button
            onClick={() => setZoom(0.6)}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 text-[11px]"
            style={{ color: BRAND.mid }}
          >
            <Maximize2 className="w-3 h-3" />
            Reset
          </button>
        </div>

        <div className="relative flex-shrink-0 w-full sm:w-64">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
            style={{ color: BRAND.mid }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find reg, make, contract…"
            className="w-full pl-8 pr-8 py-1.5 rounded-md border text-sm"
            style={{ background: BRAND.bg, borderColor: BRAND.border, color: BRAND.darkest }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-black/5"
              aria-label="Clear search"
            >
              <X className="w-3 h-3" style={{ color: BRAND.mid }} />
            </button>
          )}
        </div>
      </div>

      {/* Match counter */}
      {search.trim() && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border text-[11px]"
          style={{
            background: matchedSpaceIds.size > 0 ? '#fffbeb' : '#fef2f2',
            borderColor: matchedSpaceIds.size > 0 ? '#fde68a' : '#fecaca',
            color: matchedSpaceIds.size > 0 ? '#78350f' : '#991b1b',
          }}
        >
          <Search className="w-3 h-3 flex-shrink-0" />
          <span className="font-semibold">
            {matchedSpaceIds.size === 0
              ? 'No matches in parked vehicles'
              : `${matchedSpaceIds.size} match${matchedSpaceIds.size === 1 ? '' : 'es'} highlighted in yellow`}
          </span>
        </div>
      )}

      {/* CANVAS */}
      <YardCanvas
        spaces={spaces}
        blocks={blocks}
        bounds={bounds}
        zoom={zoom}
        setZoom={setZoom}
        vehicleBySpaceId={vehicleBySpaceId}
        draggingVehicleId={draggingVehicleId}
        matchedSpaceIds={matchedSpaceIds}
        onClickEmptySpace={(space) => setParkingTarget(space)}
        onClickOccupiedSpace={(vehicle) => onViewVehicle(vehicle)}
        onDropVehicle={(vehicleId, space) => handleMove(vehicleId, space)}
        onVehicleDragStartFromCanvas={(vid) => setDraggingVehicleId(vid)}
        onVehicleDragEndFromCanvas={() => {
          setDraggingVehicleId(null)
          setHoveringUnparkZone(false)
        }}
        onPointerOverUnparkZone={(over) => setHoveringUnparkZone(over)}
        onUnparkViaPointerDrag={handleUnpark}
        unparkBarRef={unparkBarRef}
        registerApi={(api) => { canvasApiRef.current = api }}
      />

      {/* PARK VEHICLE MODAL */}
      {parkingTarget && (
        <ParkVehicleModal
          space={parkingTarget}
          vehicles={vehicles}
          spaces={Object.values(spaces)}
          busy={parking.assigning}
          onPick={(vid) => handlePark(vid, parkingTarget)}
          onMove={(vid) => handleMove(vid, parkingTarget)}
          onCancelTransfer={
            onCancelTransfer
              ? (vid) => {
                  // Close the picker, then hand off to the existing
                  // cancel-transfer confirmation at the dashboard level.
                  setParkingTarget(null)
                  onCancelTransfer(vid)
                }
              : undefined
          }
          onClose={() => setParkingTarget(null)}
        />
      )}

      {/* TOAST + UNDO */}
      {toast && (
        <div
          key={toast.key}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-md text-sm font-medium text-white shadow-lg z-50 flex items-center gap-3"
          style={{
            background: toast.tone === 'warn' ? '#b91c1c' : BRAND.darkest,
            // Slight max-width on smaller phones so the toast doesn't get clipped
            maxWidth: 'calc(100vw - 32px)',
          }}
        >
          {toast.tone === 'warn' && <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
          <span className="truncate">{toast.msg}</span>
          {toast.undoAction && (
            <button
              onClick={handleUndo}
              className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-xs uppercase tracking-wide ml-2"
              style={{
                background: BRAND.accent,
                color: BRAND.darkest,
              }}
            >
              <Undo2 className="w-3 h-3" />
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// STAT PILL
// ════════════════════════════════════════════════════════════════════════
function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' }) {
  const colour =
    tone === 'ok' ? '#10b981' :
    tone === 'warn' ? '#f59e0b' :
    BRAND.darkest
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]"
      style={{ background: BRAND.bg, color: BRAND.mid }}
    >
      {label}: <b style={{ color: colour }}>{value}</b>
    </span>
  )
}

// ════════════════════════════════════════════════════════════════════════
// CANVAS — viewport with pan + zoom + the grid + vehicle overlays
// ════════════════════════════════════════════════════════════════════════

interface YardCanvasApi {
  scrollToSpace: (spaceId: string) => void
}

interface YardCanvasProps {
  spaces: Record<string, ParkingSpace>
  blocks: BuildingBlock[]
  bounds: { cols: number; rows: number }
  zoom: number
  setZoom: (z: number | ((prev: number) => number)) => void
  vehicleBySpaceId: Map<string, CheckedInVehicle>
  draggingVehicleId: string | null
  matchedSpaceIds: Set<string>
  onClickEmptySpace: (space: ParkingSpace) => void
  onClickOccupiedSpace: (vehicle: CheckedInVehicle) => void
  onDropVehicle: (vehicleId: string, space: ParkingSpace) => void
  onVehicleDragStartFromCanvas: (vehicleId: string) => void
  onVehicleDragEndFromCanvas: () => void
  /** Parent updates `hoveringUnparkZone` state so the bar visually responds */
  onPointerOverUnparkZone: (over: boolean) => void
  /** Called when the pointer-event drag releases over the unpark zone */
  onUnparkViaPointerDrag: (vehicleId: string) => void
  /** Ref to the UnparkedVehiclesBar root for hit-testing during drag */
  unparkBarRef: React.RefObject<HTMLDivElement>
  registerApi: (api: YardCanvasApi) => void
}

function YardCanvas({
  spaces,
  blocks,
  bounds,
  zoom,
  setZoom,
  vehicleBySpaceId,
  draggingVehicleId,
  matchedSpaceIds,
  onClickEmptySpace,
  onClickOccupiedSpace,
  onDropVehicle,
  onVehicleDragStartFromCanvas,
  onVehicleDragEndFromCanvas,
  onPointerOverUnparkZone,
  onUnparkViaPointerDrag,
  unparkBarRef,
  registerApi,
}: YardCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  const [isPanning, setIsPanning] = useState(false)
  const panStateRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null)

  const stagePixelWidth = ROW_HEAD_W + bounds.cols * CELL_PX
  const stagePixelHeight = COL_HEAD_H + bounds.rows * CELL_PX

  const onContextMenu = (e: React.MouseEvent) => e.preventDefault()

  // ── Imperative API ─────────────────────────────────────────────────────
  useEffect(() => {
    registerApi({
      scrollToSpace: (spaceId: string) => {
        const sp = Object.values(spaces).find(s => s.id === spaceId)
        if (!sp) return
        const vp = viewportRef.current
        if (!vp) return
        const cellLeft = ROW_HEAD_W + (sp.col - 1) * CELL_PX
        const cellTop  = COL_HEAD_H + (sp.row - 1) * CELL_PX
        const targetX = cellLeft * zoom - vp.clientWidth / 2 + (CELL_PX * zoom) / 2 + 24
        const targetY = cellTop  * zoom - vp.clientHeight / 2 + (CELL_PX * zoom) / 2 + 24
        vp.scrollTo({
          left: Math.max(0, targetX),
          top:  Math.max(0, targetY),
          behavior: 'smooth',
        })
      },
    })
  }, [registerApi, spaces, zoom])

  // ── Right-click + drag = pan ──────────────────────────────────────────
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return
      e.preventDefault()
      setIsPanning(true)
      panStateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: vp.scrollLeft,
        scrollTop: vp.scrollTop,
      }
    }
    const onMouseMove = (e: MouseEvent) => {
      const state = panStateRef.current
      if (!state) return
      e.preventDefault()
      vp.scrollLeft = state.scrollLeft - (e.clientX - state.startX)
      vp.scrollTop = state.scrollTop - (e.clientY - state.startY)
    }
    const onMouseUp = () => {
      if (!panStateRef.current) return
      panStateRef.current = null
      setIsPanning(false)
    }

    vp.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      vp.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // ── Ctrl + scroll = zoom ──────────────────────────────────────────────
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()

      const rect = vp.getBoundingClientRect()
      const cursorX = e.clientX - rect.left + vp.scrollLeft
      const cursorY = e.clientY - rect.top + vp.scrollTop
      const beforeX = cursorX / zoom
      const beforeY = cursorY / zoom

      const delta = -e.deltaY * 0.001
      const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * (1 + delta)))
      if (nextZoom === zoom) return

      const afterX = beforeX * nextZoom
      const afterY = beforeY * nextZoom
      const newScrollLeft = afterX - (e.clientX - rect.left)
      const newScrollTop = afterY - (e.clientY - rect.top)

      setZoom(nextZoom)
      requestAnimationFrame(() => {
        if (!vp) return
        vp.scrollLeft = newScrollLeft
        vp.scrollTop = newScrollTop
      })
    }

    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
  }, [zoom, setZoom])

  // ── Drop highlight management ──────────────────────────────────────────
  const setDropState = (col: number, row: number, state: 'target' | 'invalid' | null) => {
    const cell = frameRef.current?.querySelector(`[data-col="${col}"][data-row="${row}"]`) as HTMLElement | null
    if (!cell) return
    if (state === null) cell.removeAttribute('data-drop')
    else cell.setAttribute('data-drop', state)
  }
  const clearAllDropStates = () => {
    frameRef.current?.querySelectorAll('[data-drop]').forEach(el => el.removeAttribute('data-drop'))
  }

  // ── HTML5 drop handlers (desktop drag from UnparkedVehiclesBar) ────────
  const onCellDragOver = (e: React.DragEvent, col: number, row: number) => {
    if (!draggingVehicleId) return
    const sp = getSpaceAt({ spaces }, col, row)
    if (!sp) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropState(col, row, vehicleBySpaceId.has(sp.id) ? 'invalid' : 'target')
  }
  const onCellDragLeave = (col: number, row: number) => {
    setDropState(col, row, null)
  }
  const onCellDrop = (e: React.DragEvent, col: number, row: number) => {
    const vid = e.dataTransfer.getData('text/yardao-vehicle-id')
    clearAllDropStates()
    if (!vid) return
    const sp = getSpaceAt({ spaces }, col, row)
    if (!sp) return
    e.preventDefault()
    onDropVehicle(vid, sp)
  }

  // 🍏 iOS Safari fires a synthetic `click` on the drop target AFTER a
  // touch drag ends (Android doesn't), which would re-open the vehicle-
  // details modal right after a move. Library-grade fix (same approach
  // react-beautiful-dnd uses): when a real drag ends, swallow exactly
  // the NEXT click via a one-shot capture-phase listener on window —
  // precise, no timing heuristic. A short safety timeout removes the
  // listener if no ghost click ever arrives (desktop mouse / Android),
  // so it can never eat a later legitimate click.
  const blockNextClick = useCallback(() => {
    let timer: ReturnType<typeof setTimeout>
    const onClickCapture = (ev: MouseEvent) => {
      ev.stopPropagation()
      ev.preventDefault()
      window.removeEventListener('click', onClickCapture, true)
      clearTimeout(timer)
    }
    window.addEventListener('click', onClickCapture, true)
    timer = setTimeout(() => {
      window.removeEventListener('click', onClickCapture, true)
    }, 400)
  }, [])

  const onCellClick = (col: number, row: number) => {
    const sp = getSpaceAt({ spaces }, col, row)
    if (!sp) return
    const vehicle = vehicleBySpaceId.get(sp.id)
    if (vehicle) onClickOccupiedSpace(vehicle)
    else onClickEmptySpace(sp)
  }

  // ── POINTER-EVENT DRAG (works on mouse AND touch) ─────────────────────
  const dragSessionRef = useRef<{
    vehicleId: string
    pointerId: number
    startedAt: number
    startX: number
    startY: number
    moved: boolean
    rafHandle: number | null
    autoScrollX: number
    autoScrollY: number
  } | null>(null)

  const tickAutoScroll = useCallback(() => {
    const session = dragSessionRef.current
    const vp = viewportRef.current
    if (!session || !vp) return
    if (session.autoScrollX !== 0 || session.autoScrollY !== 0) {
      vp.scrollLeft += session.autoScrollX
      vp.scrollTop  += session.autoScrollY
    }
    session.rafHandle = requestAnimationFrame(tickAutoScroll)
  }, [])

  const updateAutoScroll = useCallback((clientX: number, clientY: number) => {
    const vp = viewportRef.current
    const session = dragSessionRef.current
    if (!vp || !session) return
    const r = vp.getBoundingClientRect()

    let vx = 0
    let vy = 0

    if (clientX < r.left + EDGE_SCROLL_PX) {
      const dist = Math.max(0, clientX - r.left)
      vx = -EDGE_SCROLL_SPEED * (1 - dist / EDGE_SCROLL_PX)
    } else if (clientX > r.right - EDGE_SCROLL_PX) {
      const dist = Math.max(0, r.right - clientX)
      vx = EDGE_SCROLL_SPEED * (1 - dist / EDGE_SCROLL_PX)
    }
    if (clientY < r.top + EDGE_SCROLL_PX) {
      const dist = Math.max(0, clientY - r.top)
      vy = -EDGE_SCROLL_SPEED * (1 - dist / EDGE_SCROLL_PX)
    } else if (clientY > r.bottom - EDGE_SCROLL_PX) {
      const dist = Math.max(0, r.bottom - clientY)
      vy = EDGE_SCROLL_SPEED * (1 - dist / EDGE_SCROLL_PX)
    }

    session.autoScrollX = vx
    session.autoScrollY = vy
  }, [])

  const findCellUnderPointer = useCallback((clientX: number, clientY: number): { col: number; row: number; td: HTMLElement } | null => {
    const els = document.elementsFromPoint(clientX, clientY)
    for (const el of els) {
      if (el instanceof HTMLElement && el.tagName === 'TD' && el.dataset.col && el.dataset.row) {
        return {
          col: parseInt(el.dataset.col, 10),
          row: parseInt(el.dataset.row, 10),
          td: el,
        }
      }
    }
    return null
  }, [])

  // ✨ Phase 2.5b: detect if pointer is currently over the UnparkedVehiclesBar
  const isPointerOverUnparkZone = useCallback((clientX: number, clientY: number): boolean => {
    const els = document.elementsFromPoint(clientX, clientY)
    for (const el of els) {
      if (el instanceof HTMLElement && el.dataset.unparkZone === '1') return true
      // Also detect children of the unpark zone
      if (el instanceof HTMLElement && el.closest('[data-unpark-zone="1"]')) return true
    }
    return false
  }, [])

  const onDragPointerMove = useCallback((e: PointerEvent) => {
    const session = dragSessionRef.current
    if (!session || e.pointerId !== session.pointerId) return

    if (!session.moved) {
      const dx = e.clientX - session.startX
      const dy = e.clientY - session.startY
      if (Math.hypot(dx, dy) > 6) session.moved = true
    }

    if (!session.moved) return

    e.preventDefault()
    clearAllDropStates()

    // ✨ Phase 2.5b: check if we're over the unpark zone
    const overUnpark = isPointerOverUnparkZone(e.clientX, e.clientY)
    onPointerOverUnparkZone(overUnpark)

    if (overUnpark) {
      // Don't highlight any cell when hovering the unpark bar
      return
    }

    const cell = findCellUnderPointer(e.clientX, e.clientY)
    if (cell) {
      const sp = getSpaceAt({ spaces }, cell.col, cell.row)
      if (sp) {
        const occupied = vehicleBySpaceId.has(sp.id) && vehicleBySpaceId.get(sp.id)?.id !== session.vehicleId
        cell.td.setAttribute('data-drop', occupied ? 'invalid' : 'target')
      }
    }
    updateAutoScroll(e.clientX, e.clientY)
  }, [findCellUnderPointer, isPointerOverUnparkZone, onPointerOverUnparkZone, spaces, vehicleBySpaceId, updateAutoScroll])

  const onDragPointerUp = useCallback((e: PointerEvent) => {
    const session = dragSessionRef.current
    if (!session || e.pointerId !== session.pointerId) return

    if (session.rafHandle !== null) {
      cancelAnimationFrame(session.rafHandle)
      session.rafHandle = null
    }
    clearAllDropStates()

    document.removeEventListener('pointermove', onDragPointerMove)
    document.removeEventListener('pointerup', onDragPointerUp)
    document.removeEventListener('pointercancel', onDragPointerUp)

    // If never moved, treat as click
    if (!session.moved) {
      dragSessionRef.current = null
      onVehicleDragEndFromCanvas()
      return
    }

    // A real drag happened — swallow the iOS ghost click that follows.
    blockNextClick()

    // ✨ Phase 2.5b: check if release was over the unpark zone
    if (isPointerOverUnparkZone(e.clientX, e.clientY)) {
      onUnparkViaPointerDrag(session.vehicleId)
      dragSessionRef.current = null
      onVehicleDragEndFromCanvas()
      return
    }

    // Otherwise — finalise drop on a cell
    const cell = findCellUnderPointer(e.clientX, e.clientY)
    if (cell) {
      const sp = getSpaceAt({ spaces }, cell.col, cell.row)
      if (sp) {
        onDropVehicle(session.vehicleId, sp)
      }
    }

    dragSessionRef.current = null
    onVehicleDragEndFromCanvas()
  }, [blockNextClick, findCellUnderPointer, isPointerOverUnparkZone, onDragPointerMove, onDropVehicle, onUnparkViaPointerDrag, onVehicleDragEndFromCanvas, spaces])

  // ✋ Long-press gating for TOUCH input. On mobile, the same pointer-event
  // pipeline handles "pan the canvas" and "drag this chip" — without a delay
  // any swipe across a chip moves the vehicle by accident. We require the
  // user to hold the chip still for 500 ms before drag arms; below that, the
  // browser pans normally and the chip's onClick fires for quick taps.
  // Mouse input keeps instant-drag (precise pointer, no false triggers).
  const LONG_PRESS_MS = 500
  const LONG_PRESS_MOVE_TOLERANCE = 8

  const longPressTimerRef = useRef<number | null>(null)
  const longPressGuardRef = useRef<{
    pointerId: number
    move: (e: PointerEvent) => void
    up: (e: PointerEvent) => void
  } | null>(null)

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    const guard = longPressGuardRef.current
    if (guard) {
      document.removeEventListener('pointermove', guard.move)
      document.removeEventListener('pointerup', guard.up)
      document.removeEventListener('pointercancel', guard.up)
      longPressGuardRef.current = null
    }
  }, [])

  // Shared "actually arm the drag" path. Called instantly for mouse, after
  // the 500 ms long-press for touch.
  const armDrag = useCallback(
    (vehicleId: string, pointerId: number, startX: number, startY: number) => {
      onVehicleDragStartFromCanvas(vehicleId)

      dragSessionRef.current = {
        vehicleId,
        pointerId,
        startedAt: Date.now(),
        startX,
        startY,
        moved: false,
        rafHandle: null,
        autoScrollX: 0,
        autoScrollY: 0,
      }
      dragSessionRef.current.rafHandle = requestAnimationFrame(tickAutoScroll)

      document.addEventListener('pointermove', onDragPointerMove, { passive: false })
      document.addEventListener('pointerup', onDragPointerUp)
      document.addEventListener('pointercancel', onDragPointerUp)
    },
    [onDragPointerMove, onDragPointerUp, onVehicleDragStartFromCanvas, tickAutoScroll],
  )

  const onParkedVehiclePointerDown = useCallback(
    (e: React.PointerEvent, vehicleId: string) => {
      if (e.button !== undefined && e.button > 0) return
      e.stopPropagation()

      const isTouch = e.pointerType === 'touch'
      const startX = e.clientX
      const startY = e.clientY
      const pointerId = e.pointerId

      // Mouse / pen → instant left-click drag. preventDefault stops the
      // browser starting a native selection/image drag (which made the
      // gesture flaky — left-drags often slipped into a click and opened
      // the details modal instead of moving). setPointerCapture pins the
      // gesture to this tile so a fast drag, or the tile re-rendering
      // mid-drag, can't lose it.
      if (!isTouch) {
        e.preventDefault()
        try {
          e.currentTarget.setPointerCapture(pointerId)
        } catch {
          // pointer already gone / unsupported — drag still works via
          // the document listeners armDrag attaches.
        }
        armDrag(vehicleId, pointerId, startX, startY)
        return
      }

      // Touch → require a 500 ms hold without significant movement. While we
      // wait, watch for movement (= user is panning) or pointerup (= tap)
      // and bail out so the browser handles the gesture naturally.
      const handleMoveDuringWait = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return
        const dx = moveEvent.clientX - startX
        const dy = moveEvent.clientY - startY
        if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE) {
          cancelLongPress()
        }
      }

      const handleUpDuringWait = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return
        cancelLongPress()
      }

      document.addEventListener('pointermove', handleMoveDuringWait, { passive: true })
      document.addEventListener('pointerup', handleUpDuringWait)
      document.addEventListener('pointercancel', handleUpDuringWait)

      longPressGuardRef.current = {
        pointerId,
        move: handleMoveDuringWait,
        up: handleUpDuringWait,
      }

      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null
        // Tear down wait-listeners and arm the real drag.
        if (longPressGuardRef.current) {
          document.removeEventListener('pointermove', longPressGuardRef.current.move)
          document.removeEventListener('pointerup', longPressGuardRef.current.up)
          document.removeEventListener('pointercancel', longPressGuardRef.current.up)
          longPressGuardRef.current = null
        }
        armDrag(vehicleId, pointerId, startX, startY)
        // Subtle haptic pop so the user *feels* the vehicle being picked up.
        // Wrapped in try/catch so the web fallback (no Capacitor bridge) is safe.
        try {
          void Haptics.impact({ style: ImpactStyle.Medium })
        } catch {
          /* haptics unavailable on web — silently ignore */
        }
      }, LONG_PRESS_MS)
    },
    [armDrag, cancelLongPress],
  )

  useEffect(() => {
    return () => {
      if (
        dragSessionRef.current?.rafHandle !== null &&
        dragSessionRef.current?.rafHandle !== undefined
      ) {
        cancelAnimationFrame(dragSessionRef.current.rafHandle)
      }
      // Make sure any pending long-press timer + listeners are cleaned up
      // when the component unmounts mid-press.
      cancelLongPress()
    }
  }, [cancelLongPress])

  return (
    <div
      ref={viewportRef}
      onContextMenu={onContextMenu}
      className="overflow-auto rounded-md border relative"
      style={{
        background: BRAND.bg,
        borderColor: BRAND.border,
        cursor: isPanning ? 'grabbing' : 'default',
        height: 'min(70vh, 720px)',
        backgroundImage: `radial-gradient(circle, rgba(1,38,25,0.08) 1px, transparent 1px)`,
        backgroundSize: '14px 14px',
        touchAction: 'auto',
      }}
    >
      <div
        ref={stageRef}
        style={{
          width: stagePixelWidth * zoom + 800,
          height: stagePixelHeight * zoom + 600,
          padding: 24,
          boxSizing: 'content-box',
        }}
      >
        <div
          ref={frameRef}
          style={{
            width: stagePixelWidth,
            height: stagePixelHeight,
            transform: `scale(${zoom})`,
            transformOrigin: '0 0',
            position: 'relative',
            background: BRAND.white,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 6,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <table style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                <th
                  style={{
                    width: ROW_HEAD_W,
                    height: COL_HEAD_H,
                    background: BRAND.darkest,
                  }}
                />
                {Array.from({ length: bounds.cols }).map((_, i) => (
                  <th
                    key={i}
                    style={{
                      width: CELL_PX,
                      height: COL_HEAD_H,
                      fontSize: 11,
                      fontWeight: 600,
                      background: '#fafbfa',
                      color: BRAND.mid,
                      borderBottom: `1px solid ${BRAND.border}`,
                      borderRight: `1px solid ${BRAND.border}`,
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
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
                      style={{
                        width: ROW_HEAD_W,
                        height: CELL_PX,
                        fontSize: 11,
                        fontWeight: 600,
                        background: '#fafbfa',
                        color: BRAND.mid,
                        borderBottom: `1px solid ${BRAND.border}`,
                        borderRight: `1px solid ${BRAND.border}`,
                      }}
                    >
                      {row}
                    </th>
                    {Array.from({ length: bounds.cols }).map((_, cIdx) => {
                      const col = cIdx + 1
                      const sp = getSpaceAt({ spaces }, col, row)
                      const covered = !sp && isCellCoveredByBlock(blocks, col, row)
                      const occupant = sp ? vehicleBySpaceId.get(sp.id) : null
                      const isMatch = sp ? matchedSpaceIds.has(sp.id) : false
                      // ✨ Phase 4: in-cell SpaceTile only renders for 1×1
                      // spaces. Merged spaces are rendered as a single
                      // MergedSpaceTile after the table (absolute, spans
                      // the full footprint) so they look right and the
                      // user can click/drag the whole thing as one unit.
                      const showInCellTile = !!sp && !isMergedSpace(sp)
                      return (
                        <td
                          key={col}
                          data-col={col}
                          data-row={row}
                          data-match={isMatch ? '1' : undefined}
                          onClick={() => onCellClick(col, row)}
                          onDragOver={(e) => onCellDragOver(e, col, row)}
                          onDragLeave={() => onCellDragLeave(col, row)}
                          onDrop={(e) => onCellDrop(e, col, row)}
                          style={{
                            width: CELL_PX,
                            height: CELL_PX,
                            padding: 0,
                            background: sp ? BRAND.white : (covered ? 'transparent' : BRAND.bg),
                            borderRight: '1px dashed #e8ece9',
                            borderBottom: '1px dashed #e8ece9',
                            cursor: sp ? 'pointer' : 'default',
                            pointerEvents: covered ? 'none' : 'auto',
                            position: 'relative',
                          }}
                          title={
                            sp
                              ? occupant
                                ? `${sp.label} · ${occupant.registration} (${occupant.make || ''} ${occupant.model || ''})${occupant.contract ? ' · ' + occupant.contract : ''}${
                                    occupant.parkedByName
                                      ? `\nLast moved by ${occupant.parkedByName}${
                                          occupant.parkedAt instanceof Date
                                            ? ' · ' + occupant.parkedAt.toLocaleString()
                                            : ''
                                        }`
                                      : ''
                                  }`
                                : `${sp.label} · Free — click to park a vehicle`
                              : undefined
                          }
                        >
                          {showInCellTile && sp && (
                            <SpaceTile
                              space={sp}
                              vehicle={occupant}
                              isMatch={isMatch}
                              onParkedPointerDown={onParkedVehiclePointerDown}
                            />
                          )}
                          <DropOverlay />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>

          {blocks.map(b => <BlockTile key={b.id} block={b} />)}

          {/* ✨ Phase 4: Merged spaces — rendered absolute, spanning their
              full footprint. Each tile owns its own click + drag-drop
              handlers so all the same interactions work as for 1×1 spaces. */}
          {Object.values(spaces)
            .filter(sp => isMergedSpace(sp))
            .map(sp => {
              const occupant = vehicleBySpaceId.get(sp.id)
              const isMatch = matchedSpaceIds.has(sp.id)
              return (
                <MergedSpaceTile
                  key={sp.id}
                  space={sp}
                  vehicle={occupant}
                  isMatch={isMatch}
                  draggingVehicleId={draggingVehicleId}
                  onClick={() => {
                    if (occupant) onClickOccupiedSpace(occupant)
                    else onClickEmptySpace(sp)
                  }}
                  onParkedPointerDown={onParkedVehiclePointerDown}
                  onDropVehicle={onDropVehicle}
                />
              )
            })}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// SPACE TILE — renders inside a single cell, shows label or vehicle chip
// ────────────────────────────────────────────────────────────────────────
function SpaceTile({
  space,
  vehicle,
  isMatch,
  onParkedPointerDown,
}: {
  space: ParkingSpace
  vehicle: CheckedInVehicle | null | undefined
  isMatch: boolean
  onParkedPointerDown: (e: React.PointerEvent, vehicleId: string) => void
}) {
  if (vehicle) {
    const chip = getVehicleChipColor(vehicle)
    const reg = (vehicle.registration || '—').trim()

    // Mobile-first reg layout: always split at char 4 on mobile (<640px)
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640

    let line1 = reg
    let line2 = ''
    let isLongReg = false

    if (isMobile && reg.length > 4) {
      line1 = reg.slice(0, 4)
      line2 = reg.slice(4)
      isLongReg = true
    } else if (!isMobile && reg.length > 7) {
      const breakIdx = reg.search(/[\s(]/)
      const mid = Math.ceil(reg.length / 2)
      const splitAt = breakIdx > 0 && breakIdx >= mid - 2 && breakIdx <= mid + 2 ? breakIdx : mid
      line1 = reg.slice(0, splitAt)
      line2 = reg.slice(splitAt)
      isLongReg = true
    }

    return (
      <div
        onPointerDown={(e) => onParkedPointerDown(e, vehicle.id)}
        className={`absolute inset-1 rounded flex flex-col items-center justify-center select-none text-center cursor-grab active:cursor-grabbing touch-none ${isMatch ? 'ylv-search-match' : ''}`}
        style={{
          background: chip.background,
          color: chip.text,
          padding: 2,
          lineHeight: 1.05,
          overflow: 'hidden',
          boxShadow: isMatch
    ? '0 0 0 1px #000, 0 0 0 5px #ec4899, 0 0 16px rgba(236,72,153,0.7), 0 4px 12px rgba(0,0,0,0.4)'
    : undefined,
          touchAction: 'none',
        }}
      >
        <span
          className="font-mono font-bold"
          style={{
            // A single-line reg (≤7 chars on desktop) must never wrap — a
            // 7-char plate is shrunk a touch so it stays on one line in the
            // 56px cell instead of dropping the last letter to row 2.
            fontSize: isLongReg ? 9 : reg.length >= 7 ? 9 : 10,
            letterSpacing: isLongReg ? '0.1px' : reg.length >= 7 ? '0px' : '0.2px',
            wordBreak: 'break-all',
            whiteSpace: isLongReg ? 'normal' : 'nowrap',
            display: 'block',
          }}
        >
          {line1}
        </span>
        {isLongReg && (
          <span
            className="font-mono font-bold"
            style={{
              fontSize: 9,
              letterSpacing: '0.1px',
              wordBreak: 'break-all',
              display: 'block',
            }}
          >
            {line2}
          </span>
        )}
        {/* ✨ Floating arrow indicator — only shown for search matches */}
        {isMatch && (
          <span
            className="ylv-search-arrow"
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -22,
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: 18,
              lineHeight: 1,
              color: '#ec4899',
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
              pointerEvents: 'none',
              userSelect: 'none',
              fontWeight: 900,
            }}
          >
            ▼
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      className="absolute inset-1 rounded flex items-start p-1 select-none"
      style={{ background: '#cfd6d2' }}
    >
      <span
        className="text-[10px] font-bold leading-none"
        style={{ color: BRAND.darkest, letterSpacing: '0.3px' }}
      >
        {space.label}
      </span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// ✨ Phase 4: MERGED SPACE TILE — multi-cell parking space (read-only)
// ════════════════════════════════════════════════════════════════════════
// Mirrors SpaceTile's behaviour but rendered absolute over the grid, so it
// can span multiple cells. Supports:
//   • Click empty → opens park modal (via onClick)
//   • Click occupied → opens vehicle detail (via onClick)
//   • Pointer-down on occupied → starts pointer-event drag (mobile + mouse)
//   • HTML5 dragOver/drop → accepts vehicle drops from the unparked bar
//   • Search highlight (yellow ring) when its vehicle matches the search
//   • Live drop highlight (green/red ring) while a vehicle is being dragged
// 
// We don't trigger pan / cell-click / cell-drag-over events on the cells
// underneath — the tile sits on top with full pointer events and owns
// everything that happens in its footprint area.

interface MergedSpaceTileProps {
  space: ParkingSpace
  vehicle: CheckedInVehicle | null | undefined
  isMatch: boolean
  draggingVehicleId: string | null
  onClick: () => void
  onParkedPointerDown: (e: React.PointerEvent, vehicleId: string) => void
  onDropVehicle: (vehicleId: string, space: ParkingSpace) => void
}

function MergedSpaceTile({
  space,
  vehicle,
  isMatch,
  draggingVehicleId,
  onClick,
  onParkedPointerDown,
  onDropVehicle,
}: MergedSpaceTileProps) {
  const { w, h } = getSpaceFootprint(space)
  const left = ROW_HEAD_W + (space.col - 1) * CELL_PX
  const top = COL_HEAD_H + (space.row - 1) * CELL_PX
  const width = w * CELL_PX
  const height = h * CELL_PX

  // Local highlight while a vehicle is being dragged over this tile
  const [dropHighlight, setDropHighlight] = useState<'target' | 'invalid' | null>(null)

  const onDragOver = (e: React.DragEvent) => {
    if (!draggingVehicleId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const occupiedByOther = !!vehicle && vehicle.id !== draggingVehicleId
    setDropHighlight(occupiedByOther ? 'invalid' : 'target')
  }
  const onDragLeave = () => {
    setDropHighlight(null)
  }
  const onDrop = (e: React.DragEvent) => {
    setDropHighlight(null)
    const vid = e.dataTransfer.getData('text/yardao-vehicle-id')
    if (!vid) return
    e.preventDefault()
    onDropVehicle(vid, space)
  }

  // Compose the box-shadow: drop ring takes priority over search-match ring
  // Compose the box-shadow: drop ring takes priority over search-match ring
  const ringShadow =
    dropHighlight === 'target'
      ? `inset 0 0 0 3px ${BRAND.accent}, 0 4px 12px rgba(2,89,64,0.15)`
      : dropHighlight === 'invalid'
      ? `inset 0 0 0 3px ${BRAND.error}`
      : isMatch
      ? '0 0 0 1px #000, 0 0 0 5px #ec4899, 0 0 16px rgba(236,72,153,0.7), 0 4px 12px rgba(0,0,0,0.4)'
      : '0 1px 2px rgba(0,0,0,0.04)'

  // ── Occupied: show vehicle chip ────────────────────────────────────────
  if (vehicle) {
    const chip = getVehicleChipColor(vehicle)
    const reg = (vehicle.registration || '—').trim()
    // Larger surface = simpler reg layout. Shrink the font if the reg is
    // very long (more than ~8 chars).
    const regFontSize = reg.length > 8 ? 11 : 14
    const title = `${space.label} · ${reg} (${vehicle.make || ''} ${vehicle.model || ''})${vehicle.contract ? ' · ' + vehicle.contract : ''} — ${w}×${h} merged`

    return (
      <div
        onPointerDown={(e) => onParkedPointerDown(e, vehicle.id)}
        onClick={onClick}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`absolute rounded flex flex-col items-center justify-center select-none text-center cursor-grab active:cursor-grabbing touch-none ${isMatch ? 'ylv-search-match' : ''}`}
        style={{
          left: left + 4,
          top: top + 4,
          width: width - 8,
          height: height - 8,
          background: chip.background,
          color: chip.text,
          padding: 4,
          overflow: 'hidden',
          boxShadow: ringShadow,
          touchAction: 'none',
          zIndex: 2,
        }}
        title={title}
      >
        <span
          className="font-mono font-bold"
          style={{
            fontSize: regFontSize,
            letterSpacing: '0.4px',
            wordBreak: 'break-all',
            display: 'block',
            lineHeight: 1.1,
          }}
        >
          {reg}
        </span>
        <span
          style={{
            fontSize: 9,
            opacity: 0.85,
            marginTop: 3,
            letterSpacing: '0.3px',
            fontWeight: 600,
          }}
        >
          {space.label} · {w}×{h}
        </span>
        {/* ✨ Floating arrow indicator — only shown for search matches */}
        {isMatch && (
          <span
            className="ylv-search-arrow"
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -22,
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: 18,
              lineHeight: 1,
              color: '#ec4899',
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
              pointerEvents: 'none',
              userSelect: 'none',
              fontWeight: 900,
            }}
          >
            ▼
          </span>
        )}
      </div>
    )
  }

  // ── Empty merged space ─────────────────────────────────────────────────
  return (
    <div
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="absolute rounded flex items-start p-1.5 select-none"
      style={{
        left: left + 4,
        top: top + 4,
        width: width - 8,
        height: height - 8,
        background: '#cfd6d2',
        cursor: 'pointer',
        boxShadow: ringShadow,
        zIndex: 2,
        overflow: 'hidden',
      }}
      title={`${space.label} · Free — click to park a vehicle (${w}×${h} merged space)`}
    >
      <span
        className="text-[10px] font-bold leading-tight"
        style={{ color: BRAND.darkest, letterSpacing: '0.3px' }}
      >
        {space.label}
        <span
          style={{
            display: 'block',
            fontSize: 9,
            fontWeight: 600,
            opacity: 0.55,
            marginTop: 2,
            letterSpacing: '0.5px',
          }}
        >
          {w}×{h} merged
        </span>
      </span>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// BLOCK TILE
// ────────────────────────────────────────────────────────────────────────
function BlockTile({ block }: { block: BuildingBlock }) {
  const left = ROW_HEAD_W + (block.col - 1) * CELL_PX
  const top = COL_HEAD_H + (block.row - 1) * CELL_PX
  const width = block.w * CELL_PX
  const height = block.h * CELL_PX
  const isLight = LIGHT_BLOCK_COLORS.has(block.color)
  const isGradient = block.color.startsWith('linear-gradient')

  let radius = '4px'
  if (block.shape === 'rounded') radius = '14px'
  if (block.shape === 'capsule') radius = '999px'

  return (
    <div
      className="absolute grid place-items-center text-center font-bold pointer-events-none select-none"
      style={{
        left: left + 3,
        top: top + 3,
        width: width - 6,
        height: height - 6,
        ...(isGradient ? { background: block.color } : { backgroundColor: block.color }),
        color: isLight ? BRAND.darkest : BRAND.white,
        fontSize: 11,
        letterSpacing: '0.5px',
        padding: 6,
        borderRadius: radius,
        boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
        zIndex: 3,
        lineHeight: 1.2,
        overflow: 'hidden',
      }}
    >
      {block.label}
    </div>
  )
}

// ── Drop overlay (per cell, scoped CSS) ──────────────────────────────────
function DropOverlay() {
  return (
    <>
      <span className="ylv-drop-overlay" aria-hidden="true" />
      <style jsx>{`
        .ylv-drop-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.08s;
        }
        :global(td[data-drop="target"]) .ylv-drop-overlay {
          opacity: 1;
          background: ${BRAND_ALPHA.accentSoft};
          box-shadow: inset 0 0 0 2px ${BRAND.accent};
        }
        :global(td[data-drop="invalid"]) .ylv-drop-overlay {
          opacity: 1;
          background: ${BRAND_ALPHA.errorSoft};
          box-shadow: inset 0 0 0 2px ${BRAND.error};
        }
      `}</style>
    </>
  )
}

// ── Search match pulse animation (global keyframes) ──────────────────
  // Magenta + black double-ring + bobbing arrow for "impossible to miss"
  // search results. Pulses every 1.4s so motion catches the eye even at
  // low zoom levels with hundreds of vehicles on screen.
  function SearchMatchStyles() {
    return (
      <style jsx global>{`
        @keyframes ylvSearchPulse {
          0%, 100% {
            box-shadow:
              0 0 0 1px #000,
              0 0 0 5px #ec4899,
              0 0 16px rgba(236,72,153,0.7),
              0 4px 12px rgba(0,0,0,0.4);
          }
          50% {
            box-shadow:
              0 0 0 1px #000,
              0 0 0 7px #ec4899,
              0 0 24px rgba(236,72,153,1),
              0 4px 16px rgba(0,0,0,0.5);
          }
        }
        @keyframes ylvSearchArrowBob {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50%      { transform: translateX(-50%) translateY(-4px); }
        }
        .ylv-search-match {
          animation: ylvSearchPulse 1.4s ease-in-out infinite;
          z-index: 10 !important;
        }
        .ylv-search-arrow {
          animation: ylvSearchArrowBob 1.4s ease-in-out infinite;
        }
      `}</style>
    )
  }