// src/components/features/dashboard/HireModals.tsx
'use client'

import React, { useState, useEffect } from 'react'
import { X, Car, ArrowLeft, Calendar, User, FileText, AlertTriangle, CheckCircle, Gauge, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CheckedInVehicle } from '@/types'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { settingsService, ServiceSettings, DEFAULT_SERVICE_SETTINGS } from '@/lib/services/settingsService'
import { mileageService } from '@/lib/services/mileageService'
import { hireAgreementService } from '@/lib/services/hireAgreementService'
import { hireSettingsService } from '@/lib/services/hireSettingsService'
import { HireSwapModal } from '@/components/features/hire/HireSwapModal'
import type { HireAgreement, HireAgreementVehicle } from '@/types/hire'

const ymdToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const euFromYmd = (iso?: string | null) => {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : ''
}

interface AgreementMatch {
  customer: string
  label: string
  reference?: string | null
  startDate?: string | null
  future: boolean
}

type TFunc = (key: string, vars?: Record<string, string | number>) => string

interface SetOutOnHireModalProps {
  vehicle: CheckedInVehicle
  isOpen: boolean
  onClose: () => void
  onConfirm: (vehicleId: string, hireNotes?: string) => Promise<void>
  loading?: boolean
}

interface QuickCheckInModalProps {
  vehicle: CheckedInVehicle
  isOpen: boolean
  onClose: () => void
  onConfirm: (vehicleId: string, returnNotes?: string, mileage?: string) => Promise<void>
  loading?: boolean
}

const safeString = (value: any): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  return String(value)
}

const formatDateTime = (date: any, t: TFunc): string => {
  if (!date) return t('dashboard.hire.dateUnknown')
  try {
    const d = date.toDate ? date.toDate() : new Date(date)
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return t('dashboard.hire.invalidDate')
  }
}

