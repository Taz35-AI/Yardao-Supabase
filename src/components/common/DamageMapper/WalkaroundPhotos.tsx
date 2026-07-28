// src/components/common/DamageMapper/WalkaroundPhotos.tsx
// Collapsible "walk-around" photo section shown alongside the damage diagram.
// A fixed set of standard vehicle angles (front, sides, 3/4 angles, rear); each
// slot holds ONE optional photo that can be added / replaced / removed.
//
// CAMERA: uses an in-app getUserMedia camera (identical to the damage-pin
// camera), NOT a native <input capture>. The native camera backgrounds the
// whole web app; on an Android WebView that can tear down and recreate the
// page when it returns — wiping the in-progress check-in form. getUserMedia
// keeps the page alive the whole time, so nothing is lost.
//
// Storage: photos upload to the `damage-photos` bucket on capture and only the
// URL is kept in state — never base64 — so the walkaround_photos jsonb column
// stays tiny (same lesson that un-crashed the DB with damage pins).

'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Camera, ImageIcon, Trash2, X, ChevronDown, ChevronUp, Loader2, Check } from 'lucide-react'
import { uploadDamagePhoto, compressImage } from '@/services/damageSyncService'

export interface WalkaroundPhoto {
  angle: string
  url: string
  createdAt: string
}

// Fixed slot set, in natural clockwise walk-around order.
export const WALKAROUND_ANGLES: { key: string; label: string }[] = [
  { key: 'front',       label: 'Front' },
  { key: 'front_right', label: 'Front right ¾' },
  { key: 'right',       label: 'Right side' },
  { key: 'rear_right',  label: 'Rear right ¾' },
  { key: 'rear',        label: 'Rear' },
  { key: 'rear_left',   label: 'Rear left ¾' },
  { key: 'left',        label: 'Left side' },
  { key: 'front_left',  label: 'Front left ¾' },
]

const angleLabel = (key: string) =>
  WALKAROUND_ANGLES.find(a => a.key === key)?.label || key

interface WalkaroundPhotosProps {
  photos: WalkaroundPhoto[]
  onChange: (photos: WalkaroundPhoto[]) => void
  /** Upload context — needed to store into the damage-photos bucket. */
  orgId: string
  registration: string
  readOnly?: boolean
  /** Start expanded? Defaults to collapsed to keep the marking modal short. */
  defaultExpanded?: boolean
}

