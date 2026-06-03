// src/components/stock/BarcodeScanner.tsx
// ✅ BARCODE SCANNER: Manual/Physical scanner DEFAULT, Camera as BACKUP
// Supports all common barcode formats, responsive design, brand colors

'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Camera, X, Scan, Keyboard, Smartphone } from 'lucide-react'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

interface BarcodeScannerProps {
  isOpen: boolean
  onClose: () => void
  onScan: (barcode: string) => void
  mode: 'in' | 'out'
}

export function BarcodeScanner({ isOpen, onClose, onScan, mode }: BarcodeScannerProps) {
  const t = useT()
  // 🔥 CHANGED: Default to 'manual' instead of 'camera'
  const [scanMethod, setScanMethod] = useState<'camera' | 'manual'>('manual')
  const [manualInput, setManualInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scannerRef = useRef<any>(null)

  // For handheld scanner mode (keyboard input)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && scanMethod === 'camera') {
      startCameraScanning()
    } else {
      stopCameraScanning()
    }

    return () => {
      stopCameraScanning()
    }
  }, [isOpen, scanMethod])

  // Auto-focus input for handheld scanner
  useEffect(() => {
    if (isOpen && scanMethod === 'manual' && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen, scanMethod])

  const startCameraScanning = async () => {
    setError(null)
    setScanning(true)

    try {
      // Dynamically import html5-qrcode to avoid SSR issues
      const { Html5Qrcode } = await import('html5-qrcode')
      
      const scanner = new Html5Qrcode('barcode-reader')
      scannerRef.current = scanner

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        formatsToSupport: [
          0,  // QR_CODE
          1,  // AZTEC
          2,  // CODABAR
          3,  // CODE_39
          4,  // CODE_93
          5,  // CODE_128
          6,  // DATA_MATRIX
          7,  // MAXICODE
          8,  // ITF
          9,  // EAN_13
          10, // EAN_8
          11, // PDF_417
          12, // RSS_14
          13, // RSS_EXPANDED
          14, // UPC_A
          15, // UPC_E
          16, // UPC_EAN_EXTENSION
        ]
      }

      await scanner.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          handleScan(decodedText)
          stopCameraScanning()
        },
        (errorMessage) => {
          // Scanning errors are normal, don't show to user
        }
      )

      setScanning(true)
    } catch (err) {
      logger.error('Camera scanning error:', err)
      const errorMessage = err instanceof Error ? err.message : String(err)
      
      // Provide more specific error messages
      if (errorMessage.includes('NotAllowedError') || errorMessage.includes('Permission denied')) {
        setError(t('stock.scanner.errDenied'))
      } else if (errorMessage.includes('NotFoundError')) {
        setError(t('stock.scanner.errNoCamera'))
      } else if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
        setError(t('stock.scanner.errHttps'))
      } else {
        setError(t('stock.scanner.errGeneric'))
      }
      setScanning(false)
    }
  }

  const stopCameraScanning = async () => {
    try {
      if (scannerRef.current) {
        const scanner = scannerRef.current
        if (scanner.isScanning) {
          await scanner.stop()
        }
        scannerRef.current = null
      }
    } catch (err) {
      logger.error('Error stopping scanner:', err)
    }
    setScanning(false)
  }

  const handleScan = (barcode: string) => {
    if (barcode && barcode.trim()) {
      const cleanBarcode = barcode.trim()
      logger.log('📸 Barcode scanned:', cleanBarcode)
      
      // Call onScan first
      onScan(cleanBarcode)
      
      // Clear input
      setManualInput('')
      
      // Small delay before closing to ensure state updates on mobile
      setTimeout(() => {
        onClose()
      }, 100)
    }
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualInput.trim()) {
      handleScan(manualInput.trim())
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleManualSubmit(e)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg border-2 border-[#025940]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-[#012619] to-[#025940]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#b3f243] flex items-center justify-center">
              <Scan className="w-5 h-5 text-[#012619]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {t(mode === 'in' ? 'stock.scanner.scanIn' : 'stock.scanner.scanOut')}
              </h3>
              <p className="text-xs text-[#C5D9D0]">
                {t(mode === 'in' ? 'stock.scanner.subAddStock' : 'stock.scanner.subRemoveStock')}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCameraScanning()
              onClose()
            }}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* 🔥 CHANGED: Manual/Scanner first, Camera second */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-2">
            <button
              onClick={() => {
                stopCameraScanning()
                setScanMethod('manual')
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                scanMethod === 'manual'
                  ? 'bg-gradient-to-r from-[#025940] to-[#012619] text-[#b3f243] border-2 border-[#025940]'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-2 border-gray-200 dark:border-gray-600'
              }`}
            >
              <Keyboard className="w-4 h-4" />
              {t('stock.scanner.manualScanner')}
            </button>
            <button
              onClick={() => {
                stopCameraScanning()
                setScanMethod('camera')
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                scanMethod === 'camera'
                  ? 'bg-gradient-to-r from-[#025940] to-[#012619] text-[#b3f243] border-2 border-[#025940]'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-2 border-gray-200 dark:border-gray-600'
              }`}
            >
              <Camera className="w-4 h-4" />
              {t('stock.scanner.camera')}
            </button>
          </div>
        </div>

        {/* 🔥 CHANGED: Manual content first, Camera content second */}
        <div className="p-5">
          {scanMethod === 'manual' ? (
            <div className="space-y-4">
              {/* Manual / Handheld Scanner Input */}
              <form onSubmit={handleManualSubmit} className="space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    {t('stock.scanner.enterScan')}
                  </label>
                  <input
                    ref={inputRef}
                    type="text"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value.toUpperCase())}
                    onKeyPress={handleKeyPress}
                    placeholder={t('stock.scanner.manualPlaceholder')}
                    className="w-full px-4 py-3 rounded-xl border-2 border-[#72A68E] bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-[#025940] focus:ring-2 focus:ring-[#025940]/20 outline-none transition-all font-mono text-lg"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={!manualInput.trim()}
                  className={`w-full px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    manualInput.trim()
                      ? 'bg-gradient-to-r from-[#025940] to-[#012619] text-[#b3f243] hover:shadow-lg hover:shadow-[#025940]/30'
                      : 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {t(mode === 'in' ? 'stock.scanner.findAddStock' : 'stock.scanner.findRemoveStock')}
                </button>
              </form>

              {/* Help text for handheld scanner */}
              <div className="bg-[#C5D9D0]/20 rounded-xl p-4 border border-[#72A68E]">
                <div className="flex items-start gap-3">
                  <Smartphone className="w-5 h-5 text-[#025940] flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      {t('stock.scanner.handheldHeading')}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {t('stock.scanner.handheldBody')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Camera viewfinder */}
              <div className="relative w-full aspect-square bg-black rounded-xl overflow-hidden border-4 border-[#025940]">
                <div id="barcode-reader" className="w-full h-full" />
                
                {/* Scanning indicator */}
                {scanning && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <div className="text-center">
                      <div className="w-16 h-16 border-4 border-[#b3f243] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-white text-sm font-semibold">{t('stock.scanner.scanning')}</p>
                      <p className="text-[#C5D9D0] text-xs mt-1">{t('stock.scanner.pointCamera')}</p>
                    </div>
                  </div>
                )}

                {/* Error overlay */}
                {error && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-amber-900/95 to-orange-900/95 p-4">
                    <div className="text-center max-w-xs">
                      <Camera className="w-12 h-12 text-white mx-auto mb-3" />
                      <p className="text-white text-sm font-semibold mb-2">{t('stock.scanner.cameraUnavailable')}</p>
                      <p className="text-white/90 text-xs leading-relaxed">{error}</p>
                      <button
                        onClick={() => setScanMethod('manual')}
                        className="mt-4 px-4 py-2 bg-white text-orange-900 rounded-lg text-xs font-bold hover:bg-gray-100 transition-colors"
                      >
                        {t('stock.scanner.useManualInstead')}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Help text */}
              <div className="bg-[#C5D9D0]/20 rounded-xl p-3 border border-[#72A68E]">
                <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
                  {t('stock.scanner.positionBarcode')}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer tip */}
        <div className="px-5 pb-5">
          <div className="bg-gradient-to-r from-[#012619]/5 to-[#025940]/5 rounded-xl p-3 border border-[#72A68E]/30">
            <p className="text-xs text-center text-gray-600 dark:text-gray-400">
              {t('stock.scanner.tip')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}