// src/components/features/checkout-history/CheckoutHistoryTable.tsx
'use client'

import React from 'react'
import { Car, Calendar, User, Loader2 } from 'lucide-react'
import { useT } from '@/lib/i18n'

interface CheckoutHistoryTableProps {
  records: any[]
  loading?: boolean
}

function toDate(val: any): Date | null {
  if (!val) return null
  if (typeof val?.toDate === 'function') return val.toDate()
  if (val instanceof Date) return val
  try { return new Date(val) } catch { return null }
}

function formatDate(val: any) {
  const d = toDate(val)
  if (!d || isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function conditionStyle(c?: string) {
  const lc = (c || '').toLowerCase()
  if (lc.includes('excellent') || lc.includes('good')) return { dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' }
  if (lc.includes('fair') || lc.includes('average')) return { dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' }
  if (lc.includes('poor') || lc.includes('damage')) return { dot: 'bg-red-500', text: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' }
  return { dot: 'bg-gray-400', text: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700/30' }
}

function activityStyle(type?: string) {
  switch (type) {
    case 'hire':           return { dot: 'bg-purple-500', label: 'Out on Hire',    labelKey: 'checkout.activity.outOnHire',    bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-700 dark:text-purple-400', emoji: '🚗' }
    case 'transfer':       return { dot: 'bg-blue-500',   label: 'Transfer',       labelKey: 'checkout.activity.transfer',     bg: 'bg-blue-50 dark:bg-blue-900/20',     text: 'text-blue-700 dark:text-blue-400',     emoji: '🔄' }
    case 'external_garage':return { dot: 'bg-orange-500', label: 'Ext. Garage',    labelKey: 'checkout.activity.extGarageShort', bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-700 dark:text-orange-400', emoji: '🔧' }
    default:               return { dot: 'bg-[#025940]',  label: 'Checked Out',   labelKey: 'checkout.activity.checkedOut',   bg: 'bg-[#025940]/8 dark:bg-[#72A68E]/10', text: 'text-[#025940] dark:text-[#72A68E]',   emoji: '↗' }
  }
}

export function CheckoutHistoryTable({ records, loading = false }: CheckoutHistoryTableProps) {
  const t = useT()
  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/80 flex items-center justify-center h-48">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-[#025940]" />
          <p className="text-xs text-gray-400">{t('checkout.table.loading')}</p>
        </div>
      </div>
    )
  }

  if (!records || records.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/80 py-14 text-center">
        <Car className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('checkout.table.emptyTitle')}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('checkout.table.emptySubtitle')}</p>
      </div>
    )
  }

  return (
    <>
      {/* ── Desktop table ── */}
      <div className="hidden lg:block rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/80 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-700/20">
              {[t('checkout.table.colVehicle'), t('checkout.table.colActivity'), t('checkout.table.colCondition'), t('checkout.table.colMileage'), t('checkout.table.colDateTime'), t('checkout.table.colActionedBy')].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
            {records.map((record) => {
              const activity = activityStyle(record.activityType)
              const condition = conditionStyle(record.condition)
              return (
                <tr key={record.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-700/10 transition-colors group">

                  {/* Vehicle */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-1 h-8 rounded-full flex-shrink-0 ${activity.dot}`} />
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white font-mono tracking-wide">{record.registration}</p>
                        <p className="text-xs text-gray-400">{record.make} {record.model}</p>
                      </div>
                    </div>
                  </td>

                  {/* Activity */}
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${activity.bg} ${activity.text}`}>
                      <span>{activity.emoji}</span>
                      {record.activityLabel || t(activity.labelKey)}
                    </span>
                    {(record.originalBranchName || record.targetBranchName) && (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {record.originalBranchName}{record.targetBranchName ? ` → ${record.targetBranchName}` : ''}
                      </p>
                    )}
                  </td>

                  {/* Condition */}
                  <td className="px-4 py-3">
                    {record.condition ? (
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${condition.bg} ${condition.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${condition.dot}`} />
                        {record.condition}
                      </span>
                    ) : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
                    {record.status && (
                      <p className="text-[10px] text-gray-400 mt-0.5">{record.status}</p>
                    )}
                  </td>

                  {/* Mileage */}
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-700 dark:text-gray-300 tabular-nums">{record.mileage || '—'}</span>
                  </td>

                  {/* Date */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <Calendar className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                      {formatDate(record.checkedOutDate)}
                    </div>
                  </td>

                  {/* By */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-[#025940]/10 dark:bg-[#72A68E]/10 flex items-center justify-center flex-shrink-0">
                        <User className="w-2.5 h-2.5 text-[#025940] dark:text-[#72A68E]" />
                      </div>
                      <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">{record.checkedOutByName || '—'}</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Mobile cards ── */}
      <div className="lg:hidden space-y-2">
        {records.map((record) => {
          const activity = activityStyle(record.activityType)
          const condition = conditionStyle(record.condition)
          return (
            <div key={record.id} className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/80 p-3.5">
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className={`w-1 h-9 rounded-full flex-shrink-0 ${activity.dot}`} />
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white font-mono">{record.registration}</p>
                    <p className="text-xs text-gray-400">{record.make} {record.model}</p>
                  </div>
                </div>
                {record.mileage && (
                  <div className="text-right">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{record.mileage}</p>
                    <p className="text-[10px] text-gray-400">{t('checkout.table.miles')}</p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 mb-2.5">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${activity.bg} ${activity.text}`}>
                  {activity.emoji} {record.activityLabel || t(activity.labelKey)}
                </span>
                {record.condition && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${condition.bg} ${condition.text}`}>
                    {record.condition}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-400 pt-2 border-t border-gray-50 dark:border-gray-700/40">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(record.checkedOutDate)}
                </span>
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {record.checkedOutByName || '—'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}