// src/components/common/Modals/FleetVehicleEditModal.tsx
// Restyled: "Clean Sheet" — matches VehicleDetailModal / VehicleEditModal / FleetVehicleDetailModal
// ✅ ALL original logic, SizeInput autocomplete, tabs, damage map, insurance toggle FULLY PRESERVED
// ✅ Registration shown as locale-neutral dark badge (no GB plate)
// ✅ Header: two-row on mobile, single row on desktop — nothing fights for space
'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/contexts/AuthContext'
import { contractService } from '@/lib/contractService'
import { userProfileService } from '@/lib/firestore'
import { Contract, InsuranceStatus, FleetVehicle } from '@/types'
import { InsuranceToggle } from '@/components/common/ui/InsuranceToggle'
import { getUniqueSizes } from '@/lib/fleetUtils'
import { computeDefleetDue } from '@/lib/utils/defleetDue'
import { useVehicleSuppliers } from '@/hooks/fleet/useVehicleSuppliers'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n'
import {
  Edit,
  X,
  Save,
  Car,
  FileText,
  Calendar,
  Shield,
  MessageSquare,
  Trash2,
  Settings,
  Palette,
  Ruler,
  CheckCircle,
  Info,
  Search,
  Loader2,
  AlertCircle,
  Check,
  Truck,
  CalendarClock,
} from 'lucide-react'
import { useRegLookup } from '@/hooks/useRegLookup'
import { logger } from '@/lib/logger'
import { VehicleDiagramSelector } from '@/components/common/DamageMapper/VehicleDiagramSelector'
import { DamageMapView } from '@/components/common/DamageMapper/DamageMapView'
import { VehicleDiagramType, DamagePin } from '@/components/common/DamageMapper/DamageMapper'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FleetVehicleEditModalProps {
  vehicle: FleetVehicle
  conditions: Array<{ id: string; name: string }>
  vehicles?: FleetVehicle[]
  onSave: (vehicleId: string, updates: any) => Promise<void>
  onCancel: () => void
  onDelete?: (vehicleId: string) => Promise<void>
}

// ─── SizeInput autocomplete (unchanged) ──────────────────────────────────────

interface SizeInputProps {
  value: string
  onChange: (value: string) => void
  existingSizes: string[]
}

