// src/components/common/Modals/VehicleDetailModal.tsx
// Restyled: "Clean Sheet" — bright white, clean reg badge (no country-specific plate styling)
// ✅ Every prop, handler, state, insurance toggle, damage map, action button FULLY PRESERVED
// ✅ MOT & tax sourced from fleet record via vehicleId / registration fallback
// ✅ Header: two-row on mobile, single row on desktop
// ✅ Registration shown as a clean dark badge — works for any locale
// ✅ NEW: Linked one-off parts section — shows parts allocated to this vehicle
'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/Button'
import {
  X,
  CheckCircle,
  Clock,
  Wrench,
  XCircle,
  FileText,
  Settings,
  LogOut,
  Calendar,
  Car,
  MessageSquare,
  Gauge,
  Shield,
  ArrowLeft,
  Package,
  Link
} from 'lucide-react'
import {
  CheckedInVehicle,
  VehicleStatus,
  isVehicleInYard,
  isVehicleOutOnHire,
  getDisplayStatus,
  InsuranceStatus,
  canPerformAction
} from '@/types'
import { InsuranceToggle } from '@/components/common/ui/InsuranceToggle'
import { InsuranceWarningModal } from '@/components/common/Modals/InsuranceWarningModal'
import { logger } from '@/lib/logger'
import { useT, useLang, formatDateLocale } from '@/lib/i18n'
import { DamageMapper } from '@/components/common/DamageMapper/DamageMapper'
import type { DamagePin, VehicleDiagramType } from '@/components/common/DamageMapper/DamageMapper'
import { userProfileService } from '@/lib/firestore'
import { stockService } from '@/lib/services/stockService'
import { mileageService, type MileageReading } from '@/lib/services/mileageService'
import { useAuth } from '@/contexts/AuthContext'
import type { StockPart } from '@/types/stock'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FleetVehicleLike {
  id?: string | null
  registration?: string | null
  motExpiry?: string | null
  taxExpiry?: string | null
}

interface VehicleDetailModalProps {
  vehicle: CheckedInVehicle
  onClose: () => void
  onEdit: (vehicle: CheckedInVehicle) => void
  onCheckout: (vehicle: CheckedInVehicle) => void
  onSetOutOnHire?: (vehicle: CheckedInVehicle) => void
  onQuickCheckIn?: (vehicle: CheckedInVehicle) => void
  onUpdateVehicle?: (vehicleId: string, updates: any) => Promise<void>
  fleetVehicles?: FleetVehicleLike[]
}

// ─── Status config (unchanged) ────────────────────────────────────────────────

const getStatusConfig = (status: VehicleStatus) => {
  switch (status) {
    case 'Ready':
      return { icon: CheckCircle, color: '#0d6b2e', bg: '#e6f4ec', label: 'Ready', description: 'Available for use', labelKey: 'vehDetail.statusReady' }
    case 'Pending checks':
      return { icon: Clock, color: '#92400e', bg: '#fef3c7', label: 'Pending checks', description: 'Requires attention', labelKey: 'vehDetail.statusPending' }
    case 'Repairs needed':
      return { icon: Wrench, color: '#9a3412', bg: '#ffedd5', label: 'Repairs needed', description: 'Needs repair work', labelKey: 'vehDetail.statusRepairs' }
    case 'Non-Starter':
      return { icon: XCircle, color: '#991b1b', bg: '#fee2e2', label: 'Non-Starter', description: 'Cannot start', labelKey: 'vehDetail.statusNonStarter' }
    default:
      return { icon: Clock, color: '#4a5e54', bg: '#f0f4f2', label: status || 'Unknown', description: 'Status pending', labelKey: '' }
  }
}

// ─── Helpers (unchanged) ─────────────────────────────────────────────────────

const safeString = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    if (value instanceof Date) return value.toISOString()
    logger.log('Attempting to display object as string:', value)
    return ''
  }
  return String(value)
}

const formatDate = (dateString: string | undefined | null): string => {
  if (!dateString) return 'Not set'
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'Invalid date'
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return 'Invalid date'
  }
}

const formatDateTime = (date: any): string => {
  if (!date) return 'Unknown'
  try {
    const d = date.toDate ? date.toDate() : new Date(date)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return 'Invalid date'
  }
}

