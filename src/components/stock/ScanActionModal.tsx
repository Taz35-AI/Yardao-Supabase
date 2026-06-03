// src/components/stock/ScanActionModal.tsx
// ✅ SCAN ACTION MODAL: Shows part details after scanning, allows add/remove with vehicle selection
// Handles both existing parts and new parts that need to be created

'use client'

import React, { useState, useEffect } from 'react'
import { X, Package, AlertTriangle, Plus, Minus, CheckCircle, Search, Truck } from 'lucide-react'
import { StockPart } from '@/types/stock'
import { Vehicle } from '@/lib/firestore'
import { logger } from '@/lib/logger'
import { normalizeReg, isRegUsable } from '@/lib/utils/registration'
import { useT } from '@/lib/i18n'

interface ScanActionModalProps {
  isOpen: boolean
  onClose: () => void
  scannedBarcode: string
  part: StockPart | null
  mode: 'in' | 'out'
  onAddStock: (quantity: number) => Promise<void>
  onRemoveStock: (quantity: number, vehicleId: string, vehicleReg: string) => Promise<void>
  onCreateNewPart: () => void
  vehicles?: Vehicle[]
}

export function ScanActionModal({
  isOpen,
  onClose,
  scannedBarcode,
  part,
  mode,
  onAddStock,
  onRemoveStock,
  onCreateNewPart,
  vehicles = []
}: ScanActionModalProps) {
  const t = useT()
  const [quantity, setQuantity] = useState<string>('1')
  const [selectedVehicle, setSelectedVehicle] = useState<string>('')
  // Custom (non-fleet) vehicle: a typed registration with no fleet doc.
  // Mutually exclusive with selectedVehicle. Parts get scanned out keyed
  // by the normalised reg (see stockService.removePartQuantity).
  const [customReg, setCustomReg] = useState<string>('')
  const [vehicleSearch, setVehicleSearch] = useState('')
  const [processing, setProcessing] = useState(false)
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuantity('1')
      setSelectedVehicle('')
      setCustomReg('')
      setVehicleSearch('')
      setProcessing(false)
    }
  }, [isOpen])

  // Filter vehicles based on search
  const filteredVehicles = vehicles.filter(v => 
    v.registration.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
    `${v.make} ${v.model}`.toLowerCase().includes(vehicleSearch.toLowerCase())
  )

  const handleSubmit = async () => {
    const qty = parseFloat(quantity)
    if (isNaN(qty) || qty <= 0) {
      return
    }

    setProcessing(true)
    try {
      if (mode === 'in') {
        await onAddStock(qty)
      } else {
        // 'out' mode needs either a fleet vehicle OR a custom reg.
        if (selectedVehicle) {
          const vehicle = vehicles.find(v => v.id === selectedVehicle)
          if (!vehicle) {
            setProcessing(false)
            return
          }
          await onRemoveStock(qty, vehicle.id!, vehicle.registration)
        } else if (isRegUsable(customReg)) {
          // Custom vehicle — empty vehicleId; stockService keys the
          // usage row by the normalised registration instead.
          await onRemoveStock(qty, '', normalizeReg(customReg))
        } else {
          setProcessing(false)
          return
        }
      }
      onClose()
    } catch (error) {
      logger.error('Error processing stock:', error)
    } finally {
      setProcessing(false)
    }
  }

  const selectVehicle = (vehicleId: string) => {
    setSelectedVehicle(vehicleId)
    setCustomReg('')
    const vehicle = vehicles.find(v => v.id === vehicleId)
    if (vehicle) {
      setVehicleSearch(vehicle.registration)
    }
    setShowVehicleDropdown(false)
  }

  const selectCustomReg = (rawReg: string) => {
    const reg = normalizeReg(rawReg)
    if (!reg) return
    setCustomReg(reg)
    setSelectedVehicle('')
    setVehicleSearch(reg)
    setShowVehicleDropdown(false)
  }

  if (!isOpen) return null

  // Part not found - offer to create
  if (!part) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border-2 border-amber-500">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-amber-500 to-orange-500">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{t('stock.scanAction.notFound')}</h3>
                <p className="text-xs text-white/80">{t('stock.scanAction.createNew')}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                <strong>{t('stock.scanAction.scannedBarcode')}</strong>
              </p>
              <p className="text-lg font-mono font-bold text-amber-600 dark:text-amber-400">
                {scannedBarcode}
              </p>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
              {t('stock.scanAction.notExistPrompt')}
            </p>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
              >
                {t('stock.btn.cancel')}
              </button>
              <button
                onClick={() => {
                  onCreateNewPart()
                  onClose()
                }}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-[#025940] to-[#012619] text-[#b3f243] hover:shadow-lg hover:shadow-[#025940]/30 transition-all"
              >
                {t('stock.scanAction.createPart')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Part found - show add/remove form
  const currentStock = part.quantity
  const isLowStock = currentStock < part.restockTarget
  const canRemove = mode === 'out' && currentStock > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border-2 border-[#025940]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-[#012619] to-[#025940]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#b3f243] flex items-center justify-center">
              {mode === 'in' ? (
                <Plus className="w-5 h-5 text-[#012619]" />
              ) : (
                <Minus className="w-5 h-5 text-[#012619]" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {t(mode === 'in' ? 'stock.scanAction.addStock' : 'stock.scanAction.removeStock')}
              </h3>
              <p className="text-xs text-[#C5D9D0]">
                {t(mode === 'in' ? 'stock.scanAction.subIncrease' : 'stock.scanAction.subUseVehicle')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Part Details */}
        <div className="p-5 space-y-4">
          {/* Part Info Card */}
          <div className="bg-gradient-to-br from-[#C5D9D0]/20 to-white dark:from-[#025940]/10 dark:to-gray-800 rounded-xl p-4 border border-[#72A68E]">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h4 className="text-base font-bold text-gray-900 dark:text-white mb-1">
                  {part.partName}
                </h4>
                <p className="text-xs font-mono text-[#72A68E] dark:text-[#72A68E] font-semibold">
                  {part.partNumber}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {part.makeModel}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('stock.scanAction.currentStock')}</p>
                <p className={`text-2xl font-extrabold font-mono ${
                  isLowStock ? 'text-amber-600' : 'text-[#025940] dark:text-[#72A68E]'
                }`}>
                  {part.unit === 'liters' ? `${currentStock.toFixed(1)}L` : Math.round(currentStock)}
                </p>
              </div>
            </div>

            {/* Low stock warning */}
            {isLowStock && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold">
                  {t('stock.scanAction.lowStock', { target: part.restockTarget, unit: part.unit })}
                </p>
              </div>
            )}
          </div>

          {/* Quantity Input */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              {t(part.unit === 'liters' ? 'stock.scanAction.quantityLiters' : 'stock.scanAction.quantityPieces')}
            </label>
            <input
              type="number"
              step={part.unit === 'liters' ? '0.1' : '1'}
              min="0.1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-[#72A68E] bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-[#025940] focus:ring-2 focus:ring-[#025940]/20 outline-none transition-all text-lg font-mono text-center"
              autoFocus
            />
          </div>

          {/* Vehicle Selection (only for 'out' mode) */}
          {mode === 'out' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t('stock.scanAction.selectVehicle')}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={vehicleSearch}
                  onChange={(e) => {
                    setVehicleSearch(e.target.value)
                    setShowVehicleDropdown(true)
                    // Typing invalidates any prior pick until re-selected.
                    setSelectedVehicle('')
                    setCustomReg('')
                  }}
                  onFocus={() => setShowVehicleDropdown(true)}
                  placeholder={t('stock.scanAction.searchPlaceholder')}
                  className="w-full px-4 py-3 pl-10 rounded-xl border-2 border-[#72A68E] bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-[#025940] focus:ring-2 focus:ring-[#025940]/20 outline-none transition-all"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />

                {/* Vehicle Dropdown — fleet matches + a "use as custom"
                    fallback so a non-fleet reg can still have parts
                    scanned against it (keyed by normalised reg). */}
                {showVehicleDropdown && (filteredVehicles.length > 0 || isRegUsable(vehicleSearch)) && (
                  <div className="absolute z-10 w-full mt-2 bg-white dark:bg-gray-700 border-2 border-[#72A68E] rounded-xl shadow-xl max-h-60 overflow-auto">
                    {filteredVehicles.slice(0, 10).map((vehicle) => (
                      <button
                        key={vehicle.id}
                        onClick={() => selectVehicle(vehicle.id!)}
                        className="w-full px-4 py-3 text-left hover:bg-[#C5D9D0]/20 dark:hover:bg-[#025940]/20 transition-colors border-b border-gray-100 dark:border-gray-600"
                      >
                        <div className="flex items-center gap-3">
                          <Truck className="w-4 h-4 text-[#025940] dark:text-[#72A68E]" />
                          <div>
                            <p className="text-sm font-bold text-gray-900 dark:text-white">
                              {vehicle.registration}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {vehicle.make} {vehicle.model}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                    {isRegUsable(vehicleSearch) && (
                      <button
                        onClick={() => selectCustomReg(vehicleSearch)}
                        className="w-full px-4 py-3 text-left bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors border-t-2 border-amber-300 dark:border-amber-700"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300 bg-amber-200 dark:bg-amber-800/50 px-1.5 py-0.5 rounded">
                            {t('stock.scanAction.customBadge')}
                          </span>
                          <div>
                            <p className="text-sm font-bold text-amber-900 dark:text-amber-100">
                              {normalizeReg(vehicleSearch)}
                            </p>
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                              {t('stock.scanAction.notInFleetScan')}
                            </p>
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </div>
              {!selectedVehicle && !customReg && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  {t('stock.scanAction.pickHint')}
                </p>
              )}
              {customReg && (
                <p className="text-xs text-[#025940] dark:text-[#72A68E] mt-1 font-semibold">
                  {t('stock.scanAction.customHint', { reg: customReg })}
                </p>
              )}
            </div>
          )}

          {/* Stock warning for 'out' mode */}
          {mode === 'out' && !canRemove && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <p className="text-xs text-red-700 dark:text-red-400 font-semibold">
                {t('stock.scanAction.noStockRemove')}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl text-sm font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
            >
              {t('stock.btn.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={
                processing || 
                !quantity || 
                parseFloat(quantity) <= 0 ||
                (mode === 'out' && !selectedVehicle && !isRegUsable(customReg)) ||
                (mode === 'out' && !canRemove)
              }
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                processing || 
                !quantity || 
                parseFloat(quantity) <= 0 ||
                (mode === 'out' && !selectedVehicle && !isRegUsable(customReg)) ||
                (mode === 'out' && !canRemove)
                  ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-[#025940] to-[#012619] text-[#b3f243] hover:shadow-lg hover:shadow-[#025940]/30'
              }`}
            >
              {processing ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#b3f243] border-t-transparent rounded-full animate-spin" />
                  {t('stock.scanAction.processing')}
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  {t(mode === 'in' ? 'stock.scanAction.addToStock' : 'stock.scanAction.removeFromStock')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}