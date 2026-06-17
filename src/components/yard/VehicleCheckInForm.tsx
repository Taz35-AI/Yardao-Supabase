// src/components/yard/VehicleCheckInForm.tsx
// Restyled: Yardao brand colours — consistent with full modal suite
// ALL logic, hooks, handlers, damage section, insurance toggle, contract colour, ghost-tap guard preserved
// ✅ FIX: Defleeted vehicles are now filtered out of the selection list
//         The filteredVehicles useMemo strips any vehicle where isDefleeted === true
//         or currentStatus === 'defleeted' before slicing/searching — so they never
//         appear in the list regardless of what the parent passes in.
'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  X,
  Search,
  Car,
  Plus,
  CheckCircle,
  Clock,
  Wrench,
  XCircle,
  Gauge,
  Calendar,
  Shield,
  AlertTriangle,
  Edit,
  Info,
  FileText,
  Settings,
  MessageSquare,
  Truck,
  ArrowLeftCircle
} from 'lucide-react'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

import { VehicleFormData, Contract, InsuranceStatus } from '@/types'
import { contractService } from '@/lib/contractService'
import { vehicleLookupService } from '@/lib/services/vehicleLookupService'
import { settingsService, ContractDefaultStatuses, ServiceSettings, DEFAULT_SERVICE_SETTINGS } from '@/lib/services/settingsService'
import { vehicleServiceHistoryService } from '@/lib/services/vehicleServiceHistoryService'
import { mileageService } from '@/lib/services/mileageService'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { InsuranceToggle } from '@/components/common/ui/InsuranceToggle'
import { DamageSection } from '@/components/common/DamageMapper/DamageSection'
import { DamagePin, VehicleDiagramType } from '@/components/common/DamageMapper/DamageMapper'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FleetVehicle {
  id: string
  registration?: string | null
  make?: string | null
  model?: string | null
  colour?: string | null
  size?: string | null
  condition?: string | null
  contract?: string | null
  insuranceStatus?: InsuranceStatus | null
  motExpiry?: string | null
  taxExpiry?: string | null
  comments?: string | null
  vehicleDiagramType?: VehicleDiagramType | null
  damagePins?: DamagePin[]
  // defleet fields — used to filter the vehicle out of the list
  isDefleeted?: boolean
  currentStatus?: string
}

interface CheckedInVehicle {
  id: string
  registration?: string | null
  make?: string | null
  model?: string | null
  contract?: string | null
  [key: string]: any
}

interface ConditionCategory {
  id: string
  name: string
}

interface VehicleCheckInFormProps {
  vehicles: FleetVehicle[]
  conditions: ConditionCategory[]
  checkedInVehicles?: CheckedInVehicle[]
  onCheckIn?: (data: VehicleFormData) => Promise<void>
  onCancel: () => void
  // When a user picks a vehicle that's currently Out on Hire, the picker
  // surfaces a "Return" affordance instead of disabling the row. The parent
  // is expected to close this form and open the QuickCheckInModal.
  onReturnFromHire?: (vehicle: CheckedInVehicle) => void
  // When a user picks a vehicle that's still IN THIS YARD but flagged "in transit"
  // (checked out to another branch that never received it), the picker surfaces a
  // "Cancel transfer" affordance instead of a dead "In yard" badge. The parent is
  // expected to close this form and open the cancel-transfer confirmation.
  onCancelTransfer?: (vehicle: CheckedInVehicle) => void
  // When a user picks a vehicle currently checked out to an external garage
  // (transferStatus 'at_external_garage'), the picker surfaces a "Return from
  // garage" affordance instead of a dead "In yard" badge. The parent closes
  // this form and runs the return-from-garage flow.
  onReturnFromGarage?: (vehicle: CheckedInVehicle) => void
}

type VehicleStatus = 'Ready' | 'Pending checks' | 'Repairs needed' | 'Non-Starter'

// ─── Status config (unchanged) ───────────────────────────────────────────────

const getStatusConfig = (status: VehicleStatus) => {
  switch (status) {
    case 'Ready':         return { icon: CheckCircle, color: 'text-green-600',  bgColor: 'bg-green-50 dark:bg-green-900/20',   borderColor: 'border-green-500',  label: 'Ready',          description: 'Available for use', labelKey: 'yardCheckin.statusReadyLabel',       descKey: 'yardCheckin.statusReadyDesc' }
    case 'Pending checks':return { icon: Clock,        color: 'text-yellow-600', bgColor: 'bg-yellow-50 dark:bg-yellow-900/20', borderColor: 'border-yellow-500', label: 'Pending checks', description: 'Requires attention', labelKey: 'yardCheckin.statusPendingLabel',     descKey: 'yardCheckin.statusPendingDesc' }
    case 'Repairs needed':return { icon: Wrench,       color: 'text-orange-600', bgColor: 'bg-orange-50 dark:bg-orange-900/20', borderColor: 'border-orange-500', label: 'Repairs needed', description: 'Needs repair work', labelKey: 'yardCheckin.statusRepairsLabel',     descKey: 'yardCheckin.statusRepairsDesc' }
    case 'Non-Starter':   return { icon: XCircle,      color: 'text-red-600',    bgColor: 'bg-red-50 dark:bg-red-900/20',       borderColor: 'border-red-500',    label: 'Non-Starter',    description: 'Cannot start', labelKey: 'yardCheckin.statusNonStarterLabel', descKey: 'yardCheckin.statusNonStarterDesc' }
  }
}

// ─── Shared input className ───────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2.5 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] shadow-sm placeholder-[#c8d5ce]'
const labelCls = 'text-xs text-[#8a9e94] font-medium mb-1.5'

// ─── Section label ────────────────────────────────────────────────────────────

