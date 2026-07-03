// src/components/common/Modals/FleetVehicleDetailModal.tsx
// Restyled: "Clean Sheet" — matches VehicleDetailModal / VehicleEditModal brand style
// ✅ Every prop, helper, defleet banner, damage map, insurance badge FULLY PRESERVED
// ✅ Registration shown as locale-neutral dark badge (no GB plate)
// ✅ Header: two-row on mobile, single row on desktop — nothing fights for space
'use client'

import React from 'react'
import { Button } from '@/components/ui/Button'
import {
  Car,
  FileText,
  Calendar,
  X,
  Clock,
  Shield,
  MessageSquare,
  Edit,
  Trash2,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  Palette,
  Ruler,
  XCircle,
  Info,
  Loader2
} from 'lucide-react'
import { FleetVehicle } from '@/types'
import { formatDate, getExpiryStatus } from '@/lib/fleetUtils'
import { computeDefleetDue } from '@/lib/utils/defleetDue'
import { InsuranceStatusBadge } from '@/components/common/ui/InsuranceToggle'
import { DamageMapView } from '@/components/common/DamageMapper/DamageMapView'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'
import { vehicleLookupService, type VehicleLookupResult } from '@/lib/services/vehicleLookupService'
import { VehicleServiceHistoryPanel } from '@/components/fleet/VehicleServiceHistoryPanel'
import { VehicleMovementHistoryPanel } from '@/components/fleet/VehicleMovementHistoryPanel'

type TFunc = (key: string, vars?: Record<string, string | number>) => string

// ─── Props ────────────────────────────────────────────────────────────────────

interface FleetVehicleDetailModalProps {
  vehicle: FleetVehicle
  onEdit: (vehicle: FleetVehicle) => void
  onDelete: (vehicle: FleetVehicle) => void
  // Restore a defleeted vehicle back to the active fleet (shown only when defleeted).
  onRestore?: (vehicle: FleetVehicle) => void
  onClose: () => void
}

// ─── Helpers (all unchanged) ─────────────────────────────────────────────────

const safeString = (value: any): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    logger.log('Attempted to render object as string:', value)
    return ''
  }
  try { return String(value) } catch { return '' }
}

const formatDateDisplay = (date: any, t: TFunc): string => {
  if (!date) return t('fleet.detailModal.notSpecified')
  try {
    if (date.toDate) {
      return date.toDate().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
    }
    return new Date(date).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch { return t('fleet.detailModal.notSpecified') }
}

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'valid':
      return { icon: CheckCircle, color: '#0d6b2e', bg: '#e6f4ec', border: '#86efac', text: 'Valid' }
    case 'expiring-soon':
      return { icon: Clock, color: '#92400e', bg: '#fef3c7', border: '#fcd34d', text: 'Expiring soon' }
    case 'expired':
      return { icon: AlertTriangle, color: '#991b1b', bg: '#fee2e2', border: '#fca5a5', text: 'Expired' }
    default:
      return { icon: Calendar, color: '#8a9e94', bg: '#f0f4f2', border: '#e2e8e5', text: 'Not set' }
  }
}

