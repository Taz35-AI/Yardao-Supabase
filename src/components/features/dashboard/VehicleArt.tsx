// src/components/features/dashboard/VehicleArt.tsx
// Renders a make/model SVG illustration, recoloured to the vehicle's colour.
//
// Art files live in public/Vehicles/ and are linked to a vehicle purely by
// NAME (see src/lib/vehicleArt/match.ts + the generated manifest), so new files
// are drop-in. The art uses a 2-colour convention: a dark "body" fill and a
// light "detail/line" fill (windows, grille, character lines). We recolour by
// luminance — every dark fill becomes the vehicle's colour, every light fill
// becomes a contrasting line colour (white on dark/coloured cars; dark on
// white/silver cars so the art never vanishes). The legacy bmw3series.svg (a
// grayscale render) falls into the same rule cleanly; its one full-canvas
// background is stripped.
//
// If no art matches, the component renders nothing.
'use client'

import React from 'react'
import { matchVehicleArtFile } from '@/lib/vehicleArt/match'

// ---------------------------------------------------------------------------
// make + model  ->  svg url (pure name-based, via the manifest matcher)
// ---------------------------------------------------------------------------
export function resolveVehicleArt(make?: string, model?: string): string | null {
  const file = matchVehicleArtFile(make, model)
  return file ? `/Vehicles/${encodeURIComponent(file)}.svg` : null
}

// Generic car art used as a fallback when a vehicle's make/model has no
// dedicated file. Recoloured exactly like the real art.
const GENERIC_ART_SRC = '/Vehicles/_generic.svg'

// ---------------------------------------------------------------------------
// colour name  ->  body RGB
// ---------------------------------------------------------------------------
const COLOUR_MAP: Record<string, [number, number, number]> = {
  white: [252, 253, 255],
  'pearl white': [252, 253, 255],
  silver: [205, 209, 216],
  grey: [140, 145, 152],
  gray: [140, 145, 152],
  'dark grey': [90, 95, 102],
  'dark gray': [90, 95, 102],
  black: [33, 37, 45],
  blue: [29, 78, 216],
  'light blue': [59, 130, 246],
  'sky blue': [56, 152, 236],
  'dark blue': [30, 58, 138],
  navy: [23, 42, 110],
  red: [206, 30, 30],
  'dark red': [153, 27, 27],
  maroon: [120, 28, 38],
  green: [21, 128, 61],
  'dark green': [20, 83, 45],
  yellow: [234, 179, 8],
  orange: [234, 88, 12],
  gold: [202, 138, 4],
  beige: [206, 188, 154],
  cream: [226, 214, 184],
  bronze: [140, 110, 70],
  brown: [110, 72, 44],
  purple: [120, 50, 180],
  violet: [120, 50, 180],
  pink: [219, 100, 160],
}

function resolveColour(name?: string): [number, number, number] | null {
  if (!name) return null
  const key = name.toLowerCase().trim()
  if (COLOUR_MAP[key]) return COLOUR_MAP[key]
  for (const k of Object.keys(COLOUR_MAP)) {
    if (key.includes(k)) return COLOUR_MAP[k]
  }
  return null
}

