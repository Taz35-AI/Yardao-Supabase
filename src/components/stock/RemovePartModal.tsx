// src/components/stock/RemovePartModal.tsx
// Compact modal for removing parts with vehicle search
// ✅ NEW: If part has a linkedRegistration, pre-selects that vehicle automatically

'use client'

import React, { useState, useEffect } from 'react'
import { X, Minus, Search, Link } from 'lucide-react'
import { stockService } from '@/lib/services/stockService'
import { vehicleService, userProfileService } from '@/lib/firestore'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { StockPart } from '@/types/stock'
import { Vehicle } from '@/types'
import { logger } from '@/lib/logger'
import { normalizeReg, isRegUsable } from '@/lib/utils/registration'
import { useT } from '@/lib/i18n'

interface RemovePartModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  part: StockPart | null
}

export function RemovePartModal({ isOpen, onClose, onSuccess, part }: RemovePartModalProps) {
  const t = useT()
  const { user } = useAuth()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [userDisplayName, setUserDisplayName] = useState<string>('Unknown')
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [filteredVehicles, setFilteredVehicles] = useState<Vehicle[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
  // Custom (non-fleet) reg — mutually exclusive with selectedVehicle.
  // Parts are scanned out keyed by the normalised reg (vehicleId '').
  const [customReg, setCustomReg] = useState<string>('')
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')

  // ── Fetch user/org ────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchUserData = async () => {
      if (user?.uid && isOpen) {
        try {
          const profile = await userProfileService.getProfile(user.uid)
          if (profile?.organizationId) {
            setOrganizationId(profile.organizationId)
            setUserDisplayName(profile.displayName || 'Unknown')
          }
        } catch (error) {
          logger.error('Error fetching user data:', error)
        }
      }
    }
    fetchUserData()
  }, [user, isOpen])

  // ── Load vehicles ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen && organizationId) loadVehicles()
  }, [isOpen, organizationId])

  const loadVehicles = async () => {
    if (!organizationId) return
    try {
      const allVehicles = await vehicleService.getVehicles(organizationId)
      setVehicles(allVehicles)
      setFilteredVehicles(allVehicles.slice(0, 10))
    } catch (error) {
      logger.error('Error loading vehicles:', error)
      toast.error(t('stock.remove.loadVehiclesFail'))
    }
  }

  // ── Filter vehicles on search ─────────────────────────────────────────────
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredVehicles(vehicles.slice(0, 10))
    } else {
      const term = searchTerm.toLowerCase()
      setFilteredVehicles(
        vehicles.filter(v =>
          v.registration.toLowerCase().includes(term) ||
          v.id?.toLowerCase().includes(term) ||
          `${v.make} ${v.model}`.toLowerCase().includes(term)
        ).slice(0, 10)
      )
    }
  }, [searchTerm, vehicles])

  // ── Default quantity for oil ──────────────────────────────────────────────
  useEffect(() => {
    if (part?.unit === 'liters' && part.partName.toLowerCase().includes('oil')) {
      setQuantity(7)
    } else {
      setQuantity(1)
    }
  }, [part])

  // ── Pre-select linked vehicle when modal opens ────────────────────────────
  // Runs once vehicles are loaded and part has a linkedRegistration
  useEffect(() => {
    if (!isOpen || !part?.linkedRegistration || vehicles.length === 0) return

    const linkedReg = part.linkedRegistration.toUpperCase().replace(/\s+/g, '')
    const match = vehicles.find(
      v => v.registration.toUpperCase().replace(/\s+/g, '') === linkedReg
    )

    if (match) {
      setSelectedVehicle(match)
      setSearchTerm(match.registration)
      logger.log('Pre-selected linked vehicle:', match.registration)
    }
  }, [vehicles, part, isOpen])

  // ── Reset state when modal closes ────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('')
      setSelectedVehicle(null)
      setCustomReg('')
      setNotes('')
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const usingCustom = !selectedVehicle && isRegUsable(customReg)
    if (!user || !organizationId || !part || (!selectedVehicle && !usingCustom)) {
      toast.error(t('stock.remove.selectVehicle'))
      return
    }

    if (quantity <= 0) {
      toast.error(t('stock.remove.qtyGtZero'))
      return
    }

    if (quantity > part.quantity) {
      toast.error(t('stock.remove.notEnoughStock'))
      return
    }

    setLoading(true)
    try {
      logger.log('Removing part:', {
        partId: part.id,
        vehicleId: selectedVehicle ? selectedVehicle.id : '(custom)',
        vehicleReg: selectedVehicle ? selectedVehicle.registration : normalizeReg(customReg),
        quantity,
        organizationId
      })

      await stockService.removePartQuantity(
        part.id!,
        quantity,
        // Custom vehicle → empty id; stockService keys the usage row by
        // the normalised reg so it still shows on the invoice + history.
        selectedVehicle ? selectedVehicle.id! : '',
        selectedVehicle ? selectedVehicle.registration : normalizeReg(customReg),
        user.uid,
        userDisplayName,
        organizationId,
        notes
      )

      logger.log('Part removed successfully')
      toast.success(t('stock.remove.removedLogged'))
      onSuccess()
      onClose()

      setSearchTerm('')
      setSelectedVehicle(null)
      setQuantity(1)
      setNotes('')
    } catch (error: any) {
      logger.error('Error removing part:', error)
      toast.error(error.message || t('stock.remove.removeFail'))
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !part) return null

  const isLinkedVehicleSelected =
    !!part.linkedRegistration &&
    !!selectedVehicle &&
    selectedVehicle.registration.toUpperCase().replace(/\s+/g, '') ===
      part.linkedRegistration.toUpperCase().replace(/\s+/g, '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl border border-gray-200 dark:border-gray-700">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center">
              <Minus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('stock.remove.title')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{part.partName} — {part.partNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* ── Linked vehicle banner ── */}
          {part.linkedRegistration && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#b3f243]/10 border border-[#b3f243]/40">
              <Link className="w-4 h-4 text-[#025940] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-[#025940] dark:text-[#b3f243] uppercase tracking-wider">{t('stock.remove.oneOff')}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                  {t('stock.remove.linkedTo1')}{' '}
                  <span className="font-mono font-bold text-[#012619] dark:text-[#b3f243]">
                    {part.linkedRegistration}
                  </span>
                  {t('stock.remove.linkedTo2')}
                </p>
              </div>
              <div className="bg-[#012619] border border-[#b3f243]/40 rounded px-2 py-0.5 font-mono font-bold tracking-widest text-[#b3f243] text-xs flex-shrink-0">
                {part.linkedRegistration}
              </div>
            </div>
          )}

          {/* ── Vehicle Search ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('stock.remove.whichVehicle')}
            </label>

            {/* Selected vehicle pill (fleet) */}
            {selectedVehicle ? (
              <div className={`flex items-center gap-3 p-3 rounded-xl border-2 ${
                isLinkedVehicleSelected
                  ? 'border-[#b3f243]/60 bg-[#b3f243]/10'
                  : 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20'
              }`}>
                <div className={`rounded-lg px-2.5 py-1 font-mono font-bold tracking-widest text-sm flex-shrink-0 ${
                  isLinkedVehicleSelected
                    ? 'bg-[#012619] border border-[#b3f243]/40 text-[#b3f243]'
                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 border border-blue-200 dark:border-blue-700'
                }`}>
                  {selectedVehicle.registration}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {selectedVehicle.make} {selectedVehicle.model}
                  </p>
                  {isLinkedVehicleSelected && (
                    <p className="text-[10px] text-[#025940] dark:text-[#b3f243] font-semibold mt-0.5">
                      {t('stock.remove.linkedVehicle')}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedVehicle(null)
                    setSearchTerm('')
                  }}
                  className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : customReg ? (
              /* Selected custom (non-fleet) reg pill */
              <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
                <div className="rounded-lg px-2.5 py-1 font-mono font-bold tracking-widest text-sm flex-shrink-0 bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 border border-amber-300 dark:border-amber-700">
                  {customReg}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 truncate">
                    {t('stock.remove.customVehicle')}
                  </p>
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold mt-0.5">
                    {t('stock.remove.notInFleetTracked')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCustomReg('')
                    setSearchTerm('')
                  }}
                  className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t('stock.remove.searchPlaceholder')}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] dark:bg-gray-700 dark:text-white"
                  autoFocus
                />
              </div>
            )}

            {/* Vehicle dropdown — fleet matches + a "use as custom"
                fallback so a non-fleet reg can still have the part
                logged against it. */}
            {!selectedVehicle && !customReg && searchTerm && (
              <div className="mt-2 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-700 shadow-lg">
                {filteredVehicles.map(vehicle => (
                  <button
                    key={vehicle.id}
                    type="button"
                    onClick={() => {
                      setSelectedVehicle(vehicle)
                      setSearchTerm(vehicle.registration)
                    }}
                    className="w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors border-b border-gray-100 dark:border-gray-600"
                  >
                    <div className="font-medium text-gray-900 dark:text-white">{vehicle.registration}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {vehicle.make} {vehicle.model} • {vehicle.colour}
                    </div>
                  </button>
                ))}
                {isRegUsable(searchTerm) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomReg(normalizeReg(searchTerm))
                      setSearchTerm(normalizeReg(searchTerm))
                    }}
                    className="w-full p-3 text-left bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors border-t-2 border-amber-300 dark:border-amber-700"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300 bg-amber-200 dark:bg-amber-800/50 px-1.5 py-0.5 rounded">
                        {t('stock.remove.customBadge')}
                      </span>
                      <div>
                        <div className="font-mono font-bold text-amber-900 dark:text-amber-100">
                          {normalizeReg(searchTerm)}
                        </div>
                        <div className="text-xs text-amber-700 dark:text-amber-400">
                          {t('stock.remove.notInFleetLog')}
                        </div>
                      </div>
                    </div>
                  </button>
                )}
                {filteredVehicles.length === 0 && !isRegUsable(searchTerm) && (
                  <div className="p-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                    {t('stock.remove.keepTyping')}
                  </div>
                )}
              </div>
            )}

            {/* No vehicle selected yet and no search term — show hint */}
            {!selectedVehicle && !customReg && !searchTerm && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                {t('stock.remove.typeRegHint')}
              </p>
            )}
          </div>

          {/* ── Quantity ── */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('stock.remove.quantity')} {part.unit === 'liters' ? '(L)' : ''} *
              </label>
              <input
                type="number"
                min={part.unit === 'liters' ? '0.1' : '1'}
                step={part.unit === 'liters' ? '0.1' : '1'}
                max={part.quantity}
                value={quantity}
                onChange={(e) => {
                  const value = parseFloat(e.target.value) || 0
                  setQuantity(part.unit === 'pieces' ? Math.round(value) : value)
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] dark:bg-gray-700 dark:text-white"
                required
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('stock.remove.available')} {part.quantity} {part.unit}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('stock.remove.remainingAfter')}
              </label>
              <div className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600">
                <span className="text-gray-900 dark:text-white font-medium">
                  {part.unit === 'pieces'
                    ? Math.round(part.quantity - quantity)
                    : (part.quantity - quantity).toFixed(1)
                  } {part.unit}
                </span>
              </div>
            </div>
          </div>

          {/* ── Notes ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('stock.remove.notesOptional')}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] dark:bg-gray-700 dark:text-white resize-none"
              placeholder={t('stock.remove.notesPlaceholder')}
            />
          </div>

          {/* ── Actions ── */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              disabled={loading}
            >
              {t('stock.btn.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || (!selectedVehicle && !isRegUsable(customReg))}
              className="px-6 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all disabled:opacity-50 font-semibold"
            >
              {loading ? t('stock.remove.removing') : t('stock.remove.removePart')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}