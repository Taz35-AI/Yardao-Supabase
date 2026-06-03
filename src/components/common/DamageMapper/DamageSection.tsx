// src/components/common/DamageMapper/DamageSection.tsx
// ✅ "Mark damage" button opens a dedicated fullscreen modal
// ✅ Modal: two-column on md+ — diagram left, pin list + edit panel right
// ✅ FIX: DiagramModal now owns LOCAL pin state — no more stale closure bug
//         where photos taken with the camera were not appearing in the pin.
//         Pins are pushed back to the parent via onChange on every local update.

'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, ChevronDown, ChevronUp, Maximize2, X } from 'lucide-react'
import { DamageMapper, DamageEditPanel, DamagePin, VehicleDiagramType } from './DamageMapper'

interface DamageSectionProps {
  diagramType?: VehicleDiagramType | string | null
  pins: DamagePin[]
  onChange: (pins: DamagePin[]) => void
  onPhotoSelected?: (pinId: string, file: File) => Promise<string | void>
}

const VALID_DIAGRAMS: VehicleDiagramType[] = [
  'minibus', 'small_van', 'saloon', 'pickup', 'luton_van', 'tipper', 'swb_van',
  '7-seater', 'large-van', 'large-suv',
]

const COLOURS = {
  minor:    { bg: '#fffbeb', border: '#fcd34d', dot: '#f59e0b', text: '#92400e' },
  moderate: { bg: '#fff7ed', border: '#fdba74', dot: '#f97316', text: '#9a3412' },
  severe:   { bg: '#fef2f2', border: '#fca5a5', dot: '#ef4444', text: '#7f1d1d' },
}

// ─── Fullscreen diagram modal ─────────────────────────────────────────────────

interface DiagramModalProps {
  diagramType: VehicleDiagramType
  initialPins: DamagePin[]                              // snapshot when modal opens
  onPinsChange: (pins: DamagePin[]) => void             // called on every change
  onPhotoSelected?: (pinId: string, file: File) => Promise<string | void>
  onClose: () => void
}

