// src/components/fleet/VehicleServiceHistoryPanel.tsx
// Per-vehicle service history tab. Mounted only when the user opens the
// "Service History" tab, so the on-demand getDocs reads (completed
// bookings + manual records for THIS vehicle) cost nothing until then.
'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Plus, Wrench, Building2, Pencil, Trash2, X, Loader2, Gauge } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'
import { useBranches } from '@/hooks/useBranches'
import { bayLabel } from '@/utils/serviceBookings/bayLabels'
import { vehicleServiceHistoryService } from '@/lib/services/vehicleServiceHistoryService'
import type {
  VehicleServiceRecord,
  ServiceLocationType,
} from '@/types/vehicleServiceHistory'

interface Props {
  registration: string
  make?: string
  model?: string
}

const inputCls =
  'w-full px-3 py-2.5 text-sm border border-[#e2e8e5] dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] shadow-sm transition-colors placeholder-[#c8d5ce]'
const labelCls = 'block text-[11px] font-semibold text-[#4a5e54] dark:text-gray-300 uppercase tracking-wide mb-1.5'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function displayDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

interface FormState {
  date: string
  locationType: ServiceLocationType
  garageName: string
  workDone: string
  mechanicName: string
  mileage: string
  notes: string
}

const emptyForm = (): FormState => ({
  date: todayStr(),
  locationType: 'internal',
  garageName: '',
  workDone: '',
  mechanicName: '',
  mileage: '',
  notes: '',
})

