// src/components/common/DamageMapper/DamageMapper.tsx
// Interactive damage pin mapper for vehicle diagrams
// ✅ ALL ORIGINAL FEATURES PRESERVED
// ✅ REDESIGNED: Smaller pins, sleek floating edit panel, polished UI
// ✅ FIX: Photo upload uses <label htmlFor> — no programmatic .click() — so iOS Safari
//         camera sheet opens correctly and never dismisses the parent modal
// ✅ NEW: externalEditingPinId + onEditingPinChange props so parent (DamageSection modal)
//         can own edit state and render the edit panel in its own right column.
// ✅ FIX: Camera uses in-page getUserMedia on ALL platforms (native + web).
//         Honor/Huawei ThirdCamera destroys the Activity result callback, so
//         @capacitor/camera and <input capture> both fail silently — the photo
//         never comes back. getUserMedia runs entirely inside the WebView with
//         zero Activity transitions, so it works on every Android device.
//         Gallery still uses <input type="file"> on all platforms (works fine).

'use client'

import { useState, useRef, useCallback, useId, useEffect } from 'react'
import { X, Plus, Camera, Trash2, ImageIcon } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DamagePin {
  id: string
  x: number
  y: number
  label: string
  severity: 'minor' | 'moderate' | 'severe'
  photoUrl?: string
  photoBase64?: string
  notes?: string
  createdAt: string
}

export type VehicleDiagramType =
  | 'minibus'
  | 'small_van'
  | 'saloon'
  | 'pickup'
  | 'luton_van'
  | 'tipper'
  | 'swb_van'
  | '7-seater'
  | 'large-van'
  | 'large-suv'

export const DIAGRAM_OPTIONS: { value: VehicleDiagramType; label: string }[] = [
  { value: 'minibus',    label: 'Minibus' },
  { value: 'small_van',  label: 'Small Van' },
  { value: 'saloon',     label: 'Saloon' },
  { value: 'pickup',     label: 'Pickup' },
  { value: 'luton_van',  label: 'Luton Van' },
  { value: 'tipper',     label: 'Tipper' },
  { value: 'swb_van',    label: 'SWB Van' },
  { value: '7-seater',   label: '7 Seater' },
  { value: 'large-van',  label: 'Large Van' },
  { value: 'large-suv',  label: 'Large SUV' },
]

export const SEVERITY_CONFIG = {
  minor:    { colour: '#f59e0b', label: 'Minor',    dot: '#f59e0b', bg: '#fffbeb', border: '#fcd34d', textColor: '#92400e' },
  moderate: { colour: '#f97316', label: 'Moderate', dot: '#f97316', bg: '#fff7ed', border: '#fdba74', textColor: '#9a3412' },
  severe:   { colour: '#ef4444', label: 'Severe',   dot: '#ef4444', bg: '#fef2f2', border: '#fca5a5', textColor: '#7f1d1d' },
}

export const DAMAGE_PRESETS = ['Dent', 'Scuff', 'Scratch', 'Crack', 'Broken']

// ─── Props ────────────────────────────────────────────────────────────────────

interface DamageMapperProps {
  diagramType: VehicleDiagramType
  pins: DamagePin[]
  onChange: (pins: DamagePin[]) => void
  readOnly?: boolean
  onPhotoSelected?: (pinId: string, file: File) => Promise<string | void>
  className?: string
  externalEditingPinId?: string | null
  onEditingPinChange?: (pinId: string | null) => void
}

// ─── Photo buttons ────────────────────────────────────────────────────────────
// Camera button: in-page getUserMedia viewfinder on ALL platforms (native + web).
//   This avoids any Activity transition on Android — the camera runs entirely
//   inside the WebView process, which is the only reliable approach on
//   Honor/Huawei devices whose ThirdCamera destroys the result callback.
// Gallery button: <input type="file"> on all platforms (no change).