const getDateString = (dateValue: any): string => {
  if (!dateValue) return ''
  try {
    if (dateValue?.toDate) return dateValue.toDate().toISOString()
    if (dateValue instanceof Date) return dateValue.toISOString()
    if (typeof dateValue === 'string') return dateValue
    if (typeof dateValue === 'number') return new Date(dateValue).toISOString()
    if (typeof dateValue === 'object') {
      if (dateValue.seconds && typeof dateValue.seconds === 'number') {
        return new Date(dateValue.seconds * 1000).toISOString()
      }
      logger.log('Unable to convert object to date string:', dateValue)
      return ''
    }
    return String(dateValue)
  } catch (error) {
    logger.log('Failed to convert date value:', dateValue, error)
    return ''
  }
}

const getVehicleText = (value: any, fallback: string = ''): string => {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'object') {
    if (value.text && typeof value.text === 'string') return value.text
    if (value.value && typeof value.value === 'string') return value.value
    if (value.content && typeof value.content === 'string') return value.content
    logger.log('Unexpected object in vehicle property:', value)
    return fallback
  }
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value.toString()
  if (typeof value === 'boolean') return value.toString()
  return fallback
}

// Coerce any stored timestamp shape → Date. The yard's last_edit_log was
// migrated verbatim from Firestore, so dates arrive as {_seconds,_nanoseconds}
// (Firestore Timestamp), but newer client writes use ISO strings.
const toDateAny = (v: any): Date | null => {
  if (!v) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  if (typeof v === 'object') {
    if (typeof v._seconds === 'number') return new Date(v._seconds * 1000)
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000)
    if (typeof v.toDate === 'function') { try { return v.toDate() } catch { return null } }
  }
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

// Normalise the audit blob into { action, name, date }, tolerating both the
// new shape ({action, editedByName, editedAt}) and the legacy one
// ({action, byDisplayName, timestamp}). Returns null if there's nothing to show.
interface ParsedLastEdit { action?: string; name?: string; date: Date | null }
const parseLastEdit = (log: any): ParsedLastEdit | null => {
  if (!log) return null
  if (typeof log === 'string') return { action: log, date: null }
  if (typeof log !== 'object') return null
  const name = log.editedByName || log.byDisplayName || log.updatedByName || log.editedBy || undefined
  const date = toDateAny(log.editedAt ?? log.timestamp ?? log.updatedAt ?? log.editedDate)
  const action = typeof log.action === 'string' ? log.action
    : typeof log.text === 'string' ? log.text : undefined
  if (!name && !date && !action) return null
  return { action, name: typeof name === 'string' ? name : undefined, date }
}

const getInsuranceStatus = (vehicle: CheckedInVehicle): InsuranceStatus | null => {
  const status = vehicle.insuranceStatus
  logger.log('Vehicle insurance status from props:', status, typeof status)
  if (!status) return null
  if (status === 'Insured' || status === 'Not Insured') return status as InsuranceStatus
  const statusStr = String(status).trim()
  if (statusStr === 'Insured') return 'Insured'
  if (statusStr === 'Not Insured') return 'Not Insured'
  logger.log('Invalid insurance status:', status)
  return null
}

const getExpiryColour = (dateStr: string | undefined | null): { color: string; bg: string } => {
  if (!dateStr) return { color: '#8a9e94', bg: '#f0f4f2' }
  try {
    const expiry   = new Date(dateStr)
    const daysLeft = Math.floor((expiry.getTime() - Date.now()) / 86_400_000)
    if (daysLeft < 0)  return { color: '#991b1b', bg: '#fee2e2' }
    if (daysLeft < 30) return { color: '#92400e', bg: '#fef3c7' }
    return { color: '#0d6b2e', bg: '#e6f4ec' }
  } catch {
    return { color: '#8a9e94', bg: '#f0f4f2' }
  }
}

// ─── Fleet lookup helper (unchanged) ─────────────────────────────────────────

const findFleetRecord = (
  vehicle: CheckedInVehicle,
  fleetVehicles: FleetVehicleLike[] | undefined
): FleetVehicleLike | null => {
  if (!fleetVehicles || fleetVehicles.length === 0) return null
  if (vehicle.vehicleId) {
    const byId = fleetVehicles.find(fv => fv.id === vehicle.vehicleId)
    if (byId) return byId
  }
  const normalised = (vehicle.registration || '').toUpperCase().replace(/\s+/g, '')
  return fleetVehicles.find(
    fv => (fv.registration || '').toUpperCase().replace(/\s+/g, '') === normalised
  ) ?? null
}

// ─── Shared reg badge ─────────────────────────────────────────────────────────

