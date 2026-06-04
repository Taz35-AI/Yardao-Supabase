// src/components/branch-overview/BranchMapView.tsx
// Free, keyless map rendering via Leaflet + OpenStreetMap tiles.
// (Geocoding — address → GPS — is handled separately by the free OSM/Nominatim
//  Edge Function; this component only renders the resulting branch pins.)

'use client'

import React, { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { Branch } from '@/types/branch'
import { BranchData } from '@/types/branch-overview'
import { MapPin, Maximize2, Minimize2, Loader2 } from 'lucide-react'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

declare global {
  interface Window {
    branchMapClickHandler?: (branchId: string) => void
  }
}

interface BranchMapViewProps {
  branches: Branch[]
  branchData: BranchData[]
  onBranchClick?: (branchId: string) => void
}

const MARKER_COLORS = {
  main: '#025940',
  branch: '#72A68E',
  inactive: '#C5D9D0'
}

export function BranchMapView({ branches, branchData, onBranchClick }: BranchMapViewProps) {
  const mapElRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markersLayerRef = useRef<any>(null)
  const boundsRef = useRef<any>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const t = useT()

  const validBranches = branches.filter(b => b.latitude && b.longitude)
  // Stable signature so the effect only re-runs when the pins actually change.
  const branchSignature = validBranches
    .map(b => `${b.slug}:${b.latitude},${b.longitude}`)
    .join('|')

  // Expose the popup "view details" click bridge to the global scope.
  useEffect(() => {
    window.branchMapClickHandler = (branchId: string) => onBranchClick?.(branchId)
    return () => { delete window.branchMapClickHandler }
  }, [onBranchClick])

  // Build / update the Leaflet map.
  useEffect(() => {
    if (validBranches.length === 0) {
      setError(t('branchOverview.map.errNoAddresses'))
      setIsLoading(false)
      return
    }

    let mounted = true
    setError(null)
    setIsLoading(true)

    ;(async () => {
      try {
        const L: any = (await import('leaflet')).default
        if (!mounted || !mapElRef.current) return

        // Create the map once.
        if (!mapRef.current) {
          mapRef.current = L.map(mapElRef.current, {
            zoomControl: true,
            scrollWheelZoom: true,
            attributionControl: true,
          })
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
          }).addTo(mapRef.current)
          markersLayerRef.current = L.layerGroup().addTo(mapRef.current)
        }

        const map = mapRef.current
        markersLayerRef.current.clearLayers()

        const latLngs: any[] = []
        validBranches.forEach(branch => {
          const branchInfo = branchData.find(bd => bd.branchId === branch.slug)
          const vehicleCount = branchInfo?.totalVehicles || 0
          const inYard = branchInfo?.vehiclesInYard || 0
          const outOnHire = branchInfo?.vehiclesOutOnHire || 0
          const markerColor = branch.isMain
            ? MARKER_COLORS.main
            : vehicleCount > 0 ? MARKER_COLORS.branch : MARKER_COLORS.inactive

          const latLng: [number, number] = [branch.latitude!, branch.longitude!]
          latLngs.push(latLng)

          const marker = L.circleMarker(latLng, {
            radius: 10,
            fillColor: markerColor,
            color: '#ffffff',
            weight: 3,
            opacity: 1,
            fillOpacity: 0.9,
          })

          marker.bindPopup(`
            <div style="padding: 4px; min-width: 200px; font-family: system-ui;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <div style="width: 12px; height: 12px; border-radius: 50%; background: ${markerColor};"></div>
                <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #012619;">${branch.name}</h3>
                ${branch.isMain ? `<span style="background: #3b82f6; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">${t('branchOverview.map.infoMain')}</span>` : ''}
              </div>
              ${branch.address ? `<p style="margin: 4px 0; font-size: 13px; color: #4b5563;">📍 ${branch.address}</p>` : ''}
              <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                  <span style="font-size: 13px; color: #6b7280;">${t('branchOverview.map.infoTotal')}</span>
                  <span style="font-size: 14px; font-weight: 600; color: #025940;">${vehicleCount}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                  <span style="font-size: 13px; color: #6b7280;">${t('branchOverview.map.infoInYard')}</span>
                  <span style="font-size: 14px; font-weight: 600; color: #72A68E;">${inYard}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="font-size: 13px; color: #6b7280;">${t('branchOverview.map.infoOutOnHire')}</span>
                  <span style="font-size: 14px; font-weight: 600; color: #f59e0b;">${outOnHire}</span>
                </div>
              </div>
              ${vehicleCount > 0 ? `
                <button onclick="window.branchMapClickHandler && window.branchMapClickHandler('${branch.slug}')"
                  style="margin-top: 12px; width: 100%; padding: 8px; background: #025940; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">
                  ${t('branchOverview.map.infoViewDetails')}
                </button>
              ` : ''}
            </div>
          `)

          markersLayerRef.current.addLayer(marker)
        })

        const bounds = L.latLngBounds(latLngs)
        boundsRef.current = bounds
        if (latLngs.length === 1) {
          map.setView(latLngs[0], 13)
        } else {
          map.fitBounds(bounds, { padding: [50, 50] })
        }

        if (mounted) {
          setMapReady(true)
          setIsLoading(false)
          setError(null)
        }
      } catch (err) {
        logger.error('Map error:', err)
        if (mounted) {
          setError(t('branchOverview.map.errFailed'))
          setIsLoading(false)
        }
      }
    })()

    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchSignature, branchData])

  // Tear the map down on unmount.
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        try { mapRef.current.remove() } catch (e) {}
        mapRef.current = null
      }
    }
  }, [])

  // Leaflet needs a size recalculation when the container resizes (fullscreen).
  useEffect(() => {
    if (!mapRef.current) return
    const id = setTimeout(() => {
      try {
        mapRef.current.invalidateSize()
        if (boundsRef.current) mapRef.current.fitBounds(boundsRef.current, { padding: [50, 50] })
      } catch (e) {}
    }, 200)
    return () => clearTimeout(id)
  }, [isFullscreen])

  const handleReset = () => {
    if (!mapRef.current || !boundsRef.current) return
    mapRef.current.fitBounds(boundsRef.current, { padding: [50, 50] })
  }

  if (error) {
    return (
      <div className="w-full h-[400px] bg-gray-50 dark:bg-gray-900 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center">
        <div className="text-center px-4">
          <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400 font-medium">{error}</p>
          <p className="text-sm text-gray-500 mt-2">{t('branchOverview.map.errHint')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative ${isFullscreen ? 'fixed inset-0 z-50 bg-white dark:bg-gray-900' : ''}`}>
      <div className={`relative bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden ${isFullscreen ? 'h-screen' : 'h-[400px] sm:h-[500px]'}`}>
        {/* Leaflet renders into this div. */}
        <div ref={mapElRef} className="absolute inset-0 z-0" />

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 dark:bg-gray-900/90 z-10">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-[#025940] animate-spin mx-auto mb-3" />
              <p className="text-gray-600 dark:text-gray-400 font-medium">{t('branchOverview.map.loading')}</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      {mapReady && (
        <>
          <div className="absolute top-4 right-4 flex flex-col gap-2 z-[400]">
            <button onClick={handleReset} className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700" title={t('branchOverview.map.resetView')}>
              <MapPin className="w-5 h-5 text-[#025940] dark:text-[#72A68E]" />
            </button>
            <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700">
              {isFullscreen ? <Minimize2 className="w-5 h-5 text-[#025940] dark:text-[#72A68E]" /> : <Maximize2 className="w-5 h-5 text-[#025940] dark:text-[#72A68E]" />}
            </button>
          </div>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 text-sm z-[400]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-[#025940]" />
              <span className="text-gray-700 dark:text-gray-300">{t('branchOverview.map.legendMain')}</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-[#72A68E]" />
              <span className="text-gray-700 dark:text-gray-300">{t('branchOverview.map.legendOther')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#C5D9D0]" />
              <span className="text-gray-700 dark:text-gray-300">{t('branchOverview.map.legendNone')}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