export function VehicleServiceHistoryPanel({ registration, make, model }: Props) {
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

  const [orgId, setOrgId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [records, setRecords] = useState<VehicleServiceRecord[]>([])

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Resolve organization, then load history (one small profile read)
  useEffect(() => {
    let cancelled = false
    if (!user?.uid) return
    userProfileService
      .getProfile(user.uid)
      .then(p => {
        if (!cancelled) setOrgId(p?.organizationId || null)
      })
      .catch(err => {
        logger.error('ServiceHistory: failed to resolve organization', err)
        if (!cancelled) {
          setError(t('fleet.serviceHistory.errorLoad'))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [user?.uid, t])

  const load = useCallback(async () => {
    if (!orgId || !registration) return
    setLoading(true)
    setError(null)
    try {
      const data = await vehicleServiceHistoryService.getVehicleServiceHistory({
        organizationId: orgId,
        registration,
      })
      setRecords(data)
    } catch {
      setError(t('fleet.serviceHistory.errorLoad'))
    } finally {
      setLoading(false)
    }
  }, [orgId, registration, t])

  useEffect(() => {
    if (orgId) load()
  }, [orgId, load])

  const openAdd = () => {
    setEditingId(null)
    setForm(emptyForm())
    setShowForm(true)
  }

  const openEdit = (r: VehicleServiceRecord) => {
    setEditingId(r.id)
    setForm({
      date: r.date || todayStr(),
      locationType: r.locationType,
      garageName: r.garageName || '',
      workDone: r.workDone || '',
      mechanicName: r.mechanicName || '',
      mileage: r.mileage != null ? String(r.mileage) : '',
      notes: r.notes || '',
    })
    setShowForm(true)
  }

  const canSave = form.date.trim() !== '' && form.workDone.trim() !== '' && !saving

  const handleSave = async () => {
    if (!orgId || !user || !canSave) return
    setSaving(true)
    setError(null)
    const mileageNum = form.mileage.trim() === '' ? null : Number(form.mileage)
    try {
      if (editingId) {
        await vehicleServiceHistoryService.updateManualServiceRecord(editingId, {
          date: form.date,
          locationType: form.locationType,
          garageName: form.locationType === 'external' ? form.garageName.trim() : '',
          workDone: form.workDone.trim(),
          mechanicName: form.mechanicName.trim(),
          mileage: mileageNum != null && !isNaN(mileageNum) ? mileageNum : null,
          notes: form.notes.trim(),
        })
      } else {
        await vehicleServiceHistoryService.addManualServiceRecord({
          organizationId: orgId,
          registration,
          make: make || '',
          model: model || '',
          date: form.date,
          locationType: form.locationType,
          garageName: form.locationType === 'external' ? form.garageName.trim() : '',
          workDone: form.workDone.trim(),
          mechanicName: form.mechanicName.trim(),
          mileage: mileageNum != null && !isNaN(mileageNum) ? mileageNum : null,
          notes: form.notes.trim(),
          createdBy: user.uid,
          createdByName: user.displayName || user.email || 'Unknown User',
        })
      }
      setShowForm(false)
      setEditingId(null)
      await load()
    } catch {
      setError(t('fleet.serviceHistory.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('fleet.serviceHistory.deleteConfirm'))) return
    setBusyId(id)
    setError(null)
    try {
      await vehicleServiceHistoryService.deleteManualServiceRecord(id)
      await load()
    } catch {
      setError(t('fleet.serviceHistory.deleteError'))
    } finally {
      setBusyId(null)
    }
  }

  const lastDate = records.length > 0 ? records[0].date : ''

  return (
    <div className="p-4 sm:p-5">

      {/* Header row */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#012619] dark:text-white">
            {t('fleet.serviceHistory.tabHistory')}
          </p>
          {!loading && records.length > 0 && (
            <p className="text-[11px] text-[#8a9e94] mt-0.5">
              {t('fleet.serviceHistory.countLabel', { count: records.length })}
              {lastDate ? ` · ${t('fleet.serviceHistory.lastServiceLabel', { date: displayDate(lastDate) })}` : ''}
            </p>
          )}
        </div>
        {!showForm && (
          <Button
            onClick={openAdd}
            className="flex-shrink-0 bg-[#025940] hover:bg-[#012619] text-white font-bold py-2 px-3 text-xs border-0 shadow-none flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('fleet.serviceHistory.addRecord')}
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-3 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {/* Add / edit form */}
      {showForm && (
        <div className="mb-4 rounded-xl border-2 border-[#e2e8e5] dark:border-gray-700 bg-[#f8faf9] dark:bg-gray-800/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-[#012619] dark:text-white">
              {editingId ? t('fleet.serviceHistory.editRecord') : t('fleet.serviceHistory.addRecord')}
            </p>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null) }}
              className="p-1 rounded-lg text-[#8a9e94] hover:text-[#012619] hover:bg-[#e2e8e5]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('fleet.serviceHistory.fieldDate')}</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{t('fleet.serviceHistory.fieldWhere')}</label>
                <div className="flex gap-2">
                  {(['internal', 'external'] as ServiceLocationType[]).map(loc => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, locationType: loc }))}
                      className={`flex-1 py-2.5 px-2 rounded-xl text-xs font-bold border-2 transition-colors ${
                        form.locationType === loc
                          ? 'bg-[#012619] border-[#012619] text-white'
                          : 'bg-white dark:bg-gray-800 border-[#e2e8e5] dark:border-gray-600 text-[#4a5e54] dark:text-gray-300'
                      }`}
                    >
                      {loc === 'internal'
                        ? t('fleet.serviceHistory.fieldInternal')
                        : t('fleet.serviceHistory.fieldExternal')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {form.locationType === 'external' && (
              <div>
                <label className={labelCls}>{t('fleet.serviceHistory.fieldGarageName')}</label>
                <input
                  value={form.garageName}
                  onChange={e => setForm(f => ({ ...f, garageName: e.target.value }))}
                  placeholder={t('fleet.serviceHistory.placeholderGarage')}
                  className={inputCls}
                />
              </div>
            )}

            <div>
              <label className={labelCls}>{t('fleet.serviceHistory.fieldWorkDone')}</label>
              <input
                value={form.workDone}
                onChange={e => setForm(f => ({ ...f, workDone: e.target.value }))}
                placeholder={t('fleet.serviceHistory.placeholderWorkDone')}
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('fleet.serviceHistory.fieldMechanic')}</label>
                <input
                  value={form.mechanicName}
                  onChange={e => setForm(f => ({ ...f, mechanicName: e.target.value }))}
                  placeholder={t('fleet.serviceHistory.placeholderMechanic')}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{t('fleet.serviceHistory.fieldMileage')}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.mileage}
                  onChange={e => setForm(f => ({ ...f, mileage: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>{t('fleet.serviceHistory.fieldNotes')}</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder={t('fleet.serviceHistory.placeholderNotes')}
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                onClick={handleSave}
                disabled={!canSave}
                className="bg-[#025940] hover:bg-[#012619] text-white font-bold py-2.5 px-4 text-sm border-0 shadow-none flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? t('fleet.serviceHistory.saving') : t('fleet.serviceHistory.save')}
              </Button>
              <Button
                onClick={() => { setShowForm(false); setEditingId(null) }}
                disabled={saving}
                className="bg-[#f0f4f2] dark:bg-gray-700 text-[#4a5e54] dark:text-gray-300 hover:bg-[#e2e8e5] font-semibold py-2.5 px-4 text-sm border border-[#c8d5ce] dark:border-gray-600 shadow-none"
              >
                {t('fleet.serviceHistory.cancel')}
              </Button>
              <span className="text-[10px] text-[#8a9e94] ml-1">{t('fleet.serviceHistory.requiredHint')}</span>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-[#8a9e94]">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">{t('fleet.serviceHistory.loading')}</span>
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-10">
          <Wrench className="w-8 h-8 text-[#c8d5ce] mx-auto mb-2" />
          <p className="text-sm text-[#8a9e94]">{t('fleet.serviceHistory.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {records.map(r => {
            const isExternal = r.locationType === 'external'
            return (
              <div
                key={`${r.source}-${r.id}`}
                className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 p-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-extrabold text-[#012619] dark:text-white">
                        {displayDate(r.date)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${
                          isExternal
                            ? 'bg-[#fff4e5] text-[#92400e] border border-[#fcd34d]'
                            : 'bg-[#e6f4ec] text-[#0d6b2e] border border-[#86efac]'
                        }`}
                      >
                        {isExternal ? <Building2 className="w-2.5 h-2.5" /> : <Wrench className="w-2.5 h-2.5" />}
                        {isExternal
                          ? t('fleet.serviceHistory.external')
                          : t('fleet.serviceHistory.internal')}
                      </span>
                      {r.source === 'manual' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#eef2ff] text-[#3730a3] border border-[#c7d2fe]">
                          {t('fleet.serviceHistory.manualBadge')}
                        </span>
                      )}
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
                          {t('fleet.serviceHistory.mechanicLabel')}: <span className="font-semibold text-[#4a5e54] dark:text-gray-300">{r.mechanicName}</span>
                          {typeof r.serviceBay === 'number' ? ` · ${bayLabel(bayNamesFor(r.branchName), r.serviceBay, t('fleet.serviceHistory.bay', { bay: r.serviceBay }))}` : ''}
                        </span>
                      )}
                      {r.branchName && (
                        <span>
                          {t('fleet.serviceHistory.branchLabel')}: <span className="font-semibold text-[#4a5e54] dark:text-gray-300">{r.branchName}</span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Gauge className="w-3 h-3" />
                        {t('fleet.serviceHistory.mileageLabel')}:{' '}
                        {r.mileage != null ? (
                          <span className="font-semibold text-[#4a5e54] dark:text-gray-300">
                            {r.mileage.toLocaleString()} {t('fleet.serviceHistory.mileageUnit')}
                          </span>
                        ) : (
                          <span className="italic">{t('fleet.serviceHistory.mileageNotRecorded')}</span>
                        )}
                      </span>
                    </div>

                    {r.notes && (
                      <p className="text-xs text-[#4a5e54] dark:text-gray-400 mt-2 leading-relaxed">
                        <span className="font-semibold">{t('fleet.serviceHistory.notesLabel')}:</span> {r.notes}
                      </p>
                    )}

                    <p className="text-[10px] text-[#8a9e94] mt-2">
                      {r.source === 'manual'
                        ? r.createdByName && `${t('fleet.serviceHistory.addedByLabel')}: ${r.createdByName}`
                        : r.completedByName && `${t('fleet.serviceHistory.completedByLabel')}: ${r.completedByName}`}
                    </p>
                  </div>

                  {r.source === 'manual' && (
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        disabled={busyId === r.id}
                        className="p-1.5 rounded-lg text-[#4a5e54] hover:text-[#012619] hover:bg-[#f0f4f2] dark:hover:bg-gray-700"
                        aria-label={t('fleet.serviceHistory.editRecord')}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        disabled={busyId === r.id}
                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                        aria-label={t('fleet.serviceHistory.deleteBtn')}
                      >
                        {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