function SizeInput({ value, onChange, existingSizes }: SizeInputProps) {
  const t = useT()
  const [isOpen, setIsOpen]               = useState(false)
  const [filteredSizes, setFilteredSizes] = useState<string[]>([])
  const [showDropdown, setShowDropdown]   = useState(false)
  const inputRef    = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (value && value.length > 0) {
      const filtered = existingSizes.filter(size =>
        size.toLowerCase().includes(value.toLowerCase()) &&
        size.toLowerCase() !== value.toLowerCase()
      )
      setFilteredSizes(filtered)
      setShowDropdown(filtered.length > 0 && isOpen)
    } else {
      setFilteredSizes(existingSizes)
      setShowDropdown(existingSizes.length > 0 && isOpen)
    }
  }, [value, existingSizes, isOpen])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current  && !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
    setIsOpen(e.target.value.length > 0)
  }

  const handleSizeSelect = (size: string) => {
    onChange(size)
    setIsOpen(false)
    setShowDropdown(false)
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={handleInputChange}
        onFocus={() => { if (value.length > 0 && filteredSizes.length > 0) setIsOpen(true) }}
        onBlur={() => setTimeout(() => { setIsOpen(false); setShowDropdown(false) }, 150)}
        onKeyDown={e => {
          if (e.key === 'Escape' || e.key === 'Enter') { setIsOpen(false); setShowDropdown(false) }
        }}
        placeholder={t('fleet.editModal.sizePlaceholder')}
        required
        className="w-full px-3 py-2.5 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] shadow-sm pr-8"
      />
      <button
        type="button"
        onClick={() => { setIsOpen(!isOpen); if (!isOpen && existingSizes.length > 0) setShowDropdown(true) }}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a9e94] hover:text-[#025940]"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {showDropdown && filteredSizes.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-600 rounded-xl shadow-lg max-h-48 overflow-y-auto"
        >
          {filteredSizes.map((size, index) => (
            <button
              key={index}
              type="button"
              onMouseDown={e => { e.preventDefault(); handleSizeSelect(size) }}
              className="w-full text-left px-3 py-2 hover:bg-[#f0f4f2] dark:hover:bg-gray-700 text-[#012619] dark:text-white text-sm border-b border-[#f0f4f2] dark:border-gray-700 last:border-0"
            >
              {size}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Locale-neutral reg badge — matches all other modals in this suite
const RegBadge = ({ registration }: { registration: string }) => {
  const t = useT()
  return (
  <div className="flex-shrink-0 bg-[#012619] border border-[#b3f243]/40 rounded-lg px-2.5 py-1 sm:px-3 sm:py-1.5 font-mono font-bold tracking-widest text-[#b3f243] leading-none text-sm sm:text-base">
    {registration || t('fleet.editModal.regUnknown')}
  </div>
  )
}

// Section title with lime left-border accent
const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-bold text-[#8a9e94] uppercase tracking-widest mb-3 pl-2 border-l-2 border-[#b3f243]">
    {children}
  </p>
)

// Field wrapper — icon + label above input
const FieldWrap = ({
  icon: Icon,
  label,
  iconColor = 'text-[#025940]',
  children
}: {
  icon: React.ElementType
  label: string
  iconColor?: string
  children: React.ReactNode
}) => (
  <div>
    <div className="flex items-center gap-2 mb-1.5">
      <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${iconColor}`} />
      <p className="text-xs text-[#8a9e94] font-medium">{label}</p>
    </div>
    {children}
  </div>
)

// Shared input class
const inputCls =
  'w-full px-3 py-2.5 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] shadow-sm'

// ─── Main component ───────────────────────────────────────────────────────────

export function FleetVehicleEditModal({
  vehicle,
  conditions = [],
  vehicles = [],
  onSave,
  onCancel,
  onDelete
}: FleetVehicleEditModalProps) {
  const { user } = useAuth()
  const t = useT()
  const vehicleSuppliers = useVehicleSuppliers()
  const router = useRouter()
  const [loading, setLoading]                   = useState(false)
  const [contracts, setContracts]               = useState<Contract[]>([])
  const [contractsLoading, setContractsLoading] = useState(true)
  const [activeTab, setActiveTab]               = useState<'details' | 'damage'>('details')
  // Rental term entered as weeks (defleet date derived) or an explicit date.
  const [termMode, setTermMode]                 = useState<'weeks' | 'date'>('weeks')

  const [formData, setFormData] = useState({
    dateAcquired:       '',
    supplier:           '',
    rentalTermWeeks:   '',
    defleetDueDate:     '',
    registration:       '',
    make:               '',
    model:              '',
    colour:             '',
    size:               '',
    condition:          '',
    motExpiry:          '',
    taxExpiry:          '',
    comments:           '',
    contract:           '',
    contractColor:      '',
    contractId:         '',
    insuranceStatus:    null as InsuranceStatus | null,
    vehicleDiagramType: '' as VehicleDiagramType | '',
    damagePins:         [] as DamagePin[],
  })

  const existingSizes = getUniqueSizes(vehicles)

  const safeString = (value: any): string => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    try { return String(value) } catch { return '' }
  }

  // ── Load contracts (unchanged) ────────────────────────────────────────────
  useEffect(() => {
    const loadContracts = async () => {
      if (!user) return
      try {
        setContractsLoading(true)
        const profile = await userProfileService.getProfile(user.uid)
        if (profile?.organizationId) {
          const contractsList = await contractService.getContracts(profile.organizationId)
          setContracts(contractsList)
        }
      } catch (error) {
        logger.error('Error loading contracts:', error)
      } finally {
        setContractsLoading(false)
      }
    }
    loadContracts()
  }, [user])

  // ── Populate form from vehicle prop (unchanged) ───────────────────────────
  useEffect(() => {
    if (vehicle) {
      setFormData({
        dateAcquired:       safeString(vehicle.dateAcquired),
        supplier:           safeString((vehicle as any).supplier),
        rentalTermWeeks:   (vehicle as any).rentalTermWeeks != null ? String((vehicle as any).rentalTermWeeks) : '',
        defleetDueDate:     safeString((vehicle as any).defleetDueDate),
        registration:       safeString(vehicle.registration),
        make:               safeString(vehicle.make),
        model:              safeString(vehicle.model),
        colour:             safeString(vehicle.colour),
        size:               safeString(vehicle.size),
        condition:          safeString(vehicle.condition),
        motExpiry:          safeString(vehicle.motExpiry),
        taxExpiry:          safeString(vehicle.taxExpiry),
        comments:           safeString(vehicle.comments),
        contract:           safeString(vehicle.contract) || '',
        contractColor:      safeString(vehicle.contractColor) || '',
        contractId:         safeString((vehicle as any).contractId) || '',
        insuranceStatus:    vehicle.insuranceStatus || null,
        vehicleDiagramType: (vehicle.vehicleDiagramType || '') as VehicleDiagramType | '',
        damagePins:         vehicle.damagePins || [],
      })
      // Start on the mode that matches the stored data.
      setTermMode((vehicle as any).defleetDueDate ? 'date' : 'weeks')
    }
  }, [vehicle])

  // ── Handlers (all unchanged) ──────────────────────────────────────────────

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value }
      if (field === 'contract') {
        const selectedContract = contracts.find(c => c.name === value)
        newData.contractColor = selectedContract?.color || ''
        newData.contractId = selectedContract?.id || ''
      }
      return newData
    })
  }

  // DVLA lookup — fills make/colour/MOT/tax for vehicles with missing data.
  const lookup = useRegLookup()
  const runLookup = async () => {
    const data = await lookup.run(formData.registration)
    if (!data) return
    if (data.make) handleInputChange('make', data.make)
    if (data.model) handleInputChange('model', data.model)
    if (data.colour) handleInputChange('colour', data.colour)
    if (data.motExpiry) handleInputChange('motExpiry', data.motExpiry)
    if (data.taxExpiry) handleInputChange('taxExpiry', data.taxExpiry)
  }

  const handleInsuranceToggle = (status: InsuranceStatus) => {
    setFormData(prev => ({ ...prev, insuranceStatus: status }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const updateData = {
        ...formData,
        dateAcquired:       formData.dateAcquired || null,
        supplier:           formData.supplier?.trim() || null,
        rentalTermWeeks:   formData.rentalTermWeeks ? Number(formData.rentalTermWeeks) : null,
        defleetDueDate:     formData.defleetDueDate || null,
        contract:           formData.contract || null,
        contractColor:      formData.contractColor || null,
        contractId:         formData.contractId || null,
        insuranceStatus:    formData.insuranceStatus,
        vehicleDiagramType: formData.vehicleDiagramType || null,
        damagePins:         formData.damagePins || [],
      }
      await onSave(vehicle.id, updateData)
    } catch (error) {
      logger.error('Failed to save vehicle:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    if (window.confirm(t('fleet.editModal.deleteConfirm'))) {
      setLoading(true)
      try {
        await onDelete(vehicle.id)
      } catch (error) {
        logger.error('Failed to delete vehicle:', error)
      } finally {
        setLoading(false)
      }
    }
  }

  const getContractBadgeStyle = (contractColor: string) => {
    if (!contractColor) return { backgroundColor: '#f0f4f2', color: '#4a5e54' }
    const hex = contractColor.replace('#', '')
    const r   = parseInt(hex.substring(0, 2), 16)
    const g   = parseInt(hex.substring(2, 4), 16)
    const b   = parseInt(hex.substring(4, 6), 16)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    return { backgroundColor: contractColor, color: brightness > 128 ? '#000000' : '#ffffff' }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-3 sm:p-6 z-50"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-2xl mx-auto bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col border border-[#e2e8e5] dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >

        {/* ════════════════════════════════════════════════════════════════
            HEADER
            Mobile  : row 1 = reg badge + close
                      row 2 = make/model + subtitle
            Desktop : single row
        ════════════════════════════════════════════════════════════════ */}
        <div className="flex-shrink-0 bg-[#012619] px-4 py-3 sm:px-6 sm:py-4 border-b-2 border-[#b3f243]/30">

          {/* ── Mobile (hidden on sm+) ── */}
          <div className="flex sm:hidden flex-col gap-2">
            {/* Row 1: reg badge + close */}
            <div className="flex items-center justify-between">
              <RegBadge registration={safeString(vehicle.registration)} />
              <button
                onClick={onCancel}
                className="p-1.5 rounded-lg text-[#72A68E] hover:text-white hover:bg-white/10 transition-colors"
                aria-label={t('fleet.editModal.cancelAria')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Row 2: make/model */}
            <div className="min-w-0">
              <p className="text-white font-semibold text-xs truncate leading-tight">
                {safeString(vehicle.make)}{vehicle.make && vehicle.model ? ' ' : ''}{safeString(vehicle.model)}
                {vehicle.size && (
                  <span className="text-[#72A68E]"> · {safeString(vehicle.size)}</span>
                )}
              </p>
              <p className="text-[#72A68E] text-[10px] mt-0.5 font-medium">{t('fleet.editModal.subtitle')}</p>
            </div>
          </div>

          {/* ── Desktop (hidden on mobile) ── */}
          <div className="hidden sm:flex items-center gap-4">
            <RegBadge registration={safeString(vehicle.registration)} />
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-base truncate leading-tight">
                {safeString(vehicle.make)}{vehicle.make && vehicle.model ? ' ' : ''}{safeString(vehicle.model)}
                {vehicle.size && (
                  <span className="text-[#72A68E]"> · {safeString(vehicle.size)}</span>
                )}
              </p>
              <p className="text-[#72A68E] text-xs mt-0.5 font-medium">{t('fleet.editModal.subtitle')}</p>
            </div>
            <button
              onClick={onCancel}
              className="p-1.5 rounded-lg text-[#72A68E] hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
              aria-label={t('fleet.editModal.cancelAria')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

        </div>
        {/* ════ END HEADER ════ */}

        {/* ── Tab toggle (unchanged logic, Clean Sheet style) ── */}
        <div className="flex-shrink-0 flex bg-[#f8faf9] dark:bg-gray-800 border-b border-[#e2e8e5] dark:border-gray-700">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`flex-1 py-3 text-xs font-bold transition-all border-b-2 ${
              activeTab === 'details'
                ? 'border-[#b3f243] text-[#012619] dark:text-white bg-white dark:bg-gray-900'
                : 'border-transparent text-[#8a9e94] hover:text-[#025940] dark:hover:text-gray-200'
            }`}
          >
            {t('fleet.editModal.tabDetails')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('damage')}
            className={`flex-1 py-3 text-xs font-bold transition-all border-b-2 ${
              activeTab === 'damage'
                ? 'border-[#b3f243] text-[#012619] dark:text-white bg-white dark:bg-gray-900'
                : 'border-transparent text-[#8a9e94] hover:text-[#025940] dark:hover:text-gray-200'
            }`}
          >
            {t('fleet.editModal.tabDamageMapping')}
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} id="fleet-edit-form">

            {/* ══════════ DETAILS TAB ══════════ */}
            {activeTab === 'details' && (
              <div className="flex flex-col sm:flex-row sm:divide-x sm:divide-[#e2e8e5] dark:divide-gray-700">

                {/* ── Left panel: Vehicle Details ── */}
                <div className="flex-1 p-4 sm:p-5 space-y-4">
                  <SectionTitle>{t('fleet.editModal.sectionVehicleDetails')}</SectionTitle>

                  <FieldWrap icon={Calendar} label={t('fleet.editModal.dateAcquiredLabel')}>
                    <input
                      type="date"
                      value={formData.dateAcquired}
                      onChange={e => handleInputChange('dateAcquired', e.target.value)}
                      className={inputCls}
                    />
                  </FieldWrap>

                  <FieldWrap icon={Truck} label={t('fleet.editModal.supplierLabel')}>
                    <select
                      value={formData.supplier}
                      onChange={e => {
                        if (e.target.value === '__add_supplier__') {
                          router.push('/settings?tab=vehicle-suppliers')
                          return
                        }
                        handleInputChange('supplier', e.target.value)
                      }}
                      className={inputCls}
                    >
                      <option value="">{t('fleet.form.supplierSelect')}</option>
                      {formData.supplier && !vehicleSuppliers.includes(formData.supplier) && (
                        <option value={formData.supplier}>{formData.supplier}</option>
                      )}
                      {vehicleSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
                      <option value="__add_supplier__">{t('fleet.form.supplierAdd')}</option>
                    </select>
                  </FieldWrap>

                  <FieldWrap icon={CalendarClock} label={t('fleet.editModal.rentalTermLabel')}>
                    <div className="inline-flex mb-1.5 rounded-md overflow-hidden border border-[#d6e3dc] dark:border-gray-600 text-[10px] font-semibold">
                      <button
                        type="button"
                        onClick={() => { setTermMode('weeks'); handleInputChange('defleetDueDate', '') }}
                        className={termMode === 'weeks'
                          ? 'px-2.5 py-1 bg-[#025940] text-white'
                          : 'px-2.5 py-1 text-[#5a6e64] dark:text-gray-300'}
                      >
                        {t('fleet.form.termModeWeeks')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setTermMode('date'); handleInputChange('rentalTermWeeks', '') }}
                        className={termMode === 'date'
                          ? 'px-2.5 py-1 bg-[#025940] text-white'
                          : 'px-2.5 py-1 text-[#5a6e64] dark:text-gray-300'}
                      >
                        {t('fleet.form.termModeDate')}
                      </button>
                    </div>
                    {termMode === 'weeks' ? (
                      <input
                        type="number" min="0" step="1"
                        value={formData.rentalTermWeeks}
                        onChange={e => handleInputChange('rentalTermWeeks', e.target.value)}
                        className={inputCls}
                        placeholder={t('fleet.form.rentalTermPlaceholder')}
                      />
                    ) : (
                      <input
                        type="date"
                        value={formData.defleetDueDate}
                        onChange={e => handleInputChange('defleetDueDate', e.target.value)}
                        className={inputCls}
                      />
                    )}
                    {(() => {
                      const due = computeDefleetDue(formData.dateAcquired, formData.rentalTermWeeks ? Number(formData.rentalTermWeeks) : null, 60, formData.defleetDueDate || null)
                      return due.dueDate ? (
                        <p className="text-[11px] font-medium text-[#025940] dark:text-[#72A68E] mt-1">
                          {t('fleet.form.defleetDueHint', { date: new Date(due.dueDate + 'T00:00:00').toLocaleDateString('en-GB') })}
                        </p>
                      ) : null
                    })()}
                  </FieldWrap>

                  <FieldWrap icon={Car} label={t('fleet.editModal.registrationLabel')}>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Input
                          value={formData.registration}
                          onChange={e => { handleInputChange('registration', e.target.value); lookup.reset() }}
                          placeholder={t('fleet.editModal.registrationPlaceholder')}
                          required
                          className="border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-[#025940]/30 focus:border-[#025940]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={runLookup}
                        disabled={lookup.loading || !formData.registration.trim()}
                        title={t('fleet.form.lookupTitle')}
                        className="flex-shrink-0 inline-flex items-center gap-1.5 bg-[#025940] hover:bg-[#012619] text-white font-semibold px-3.5 py-2 rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {lookup.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        <span className="hidden sm:inline">{t('fleet.form.lookupButton')}</span>
                      </button>
                    </div>
                    {lookup.error && (
                      <p className="flex items-start gap-1.5 mt-1.5 text-[11px] text-red-600 dark:text-red-400">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />{lookup.error}
                      </p>
                    )}
                    {lookup.done && !lookup.error && (
                      <p className="flex items-start gap-1.5 mt-1.5 text-[11px] text-[#025940] dark:text-[#72A68E]">
                        <Check className="w-3.5 h-3.5 flex-shrink-0 mt-px" />{t('fleet.form.lookupSuccess')}
                      </p>
                    )}
                  </FieldWrap>

                  {/* Make & Model side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    <FieldWrap icon={Settings} label={t('fleet.editModal.makeLabel')}>
                      <Input
                        value={formData.make}
                        onChange={e => handleInputChange('make', e.target.value)}
                        placeholder={t('fleet.editModal.makePlaceholder')}
                        required
                        className="border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-[#025940]/30 focus:border-[#025940]"
                      />
                    </FieldWrap>
                    <FieldWrap icon={Car} label={t('fleet.editModal.modelLabel')}>
                      <Input
                        value={formData.model}
                        onChange={e => handleInputChange('model', e.target.value)}
                        placeholder={t('fleet.editModal.modelPlaceholder')}
                        required
                        className="border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-[#025940]/30 focus:border-[#025940]"
                      />
                    </FieldWrap>
                  </div>

                  {/* Colour & Size side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    <FieldWrap icon={Palette} label={t('fleet.editModal.colourLabel')}>
                      <Input
                        value={formData.colour}
                        onChange={e => handleInputChange('colour', e.target.value)}
                        placeholder={t('fleet.editModal.colourPlaceholder')}
                        className="border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-[#025940]/30 focus:border-[#025940]"
                      />
                    </FieldWrap>
                    <FieldWrap icon={Ruler} label={t('fleet.editModal.sizeLabel')}>
                      <SizeInput
                        value={formData.size}
                        onChange={val => handleInputChange('size', val)}
                        existingSizes={existingSizes}
                      />
                    </FieldWrap>
                  </div>

                  <FieldWrap icon={CheckCircle} label={t('fleet.editModal.conditionLabel')}>
                    <select
                      value={formData.condition}
                      onChange={e => handleInputChange('condition', e.target.value)}
                      required
                      className={inputCls}
                    >
                      <option value="">{t('fleet.editModal.conditionPlaceholderOption')}</option>
                      {conditions.map(condition => (
                        <option key={condition.id} value={condition.name}>{condition.name}</option>
                      ))}
                    </select>
                  </FieldWrap>
                </div>

                {/* ── Right panel: Documentation, Contract, Insurance, Comments ── */}
                <div className="flex-1 p-4 sm:p-5 space-y-4 bg-[#f8faf9] dark:bg-gray-800/40 border-t border-[#e2e8e5] sm:border-t-0 dark:border-gray-700">
                  <SectionTitle>{t('fleet.editModal.sectionDocsAssignment')}</SectionTitle>

                  {/* MOT & Tax side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    <FieldWrap icon={Shield} label={t('fleet.editModal.motExpiryLabel')} iconColor="text-red-500">
                      <input
                        type="date"
                        value={formData.motExpiry}
                        onChange={e => handleInputChange('motExpiry', e.target.value)}
                        className={inputCls}
                      />
                    </FieldWrap>
                    <FieldWrap icon={Calendar} label={t('fleet.editModal.taxExpiryLabel')} iconColor="text-red-500">
                      <input
                        type="date"
                        value={formData.taxExpiry}
                        onChange={e => handleInputChange('taxExpiry', e.target.value)}
                        className={inputCls}
                      />
                    </FieldWrap>
                  </div>

                  {/* Contract */}
                  <FieldWrap icon={FileText} label={t('fleet.editModal.contractAssignmentLabel')}>
                    {contractsLoading ? (
                      <div className="flex items-center px-3 py-2.5 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#8a9e94]">
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-b border-[#025940] mr-2" />
                        {t('fleet.editModal.loadingContracts')}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <select
                          value={formData.contract}
                          onChange={e => handleInputChange('contract', e.target.value)}
                          className={inputCls}
                        >
                          <option value="">{t('fleet.editModal.noContractOption')}</option>
                          {contracts.map(contract => (
                            <option key={contract.id} value={contract.name}>
                              {contract.name}{contract.isDefault ? t('fleet.editModal.contractDefaultSuffix') : ''}
                            </option>
                          ))}
                        </select>

                        {/* Contract colour preview */}
                        {formData.contract && formData.contractColor && (
                          <div className="flex items-center gap-2.5 bg-white dark:bg-gray-800 rounded-xl px-3 py-2 border border-[#e2e8e5] dark:border-gray-700 shadow-sm">
                            <div
                              className="w-4 h-4 rounded-full border-2 border-white shadow-sm flex-shrink-0"
                              style={{ backgroundColor: formData.contractColor }}
                            />
                            <span
                              className="text-xs font-bold px-2 py-0.5 rounded-full"
                              style={getContractBadgeStyle(formData.contractColor)}
                            >
                              {formData.contract}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </FieldWrap>

                  {/* Insurance toggle */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="w-3.5 h-3.5 text-[#025940]" />
                      <p className="text-xs text-[#8a9e94] font-medium">{t('fleet.editModal.insuranceStatusLabel')}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-[#e2e8e5] dark:border-gray-700 shadow-sm space-y-2">
                      <InsuranceToggle
                        insuranceStatus={formData.insuranceStatus}
                        onToggle={handleInsuranceToggle}
                        disabled={loading}
                        size="md"
                        showLabel={true}
                      />
                      <p className="text-[10px] text-[#8a9e94] leading-relaxed">
                        {t('fleet.editModal.insuranceHint')}
                      </p>
                    </div>
                  </div>

                  {/* Comments */}
                  <FieldWrap icon={MessageSquare} label={t('fleet.editModal.commentsLabel')}>
                    <textarea
                      value={formData.comments}
                      onChange={e => handleInputChange('comments', e.target.value)}
                      placeholder={t('fleet.editModal.commentsPlaceholder')}
                      rows={4}
                      className="w-full px-3 py-2.5 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] resize-none shadow-sm placeholder-[#c8d5ce]"
                    />
                  </FieldWrap>

                  {/* Info note */}
                  <div className="flex gap-2.5 bg-white dark:bg-gray-800 rounded-xl p-3 border border-[#e2e8e5] dark:border-gray-700 shadow-sm">
                    <Info className="w-3.5 h-3.5 text-[#72A68E] flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-[#72A68E] dark:text-gray-400 leading-relaxed">
                      {t('fleet.editModal.infoNoteDiagram')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════ DAMAGE TAB (unchanged logic) ══════════ */}
            {activeTab === 'damage' && (
              <div className="p-4 sm:p-5 space-y-5">
                <SectionTitle>{t('fleet.editModal.tabDamageMapping')}</SectionTitle>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Car className="w-3.5 h-3.5 text-[#025940]" />
                    <p className="text-xs text-[#8a9e94] font-medium">{t('fleet.editModal.vehicleDiagramLabel')}</p>
                  </div>
                  <div className="bg-[#f8faf9] dark:bg-gray-800 rounded-xl p-3 border border-[#e2e8e5] dark:border-gray-700">
                    <VehicleDiagramSelector
                      value={formData.vehicleDiagramType}
                      onChange={val => handleInputChange('vehicleDiagramType', val)}
                    />
                    <p className="mt-2 text-[10px] text-[#8a9e94]">
                      {t('fleet.editModal.diagramHint')}
                    </p>
                  </div>
                </div>

                <DamageMapView
                  diagramType={formData.vehicleDiagramType}
                  pins={formData.damagePins}
                  onChange={pins => handleInputChange('damagePins', pins)}
                />
              </div>
            )}

          </form>
        </div>

        {/* ── Action bar — dark forest, matches all other modals ── */}
        <div className="flex-shrink-0 bg-[#012619] border-t-2 border-[#b3f243]/20 px-4 sm:px-6 py-3">
          <div className="flex gap-2 sm:gap-3">

            {/* Delete — only shown when onDelete prop is provided */}
            {onDelete && (
              <Button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="bg-[#fee2e2] hover:bg-[#fecaca] text-[#991b1b] font-semibold py-2.5 text-sm border border-[#fca5a5] shadow-none flex items-center justify-center gap-2 px-4 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">{t('fleet.editModal.deleteBtn')}</span>
              </Button>
            )}

            {/* Cancel */}
            <Button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white font-semibold py-2.5 text-sm border border-white/20 shadow-none transition-colors disabled:opacity-50"
            >
              {t('fleet.editModal.cancelBtn')}
            </Button>

            {/* Save */}
            <Button
              type="submit"
              form="fleet-edit-form"
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 bg-[#b3f243] hover:bg-[#c8f76a] text-[#012619] font-bold py-2.5 text-sm border-0 shadow-none flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? t('fleet.editModal.savingBtn') : t('fleet.editModal.saveBtn')}</span>
            </Button>
          </div>
        </div>

      </div>
    </div>
  )
}