const RegBadge = ({ registration, size = 'md' }: { registration: string; size?: 'sm' | 'md' }) => (
  <div
    className={`
      flex-shrink-0 bg-[#012619] border border-[#b3f243]/40 rounded-lg
      font-mono font-bold tracking-widest text-[#b3f243] leading-none
      ${size === 'sm' ? 'px-2.5 py-1 text-sm' : 'px-3 py-1.5 text-base sm:text-lg'}
    `}
  >
    {registration || 'Unknown'}
  </div>
)

// ─── Sub-components ───────────────────────────────────────────────────────────

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-bold text-[#8a9e94] uppercase tracking-widest mb-3 pl-2 border-l-2 border-[#b3f243]">
    {children}
  </p>
)

const InfoRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2 py-2 border-b border-[#f0f4f2] dark:border-gray-700 last:border-0">
    <span className="text-xs text-[#8a9e94] dark:text-gray-400 font-medium shrink-0">{label}</span>
    <span className="text-xs font-semibold text-[#012619] dark:text-white text-right">{children}</span>
  </div>
)

const DocCard = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between px-3 py-2.5 bg-white dark:bg-gray-800 rounded-xl border border-[#e2e8e5] dark:border-gray-700 mb-2 last:mb-0 shadow-sm">
    <span className="text-xs font-semibold text-[#4a5e54] dark:text-gray-300">{label}</span>
    {children}
  </div>
)

