// src/components/settings/InsurancePoliciesManagement.tsx
// Manage insurance policies — premium dense layout, matches the other org settings tabs

'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, Edit2, Check, X,
  Shield, AlertTriangle, Calendar, Hash,
} from 'lucide-react'
import { settingsService, InsurancePolicy } from '@/lib/services/settingsService'
import { userProfileService } from '@/lib/firestore'
import { useAuth } from '@/contexts/AuthContext'
import { useT } from '@/lib/i18n'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'

// ── Helpers ────────────────────────────────────────────────────────────────────

function getDaysUntilExpiry(expiryDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate)
  return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDisplayDate(isoDate: string): string {
  if (!isoDate) return '—'
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

type ExpiryState = 'expired' | 'expiring' | 'ok'

function getExpiryState(expiryDate: string): ExpiryState {
  const days = getDaysUntilExpiry(expiryDate)
  if (days < 0) return 'expired'
  if (days <= 30) return 'expiring'
  return 'ok'
}

const BLANK_FORM: Omit<InsurancePolicy, 'id' | 'createdAt'> = {
  name: '', provider: '', policyNumber: '', expiryDate: '', notes: '',
}

// ─── shared classes (same fonts/inputs across all org settings tabs) ─────────
const inputCls = 'w-full h-9 px-3 text-sm border border-[#e2e8e5] dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-[#012619] dark:text-white placeholder-[#c8d5ce] focus:outline-none focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940]'
const textareaCls = 'w-full px-3 py-2 text-sm border border-[#e2e8e5] dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-[#012619] dark:text-white placeholder-[#c8d5ce] focus:outline-none focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] resize-none'
const labelCls = 'block text-[11px] uppercase tracking-widest font-semibold text-[#8a9e94] mb-1.5'
const primaryBtnCls = 'h-9 px-4 text-[13px] font-medium rounded-lg bg-[#025940] hover:bg-[#012619] disabled:opacity-60 text-white inline-flex items-center gap-1.5 transition-colors'
const ghostBtnCls = 'h-9 px-3 text-[13px] font-medium rounded-lg text-[#012619] dark:text-gray-200 hover:bg-[#e2e8e5] dark:hover:bg-gray-700 transition-colors inline-flex items-center gap-1'
const iconBtnCls = 'w-7 h-7 rounded-md inline-flex items-center justify-center text-[#8a9e94] hover:bg-[#C5D9D0]/40 dark:hover:bg-gray-700 transition-colors'

export function InsurancePoliciesManagement() {
  const t = useT()
  const { user } = useAuth()

  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [policies, setPolicies] = useState<InsurancePolicy[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(BLANK_FORM)

  useEffect(() => {
    const load = async () => {
      if (!user?.uid) return
      try {
        const profile = await userProfileService.getProfile(user.uid)
        if (!profile?.organizationId) return
        setOrganizationId(profile.organizationId)
        const data = await settingsService.getInsurancePolicies(profile.organizationId)
        setPolicies(data)
      } catch (err) {
        logger.error('Failed to load insurance policies:', err)
        toast.error(t('settings.insurance.loadFail'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  const openAdd = useCallback(() => {
    setEditingId(null)
    setForm(BLANK_FORM)
    setShowForm(true)
  }, [])

  const openEdit = useCallback((policy: InsurancePolicy) => {
    setEditingId(policy.id)
    setForm({
      name: policy.name,
      provider: policy.provider,
      policyNumber: policy.policyNumber,
      expiryDate: policy.expiryDate,
      notes: policy.notes || '',
    })
    setShowForm(true)
  }, [])

  const cancelForm = useCallback(() => {
    setShowForm(false)
    setEditingId(null)
    setForm(BLANK_FORM)
  }, [])

  const handleSave = async () => {
    if (!organizationId) return
    if (!form.name.trim())         return toast.error(t('settings.insurance.nameRequired'))
    if (!form.provider.trim())     return toast.error(t('settings.insurance.providerRequired'))
    if (!form.policyNumber.trim()) return toast.error(t('settings.insurance.numberRequired'))
    if (!form.expiryDate)          return toast.error(t('settings.insurance.expiryRequired'))

    setSaving(true)
    try {
      const updated = editingId
        ? policies.map(p => (p.id === editingId ? { ...p, ...form } : p))
        : [...policies, { id: crypto.randomUUID(), ...form, createdAt: new Date().toISOString() }]
      await settingsService.saveInsurancePolicies(organizationId, updated)
      setPolicies(updated)
      cancelForm()
      toast.success(t(editingId ? 'settings.insurance.updated' : 'settings.insurance.added'))
    } catch (err) {
      logger.error('Error saving insurance policy:', err)
      toast.error(t('settings.insurance.saveFail'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (policyId: string, policyName: string) => {
    if (!organizationId) return
    if (!confirm(t('settings.insurance.confirmDelete',{ name: policyName }))) return

    try {
      const updated = policies.filter(p => p.id !== policyId)
      await settingsService.saveInsurancePolicies(organizationId, updated)
      setPolicies(updated)
      toast.success(t('settings.insurance.deleted'))
    } catch (err) {
      logger.error('Error deleting insurance policy:', err)
      toast.error(t('settings.insurance.deleteFail'))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#025940] border-t-transparent" />
      </div>
    )
  }

  // Sort policies: expired first, then expiring soon, then by expiry ascending
  const sortedPolicies = [...policies].sort((a, b) => {
    const da = getDaysUntilExpiry(a.expiryDate)
    const db = getDaysUntilExpiry(b.expiryDate)
    return da - db
  })

  const expiredCount = policies.filter(p => getExpiryState(p.expiryDate) === 'expired').length
  const expiringCount = policies.filter(p => getExpiryState(p.expiryDate) === 'expiring').length

  return (
    <div className="max-w-4xl px-4 sm:px-6 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-[#012619] dark:text-white tracking-tight">
            {t('settings.insurance.heading')}
          </h3>
          <p className="text-[12.5px] text-[#8a9e94] mt-0.5">
            {t(policies.length === 1 ? 'settings.insurance.subOne' : 'settings.insurance.subMany',{count:policies.length})}
            {expiredCount > 0 && (
              <span className="text-red-600 dark:text-red-400 font-medium">{t('settings.insurance.expiredSuffix',{count:expiredCount})}</span>
            )}
            {expiringCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400 font-medium">{t('settings.insurance.expiringSuffix',{count:expiringCount})}</span>
            )}
            {expiredCount === 0 && expiringCount === 0 && policies.length > 0 && (
              <span>{t('settings.insurance.allCurrent')}</span>
            )}
          </p>
        </div>
        {!showForm && (
          <button onClick={openAdd} className={`${primaryBtnCls} flex-shrink-0`}>
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            {t('settings.insurance.addPolicy')}
          </button>
        )}
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('settings.insurance.policyName')}</label>
              <input
                className={inputCls}
                placeholder="Fleet Policy A"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <label className={labelCls}>{t('settings.insurance.provider')}</label>
              <input
                className={inputCls}
                placeholder="Aviva, Admiral, LV="
                value={form.provider}
                onChange={(e) => setForm(f => ({ ...f, provider: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelCls}>{t('settings.insurance.policyNumber')}</label>
              <input
                className={inputCls}
                placeholder="AV-2024-001234"
                value={form.policyNumber}
                onChange={(e) => setForm(f => ({ ...f, policyNumber: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelCls}>{t('settings.insurance.expiryDate')}</label>
              <input
                type="date"
                className={inputCls}
                value={form.expiryDate}
                onChange={(e) => setForm(f => ({ ...f, expiryDate: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>{t('settings.insurance.notesOptional')}</label>
            <textarea
              className={textareaCls}
              rows={2}
              placeholder={t('settings.insurance.notesPlaceholder')}
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-1.5 pt-1">
            <button onClick={handleSave} disabled={saving} className={primaryBtnCls}>
              {saving ? (
                <div className="w-3.5 h-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Check className="w-4 h-4" strokeWidth={2.5} />
              )}
              {editingId ? t('settings.common.saveChanges') : t('settings.insurance.addPolicy')}
            </button>
            <button onClick={cancelForm} className={ghostBtnCls}>
              <X className="w-3.5 h-3.5" />
              {t('settings.common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        {policies.length === 0 ? (
          <div className="text-center py-12 px-6">
            <Shield className="w-8 h-8 text-[#c8d5ce] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#012619] dark:text-white">{t('settings.insurance.emptyTitle')}</p>
            <p className="text-[12.5px] text-[#8a9e94] mt-1">{t('settings.insurance.emptyBody')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#e2e8e5] dark:divide-gray-700">
            {sortedPolicies.map(policy => {
              const state = getExpiryState(policy.expiryDate)
              const days = getDaysUntilExpiry(policy.expiryDate)
              const Icon = state === 'expired' ? AlertTriangle : Shield

              const iconCls =
                state === 'expired'  ? 'text-red-500' :
                state === 'expiring' ? 'text-amber-600' :
                                       'text-[#025940] dark:text-[#72A68E]'

              const badgeCls =
                state === 'expired'  ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' :
                state === 'expiring' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' :
                                       'bg-[#C5D9D0]/40 text-[#025940] dark:bg-[#025940]/30 dark:text-[#72A68E]'

              const badgeLabel =
                state === 'expired'  ? t('settings.insurance.daysAgo',{count:Math.abs(days)}) :
                state === 'expiring' ? t('settings.insurance.daysLeft',{count:days}) :
                                       t('settings.insurance.daysLeft',{count:days})

              return (
                <li key={policy.id} className="group">
                  <div className="flex items-start gap-3 px-3 sm:px-4 py-3 hover:bg-[#f5f9f7] dark:hover:bg-gray-800/40 transition-colors">
                    <Icon className={`w-4 h-4 ${iconCls} flex-shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13.5px] font-medium text-[#012619] dark:text-white truncate">
                          {policy.name}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${badgeCls}`}>
                          <Calendar className="w-2.5 h-2.5" />
                          {state === 'expired' ? t('settings.insurance.expired') : badgeLabel}
                        </span>
                      </div>
                      <div className="text-[12px] text-[#5a6c64] dark:text-gray-400 truncate">
                        {policy.provider} · <Hash className="w-3 h-3 inline align-text-bottom" />{policy.policyNumber}{t('settings.insurance.expiresLabel')}{formatDisplayDate(policy.expiryDate)}
                      </div>
                      {policy.notes && (
                        <p className="text-[11px] text-[#8a9e94] italic truncate">
                          {policy.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button onClick={() => openEdit(policy)} aria-label={t('settings.insurance.editPolicy')} className={`${iconBtnCls} hover:text-[#025940]`}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(policy.id, policy.name)} aria-label={t('settings.insurance.deletePolicy')} className={`${iconBtnCls} hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
