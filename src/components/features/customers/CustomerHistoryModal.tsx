// src/components/features/customers/CustomerHistoryModal.tsx
// Read-only "what have we done for this customer" view. Opens on demand
// from the customers list; only then does it run a single capped getDocs
// against completed serviceBookings (matched by phone) — no listener, no
// new collection, negligible Firestore cost.
'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  X, Loader2, Wrench, Building2, Gauge, Phone, Mail, Calendar, Car, RefreshCw,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { useBranches } from '@/hooks/useBranches'
import { bayLabel } from '@/utils/serviceBookings/bayLabels'
import { useT } from '@/lib/i18n'
import { logger } from '@/lib/logger'
import { customerJobHistoryService } from '@/lib/services/customerJobHistoryService'
import type { CustomerJobRecord } from '@/types/customerJobHistory'
import type { Customer } from '@/types/customer'

function displayDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

const plateCls =
  'inline-block bg-yellow-300 text-black font-mono font-black tracking-[0.06em] border-[1.5px] border-black rounded-[3px] px-1.5 py-[1px] text-[11px] leading-tight'

export function CustomerHistoryModal({
  customer,
  onClose,
}: {
  customer: Customer
  onClose: () => void
}) {
  const t = useT()
  const { user } = useAuth()
  const { branches } = useBranches()
  // Resolve a record's custom bay names by its branch name. Falls back to the
  // main/first branch (covers single-branch orgs where records carry no branch).
  const bayNamesFor = (branchName?: string): string[] | undefined => {
    const b = branchName
      ? branches.find((x) => x.name === branchName)
      : (branches.find((x) => x.isMain) ?? branches[0])
    return (b ?? branches.find((x) => x.isMain) ?? branches[0])?.serviceBayNames
  }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [records, setRecords] = useState<CustomerJobRecord[]>([])

  const load = useCallback(async () => {
    if (!user?.uid) return
    setLoading(true)
    setError(false)
    try {
      const profile = await userProfileService.getProfile(user.uid)
      const orgId = profile?.organizationId
      if (!orgId) {
        setRecords([])
        return
      }
      const rows = await customerJobHistoryService.getCustomerJobHistory({
        organizationId: orgId,
        phone: customer.phone,
        phoneNormalized: customer.phoneNormalized,
      })
      setRecords(rows)
    } catch (err) {
      logger.error('CustomerHistoryModal: load failed', err)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [user?.uid, customer.phone, customer.phoneNormalized])

  useEffect(() => {
    load()
  }, [load])

  const regs = customer.registrations || []

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 bg-gradient-to-r from-[#025940] to-[#72A68E] text-white flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold truncate">
              {t('customers.history.title')}
            </h2>
            <p className="text-sm font-semibold mt-0.5 truncate">{customer.name || '—'}</p>
            <div className="flex items-center gap-3 mt-1 text-[11px] text-white/80 flex-wrap">
              {customer.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {customer.phone}
                </span>
              )}
              {customer.email && (
                <span className="inline-flex items-center gap-1 truncate">
                  <Mail className="w-3 h-3" />
                  {customer.email}
                </span>
              )}
              {customer.lastBookingDate && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {t('customers.lastBookingPrefix', { date: customer.lastBookingDate })}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
            aria-label={t('customers.history.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto">
          {/* Vehicles on record */}
          <div className="mb-4">
            <p className="text-[11px] font-semibold text-[#4a5e54] dark:text-gray-300 uppercase tracking-wide mb-1.5">
              {t('customers.history.vehiclesLabel')}
            </p>
            {regs.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                {t('customers.history.noVehicles')}
              </p>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                {regs.map((reg) => (
                  <span key={reg} className={plateCls}>
                    {reg}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Past jobs */}
          <p className="text-[11px] font-semibold text-[#4a5e54] dark:text-gray-300 uppercase tracking-wide mb-2">
            {t('customers.history.jobsLabel')}
            {!loading && !error && records.length > 0 && (
              <span className="ml-1.5 text-[#8a9e94] font-normal">
                {t('customers.history.jobsCount', { count: records.length })}
              </span>
            )}
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-[#8a9e94]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">{t('customers.history.loading')}</span>
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <p className="text-sm text-red-600 dark:text-red-400 mb-3">
                {t('customers.history.error')}
              </p>
              <button
                onClick={load}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#025940] dark:text-[#72A68E] hover:underline"
              >
                <RefreshCw className="w-4 h-4" />
                {t('customers.history.retry')}
              </button>
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-10">
              <Wrench className="w-8 h-8 text-[#c8d5ce] mx-auto mb-2" />
              <p className="text-sm text-[#8a9e94]">{t('customers.history.empty')}</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {records.map((r) => {
                const isExternal = r.locationType === 'external'
                return (
                  <div
                    key={r.id}
                    className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 p-3.5"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-extrabold text-[#012619] dark:text-white">
                        {displayDate(r.date)}
                      </span>
                      <span className={plateCls}>{r.registration}</span>
                      {(r.make || r.model) && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#4a5e54] dark:text-gray-400">
                          <Car className="w-3 h-3" />
                          {[r.make, r.model].filter(Boolean).join(' ')}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${
                          isExternal
                            ? 'bg-[#fff4e5] text-[#92400e] border border-[#fcd34d]'
                            : 'bg-[#e6f4ec] text-[#0d6b2e] border border-[#86efac]'
                        }`}
                      >
                        {isExternal ? (
                          <Building2 className="w-2.5 h-2.5" />
                        ) : (
                          <Wrench className="w-2.5 h-2.5" />
                        )}
                        {isExternal
                          ? t('customers.history.external')
                          : t('customers.history.internal')}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-[#012619] dark:text-white mt-1.5">
                      {r.workDone || '—'}
                    </p>

                    {isExternal && r.garageName && (
                      <p className="text-xs text-[#4a5e54] dark:text-gray-400 mt-0.5">
                        {r.garageName}
                        {r.garageAddress ? ` · ${r.garageAddress}` : ''}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-[#8a9e94]">
                      {!isExternal && r.mechanicName && (
                        <span>
                          {t('customers.history.mechanicLabel')}:{' '}
                          <span className="font-semibold text-[#4a5e54] dark:text-gray-300">
                            {r.mechanicName}
                          </span>
                          {typeof r.serviceBay === 'number'
                            ? ` · ${bayLabel(bayNamesFor(r.branchName), r.serviceBay, t('customers.history.bay', { bay: r.serviceBay }))}`
                            : ''}
                        </span>
                      )}
                      {r.branchName && (
                        <span>
                          {t('customers.history.branchLabel')}:{' '}
                          <span className="font-semibold text-[#4a5e54] dark:text-gray-300">
                            {r.branchName}
                          </span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Gauge className="w-3 h-3" />
                        {t('customers.history.mileageLabel')}:{' '}
                        {r.mileage != null ? (
                          <span className="font-semibold text-[#4a5e54] dark:text-gray-300">
                            {r.mileage.toLocaleString()} {t('customers.history.mileageUnit')}
                          </span>
                        ) : (
                          <span className="italic">
                            {t('customers.history.mileageNotRecorded')}
                          </span>
                        )}
                      </span>
                    </div>

                    {r.notes && (
                      <p className="text-xs text-[#4a5e54] dark:text-gray-400 mt-2 leading-relaxed">
                        <span className="font-semibold">
                          {t('customers.history.notesLabel')}:
                        </span>{' '}
                        {r.notes}
                      </p>
                    )}

                    {r.completedByName && (
                      <p className="text-[10px] text-[#8a9e94] mt-2">
                        {t('customers.history.completedByLabel')}: {r.completedByName}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default CustomerHistoryModal
