// src/components/yard/GarageCheckoutModal.tsx
// Restyled: Yardao brand colours — matches modal suite style
// ALL logic, state, validation, custom garage form, useExternalGarages fully preserved
'use client'

import React, { useState, useMemo } from 'react'
import { X, Wrench, Building2, MessageSquare, Plus, Info } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useExternalGarages } from '@/hooks/useExternalGarages'
import { logger } from '@/lib/logger'

// ─── Props ────────────────────────────────────────────────────────────────────

interface GarageCheckoutModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (garageId: string, garageName: string, notes: string, customAddress?: string) => void
  vehicleRegistration: string
  loading?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GarageCheckoutModal({
  isOpen,
  onClose,
  onConfirm,
  vehicleRegistration,
  loading = false
}: GarageCheckoutModalProps) {
  const { activeGarages, loading: garagesLoading } = useExternalGarages()

  // ── Form state (all unchanged) ──
  const [selectedGarageId, setSelectedGarageId]       = useState<string>('')
  const [isCustomGarage, setIsCustomGarage]           = useState(false)
  const [customGarageName, setCustomGarageName]       = useState<string>('')
  const [customGarageAddress, setCustomGarageAddress] = useState<string>('')
  const [notes, setNotes]                             = useState<string>('')
  const [errors, setErrors]                           = useState({ garageName: '', address: '' })

  const selectedGarage = useMemo(
    () => activeGarages.find(g => g.id === selectedGarageId),
    [activeGarages, selectedGarageId]
  )

  // ── Handlers (all unchanged) ──

  const handleGarageSelection = (value: string) => {
    if (value === 'CUSTOM') {
      setIsCustomGarage(true)
      setSelectedGarageId('')
      setCustomGarageName('')
      setCustomGarageAddress('')
      setErrors({ garageName: '', address: '' })
    } else {
      setIsCustomGarage(false)
      setSelectedGarageId(value)
      setCustomGarageName('')
      setCustomGarageAddress('')
      setErrors({ garageName: '', address: '' })
    }
  }

  const validateForm = (): boolean => {
    const newErrors = { garageName: '', address: '' }
    let isValid = true

    if (isCustomGarage) {
      if (!customGarageName.trim()) { newErrors.garageName = 'Garage name is required'; isValid = false }
      if (!customGarageAddress.trim()) { newErrors.address = 'Address is required'; isValid = false }
    } else if (!selectedGarageId) {
      newErrors.garageName = 'Please select a garage'
      isValid = false
    }

    setErrors(newErrors)
    return isValid
  }

  const handleConfirm = () => {
    if (!validateForm()) return

    if (isCustomGarage) {
      logger.log('🔧 GarageCheckoutModal - Custom garage confirm:', {
        garageId: 'CUSTOM',
        garageName: customGarageName.trim(),
        notes,
        customAddress: customGarageAddress.trim()
      })
      onConfirm('CUSTOM', customGarageName.trim(), notes, customGarageAddress.trim())
    } else if (selectedGarage) {
      logger.log('🔧 GarageCheckoutModal - Saved garage confirm:', {
        garageId: selectedGarage.id,
        garageName: selectedGarage.name,
        notes
      })
      onConfirm(selectedGarage.id, selectedGarage.name, notes)
    }
  }

  const canConfirm = isCustomGarage
    ? Boolean(customGarageName.trim() && customGarageAddress.trim())
    : Boolean(selectedGarageId)

  // Reset form when modal closes (unchanged)
  React.useEffect(() => {
    if (!isOpen) {
      setSelectedGarageId('')
      setIsCustomGarage(false)
      setCustomGarageName('')
      setCustomGarageAddress('')
      setNotes('')
      setErrors({ garageName: '', address: '' })
    }
  }, [isOpen])

  if (!isOpen) return null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-3 sm:p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col border border-[#e2e8e5] dark:border-gray-700">

        {/* ── Header ── */}
        <div className="flex-shrink-0 bg-[#012619] px-5 py-4 rounded-t-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 bg-[#b3f243]/10 border border-[#b3f243]/30 rounded-xl p-2">
              <Wrench className="w-4 h-4 text-[#b3f243]" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm">Check Out to Garage</p>
              <p className="text-[#72A68E] text-xs mt-0.5 truncate">
                {vehicleRegistration} · Select or enter garage
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-[#72A68E] hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Garage selection */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-3.5 h-3.5 text-[#025940]" />
              <p className="text-xs text-[#8a9e94] font-medium">Select or Enter Garage *</p>
            </div>

            {garagesLoading ? (
              <div className="flex items-center px-3 py-2.5 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-[#f8faf9] dark:bg-gray-800 text-[#8a9e94]">
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b border-[#025940] mr-2" />
                Loading garages...
              </div>
            ) : (
              <div className="space-y-3">
                {/* Dropdown */}
                <select
                  value={isCustomGarage ? 'CUSTOM' : selectedGarageId}
                  onChange={e => handleGarageSelection(e.target.value)}
                  disabled={loading}
                  className={`w-full px-3 py-2.5 text-sm border rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] shadow-sm ${
                    errors.garageName && !isCustomGarage
                      ? 'border-red-400'
                      : 'border-[#e2e8e5] dark:border-gray-600'
                  }`}
                >
                  <option value="">Choose from saved garages...</option>
                  {activeGarages.map(garage => (
                    <option key={garage.id} value={garage.id}>
                      {garage.name.length > 35 ? garage.name.substring(0, 35) + '…' : garage.name}
                    </option>
                  ))}
                  <option value="CUSTOM">+ Enter custom garage details</option>
                </select>

                {/* Dropdown validation error */}
                {errors.garageName && !isCustomGarage && (
                  <p className="text-[10px] text-red-500">{errors.garageName}</p>
                )}

                {/* Selected saved garage preview */}
                {!isCustomGarage && selectedGarage && (
                  <div className="px-3 py-2.5 bg-[#f0f4f2] dark:bg-gray-800 rounded-xl border border-[#e2e8e5] dark:border-gray-700" style={{ borderLeft: '3px solid #b3f243' }}>
                    <p className="text-xs font-semibold text-[#012619] dark:text-white">{selectedGarage.name}</p>
                    {selectedGarage.address && (
                      <p className="text-[10px] text-[#72A68E] mt-0.5">{selectedGarage.address}</p>
                    )}
                  </div>
                )}

                {/* Custom garage form */}
                {isCustomGarage && (
                  <div className="space-y-3 p-4 bg-[#f8faf9] dark:bg-gray-800 rounded-xl border border-[#e2e8e5] dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-1">
                      <Plus className="w-3.5 h-3.5 text-[#025940]" />
                      <p className="text-xs font-bold text-[#8a9e94] uppercase tracking-widest">Custom Garage</p>
                    </div>

                    {/* Name */}
                    <div>
                      <p className="text-xs text-[#8a9e94] font-medium mb-1.5">Garage Name *</p>
                      <Input
                        value={customGarageName}
                        onChange={e => {
                          setCustomGarageName(e.target.value)
                          if (errors.garageName) setErrors(prev => ({ ...prev, garageName: '' }))
                        }}
                        placeholder="e.g., Quick Fix Motors"
                        disabled={loading}
                        className={`bg-white dark:bg-gray-900 border-[#e2e8e5] dark:border-gray-600 text-[#012619] dark:text-white focus:border-[#025940] ${
                          errors.garageName ? 'border-red-400' : ''
                        }`}
                      />
                      {errors.garageName && (
                        <p className="text-[10px] text-red-500 mt-1">{errors.garageName}</p>
                      )}
                    </div>

                    {/* Address */}
                    <div>
                      <p className="text-xs text-[#8a9e94] font-medium mb-1.5">Address *</p>
                      <Input
                        value={customGarageAddress}
                        onChange={e => {
                          setCustomGarageAddress(e.target.value)
                          if (errors.address) setErrors(prev => ({ ...prev, address: '' }))
                        }}
                        placeholder="e.g., 123 High Street, London, SW1A 1AA"
                        disabled={loading}
                        className={`bg-white dark:bg-gray-900 border-[#e2e8e5] dark:border-gray-600 text-[#012619] dark:text-white focus:border-[#025940] ${
                          errors.address ? 'border-red-400' : ''
                        }`}
                      />
                      {errors.address && (
                        <p className="text-[10px] text-red-500 mt-1">{errors.address}</p>
                      )}
                    </div>

                    <p className="text-[10px] text-[#72A68E] leading-relaxed">
                      One-time entry. To save for future use, go to Settings → External Garages.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Service notes */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-3.5 h-3.5 text-[#025940]" />
              <p className="text-xs text-[#8a9e94] font-medium">Service Notes (optional)</p>
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Describe the work needed — MOT, Service, Tyres, Repairs..."
              rows={4}
              disabled={loading}
              className="w-full px-3 py-2.5 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] resize-none shadow-sm placeholder-[#c8d5ce]"
            />
            <p className="text-[10px] text-[#8a9e94] mt-1.5">
              A service booking will be created for today with status "At Garage".
            </p>
          </div>

          {/* Info box */}
          <div className="flex gap-3 bg-[#f8faf9] dark:bg-gray-800 rounded-xl p-4 border border-[#e2e8e5] dark:border-gray-700">
            <Info className="w-4 h-4 text-[#72A68E] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-[#012619] dark:text-white mb-1.5">What happens next</p>
              <ul className="space-y-1 text-[10px] text-[#72A68E] dark:text-gray-400 leading-relaxed">
                <li>· Vehicle marked as "At External Garage" on dashboard</li>
                <li>· Service booking created for today's date</li>
                <li>· Appears in your Service Bookings calendar</li>
                <li>· Not counted in dashboard totals</li>
                <li>· Return from garage when service is complete</li>
              </ul>
            </div>
          </div>
        </div>

        {/* ── Action bar ── */}
        <div className="flex-shrink-0 bg-[#f8faf9] dark:bg-gray-800/80 border-t border-[#e2e8e5] dark:border-gray-700 px-5 py-3 rounded-b-2xl flex gap-3">
          <Button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 bg-[#f0f4f2] dark:bg-gray-700 text-[#4a5e54] dark:text-gray-300 hover:bg-[#e2e8e5] dark:hover:bg-gray-600 font-semibold py-2.5 text-sm border border-[#c8d5ce] dark:border-gray-600 shadow-none"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || loading}
            className="flex-1 bg-[#025940] hover:bg-[#012619] text-white font-semibold py-2.5 text-sm border-0 shadow-none flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Wrench className="w-4 h-4" />
            <span>{loading ? 'Processing...' : 'Check Out to Garage'}</span>
          </Button>
        </div>

      </div>
    </div>
  )
}