// src/components/features/dashboard/HireModals.tsx
'use client'

import React, { useState } from 'react'
import { X, Car, ArrowLeft, Calendar, User, FileText, AlertTriangle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CheckedInVehicle } from '@/types'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

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
  onConfirm: (vehicleId: string, returnNotes?: string) => Promise<void>
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    try {
      await onConfirm(vehicle.id, undefined)
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
              {loading ? t('dashboard.hire.checkingIn') : t('dashboard.hire.checkInBtn')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}