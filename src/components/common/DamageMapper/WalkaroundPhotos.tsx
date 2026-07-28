// src/components/common/DamageMapper/WalkaroundPhotos.tsx
// Collapsible "walk-around" photo section shown alongside the damage diagram.
// A fixed set of standard vehicle angles (front, sides, 3/4 angles, rear); each
// slot holds ONE optional photo that can be added / replaced / removed from the
// camera or the gallery.
//
// Storage: photos upload to the `damage-photos` bucket on capture and only the
// URL is kept in state — never base64 — so the walkaround_photos jsonb column
// stays tiny (same lesson that un-crashed the DB with damage pins).

'use client'

import { useId, useRef, useState } from 'react'
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

  const byAngle = new Map(photos.map(p => [p.angle, p]))
  const takenCount = WALKAROUND_ANGLES.filter(a => byAngle.has(a.key)).length

  const setPhoto = (angle: string, url: string) => {
    const next = photos.filter(p => p.angle !== angle)
    next.push({ angle, url, createdAt: new Date().toISOString() })
    onChange(next)
  }
  const removePhoto = (angle: string) => onChange(photos.filter(p => p.angle !== angle))

  const handleFile = async (angle: string, file: File | undefined | null) => {
    if (!file) return
    if (!orgId || !registration) {
      alert('Enter the registration first, then add walk-around photos.')
      return
    }
    setUploadingAngle(angle)
    try {
      const base64 = await fileToDataUrl(file)
      const compressed = await compressImage(base64)
      const url = await uploadDamagePhoto(orgId, registration, `walk_${angle}`, compressed)
      setPhoto(angle, url)
    } catch {
      alert('Photo upload failed — please try again.')
    } finally {
      setUploadingAngle(null)
    }
  }

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
                    angleKey={angle.key}
                    label={angle.label}
                    photo={photo}
                    busy={busy}
                    readOnly={readOnly}
                    onPreview={() => photo && setPreview(photo)}
                    onFile={file => handleFile(angle.key, file)}
                    onRemove={() => removePhoto(angle.key)}
                  />
                )
              })}
            </div>
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
  angleKey,
  label,
  photo,
  busy,
  readOnly,
  onPreview,
  onFile,
  onRemove,
}: {
  angleKey: string
  label: string
  photo: WalkaroundPhoto | undefined
  busy: boolean
  readOnly: boolean
  onPreview: () => void
  onFile: (file: File | null) => void
  onRemove: () => void
}) {
  const camId = useId()
  const galId = useId()
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)

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
                <label
                  htmlFor={camId}
                  title="Take photo"
                  className="p-1.5 rounded-lg bg-[#012619] hover:bg-[#025940] text-white cursor-pointer transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                </label>
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
          <label htmlFor={camId} title="Retake" className="text-[10px] font-semibold text-[#025940] dark:text-[#b3f243] hover:underline cursor-pointer">Retake</label>
          <span className="text-gray-300">·</span>
          <label htmlFor={galId} title="Replace from gallery" className="text-[10px] font-semibold text-[#025940] dark:text-[#b3f243] hover:underline cursor-pointer">Gallery</label>
        </div>
      )}

      {/* Hidden inputs. `capture` opens the camera directly on mobile. */}
      <input
        id={camId}
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={e => { onFile(e.target.files?.[0] ?? null); e.target.value = '' }}
      />
      <input
        id={galId}
        ref={galRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={e => { onFile(e.target.files?.[0] ?? null); e.target.value = '' }}
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
