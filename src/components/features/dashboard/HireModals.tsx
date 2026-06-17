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

  const [settings, setSettings] = useState<ServiceSettings>(DEFAULT_SERVICE_SETTINGS)
  const [mileage, setMileage] = useState('')
  const [mileageNA, setMileageNA] = useState(false)
  // Floor = highest historical reading OR the vehicle's current (out-on-hire)
  // reading, whichever is higher — a returning vehicle can't have fewer miles.
  const [floor, setFloor] = useState<number | null>(null)

  // Load org settings + the anti-clocking floor when the modal opens.
  useEffect(() => {
    if (!isOpen || !user?.uid) return
    let cancelled = false
    setMileage(''); setMileageNA(false); setFloor(null)
    ;(async () => {
      try {
        const profile = await userProfileService.getProfile(user.uid)
        const orgId = profile?.organizationId
        if (!orgId || cancelled) return
        const [svc, histFloor] = await Promise.all([
          settingsService.getServiceSettings(orgId),
          mileageService.getHistoricalMileageFloor(orgId, vehicle.registration || ''),
        ])
        if (cancelled) return
        setSettings(svc)
        const current = parseInt(String(vehicle.mileage ?? '').replace(/[,\s]/g, ''), 10)
        const floors = [histFloor, Number.isFinite(current) ? current : null].filter(
          (n): n is number => typeof n === 'number',
        )
        setFloor(floors.length ? Math.max(...floors) : null)
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
    try {
      await onConfirm(vehicle.id, undefined, mileageNA ? '' : mileage.trim())
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
              {loading ? t('dashboard.hire.checkingIn') : t('dashboard.hire.checkInBtn')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}