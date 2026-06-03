// src/components/branch-overview/BranchMapView.tsx
// REWRITTEN - Using portal-like approach to prevent React from touching Google Maps DOM

'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Branch } from '@/types/branch'
import { BranchData } from '@/types/branch-overview'
import { MapPin, Maximize2, Minimize2, Loader2 } from 'lucide-react'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

// Extend Window interface locally
declare global {
  interface Window {
    google?: any
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

let googleMapsLoaded = false
let googleMapsLoading = false
const loadCallbacks: Array<() => void> = []

function loadGoogleMaps(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (googleMapsLoaded && window.google?.maps) {
      resolve()
      return
    }

    if (googleMapsLoading) {
      loadCallbacks.push(resolve)
      return
    }

    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      googleMapsLoading = true
      const checkInterval = setInterval(() => {
        if (window.google?.maps) {
          clearInterval(checkInterval)
          googleMapsLoaded = true
          googleMapsLoading = false
          resolve()
          loadCallbacks.forEach(cb => cb())
          loadCallbacks.length = 0
        }
      }, 100)
      setTimeout(() => clearInterval(checkInterval), 10000)
      return
    }

    googleMapsLoading = true
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`
    script.async = true
    script.onload = () => {
      googleMapsLoaded = true
      googleMapsLoading = false
      resolve()
      loadCallbacks.forEach(cb => cb())
      loadCallbacks.length = 0
    }
    script.onerror = () => {
      googleMapsLoading = false
      reject(new Error('Failed to load Google Maps'))
    }
    document.head.appendChild(script)
  })
}

export function BranchMapView({ branches, branchData, onBranchClick }: BranchMapViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const mapDivRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const t = useT()

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const validBranches = branches.filter(b => b.latitude && b.longitude)

  // Create map div outside of React's control
  useEffect(() => {
    if (!wrapperRef.current || mapDivRef.current) return

    // Create a div that React will never touch
    const mapDiv = document.createElement('div')
    mapDiv.style.width = '100%'
    mapDiv.style.height = '100%'
    mapDiv.style.borderRadius = '0.75rem'
    mapDivRef.current = mapDiv
    wrapperRef.current.appendChild(mapDiv)

    return () => {
      // Clean up markers first
      markersRef.current.forEach(marker => {
        try {
          marker.setMap(null)
        } catch (e) {}
      })
      markersRef.current = []

      // Clear map reference
      mapRef.current = null

      // Remove the div we created
      if (mapDivRef.current && wrapperRef.current) {
        try {
          wrapperRef.current.removeChild(mapDivRef.current)
        } catch (e) {}
        mapDivRef.current = null
      }
    }
  }, [])

  // Load Google Maps and initialize
  useEffect(() => {
    if (!apiKey) {
      setError(t('branchOverview.map.errNoApiKey'))
      setIsLoading(false)
      return
    }

    if (validBranches.length === 0) {
      setError(t('branchOverview.map.errNoAddresses'))
      setIsLoading(false)
      return
    }

    if (!mapDivRef.current) return

    let mounted = true

    loadGoogleMaps(apiKey)
      .then(() => {
        if (!mounted || !mapDivRef.current) return

        // Create bounds
        const bounds = new window.google!.maps.LatLngBounds()
        validBranches.forEach(branch => {
          bounds.extend(new window.google!.maps.LatLng(branch.latitude!, branch.longitude!))
        })

        // Create map
        const map = new window.google!.maps.Map(mapDivRef.current, {
          zoom: 10,
          center: bounds.getCenter(),
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: false,
          styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }]
        })

        mapRef.current = map
        map.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 })

        // Create markers
        const newMarkers: any[] = []
        validBranches.forEach(branch => {
          const branchInfo = branchData.find(bd => bd.branchId === branch.slug)
          const vehicleCount = branchInfo?.totalVehicles || 0
          const inYard = branchInfo?.vehiclesInYard || 0
          const outOnHire = branchInfo?.vehiclesOutOnHire || 0
          const markerColor = branch.isMain ? MARKER_COLORS.main : vehicleCount > 0 ? MARKER_COLORS.branch : MARKER_COLORS.inactive

          const marker = new window.google!.maps.Marker({
            position: { lat: branch.latitude!, lng: branch.longitude! },
            map,
            icon: {
              path: window.google!.maps.SymbolPath.CIRCLE,
              scale: 12,
              fillColor: markerColor,
              fillOpacity: 0.9,
              strokeColor: '#ffffff',
              strokeWeight: 3
            },
            title: branch.name,
            animation: window.google!.maps.Animation.DROP
          })

          const infoWindow = new window.google!.maps.InfoWindow({
            content: `
              <div style="padding: 12px; min-width: 200px; font-family: system-ui;">
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
                  <button onclick="window.branchMapClickHandler?.('${branch.slug}')" 
                    style="margin-top: 12px; width: 100%; padding: 8px; background: #025940; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">
                    ${t('branchOverview.map.infoViewDetails')}
                  </button>
                ` : ''}
              </div>
            `
          })

          marker.addListener('click', () => infoWindow.open(map, marker))
          newMarkers.push(marker)
        })

        markersRef.current = newMarkers

        if (mounted) {
          setMapReady(true)
          setIsLoading(false)
          setError(null)
        }
      })
      .catch((err) => {
        logger.error('Map error:', err)
        if (mounted) {
          setError(t('branchOverview.map.errFailed'))
          setIsLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [apiKey, validBranches.length, branchData])

  // Click handler
  useEffect(() => {
    (window as any).branchMapClickHandler = (branchId: string) => onBranchClick?.(branchId)
    return () => { delete (window as any).branchMapClickHandler }
  }, [onBranchClick])

  const handleReset = () => {
    if (!mapRef.current || validBranches.length === 0) return
    const bounds = new window.google!.maps.LatLngBounds()
    validBranches.forEach(b => bounds.extend(new window.google!.maps.LatLng(b.latitude!, b.longitude!)))
    mapRef.current.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 })
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
      {/* Wrapper that React controls */}
      <div className={`relative bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden ${isFullscreen ? 'h-screen' : 'h-[400px] sm:h-[500px]'}`}>
        {/* Map container that React NEVER touches after creation */}
        <div ref={wrapperRef} className="absolute inset-0" />
        
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
          <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
            <button onClick={handleReset} className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700" title={t('branchOverview.map.resetView')}>
              <MapPin className="w-5 h-5 text-[#025940] dark:text-[#72A68E]" />
            </button>
            <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700">
              {isFullscreen ? <Minimize2 className="w-5 h-5 text-[#025940] dark:text-[#72A68E]" /> : <Maximize2 className="w-5 h-5 text-[#025940] dark:text-[#72A68E]" />}
            </button>
          </div>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 text-sm z-10">
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