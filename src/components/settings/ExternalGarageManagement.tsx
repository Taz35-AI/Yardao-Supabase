// src/components/settings/ExternalGarageManagement.tsx
// External service providers (garages) — premium dense layout

'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useExternalGarages } from '@/hooks/useExternalGarages'
import { userProfileService } from '@/lib/firestore'
import { useT } from '@/lib/i18n'
import {
  Plus, Edit2, Trash2, MapPin, Wrench,
  Eye, EyeOff, Check, X, AlertCircle, RefreshCw, Loader2,
} from 'lucide-react'
import type { ExternalGarage, ExternalGarageFormData } from '@/types'
import { logger } from '@/lib/logger'

interface ExternalGarageManagementProps {
  className?: string
}

interface EditingGarage {
  id: string
  data: ExternalGarageFormData
}

// ─── shared classes (same fonts/inputs across all org settings tabs) ─────────
const inputCls = 'w-full h-9 px-3 text-sm border border-[#e2e8e5] dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-[#012619] dark:text-white placeholder-[#c8d5ce] focus:outline-none focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940]'
const inputErrCls = 'w-full h-9 px-3 text-sm border border-red-400 rounded-lg bg-white dark:bg-gray-900 text-[#012619] dark:text-white placeholder-[#c8d5ce] focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400'
const labelCls = 'block text-[11px] uppercase tracking-widest font-semibold text-[#8a9e94] mb-1.5'
const primaryBtnCls = 'h-9 px-4 text-[13px] font-medium rounded-lg bg-[#025940] hover:bg-[#012619] disabled:opacity-60 text-white inline-flex items-center gap-1.5 transition-colors'
const ghostBtnCls = 'h-9 px-3 text-[13px] font-medium rounded-lg text-[#012619] dark:text-gray-200 hover:bg-[#e2e8e5] dark:hover:bg-gray-700 transition-colors inline-flex items-center gap-1'
const iconBtnCls = 'w-7 h-7 rounded-md inline-flex items-center justify-center text-[#8a9e94] hover:bg-[#C5D9D0]/40 dark:hover:bg-gray-700 transition-colors'