const SectionLabel = ({ icon: Icon, children }: { icon: any; children: React.ReactNode }) => (
  <div className="flex items-center gap-2 mb-3">
    <Icon className="w-3.5 h-3.5 text-[#025940]" />
    <p className="text-[10px] font-bold text-[#8a9e94] uppercase tracking-widest">{children}</p>
  </div>
)

// ─── Component ────────────────────────────────────────────────────────────────

export function VehicleCheckInForm({
  vehicles,
  conditions,
  checkedInVehicles = [],
  onCheckIn,
  onCancel,
  onReturnFromHire,
  onCancelTransfer,
  onReturnFromGarage
}: VehicleCheckInFormProps) {
  const { user } = useAuth()
  const t = useT()
  const [loading, setLoading]                               = useState(false)
  const [customVehicle, setCustomVehicle]                   = useState(false)
  const [selectedFleetVehicle, setSelectedFleetVehicle]     = useState<FleetVehicle | null>(null)
  const [searchTerm, setSearchTerm]                         = useState('')
  const [contracts, setContracts]                           = useState<Contract[]>([])
  const [contractsLoading, setContractsLoading]             = useState(true)
  const [contractDefaults, setContractDefaults]             = useState<ContractDefaultStatuses>({})
  const [activeTab, setActiveTab]                           = useState<'details' | 'damage'>('details')

  // ── Mileage capture + service-due (org settings, migration 0043) ──────────
  const [organizationId, setOrganizationId]                 = useState<string | null>(null)
  const [serviceSettings, setServiceSettings]               = useState<ServiceSettings>(DEFAULT_SERVICE_SETTINGS)
  // "Odometer not available" escape — satisfies the mandatory-mileage gate for
  // genuine non-runners / unreadable dashboards.
  const [mileageNA, setMileageNA]                           = useState(false)
  // Live "service due" preview computed from the entered mileage vs the
  // vehicle's last recorded service mileage.
  const [serviceDuePreview, setServiceDuePreview]           = useState<{ overdueBy: number; lastMileage: number } | null>(null)
  const serviceCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Anti-clocking floor — highest mileage ever recorded for this reg.
  const [mileageFloor, setMileageFloor]                     = useState<number | null>(null)
  const floorCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // DVLA lookup (custom vehicle only) — same service the fleet add-vehicle form uses.
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError]     = useState<string | null>(null)
  const [lookupDone, setLookupDone]       = useState(false)

  const lastVisibilityRestoreRef = useRef<number>(0)

  const [formData, setFormData] = useState<VehicleFormData>({
    registration: '',
    make: '',
    model: '',
    colour: '',
    size: '',
    condition: conditions[0]?.name || '',
    status: 'Pending checks',
    mileage: '',
    notes: '',
    contract: '',
    contractColor: '',
    insuranceStatus: 'Not Insured',
    motExpiry: '',
    taxExpiry: '',
    comments: '',
    damagePins: [],
    vehicleDiagramType: null,
  })

  // ── Visibility / ghost-tap guard (unchanged) ──────────────────────────────
  useEffect(() => {
    const handleVisible = () => {
      if (!document.hidden) lastVisibilityRestoreRef.current = Date.now()
    }
    document.addEventListener('visibilitychange', handleVisible)

    let capacitorHandle: any = null
    if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
      import('@capacitor/app').then(({ App }) => {
        capacitorHandle = App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) lastVisibilityRestoreRef.current = Date.now()
        })
      }).catch(() => {})
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisible)
      capacitorHandle?.remove?.()
    }
  }, [])

  // ── Load contracts + per-contract default check-in statuses ──────────────
  useEffect(() => {
    const loadContracts = async () => {
      if (!user) return
      try {
        setContractsLoading(true)
        const profile = await userProfileService.getProfile(user.uid)
        if (profile?.organizationId) {
          setOrganizationId(profile.organizationId)
          const [contractsList, defaults, svcSettings] = await Promise.all([
            contractService.getContracts(profile.organizationId),
            settingsService.getContractDefaultStatuses(profile.organizationId),
            settingsService.getServiceSettings(profile.organizationId),
          ])
          setContracts(contractsList)
          setContractDefaults(defaults)
          setServiceSettings(svcSettings)
        }
      } catch (error) {
        logger.error('Error loading contracts:', error)
      } finally {
        setContractsLoading(false)
      }
    }
    loadContracts()
  }, [user])

  // ── Live "service due" preview ────────────────────────────────────────────
  // Debounced: when the org has the feature on and the user has entered a
  // mileage for a known reg, look up the last service mileage and show an
  // inline warning if the gap is past the org threshold. Purely advisory — the
  // authoritative flag is recomputed + persisted in checkInVehicle on submit.
  useEffect(() => {
    if (serviceCheckRef.current) clearTimeout(serviceCheckRef.current)
    setServiceDuePreview(null)

    if (!serviceSettings.serviceDueEnabled || mileageNA || !organizationId) return
    const reg = formData.registration.trim()
    const miles = parseInt((formData.mileage || '').replace(/[,\s]/g, ''), 10)
    if (!reg || !Number.isFinite(miles) || miles <= 0) return

    serviceCheckRef.current = setTimeout(async () => {
      try {
        const last = await vehicleServiceHistoryService.getLastServiceMileage(organizationId, reg)
        if (!last || !Number.isFinite(last.mileage)) return
        const overdueBy = miles - last.mileage
        if (overdueBy >= serviceSettings.serviceDueThresholdMiles) {
          setServiceDuePreview({ overdueBy, lastMileage: last.mileage })
        }
      } catch {
        /* advisory only — never block the form on a lookup error */
      }
    }, 600)

    return () => { if (serviceCheckRef.current) clearTimeout(serviceCheckRef.current) }
  }, [formData.mileage, formData.registration, mileageNA, organizationId, serviceSettings])

  // ── Anti-clocking floor lookup ────────────────────────────────────────────
  // Debounced on the registration: fetch the highest mileage ever recorded for
  // this reg so we can block a reading lower than it (e.g. a throwaway "1").
  useEffect(() => {
    if (floorCheckRef.current) clearTimeout(floorCheckRef.current)
    setMileageFloor(null)
    if (!organizationId) return
    const reg = formData.registration.trim()
    if (!reg) return
    floorCheckRef.current = setTimeout(async () => {
      try {
        setMileageFloor(await mileageService.getMileageFloor(organizationId, reg))
      } catch {
        /* advisory — never block on a lookup error */
      }
    }, 600)
    return () => { if (floorCheckRef.current) clearTimeout(floorCheckRef.current) }
  }, [formData.registration, organizationId])

  // Entered mileage is below the recorded floor → block + show the reason.
  const mileageBelowFloor = (() => {
    if (mileageNA || mileageFloor === null) return false
    const entered = parseInt((formData.mileage || '').replace(/[,\s]/g, ''), 10)
    return Number.isFinite(entered) && entered < mileageFloor
  })()

  // ── Helpers (unchanged) ──────────────────────────────────────────────────

  const safeString = (value: any): string => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    try { return String(value) } catch { return '' }
  }

  const getContractColor = (contractName: string): string => {
    if (!contractName || contractName.trim() === '') return ''
    return contracts.find(c => c.name === contractName)?.color || ''
  }

  // Resolve the org-configured default check-in status for a given contract name.
  // Returns 'Pending checks' when no contract is selected or no override exists.
  const getDefaultStatusForContract = (contractName: string): VehicleStatus => {
    if (!contractName || contractName.trim() === '') return 'Pending checks'
    const contract = contracts.find(c => c.name === contractName)
    if (!contract) return 'Pending checks'
    return contractDefaults[contract.id] ?? 'Pending checks'
  }

  // 4-state classifier — distinguishes "already in yard" (block check-in) from
  // "currently out on hire" (offer a quick Return) from "in transit but still
  // physically here" (offer to cancel the stuck transfer) from "available".
  const getRegistrationState = (
    registration: string
  ): { state: 'available' | 'in_yard' | 'on_hire' | 'in_transit' | 'at_garage'; vehicle: CheckedInVehicle | null } => {
    if (!registration.trim()) return { state: 'available', vehicle: null }
    const cleanReg = registration.trim().toLowerCase().replace(/\s+/g, '')
    const match = checkedInVehicles.find(v => {
      const vehicleReg = safeString(v.registration).trim().toLowerCase().replace(/\s+/g, '')
      return vehicleReg === cleanReg
    }) || null
    if (!match) return { state: 'available', vehicle: null }
    // A vehicle checked out to another branch that was never received is still
    // physically here (transferStatus 'in_transit'). Surface it so the user can
    // cancel the stuck transfer instead of hitting a dead "In yard" badge.
    if ((match as any).transferStatus === 'in_transit') {
      return { state: 'in_transit', vehicle: match }
    }
    // Checked out to an external garage — offer "Return from garage" rather than
    // a dead "In yard" badge (same idea as on-hire return / cancel-transfer).
    if ((match as any).transferStatus === 'at_external_garage') {
      return { state: 'at_garage', vehicle: match }
    }
    return {
      state: (match as any).hireStatus === 'Out on Hire' ? 'on_hire' : 'in_yard',
      vehicle: match,
    }
  }

  // Back-compat boolean — only used by the form-data conflict warning, which
  // should fire for BOTH already-in-yard and already-on-hire to prevent a
  // manual re-entry of the same reg via the custom flow.
  const isRegistrationCheckedIn = (registration: string): boolean => {
    return getRegistrationState(registration).state !== 'available'
  }

  // ── filteredVehicles — strips defleeted FIRST, then searches ─────────────
  // This is the fix: isDefleeted === true or currentStatus === 'defleeted'
  // means the vehicle has been removed from the fleet and must never appear
  // in the check-in list, regardless of what the parent component passes in.
  const filteredVehicles = useMemo(() => {
    const activeVehicles = vehicles.filter(
      v => v.isDefleeted !== true && v.currentStatus !== 'defleeted'
    )

    if (!searchTerm.trim()) return activeVehicles.slice(0, 10)

    const term = searchTerm.toLowerCase().trim()
    return activeVehicles.filter(v => {
      const reg   = safeString(v.registration).toLowerCase()
      const make  = safeString(v.make).toLowerCase()
      const model = safeString(v.model).toLowerCase()
      return reg.includes(term) || make.includes(term) || model.includes(term) || `${make} ${model}`.includes(term)
    }).slice(0, 20)
  }, [searchTerm, vehicles])

  const currentRegistrationConflict = useMemo(() => {
    if (!formData.registration.trim()) return null
    return isRegistrationCheckedIn(formData.registration) ? t('yardCheckin.alreadyCheckedIn') : null
  }, [formData.registration, checkedInVehicles])

  const isFleetVehicleMode = Boolean(selectedFleetVehicle)

  // ── Handlers (all unchanged) ──────────────────────────────────────────────

  const handleChange = (field: string, value: any) => {
    logger.log(`📝 Form field changed: ${field} = ${value}`)
    setFormData(prev => {
      const newData = { ...prev, [field]: value }
      if (field === 'contract' && typeof value === 'string') {
        const color = getContractColor(value)
        newData.contractColor = color
        logger.log(`🎨 Contract color updated: ${color || 'none'}`)
        const defaultStatus = getDefaultStatusForContract(value)
        newData.status = defaultStatus
        logger.log(`🏷️ Contract default status applied: ${defaultStatus}`)
      }
      return newData
    })
  }

  const handleInsuranceToggle = (status: InsuranceStatus) => {
    logger.log(`🛡️ Insurance status toggled to: ${status}`)
    handleChange('insuranceStatus', status)
  }

  // Look the registration up against DVLA and auto-fill make / model / colour /
  // MOT / road-tax. Only offered for custom (non-fleet) check-ins, since fleet
  // vehicles already carry these from the fleet record.
  const handleLookup = async () => {
    const reg = formData.registration.trim()
    if (!reg) { setLookupError(t('yardCheckin.lookupEnterReg')); setLookupDone(false); return }
    setLookupLoading(true)
    setLookupError(null)
    setLookupDone(false)
    try {
      const data = await vehicleLookupService.lookup(reg)
      setFormData(prev => ({
        ...prev,
        registration: data.registration || prev.registration,
        make:   data.make   || prev.make,
        model:  data.model  || prev.model,
        colour: data.colour || prev.colour,
        // DVLA returns ISO dates (YYYY-MM-DD) — ready for the date inputs.
        motExpiry: data.motExpiry || prev.motExpiry,
        taxExpiry: data.taxExpiry || prev.taxExpiry,
      }))
      setLookupDone(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : t('yardCheckin.lookupFailed')
      setLookupError(message.replace(/[⚠️❌]/g, '').trim())
    } finally {
      setLookupLoading(false)
    }
  }

  const handleFleetVehicleSelect = (vehicle: FleetVehicle) => {
    setSelectedFleetVehicle(vehicle)
    const contractName    = safeString(vehicle.contract)
    const contractColor   = getContractColor(contractName)
    const defaultStatus   = getDefaultStatusForContract(contractName)
    const insuranceStatus = vehicle.insuranceStatus || null
    logger.log(`🚗 Fleet vehicle selected: ${vehicle.registration}`)
    logger.log(`📋 Contract: ${contractName || 'none'}, Color: ${contractColor || 'none'}`)
    logger.log(`🏷️ Default check-in status: ${defaultStatus}`)
    logger.log(`🛡️ Insurance Status: ${insuranceStatus || 'not set'}`)
    setFormData({
      id:                 vehicle.id,
      registration:       safeString(vehicle.registration),
      make:               safeString(vehicle.make),
      model:              safeString(vehicle.model),
      colour:             safeString(vehicle.colour),
      size:               safeString(vehicle.size),
      condition:          safeString(vehicle.condition) || conditions[0]?.name || '',
      status:             defaultStatus,
      mileage:            '',
      notes:              '',
      contract:           contractName,
      contractColor:      contractColor,
      insuranceStatus:    insuranceStatus,
      motExpiry:          safeString(vehicle.motExpiry),
      taxExpiry:          safeString(vehicle.taxExpiry),
      comments:           safeString(vehicle.comments),
      damagePins:         vehicle.damagePins || [],
      vehicleDiagramType: vehicle.vehicleDiagramType || null,
    })
  }

  const handleBackToSelection = () => {
    if (Date.now() - lastVisibilityRestoreRef.current < 800) {
      logger.log('🛡️ Ghost tap blocked on Back to Selection')
      return
    }
    setSelectedFleetVehicle(null)
    setMileageNA(false)
    setFormData({
      registration: '', make: '', model: '', colour: '', size: '',
      condition: conditions[0]?.name || '', status: 'Pending checks',
      mileage: '', notes: '', contract: '', contractColor: '',
      insuranceStatus: 'Not Insured', motExpiry: '', taxExpiry: '', comments: '',
      damagePins: [], vehicleDiagramType: null,
    })
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (currentRegistrationConflict) {
      alert(t('yardCheckin.cannotCheckIn', { msg: currentRegistrationConflict }))
      return
    }
    // Mandatory-mileage gate — only when the org has it enabled, and bypassed
    // when the user explicitly marked the odometer unavailable.
    if (serviceSettings.captureMileageOnCheckIn && !mileageNA && !formData.mileage.trim()) {
      alert(t('yardCheckin.mileageRequired'))
      return
    }
    // Anti-clocking: a reading below the highest-ever recorded is rejected.
    if (mileageBelowFloor && mileageFloor !== null) {
      alert(t('yardCheckin.mileageTooLow', { min: mileageFloor.toLocaleString('en-GB') }))
      return
    }
    if (!onCheckIn) return
    setLoading(true)
    try {
      const payload: VehicleFormData = {
        ...formData,
        // When odometer marked unavailable, store no mileage (keeps numeric
        // stats clean) and signal the bypass downstream.
        mileage: mileageNA ? '' : formData.mileage,
        mileageNotAvailable: mileageNA,
      }
      logger.log('🚀 Submitting check-in with data:', payload)
      await onCheckIn(payload)
      onCancel()
    } catch (error) {
      logger.error('Check-in failed:', error)
      alert(t('yardCheckin.checkInFailed'))
    } finally {
      setLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-3 sm:p-4 z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col border border-[#e2e8e5] dark:border-gray-700">

        {/* ── Header ── */}
        <div className="flex-shrink-0 bg-[#012619] px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 bg-[#b3f243]/10 border border-[#b3f243]/30 rounded-xl p-2">
              <Car className="w-4 h-4 text-[#b3f243]" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm">{t('yardCheckin.title')}</p>
              <p className="text-[#72A68E] text-xs mt-0.5">
                {isFleetVehicleMode
                  ? t('yardCheckin.subFleet', { reg: safeString(selectedFleetVehicle?.registration) })
                  : customVehicle
                  ? t('yardCheckin.subCustom')
                  : t('yardCheckin.subSelect')}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg text-[#72A68E] hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ═══ SELECTION SCREEN ═══ */}
          {!selectedFleetVehicle && !customVehicle && (
            <div className="p-4 sm:p-5 space-y-4">

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8a9e94]" />
                <input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder={t('yardCheckin.searchPlaceholder')}
                  className={`${inputCls} pl-9`}
                />
              </div>

              {/* Fleet vehicle list */}
              <div className="border border-[#e2e8e5] dark:border-gray-700 rounded-xl overflow-hidden">
                {filteredVehicles.length > 0 ? (
                  <div className="divide-y divide-[#e2e8e5] dark:divide-gray-700 max-h-64 overflow-y-auto">
                    {filteredVehicles.map(vehicle => {
                      const regState = getRegistrationState(safeString(vehicle.registration))
                      const isInYard = regState.state === 'in_yard'
                      const isOnHire = regState.state === 'on_hire'
                      const isInTransit = regState.state === 'in_transit'
                      const isAtGarage = regState.state === 'at_garage'
                      const isClickable = !isInYard
                      const handleRowClick = () => {
                        if (isInYard) return
                        if (isInTransit && regState.vehicle && onCancelTransfer) {
                          onCancelTransfer(regState.vehicle)
                          return
                        }
                        if (isAtGarage && regState.vehicle && onReturnFromGarage) {
                          onReturnFromGarage(regState.vehicle)
                          return
                        }
                        if (isOnHire && regState.vehicle && onReturnFromHire) {
                          onReturnFromHire(regState.vehicle)
                          return
                        }
                        handleFleetVehicleSelect(vehicle)
                      }
                      return (
                        <button
                          key={vehicle.id}
                          type="button"
                          onClick={handleRowClick}
                          disabled={isInYard}
                          className={`w-full px-4 py-3 text-left transition-all flex items-center justify-between gap-3 ${
                            isInYard
                              ? 'bg-[#f8faf9] dark:bg-gray-800/50 cursor-not-allowed opacity-60'
                              : isInTransit
                                // Stronger amber attention — the vehicle is physically here
                                // but stuck "in transit"; clicking offers to cancel the transfer.
                                ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/30'
                                : isAtGarage
                                  // Orange tint — vehicle is away at a garage; clicking returns it.
                                  ? 'bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:hover:bg-orange-900/30'
                                : isOnHire
                                  // Soft amber tint — signals "this is a return, not a check-in"
                                  // without screaming for attention. Hover deepens slightly.
                                  ? 'bg-amber-50/70 hover:bg-amber-100/80 dark:bg-amber-900/15 dark:hover:bg-amber-900/25'
                                  : 'hover:bg-[#f0f4f2] dark:hover:bg-gray-800'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-1.5 bg-[#025940]/10 dark:bg-[#025940]/20 rounded-lg flex-shrink-0">
                              <Car className="w-3 h-3 text-[#025940] dark:text-[#72A68E]" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-[#012619] dark:text-white tracking-wide">
                                  {safeString(vehicle.registration) || t('yardCheckin.noRegistration')}
                                </span>
                                {isInYard && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
                                    <CheckCircle className="w-2.5 h-2.5" />
                                    {t('yardCheckin.badgeInYard')}
                                  </span>
                                )}
                                {isOnHire && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#012619] text-white border border-[#012619]">
                                    <Truck className="w-2.5 h-2.5" />
                                    {t('yardCheckin.badgeOnHire')}
                                  </span>
                                )}
                                {isInTransit && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                    <Truck className="w-2.5 h-2.5" />
                                    {t('yardCheckin.badgeInTransit')}
                                  </span>
                                )}
                                {isAtGarage && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border border-orange-300 dark:border-orange-700">
                                    <Wrench className="w-2.5 h-2.5" />
                                    {t('yardCheckin.badgeAtGarage')}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-[#8a9e94] truncate mt-0.5">
                                {safeString(vehicle.make)} {safeString(vehicle.model)}
                                {vehicle.size ? ` · ${safeString(vehicle.size)}` : ''}
                              </p>
                              {isInTransit && (
                                <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 truncate mt-0.5 flex items-center gap-1">
                                  <ArrowLeftCircle className="w-2.5 h-2.5 flex-shrink-0" />
                                  <span className="truncate">
                                    {regState.vehicle?.targetBranchName
                                      ? `→ ${safeString(regState.vehicle.targetBranchName)} · ${t('yardCheckin.inTransitHint')}`
                                      : t('yardCheckin.inTransitHint')}
                                  </span>
                                </p>
                              )}
                              {isAtGarage && (
                                <p className="text-[10px] font-semibold text-orange-700 dark:text-orange-400 truncate mt-0.5 flex items-center gap-1">
                                  <ArrowLeftCircle className="w-2.5 h-2.5 flex-shrink-0" />
                                  <span className="truncate">
                                    {t('yardCheckin.returnFromGarageHint', { garage: safeString((regState.vehicle as any)?.externalGarageName) || t('yardCheckin.theGarage') })}
                                  </span>
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {vehicle.insuranceStatus && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                vehicle.insuranceStatus === 'Insured'
                                  ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
                                  : 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                              }`}>
                                {vehicle.insuranceStatus}
                              </span>
                            )}
                            {vehicle.contract && vehicle.contract.trim() !== '' && (
                              <span className="text-[10px] text-[#72A68E] font-medium hidden sm:block">
                                {safeString(vehicle.contract)}
                              </span>
                            )}
                            {isInTransit ? (
                              <ArrowLeftCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            ) : isAtGarage ? (
                              <ArrowLeftCircle className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                            ) : isOnHire ? (
                              <ArrowLeftCircle className="w-3.5 h-3.5 text-[#012619] dark:text-[#72A68E]" />
                            ) : isClickable ? (
                              <Plus className="w-3.5 h-3.5 text-[#8a9e94]" />
                            ) : null}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-10 px-4">
                    <Car className="w-8 h-8 mx-auto mb-3 text-[#c8d5ce]" />
                    <p className="text-sm text-[#8a9e94]">
                      {searchTerm.trim() ? t('yardCheckin.emptySearch') : t('yardCheckin.emptyNone')}
                    </p>
                  </div>
                )}
              </div>

              {/* Custom vehicle button */}
              <button
                type="button"
                onClick={() => setCustomVehicle(true)}
                className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl border-2 border-dashed border-[#c8d5ce] dark:border-gray-600 hover:border-[#025940] dark:hover:border-[#72A68E] hover:bg-[#f0f4f2] dark:hover:bg-gray-800 transition-all group"
              >
                <div className="p-1.5 bg-[#025940]/10 dark:bg-[#025940]/20 rounded-lg group-hover:bg-[#025940]/20 transition-colors">
                  <Edit className="w-3.5 h-3.5 text-[#025940] dark:text-[#72A68E]" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-[#025940] dark:text-[#72A68E]">{t('yardCheckin.addCustom')}</p>
                  <p className="text-[10px] text-[#8a9e94]">{t('yardCheckin.addCustomHint')}</p>
                </div>
              </button>
            </div>
          )}

          {/* ═══ CHECK-IN FORM (fleet or custom) ═══ */}
          {(customVehicle || isFleetVehicleMode) && (
            <div>
              {/* Fleet vehicle info bar */}
              {isFleetVehicleMode && (
                <div className="bg-[#f8faf9] dark:bg-gray-800 border-b border-[#e2e8e5] dark:border-gray-700 px-5 py-2.5 flex items-center gap-2 flex-wrap">
                  <Car className="w-3 h-3 text-[#025940] dark:text-[#72A68E] flex-shrink-0" />
                  <span className="font-bold text-xs text-[#012619] dark:text-white tracking-wide">{formData.registration}</span>
                  <span className="text-[#c8d5ce] text-xs">·</span>
                  <span className="text-xs text-[#4a5e54] dark:text-gray-300 truncate">{formData.make} {formData.model}</span>
                  {formData.size && <><span className="text-[#c8d5ce] text-xs">·</span><span className="text-xs text-[#8a9e94]">{formData.size}</span></>}
                </div>
              )}

              {/* Tabs */}
              <div className="flex bg-[#f8faf9] dark:bg-gray-800 border-b border-[#e2e8e5] dark:border-gray-700">
                {(['details', 'damage'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-3 text-xs font-bold capitalize transition-all border-b-2 ${
                      activeTab === tab
                        ? 'border-[#b3f243] text-[#012619] dark:text-white bg-white dark:bg-gray-900'
                        : 'border-transparent text-[#8a9e94] hover:text-[#025940] dark:hover:text-gray-200'
                    }`}
                  >
                    {tab === 'details' ? t('yardCheckin.tabDetails') : t('yardCheckin.tabDamage')}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit}>

                {/* ── DETAILS TAB ── */}
                {activeTab === 'details' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#e2e8e5] dark:divide-gray-700">

                    {/* Left panel */}
                    <div className="p-4 sm:p-5 space-y-4">
                      <SectionLabel icon={Settings}>{customVehicle ? t('yardCheckin.sectionVehicleDetails') : t('yardCheckin.sectionStatusTechnical')}</SectionLabel>

                      {/* ── Custom vehicle fields ── */}
                      {customVehicle && (
                        <>
                          <div>
                            <p className={labelCls}>{t('yardCheckin.registration')}</p>
                            <div className="flex gap-2">
                              <Input
                                value={formData.registration}
                                onChange={e => { handleChange('registration', e.target.value.toUpperCase()); setLookupError(null); setLookupDone(false) }}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!lookupLoading) handleLookup() } }}
                                placeholder={t('yardCheckin.regPlaceholder')}
                                required
                                className={`${inputCls} ${currentRegistrationConflict ? '!border-red-400 !focus:border-red-400' : ''}`}
                              />
                              <button
                                type="button"
                                onClick={handleLookup}
                                disabled={lookupLoading || !formData.registration.trim()}
                                title={t('yardCheckin.lookupTitle')}
                                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 rounded-xl bg-[#025940] hover:bg-[#012619] text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {lookupLoading
                                  ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  : <Search className="w-3.5 h-3.5" />}
                                <span className="hidden sm:inline">{t('yardCheckin.lookupButton')}</span>
                              </button>
                            </div>
                            {currentRegistrationConflict && (
                              <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />{currentRegistrationConflict}
                              </p>
                            )}
                            {lookupError && (
                              <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 flex-shrink-0" />{lookupError}
                              </p>
                            )}
                            {lookupDone && !lookupError && (
                              <p className="text-[10px] text-[#025940] dark:text-[#72A68E] mt-1 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3 flex-shrink-0" />{t('yardCheckin.lookupSuccess')}
                              </p>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className={labelCls}>{t('yardCheckin.make')}</p>
                              <Input value={formData.make} onChange={e => handleChange('make', e.target.value)} placeholder={t('yardCheckin.makePlaceholder')} required className={inputCls} />
                            </div>
                            <div>
                              <p className={labelCls}>{t('yardCheckin.model')}</p>
                              <Input value={formData.model} onChange={e => handleChange('model', e.target.value)} placeholder={t('yardCheckin.modelPlaceholder')} required className={inputCls} />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className={labelCls}>{t('yardCheckin.colour')}</p>
                              <Input value={formData.colour} onChange={e => handleChange('colour', e.target.value)} placeholder={t('yardCheckin.colourPlaceholder')} className={inputCls} />
                            </div>
                            <div>
                              <p className={labelCls}>{t('yardCheckin.size')}</p>
                              <Input value={formData.size} onChange={e => handleChange('size', e.target.value)} placeholder={t('yardCheckin.sizePlaceholder')} required className={inputCls} />
                            </div>
                          </div>
                        </>
                      )}

                      {/* Status grid */}
                      <div>
                        <p className={labelCls}>{t('yardCheckin.status')}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {(['Ready', 'Pending checks', 'Repairs needed', 'Non-Starter'] as VehicleStatus[]).map(s => {
                            const cfg      = getStatusConfig(s)
                            const Icon     = cfg.icon
                            const isSelected = formData.status === s
                            return (
                              <button
                                key={s}
                                type="button"
                                onClick={() => handleChange('status', s)}
                                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                                  isSelected
                                    ? `${cfg.borderColor} ${cfg.bgColor}`
                                    : 'border-[#e2e8e5] dark:border-gray-700 hover:border-[#72A68E]'
                                }`}
                              >
                                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? cfg.color : 'text-[#8a9e94]'}`} />
                                <div className="min-w-0">
                                  <p className={`text-xs font-bold leading-tight ${isSelected ? cfg.color : 'text-[#012619] dark:text-white'}`}>{t(cfg.labelKey)}</p>
                                  <p className="text-[9px] text-[#8a9e94] truncate">{t(cfg.descKey)}</p>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {/* Condition */}
                      <div>
                        <p className={labelCls}>{t('yardCheckin.condition')}</p>
                        <select
                          value={formData.condition}
                          onChange={e => handleChange('condition', e.target.value)}
                          required
                          className={inputCls}
                        >
                          <option value="">{t('yardCheckin.selectCondition')}</option>
                          {conditions.map(c => (
                            <option key={c.id} value={c.name}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Mileage */}
                      <div>
                        <p className={labelCls}>
                          {t('yardCheckin.mileage')}
                          {serviceSettings.captureMileageOnCheckIn && (
                            <span className="text-red-500 ml-0.5">*</span>
                          )}
                        </p>
                        <div className="relative">
                          <Gauge className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8a9e94]" />
                          <input
                            type="number"
                            value={mileageNA ? '' : formData.mileage}
                            onChange={e => handleChange('mileage', e.target.value)}
                            placeholder={t('yardCheckin.mileagePlaceholder')}
                            disabled={mileageNA}
                            className={`${inputCls} pl-9 ${mileageNA ? 'opacity-50 cursor-not-allowed' : ''} ${
                              serviceSettings.captureMileageOnCheckIn && !mileageNA && !formData.mileage.trim()
                                ? '!border-amber-300' : ''
                            }`}
                          />
                        </div>

                        {/* Odometer-not-available escape (keeps non-runners moving) */}
                        {serviceSettings.captureMileageOnCheckIn && (
                          <label className="mt-2 flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={mileageNA}
                              onChange={e => {
                                setMileageNA(e.target.checked)
                                if (e.target.checked) handleChange('mileage', '')
                              }}
                              className="w-3.5 h-3.5 rounded border-[#c8d5ce] text-[#025940] focus:ring-[#025940]/30"
                            />
                            <span className="text-[11px] text-[#8a9e94]">{t('yardCheckin.mileageNotAvailable')}</span>
                          </label>
                        )}

                        {/* Anti-clocking error */}
                        {mileageBelowFloor && mileageFloor !== null && (
                          <p className="mt-2 text-[11px] text-red-500 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                            {t('yardCheckin.mileageTooLow', { min: mileageFloor.toLocaleString('en-GB') })}
                          </p>
                        )}

                        {/* Live service-due warning */}
                        {serviceDuePreview && (
                          <div className="mt-2 flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl px-3 py-2">
                            <Wrench className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
                              {t('yardCheckin.serviceDueWarning', {
                                miles: serviceDuePreview.overdueBy.toLocaleString('en-GB'),
                                last: serviceDuePreview.lastMileage.toLocaleString('en-GB'),
                              })}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* MOT & Tax — read-only for fleet vehicles (Fleet is the
                          source of truth; edit them on the Fleet page). Custom,
                          non-fleet check-ins stay editable since there's no fleet
                          record to defer to. */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className={labelCls}>{t('yardCheckin.motExpiry')}</p>
                          {isFleetVehicleMode ? (
                            <div className="px-3 py-2.5 text-sm border border-[#e2e8e5] dark:border-gray-700 rounded-xl bg-[#f8faf9] dark:bg-gray-800 text-[#4a5e54] dark:text-gray-300">
                              {formData.motExpiry ? formData.motExpiry.slice(0, 10).split('-').reverse().join('/') : '—'}
                            </div>
                          ) : (
                            <input type="date" value={formData.motExpiry || ''} onChange={e => handleChange('motExpiry', e.target.value)} className={inputCls} />
                          )}
                        </div>
                        <div>
                          <p className={labelCls}>{t('yardCheckin.taxExpiry')}</p>
                          {isFleetVehicleMode ? (
                            <div className="px-3 py-2.5 text-sm border border-[#e2e8e5] dark:border-gray-700 rounded-xl bg-[#f8faf9] dark:bg-gray-800 text-[#4a5e54] dark:text-gray-300">
                              {formData.taxExpiry ? formData.taxExpiry.slice(0, 10).split('-').reverse().join('/') : '—'}
                            </div>
                          ) : (
                            <input type="date" value={formData.taxExpiry || ''} onChange={e => handleChange('taxExpiry', e.target.value)} className={inputCls} />
                          )}
                        </div>
                      </div>
                      {isFleetVehicleMode && (
                        <p className="text-[10px] text-[#8a9e94] mt-1">{t('yardCheckin.motTaxFromFleet')}</p>
                      )}
                    </div>

                    {/* Right panel */}
                    <div className="p-4 sm:p-5 space-y-4">
                      <SectionLabel icon={FileText}>{t('yardCheckin.sectionInsurance')}</SectionLabel>

                      {/* Insurance */}
                      <div>
                        <p className={labelCls}>{t('yardCheckin.insuranceStatus')}</p>
                        <div className="bg-[#f8faf9] dark:bg-gray-800 rounded-xl p-3 border border-[#e2e8e5] dark:border-gray-700 space-y-2">
                          <InsuranceToggle
                            insuranceStatus={formData.insuranceStatus}
                            onToggle={handleInsuranceToggle}
                            disabled={loading}
                            size="md"
                            showLabel={true}
                          />
                          <p className="text-[10px] text-[#8a9e94] leading-relaxed">
                            {formData.insuranceStatus === 'Insured'
                              ? t('yardCheckin.insuranceInsured')
                              : formData.insuranceStatus === 'Not Insured'
                              ? t('yardCheckin.insuranceNotInsured')
                              : t('yardCheckin.insuranceUnset')}
                          </p>
                        </div>
                      </div>

                      {/* Contract */}
                      <div>
                        <p className={labelCls}>{t('yardCheckin.contractAssignment')}</p>
                        {contractsLoading ? (
                          <div className="flex items-center px-3 py-2.5 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#8a9e94]">
                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b border-[#025940] mr-2" />
                            {t('yardCheckin.loadingContracts')}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <select
                              value={formData.contract}
                              onChange={e => handleChange('contract', e.target.value)}
                              className={inputCls}
                            >
                              <option value="">{t('yardCheckin.noContract')}</option>
                              {contracts.map(c => (
                                <option key={c.id} value={c.name}>
                                  {c.name}{c.isDefault ? t('yardCheckin.defaultSuffix') : ''}
                                </option>
                              ))}
                            </select>

                            {formData.contract && formData.contractColor && (
                              <div className="flex items-center gap-2.5 bg-[#f8faf9] dark:bg-gray-800 rounded-xl px-3 py-2 border border-[#e2e8e5] dark:border-gray-700">
                                <div className="w-4 h-4 rounded-full border-2 border-white shadow-sm flex-shrink-0" style={{ backgroundColor: formData.contractColor }} />
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{
                                  backgroundColor: formData.contractColor,
                                  color: (() => {
                                    const hex = formData.contractColor.replace('#', '')
                                    const r = parseInt(hex.substring(0, 2), 16)
                                    const g = parseInt(hex.substring(2, 4), 16)
                                    const b = parseInt(hex.substring(4, 6), 16)
                                    return (r * 299 + g * 587 + b * 114) / 1000 > 128 ? '#000' : '#fff'
                                  })()
                                }}>{formData.contract}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Notes */}
                      <div>
                        <p className={labelCls}>{t('yardCheckin.notes')}</p>
                        <textarea
                          value={formData.notes}
                          onChange={e => handleChange('notes', e.target.value)}
                          placeholder={t('yardCheckin.notesPlaceholder')}
                          rows={3}
                          className={`${inputCls} resize-none`}
                        />
                      </div>

                      {/* Comments */}
                      <div>
                        <p className={labelCls}>{t('yardCheckin.comments')}</p>
                        <textarea
                          value={formData.comments || ''}
                          onChange={e => handleChange('comments', e.target.value)}
                          placeholder={t('yardCheckin.commentsPlaceholder')}
                          rows={3}
                          className={`${inputCls} resize-none`}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* ── DAMAGE TAB (unchanged) ── */}
                {activeTab === 'damage' && (
                  <div className="p-4 sm:p-5">
                    <SectionLabel icon={AlertTriangle}>{t('yardCheckin.sectionDamage')}</SectionLabel>
                    {formData.vehicleDiagramType ? (
                      <DamageSection
                        diagramType={formData.vehicleDiagramType}
                        pins={formData.damagePins || []}
                        onChange={pins => handleChange('damagePins', pins)}
                      />
                    ) : (
                      <div className="flex items-start gap-3 bg-[#f8faf9] dark:bg-gray-800 rounded-xl p-4 border border-[#e2e8e5] dark:border-gray-700">
                        <Info className="w-4 h-4 text-[#72A68E] flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-[#72A68E] dark:text-gray-400 leading-relaxed">
                          {t('yardCheckin.noDiagram')}
                        </p>
                      </div>
                    )}
                  </div>
                )}

              </form>
            </div>
          )}
        </div>

        {/* ── Action bar (unchanged) ── */}
        <div className="flex-shrink-0 bg-[#f8faf9] dark:bg-gray-800/80 border-t border-[#e2e8e5] dark:border-gray-700 px-4 sm:px-5 py-3">
          {(selectedFleetVehicle || customVehicle) ? (
            <div className="flex gap-3">
              <Button
                type="button"
                onClick={selectedFleetVehicle ? handleBackToSelection : onCancel}
                disabled={loading}
                className="flex-1 bg-[#f0f4f2] dark:bg-gray-700 text-[#4a5e54] dark:text-gray-300 hover:bg-[#e2e8e5] dark:hover:bg-gray-600 font-semibold py-2.5 text-sm border border-[#c8d5ce] dark:border-gray-600 shadow-none"
              >
                {selectedFleetVehicle ? t('yardCheckin.back') : t('yardCheckin.cancel')}
              </Button>
              <Button
                type="submit"
                onClick={handleSubmit}
                disabled={
                  loading ||
                  !formData.registration ||
                  !formData.make ||
                  !formData.model ||
                  !formData.size ||
                  !formData.condition ||
                  (serviceSettings.captureMileageOnCheckIn && !mileageNA && !formData.mileage.trim()) ||
                  mileageBelowFloor ||
                  Boolean(currentRegistrationConflict)
                }
                className="flex-1 bg-[#025940] hover:bg-[#012619] text-white font-semibold py-2.5 text-sm border-0 shadow-none flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>{t('yardCheckin.checkingIn')}</span></>
                ) : (
                  <><CheckCircle className="w-4 h-4" /><span>{t('yardCheckin.checkIn')}</span></>
                )}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              onClick={onCancel}
              className="w-full bg-[#f0f4f2] dark:bg-gray-700 text-[#4a5e54] dark:text-gray-300 hover:bg-[#e2e8e5] font-semibold py-2.5 text-sm border border-[#c8d5ce] shadow-none"
            >
              {t('yardCheckin.cancel')}
            </Button>
          )}
        </div>

      </div>
    </div>
  )
}