// ---------------------------------------------------------------------------
// SVG fetch + recolour cache (module-level: each file fetched/transformed once)
// ---------------------------------------------------------------------------
function hexLuminance(hex: string): number {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

const svgCache = new Map<string, Promise<string>>()

function loadSvg(src: string): Promise<string> {
  let p = svgCache.get(src)
  if (!p) {
    p = fetch(src)
      .then((r) => r.text())
      .then((text) => {
        // Parse the viewBox so we can detect full-canvas background fills.
        const vbMatch = text.match(/viewBox="([\d.\s-]+)"/)
        let vbW = 1000
        let vbH = 1000
        if (vbMatch) {
          const parts = vbMatch[1].trim().split(/\s+/).map(Number)
          if (parts.length === 4) {
            vbW = parts[2]
            vbH = parts[3]
          }
        }

        // Process each <path>: dark fills -> body colour; light fills are detail
        // LINES (kept) unless their bbox ~covers the whole canvas, in which case
        // they're a background and get stripped to transparent. This keeps the
        // BMW's fine detail while removing the hidden white backgrounds some of
        // the 2-colour files ship with.
        const out = text.replace(/<path\b[^>]*>/g, (tag) => {
          const fm = tag.match(/fill="(#[0-9a-fA-F]{3,6})"/)
          if (!fm) return tag
          const hex = fm[1]
          if (hexLuminance(hex) < 0.5) {
            // Body fill -> vehicle colour, plus an optional thin outline
            // (enabled only for light/white vehicles via --veh-stroke) so a
            // white car gets crisp black edges instead of vanishing.
            let t = tag.replace(fm[0], `fill="var(--veh-body, ${hex})"`)
            t = t
              .replace(/\sstroke="[^"]*"/gi, '')
              .replace(/\sstroke-width="[^"]*"/gi, '')
              .replace(/\svector-effect="[^"]*"/gi, '')
            t = t.replace(
              '<path',
              '<path stroke="var(--veh-stroke, none)" stroke-width="1" vector-effect="non-scaling-stroke"',
            )
            return t
          }
          // Light fill — background or detail?
          let isBackground = false
          const dm = tag.match(/\bd="([^"]+)"/)
          if (dm) {
            const nums = dm[1].match(/-?\d*\.?\d+/g)
            if (nums && nums.length >= 4) {
              const xs: number[] = []
              const ys: number[] = []
              for (let i = 0; i + 1 < nums.length; i += 2) {
                xs.push(parseFloat(nums[i]))
                ys.push(parseFloat(nums[i + 1]))
              }
              const w = Math.max(...xs) - Math.min(...xs)
              const h = Math.max(...ys) - Math.min(...ys)
              if (w > 0.78 * vbW && h > 0.78 * vbH) isBackground = true
            }
          }
          return isBackground
            ? tag.replace(fm[0], 'fill="none"')
            : tag.replace(fm[0], `fill="var(--veh-line, ${hex})"`)
        }).replace(/\swidth="100%"/i, '')
        return out
      })
    svgCache.set(src, p)
  }
  return p
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface VehicleArtProps {
  make?: string
  model?: string
  colour?: string
  className?: string
  /** Render nothing (not even a placeholder) until the SVG has loaded. */
  hideUntilLoaded?: boolean
  /** When no make/model art matches, fall back to the generic car. */
  fallbackToGeneric?: boolean
}

export const VehicleArt = React.memo(function VehicleArt({
  make,
  model,
  colour,
  className = '',
  hideUntilLoaded = true,
  fallbackToGeneric = false,
}: VehicleArtProps) {
  const matched = resolveVehicleArt(make, model)
  const src = matched || (fallbackToGeneric ? GENERIC_ART_SRC : null)
  const rgb = resolveColour(colour)
  const [svg, setSvg] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!src) {
      setSvg(null)
      return
    }
    let active = true
    loadSvg(src)
      .then((text) => {
        if (active) setSvg(text)
      })
      .catch(() => {
        if (active) setSvg(null)
      })
    return () => {
      active = false
    }
  }, [src])

  if (!src) return null
  if (!svg && hideUntilLoaded) return null

  // Body (the dark fills) = the vehicle colour. For light/white vehicles the
  // body would vanish, so we add a thin black outline and switch the detail
  // lines to black; coloured/dark vehicles keep white detail and no outline.
  let styleVars: React.CSSProperties | undefined
  if (rgb) {
    const [r, g, b] = rgb
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    const isLight = luminance > 0.72
    styleVars = {
      '--veh-body': `rgb(${r}, ${g}, ${b})`,
      '--veh-line': isLight ? '#23262b' : '#ffffff',
      '--veh-stroke': isLight ? '#23262b' : 'none',
    } as React.CSSProperties
  }

  return (
    <div className={className} style={styleVars} aria-hidden="true">
      {svg && (
        <div
          className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
          // Soft silhouette shadow (follows the car shape, not a box) so a pure
          // white vehicle still reads against a light surface.
          style={{ filter: 'drop-shadow(0 1px 1px rgba(15, 23, 20, 0.18))' }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </div>
  )
})