export function ExternalGarageManagement({ className = '' }: ExternalGarageManagementProps) {
  const t = useT()
  const { user } = useAuth()

  const [userProfile, setUserProfile] = useState<any>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [fixingOrganization, setFixingOrganization] = useState(false)

  useEffect(() => {
    const loadUserProfile = async () => {
      if (!user?.uid) { setProfileLoading(false); return }
      try {
        const profile = await userProfileService.getProfile(user.uid)
        setUserProfile(profile)
      } catch (error) {
        logger.error('Error loading user profile:', error)
      } finally {
        setProfileLoading(false)
      }
    }
    loadUserProfile()
  }, [user])

  const {
    garages, activeGarages, loading, error,
    createGarage, updateGarage, deleteGarage, toggleGarageStatus,
    refreshGarages, clearError, isGarageNameExists,
  } = useExternalGarages({ includeInactive: true })

  const [showAddForm, setShowAddForm] = useState(false)
  const [newGarageForm, setNewGarageForm] = useState<ExternalGarageFormData>({ name: '', address: '' })
  const [editingGarage, setEditingGarage] = useState<EditingGarage | null>(null)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [deletingGarage, setDeletingGarage] = useState<ExternalGarage | null>(null)

  const fixUserOrganization = async () => {
    if (!user?.uid) return
    setFixingOrganization(true)
    try {
      await userProfileService.updateProfile(user.uid, {
        organizationId: 'default',
        organizationName: 'Default Organization',
      })
      setTimeout(() => window.location.reload(), 1200)
    } catch (error) {
      logger.error('Error fixing user organization:', error)
      setFormErrors({ general: t('settings.extGarage.profileFixFail') })
    } finally {
      setFixingOrganization(false)
    }
  }

  const isMissingOrgId = user && user.uid && user.email && (!userProfile || !userProfile.organizationId)
  const isAuthenticated = user && user.uid && userProfile && userProfile.organizationId

  const validateForm = async (data: ExternalGarageFormData, excludeId?: string): Promise<boolean> => {
    const errors: Record<string, string> = {}
    if (!data.name.trim())                errors.name = t('settings.extGarage.nameRequired')
    else if (data.name.trim().length < 2) errors.name = t('settings.extGarage.nameMin')
    else if (data.name.trim().length > 100) errors.name = t('settings.extGarage.nameMax')
    else if (await isGarageNameExists(data.name.trim(), excludeId)) errors.name = t('settings.extGarage.nameExists')

    if (!data.address.trim())                errors.address = t('settings.extGarage.addressRequired')
    else if (data.address.trim().length < 5) errors.address = t('settings.extGarage.addressMin')
    else if (data.address.trim().length > 200) errors.address = t('settings.extGarage.addressMax')

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleInputChange = (field: keyof ExternalGarageFormData, value: string) => {
    if (editingGarage) {
      setEditingGarage(prev => ({ ...prev!, data: { ...prev!.data, [field]: value } }))
    } else {
      setNewGarageForm(prev => ({ ...prev, [field]: value }))
    }
    if (formErrors[field]) setFormErrors(prev => ({ ...prev, [field]: '' }))
  }

  const handleAddGarage = async () => {
    clearError()
    if (!(await validateForm(newGarageForm))) return
    setSaving(true)
    try {
      const created = await createGarage(newGarageForm)
      if (created) {
        setNewGarageForm({ name: '', address: '' })
        setShowAddForm(false)
      }
    } catch (err) {
      logger.error('Error adding garage:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleStartEdit = (garage: ExternalGarage) => {
    setEditingGarage({ id: garage.id, data: { name: garage.name, address: garage.address } })
    clearError()
  }

  const handleSaveEdit = async () => {
    if (!editingGarage) return
    clearError()
    if (!(await validateForm(editingGarage.data, editingGarage.id))) return
    setSaving(true)
    try {
      const updated = await updateGarage(editingGarage.id, editingGarage.data)
      if (updated) setEditingGarage(null)
    } catch (err) {
      logger.error('Error updating garage:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingGarage(null)
    setFormErrors({})
    clearError()
  }

  const handleToggleStatus = async (garage: ExternalGarage) => {
    clearError()
    await toggleGarageStatus(garage.id)
  }

  const handlePermanentDelete = async (garage: ExternalGarage) => {
    clearError()
    const ok = await deleteGarage(garage.id)
    if (ok) setDeletingGarage(null)
  }

  const handleCancelAdd = () => {
    setShowAddForm(false)
    setNewGarageForm({ name: '', address: '' })
    setFormErrors({})
    clearError()
  }

  // ── auth / org setup fallback ──────────────────────────────────────────────
  if (!isAuthenticated && !loading && !profileLoading) {
    return (
      <div className={`max-w-4xl px-4 sm:px-6 py-6 ${className}`}>
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-900/10 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-900 dark:text-amber-300">
                {isMissingOrgId ? t('settings.extGarage.orgSetupRequired') : t('settings.extGarage.authIssue')}
              </p>
              <p className="text-[12.5px] text-amber-700 dark:text-amber-400 mt-0.5">
                {isMissingOrgId
                  ? t('settings.extGarage.orgSetupBody')
                  : t('settings.extGarage.authIssueBody')}
              </p>
            </div>
          </div>
          {isMissingOrgId ? (
            <button
              onClick={fixUserOrganization}
              disabled={fixingOrganization}
              className={`${primaryBtnCls} ml-6`}
            >
              {fixingOrganization ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" />{t('settings.extGarage.settingUp')}</>
              ) : (
                t('settings.extGarage.setupOrg')
              )}
            </button>
          ) : (
            <button onClick={() => window.location.reload()} className={`${ghostBtnCls} ml-6`}>
              {t('settings.extGarage.refreshPage')}
            </button>
          )}
        </div>
      </div>
    )
  }

  if (profileLoading || loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#025940] border-t-transparent" />
      </div>
    )
  }

  const displayedGarages = showInactive ? garages : activeGarages
  const inactiveCount = garages.length - activeGarages.length

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className={`max-w-4xl px-4 sm:px-6 py-6 space-y-5 ${className}`}>

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-[#012619] dark:text-white tracking-tight">
            {t('settings.extGarage.heading')}
          </h3>
          <p className="text-[12.5px] text-[#8a9e94] mt-0.5">
            {activeGarages.length} {t('settings.extGarage.active')}
            {inactiveCount > 0 && (
              <span className="text-[#8a9e94]">{t('settings.extGarage.inactiveSuffix',{count:inactiveCount})}</span>
            )}
            {t('settings.extGarage.dropdownHint')}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={refreshGarages}
            disabled={loading}
            title={t('settings.common.refresh')}
            aria-label={t('settings.common.refresh')}
            className={iconBtnCls}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              disabled={editingGarage !== null}
              className={primaryBtnCls}
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              {t('settings.extGarage.addGarage')}
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-900/10 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-[12.5px] text-red-700 dark:text-red-300 leading-relaxed">{error}</p>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3.5">
          <div>
            <label className={labelCls}>{t('settings.extGarage.garageName')}</label>
            <input
              value={newGarageForm.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder={t('settings.extGarage.namePlaceholder')}
              className={formErrors.name ? inputErrCls : inputCls}
              disabled={saving}
              autoFocus
            />
            {formErrors.name && <p className="text-[11px] text-red-600 mt-1">{formErrors.name}</p>}
          </div>
          <div>
            <label className={labelCls}>{t('settings.extGarage.address')}</label>
            <input
              value={newGarageForm.address}
              onChange={(e) => handleInputChange('address', e.target.value)}
              placeholder={t('settings.extGarage.addressPlaceholder')}
              className={formErrors.address ? inputErrCls : inputCls}
              disabled={saving}
            />
            {formErrors.address && <p className="text-[11px] text-red-600 mt-1">{formErrors.address}</p>}
          </div>
          <div className="flex items-center gap-1.5 pt-1">
            <button
              onClick={handleAddGarage}
              disabled={saving || !newGarageForm.name.trim() || !newGarageForm.address.trim()}
              className={primaryBtnCls}
            >
              {saving ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" />{t('settings.common.adding')}</>
              ) : (
                <><Check className="w-4 h-4" strokeWidth={2.5} />{t('settings.extGarage.addGarage')}</>
              )}
            </button>
            <button onClick={handleCancelAdd} disabled={saving} className={ghostBtnCls}>
              <X className="w-3.5 h-3.5" />
              {t('settings.common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Filter toggle */}
      {garages.length > 0 && inactiveCount > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInactive(!showInactive)}
            className="h-7 px-2.5 text-[12px] font-medium rounded-md text-[#5a6c64] dark:text-gray-300 hover:bg-[#e2e8e5] dark:hover:bg-gray-700 inline-flex items-center gap-1.5 transition-colors"
          >
            {showInactive ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showInactive ? t('settings.extGarage.hideInactive') : t('settings.extGarage.showInactive',{count:inactiveCount})}
          </button>
        </div>
      )}

      {/* Garages list */}
      <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        {displayedGarages.length === 0 ? (
          <div className="text-center py-12 px-6">
            <Wrench className="w-8 h-8 text-[#c8d5ce] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#012619] dark:text-white">
              {garages.length === 0 ? t('settings.extGarage.emptyTitle') : t('settings.extGarage.emptyTitleActive')}
            </p>
            <p className="text-[12.5px] text-[#8a9e94] mt-1">
              {garages.length === 0
                ? t('settings.extGarage.emptyBody')
                : t('settings.extGarage.emptyBodyInactive')}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#e2e8e5] dark:divide-gray-700">
            {displayedGarages.map((garage) => (
              <li key={garage.id} className="group">
                {editingGarage?.id === garage.id ? (
                  /* Inline edit */
                  <div className="p-4 bg-[#f5f9f7] dark:bg-gray-800/40 space-y-3">
                    <div>
                      <label className={labelCls}>{t('settings.extGarage.garageName')}</label>
                      <input
                        value={editingGarage.data.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        className={formErrors.name ? inputErrCls : inputCls}
                        disabled={saving}
                        autoFocus
                      />
                      {formErrors.name && <p className="text-[11px] text-red-600 mt-1">{formErrors.name}</p>}
                    </div>
                    <div>
                      <label className={labelCls}>{t('settings.extGarage.address')}</label>
                      <input
                        value={editingGarage.data.address}
                        onChange={(e) => handleInputChange('address', e.target.value)}
                        className={formErrors.address ? inputErrCls : inputCls}
                        disabled={saving}
                      />
                      {formErrors.address && <p className="text-[11px] text-red-600 mt-1">{formErrors.address}</p>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleSaveEdit}
                        disabled={saving || !editingGarage.data.name.trim() || !editingGarage.data.address.trim()}
                        className={primaryBtnCls}
                      >
                        {saving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" strokeWidth={2.5} />
                        )}
                        {t('settings.common.save')}
                      </button>
                      <button onClick={handleCancelEdit} disabled={saving} className={ghostBtnCls}>
                        <X className="w-3.5 h-3.5" />
                        {t('settings.common.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* View mode — dense row */
                  <div className={`flex items-start gap-3 px-3 sm:px-4 py-3 hover:bg-[#f5f9f7] dark:hover:bg-gray-800/40 transition-colors ${!garage.isActive ? 'opacity-60' : ''}`}>
                    <Wrench className="w-4 h-4 text-[#8a9e94] flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13.5px] font-medium text-[#012619] dark:text-white truncate">
                          {garage.name}
                        </span>
                        {!garage.isActive && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[#e2e8e5] text-[#8a9e94] dark:bg-gray-700 dark:text-gray-400">
                            {t('settings.extGarage.inactiveBadge')}
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-[#5a6c64] dark:text-gray-400 truncate inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{garage.address}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => handleStartEdit(garage)}
                        disabled={showAddForm}
                        aria-label={t('settings.common.edit')}
                        className={`${iconBtnCls} hover:text-[#025940] disabled:opacity-40`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleStatus(garage)}
                        aria-label={garage.isActive ? t('settings.extGarage.deactivate') : t('settings.extGarage.activate')}
                        title={garage.isActive ? t('settings.extGarage.deactivate') : t('settings.extGarage.activate')}
                        className={`${iconBtnCls} hover:text-[#025940]`}
                      >
                        {garage.isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => setDeletingGarage(garage)}
                        aria-label={t('settings.common.delete')}
                        className={`${iconBtnCls} hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deletingGarage && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-[#e2e8e5] dark:border-gray-700 p-5 max-w-sm w-full shadow-xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-4 h-4 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-semibold text-[#012619] dark:text-white">{t('settings.extGarage.deleteTitle')}</h3>
                <p className="text-[12.5px] text-[#5a6c64] dark:text-gray-400 mt-1">
                  {t('settings.extGarage.deleteBodyPre')}<span className="font-medium text-[#012619] dark:text-white">{deletingGarage.name}</span>{t('settings.extGarage.deleteBodyPost')}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <button onClick={() => setDeletingGarage(null)} className={ghostBtnCls}>
                {t('settings.common.cancel')}
              </button>
              <button
                onClick={() => handlePermanentDelete(deletingGarage)}
                className="h-9 px-4 text-[13px] font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white inline-flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('settings.common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