export function WalkaroundPhotos({
  photos,
  onChange,
  orgId,
  registration,
  readOnly = false,
  defaultExpanded = false,
}: WalkaroundPhotosProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [uploadingAngle, setUploadingAngle] = useState<string | null>(null)
  const [preview, setPreview] = useState<WalkaroundPhoto | null>(null)

  // ── In-app camera state (one capture at a time) ─────────────────────────────
  const [cameraAngle, setCameraAngle] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const byAngle = new Map(photos.map(p => [p.angle, p]))
  const takenCount = WALKAROUND_ANGLES.filter(a => byAngle.has(a.key)).length

  const setPhoto = (angle: string, url: string) => {
    const next = photos.filter(p => p.angle !== angle)
    next.push({ angle, url, createdAt: new Date().toISOString() })
    onChange(next)
  }
  const removePhoto = (angle: string) => onChange(photos.filter(p => p.angle !== angle))

  const requireContext = () => {
    if (!orgId || !registration) {
      alert('Enter the registration first, then add walk-around photos.')
      return false
    }
    return true
  }

  // Shared upload path: compress → damage-photos bucket → store URL only.
  const uploadAndSet = async (angle: string, base64: string) => {
    setUploadingAngle(angle)
    try {
      const compressed = await compressImage(base64)
      const url = await uploadDamagePhoto(orgId, registration, `walk_${angle}`, compressed)
      setPhoto(angle, url)
    } catch {
      alert('Photo upload failed — please try again.')
    } finally {
      setUploadingAngle(null)
    }
  }

  const handleGalleryFile = async (angle: string, file: File | undefined | null) => {
    if (!file) return
    if (!requireContext()) return
    const base64 = await fileToDataUrl(file)
    await uploadAndSet(angle, base64)
  }

  const openCamera = (angle: string) => {
    if (!requireContext()) return
    setCameraError(null)
    setCameraReady(false)
    setCameraAngle(angle)
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setCameraAngle(null)
    setCameraReady(false)
    setCameraError(null)
  }

  const snapPhoto = () => {
    if (!videoRef.current || !cameraAngle) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    const base64 = canvas.toDataURL('image/jpeg', 0.85)
    const angle = cameraAngle
    stopCamera()
    void uploadAndSet(angle, base64)
  }

  // getUserMedia lifecycle — mirrors the damage-pin camera. Runs on all
  // platforms (the native Android WebView supports getUserMedia too), so the
  // page never backgrounds and the form is never torn down.
  useEffect(() => {
    if (!cameraAngle) return
    let cancelled = false
    setCameraReady(false)

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera not available in this browser. Check site permissions or try HTTPS.')
      return
    }

    const timeout = setTimeout(() => {
      if (!cancelled && !cameraReady) {
        setCameraError("Camera failed to start. Allow camera access in your browser, then try again.")
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
        if (!cancelled) setCameraError('Camera access denied. Allow camera access in your browser, then try again.')
      })

    return () => { cancelled = true; clearTimeout(timeout) }
  }, [cameraAngle]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      {/* Collapse header */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#f7faf8] dark:hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-[#025940] dark:text-[#b3f243]" />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Walk-around photos</span>
          {takenCount > 0 ? (
            <span className="bg-[#025940] text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
              {takenCount}/{WALKAROUND_ANGLES.length}
            </span>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500">Optional</span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          {readOnly && takenCount === 0 ? (
            <p className="text-xs text-gray-400 italic text-center py-3">No walk-around photos</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {WALKAROUND_ANGLES.map(angle => {
                const photo = byAngle.get(angle.key)
                const busy = uploadingAngle === angle.key
                // Read-only: only render slots that actually have a photo.
                if (readOnly && !photo) return null
                return (
                  <WalkaroundSlot
                    key={angle.key}
                    label={angle.label}
                    photo={photo}
                    busy={busy}
                    readOnly={readOnly}
                    onPreview={() => photo && setPreview(photo)}
                    onCamera={() => openCamera(angle.key)}
                    onGalleryFile={file => handleGalleryFile(angle.key, file)}
                    onRemove={() => removePhoto(angle.key)}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* In-app camera modal */}
      {cameraAngle && (
        <div
          className="fixed inset-0 z-[100000] bg-black flex flex-col"
          onClick={e => { if (e.target === e.currentTarget) stopCamera() }}
        >
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 pt-4 pb-2">
            <span className="text-white/90 text-sm font-semibold">{angleLabel(cameraAngle)}</span>
            <button
              type="button"
              onClick={stopCamera}
              className="w-10 h-10 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-colors"
              aria-label="Close camera"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

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
              {!cameraReady && (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="w-10 h-10 text-white/70 animate-spin" />
                </div>
              )}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${cameraReady ? '' : 'hidden'}`}
              />
              {cameraReady && (
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center pb-10 pt-4 bg-gradient-to-t from-black/60 to-transparent">
                  <button
                    type="button"
                    onClick={snapPhoto}
                    className="rounded-full bg-white border-[5px] border-white/40 shadow-2xl hover:scale-105 active:scale-90 transition-transform"
                    style={{ width: 72, height: 72 }}
                    aria-label="Take photo"
                  >
                    <span className="block w-full h-full rounded-full bg-white" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Fullscreen photo preview */}
      {preview && (
        <div
          className="fixed inset-0 z-[100000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 bg-[#012619] text-white">
              <span className="text-sm font-bold">{angleLabel(preview.angle)}</span>
              <button type="button" onClick={() => setPreview(null)} className="p-1.5 rounded-full hover:bg-white/10" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.url} alt={angleLabel(preview.angle)} className="w-full max-h-[70vh] object-contain bg-black" />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── One angle slot ──────────────────────────────────────────────────────────

function WalkaroundSlot({
  label,
  photo,
  busy,
  readOnly,
  onPreview,
  onCamera,
  onGalleryFile,
  onRemove,
}: {
  label: string
  photo: WalkaroundPhoto | undefined
  busy: boolean
  readOnly: boolean
  onPreview: () => void
  onCamera: () => void
  onGalleryFile: (file: File | null) => void
  onRemove: () => void
}) {
  const galId = useId()

  return (
    <div className="relative">
      <div
        className={`relative aspect-[4/3] rounded-lg border overflow-hidden ${
          photo ? 'border-[#025940]/40' : 'border-dashed border-[#c8d5ce] dark:border-gray-600 bg-[#f7faf8] dark:bg-gray-900/40'
        }`}
      >
        {photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={label}
              className="w-full h-full object-cover cursor-pointer"
              onClick={onPreview}
            />
            <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 bg-[#025940] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              <Check className="w-2.5 h-2.5" />
            </span>
            {!readOnly && (
              <button
                type="button"
                onClick={onRemove}
                title="Remove photo"
                className="absolute top-1 right-1 p-1 rounded-full bg-black/55 hover:bg-red-600 text-white transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-1">
            {busy ? (
              <Loader2 className="w-5 h-5 text-[#025940] animate-spin" />
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onCamera}
                  title="Take photo"
                  className="p-1.5 rounded-lg bg-[#012619] hover:bg-[#025940] text-white transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
                <label
                  htmlFor={galId}
                  title="Choose from gallery"
                  className="p-1.5 rounded-lg bg-white dark:bg-gray-700 border border-[#e2e8e5] dark:border-gray-600 text-[#4a5e54] dark:text-gray-300 hover:border-[#72A68E] cursor-pointer transition-colors"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                </label>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mt-1 text-[10px] font-semibold text-center text-[#4a5e54] dark:text-gray-400 leading-tight">{label}</p>

      {/* Replace controls for a filled slot */}
      {photo && !readOnly && !busy && (
        <div className="mt-1 flex items-center justify-center gap-1.5">
          <button type="button" onClick={onCamera} title="Retake" className="text-[10px] font-semibold text-[#025940] dark:text-[#b3f243] hover:underline">Retake</button>
          <span className="text-gray-300">·</span>
          <label htmlFor={galId} title="Replace from gallery" className="text-[10px] font-semibold text-[#025940] dark:text-[#b3f243] hover:underline cursor-pointer">Gallery</label>
        </div>
      )}

      {/* Gallery picker (no `capture`, so it opens the gallery — same as the
          damage-pin gallery, which is safe). */}
      <input
        id={galId}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={e => { onGalleryFile(e.target.files?.[0] ?? null); e.target.value = '' }}
      />
    </div>
  )
}

// ─── util ────────────────────────────────────────────────────────────────────

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default WalkaroundPhotos