interface PhotoButtonsProps {
  pinId: string
  fileInputId: string
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>, pinId: string) => void
  onCameraClick: () => void
  onGalleryClick: () => void
}

function PhotoButtons({ pinId, fileInputId, onFileChange, onCameraClick, onGalleryClick }: PhotoButtonsProps) {
  return (
    <div className="flex gap-2">
      {/* Camera — in-page getUserMedia on all platforms */}
      <button
        type="button"
        onClick={onCameraClick}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm text-gray-400 hover:border-[#025940] hover:text-[#025940] dark:hover:text-[#72A68E] transition-colors cursor-pointer"
      >
        <Camera className="w-4 h-4" />
        Camera
      </button>

      {/* Gallery — same on both platforms */}
      <label
        htmlFor={`${fileInputId}-gal-${pinId}`}
        onClick={onGalleryClick}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm text-gray-400 hover:border-[#025940] hover:text-[#025940] dark:hover:text-[#72A68E] transition-colors cursor-pointer"
      >
        <ImageIcon className="w-4 h-4" />
        Gallery
        <input
          id={`${fileInputId}-gal-${pinId}`}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={e => onFileChange(e, pinId)}
        />
      </label>
    </div>
  )
}

// ─── Exported edit panel (used by DamageSection modal right column) ───────────

interface EditPanelProps {
  pin: DamagePin
  onUpdate: (id: string, updates: Partial<DamagePin>) => void
  onDelete: (id: string) => void
  onClose: () => void
  onPhotoSelected?: (pinId: string, file: File) => Promise<string | void>
}

export function DamageEditPanel({ pin, onUpdate, onDelete, onClose, onPhotoSelected }: EditPanelProps) {
  const fileInputId = useId()

  // ── In-page camera state ────────────────────────────────────────────────────
  const [showCamera, setShowCamera] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setShowCamera(false)
    setCameraReady(false)
    setCameraError(null)
  }

  const snapPhoto = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    const base64 = canvas.toDataURL('image/jpeg', 0.85)
    onUpdate(pin.id, { photoBase64: base64 })
    stopCamera()
  }

  // getUserMedia — runs on ALL platforms (native Android WebView supports it)
  useEffect(() => {
    if (!showCamera) return
    let cancelled = false
    setCameraReady(false)

    // Guard: navigator.mediaDevices may not exist (insecure context, iframe sandbox, etc.)
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera not available in this browser. Check site permissions or try HTTPS.')
      return
    }

    // Timeout: if the stream hasn't started within 8s, something is blocking it
    const timeout = setTimeout(() => {
      if (!cancelled && !cameraReady) {
        setCameraError(
          'Camera failed to start. Click the camera icon in your browser\'s address bar and allow access, then try again.'
        )
      }
    }, 8000)

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    })
      .then(stream => {
        clearTimeout(timeout)
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onplaying = () => { if (!cancelled) setCameraReady(true) }
        }
      })
      .catch(() => {
        clearTimeout(timeout)
        if (!cancelled) setCameraError(
          'Camera access denied. Click the camera icon in your browser\'s address bar and allow access, then try again.'
        )
      })
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [showCamera])

  // Handles gallery <input> file selection (used on all platforms for gallery)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, pinId: string) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { onUpdate(pinId, { photoBase64: ev.target?.result as string }) }
    reader.readAsDataURL(file)
    if (onPhotoSelected) {
      try {
        const url = await onPhotoSelected(pinId, file)
        if (url) onUpdate(pinId, { photoUrl: url, photoBase64: null as any })
      } catch { /* keep base64 preview */ }
    }
    e.target.value = ''
  }

  return (
    <>
      <div
        className="rounded-2xl border p-4 shadow-sm"
        style={{
          backgroundColor: SEVERITY_CONFIG[pin.severity].bg,
          borderColor: SEVERITY_CONFIG[pin.severity].border,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold" style={{ color: SEVERITY_CONFIG[pin.severity].textColor }}>
            Edit damage
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { onDelete(pin.id); onClose() }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 text-xs font-bold transition-colors border border-red-200"
            >
              <Trash2 className="w-3 h-3" />
              Remove
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <X className="w-3.5 h-3.5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Label presets */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Type</label>
            <div className="flex flex-wrap gap-1">
              {DAMAGE_PRESETS.map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onUpdate(pin.id, { label: preset })}
                  className={`px-2 py-0.5 rounded-lg text-xs font-semibold border transition-colors ${
                    pin.label === preset
                      ? 'bg-[#012619] text-white border-[#012619]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-[#025940]'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={pin.label}
              onChange={e => onUpdate(pin.id, { label: e.target.value })}
              placeholder="Custom label"
              className="mt-1.5 w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#025940] transition-shadow"
            />
          </div>

          {/* Severity */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Severity</label>
            <div className="flex flex-col gap-1">
              {(Object.entries(SEVERITY_CONFIG) as [keyof typeof SEVERITY_CONFIG, typeof SEVERITY_CONFIG.minor][]).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onUpdate(pin.id, { severity: key })}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all"
                  style={
                    pin.severity === key
                      ? { backgroundColor: cfg.bg, borderColor: cfg.dot, color: cfg.textColor }
                      : { backgroundColor: 'white', borderColor: '#e5e7eb', color: '#6b7280' }
                  }
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Notes</label>
            <input
              type="text"
              value={pin.notes ?? ''}
              onChange={e => onUpdate(pin.id, { notes: e.target.value })}
              placeholder="e.g. Near nearside rear door"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#025940] focus:border-transparent transition-shadow"
            />
          </div>

          {/* Photo */}
          <div className="col-span-2">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Photo (optional)</label>
            {pin.photoBase64 || pin.photoUrl ? (
              <div className="relative inline-block">
                <img
                  src={pin.photoBase64 || pin.photoUrl}
                  alt="Damage"
                  className="h-28 w-auto rounded-xl border border-gray-200 dark:border-gray-600 object-cover cursor-pointer active:scale-95 transition-transform"
                  onClick={async () => {
                    const url = pin.photoUrl || pin.photoBase64
                    if (!url) return
                    try {
                      const res = await fetch(url)
                      const blob = await res.blob()
                      const blobUrl = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = blobUrl
                      a.download = `damage_${pin.label}_${pin.id}.jpg`
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                      URL.revokeObjectURL(blobUrl)
                    } catch {
                      window.open(url, '_blank')
                    }
                  }}
                  title="Tap to download photo"
                />
                <button
                  type="button"
                  onClick={() => onUpdate(pin.id, { photoBase64: null as any, photoUrl: null as any })}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors shadow"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ) : (
              <PhotoButtons
                pinId={pin.id}
                fileInputId={fileInputId}
                onFileChange={handleFileChange}
                onCameraClick={() => { setCameraError(null); setShowCamera(true) }}
                onGalleryClick={() => {}}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── In-page camera modal (all platforms) ────────────────────── */}
      {showCamera && (
        <div
          className="fixed inset-0 z-[99999] bg-black flex flex-col"
          onClick={e => { if (e.target === e.currentTarget) stopCamera() }}
        >
          {cameraError ? (
            <div className="flex-1 flex items-center justify-center text-center text-white p-8">
              <div>
                <p className="text-lg font-semibold mb-2">Camera unavailable</p>
                <p className="text-sm text-gray-300 mb-6">{cameraError}</p>
                <button type="button" onClick={stopCamera} className="px-6 py-2 bg-white text-black rounded-xl font-bold">Close</button>
              </div>
            </div>
          ) : (
            <>
              {/* Close button */}
              <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 pt-4 pb-2">
                <span className="text-white/80 text-sm font-medium">Take damage photo</span>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="w-10 h-10 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Loading spinner — visible until stream is playing */}
              {!cameraReady && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                    <span className="text-white/60 text-sm">Starting camera…</span>
                  </div>
                </div>
              )}

              {/* Video viewfinder — hidden until stream is ready to avoid poster flash */}
              <div className={`flex-1 flex items-center justify-center ${cameraReady ? '' : 'sr-only'}`}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Shutter button */}
              {cameraReady && (
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center pb-10 pt-4 bg-gradient-to-t from-black/60 to-transparent">
                  <button
                    type="button"
                    onClick={snapPhoto}
                    className="w-18 h-18 rounded-full bg-white border-[5px] border-white/40 shadow-2xl hover:scale-105 active:scale-90 transition-transform"
                    style={{ width: 72, height: 72 }}
                    aria-label="Take photo"
                  >
                    <span className="block w-full h-full rounded-full bg-white hover:bg-gray-100 transition-colors" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}

// ─── Pin dot ─────────────────────────────────────────────────────────────────

interface PinDotProps {
  pin: DamagePin
  isSelected: boolean
  readOnly: boolean
  onClick: (e: React.MouseEvent) => void
}

function PinDot({ pin, isSelected, readOnly, onClick }: PinDotProps) {
  const cfg = SEVERITY_CONFIG[pin.severity]
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center group transition-all duration-150 focus:outline-none"
      style={{
        left: `${pin.x}%`,
        top: `${pin.y}%`,
        width: isSelected ? 20 : 13,
        height: isSelected ? 20 : 13,
        backgroundColor: cfg.dot,
        boxShadow: `0 0 0 2px white, 0 0 0 ${isSelected ? 4 : 3}px ${cfg.dot}99`,
      }}
    >
      <span className="rounded-full bg-white" style={{ width: 5, height: 5 }} />
      {!isSelected && (
        <span
          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded-lg px-2 py-0.5 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
          style={{ backgroundColor: cfg.dot }}
        >
          {pin.label}
        </span>
      )}
    </button>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DamageMapper({
  diagramType,
  pins,
  onChange,
  readOnly = false,
  onPhotoSelected,
  className = '',
  externalEditingPinId,
  onEditingPinChange,
}: DamageMapperProps) {
  const imgRef = useRef<HTMLDivElement>(null)
  const fileInputId = useId()

  const [isPlacingPin, setIsPlacingPin] = useState(false)

  const isControlled = externalEditingPinId !== undefined
  const [internalEditingPinId, setInternalEditingPinId] = useState<string | null>(null)
  const [internalSelectedPin, setInternalSelectedPin] = useState<string | null>(null)

  const editingPinId = isControlled ? externalEditingPinId : internalEditingPinId
  const selectedPin = isControlled ? externalEditingPinId : internalSelectedPin

  const setEditingPin = (id: string | null) => {
    if (isControlled) {
      onEditingPinChange?.(id)
    } else {
      setInternalEditingPinId(id)
      setInternalSelectedPin(id)
    }
  }

  // ── In-page camera (inline/uncontrolled mode, all platforms) ─────────────────
  const [uploadingPinId, setUploadingPinId] = useState<string | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setShowCamera(false)
    setCameraReady(false)
    setCameraError(null)
  }

  const snapPhoto = () => {
    if (!videoRef.current || !uploadingPinId) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    const base64 = canvas.toDataURL('image/jpeg', 0.85)
    updatePin(uploadingPinId, { photoBase64: base64 })
    stopCamera()
    setUploadingPinId(null)
  }

  useEffect(() => {
    if (!showCamera) return
    let cancelled = false
    setCameraReady(false)

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera not available in this browser. Check site permissions or try HTTPS.')
      return
    }

    const timeout = setTimeout(() => {
      if (!cancelled && !cameraReady) {
        setCameraError(
          'Camera failed to start. Click the camera icon in your browser\'s address bar and allow access, then try again.'
        )
      }
    }, 8000)

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    })
      .then(stream => {
        clearTimeout(timeout)
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onplaying = () => { if (!cancelled) setCameraReady(true) }
        }
      })
      .catch(() => {
        clearTimeout(timeout)
        if (!cancelled) setCameraError(
          'Camera access denied. Click the camera icon in your browser\'s address bar and allow access, then try again.'
        )
      })
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [showCamera])

  const diagramSrc = `/${diagramType}.png`

  const handleImageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isPlacingPin || readOnly) return
      const rect = e.currentTarget.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100

      const newPin: DamagePin = {
        id: `pin_${Date.now()}`,
        x: Math.min(98, Math.max(2, x)),
        y: Math.min(98, Math.max(2, y)),
        label: 'Scratch',
        severity: 'minor',
        notes: '',
        createdAt: new Date().toISOString(),
      }

      onChange([...pins, newPin])
      setIsPlacingPin(false)
      setEditingPin(newPin.id)
    },
    [isPlacingPin, readOnly, pins, onChange]
  )

  const deletePin = (id: string) => {
    onChange(pins.filter(p => p.id !== id))
    if (editingPinId === id) setEditingPin(null)
  }

  const updatePin = (id: string, updates: Partial<DamagePin>) => {
    onChange(pins.map(p => (p.id === id ? { ...p, ...updates } : p)))
  }

  // Handles gallery <input> file selection in inline mode
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, pinId: string) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { updatePin(pinId, { photoBase64: ev.target?.result as string }) }
    reader.readAsDataURL(file)
    if (onPhotoSelected) {
      try {
        const url = await onPhotoSelected(pinId, file)
        if (url) updatePin(pinId, { photoUrl: url, photoBase64: null as any })
      } catch { /* keep base64 preview */ }
    }
    e.target.value = ''
    setUploadingPinId(null)
  }

  const editingPin = pins.find(p => p.id === editingPinId)

  const counts = pins.reduce((acc, p) => {
    acc[p.severity] = (acc[p.severity] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className={`flex flex-col gap-3 ${className}`}>

      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      {!readOnly && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => { setIsPlacingPin(v => !v); setEditingPin(null) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold transition-all border ${
              isPlacingPin
                ? 'bg-[#b3f243] text-[#012619] border-[#b3f243] shadow-inner'
                : 'bg-[#012619] text-white border-[#025940] hover:bg-[#025940]'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            {isPlacingPin ? 'Click diagram to place…' : 'Add damage pin'}
          </button>

          {pins.length > 0 && (
            <div className="flex items-center gap-1.5 ml-auto flex-wrap">
              {(Object.entries(counts) as [keyof typeof SEVERITY_CONFIG, number][]).map(([sev, count]) => {
                const cfg = SEVERITY_CONFIG[sev]
                return (
                  <span key={sev}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
                    style={{ background: cfg.bg, color: cfg.textColor, border: `1px solid ${cfg.border}` }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.dot }} />
                    {count} {cfg.label}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Diagram + pins ────────────────────────────────────────────── */}
      <div
  ref={imgRef}
  className={`relative w-full rounded-2xl overflow-hidden border-2 select-none transition-colors
    ${isPlacingPin
      ? 'border-[#b3f243] cursor-crosshair'
      : 'border-gray-200 dark:border-gray-700 cursor-default'
    }`}
  onClick={handleImageClick}
>
  {/* eslint-disable-next-line @next/next/no-img-element */}
  <img
    src={diagramSrc}
    alt={`${diagramType} diagram`}
    className="w-full block pointer-events-none select-none"
    style={{ maxHeight: '60vh', objectFit: 'contain' }}
    draggable={false}
  />

        {isPlacingPin && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="bg-[#b3f243]/90 text-[#012619] text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
              Tap to place pin
            </span>
          </div>
        )}

        {pins.map(pin => (
          <PinDot
            key={pin.id}
            pin={pin}
            isSelected={selectedPin === pin.id}
            readOnly={readOnly}
            onClick={e => {
              e.stopPropagation()
              if (readOnly) return
              setEditingPin(editingPinId === pin.id ? null : pin.id)
            }}
          />
        ))}
      </div>

      {/* ── Inline edit panel (only rendered when NOT controlled by parent) ── */}
      {!isControlled && editingPin && !readOnly && (
        <DamageEditPanel
          pin={editingPin}
          onUpdate={updatePin}
          onDelete={deletePin}
          onClose={() => setEditingPin(null)}
          onPhotoSelected={onPhotoSelected}
        />
      )}

      {/* ── Read-only pin list ───────────────────────────────────────── */}
      {readOnly && pins.length > 0 && (
        <div className="space-y-1.5 mt-1">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-0.5">
            {pins.length} damage{pins.length !== 1 ? 's' : ''} recorded
          </p>
          {pins.map(pin => {
            const cfg = SEVERITY_CONFIG[pin.severity]
            return (
              <div
                key={pin.id}
                className="flex items-start gap-3 p-3 rounded-xl border"
                style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
              >
                <div className="mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold" style={{ color: cfg.textColor }}>{pin.label}</span>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                      style={{ background: `${cfg.dot}20`, color: cfg.textColor }}
                    >
                      {cfg.label}
                    </span>
                  </div>
                  {pin.notes && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{pin.notes}</p>
                  )}
                </div>
                {(pin.photoBase64 || pin.photoUrl) && (
                  <img
                    src={pin.photoBase64 || pin.photoUrl}
                    alt="Damage"
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-gray-200 dark:border-gray-600 cursor-pointer active:scale-95 transition-transform"
                    onClick={async () => {
                      const url = pin.photoUrl || pin.photoBase64
                      if (!url) return
                      try {
                        const res = await fetch(url)
                        const blob = await res.blob()
                        const blobUrl = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = blobUrl
                        a.download = `damage_${pin.label}_${pin.id}.jpg`
                        document.body.appendChild(a)
                        a.click()
                        document.body.removeChild(a)
                        URL.revokeObjectURL(blobUrl)
                      } catch {
                        window.open(url, '_blank')
                      }
                    }}
                    title="Tap to download"
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {readOnly && pins.length === 0 && (
        <p className="text-xs text-gray-400 italic text-center py-2">No damage recorded</p>
      )}

      {/* ── In-page camera modal (inline/uncontrolled mode, all platforms) ── */}
      {!isControlled && showCamera && (
        <div
          className="fixed inset-0 z-[99999] bg-black flex flex-col"
          onClick={e => { if (e.target === e.currentTarget) stopCamera() }}
        >
          {cameraError ? (
            <div className="flex-1 flex items-center justify-center text-center text-white p-8">
              <div>
                <p className="text-lg font-semibold mb-2">Camera unavailable</p>
                <p className="text-sm text-gray-300 mb-6">{cameraError}</p>
                <button type="button" onClick={stopCamera} className="px-6 py-2 bg-white text-black rounded-xl font-bold">Close</button>
              </div>
            </div>
          ) : (
            <>
              <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 pt-4 pb-2">
                <span className="text-white/80 text-sm font-medium">Take damage photo</span>
                <button type="button" onClick={stopCamera} className="w-10 h-10 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {!cameraReady && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                    <span className="text-white/60 text-sm">Starting camera…</span>
                  </div>
                </div>
              )}
              <div className={`flex-1 flex items-center justify-center ${cameraReady ? '' : 'sr-only'}`}>
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              </div>
              {cameraReady && (
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center pb-10 pt-4 bg-gradient-to-t from-black/60 to-transparent">
                  <button
                    type="button"
                    onClick={snapPhoto}
                    className="rounded-full bg-white border-[5px] border-white/40 shadow-2xl hover:scale-105 active:scale-90 transition-transform"
                    style={{ width: 72, height: 72 }}
                    aria-label="Take photo"
                  >
                    <span className="block w-full h-full rounded-full bg-white hover:bg-gray-100 transition-colors" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

    </div>
  )
}

export default DamageMapper