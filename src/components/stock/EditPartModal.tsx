// src/components/stock/EditPartModal.tsx
// Full part editing modal - edit all fields of a part
// ✅ STYLED: Premium Yardao brand colors (dark green #012619, medium green #025940, teal #72A68E, accent #b3f243)
// ✅ ENHANCED: Multi make/model support + custom supplier input
// ✅ FIXED: Adjust Stock button now opens AdjustStockModal directly
// ✅ NEW: One-off registration linking with live vehicle search

'use client'

import React, { useState, useEffect, useRef } from 'react'
import { X, Edit2, Save, Tag, Package, Scale } from 'lucide-react'
import { stockService } from '@/lib/services/stockService'
import { settingsService } from '@/lib/services/settingsService'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { toast } from 'sonner'
import { StockPart } from '@/types/stock'
import { AdjustStockModal } from './AdjustStockModal'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabaseClient'
import { useT } from '@/lib/i18n'

interface EditPartModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  part: StockPart | null
}

export function EditPartModal({ isOpen, onClose, onSuccess, part }: EditPartModalProps) {
  const t = useT()
  const { user } = useAuth()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [suppliers, setSuppliers] = useState<string[]>([])

  // Adjust stock modal state
  const [showAdjustModal, setShowAdjustModal] = useState(false)

  // Form data
  const [partName, setPartName] = useState('')
  const [partNumber, setPartNumber] = useState('')
  const [makeModels, setMakeModels] = useState<string[]>([])
  const [makeModelInput, setMakeModelInput] = useState('')
  const [netPrice, setNetPrice] = useState('')
  const [restockTarget, setRestockTarget] = useState('')
  const [unit, setUnit] = useState<'pieces' | 'liters'>('pieces')
  const [supplier, setSupplier] = useState('')
  const [comments, setComments] = useState('')
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false)

  // One-off / registration link state
  const [linkedRegistration, setLinkedRegistration] = useState('')
  const [isOneOff, setIsOneOff] = useState(false)
  const [regSuggestions, setRegSuggestions] = useState<Array<{
    id: string
    registration: string
    make?: string
    model?: string
    source: string
  }>>([])
  const [regSearchLoading, setRegSearchLoading] = useState(false)
  const regDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // ── Fetch organization ────────────────────────────────────────────────────
  useEffect(() => {
    const fetchOrg = async () => {
      if (user?.uid && isOpen) {
        try {
          const profile = await userProfileService.getProfile(user.uid)
          if (profile?.organizationId) setOrganizationId(profile.organizationId)
        } catch (error) {
          logger.error('Error fetching organization:', error)
        }
      }
    }
    fetchOrg()
  }, [user, isOpen])

  // ── Load suppliers ────────────────────────────────────────────────────────
  useEffect(() => {
    const loadSuppliers = async () => {
      if (organizationId && isOpen) {
        try {
          const suppliersList = await settingsService.getSuppliers(organizationId)
          if (suppliersList) setSuppliers(suppliersList)
        } catch (error) {
          logger.error('Error loading suppliers:', error)
        }
      }
    }
    loadSuppliers()
  }, [organizationId, isOpen])

  // ── Populate form when part changes ──────────────────────────────────────
  useEffect(() => {
    if (part && isOpen) {
      setPartName(part.partName)
      setPartNumber(part.partNumber)

      if (Array.isArray(part.makeModel)) {
        setMakeModels(part.makeModel)
      } else if (typeof part.makeModel === 'string') {
        setMakeModels(part.makeModel ? [part.makeModel] : [])
      } else {
        setMakeModels([])
      }

      setMakeModelInput('')
      setNetPrice(part.netPrice.toString())
      setRestockTarget(part.restockTarget.toString())
      setUnit(part.unit)
      setSupplier(part.supplier || '')
      setComments(part.comments || '')
      setLinkedRegistration(part.linkedRegistration || '')
      setIsOneOff(!!part.isOneOff)
      setRegSuggestions([])
    }
  }, [part, isOpen])

  // ── Debounced registration search ─────────────────────────────────────────
  useEffect(() => {
    if (!isOneOff || !organizationId) return
    if (regDebounceRef.current) clearTimeout(regDebounceRef.current)

    const trimmed = linkedRegistration.trim().toUpperCase().replace(/\s+/g, '')
    if (trimmed.length < 2) {
      setRegSuggestions([])
      return
    }

    regDebounceRef.current = setTimeout(async () => {
      setRegSearchLoading(true)
      try {
        const results: Array<{ id: string; registration: string; make?: string; model?: string; source: string }> = []

        const { data: fleetData, error: fleetError } = await supabase
          .from('vehicles')
          .select('id, registration, make, model')
          .eq('organization_id', organizationId)
        if (fleetError) throw fleetError
        ;(fleetData ?? []).forEach(d => {
          const reg = (d.registration || '').toUpperCase().replace(/\s+/g, '')
          if (reg.includes(trimmed)) {
            results.push({ id: d.id, registration: d.registration, make: d.make, model: d.model, source: 'fleet' })
          }
        })

        const { data: yardData, error: yardError } = await supabase
          .from('checked_in_vehicles')
          .select('id, registration, make, model')
          .eq('organization_id', organizationId)
        if (yardError) throw yardError
        ;(yardData ?? []).forEach(d => {
          const reg = (d.registration || '').toUpperCase().replace(/\s+/g, '')
          if (reg.includes(trimmed)) {
            const already = results.some(r => r.registration?.toUpperCase().replace(/\s+/g, '') === reg)
            if (!already) {
              results.push({ id: d.id, registration: d.registration, make: d.make, model: d.model, source: 'yard' })
            }
          }
        })

        setRegSuggestions(results.slice(0, 6))
      } catch (err) {
        logger.error('Error searching registrations:', err)
      } finally {
        setRegSearchLoading(false)
      }
    }, 300)

    return () => { if (regDebounceRef.current) clearTimeout(regDebounceRef.current) }
  }, [linkedRegistration, isOneOff, organizationId])

  // ── Make/model helpers ────────────────────────────────────────────────────
  const addMakeModel = () => {
    const trimmed = makeModelInput.trim()
    if (trimmed && !makeModels.includes(trimmed)) {
      setMakeModels([...makeModels, trimmed])
      setMakeModelInput('')
    }
  }

  const removeMakeModel = (index: number) => {
    setMakeModels(makeModels.filter((_, i) => i !== index))
  }

  const handleMakeModelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addMakeModel()
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!part || !user || !organizationId) {
      toast.error(t('stock.edit.missingInfo'))
      return
    }

    if (!partName.trim()) { toast.error(t('stock.edit.nameRequired')); return }
    if (!partNumber.trim()) { toast.error(t('stock.edit.numberRequired')); return }
    if (makeModels.length === 0) { toast.error(t('stock.edit.makeModelRequired')); return }

    const price = parseFloat(netPrice)
    if (isNaN(price) || price < 0) { toast.error(t('stock.edit.invalidPrice')); return }

    const restock = parseInt(restockTarget)
    if (isNaN(restock) || restock < 0) { toast.error(t('stock.edit.invalidRestock')); return }

    setLoading(true)
    try {
      await stockService.updatePart(part.id!, {
        partName: partName.trim(),
        partNumber: partNumber.trim(),
        makeModel: makeModels,
        netPrice: price,
        restockTarget: restock,
        unit,
        supplier: supplier.trim() || '',
        comments: comments.trim() || '',
        // is_one_off is NOT NULL in the DB — always send a real boolean.
        // Sending undefined here would be coerced to null by updatePart and
        // rejected with a 400 (not-null violation) when editing a normal part.
        isOneOff: !!isOneOff,
        linkedRegistration: isOneOff && linkedRegistration.trim() ? linkedRegistration.trim() : null,
      })

      toast.success(t('stock.edit.updated'))
      onSuccess()
      onClose()
    } catch (error) {
      logger.error('Error updating part:', error)
      toast.error(t('stock.edit.updateFail'))
    } finally {
      setLoading(false)
    }
  }

  const filteredSuppliers = suppliers.filter(sup =>
    sup.toLowerCase().includes(supplier.toLowerCase())
  )

  if (!isOpen || !part) return null

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">

          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-[#025940] to-[#012619] px-6 py-4 border-b border-[#025940] z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
                  <Edit2 className="w-5 h-5 text-[#b3f243]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">{t('stock.edit.title')}</h2>
                  <p className="text-sm text-[#C5D9D0]">{t('stock.edit.subtitle')}</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">

            {/* ── Part Details Section ── */}
            <div className="space-y-6 group">
              <div className="flex items-center space-x-3 pb-4 border-b-2 border-gray-200 dark:border-gray-700 relative">
                <div className="absolute bottom-0 left-0 h-0.5 w-20 bg-gradient-to-r from-[#025940] to-[#72A68E] group-hover:w-40 transition-all duration-500" />
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#025940] to-[#538a72] flex items-center justify-center shadow-lg shadow-teal-500/20">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">{t('stock.edit.sectionDetails')}</h3>
              </div>

              {/* Part Name & Number */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="group/input">
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">{t('stock.edit.partName')}</label>
                  <input
                    type="text"
                    value={partName}
                    onChange={(e) => setPartName(e.target.value)}
                    className="w-full px-5 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-[#025940] dark:focus:border-[#72A68E] focus:ring-4 focus:ring-[#025940]/20 dark:bg-gray-800 dark:text-white transition-all duration-200 font-medium text-base placeholder:text-gray-400 placeholder:font-normal"
                    placeholder={t('stock.edit.partNamePlaceholder')}
                    required
                  />
                </div>
                <div className="group/input">
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">{t('stock.edit.partNumber')}</label>
                  <input
                    type="text"
                    value={partNumber}
                    onChange={(e) => setPartNumber(e.target.value)}
                    className="w-full px-5 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-[#025940] dark:focus:border-[#72A68E] focus:ring-4 focus:ring-[#025940]/20 dark:bg-gray-800 dark:text-white transition-all duration-200 font-medium text-base placeholder:text-gray-400 placeholder:font-normal"
                    placeholder={t('stock.edit.partNumberPlaceholder')}
                    required
                  />
                </div>
              </div>

              {/* Multi Make/Model */}
              <div className="group/input">
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">{t('stock.edit.makeModel')}</label>
                {makeModels.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {makeModels.map((mm, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#025940] to-[#538a72] text-white rounded-full text-sm font-semibold shadow-md"
                      >
                        {mm}
                        <button type="button" onClick={() => removeMakeModel(index)} className="hover:bg-white/20 rounded-full p-0.5 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  value={makeModelInput}
                  onChange={(e) => setMakeModelInput(e.target.value)}
                  onKeyDown={handleMakeModelKeyDown}
                  onBlur={addMakeModel}
                  className="w-full px-5 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-[#025940] dark:focus:border-[#72A68E] focus:ring-4 focus:ring-[#025940]/20 dark:bg-gray-800 dark:text-white transition-all duration-200 font-medium text-base placeholder:text-gray-400 placeholder:font-normal"
                  placeholder={t('stock.edit.makeModelPlaceholder')}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {t('stock.edit.makeModelHint')}
                </p>
              </div>

              {/* Supplier */}
              <div className="group/input relative">
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">{t('stock.edit.supplierLabel')}</label>
                <input
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  onFocus={() => setShowSupplierDropdown(true)}
                  onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 200)}
                  className="w-full px-5 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-[#025940] dark:focus:border-[#72A68E] focus:ring-4 focus:ring-[#025940]/20 dark:bg-gray-800 dark:text-white transition-all duration-200 font-medium text-base placeholder:text-gray-400 placeholder:font-normal"
                  placeholder={t('stock.edit.supplierPlaceholder')}
                />
                {showSupplierDropdown && filteredSuppliers.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border-2 border-[#025940] dark:border-[#72A68E] rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredSuppliers.map((sup, index) => (
                      <button
                        key={index}
                        type="button"
                        onMouseDown={() => { setSupplier(sup); setShowSupplierDropdown(false) }}
                        className="w-full text-left px-4 py-2.5 hover:bg-[#025940]/10 dark:hover:bg-[#72A68E]/10 text-sm font-medium text-gray-900 dark:text-white transition-colors"
                      >
                        {sup}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {t('stock.edit.supplierHint')}
                </p>
              </div>

              {/* Comments */}
              <div className="group/input">
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">{t('stock.edit.commentsLabel')}</label>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={3}
                  className="w-full px-5 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-[#025940] dark:focus:border-[#72A68E] focus:ring-4 focus:ring-[#025940]/20 dark:bg-gray-800 dark:text-white transition-all duration-200 font-medium text-base placeholder:text-gray-400 placeholder:font-normal resize-none"
                  placeholder={t('stock.edit.commentsPlaceholder')}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {t('stock.edit.commentsHint')}
                </p>
              </div>

              {/* One-off vehicle link toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div>
                  <p className="text-sm font-bold text-gray-800 dark:text-white">{t('stock.edit.oneOffTitle')}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('stock.edit.oneOffDesc')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsOneOff(v => !v)
                    if (isOneOff) { setRegSuggestions([]); setLinkedRegistration('') }
                  }}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ${
                    isOneOff ? 'bg-[#b3f243] border-[#b3f243]' : 'bg-gray-300 dark:bg-gray-600 border-gray-300 dark:border-gray-600'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform duration-200 ${isOneOff ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Registration search — only when one-off is ON */}
              {isOneOff && (
                <div className="group/input">
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">{t('stock.edit.linkedReg')}</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={linkedRegistration}
                      onChange={(e) => {
                        setLinkedRegistration(e.target.value.toUpperCase())
                        setRegSuggestions([])
                      }}
                      className="w-full px-5 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-[#b3f243] dark:focus:border-[#b3f243] focus:ring-4 focus:ring-[#b3f243]/20 dark:bg-gray-800 dark:text-white transition-all duration-200 font-mono font-bold tracking-widest text-base placeholder:tracking-normal placeholder:font-normal placeholder:text-gray-400"
                      placeholder={t('stock.edit.regPlaceholder')}
                      autoComplete="off"
                    />
                    {regSearchLoading && (
                      <div className="absolute inset-y-0 right-4 flex items-center">
                        <div className="w-4 h-4 border-2 border-[#025940]/30 border-t-[#025940] rounded-full animate-spin" />
                      </div>
                    )}
                    {regSuggestions.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border-2 border-[#025940] dark:border-[#72A68E] rounded-xl shadow-2xl overflow-hidden">
                        {regSuggestions.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onMouseDown={() => { setLinkedRegistration(v.registration); setRegSuggestions([]) }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#025940]/10 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-0"
                          >
                            <div className="bg-[#012619] border border-[#b3f243]/40 rounded px-2 py-0.5 font-mono font-bold tracking-widest text-[#b3f243] text-xs flex-shrink-0">
                              {v.registration}
                            </div>
                            <span className="text-xs text-gray-600 dark:text-gray-300 flex-1 text-left truncate">
                              {v.make} {v.model}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex-shrink-0">
                              {v.source === 'fleet' ? t('stock.source.fleet') : t('stock.source.inYard')}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {linkedRegistration && regSuggestions.length === 0 && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="bg-[#012619] border border-[#b3f243]/40 rounded-lg px-2.5 py-1 font-mono font-bold tracking-widest text-[#b3f243] text-sm">
                        {linkedRegistration}
                      </span>
                      <span className="text-xs text-[#72A68E]">{t('stock.edit.willBeLinked')}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* ── End Part Details Section ── */}

            {/* ── Stock & Pricing Section ── */}
            <div className="space-y-6 group">
              <div className="flex items-center space-x-3 pb-4 border-b-2 border-gray-200 dark:border-gray-700 relative">
                <div className="absolute bottom-0 left-0 h-0.5 w-20 bg-gradient-to-r from-[#025940] to-[#72A68E] group-hover:w-40 transition-all duration-500" />
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#025940] to-[#538a72] flex items-center justify-center shadow-lg shadow-teal-500/20">
                  <Tag className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">{t('stock.edit.sectionPricing')}</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="group/input">
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">{t('stock.edit.netPriceLabel')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={netPrice}
                    onChange={(e) => setNetPrice(e.target.value)}
                    className="w-full px-5 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-[#025940] dark:focus:border-[#72A68E] focus:ring-4 focus:ring-[#025940]/20 dark:bg-gray-800 dark:text-white transition-all duration-200 font-medium text-base placeholder:text-gray-400 placeholder:font-normal"
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="group/input">
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">{t('stock.edit.restockAt')}</label>
                  <input
                    type="number"
                    min="0"
                    value={restockTarget}
                    onChange={(e) => setRestockTarget(e.target.value)}
                    className="w-full px-5 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-[#025940] dark:focus:border-[#72A68E] focus:ring-4 focus:ring-[#025940]/20 dark:bg-gray-800 dark:text-white transition-all duration-200 font-medium text-base placeholder:text-gray-400 placeholder:font-normal"
                    placeholder="10"
                    required
                  />
                </div>
                <div className="group/input">
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">{t('stock.edit.unit')}</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as 'pieces' | 'liters')}
                    className="w-full px-5 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-[#025940] dark:focus:border-[#72A68E] focus:ring-4 focus:ring-[#025940]/20 dark:bg-gray-800 dark:text-white transition-all duration-200 font-medium text-base"
                  >
                    <option value="pieces">{t('stock.units.pieces')}</option>
                    <option value="liters">{t('stock.units.liters')}</option>
                  </select>
                </div>
              </div>

              {/* Current stock + Adjust */}
              <div className="flex items-center justify-between bg-gradient-to-r from-[#025940]/5 to-[#538a72]/5 dark:from-[#025940]/20 dark:to-[#538a72]/20 rounded-xl p-4 border-2 border-[#C5D9D0] dark:border-[#025940]/30">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('stock.edit.currentStock')} <span className="font-bold text-lg text-[#025940] dark:text-[#72A68E]">{part.quantity} {part.unit}</span>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('stock.edit.adjustHint')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-[#025940] to-[#012619] text-[#b3f243] shadow-md hover:shadow-lg hover:scale-105 transition-all whitespace-nowrap ml-4"
                >
                  <Scale className="w-4 h-4" />
                  {t('stock.edit.adjustStock')}
                </button>
              </div>
            </div>
            {/* ── End Stock & Pricing Section ── */}

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 pt-6 border-t-2 border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-6 py-3 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors font-semibold text-base disabled:opacity-50"
              >
                {t('stock.btn.cancel')}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-8 py-3 bg-gradient-to-r from-[#025940] to-[#012619] text-[#b3f243] rounded-xl hover:shadow-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 font-bold text-base shadow-lg shadow-[#025940]/30"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-[#b3f243]/30 border-t-[#b3f243] rounded-full animate-spin" />
                    <span>{t('stock.edit.saving')}</span>
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    <span>{t('stock.edit.saveChanges')}</span>
                  </>
                )}
              </button>
            </div>

          </form>
        </div>
      </div>

      {/* AdjustStockModal — opens on top of EditPartModal */}
      <AdjustStockModal
        isOpen={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        onSuccess={() => {
          setShowAdjustModal(false)
          onSuccess()
        }}
        part={part}
      />
    </>
  )
}