const StatusPill = ({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) => (
  <span
    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
    style={{ background: bg, color }}
  >
    {children}
  </span>
)

// ─── Linked Parts sub-component ───────────────────────────────────────────────

function LinkedPartsSection({ registration, organizationId }: { registration: string; organizationId: string }) {
  const t = useT()
  const [parts, setParts] = useState<StockPart[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!registration || !organizationId) {
      setLoading(false)
      return
    }

    const fetchLinkedParts = async () => {
      try {
        // Clean reg for consistent matching — stored formats may vary
        const cleanReg = registration.toUpperCase().replace(/\s+/g, '')

        // Fetch all parts for the org once, then mirror the original two-pass
        // match: exact linkedRegistration first, fuzzy (space-insensitive,
        // one-off only) as a fallback.
        const allParts = await stockService.getParts(organizationId)

        const results = allParts.filter(p => p.linkedRegistration === registration)

        // If no exact match, try without spaces (handles formatting differences)
        if (results.length === 0) {
          const fuzzy = allParts
            .filter(p => p.isOneOff === true)
            .filter(p => {
              const storedReg = (p.linkedRegistration || '').toUpperCase().replace(/\s+/g, '')
              return storedReg === cleanReg
            })
          setParts(fuzzy)
        } else {
          setParts(results)
        }
      } catch (err) {
        logger.error('Error fetching linked parts:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchLinkedParts()
  }, [registration, organizationId])

  // Render nothing while loading, and nothing when there are no linked parts.
  // (Previously it showed a spinner block on open that then collapsed/grew when
  // the fetch resolved — the height jump that looked like a "shake". The modal
  // now opens at its natural height; the section only appears if parts exist.)
  if (loading || parts.length === 0) return null

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <SectionTitle>{t('vehDetail.allocatedParts')}</SectionTitle>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#b3f243]/20 text-[#025940] border border-[#b3f243]/40 -mt-1">
          {t(parts.length === 1 ? 'vehDetail.partsCountOne' : 'vehDetail.partsCountMany', { count: parts.length })}
        </span>
      </div>
      <div className="space-y-1.5">
        {parts.map(part => (
          <div
            key={part.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 shadow-sm"
          >
            <Package className="w-3.5 h-3.5 text-[#72A68E] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[#012619] dark:text-white truncate">{part.partName}</p>
              <p className="text-[10px] text-[#8a9e94] truncate">{part.partNumber}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs font-bold text-[#025940] dark:text-[#b3f243]">
                £{part.netPrice.toFixed(2)}
              </p>
              <p className="text-[10px] text-[#8a9e94]">{t('vehDetail.qty', { n: part.quantity })}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Mileage history sub-component (gold-standard odometer log, 0044) ─────────

function MileageHistorySection({ registration, organizationId }: { registration: string; organizationId: string }) {
  const t = useT()
  const { locale } = useLang()
  const [readings, setReadings] = useState<MileageReading[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!registration || !organizationId) { setLoading(false); return }
    let cancelled = false
    mileageService.getReadings(organizationId, registration, 12)
      .then(r => { if (!cancelled) setReadings(r) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [registration, organizationId])

  if (loading || readings.length === 0) return null

  const sourceLabel = (s: string) => {
    const key = `vehDetail.mileageSource.${s}`
    const label = t(key)
    return label === key ? s : label
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <SectionTitle>{t('vehDetail.mileageHistory')}</SectionTitle>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#b3f243]/20 text-[#025940] border border-[#b3f243]/40 -mt-1">
          <Gauge className="w-2.5 h-2.5" />
          {t('vehDetail.mileageCurrent', { miles: readings[0].mileage.toLocaleString(locale) })}
        </span>
      </div>
      <div className="space-y-1.5">
        {readings.map(r => (
          <div
            key={r.id}
            className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 shadow-sm"
          >
            <Gauge className="w-3.5 h-3.5 text-[#72A68E] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[#012619] dark:text-white">
                {r.mileage.toLocaleString(locale)} {t('vehDetail.mileageUnit')}
              </p>
              <p className="text-[10px] text-[#8a9e94] truncate">
                {formatDateLocale(r.recordedAt, locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                {' · '}{sourceLabel(r.source)}
                {r.recordedByName ? ` · ${r.recordedByName}` : ''}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export const VehicleDetailModal = React.memo<VehicleDetailModalProps>(({
  vehicle,
  onClose,
  onEdit,
  onCheckout,
  onSetOutOnHire,
  onQuickCheckIn,
  onUpdateVehicle,
  fleetVehicles
}) => {
  const t = useT()
  const { locale } = useLang()
  // ── Organisation ID for linked parts query ────────────────────────────────
  const { user } = useAuth()
  const [orgId, setOrgId] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.uid) return
    userProfileService.getProfile(user.uid)
      .then(p => setOrgId(p?.organizationId || null))
      .catch(() => setOrgId(null))
  }, [user?.uid])

  // ── State (unchanged) ────────────────────────────────────────────────────
  const initialInsuranceStatus = getInsuranceStatus(vehicle)
  const [localInsuranceStatus, setLocalInsuranceStatus] = useState<InsuranceStatus | null>(initialInsuranceStatus)
  const [showInsuranceWarning, setShowInsuranceWarning] = useState(false)
  const [blockedAction, setBlockedAction]               = useState<'checkout' | 'hire'>('checkout')
  const [updatingInsurance, setUpdatingInsurance]       = useState(false)

  useEffect(() => {
    logger.log('VehicleDetailModal mounted/updated:', {
      vehicleId: vehicle.id,
      vehicleRegistration: vehicle.registration,
      insuranceStatusFromProps: vehicle.insuranceStatus,
      localInsuranceStatus,
      initialInsuranceStatus
    })
  }, [vehicle.id, vehicle.insuranceStatus, localInsuranceStatus, initialInsuranceStatus])

  useEffect(() => {
    const newStatus = getInsuranceStatus(vehicle)
    logger.log('Syncing insurance status:', { old: localInsuranceStatus, new: newStatus })
    setLocalInsuranceStatus(newStatus)
  }, [vehicle.insuranceStatus, vehicle.id])

  // ── Live MOT / tax from fleet (unchanged) ────────────────────────────────
  const fleetRecord = useMemo(
    () => findFleetRecord(vehicle, fleetVehicles),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vehicle.id, vehicle.vehicleId, vehicle.registration, fleetVehicles]
  )

  const effectiveMotExpiry = fleetRecord?.motExpiry || vehicle.motExpiry || null
  const effectiveTaxExpiry = fleetRecord?.taxExpiry || vehicle.taxExpiry || null

  logger.log('VehicleDetailModal doc dates:', {
    source: fleetRecord ? 'fleet' : 'yard',
    motExpiry: effectiveMotExpiry,
    taxExpiry: effectiveTaxExpiry
  })

  // ── Derived values (unchanged) ────────────────────────────────────────────
  const isInYard      = isVehicleInYard(vehicle)
  const isOutOnHire   = isVehicleOutOnHire(vehicle)
  const displayStatus = getDisplayStatus(vehicle)
  const status        = (displayStatus || 'Pending checks') as VehicleStatus
  const config        = getStatusConfig(status)
  const statusLabelText = config.labelKey ? t(config.labelKey) : config.label

  const checkInDateString   = getDateString(vehicle.createdAt)
  const vehicleRegistration = getVehicleText(vehicle.registration, t('vehDetail.unknown'))
  const vehicleMake         = getVehicleText(vehicle.make, '')
  const vehicleModel        = getVehicleText(vehicle.model, '')
  const vehicleCondition    = getVehicleText(vehicle.condition, t('vehDetail.unknown'))
  const vehicleContract     = getVehicleText(vehicle.contract, '')
  const vehicleComments     = getVehicleText(vehicle.comments, '')
  const vehicleNotes        = getVehicleText(vehicle.notes, '')
  const vehicleMileage      = getVehicleText(vehicle.mileage, '')
  const vehicleHireNotes    = getVehicleText(vehicle.hireNotes, '')
  const vehicleHiredByName  = getVehicleText(vehicle.hiredByName, t('vehDetail.unknown'))

  const motColour = getExpiryColour(effectiveMotExpiry)
  const taxColour = getExpiryColour(effectiveTaxExpiry)

  const damagePins: DamagePin[]                            = (vehicle as any).damagePins || []
  const vehicleDiagramType: VehicleDiagramType | undefined = (vehicle as any).vehicleDiagramType

  // ── Handlers (unchanged) ─────────────────────────────────────────────────
  const handleInsuranceToggle = async (status: InsuranceStatus, policy?: any) => {
    if (!onUpdateVehicle) return
    try {
      setUpdatingInsurance(true)
      setLocalInsuranceStatus(status)
      await onUpdateVehicle(vehicle.id, {
        insuranceStatus:       status,
        insurancePolicyId:     policy?.id         ?? null,
        insurancePolicyName:   policy?.name       ?? null,
        insurancePolicyExpiry: policy?.expiryDate ?? null,
      })
      logger.log('Insurance status updated successfully:', status, policy?.name || 'no policy')
    } catch (error) {
      logger.error('Error updating insurance status:', error)
      setLocalInsuranceStatus(vehicle.insuranceStatus as InsuranceStatus || null)
      alert(t('vehDetail.insUpdateFail'))
    } finally {
      setUpdatingInsurance(false)
    }
  }

  const handleCheckout = () => {
    // Insurance gate is FLEET-only. A non-fleet vehicle (visitor / external
    // garage customer) has no fleet vehicleId and was never on our insurance,
    // so it can always be checked out. Fleet vehicles keep the gate.
    if (vehicle.vehicleId && !canPerformAction(localInsuranceStatus)) {
      setBlockedAction('checkout')
      setShowInsuranceWarning(true)
      return
    }
    onCheckout(vehicle)
  }

  const handleSetOutOnHire = () => {
    if (!canPerformAction(localInsuranceStatus)) {
      setBlockedAction('hire')
      setShowInsuranceWarning(true)
      return
    }
    onSetOutOnHire?.(vehicle)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3 sm:p-6"
      onClick={onClose}
      // iPhone-safe padding: keep the modal clear of the notch/Dynamic Island
      // at the top and the home indicator at the bottom. `max(0.75rem, …)`
      // preserves the existing p-3 spacing on devices without insets.
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div
        // `dvh` (dynamic viewport height) accounts for iOS Safari's chrome —
        // `vh` would make the modal taller than the visible area and push
        // the close button up under the address bar / notch on iPhone.
        className="w-full max-w-2xl mx-auto bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col border border-[#e2e8e5] dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >

        {/* ════════════════════════════════════════════════════════════════
            HEADER
        ════════════════════════════════════════════════════════════════ */}
        <div className="flex-shrink-0 bg-[#012619] px-4 py-3 sm:px-6 sm:py-4 border-b-2 border-[#b3f243]/30">

          {/* ── Row 1: identity + close ──────────────────────────────────────
              One responsive layout (no separate mobile/desktop). The title now
              has the row to itself (only the close button competes), so the
              make/model stops truncating to "Mercede…". Status pills sit
              directly beneath it. */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <RegBadge registration={vehicleRegistration} size="md" />
              <div className="min-w-0">
                <p className="text-white font-semibold text-sm sm:text-lg leading-tight truncate">
                  {vehicleMake}{vehicleMake && vehicleModel ? ' ' : ''}{vehicleModel}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  <StatusPill bg={config.bg} color={config.color}>
                    <span className="w-1.5 h-1.5 rounded-full mr-1 flex-shrink-0" style={{ backgroundColor: config.color }} />
                    {isOutOnHire ? t('vehDetail.outOnHire') : statusLabelText}
                  </StatusPill>
                  {isOutOnHire && (
                    <span className="text-[10px] text-[#72A68E]">{t('vehDetail.wasStatus', { status: statusLabelText })}</span>
                  )}
                  {localInsuranceStatus && (
                    <StatusPill
                      bg={localInsuranceStatus === 'Insured' ? '#e6f4ec' : '#fee2e2'}
                      color={localInsuranceStatus === 'Insured' ? '#0d6b2e' : '#991b1b'}
                    >
                      {localInsuranceStatus === 'Insured' ? t('vehDetail.insured') : t('vehDetail.notInsured')}
                    </StatusPill>
                  )}
                </div>
              </div>
            </div>
            {/* 44px tap target per Apple HIG. */}
            <button
              onClick={onClose}
              className="p-2.5 -m-1 rounded-lg text-[#72A68E] hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
              aria-label={t('vehDetail.close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ── Row 2: insurance quick-action ────────────────────────────────
              On its own line with a divider so the toggle (and its policy chip)
              have room instead of crowding the title. Real policy fed in so the
              control shows the assigned policy, not a "tap to assign" hint. */}
          {onUpdateVehicle && (
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[#72A68E]">
                <Shield className="w-4 h-4 flex-shrink-0" />
                <span className="text-xs font-medium">{t('vehDetail.insurance')}</span>
              </div>
              <InsuranceToggle
                insuranceStatus={localInsuranceStatus}
                onToggle={handleInsuranceToggle}
                disabled={updatingInsurance}
                size="sm"
                showLabel={false}
                className="text-white items-end"
                vehicleRegistration={vehicleRegistration}
                currentPolicyId={(vehicle as any).insurancePolicyId}
                currentPolicyName={(vehicle as any).insurancePolicyName}
                currentPolicyExpiry={(vehicle as any).insurancePolicyExpiry}
              />
            </div>
          )}

        </div>
        {/* ════ END HEADER ════ */}

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col sm:flex-row sm:divide-x sm:divide-[#e2e8e5] dark:divide-gray-700">

            {/* Left panel — vehicle info */}
            <div className="flex-1 p-4 sm:p-5">
              <SectionTitle>{t('vehDetail.sectionVehicleInfo')}</SectionTitle>

              <InfoRow label={t('vehDetail.makeModel')}>{vehicleMake} {vehicleModel}</InfoRow>
              <InfoRow label={t('vehDetail.size')}>{safeString(vehicle.size) || '—'}</InfoRow>
              <InfoRow label={t('vehDetail.colour')}>{safeString(vehicle.colour) || '—'}</InfoRow>
              <InfoRow label={t('vehDetail.mileage')}>
                {vehicleMileage
                  ? `${vehicleMileage.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} mi`
                  : '—'}
              </InfoRow>
              <InfoRow label={t('vehDetail.condition')}>
                <StatusPill bg="#e6f4ec" color="#0d6b2e">{vehicleCondition}</StatusPill>
              </InfoRow>
              <InfoRow label={t('vehDetail.bayLocation')}>
                {safeString(vehicle.bay) || safeString(vehicle.location) || '—'}
              </InfoRow>
              <InfoRow label={t('vehDetail.checkInRow')}>
                {checkInDateString ? formatDate(checkInDateString) : '—'}
              </InfoRow>

              {vehicleContract && (
                <InfoRow label={t('vehDetail.contract')}>
                  <span className="inline-flex items-center gap-1.5">
                    {vehicle.contractColor && (
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-white/50 shadow-sm flex-shrink-0"
                        style={{ backgroundColor: vehicle.contractColor }}
                      />
                    )}
                    <StatusPill bg="#e7f1ec" color="#024a36">{vehicleContract}</StatusPill>
                  </span>
                </InfoRow>
              )}

              {localInsuranceStatus === 'Insured' && (vehicle as any).insurancePolicyName && (
                <InfoRow label={t('vehDetail.policy')}>
                  <span className="inline-flex flex-col items-end gap-1">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#f0faf4] dark:bg-[#025940]/20 text-[#025940] dark:text-[#72A68E] border border-[#c3e6d0] dark:border-[#025940]">
                      <Shield className="w-2.5 h-2.5 flex-shrink-0" />
                      {(vehicle as any).insurancePolicyName}
                    </span>
                    {(vehicle as any).insurancePolicyExpiry && (() => {
                      const days = Math.ceil((new Date((vehicle as any).insurancePolicyExpiry).getTime() - new Date().setHours(0,0,0,0)) / 86400000)
                      return (
                        <span className={`text-[10px] font-medium ${days < 0 ? 'text-red-500' : days <= 30 ? 'text-amber-500' : 'text-[#8a9e94]'}`}>
                          {days < 0 ? t('vehDetail.expired') : t('vehDetail.expPrefix', { date: (vehicle as any).insurancePolicyExpiry.split('-').reverse().join('/') })}
                        </span>
                      )
                    })()}
                  </span>
                </InfoRow>
              )}

              {vehicleNotes.trim() !== '' && (
                <div className="mt-4">
                  <SectionTitle>{t('vehDetail.notes')}</SectionTitle>
                  <div className="rounded-xl px-3 py-2.5 text-xs text-[#4a5e54] dark:text-gray-300 leading-relaxed bg-[#f8faf9] dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 border-l-2 border-l-[#b3f243]">
                    {vehicleNotes}
                  </div>
                </div>
              )}

              {vehicleComments.trim() !== '' && (
                <div className="mt-3">
                  <SectionTitle>{t('vehDetail.comments')}</SectionTitle>
                  <div className="rounded-xl px-3 py-2.5 text-xs text-[#4a5e54] dark:text-gray-300 leading-relaxed bg-[#f8faf9] dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700">
                    {vehicleComments}
                  </div>
                </div>
              )}

              {(() => {
                const le = parseLastEdit(vehicle.lastEditLog)
                if (!le) return null
                const meta = [
                  le.name && t('vehDetail.lastEditBy', { name: le.name }),
                  le.date && formatDateLocale(le.date, locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                ].filter(Boolean).join(' · ')
                return (
                  <div className="mt-3">
                    <SectionTitle>{t('vehDetail.lastEdit')}</SectionTitle>
                    {le.action && (
                      <p className="text-[11px] text-[#4a5e54] dark:text-gray-300 leading-relaxed">
                        {le.action}
                      </p>
                    )}
                    {meta && (
                      <p className="text-[10px] text-[#8a9e94] dark:text-gray-500 mt-0.5">
                        {meta}
                      </p>
                    )}
                  </div>
                )
              })()}

              {/* ── Linked one-off parts for this vehicle ── */}
              {orgId && vehicle.registration && (
                <LinkedPartsSection
                  registration={vehicle.registration}
                  organizationId={orgId}
                />
              )}

              {/* ── Mileage history timeline (0044) ── */}
              {orgId && vehicle.registration && (
                <MileageHistorySection
                  registration={vehicle.registration}
                  organizationId={orgId}
                />
              )}
            </div>

            {/* Right panel — documentation */}
            <div className="flex-1 p-4 sm:p-5 bg-[#f8faf9] dark:bg-gray-800/40 border-t border-[#e2e8e5] sm:border-t-0 dark:border-gray-700">

              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold text-[#8a9e94] uppercase tracking-widest pl-2 border-l-2 border-[#b3f243]">
                  {t('vehDetail.documentation')}
                </p>
                {fleetRecord && (
                  <span className="text-[9px] font-semibold text-[#0d6b2e] bg-[#e6f4ec] border border-[#b3f243]/40 px-2 py-0.5 rounded-full">
                    {t('vehDetail.liveFromFleet')}
                  </span>
                )}
              </div>

              <DocCard label={t('vehDetail.motCertificate')}>
                <StatusPill bg={motColour.bg} color={motColour.color}>
                  {effectiveMotExpiry ? formatDate(effectiveMotExpiry) : t('vehDetail.notSet')}
                </StatusPill>
              </DocCard>

              <DocCard label={t('vehDetail.roadTax')}>
                <StatusPill bg={taxColour.bg} color={taxColour.color}>
                  {effectiveTaxExpiry ? formatDate(effectiveTaxExpiry) : t('vehDetail.notSet')}
                </StatusPill>
              </DocCard>

              <DocCard label={t('vehDetail.insurance')}>
                {localInsuranceStatus ? (
                  <StatusPill
                    bg={localInsuranceStatus === 'Insured' ? '#e6f4ec' : '#fee2e2'}
                    color={localInsuranceStatus === 'Insured' ? '#0d6b2e' : '#991b1b'}
                  >
                    {localInsuranceStatus === 'Insured' ? t('vehDetail.insured') : t('vehDetail.notInsured')}
                  </StatusPill>
                ) : (
                  <span className="text-xs text-[#8a9e94]">{t('vehDetail.notSet')}</span>
                )}
              </DocCard>

              <DocCard label={t('vehDetail.statusLabel')}>
                <StatusPill bg={config.bg} color={config.color}>
                  <span className="w-1.5 h-1.5 rounded-full mr-1 flex-shrink-0" style={{ backgroundColor: config.color }} />
                  {statusLabelText}
                </StatusPill>
              </DocCard>

              {isOutOnHire && (
                <div className="mt-4">
                  <SectionTitle>{t('vehDetail.currentHire')}</SectionTitle>
                  <div className="rounded-xl bg-[#f8f4ff] dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 px-3 py-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-purple-800 dark:text-purple-200">
                      <Calendar className="w-3 h-3 flex-shrink-0" />
                      <span>{t('vehDetail.hired')} <span className="font-semibold">{formatDateTime(vehicle.hiredAt)}</span></span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-purple-800 dark:text-purple-200">
                      <Shield className="w-3 h-3 flex-shrink-0" />
                      <span>{t('vehDetail.by')} <span className="font-semibold">{vehicleHiredByName}</span></span>
                    </div>
                    {vehicleHireNotes && (
                      <div className="flex items-start gap-2 text-xs text-purple-800 dark:text-purple-200">
                        <FileText className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        <span>{t('vehDetail.hireNotes')} <span className="font-semibold">{vehicleHireNotes}</span></span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {vehicleDiagramType && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <SectionTitle>{t('vehDetail.damageMap')}</SectionTitle>
                    {damagePins.length > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 -mt-1">
                        {t(damagePins.length === 1 ? 'vehDetail.pinsCountOne' : 'vehDetail.pinsCountMany', { count: damagePins.length })}
                      </span>
                    )}
                  </div>
                  <div className="pointer-events-none rounded-xl overflow-hidden border border-[#e2e8e5] dark:border-gray-700">
                    <DamageMapper
                      diagramType={vehicleDiagramType}
                      pins={damagePins}
                      onChange={() => {}}
                    />
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ── Action bar (unchanged) ── */}
        <div className="flex-shrink-0 bg-[#012619] border-t-2 border-[#b3f243]/20 px-4 sm:px-6 py-3">
          {isInYard ? (
            <div className="flex gap-2 sm:gap-3">
              <Button
                onClick={() => onEdit(vehicle)}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white font-semibold py-2.5 text-sm border border-white/20 shadow-none flex items-center justify-center gap-2 transition-colors"
              >
                <Settings className="w-4 h-4" />
                <span>{t('vehDetail.edit')}</span>
              </Button>
              <Button
                onClick={handleCheckout}
                className="flex-1 bg-[#fee2e2] hover:bg-[#fecaca] text-[#991b1b] font-semibold py-2.5 text-sm border border-[#fca5a5] shadow-none flex items-center justify-center gap-2 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>{t('vehDetail.checkOut')}</span>
              </Button>
              {onSetOutOnHire && (
                <Button
                  onClick={handleSetOutOnHire}
                  className="flex-1 bg-[#b3f243] hover:bg-[#c8f76a] text-[#012619] font-bold py-2.5 text-sm border-0 shadow-none flex items-center justify-center gap-2 transition-colors"
                >
                  <Car className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('vehDetail.setOnHire')}</span>
                  <span className="sm:hidden">{t('vehDetail.hireShort')}</span>
                </Button>
              )}
            </div>
          ) : (
            <div className="flex gap-2 sm:gap-3">
              <Button
                onClick={() => onEdit(vehicle)}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white font-semibold py-2.5 text-sm border border-white/20 shadow-none flex items-center justify-center gap-2 transition-colors"
              >
                <Settings className="w-4 h-4" />
                <span>{t('vehDetail.edit')}</span>
              </Button>
              {onQuickCheckIn && (
                <Button
                  onClick={() => onQuickCheckIn(vehicle)}
                  className="flex-1 bg-[#b3f243] hover:bg-[#c8f76a] text-[#012619] font-bold py-2.5 text-sm border-0 shadow-none flex items-center justify-center gap-2 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{t('vehDetail.quickCheckIn')}</span>
                </Button>
              )}
            </div>
          )}
        </div>

        <InsuranceWarningModal
          isOpen={showInsuranceWarning}
          onClose={() => setShowInsuranceWarning(false)}
          vehicleRegistration={vehicle.registration}
          action={blockedAction}
        />

      </div>
    </div>
  )
})

export default VehicleDetailModal