function DiagramModal({ diagramType, initialPins, onPinsChange, onPhotoSelected, onClose }: DiagramModalProps) {
  // ── LOCAL pin state — fixes the stale closure bug ────────────────────────────
  // Previously pins came in as a prop and updatePin closed over the prop value,
  // meaning any update (especially after returning from the native camera) was
  // operating on a stale snapshot. Now the modal owns the state and always has
  // the latest value.
  const [localPins, setLocalPins] = useState<DamagePin[]>(initialPins)
  const [editingPinId, setEditingPinId] = useState<string | null>(null)

  // Keep a ref so callbacks that capture localPins always see the latest value
  const localPinsRef = useRef(localPins)
  useEffect(() => { localPinsRef.current = localPins }, [localPins])

  // Push every local change up to the parent form immediately
  const updateLocalPins = (next: DamagePin[]) => {
    setLocalPins(next)
    onPinsChange(next)
  }

  // Prevent body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Clear editing state if that pin was deleted
  useEffect(() => {
    if (editingPinId && !localPins.find(p => p.id === editingPinId)) {
      setEditingPinId(null)
    }
  }, [localPins, editingPinId])

  const hasPins = localPins.length > 0
  const editingPin = localPins.find(p => p.id === editingPinId) ?? null

  const updatePin = (id: string, updates: Partial<DamagePin>) => {
    // Always reads from ref — never stale even after camera round-trip
    const next = localPinsRef.current.map(p => (p.id === id ? { ...p, ...updates } : p))
    updateLocalPins(next)
  }

  const deletePin = (id: string) => {
    const next = localPinsRef.current.filter(p => p.id !== id)
    updateLocalPins(next)
    if (editingPinId === id) setEditingPinId(null)
  }

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-white dark:bg-gray-900"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-[#012619] to-[#025940]">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#b3f243]" />
          <span className="text-sm font-bold text-white tracking-wide">Mark damage</span>
          {hasPins && (
            <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {localPins.length} pin{localPins.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors"
        >
          <X className="w-4 h-4" />
          Done
        </button>
      </div>

      {/* ── Two-column body ────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">

        {/* LEFT — diagram */}
        <div className="md:flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 md:border-r border-gray-100 dark:border-gray-800">
          <div className="max-w-2xl mx-auto">
            <DamageMapper
              diagramType={diagramType}
              pins={localPins}
              onChange={updateLocalPins}
              onPhotoSelected={onPhotoSelected}
              externalEditingPinId={editingPinId}
              onEditingPinChange={setEditingPinId}
            />
          </div>
        </div>

        {/* RIGHT — pin list or edit panel */}
        <div className="md:w-80 lg:w-96 flex flex-col overflow-hidden border-t md:border-t-0 md:border-l border-gray-100 dark:border-gray-800">

          {/* Panel header */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/50 flex items-center justify-between">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
              {editingPin ? 'Edit damage' : 'Recorded damage'}
            </p>
            {editingPin && (
              <button
                type="button"
                onClick={() => setEditingPinId(null)}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
              >
                <X className="w-3 h-3" />
                Back to list
              </button>
            )}
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-4">
            {editingPin ? (
              <DamageEditPanel
                pin={editingPin}
                onUpdate={updatePin}
                onDelete={deletePin}
                onClose={() => setEditingPinId(null)}
                onPhotoSelected={onPhotoSelected}
              />
            ) : hasPins ? (
              <div className="space-y-2">
                <p className="text-[10px] text-gray-400 mb-3">
                  Tap a pin on the diagram or a row below to edit it.
                </p>
                {localPins.map((pin, i) => {
                  const cfg = COLOURS[pin.severity] ?? COLOURS.minor
                  return (
                    <div
                      key={pin.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setEditingPinId(pin.id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setEditingPinId(pin.id) }}
                      className="w-full flex items-start gap-3 p-3 rounded-xl border text-sm text-left transition-all hover:shadow-sm hover:scale-[1.01] cursor-pointer"
                      style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
                    >
                      <div
                        className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white mt-0.5"
                        style={{ backgroundColor: cfg.dot }}
                      >
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold" style={{ color: cfg.text }}>{pin.label}</span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full font-bold capitalize"
                            style={{ background: `${cfg.dot}20`, color: cfg.text }}
                          >
                            {pin.severity}
                          </span>
                        </div>
                        {pin.notes && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{pin.notes}</p>
                        )}
                        {(pin.photoBase64 || pin.photoUrl) && (
                          <p className="text-[10px] text-[#025940] mt-0.5 font-semibold">📷 Photo attached</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <AlertTriangle className="w-8 h-8 text-amber-300 mb-3" />
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">No damage recorded</p>
                <p className="text-xs text-gray-400 mt-1">Tap "Add damage pin" then tap the diagram</p>
              </div>
            )}
          </div>

          {/* Severity summary footer */}
          {hasPins && (
            <div className="flex-shrink-0 px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/50 flex gap-2 flex-wrap">
              {(['minor', 'moderate', 'severe'] as const).map(sev => {
                const count = localPins.filter(p => p.severity === sev).length
                if (!count) return null
                const cfg = COLOURS[sev]
                return (
                  <span
                    key={sev}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
                    style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.dot }} />
                    {count} {sev}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile hint footer ──────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 text-center md:hidden">
        <p className="text-xs text-gray-400">Tap "Add damage pin" then tap the diagram to place a marker</p>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}

// ─── Main exported component ──────────────────────────────────────────────────

export function DamageSection({ diagramType, pins, onChange, onPhotoSelected }: DamageSectionProps) {
  const [expanded, setExpanded] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const hasPins = pins.length > 0

  const resolvedType = VALID_DIAGRAMS.includes(diagramType as VehicleDiagramType)
    ? (diagramType as VehicleDiagramType)
    : null

  return (
    <>
      <div className="bg-gradient-to-br from-amber-50/50 to-orange-50/30 dark:from-amber-900/10 dark:to-orange-900/5 rounded-xl border border-amber-200/60 dark:border-amber-700/40 overflow-hidden">

        {/* ── Collapse/expand header ─────────────────────────────────── */}
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-50/80 dark:hover:bg-amber-900/20 transition-colors"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Damage</span>
            {hasPins && (
              <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                {pins.length}
              </span>
            )}
            {!hasPins && (
              <span className="text-xs text-gray-400 dark:text-gray-500">Optional</span>
            )}
          </div>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-gray-400" />
            : <ChevronDown className="w-4 h-4 text-gray-400" />
          }
        </button>

        {/* ── Body ────────────────────────────────────────────────── */}
        {expanded && (
          <div className="px-4 pb-4">
            {resolvedType ? (
              <>
                {hasPins && (
                  <div className="mb-3 space-y-1.5">
                    {pins.map(pin => {
                      const cfg = COLOURS[pin.severity] ?? COLOURS.minor
                      return (
                        <div
                          key={pin.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs"
                          style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
                        >
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
                          <span className="font-semibold" style={{ color: cfg.text }}>{pin.label}</span>
                          <span className="text-gray-400 capitalize">{pin.severity}</span>
                          {pin.notes && <span className="text-gray-400 truncate">{pin.notes}</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#012619] hover:bg-[#025940] text-white text-sm font-bold transition-colors"
                >
                  <Maximize2 className="w-4 h-4" />
                  {hasPins ? 'Edit damage marks' : 'Mark damage'}
                </button>
              </>
            ) : (
              <div className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-300 dark:text-amber-600" />
                <p className="font-medium text-gray-600 dark:text-gray-400">No diagram assigned</p>
                <p className="text-xs mt-1">
                  Go to <strong>Fleet → Edit this vehicle → Vehicle diagram</strong> to enable damage marking.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {mounted && modalOpen && resolvedType && (
        <DiagramModal
          diagramType={resolvedType}
          initialPins={pins}          // snapshot passed once on open
          onPinsChange={onChange}     // every local change flows back up immediately
          onPhotoSelected={onPhotoSelected}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

export default DamageSection