export function SetOutOnHireModal({ 
  vehicle, 
  isOpen, 
  onClose, 
  onConfirm, 
  loading = false
}: SetOutOnHireModalProps) {

  const t = useT()
  const { user } = useAuth()
  const [match, setMatch] = useState<AgreementMatch | null>(null)

  // On open, see if this vehicle is on an open hire-agreement line so we can
  // confirm "Setting up on hire with {customer}, {label}?" (+ future warning).
  useEffect(() => {
    if (!isOpen || !user?.uid) {
      setMatch(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const profile = await userProfileService.getProfile(user.uid)
        const orgId = profile?.organizationId
        if (!orgId || cancelled) return
        const line = await hireAgreementService.findOpenLineByRegistration(orgId, vehicle.registration || '')
        if (!line || cancelled) return
        const [agreement, settings] = await Promise.all([
          hireAgreementService.getAgreement(line.agreementId),
          hireSettingsService.getHireSettings(orgId),
        ])
        if (!agreement || cancelled) return
        setMatch({
          customer: agreement.customerName || '—',
          label: settings.agreementLabelSingular,
          reference: agreement.reference,
          startDate: agreement.startDate,
          future: !!agreement.startDate && agreement.startDate > ymdToday(),
        })
      } catch (err) {
        logger.error('SetOutOnHireModal: agreement lookup failed', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, user?.uid, vehicle.registration])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    try {
      await onConfirm(vehicle.id, undefined)
      onClose()
    } catch (error) {
      logger.error('Error setting vehicle out on hire:', error)
    }
  }

  const handleClose = () => {
    if (!loading) onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-[#e2e8e5] dark:border-gray-700">

        {/* Header — brand dark green */}
        <div className="bg-[#012619] px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#b3f243]/20 rounded-xl border border-[#b3f243]/30">
              <Car className="w-5 h-5 text-[#b3f243]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                {t('dashboard.hire.setOutTitle')}
              </h3>
              <p className="text-xs text-[#72A68E] mt-0.5">
                {safeString(vehicle.registration)} · {safeString(vehicle.make)} {safeString(vehicle.model)}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-[#72A68E] hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* Vehicle info grid */}
          <div className="bg-[#f0f4f2] dark:bg-gray-800 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-[#8a9e94] text-xs font-medium uppercase tracking-wide">{t('dashboard.hire.labelStatus')}</span>
              <p className="text-[#012619] dark:text-white font-semibold mt-0.5">{safeString(vehicle.status) || '—'}</p>
            </div>
            <div>
              <span className="text-[#8a9e94] text-xs font-medium uppercase tracking-wide">{t('dashboard.hire.labelCondition')}</span>
              <p className="text-[#012619] dark:text-white font-semibold mt-0.5">{safeString(vehicle.condition) || '—'}</p>
            </div>
            <div>
              <span className="text-[#8a9e94] text-xs font-medium uppercase tracking-wide">{t('dashboard.hire.labelSize')}</span>
              <p className="text-[#012619] dark:text-white font-semibold mt-0.5">{safeString(vehicle.size) || '—'}</p>
            </div>
            <div>
              <span className="text-[#8a9e94] text-xs font-medium uppercase tracking-wide">{t('dashboard.hire.labelColour')}</span>
              <p className="text-[#012619] dark:text-white font-semibold mt-0.5">{safeString(vehicle.colour) || '—'}</p>
            </div>
          </div>

          {/* 🔗 Hire-agreement match — "Setting up on hire with X, Contract Y?" */}
          {match && (
            <div className="rounded-xl border-2 border-[#025940]/40 bg-[#025940]/5 dark:bg-[#025940]/10 p-4">
              <div className="flex items-start gap-3">
                <FileText className="w-4 h-4 text-[#025940] dark:text-[#b3f243] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-[#012619] dark:text-white">
                    {t('dashboard.hire.agreementMatch', { customer: match.customer, label: match.label })}
                  </p>
                  {match.reference && <p className="text-xs text-[#72A68E] mt-0.5">{match.reference}</p>}
                  <p className="text-xs text-[#4a5e54] dark:text-gray-300 mt-1">
                    {t('dashboard.hire.agreementMatchHint', { label: match.label })}
                  </p>
                </div>
              </div>
              {match.future && (
                <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">
                    {t('dashboard.hire.agreementFutureWarn', { date: euFromYmd(match.startDate) })}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Warning notice */}
          <div className="flex gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
              {t('dashboard.hire.setOutWarning', { status: safeString(vehicle.status), strongStart: '', strongEnd: '' })}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 bg-[#f0f4f2] dark:bg-gray-800 text-[#4a5e54] dark:text-gray-300 hover:bg-[#e2e8e5] dark:hover:bg-gray-700 font-semibold py-2.5 border-0 shadow-none"
            >
              {t('dashboard.common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-[#025940] hover:bg-[#012619] text-white font-bold py-2.5 shadow-sm hover:shadow-md transition-all border-0"
            >
              {loading ? t('dashboard.hire.settingOut') : t('dashboard.hire.setOutBtn')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function QuickCheckInModal({
  vehicle,
  isOpen,
  onClose,
  onConfirm,
  loading = false
}: QuickCheckInModalProps) {

  const t = useT()
  const { user } = useAuth()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [settings, setSettings] = useState<ServiceSettings>(DEFAULT_SERVICE_SETTINGS)
  const [mileage, setMileage] = useState('')
  const [mileageNA, setMileageNA] = useState(false)
  // Hire-agreement decision when the returning vehicle is on an active line.
  const [hireLine, setHireLine] = useState<{ line: HireAgreementVehicle; agreement: HireAgreement; label: string } | null>(null)
  const [decision, setDecision] = useState<'end' | 'temp' | 'swap'>('end')
  const [showSwap, setShowSwap] = useState(false)
  // Floor = highest historical reading OR the vehicle's current (out-on-hire)
  // reading, whichever is higher — a returning vehicle can't have fewer miles.
  const [floor, setFloor] = useState<number | null>(null)

  // Load org settings + the anti-clocking floor when the modal opens.
  useEffect(() => {
    if (!isOpen || !user?.uid) return
    let cancelled = false
    setMileage(''); setMileageNA(false); setFloor(null); setHireLine(null); setDecision('end'); setShowSwap(false)
    ;(async () => {
      try {
        const profile = await userProfileService.getProfile(user.uid)
        const org = profile?.organizationId
        if (!org || cancelled) return
        setOrgId(org)
        const [svc, histFloor] = await Promise.all([
          settingsService.getServiceSettings(org),
          mileageService.getMileageFloor(org, vehicle.registration || ''),
        ])
        if (cancelled) return
        setSettings(svc)
        const current = parseInt(String(vehicle.mileage ?? '').replace(/[,\s]/g, ''), 10)
        const floors = [histFloor, Number.isFinite(current) ? current : null].filter(
          (n): n is number => typeof n === 'number',
        )
        setFloor(floors.length ? Math.max(...floors) : null)
        // Is this vehicle on an active hire line? If so, offer end / temp / swap.
        const line = await hireAgreementService.findOpenLineByRegistration(org, vehicle.registration || '')
        if (line && line.status === 'active' && !cancelled) {
          const [agreement, hs] = await Promise.all([
            hireAgreementService.getAgreement(line.agreementId),
            hireSettingsService.getHireSettings(org),
          ])
          if (agreement && !cancelled) setHireLine({ line, agreement, label: hs.agreementLabelSingular })
        }
      } catch (err) {
        logger.error('QuickCheckIn settings/floor load failed:', err)
      }
    })()
    return () => { cancelled = true }
  }, [isOpen, user?.uid, vehicle.id, vehicle.registration, vehicle.mileage])

  const enteredMiles = parseInt((mileage || '').replace(/[,\s]/g, ''), 10)
  const mileageBelowFloor = !mileageNA && floor !== null && Number.isFinite(enteredMiles) && enteredMiles < floor
  const serviceDue =
    settings.serviceDueEnabled && !mileageNA && floor !== null && Number.isFinite(enteredMiles)
      ? enteredMiles - floor >= settings.serviceDueThresholdMiles
      : false

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    if (settings.captureMileageOnCheckIn && !mileageNA && !mileage.trim()) {
      alert(t('dashboard.hire.mileageRequired'))
      return
    }
    if (mileageBelowFloor && floor !== null) {
      alert(t('dashboard.hire.mileageTooLow', { min: floor.toLocaleString('en-GB') }))
      return
    }
    // Swap is a two-step flow — open the swap picker; the physical return runs
    // once the replacement is chosen (see HireSwapModal onDone below).
    if (hireLine && decision === 'swap') {
      setShowSwap(true)
      return
    }
    try {
      const mi = mileageNA ? '' : mileage.trim()
      await onConfirm(vehicle.id, undefined, mi)
      if (hireLine && orgId) {
        const profile = user?.uid ? await userProfileService.getProfile(user.uid) : null
        const actorName = profile?.displayName || user?.email || 'Unknown'
        const periodStart =
          (hireLine.line.actualOutAt ? hireLine.line.actualOutAt.slice(0, 10) : hireLine.line.scheduledStart) ||
          hireLine.agreement.startDate
        if (decision === 'end') {
          await hireAgreementService.endLine({
            organizationId: orgId,
            agreementId: hireLine.agreement.id,
            lineId: hireLine.line.id,
            vehicleId: hireLine.line.vehicleId,
            registration: vehicle.registration,
            periodStart,
            rateType: (hireLine.line.lineRateType || hireLine.agreement.rateType),
            rateAmount: hireLine.line.lineRateAmount ?? hireLine.agreement.rateAmount,
            checkedInVehicleId: vehicle.id,
            actorId: user?.uid || null,
            actorName,
          })
        } else if (decision === 'temp') {
          await hireAgreementService.markTempReturn({
            organizationId: orgId,
            lineId: hireLine.line.id,
            registration: vehicle.registration,
            checkedInVehicleId: vehicle.id,
            actorId: user?.uid || null,
            actorName,
          })
        }
      }
      onClose()
    } catch (error) {
      logger.error('Error returning vehicle from hire:', error)
    }
  }

  const handleClose = () => {
    if (!loading) onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-[#e2e8e5] dark:border-gray-700">

        {/* Header — brand dark green */}
        <div className="bg-[#012619] px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#b3f243]/20 rounded-xl border border-[#b3f243]/30">
              <ArrowLeft className="w-5 h-5 text-[#b3f243]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                {t('dashboard.hire.quickCheckInTitle')}
              </h3>
              <p className="text-xs text-[#72A68E] mt-0.5">
                {safeString(vehicle.registration)} · {safeString(vehicle.make)} {safeString(vehicle.model)}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-[#72A68E] hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* Hire details */}
          <div className="bg-[#f0f4f2] dark:bg-gray-800 rounded-xl p-4 space-y-2.5">
            <h4 className="text-xs font-bold text-[#8a9e94] uppercase tracking-wide">
              {t('dashboard.hire.currentHireDetails')}
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-[#4a5e54] dark:text-gray-300">
                <Calendar className="w-3.5 h-3.5 text-[#025940] flex-shrink-0" />
                <span>{t('dashboard.hire.hiredOn', { date: formatDateTime(vehicle.hiredAt, t) })}</span>
              </div>
              <div className="flex items-center gap-2 text-[#4a5e54] dark:text-gray-300">
                <User className="w-3.5 h-3.5 text-[#025940] flex-shrink-0" />
                <span>{t('dashboard.hire.hiredBy', { name: safeString(vehicle.hiredByName) || t('dashboard.hire.unknownPerson') })}</span>
              </div>
              {vehicle.hireNotes && (
                <div className="flex items-start gap-2 text-[#4a5e54] dark:text-gray-300">
                  <FileText className="w-3.5 h-3.5 text-[#025940] flex-shrink-0 mt-0.5" />
                  <span>{t('dashboard.hire.notesLabel', { notes: safeString(vehicle.hireNotes) })}</span>
                </div>
              )}
            </div>
          </div>

          {/* Info notice */}
          <div className="flex gap-3 bg-[#f0fdf4] dark:bg-[#025940]/20 border border-[#b3f243]/40 dark:border-[#025940] rounded-xl p-4">
            <CheckCircle className="w-4 h-4 text-[#025940] dark:text-[#b3f243] flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[#025940] dark:text-[#72A68E] leading-relaxed">
              {t('dashboard.hire.checkInInfo', { status: safeString(vehicle.originalStatus || vehicle.status), strongStart: '', strongEnd: '' })}
            </p>
          </div>

          {/* Return mileage (only when the org requires mileage at check-in) */}
          {settings.captureMileageOnCheckIn && (
            <div>
              <label className="block text-xs text-[#8a9e94] font-medium mb-1.5">
                {t('dashboard.hire.mileageLabel')}<span className="text-red-500 ml-0.5">*</span>
              </label>
              <div className="relative">
                <Gauge className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8a9e94]" />
                <input
                  type="number"
                  value={mileageNA ? '' : mileage}
                  onChange={e => setMileage(e.target.value)}
                  placeholder={t('dashboard.hire.mileagePlaceholder')}
                  disabled={mileageNA || loading}
                  className={`w-full pl-9 pr-3 py-2.5 text-sm border rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] ${
                    mileageBelowFloor ? 'border-red-400' : 'border-[#e2e8e5] dark:border-gray-600'
                  } ${mileageNA ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>

              <label className="mt-2 flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={mileageNA}
                  onChange={e => { setMileageNA(e.target.checked); if (e.target.checked) setMileage('') }}
                  className="w-3.5 h-3.5 rounded border-[#c8d5ce] text-[#025940] focus:ring-[#025940]/30"
                />
                <span className="text-[11px] text-[#8a9e94]">{t('dashboard.hire.mileageNotAvailable')}</span>
              </label>

              {mileageBelowFloor && floor !== null && (
                <p className="mt-2 text-[11px] text-red-500 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  {t('dashboard.hire.mileageTooLow', { min: floor.toLocaleString('en-GB') })}
                </p>
              )}
              {serviceDue && !mileageBelowFloor && floor !== null && (
                <div className="mt-2 flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl px-3 py-2">
                  <Wrench className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
                    {t('dashboard.hire.serviceDueWarning', { miles: (enteredMiles - floor).toLocaleString('en-GB') })}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 🔗 On an active hire line → choose what this check-in means */}
          {hireLine && (
            <div className="rounded-xl border-2 border-[#025940]/30 bg-[#025940]/5 dark:bg-[#025940]/10 p-3 space-y-2">
              <p className="text-xs font-bold text-[#012619] dark:text-white">
                {t('dashboard.hire.onContract', { customer: hireLine.agreement.customerName || '—', label: hireLine.label })}
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  ['end', t('dashboard.hire.choEnd')],
                  ['temp', t('dashboard.hire.choTemp')],
                  ['swap', t('dashboard.hire.choSwap')],
                ] as const).map(([k, lbl]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setDecision(k)}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                      decision === k
                        ? 'bg-[#025940] text-white border-[#025940]'
                        : 'bg-white dark:bg-gray-800 text-[#4a5e54] dark:text-gray-300 border-[#e2e8e5] dark:border-gray-600 hover:border-[#72A68E]'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-[#72A68E] leading-snug">
                {decision === 'end' ? t('dashboard.hire.choEndHint')
                  : decision === 'temp' ? t('dashboard.hire.choTempHint')
                    : t('dashboard.hire.choSwapHint')}
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 bg-[#f0f4f2] dark:bg-gray-800 text-[#4a5e54] dark:text-gray-300 hover:bg-[#e2e8e5] dark:hover:bg-gray-700 font-semibold py-2.5 border-0 shadow-none"
            >
              {t('dashboard.common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={
                loading ||
                (settings.captureMileageOnCheckIn && !mileageNA && !mileage.trim()) ||
                mileageBelowFloor
              }
              className="flex-1 bg-[#025940] hover:bg-[#012619] text-white font-bold py-2.5 shadow-sm hover:shadow-md transition-all border-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? t('dashboard.hire.checkingIn')
                : hireLine && decision === 'swap'
                  ? t('dashboard.hire.chooseReplacementBtn')
                  : hireLine && decision === 'temp'
                    ? t('dashboard.hire.tempReturnBtn')
                    : hireLine && decision === 'end'
                      ? t('dashboard.hire.endHireBtn')
                      : t('dashboard.hire.checkInBtn')}
            </Button>
          </div>
        </form>
      </div>

      {showSwap && hireLine && (
        <HireSwapModal
          organizationId={orgId}
          agreement={hireLine.agreement}
          fromLine={hireLine.line}
          onClose={() => setShowSwap(false)}
          onDone={async () => {
            setShowSwap(false)
            try {
              await onConfirm(vehicle.id, undefined, mileageNA ? '' : mileage.trim())
            } catch (err) {
              logger.error('Return after swap failed:', err)
            }
            onClose()
          }}
        />
      )}
    </div>
  )
}