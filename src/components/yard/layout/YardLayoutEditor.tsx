// src/components/yard/layout/YardLayoutEditor.tsx
// Desktop yard layout editor — locked-by-default with a toggle to edit.
//
// VIEWPORT (Figma-style):
//   • Cells are always 56×56px — they NEVER shrink. The grid grows freely.
//   • Right-click + drag pans the canvas around (like Figma).
//   • Ctrl + scroll wheel zooms in/out, anchored on the cursor (10% – 200%).
//   • Toolbar shows zoom %, +/− buttons, and a "Fit to screen" reset.
//   • Native scrollbars work too (mouse wheel scrolls vertically, shift+wheel
//     scrolls horizontally) — keeps things familiar for non-power-users.
//
// EDITING:
//   • Click empty cells to add parking spaces.
//   • Drag-select a rectangle on empty cells to create a MERGED space  ✨ Phase 4
//     (one space spanning multiple cells — for trailers, transporters, etc.)
//   • Drag spaces to reorganise (snap to cells, auto-labels follow coord).
//   • Add multi-cell building blocks via modal, drag to reposition.
//   • Save the whole layout to Firestore in a single doc.
//
// Mobile users see the read-only viewer (YardLayoutMobileViewer.tsx).

'use client'

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useYardLayout } from '@/hooks/useYardLayout'
import {
  ParkingSpace,
  BuildingBlock,
  BlockShape,
  SelectedItemKind,
  YARD_LAYOUT_LIMITS,
} from '@/types/yardLayout'
import {
  colLetter,
  coordKey,
  getSpaceAt,
  isCellCoveredByBlock,
  calculateBounds,
  newId,
  findSpaceById,
  findBlockById,
  countSpaces,
  moveSpace as moveSpaceUtil,
  // ✨ Phase 4: merged-space helpers
  mergedSpaceLabel,
  canCreateMergedSpace,
  getSpaceFootprint,
  isMergedSpace,
} from '@/lib/utils/yardLayoutUtils'
import { BRAND, BRAND_ALPHA, BLOCK_COLORS, LIGHT_BLOCK_COLORS } from '@/constants/brand'
import { logger } from '@/lib/logger'
import {
  Lock,
  Unlock,
  Plus,
  Trash2,
  Save,
  X,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react'

interface YardLayoutEditorProps {
  branchId: string
  branchName?: string
  onClose?: () => void
}

// ─── Visual grid sizing constants ─────────────────────────────────────────
const CELL_PX = 56          // size of one grid cell in pixels (at 100% zoom)
const ROW_HEAD_W = 40       // width of the row-number column
const COL_HEAD_H = 36       // height of the column-letter row
const ZOOM_MIN = 0.25
const ZOOM_MAX = 2.0
const ZOOM_STEP = 0.1

// ─── Toast (lightweight inline) ───────────────────────────────────────────
interface ToastState { msg: string; key: number }

export function YardLayoutEditor({
  branchId,
  branchName,
  onClose,
}: YardLayoutEditorProps) {
  const { layout, loading, error, saveLayout } = useYardLayout(branchId)

  // Local working copy (so unsaved changes don't hit Firestore)
  const [spaces, setSpaces] = useState<Record<string, ParkingSpace>>({})
  const [blocks, setBlocks] = useState<BuildingBlock[]>([])
  const [unlocked, setUnlocked] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedKind, setSelectedKind] = useState<SelectedItemKind>(null)
  const [showBlockModal, setShowBlockModal] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Viewport zoom (1.0 = 100%)
  const [zoom, setZoom] = useState(1)

  // ── Sync local state when layout loads from Firestore ──────────────────
  useEffect(() => {
    if (layout) {
      setSpaces(layout.spaces || {})
      setBlocks(layout.blocks || [])
      setDirty(false)
    } else if (!loading) {
      // No layout exists yet — start blank
      setSpaces({})
      setBlocks([])
      setDirty(false)
    }
  }, [layout, loading])

  // ── Visible grid bounds (auto-grow) ────────────────────────────────────
  const bounds = useMemo(
    () => calculateBounds(spaces, blocks, unlocked),
    [spaces, blocks, unlocked],
  )

  // ── Toast helper ────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setToast({ msg, key: Date.now() })
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(t)
  }, [toast])

  // ── Selection helpers ──────────────────────────────────────────────────
  const selectSpace = (id: string) => {
    setSelectedId(id)
    setSelectedKind('space')
  }
  const selectBlock = (id: string) => {
    setSelectedId(id)
    setSelectedKind('block')
  }
  const clearSelection = () => {
    setSelectedId(null)
    setSelectedKind(null)
  }

  // ── Add parking space at coordinate ────────────────────────────────────
  const addSpaceAt = useCallback((col: number, row: number) => {
    if (countSpaces(spaces) >= YARD_LAYOUT_LIMITS.MAX_SPACES) {
      showToast(`Maximum ${YARD_LAYOUT_LIMITS.MAX_SPACES} spaces reached`)
      return
    }
    if (isCellCoveredByBlock(blocks, col, row)) {
      showToast('Cell is under a building')
      return
    }
    const key = coordKey(col, row)
    if (spaces[key]) return // already taken

    const sp: ParkingSpace = {
      id: newId('sp'),
      col,
      row,
      label: key,
      labelIsAuto: true,
    }
    setSpaces({ ...spaces, [key]: sp })
    selectSpace(sp.id)
    setDirty(true)
  }, [spaces, blocks, showToast])

  // ── ✨ Phase 4: Add merged parking space spanning multiple cells ───────
  // Triggered by drag-select on empty cells in the canvas. Validates the
  // footprint via canCreateMergedSpace and creates a single ParkingSpace
  // with w/h fields populated.
  const addMergedSpaceAt = useCallback((col: number, row: number, w: number, h: number) => {
    if (countSpaces(spaces) >= YARD_LAYOUT_LIMITS.MAX_SPACES) {
      showToast(`Maximum ${YARD_LAYOUT_LIMITS.MAX_SPACES} spaces reached`)
      return
    }
    const check = canCreateMergedSpace(spaces, blocks, col, row, w, h)
    if (!check.ok) {
      showToast(check.reason || 'Cannot create merged space here')
      return
    }
    const key = coordKey(col, row)
    const label = mergedSpaceLabel(col, row, w, h)
    const sp: ParkingSpace = {
      id: newId('sp'),
      col,
      row,
      label,
      labelIsAuto: true,
      w,
      h,
    }
    setSpaces({ ...spaces, [key]: sp })
    selectSpace(sp.id)
    setDirty(true)
    showToast(`Merged space ${label} added (${w}×${h} cells)`)
  }, [spaces, blocks, showToast])

  // ── Move parking space (after drag) ────────────────────────────────────
  const moveSpaceTo = useCallback((spaceId: string, newCol: number, newRow: number) => {
    const result = moveSpaceUtil(spaces, blocks, spaceId, newCol, newRow)
    if (!result.success) {
      if (result.reason) showToast(result.reason)
      return
    }
    setSpaces(result.spaces)
    setDirty(true)

    const found = findSpaceById(result.spaces, spaceId)
    if (found) {
      const note = found.space.labelIsAuto
        ? `Moved to ${found.coord}`
        : `Moved to ${found.coord} (label: ${found.space.label})`
      showToast(note)
    }
  }, [spaces, blocks, showToast])

  // ── Move building block ────────────────────────────────────────────────
  const moveBlockTo = useCallback((blockId: string, newCol: number, newRow: number) => {
    setBlocks(prev =>
      prev.map(b =>
        b.id === blockId
          ? { ...b, col: Math.max(1, newCol), row: Math.max(1, newRow) }
          : b,
      ),
    )
    setDirty(true)
  }, [])

  // ── Update space (from props panel) ────────────────────────────────────
  const updateSpace = useCallback((spaceId: string, patch: Partial<ParkingSpace>) => {
    const found = findSpaceById(spaces, spaceId)
    if (!found) return
    const next = { ...spaces }
    next[found.coord] = { ...found.space, ...patch }
    setSpaces(next)
    setDirty(true)
  }, [spaces])

  // ── Update block (from props panel) ────────────────────────────────────
  const updateBlock = useCallback((blockId: string, patch: Partial<BuildingBlock>) => {
    setBlocks(prev => prev.map(b => (b.id === blockId ? { ...b, ...patch } : b)))
    setDirty(true)
  }, [])

  // ── Delete selected ────────────────────────────────────────────────────
  const deleteSelected = useCallback(() => {
    if (!selectedId) return

    if (selectedKind === 'block') {
      const block = findBlockById(blocks, selectedId)
      setBlocks(prev => prev.filter(b => b.id !== selectedId))
      clearSelection()
      setDirty(true)
      showToast(`Building "${block?.label || 'unnamed'}" deleted`)
      return
    }

    if (selectedKind === 'space') {
      const found = findSpaceById(spaces, selectedId)
      if (!found) return
      const next = { ...spaces }
      delete next[found.coord]
      setSpaces(next)
      clearSelection()
      setDirty(true)
      showToast('Space deleted')
    }
  }, [selectedId, selectedKind, spaces, blocks, showToast])

  // ── ✨ Phase 4: Split a merged space back into individual 1×1 spaces ───
  // Each cell in the footprint becomes its own space with a fresh id and
  // an auto label. Any vehicle previously parked on the merged space will
  // have an orphaned parkingSpaceId — vehicleParkingService's self-healing
  // logic clears it on next access, so the slot becomes free naturally.
  const splitMergedSpace = useCallback((spaceId: string) => {
    const found = findSpaceById(spaces, spaceId)
    if (!found) return
    const { space, coord } = found
    const w = space.w ?? 1
    const h = space.h ?? 1
    if (w === 1 && h === 1) return // not merged — nothing to do

    // Capacity check — splitting a 2×4 into eight 1×1s adds 7 to the count
    const newSpacesCount = w * h
    const after = countSpaces(spaces) - 1 + newSpacesCount
    if (after > YARD_LAYOUT_LIMITS.MAX_SPACES) {
      showToast(`Splitting would exceed the ${YARD_LAYOUT_LIMITS.MAX_SPACES} space limit`)
      return
    }

    const next = { ...spaces }
    delete next[coord]

    for (let dc = 0; dc < w; dc++) {
      for (let dr = 0; dr < h; dr++) {
        const c = space.col + dc
        const r = space.row + dr
        const cellKey = coordKey(c, r)
        next[cellKey] = {
          id: newId('sp'),
          col: c,
          row: r,
          label: cellKey,
          labelIsAuto: true,
        }
      }
    }

    setSpaces(next)
    clearSelection()
    setDirty(true)
    showToast(`Split into ${newSpacesCount} individual spaces`)
  }, [spaces, showToast])

  // ── Add building block ─────────────────────────────────────────────────
  const addBlock = useCallback((data: Omit<BuildingBlock, 'id' | 'col' | 'row'>) => {
    const block: BuildingBlock = {
      id: newId('b'),
      col: 1,
      row: 1,
      ...data,
    }
    setBlocks([...blocks, block])
    selectBlock(block.id)
    setShowBlockModal(false)
    setDirty(true)
    showToast('Building added — drag to position')
  }, [blocks, showToast])

  // ── Save to Firestore ──────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await saveLayout({ spaces, blocks })
      setDirty(false)
      showToast('Layout saved')
      logger.log(`✅ Yard layout saved for ${branchId}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      showToast(msg)
      logger.error('❌ Save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [spaces, blocks, saveLayout, branchId, showToast])

  // ── Toggle lock ────────────────────────────────────────────────────────
  const toggleLock = () => {
    if (unlocked && dirty) {
      const ok = window.confirm('You have unsaved changes. Lock anyway and discard?')
      if (!ok) return
      setSpaces(layout?.spaces || {})
      setBlocks(layout?.blocks || [])
      setDirty(false)
    }
    setUnlocked(v => !v)
    clearSelection()
    showToast(!unlocked ? '🔓 Edit mode' : '🔒 Locked')
  }

  // ── Keyboard shortcut: Delete ──────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (!unlocked || !selectedId) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelected()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [unlocked, selectedId, deleteSelected])

  // ── Loading / error ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 h-full" style={{ background: BRAND.bg }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-3" style={{ borderColor: BRAND.dark }} />
          <p className="text-sm" style={{ color: BRAND.mid }}>Loading yard layout…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 h-full" style={{ background: BRAND.bg }}>
        <div className="rounded-lg border p-4" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
          <p className="text-sm font-semibold text-red-800">Failed to load yard layout</p>
          <p className="text-xs text-red-600 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  // ── Stats for header ───────────────────────────────────────────────────
  const totalSpaces = countSpaces(spaces)
  const blockCount = blocks.length

  // ────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full" style={{ background: BRAND.bg }}>
      {/* HEADER */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0"
        style={{ background: BRAND.darkest, borderColor: BRAND.dark }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-white">
            Yard Layout
            {branchName && (
              <span className="font-normal ml-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                / {branchName}
              </span>
            )}
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}>
            Spaces: <b style={{ color: BRAND.accent }}>{totalSpaces}</b>
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}>
            Buildings: <b style={{ color: BRAND.accent }}>{blockCount}</b>
          </span>
          {dirty && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: BRAND_ALPHA.accentDim, color: BRAND.accent }}>
              ● Unsaved changes
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleLock}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              background: unlocked ? BRAND_ALPHA.accentDim : 'rgba(255,255,255,0.08)',
              color: unlocked ? BRAND.accent : 'rgba(255,255,255,0.85)',
            }}
          >
            {unlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {unlocked ? 'Edit Mode' : 'Locked'}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-white hover:bg-white/10"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* TOOLBAR (only when unlocked) */}
      {unlocked && (
        <div
          className="flex items-center gap-2 px-4 py-2 border-b flex-wrap flex-shrink-0"
          style={{ background: BRAND.white, borderColor: BRAND.border }}
        >
          <button
            onClick={() => setShowBlockModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white"
            style={{ background: BRAND.dark }}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Building
          </button>

          {/* ✨ Phase 4: hint now mentions drag-select for merged spaces */}
          <span className="text-xs ml-2" style={{ color: BRAND.mid }}>
            📍 Click empty cell · drag-select to create a merged space (trailers etc.)
          </span>

          <span className="w-px h-5 mx-2" style={{ background: BRAND.border }} />

          <button
            onClick={deleteSelected}
            disabled={!selectedId}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border disabled:opacity-40"
            style={{
              background: BRAND.white,
              borderColor: '#fecaca',
              color: '#b91c1c',
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>

          <span className="w-px h-5 mx-2" style={{ background: BRAND.border }} />

          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-50"
            style={{
              background: BRAND.accent,
              color: BRAND.darkest,
            }}
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save Layout'}
          </button>

          <span className="ml-auto text-[11px] hidden md:inline" style={{ color: BRAND.mid }}>
            <kbd className="px-1 py-0.5 rounded text-[10px] mr-1" style={{ background: BRAND.bg, border: `1px solid ${BRAND.border}` }}>Right-click</kbd>
            drag to pan •
            <kbd className="px-1 py-0.5 rounded text-[10px] mx-1" style={{ background: BRAND.bg, border: `1px solid ${BRAND.border}` }}>Ctrl</kbd>
            +
            <kbd className="px-1 py-0.5 rounded text-[10px] mx-1" style={{ background: BRAND.bg, border: `1px solid ${BRAND.border}` }}>Scroll</kbd>
            to zoom
          </span>
        </div>
      )}

      {/* MAIN: canvas + properties panel */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <YardCanvas
          spaces={spaces}
          blocks={blocks}
          bounds={bounds}
          unlocked={unlocked}
          selectedId={selectedId}
          zoom={zoom}
          setZoom={setZoom}
          onAddSpace={addSpaceAt}
           onAddMergedSpace={addMergedSpaceAt}
          onSelectSpace={selectSpace}
          onSelectBlock={selectBlock}
          onMoveSpace={moveSpaceTo}
          onMoveBlock={moveBlockTo}
          onClearSelection={clearSelection}
        />

        {unlocked && selectedId && (
          <PropertiesPanel
            spaces={spaces}
            blocks={blocks}
            selectedId={selectedId}
            selectedKind={selectedKind}
            onUpdateSpace={updateSpace}
            onUpdateBlock={updateBlock}
            onSplitSpace={splitMergedSpace}
            onClose={clearSelection}
          />
        )}
      </div>

      {/* ADD BUILDING MODAL */}
      {showBlockModal && (
        <AddBuildingModal
          onCreate={addBlock}
          onClose={() => setShowBlockModal(false)}
        />
      )}

      {/* TOAST */}
      {toast && (
        <div
          key={toast.key}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-md text-sm font-medium text-white shadow-lg z-50 flex items-center gap-2"
          style={{ background: BRAND.darkest }}
        >
          <span
            className="w-4 h-4 rounded-full grid place-items-center text-xs font-bold"
            style={{ background: BRAND.accent, color: BRAND.darkest }}
          >
            ✓
          </span>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// CANVAS — viewport with pan + zoom + the grid
// ════════════════════════════════════════════════════════════════════════

interface YardCanvasProps {
  spaces: Record<string, ParkingSpace>
  blocks: BuildingBlock[]
  bounds: { cols: number; rows: number }
  unlocked: boolean
  selectedId: string | null
  zoom: number
  setZoom: (z: number | ((prev: number) => number)) => void
  onAddSpace: (col: number, row: number) => void
  onAddMergedSpace: (col: number, row: number, w: number, h: number) => void  // ✨ Phase 4
  onSelectSpace: (id: string) => void
  onSelectBlock: (id: string) => void
  onMoveSpace: (id: string, col: number, row: number) => void
  onMoveBlock: (id: string, col: number, row: number) => void
  onClearSelection: () => void
}

// ✨ Phase 4: state shape for the drag-select rectangle
interface DragSelectState {
  startCol: number
  startRow: number
  endCol: number
  endRow: number
  valid: boolean
}

function YardCanvas({
  spaces,
  blocks,
  bounds,
  unlocked,
  selectedId,
  zoom,
  setZoom,
  onAddSpace,
  onAddMergedSpace, // ✨ Phase 4
  onSelectSpace,
  onSelectBlock,
  onMoveSpace,
  onMoveBlock,
  onClearSelection,
}: YardCanvasProps) {
  // ── Viewport refs ──────────────────────────────────────────────────────
  // The "viewport" is the scrolling outer container.
  // The "stage" inside it holds the grid at its real (un-zoomed) pixel size.
  // We zoom by setting CSS transform on the stage.
  const viewportRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  // ── Pan state (right-click + drag) ─────────────────────────────────────
  const [isPanning, setIsPanning] = useState(false)
  const panStateRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null)

  // ✨ Phase 4: drag-select rectangle state (null when no drag in progress)
  const [dragSelect, setDragSelect] = useState<DragSelectState | null>(null)

  // Suppress browser context menu while we're using right-click for pan
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
  }

  // ── Cell helpers ───────────────────────────────────────────────────────
  // Real (un-zoomed) pixel size of the stage
  const stagePixelWidth = ROW_HEAD_W + bounds.cols * CELL_PX
  const stagePixelHeight = COL_HEAD_H + bounds.rows * CELL_PX

  // Convert a screen X/Y into a (col, row) grid coordinate.
  // Accounts for zoom and viewport scroll position.
  const screenToCell = useCallback((clientX: number, clientY: number): { col: number; row: number } | null => {
    if (!frameRef.current) return null
    const rect = frameRef.current.getBoundingClientRect()
    // Local coordinates within the visually-rendered (zoomed) frame
    const xZoomed = clientX - rect.left
    const yZoomed = clientY - rect.top
    // Convert back to un-zoomed coordinates
    const x = xZoomed / zoom
    const y = yZoomed / zoom
    // Subtract the row/col headers
    const cellX = x - ROW_HEAD_W
    const cellY = y - COL_HEAD_H
    if (cellX < 0 || cellY < 0) return null
    const col = Math.floor(cellX / CELL_PX) + 1
    const row = Math.floor(cellY / CELL_PX) + 1
    if (col < 1 || row < 1 || col > bounds.cols || row > bounds.rows) return null
    return { col, row }
  }, [zoom, bounds.cols, bounds.rows])

  // ── Cell click → add space (edit mode only) ────────────────────────────
  // ✨ Phase 4: kept for reference but no longer wired to <td> onClick.
  // Cells now use onPointerDown → startCellDragSelect, which handles both
  // single-cell clicks (1×1 add) and rectangle drags (merged-space add).
  const onCellClick = (col: number, row: number) => {
    if (!unlocked) return
    onAddSpace(col, row)
  }

  // ── Right-click + drag = pan (Figma-style) ─────────────────────────────
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return

    const onMouseDown = (e: MouseEvent) => {
      // Right mouse button = pan; ignore left/middle
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
      const dx = e.clientX - state.startX
      const dy = e.clientY - state.startY
      vp.scrollLeft = state.scrollLeft - dx
      vp.scrollTop = state.scrollTop - dy
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

  // ── Ctrl + scroll = zoom (anchored on cursor) ──────────────────────────
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return  // let normal scroll happen
      e.preventDefault()

      // Cursor position relative to the viewport's content
      const rect = vp.getBoundingClientRect()
      const cursorX = e.clientX - rect.left + vp.scrollLeft
      const cursorY = e.clientY - rect.top + vp.scrollTop

      // What the cursor was pointing at, in un-zoomed coords
      const beforeX = cursorX / zoom
      const beforeY = cursorY / zoom

      // Apply zoom delta (proportional, smoother than constant step)
      const delta = -e.deltaY * 0.001
      const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * (1 + delta)))

      if (nextZoom === zoom) return

      // After zooming, what would the cursor's stage position be?
      const afterX = beforeX * nextZoom
      const afterY = beforeY * nextZoom

      // Adjust scroll so the same un-zoomed point stays under the cursor
      const newScrollLeft = afterX - (e.clientX - rect.left)
      const newScrollTop = afterY - (e.clientY - rect.top)

      setZoom(nextZoom)
      // Defer the scroll to next frame so layout has updated
      requestAnimationFrame(() => {
        if (!vp) return
        vp.scrollLeft = newScrollLeft
        vp.scrollTop = newScrollTop
      })
    }

    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
  }, [zoom, setZoom])

  // ── Zoom controls (toolbar buttons) ────────────────────────────────────
  const zoomIn = () => setZoom(z => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))
  const zoomOut = () => setZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))
  const zoomReset = () => {
    setZoom(1)
    if (viewportRef.current) {
      viewportRef.current.scrollLeft = 0
      viewportRef.current.scrollTop = 0
    }
  }

  // ── Drop-target highlight management (refs into the stage) ─────────────
  // We avoid global CSS — directly mutate the cell's data-state attribute
  // and read it via inline styles below.
  const setDropState = (col: number, row: number, state: 'target' | 'invalid' | null) => {
    const cell = frameRef.current?.querySelector(`[data-col="${col}"][data-row="${row}"]`) as HTMLElement | null
    if (!cell) return
    if (state === null) {
      cell.removeAttribute('data-drop')
    } else {
      cell.setAttribute('data-drop', state)
    }
  }
  const clearAllDropStates = () => {
    frameRef.current?.querySelectorAll('[data-drop]').forEach(el => el.removeAttribute('data-drop'))
  }

  // ── Space drag (snap to cells) ─────────────────────────────────────────
  // ✨ Phase 4: now handles merged-space drags. The cursor offset within
  // the footprint is preserved (Figma-style) and ALL cells in the new
  // footprint get drop-state highlighted, not just the anchor.
  const startSpaceDrag = (
    e: React.PointerEvent,
    space: ParkingSpace,
  ) => {
    // Only handle left-click drags
    if (e.button !== 0) return
    if (!unlocked) {
      onSelectSpace(space.id)
      return
    }
    e.stopPropagation()
    onSelectSpace(space.id)

    const origCol = space.col
    const origRow = space.row
    const w = space.w ?? 1                              // ✨ Phase 4
    const h = space.h ?? 1                              // ✨ Phase 4

    // ✨ Phase 4: the cursor might be on any cell within the footprint,
    // not just the anchor. Capture the offset so the footprint follows
    // the cursor without "jumping" to anchor-on-cursor.
    const startCell = screenToCell(e.clientX, e.clientY)
    const offsetCol = startCell ? startCell.col - origCol : 0
    const offsetRow = startCell ? startCell.row - origRow : 0

    let lastAnchor: { col: number; row: number } | null = null  // ✨ Phase 4

    // Helper: highlight every cell in a footprint at the given anchor
    const setFootprintDrop = (anchorCol: number, anchorRow: number, state: 'target' | 'invalid' | null) => {
      for (let dc = 0; dc < w; dc++) {
        for (let dr = 0; dr < h; dr++) {
          setDropState(anchorCol + dc, anchorRow + dr, state)
        }
      }
    }

    const onMove = (ev: PointerEvent) => {
      const target = screenToCell(ev.clientX, ev.clientY)
      // Translate cursor cell back to anchor (cursor minus offset)
      const newAnchor = target
        ? { col: target.col - offsetCol, row: target.row - offsetRow }
        : null

      // Clear the previous footprint highlight if it changed
      if (
        lastAnchor &&
        (!newAnchor || newAnchor.col !== lastAnchor.col || newAnchor.row !== lastAnchor.row)
      ) {
        setFootprintDrop(lastAnchor.col, lastAnchor.row, null)
      }
      if (!newAnchor) {
        lastAnchor = null
        return
      }
      // No-op if the anchor hasn't actually moved
      if (newAnchor.col === origCol && newAnchor.row === origRow) {
        lastAnchor = newAnchor
        return
      }

      // ✨ Phase 4: validate every cell in the proposed new footprint.
      // Cells belonging to the moving space itself are allowed (so a 1-cell
      // shuffle of a merged space doesn't reject itself).
      let invalid = false
      for (let dc = 0; dc < w; dc++) {
        for (let dr = 0; dr < h; dr++) {
          const c = newAnchor.col + dc
          const r = newAnchor.row + dr
          if (c < 1 || r < 1 || c > bounds.cols || r > bounds.rows) {
            invalid = true
            break
          }
          const occupant = getSpaceAt({ spaces }, c, r)
          if (occupant && occupant.id !== space.id) { invalid = true; break }
          if (isCellCoveredByBlock(blocks, c, r)) { invalid = true; break }
        }
        if (invalid) break
      }

      setFootprintDrop(newAnchor.col, newAnchor.row, invalid ? 'invalid' : 'target')
      lastAnchor = newAnchor
    }

    const onUp = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      clearAllDropStates()

      const target = screenToCell(ev.clientX, ev.clientY)
      if (!target) return
      const newAnchor = { col: target.col - offsetCol, row: target.row - offsetRow }
      if (newAnchor.col === origCol && newAnchor.row === origRow) return
      onMoveSpace(space.id, newAnchor.col, newAnchor.row)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  // ── Block drag ─────────────────────────────────────────────────────────
  const startBlockDrag = (e: React.PointerEvent, block: BuildingBlock) => {
    if (e.button !== 0) return
    if (!unlocked) {
      onSelectBlock(block.id)
      return
    }
    e.stopPropagation()
    onSelectBlock(block.id)

    const startX = e.clientX
    const startY = e.clientY
    const origCol = block.col
    const origRow = block.row

    const onMove = (ev: PointerEvent) => {
      // Pixel delta divided by the (zoomed) cell size = cell delta.
      // We use the un-zoomed CELL_PX, multiplied by zoom to get rendered size.
      const dCol = Math.round((ev.clientX - startX) / (CELL_PX * zoom))
      const dRow = Math.round((ev.clientY - startY) / (CELL_PX * zoom))
      onMoveBlock(block.id, origCol + dCol, origRow + dRow)
    }
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  // ── ✨ Phase 4: Drag-select on empty cells ─────────────────────────────
  // Pointer-down on an empty cell starts a select. As the user drags, we
  // track the rectangle from start to current cell. On release:
  //   • No movement (start === end)        → add a 1×1 space
  //   • Different cells (rectangle drawn)  → add a merged space
  // The rectangle is validated live via canCreateMergedSpace so the
  // preview turns red if the user is over an invalid area.
  const startCellDragSelect = (e: React.PointerEvent, col: number, row: number) => {
    if (!unlocked) return
    if (e.button !== 0) return
    e.stopPropagation()

    setDragSelect({ startCol: col, startRow: row, endCol: col, endRow: row, valid: true })

    const onMove = (ev: PointerEvent) => {
      const target = screenToCell(ev.clientX, ev.clientY)
      if (!target) return

      const anchorCol = Math.min(col, target.col)
      const anchorRow = Math.min(row, target.row)
      const w = Math.abs(target.col - col) + 1
      const h = Math.abs(target.row - row) + 1
      const check = canCreateMergedSpace(spaces, blocks, anchorCol, anchorRow, w, h)

      setDragSelect({
        startCol: col,
        startRow: row,
        endCol: target.col,
        endRow: target.row,
        valid: check.ok,
      })
    }

    const onUp = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)

      const target = screenToCell(ev.clientX, ev.clientY) || { col, row }
      setDragSelect(null)

      if (target.col === col && target.row === row) {
        // No drag — single 1×1 add (existing behaviour)
        onAddSpace(col, row)
      } else {
        // Rectangle drawn — merged space
        const anchorCol = Math.min(col, target.col)
        const anchorRow = Math.min(row, target.row)
        const w = Math.abs(target.col - col) + 1
        const h = Math.abs(target.row - row) + 1
        onAddMergedSpace(anchorCol, anchorRow, w, h)
      }
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Viewport — outer scroll container */}
      <div
        ref={viewportRef}
        onContextMenu={onContextMenu}
        onClick={onClearSelection}
        className="flex-1 overflow-auto relative"
        style={{
          background: BRAND.bg,
          cursor: isPanning ? 'grabbing' : 'default',
          // Show a subtle dot pattern so the viewport looks "alive"
          backgroundImage: `radial-gradient(circle, rgba(1,38,25,0.08) 1px, transparent 1px)`,
          backgroundSize: '14px 14px',
        }}
      >
        {/* Stage — holds the grid at its real pixel size, gets transform-scaled for zoom.
            We add generous extra padding so there's always room to pan up/down/left/right
            even when the grid is smaller than the viewport. */}
        <div
          ref={stageRef}
          style={{
            // Reserve the zoomed grid size + extra room on all sides for free panning
            width: stagePixelWidth * zoom + 800,
            height: stagePixelHeight * zoom + 600,
            padding: 24,
            boxSizing: 'content-box',
          }}
        >
          {/* The actual grid frame — gets visually scaled */}
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
            onClick={(e) => e.stopPropagation()}
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
                        // ✨ Phase 4: only render the in-cell 1×1 SpaceTile
                        // for non-merged spaces. Merged spaces render via
                        // MergedSpaceTile at the canvas level (after table).
                        const showInCellTile = !!sp && !isMergedSpace(sp)
                        return (
                          <td
                            key={col}
                            data-col={col}
                            data-row={row}
                            // ✨ Phase 4: replaced onClick with onPointerDown
                            // so the same gesture handles single-click adds
                            // (1×1) AND drag-select adds (merged).
                            onPointerDown={(e) => !sp && !covered && startCellDragSelect(e, col, row)}
                            style={{
                              width: CELL_PX,
                              height: CELL_PX,
                              padding: 0,
                              background: sp ? BRAND.white : (covered ? 'transparent' : BRAND.bg),
                              borderRight: '1px dashed #e8ece9',
                              borderBottom: '1px dashed #e8ece9',
                              cursor: unlocked && !sp && !covered ? 'pointer' : 'default',
                              pointerEvents: covered ? 'none' : 'auto',
                              position: 'relative',
                            }}
                          >
                            {showInCellTile && sp && (
                              <SpaceTile
                                space={sp}
                                selected={selectedId === sp.id}
                                unlocked={unlocked}
                                onPointerDown={(e) => startSpaceDrag(e, sp)}
                              />
                            )}
                            {/* Drop-target overlay (shown when data-drop attr is set on this td) */}
                            <DropOverlay />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Building blocks — absolute positioned over the grid */}
            {blocks.map(b => (
              <BlockTile
                key={b.id}
                block={b}
                selected={selectedId === b.id}
                unlocked={unlocked}
                onPointerDown={(e) => startBlockDrag(e, b)}
              />
            ))}

            {/* ✨ Phase 4: Merged spaces — rendered absolute, like blocks,
                so they can span multiple cells. 1×1 spaces still render
                inside their cell via SpaceTile above. */}
            {Object.values(spaces)
              .filter(sp => isMergedSpace(sp))
              .map(sp => (
                <MergedSpaceTile
                  key={sp.id}
                  space={sp}
                  selected={selectedId === sp.id}
                  unlocked={unlocked}
                  onPointerDown={(e) => startSpaceDrag(e, sp)}
                />
              ))}

            {/* ✨ Phase 4: live preview of the drag-select rectangle */}
            {dragSelect && (
              <DragSelectPreview
                startCol={dragSelect.startCol}
                startRow={dragSelect.startRow}
                endCol={dragSelect.endCol}
                endRow={dragSelect.endRow}
                valid={dragSelect.valid}
              />
            )}
          </div>
        </div>
      </div>

      {/* Zoom controls — sticky bottom-left corner of the canvas area */}
      <div
        className="flex items-center gap-1 px-2 py-1.5 border-t flex-shrink-0"
        style={{ background: BRAND.white, borderColor: BRAND.border }}
      >
        <button
          onClick={zoomOut}
          disabled={zoom <= ZOOM_MIN}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40"
          title="Zoom out"
          aria-label="Zoom out"
        >
          <ZoomOut className="w-3.5 h-3.5" style={{ color: BRAND.darkest }} />
        </button>
        <button
          onClick={zoomReset}
          className="px-2 py-1 rounded hover:bg-gray-100 text-xs font-mono font-semibold tabular-nums"
          style={{ color: BRAND.darkest, minWidth: 56 }}
          title="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={zoomIn}
          disabled={zoom >= ZOOM_MAX}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40"
          title="Zoom in"
          aria-label="Zoom in"
        >
          <ZoomIn className="w-3.5 h-3.5" style={{ color: BRAND.darkest }} />
        </button>
        <span className="w-px h-4 mx-1" style={{ background: BRAND.border }} />
        <button
          onClick={zoomReset}
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 text-[11px]"
          style={{ color: BRAND.mid }}
          title="Reset view"
        >
          <Maximize2 className="w-3 h-3" />
          Reset view
        </button>
        <span className="ml-auto text-[11px]" style={{ color: BRAND.mid }}>
          {bounds.cols} × {bounds.rows} cells
        </span>
      </div>
    </div>
  )
}

// ── Drop-target overlay (per cell) ────────────────────────────────────────
// Renders a coloured outline when its parent <td> has data-drop="target"|"invalid".
// We can't easily use parent-attribute selectors in inline style, so we
// render this small invisible div which uses CSS attribute selectors via a
// scoped <style> block below. This avoids :global() which is flaky in
// Next.js static export.
function DropOverlay() {
  return (
    <>
      <span className="yl-drop-overlay" aria-hidden="true" />
      <style jsx>{`
        .yl-drop-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.08s;
        }
        :global(td[data-drop="target"]) .yl-drop-overlay {
          opacity: 1;
          background: ${BRAND_ALPHA.accentSoft};
          box-shadow: inset 0 0 0 2px ${BRAND.accent};
        }
        :global(td[data-drop="invalid"]) .yl-drop-overlay {
          opacity: 1;
          background: ${BRAND_ALPHA.errorSoft};
          box-shadow: inset 0 0 0 2px ${BRAND.error};
        }
      `}</style>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════
// SPACE TILE — single parking space rendered inside a cell
// ════════════════════════════════════════════════════════════════════════

interface SpaceTileProps {
  space: ParkingSpace
  selected: boolean
  unlocked: boolean
  onPointerDown: (e: React.PointerEvent) => void
}

function SpaceTile({ space, selected, unlocked, onPointerDown }: SpaceTileProps) {
  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute inset-1 rounded flex items-start p-1 select-none transition-all"
      style={{
        background: '#cfd6d2',
        cursor: unlocked ? 'move' : 'default',
        boxShadow: selected
          ? `0 0 0 2px ${BRAND.accent}, 0 4px 12px rgba(2,89,64,0.15)`
          : 'none',
        zIndex: selected ? 5 : 1,
      }}
      title={space.label}
    >
      <span
        className="text-[10px] font-bold leading-none"
        style={{ color: BRAND.darkest, letterSpacing: '0.3px' }}
      >
        {space.label}
        {space.labelIsAuto && (
          <span style={{ opacity: 0.5, fontWeight: 400, marginLeft: 2, fontSize: '9px' }}>
            auto
          </span>
        )}
      </span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// BLOCK TILE — multi-cell building/feature block
// ════════════════════════════════════════════════════════════════════════

interface BlockTileProps {
  block: BuildingBlock
  selected: boolean
  unlocked: boolean
  onPointerDown: (e: React.PointerEvent) => void
}

function BlockTile({ block, selected, unlocked, onPointerDown }: BlockTileProps) {
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
      onPointerDown={onPointerDown}
      className="absolute grid place-items-center text-center font-bold select-none transition-shadow"
      style={{
        left: left + 3,
        top: top + 3,
        width: width - 6,
        height: height - 6,
        ...(isGradient ? { background: block.color } : { backgroundColor: block.color }),
        color: isLight ? BRAND.darkest : BRAND.white,
        fontSize: '11px',
        letterSpacing: '0.5px',
        padding: '6px',
        borderRadius: radius,
        boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
        outline: selected ? `2px solid ${BRAND.accent}` : 'none',
        outlineOffset: '3px',
        cursor: unlocked ? 'move' : 'default',
        zIndex: selected ? 6 : 3,
        lineHeight: 1.2,
        overflow: 'hidden',
      }}
    >
      {block.label}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// ✨ Phase 4: MERGED SPACE TILE — multi-cell parking space
// ════════════════════════════════════════════════════════════════════════
// Renders absolute over the grid, like BlockTile, so it can span multiple
// cells. Visually styled like SpaceTile (grey base, label top-left) with
// an extra footprint hint ("3×1") so it's obvious it's not a single cell.

interface MergedSpaceTileProps {
  space: ParkingSpace
  selected: boolean
  unlocked: boolean
  onPointerDown: (e: React.PointerEvent) => void
}

function MergedSpaceTile({ space, selected, unlocked, onPointerDown }: MergedSpaceTileProps) {
  const { w, h } = getSpaceFootprint(space)
  const left = ROW_HEAD_W + (space.col - 1) * CELL_PX
  const top = COL_HEAD_H + (space.row - 1) * CELL_PX
  const width = w * CELL_PX
  const height = h * CELL_PX

  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute rounded flex items-start p-1.5 select-none transition-all"
      style={{
        left: left + 4,
        top: top + 4,
        width: width - 8,
        height: height - 8,
        background: '#cfd6d2',
        cursor: unlocked ? 'move' : 'default',
        boxShadow: selected
          ? `0 0 0 2px ${BRAND.accent}, 0 4px 12px rgba(2,89,64,0.15)`
          : '0 1px 2px rgba(0,0,0,0.04)',
        zIndex: selected ? 5 : 2,
        overflow: 'hidden',
      }}
      title={`${space.label} — ${w}×${h} cells`}
    >
      <span
        className="text-[10px] font-bold leading-tight"
        style={{ color: BRAND.darkest, letterSpacing: '0.3px' }}
      >
        {space.label}
        {space.labelIsAuto && (
          <span style={{ opacity: 0.5, fontWeight: 400, marginLeft: 2, fontSize: '9px' }}>
            auto
          </span>
        )}
        <span style={{ display: 'block', fontSize: '9px', fontWeight: 600, opacity: 0.55, marginTop: 2, letterSpacing: '0.5px' }}>
          {w}×{h} merged
        </span>
      </span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// ✨ Phase 4: DRAG-SELECT PREVIEW — green/red rectangle while drawing
// ════════════════════════════════════════════════════════════════════════
// Shows the user the proposed merged-space footprint as they drag.
// Tints green when the rectangle is valid, red when it's not (overlapping,
// off-grid, or larger than MAX_MERGED_SPACE_CELLS).

interface DragSelectPreviewProps {
  startCol: number
  startRow: number
  endCol: number
  endRow: number
  valid: boolean
}

function DragSelectPreview({ startCol, startRow, endCol, endRow, valid }: DragSelectPreviewProps) {
  const anchorCol = Math.min(startCol, endCol)
  const anchorRow = Math.min(startRow, endRow)
  const w = Math.abs(endCol - startCol) + 1
  const h = Math.abs(endRow - startRow) + 1
  const left = ROW_HEAD_W + (anchorCol - 1) * CELL_PX
  const top = COL_HEAD_H + (anchorRow - 1) * CELL_PX

  return (
    <div
      className="absolute pointer-events-none rounded transition-colors"
      style={{
        left: left + 2,
        top: top + 2,
        width: w * CELL_PX - 4,
        height: h * CELL_PX - 4,
        background: valid ? BRAND_ALPHA.accentSoft : BRAND_ALPHA.errorSoft,
        boxShadow: `inset 0 0 0 2px ${valid ? BRAND.accent : BRAND.error}`,
        zIndex: 8,
      }}
    >
      <span
        className="absolute top-1 left-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
        style={{
          background: valid ? BRAND.accent : BRAND.error,
          color: valid ? BRAND.darkest : BRAND.white,
        }}
      >
        {w}×{h}{valid ? '' : ' ✕'}
      </span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// PROPERTIES PANEL
// ════════════════════════════════════════════════════════════════════════

interface PropertiesPanelProps {
  spaces: Record<string, ParkingSpace>
  blocks: BuildingBlock[]
  selectedId: string
  selectedKind: SelectedItemKind
  onUpdateSpace: (id: string, patch: Partial<ParkingSpace>) => void
  onUpdateBlock: (id: string, patch: Partial<BuildingBlock>) => void
  onSplitSpace: (id: string) => void   // ✨ Phase 4
  onClose: () => void
}

function PropertiesPanel({
  spaces,
  blocks,
  selectedId,
  selectedKind,
  onUpdateSpace,
  onUpdateBlock,
  onSplitSpace, // ✨ Phase 4
  onClose,
}: PropertiesPanelProps) {
  const space = selectedKind === 'space' ? findSpaceById(spaces, selectedId)?.space : null
  const block = selectedKind === 'block' ? findBlockById(blocks, selectedId) : null

  if (!space && !block) return null

  return (
    <aside
      className="w-72 flex-shrink-0 border-l overflow-y-auto"
      style={{ background: BRAND.white, borderColor: BRAND.border }}
    >
      <div
        className="flex items-start justify-between px-4 py-3 border-b"
        style={{ background: BRAND.bg, borderColor: BRAND.border }}
      >
        <div>
          <h3 className="text-sm font-semibold" style={{ color: BRAND.darkest }}>
            {space ? 'Parking Space' : 'Building / Feature'}
          </h3>
          <span
            className="text-[10px] font-mono mt-1 inline-block px-1.5 py-0.5 rounded border"
            style={{ background: BRAND.white, borderColor: BRAND.border, color: BRAND.mid }}
          >
            {selectedId}
          </span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Close panel">
          <X className="w-4 h-4" style={{ color: BRAND.mid }} />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {space && (
          <SpaceProperties
            space={space}
            onChange={(patch) => onUpdateSpace(space.id, patch)}
            onSplit={() => onSplitSpace(space.id)}
          />
        )}
        {block && <BlockProperties block={block} onChange={(patch) => onUpdateBlock(block.id, patch)} />}
      </div>
    </aside>
  )
}

// ── Space properties editor ───────────────────────────────────────────────
// ✨ Phase 4: shows footprint info for merged spaces, and a Split button
// to convert them back into individual 1×1 spaces.
function SpaceProperties({
  space,
  onChange,
  onSplit, // ✨ Phase 4
}: {
  space: ParkingSpace
  onChange: (patch: Partial<ParkingSpace>) => void
  onSplit: () => void
}) {
  const coord = coordKey(space.col, space.row)
  // ✨ Phase 4: derive merged-aware values so the UI behaves correctly for
  // both 1×1 and merged spaces. autoLabel is what the auto label SHOULD be
  // (e.g. "A1" for a 1×1, "A1–A3" for a 1×3 merged at A1).
  const { w, h } = getSpaceFootprint(space)
  const merged = isMergedSpace(space)
  const autoLabel = mergedSpaceLabel(space.col, space.row, w, h)

  return (
    <>
      <div className="rounded-md p-2.5 text-xs" style={{ background: BRAND.bg }}>
        <Row label="Coordinate" value={coord} />
        {/* ✨ Phase 4: surface the footprint so users know it's merged */}
        {merged && <Row label="Footprint" value={`${w} × ${h} cells`} />}
        <Row label="Label mode" value={space.labelIsAuto ? `Auto (= ${autoLabel})` : 'Custom'} />
      </div>

      <Field label="Display Label">
        <input
          type="text"
          value={space.label}
          onChange={(e) => {
            const newLabel = e.target.value
            onChange({
              label: newLabel,
              // ✨ Phase 4: compare against the merged-aware auto label
              labelIsAuto: newLabel === autoLabel,
            })
          }}
          className="w-full px-2 py-1.5 rounded-md border text-sm"
          style={{ borderColor: BRAND.border, color: BRAND.darkest }}
        />
      </Field>

      <p className="text-[11px]" style={{ color: BRAND.mid, lineHeight: 1.4 }}>
        {space.labelIsAuto
          ? <><b style={{ color: BRAND.darkest }}>Auto-named.</b> Will follow the coordinate when moved.</>
          : <><b style={{ color: BRAND.darkest }}>Custom label.</b> Stays "{space.label}" wherever you move it.</>}
      </p>

      <button
        onClick={() => onChange({ label: autoLabel, labelIsAuto: true })}
        disabled={space.labelIsAuto}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border disabled:opacity-40"
        style={{ background: BRAND.white, borderColor: BRAND.border, color: BRAND.darkest }}
      >
        <RotateCcw className="w-3 h-3" />
        Reset to {autoLabel}
      </button>

      {/* ✨ Phase 4: Split button — only visible for merged spaces */}
      {merged && (
        <>
          <button
            onClick={onSplit}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border mt-1"
            style={{ background: BRAND.white, borderColor: '#fed7aa', color: '#9a3412' }}
          >
            Split into {w * h} individual spaces
          </button>
          <p
            className="text-[11px]"
            style={{ color: BRAND.mid, lineHeight: 1.4 }}
          >
            ⚠️ If a vehicle is parked here, it will need to be re-parked after splitting.
          </p>
        </>
      )}

      <p
        className="text-[11px] pt-2 mt-2 border-t"
        style={{ color: BRAND.mid, borderColor: BRAND.border, lineHeight: 1.4 }}
      >
        💡 Drag this space to any empty cell to move it.
      </p>
    </>
  )
}

// ── Block properties editor ───────────────────────────────────────────────
function BlockProperties({
  block,
  onChange,
}: {
  block: BuildingBlock
  onChange: (patch: Partial<BuildingBlock>) => void
}) {
  return (
    <>
      <div className="rounded-md p-2.5 text-xs" style={{ background: BRAND.bg }}>
        <Row label="Anchor" value={coordKey(block.col, block.row)} />
        <Row label="Size" value={`${block.w} × ${block.h} cells`} />
      </div>

      <Field label="Label">
        <input
          type="text"
          value={block.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="w-full px-2 py-1.5 rounded-md border text-sm"
          style={{ borderColor: BRAND.border, color: BRAND.darkest }}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Width">
          <input
            type="number"
            min={1}
            max={20}
            value={block.w}
            onChange={(e) => onChange({ w: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            className="w-full px-2 py-1.5 rounded-md border text-sm"
            style={{ borderColor: BRAND.border, color: BRAND.darkest }}
          />
        </Field>
        <Field label="Height">
          <input
            type="number"
            min={1}
            max={20}
            value={block.h}
            onChange={(e) => onChange({ h: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            className="w-full px-2 py-1.5 rounded-md border text-sm"
            style={{ borderColor: BRAND.border, color: BRAND.darkest }}
          />
        </Field>
      </div>

      <Field label="Shape">
        <select
          value={block.shape}
          onChange={(e) => onChange({ shape: e.target.value as BlockShape })}
          className="w-full px-2 py-1.5 rounded-md border text-sm"
          style={{ borderColor: BRAND.border, color: BRAND.darkest }}
        >
          <option value="rounded">Rounded</option>
          <option value="rect">Sharp rectangle</option>
          <option value="capsule">Capsule (pill)</option>
        </select>
      </Field>

      <Field label="Colour">
        <div className="grid grid-cols-7 gap-1.5">
          {BLOCK_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onChange({ color: c })}
              className="aspect-square rounded transition-transform hover:scale-110"
              style={{
                background: c,
                border: block.color === c ? `2px solid ${BRAND.darkest}` : '2px solid transparent',
                boxShadow: block.color === c ? `0 0 0 1px ${BRAND.white} inset` : 'none',
              }}
              aria-label={`Pick colour ${c}`}
            />
          ))}
        </div>
      </Field>

      <p
        className="text-[11px] pt-2 mt-2 border-t"
        style={{ color: BRAND.mid, borderColor: BRAND.border, lineHeight: 1.4 }}
      >
        💡 Drag the building anywhere on the grid. Cells underneath can't have parking spaces.
      </p>
    </>
  )
}

// ── Tiny helper components (presentation only) ────────────────────────────
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between mt-0.5 first:mt-0">
      <span className="uppercase tracking-wide font-semibold text-[10px]" style={{ color: BRAND.mid }}>
        {label}
      </span>
      <span className="font-mono font-semibold text-[11px]" style={{ color: BRAND.darkest }}>
        {value}
      </span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="block uppercase tracking-wide text-[10px] font-semibold mb-1"
        style={{ color: BRAND.mid }}
      >
        {label}
      </label>
      {children}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// ADD BUILDING MODAL
// ════════════════════════════════════════════════════════════════════════

interface AddBuildingModalProps {
  onCreate: (data: Omit<BuildingBlock, 'id' | 'col' | 'row'>) => void
  onClose: () => void
}

function AddBuildingModal({ onCreate, onClose }: AddBuildingModalProps) {
  const [label, setLabel] = useState('')
  const [w, setW] = useState(3)
  const [h, setH] = useState(2)
  const [shape, setShape] = useState<BlockShape>('rounded')
  const [color, setColor] = useState<string>(BLOCK_COLORS[0])

  const handleCreate = () => {
    onCreate({ label: label.trim(), w, h, shape, color })
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center"
      style={{ background: 'rgba(1,38,25,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-[460px] max-w-[92vw] rounded-lg overflow-hidden shadow-2xl"
        style={{ background: BRAND.white }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: BRAND.darkest, color: BRAND.white }}
        >
          <h3 className="text-sm font-semibold">Add Building / Feature</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <Field label="Label">
            <input
              type="text"
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. BODYSHOP, Office, Tyre Bay"
              className="w-full px-3 py-2 rounded-md border text-sm"
              style={{ borderColor: BRAND.border }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Width (cells)">
              <input
                type="number"
                min={1}
                max={20}
                value={w}
                onChange={(e) => setW(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full px-3 py-2 rounded-md border text-sm"
                style={{ borderColor: BRAND.border }}
              />
            </Field>
            <Field label="Height (cells)">
              <input
                type="number"
                min={1}
                max={20}
                value={h}
                onChange={(e) => setH(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full px-3 py-2 rounded-md border text-sm"
                style={{ borderColor: BRAND.border }}
              />
            </Field>
          </div>

          <Field label="Shape">
            <select
              value={shape}
              onChange={(e) => setShape(e.target.value as BlockShape)}
              className="w-full px-3 py-2 rounded-md border text-sm"
              style={{ borderColor: BRAND.border }}
            >
              <option value="rounded">Rounded rectangle</option>
              <option value="rect">Sharp rectangle</option>
              <option value="capsule">Capsule (pill)</option>
            </select>
          </Field>

          <Field label="Colour">
            <div className="grid grid-cols-7 gap-1.5">
              {BLOCK_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="aspect-square rounded transition-transform hover:scale-110"
                  style={{
                    background: c,
                    border: color === c ? `2px solid ${BRAND.darkest}` : '2px solid transparent',
                    boxShadow: color === c ? `0 0 0 1px ${BRAND.white} inset` : 'none',
                  }}
                />
              ))}
            </div>
          </Field>
        </div>

        <div
          className="flex justify-end gap-2 px-4 py-3 border-t"
          style={{ background: BRAND.bg, borderColor: BRAND.border }}
        >
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs font-medium border"
            style={{ background: BRAND.white, borderColor: BRAND.border, color: BRAND.darkest }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="px-3 py-1.5 rounded-md text-xs font-semibold text-white"
            style={{ background: BRAND.dark }}
          >
            Create — drag to position
          </button>
        </div>
      </div>
    </div>
  )
}