const getContractBadgeStyle = (contractColor: string | null) => {
  if (!contractColor) return { backgroundColor: '#f0f4f2', color: '#4a5e54', border: '1px solid #e2e8e5' }
  const hex = contractColor.replace('#', '')
  const r   = parseInt(hex.substring(0, 2), 16)
  const g   = parseInt(hex.substring(2, 4), 16)
  const b   = parseInt(hex.substring(4, 6), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return { backgroundColor: contractColor, color: brightness > 128 ? '#000000' : '#ffffff', border: `1px solid ${contractColor}` }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Locale-neutral reg badge — matches VehicleDetailModal / VehicleEditModal
const RegBadge = ({ registration }: { registration: string }) => {
  const t = useT()
  return (
    <div className="flex-shrink-0 bg-[#012619] border-2 border-[#b3f243]/50 rounded-lg px-3 py-1.5 sm:px-3.5 sm:py-2 font-mono font-extrabold tracking-[0.2em] text-[#b3f243] leading-none text-sm sm:text-base">
      {registration || t('fleet.detailModal.regUnknown')}
    </div>
  )
}

// Section title with lime left-border accent
const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-extrabold text-[#4a5e54] dark:text-gray-300 uppercase tracking-widest mb-3 pl-2.5 border-l-[3px] border-[#b3f243]">
    {children}
  </p>
)

// Info row — label left, value right
const InfoRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 py-2.5 border-b border-[#e2e8e5] dark:border-gray-700 last:border-0">
    <span className="text-[11px] text-[#8a9e94] dark:text-gray-400 font-semibold uppercase tracking-wide flex-shrink-0">{label}</span>
    <span className="text-sm font-bold text-[#012619] dark:text-white text-right">{children}</span>
  </div>
)

// Doc card — white pill card for legal docs
const DocCard = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 rounded-xl border border-[#d9e3de] dark:border-gray-700 mb-2 last:mb-0">
    <span className="text-xs font-bold text-[#012619] dark:text-gray-200">{label}</span>
    {children}
  </div>
)

const StatusPill = ({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) => (
  <span
    className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide"
    style={{ background: bg, color }}
  >
    {children}
  </span>
)

// ─── Component ────────────────────────────────────────────────────────────────

export function FleetVehicleDetailModal({
  vehicle,
  onEdit,
  onDelete,
  onRestore,
  onClose
}: FleetVehicleDetailModalProps) {

  const t = useT()
  const [tab, setTab] = React.useState<'details' | 'history' | 'movement'>('details')
  const [showInfo, setShowInfo] = React.useState(false)
  const [infoData, setInfoData] = React.useState<VehicleLookupResult | null>(null)
  const [infoLoading, setInfoLoading] = React.useState(false)
  const [infoError, setInfoError] = React.useState<string | null>(null)

  // ── Expiry status (all logic unchanged) ──────────────────────────────────
  const motStatusObj = getExpiryStatus(vehicle.motExpiry || '')
  const taxStatusObj = getExpiryStatus(vehicle.taxExpiry || '')
  const motConfig    = getStatusConfig(motStatusObj.status)
  const taxConfig    = getStatusConfig(taxStatusObj.status)

  // Fetch live DVLA technical data when the info popup opens.
  React.useEffect(() => {
    if (!showInfo) return
    const reg = safeString(vehicle.registration).trim()
    if (!reg) { setInfoError(t('fleet.detailModal.infoError')); return }
    let cancelled = false
    setInfoLoading(true); setInfoError(null); setInfoData(null)
    vehicleLookupService.lookup(reg)
      .then(d => { if (!cancelled) setInfoData(d) })
      .catch(e => { if (!cancelled) setInfoError(e instanceof Error ? e.message : t('fleet.detailModal.infoError')) })
      .finally(() => { if (!cancelled) setInfoLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInfo, vehicle.registration])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-3 sm:p-6 z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl mx-auto bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col border-2 border-[#012619]/10 dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >

        {/* ════════════════════════════════════════════════════════════════
            HEADER
            Mobile  : row 1 = reg badge + close
                      row 2 = make/model + defleet badge
            Desktop : single row
        ════════════════════════════════════════════════════════════════ */}
        <div className="flex-shrink-0 bg-[#012619] px-4 py-3 sm:px-6 sm:py-4 border-b-2 border-[#b3f243]/30">

          {/* ── Mobile (hidden on sm+) ── */}
          <div className="flex sm:hidden flex-col gap-2">

            {/* Row 1: reg badge + info + close */}
            <div className="flex items-center justify-between">
              <RegBadge registration={safeString(vehicle.registration)} />
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => setShowInfo(true)}
                  className="p-1.5 rounded-lg text-[#72A68E] hover:text-white hover:bg-white/10 transition-colors"
                  aria-label={t('fleet.detailModal.infoAria')}
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-[#72A68E] hover:text-white hover:bg-white/10 transition-colors"
                  aria-label={t('fleet.detailModal.closeAria')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Row 2: make/model + badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-white font-bold text-sm leading-snug line-clamp-2 flex-1 min-w-0">
                {safeString(vehicle.make)}{vehicle.make && vehicle.model ? ' ' : ''}{safeString(vehicle.model)}
              </p>
              {vehicle.isDefleeted && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30 flex-shrink-0">
                  <XCircle className="w-2.5 h-2.5" />
                  {t('fleet.detailModal.defleetedBadge')}
                </span>
              )}
              {!vehicle.isDefleeted && (
                <span className="text-[10px] text-[#72A68E] flex-shrink-0">{t('fleet.detailModal.fleetVehicleLabel')}</span>
              )}
            </div>
          </div>

          {/* ── Desktop (hidden on mobile) ── */}
          <div className="hidden sm:flex items-center gap-4">
            <RegBadge registration={safeString(vehicle.registration)} />

            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-base leading-snug line-clamp-2">
                {safeString(vehicle.make)}{vehicle.make && vehicle.model ? ' ' : ''}{safeString(vehicle.model)}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {vehicle.isDefleeted && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                    <XCircle className="w-2.5 h-2.5" />
                    {t('fleet.detailModal.defleetedBadge')}
                  </span>
                )}
                <span className="text-[10px] text-[#72A68E]">{t('fleet.detailModal.fleetVehicleLabel')}</span>
              </div>
            </div>

            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={() => setShowInfo(true)}
                className="p-1.5 rounded-lg text-[#72A68E] hover:text-white hover:bg-white/10 transition-colors"
                aria-label={t('fleet.detailModal.infoAria')}
              >
                <Info className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-[#72A68E] hover:text-white hover:bg-white/10 transition-colors"
                aria-label={t('fleet.detailModal.closeAria')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>
        {/* ════ END HEADER ════ */}

        {/* ── Tab strip ── */}
        <div className="flex-shrink-0 flex items-stretch bg-[#f8faf9] dark:bg-gray-800/60 border-b border-[#e2e8e5] dark:border-gray-700">
          {([
            { key: 'details' as const, label: t('fleet.serviceHistory.tabDetails') },
            { key: 'history' as const, label: t('fleet.serviceHistory.tabHistory') },
            { key: 'movement' as const, label: t('fleet.movementHistory.tab') },
          ]).map(tabDef => (
            <button
              key={tabDef.key}
              type="button"
              onClick={() => setTab(tabDef.key)}
              className={`flex-1 px-4 py-3 text-xs font-extrabold uppercase tracking-wide transition-colors border-b-2 ${
                tab === tabDef.key
                  ? 'border-[#025940] text-[#012619] dark:text-white bg-white dark:bg-gray-900'
                  : 'border-transparent text-[#8a9e94] hover:text-[#4a5e54] hover:bg-white/50 dark:hover:bg-gray-800'
              }`}
            >
              {tabDef.label}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        {tab === 'details' && (
        <div className="flex-1 overflow-y-auto">

          {/* ── Defleet warning banner (all logic unchanged) ── */}
          {vehicle.isDefleeted && (
            <div className="mx-4 sm:mx-5 mt-4 bg-red-600 text-white rounded-xl p-4 border-2 border-red-500">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold mb-2">{t('fleet.detailModal.defleetBannerTitle')}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {vehicle.defleetDate && (
                      <div className="bg-white/15 rounded-lg p-2">
                        <div className="text-red-100 font-medium mb-0.5">{t('fleet.detailModal.defleetDateLabel')}</div>
                        <div className="font-bold">{formatDateDisplay(vehicle.defleetDate, t)}</div>
                      </div>
                    )}
                    {vehicle.defleetReason && (
                      <div className="bg-white/15 rounded-lg p-2">
                        <div className="text-red-100 font-medium mb-0.5">{t('fleet.detailModal.defleetReasonLabel')}</div>
                        <div className="font-bold">{t(`fleet.defleetReasonLabel.${vehicle.defleetReason}`)}</div>
                      </div>
                    )}
                    {vehicle.defleetProcessedDate && (
                      <div className="bg-white/15 rounded-lg p-2">
                        <div className="text-red-100 font-medium mb-0.5">{t('fleet.detailModal.processedOnLabel')}</div>
                        <div className="font-bold">{formatDateDisplay(vehicle.defleetProcessedDate, t)}</div>
                      </div>
                    )}
                    {vehicle.defleetedByName && (
                      <div className="bg-white/15 rounded-lg p-2">
                        <div className="text-red-100 font-medium mb-0.5">{t('fleet.detailModal.defleetedByLabel')}</div>
                        <div className="font-bold">{vehicle.defleetedByName}</div>
                      </div>
                    )}
                  </div>
                  {vehicle.defleetReasonDetails && (
                    <div className="mt-2 bg-white/15 rounded-lg p-2 text-xs">
                      <div className="text-red-100 font-medium mb-0.5">{t('fleet.detailModal.additionalDetailsLabel')}</div>
                      <p className="font-medium whitespace-pre-wrap">{vehicle.defleetReasonDetails}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Two-column split: vehicle info left, docs right ── */}
          <div className="flex flex-col sm:flex-row sm:divide-x sm:divide-[#e2e8e5] dark:divide-gray-700">

            {/* ── Left panel: Vehicle information ── */}
            <div className="flex-1 p-4 sm:p-5">
              <SectionTitle>{t('fleet.detailModal.sectionVehicleInfo')}</SectionTitle>

              <InfoRow label={t('fleet.detailModal.makeModelLabel')}>
                {safeString(vehicle.make)} {safeString(vehicle.model)}
              </InfoRow>
              <InfoRow label={t('fleet.detailModal.sizeLabel')}>
                {safeString(vehicle.size) || '—'}
              </InfoRow>
              <InfoRow label={t('fleet.detailModal.colourLabel')}>
                {safeString(vehicle.colour) || '—'}
              </InfoRow>
              <InfoRow label={t('fleet.detailModal.conditionLabel')}>
                <StatusPill bg="#e6f4ec" color="#0d6b2e">
                  {safeString(vehicle.condition) || '—'}
                </StatusPill>
              </InfoRow>
              <InfoRow label={t('fleet.detailModal.dateAcquiredLabel')}>
                {vehicle.dateAcquired ? formatDateDisplay(vehicle.dateAcquired, t) : '—'}
              </InfoRow>
              <InfoRow label={t('fleet.detailModal.supplierLabel')}>
                {(vehicle as any).supplier || '—'}
              </InfoRow>
              <InfoRow label={t('fleet.detailModal.rentalTermLabel')}>
                {(vehicle as any).rentalTermMonths ? t('fleet.detailModal.rentalTermValue', { months: (vehicle as any).rentalTermMonths }) : '—'}
              </InfoRow>
              {(() => {
                const due = computeDefleetDue(vehicle.dateAcquired, (vehicle as any).rentalTermMonths)
                if (!due.dueDate) return null
                const cls = due.state === 'overdue' ? 'text-red-600 dark:text-red-400 font-semibold'
                  : due.state === 'soon' ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''
                return (
                  <InfoRow label={t('fleet.detailModal.defleetDueLabel')}>
                    <span className={cls}>
                      {new Date(due.dueDate + 'T00:00:00').toLocaleDateString('en-GB')}
                      {due.state === 'overdue' ? ` · ${t('fleet.row.defleetOverdue')}` : ''}
                    </span>
                  </InfoRow>
                )
              })()}

              {/* Contract */}
              <InfoRow label={t('fleet.detailModal.contractLabel')}>
                {vehicle.contract ? (
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={getContractBadgeStyle(vehicle.contractColor || null)}
                  >
                    {vehicle.contractColor && (
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0 border border-white/40"
                        style={{ backgroundColor: vehicle.contractColor }}
                      />
                    )}
                    {safeString(vehicle.contract)}
                  </span>
                ) : (
                  <span className="text-[#8a9e94] text-xs">{t('fleet.detailModal.noContract')}</span>
                )}
              </InfoRow>

              {/* Insurance */}
              <InfoRow label={t('fleet.detailModal.insuranceLabel')}>
                <InsuranceStatusBadge
                  status={vehicle.insuranceStatus || null}
                  showIcon={true}
                  size="sm"
                />
              </InfoRow>

              {/* ✅ NEW: Insurance Policy row — only shown when insured + policy assigned */}
              {vehicle.insuranceStatus === 'Insured' && vehicle.insurancePolicyName && (
                <InfoRow label={t('fleet.detailModal.policyLabel')}>
                  <span className="inline-flex flex-col items-end gap-1">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#f0faf4] dark:bg-[#025940]/20 text-[#025940] dark:text-[#72A68E] border border-[#c3e6d0] dark:border-[#025940]">
                      <Shield className="w-2.5 h-2.5 flex-shrink-0" />
                      {vehicle.insurancePolicyName}
                    </span>
                    {vehicle.insurancePolicyExpiry && (() => {
                      const days = Math.ceil((new Date(vehicle.insurancePolicyExpiry).getTime() - new Date().setHours(0,0,0,0)) / 86400000)
                      return (
                        <span className={`text-[10px] font-medium ${days < 0 ? 'text-red-500' : days <= 30 ? 'text-amber-500' : 'text-[#8a9e94]'}`}>
                          {days < 0 ? t('fleet.detailModal.policyExpired') : t('fleet.detailModal.policyExpiryShort', { date: vehicle.insurancePolicyExpiry.split('-').reverse().join('/') })}
                        </span>
                      )
                    })()}
                  </span>
                </InfoRow>
              )}

              {/* Insurance guidance note */}
              <div className="mt-3 rounded-xl px-3 py-2 text-[10px] leading-relaxed bg-[#f8faf9] dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 border-l-2 border-l-[#b3f243]">
                <p className="text-[#4a5e54] dark:text-gray-400">
                  {vehicle.insuranceStatus === 'Insured'
                    ? t('fleet.detailModal.insuranceNoteInsured')
                    : vehicle.insuranceStatus === 'Not Insured'
                    ? t('fleet.detailModal.insuranceNoteNotInsured')
                    : t('fleet.detailModal.insuranceNoteNotSet')}
                </p>
              </div>

              {/* Comments */}
              {vehicle.comments && safeString(vehicle.comments) && (
                <div className="mt-4">
                  <SectionTitle>{t('fleet.detailModal.sectionAdditionalInfo')}</SectionTitle>
                  <div className="rounded-xl px-3 py-2.5 text-xs text-[#4a5e54] dark:text-gray-300 leading-relaxed bg-[#f8faf9] dark:bg-gray-800 border border-[#e2e8e5] dark:border-gray-700 border-l-2 border-l-[#b3f243]">
                    {safeString(vehicle.comments)}
                  </div>
                </div>
              )}
            </div>

            {/* ── Right panel: Legal documentation ── */}
            <div className="flex-1 p-4 sm:p-5 bg-[#f8faf9] dark:bg-gray-800/40 border-t border-[#e2e8e5] sm:border-t-0 dark:border-gray-700">
              <SectionTitle>{t('fleet.detailModal.sectionLegalDocs')}</SectionTitle>

              {/* MOT — DocCard style */}
              <DocCard label={t('fleet.detailModal.motCertLabel')}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#8a9e94]">{formatDateDisplay(vehicle.motExpiry, t)}</span>
                  <StatusPill bg={motConfig.bg} color={motConfig.color}>
                    {motStatusObj.text}
                  </StatusPill>
                </div>
              </DocCard>

              {/* Road Tax — DocCard style */}
              <DocCard label={t('fleet.detailModal.roadTaxLabel')}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#8a9e94]">{formatDateDisplay(vehicle.taxExpiry, t)}</span>
                  <StatusPill bg={taxConfig.bg} color={taxConfig.color}>
                    {taxStatusObj.text}
                  </StatusPill>
                </div>
              </DocCard>

              {/* Info note */}
              <div className="mt-3 flex gap-2.5 bg-white dark:bg-gray-800 rounded-xl p-3 border border-[#e2e8e5] dark:border-gray-700 shadow-sm">
                <Info className="w-3.5 h-3.5 text-[#72A68E] flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-[#72A68E] dark:text-gray-400 leading-relaxed">
                  {t('fleet.detailModal.infoNote')}
                </p>
              </div>

              {/* Damage map — read-only (all logic unchanged) */}
              {(vehicle.vehicleDiagramType || (vehicle.damagePins && vehicle.damagePins.length > 0)) && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <SectionTitle>{t('fleet.detailModal.sectionDamageMap')}</SectionTitle>
                    {vehicle.damagePins && vehicle.damagePins.length > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 -mt-1">
                        {t('fleet.detailModal.pinCount', { count: vehicle.damagePins.length })}
                      </span>
                    )}
                  </div>
                  <div className="rounded-xl overflow-hidden border border-[#e2e8e5] dark:border-gray-700">
                    <DamageMapView
                      diagramType={vehicle.vehicleDiagramType}
                      pins={vehicle.damagePins || []}
                      readOnly
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {tab === 'history' && (
          <div className="flex-1 overflow-y-auto">
            <VehicleServiceHistoryPanel
              registration={safeString(vehicle.registration)}
              make={safeString(vehicle.make)}
              model={safeString(vehicle.model)}
            />
          </div>
        )}

        {tab === 'movement' && (
          <div className="flex-1 overflow-y-auto">
            <VehicleMovementHistoryPanel
              registration={safeString(vehicle.registration)}
              make={safeString(vehicle.make)}
              model={safeString(vehicle.model)}
            />
          </div>
        )}

        {/* ── Action bar — dark forest, matches other modals ── */}
        <div className="flex-shrink-0 bg-[#012619] border-t-2 border-[#b3f243]/20 px-4 sm:px-6 py-3.5">
          <div className="flex gap-2 sm:gap-3">

            {/* Close */}
            <Button
              onClick={onClose}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 text-sm border border-white/20 shadow-none transition-colors"
            >
              {t('fleet.detailModal.closeBtn')}
            </Button>

            {/* Restore (when defleeted) — otherwise Delete/defleet */}
            {vehicle.isDefleeted ? (
              <Button
                onClick={() => onRestore?.(vehicle)}
                className="flex-1 bg-[#dcfce7] hover:bg-[#bbf7d0] text-[#065f46] font-bold py-3 text-sm border border-[#86efac] shadow-none flex items-center justify-center gap-2 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{t('fleet.detailModal.restoreBtn')}</span>
              </Button>
            ) : (
              <Button
                onClick={() => onDelete(vehicle)}
                className="flex-1 bg-[#fee2e2] hover:bg-[#fecaca] text-[#991b1b] font-bold py-3 text-sm border border-[#fca5a5] shadow-none flex items-center justify-center gap-2 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>{t('fleet.detailModal.deleteBtn')}</span>
              </Button>
            )}

            {/* Edit */}
            <Button
              onClick={() => onEdit(vehicle)}
              className="flex-1 bg-[#b3f243] hover:bg-[#c8f76a] text-[#012619] font-extrabold py-3 text-sm border-0 shadow-none flex items-center justify-center gap-2 transition-colors"
            >
              <Edit className="w-4 h-4" />
              <span>{t('fleet.detailModal.editVehicleBtn')}</span>
            </Button>
          </div>
        </div>

      </div>
    </div>

    {/* Discreet info popup — separate overlay, doesn't touch the modal above */}
    {showInfo && (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[1px]"
        onClick={() => setShowInfo(false)}
      >
        <div
          className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-[#e2e8e5] dark:border-gray-700 overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header — icon, title, and the plate for context */}
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 bg-[#012619]">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex-shrink-0 p-1.5 bg-[#b3f243]/15 border border-[#b3f243]/25 rounded-lg">
                <Info className="w-4 h-4 text-[#b3f243]" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white leading-tight">{t('fleet.detailModal.infoTitle')}</h3>
                <p className="text-[11px] text-[#72A68E] truncate">{safeString(vehicle.registration)}</p>
              </div>
            </div>
            <button
              onClick={() => setShowInfo(false)}
              className="flex-shrink-0 p-1.5 rounded-lg text-[#72A68E] hover:text-white hover:bg-white/10 transition-colors"
              aria-label={t('fleet.detailModal.closeAria')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-1.5">
            {infoLoading ? (
              <div className="flex items-center justify-center gap-2 text-sm text-[#8a9e94] py-8">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('fleet.detailModal.infoLoading')}
              </div>
            ) : infoError ? (
              <p className="text-sm text-red-600 dark:text-red-400 py-4">{infoError}</p>
            ) : infoData ? (
              <>
                {infoData.hasOutstandingRecall === 'Yes' && (
                  <div className="flex items-start gap-2 mt-2 mb-1 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800">
                    <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs font-semibold text-red-800 dark:text-red-200">{t('fleet.detailModal.infoRecall')}</p>
                  </div>
                )}
                {(() => {
                  const rows: Array<[string, string]> = [
                    [t('fleet.detailModal.infoMake'), infoData.make],
                    [t('fleet.detailModal.infoModel'), infoData.model],
                    [t('fleet.detailModal.infoFuel'), infoData.fuelType],
                    [t('fleet.detailModal.infoEngine'), infoData.engineCapacity ? `${infoData.engineCapacity} cc` : ''],
                    [t('fleet.detailModal.infoMileage'), infoData.mileage != null ? `${infoData.mileage.toLocaleString()} ${(infoData.mileageUnit || 'MI').toLowerCase()}` : ''],
                    [t('fleet.detailModal.infoCo2'), infoData.co2Emissions != null ? `${infoData.co2Emissions} g/km` : ''],
                    [t('fleet.detailModal.infoWeight'), infoData.revenueWeight ? `${infoData.revenueWeight} kg` : ''],
                    [t('fleet.detailModal.infoYear'), infoData.yearOfManufacture ? String(infoData.yearOfManufacture) : ''],
                    [t('fleet.detailModal.infoEuro'), infoData.euroStatus],
                    [t('fleet.detailModal.infoWheelplan'), infoData.wheelplan],
                  ].filter((r): r is [string, string] => Boolean(r[1]))
                  return rows.length > 0 ? (
                    <div className="divide-y divide-[#f0f4f2] dark:divide-gray-800">
                      {rows.map(([label, value]) => (
                        <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
                          <span className="text-[11px] font-semibold text-[#8a9e94] uppercase tracking-wide flex-shrink-0">{label}</span>
                          <span className="text-sm font-bold text-[#012619] dark:text-white text-right">{value}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[#8a9e94] py-4">{t('fleet.detailModal.infoEmpty')}</p>
                  )
                })()}
                {infoData.advisories.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#e2e8e5] dark:border-gray-700">
                    <p className="text-[11px] font-bold text-[#8a9e94] uppercase tracking-wide mb-2">{t('fleet.detailModal.infoAdvisories')}</p>
                    <ul className="space-y-1.5 pb-1">
                      {infoData.advisories.map((a, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs">
                          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.dangerous || /MAJOR|DANGEROUS|FAIL/i.test(a.type) ? 'bg-red-500' : /MINOR/i.test(a.type) ? 'bg-amber-500' : 'bg-[#72A68E]'}`} />
                          <span className="text-[#4a5e54] dark:text-gray-300 leading-snug">{a.text}{a.type ? <span className="text-[#8a9e94]"> · {a.type}</span> : null}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* Source footnote */}
          <div className="px-5 py-2.5 bg-[#f8faf9] dark:bg-gray-800/50 border-t border-[#e2e8e5] dark:border-gray-700">
            <p className="text-[10px] text-[#8a9e94] text-center">{t('fleet.detailModal.infoSource')}</p>
          </div>
        </div>
      </div>
    )}
    </>
  )
}