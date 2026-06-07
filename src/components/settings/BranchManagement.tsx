// src/components/settings/BranchManagement.tsx
// UPDATED - Full edit support for name AND address with geocoding
// ✅ NEW: Yard layout editor button per branch (opens YardLayoutModal)

import React, { useState } from 'react'
import { useBranches } from '@/hooks/useBranches'
import { Plus, Edit2, Trash2, MapPin, AlertCircle, Check, X, Loader2, Map } from 'lucide-react'
import { geocodingService } from '@/lib/services/geocodingService'
import { YardLayoutModal } from '@/components/yard/layout/YardLayoutModal'
import { DEFAULT_SERVICE_BAY_COUNT } from '@/types/branch'
import { useT } from '@/lib/i18n'

interface EditFormData {
  name: string
  address: string
  serviceBayCount: number
}

export function BranchManagement() {
  const t = useT()
  const { branches, loading, error, createBranch, updateBranch, deleteBranch } = useBranches()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingBranch, setEditingBranch] = useState<string | null>(null)
  const [editFormData, setEditFormData] = useState<EditFormData>({
    name: '',
    address: '',
    serviceBayCount: DEFAULT_SERVICE_BAY_COUNT,
  })
  const [createFormData, setCreateFormData] = useState({
    name: '',
    slug: '',
    address: '',
    serviceBayCount: DEFAULT_SERVICE_BAY_COUNT,
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGeocoding, setIsGeocoding] = useState(false)
  // ✅ NEW: which branch's yard layout we're currently editing (null = none)
  const [layoutBranch, setLayoutBranch] = useState<{ id: string; name: string } | null>(null)

  const handleCreateBranch = async () => {
    setFormError(null)
    setIsSubmitting(true)
    setIsGeocoding(true)

    try {
      // Validate form
      if (!createFormData.name.trim()) {
        throw new Error(t('settings.branch.nameRequired'))
      }
      if (!createFormData.slug.trim()) {
        throw new Error(t('settings.branch.slugRequired'))
      }

      // Auto-format slug
      const formattedSlug = createFormData.slug
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')

      // Geocode address if provided
      let locationData = {}
      if (createFormData.address.trim()) {
        try {
          const geocodeResult = await geocodingService.geocodeAddress(createFormData.address)
          locationData = {
            address: geocodeResult.formattedAddress,
            latitude: geocodeResult.latitude,
            longitude: geocodeResult.longitude
          }
          // Only add postcode if it exists (undefined not allowed in Firestore)
          if (geocodeResult.postcode) {
            (locationData as any).postcode = geocodeResult.postcode
          }
        } catch (geocodeError) {
          const shouldProceed = window.confirm(
            t('settings.branch.geocodeFailCreate', { msg: geocodeError instanceof Error ? geocodeError.message : 'Unknown error' })
          )
          if (!shouldProceed) {
            throw new Error(t('settings.branch.createCancelled'))
          }
          // Geocoding failed but the user chose to proceed — still save the
          // address TEXT (without coordinates) so it isn't lost. Mirrors the
          // edit flow. Fixes "no address configured" after creating a branch
          // when geocoding was unavailable.
          locationData = { address: createFormData.address.trim() }
        }
      }

      setIsGeocoding(false)
      // Validate bay count: must be >= 1.
      const bayCount =
        Number.isFinite(createFormData.serviceBayCount) && createFormData.serviceBayCount >= 1
          ? Math.floor(createFormData.serviceBayCount)
          : DEFAULT_SERVICE_BAY_COUNT
      await createBranch(createFormData.name.trim(), formattedSlug, locationData, bayCount)

      // Reset form
      setCreateFormData({ name: '', slug: '', address: '', serviceBayCount: DEFAULT_SERVICE_BAY_COUNT })
      setShowCreateForm(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('settings.branch.createFail'))
    } finally {
      setIsSubmitting(false)
      setIsGeocoding(false)
    }
  }

  const handleStartEdit = (branchId: string) => {
    const branch = branches.find(b => b.id === branchId)
    if (branch) {
      setEditFormData({
        name: branch.name,
        address: branch.address || '',
        serviceBayCount: branch.serviceBayCount ?? DEFAULT_SERVICE_BAY_COUNT,
      })
      setEditingBranch(branchId)
      setFormError(null)
    }
  }

  const handleSaveEdit = async (branchId: string) => {
    setFormError(null)
    setIsSubmitting(true)
    setIsGeocoding(true)

    try {
      if (!editFormData.name.trim()) {
        throw new Error(t('settings.branch.nameEmpty'))
      }

      const updates: any = { name: editFormData.name.trim() }

      // Check if address changed
      const currentBranch = branches.find(b => b.id === branchId)
      const addressChanged = editFormData.address.trim() !== (currentBranch?.address || '')

      // 🛠️ Bay count: validate, normalise, only persist if changed.
      const requestedBayCount =
        Number.isFinite(editFormData.serviceBayCount) && editFormData.serviceBayCount >= 1
          ? Math.floor(editFormData.serviceBayCount)
          : DEFAULT_SERVICE_BAY_COUNT
      const currentBayCount = currentBranch?.serviceBayCount ?? DEFAULT_SERVICE_BAY_COUNT
      if (requestedBayCount !== currentBayCount) {
        updates.serviceBayCount = requestedBayCount
      }

      if (addressChanged && editFormData.address.trim()) {
        // Geocode new address
        try {
          const geocodeResult = await geocodingService.geocodeAddress(editFormData.address)
          updates.address = geocodeResult.formattedAddress
          // Only add postcode if it exists (undefined not allowed in Firestore)
          if (geocodeResult.postcode) {
            updates.postcode = geocodeResult.postcode
          }
          updates.latitude = geocodeResult.latitude
          updates.longitude = geocodeResult.longitude
        } catch (geocodeError) {
          const shouldProceed = window.confirm(
            t('settings.branch.geocodeFailUpdate', { msg: geocodeError instanceof Error ? geocodeError.message : 'Unknown error' })
          )
          if (!shouldProceed) {
            throw new Error(t('settings.branch.updateCancelled'))
          }
          // Just update the address text without geocoding
          updates.address = editFormData.address.trim()
        }
      } else if (addressChanged && !editFormData.address.trim()) {
        // Address was cleared - remove location data
        updates.address = null
        updates.postcode = null
        updates.latitude = null
        updates.longitude = null
      }

      setIsGeocoding(false)
      await updateBranch(branchId, updates)
      setEditingBranch(null)
      setFormError(null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('settings.branch.updateFail'))
    } finally {
      setIsSubmitting(false)
      setIsGeocoding(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingBranch(null)
    setEditFormData({ name: '', address: '', serviceBayCount: DEFAULT_SERVICE_BAY_COUNT })
    setFormError(null)
  }

  const handleDeleteBranch = async (branchId: string, branchName: string) => {
    if (!window.confirm(t('settings.branch.confirmDelete', { name: branchName }))) {
      return
    }

    try {
      await deleteBranch(branchId)
    } catch (err) {
      alert(err instanceof Error ? err.message : t('settings.branch.deleteFail'))
    }
  }

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#025940] border-t-transparent" />
      </div>
    )
  }

  // ─── shared classes (same fonts/inputs across all org settings tabs) ───────
  const inputCls = 'w-full h-9 px-3 text-sm border border-[#e2e8e5] dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-[#012619] dark:text-white placeholder-[#c8d5ce] focus:outline-none focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] disabled:opacity-60'
  const labelCls = 'block text-[11px] uppercase tracking-widest font-semibold text-[#8a9e94] mb-1.5'

  return (
    <div className="max-w-4xl px-4 sm:px-6 py-6 space-y-5">
      {/* Section heading */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-[#012619] dark:text-white tracking-tight">
            {t('settings.branch.heading')}
          </h3>
          <p className="text-[12.5px] text-[#8a9e94] mt-0.5">
            {t(branches.length === 1 ? 'settings.branch.subtitleOne' : 'settings.branch.subtitleMany', { count: branches.length })}
          </p>
        </div>
        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="h-9 px-4 text-[13px] font-medium rounded-lg bg-[#025940] hover:bg-[#012619] text-white inline-flex items-center gap-1.5 flex-shrink-0 transition-colors"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            {t('settings.branch.addBranch')}
          </button>
        )}
      </div>

      {/* Error */}
      {(error || formError) && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-900/10 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-[12.5px] text-red-700 dark:text-red-300 leading-relaxed">
            {error || formError}
          </p>
        </div>
      )}

      {/* Create form (inline, collapsible) */}
      {showCreateForm && (
        <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('settings.branch.name')}</label>
              <input
                type="text"
                value={createFormData.name}
                onChange={(e) => setCreateFormData({
                  ...createFormData,
                  name: e.target.value,
                  slug: generateSlug(e.target.value),
                })}
                placeholder={t('settings.branch.namePlaceholder')}
                className={inputCls}
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className={labelCls}>{t('settings.branch.urlSlug')}</label>
              <input
                type="text"
                value={createFormData.slug}
                onChange={(e) => setCreateFormData({ ...createFormData, slug: e.target.value })}
                placeholder={t('settings.branch.slugPlaceholder')}
                className={inputCls}
                disabled={isSubmitting}
              />
              <p className="text-[11px] text-[#8a9e94] mt-1">
                /dashboard/{createFormData.slug || t('settings.branch.slugFallback')}
              </p>
            </div>
          </div>

          <div>
            <label className={labelCls}>{t('settings.branch.addressOptional')}</label>
            <input
              type="text"
              value={createFormData.address}
              onChange={(e) => setCreateFormData({ ...createFormData, address: e.target.value })}
              placeholder={t('settings.branch.addressPlaceholder')}
              className={inputCls}
              disabled={isSubmitting}
            />
            <p className="text-[11px] text-[#8a9e94] mt-1">
              {isGeocoding ? (
                <span className="inline-flex items-center gap-1 text-[#025940]">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {t('settings.branch.resolvingLocation')}
                </span>
              ) : (
                t('settings.branch.enablesMap')
              )}
            </p>
          </div>

          <div>
            <label className={labelCls}>{t('settings.branch.serviceBays')}</label>
            <input
              type="number"
              min={1}
              max={50}
              value={createFormData.serviceBayCount}
              onChange={(e) => setCreateFormData({
                ...createFormData,
                serviceBayCount: parseInt(e.target.value, 10) || 1,
              })}
              className={`${inputCls} sm:w-32`}
              disabled={isSubmitting}
            />
            <p className="text-[11px] text-[#8a9e94] mt-1">
              {t('settings.branch.capsBookings')}
            </p>
          </div>

          <div className="flex items-center gap-1.5 pt-1">
            <button
              onClick={handleCreateBranch}
              disabled={isSubmitting}
              className="h-9 px-4 text-[13px] font-medium rounded-lg bg-[#025940] hover:bg-[#012619] disabled:opacity-60 text-white inline-flex items-center gap-1.5 transition-colors"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {isGeocoding ? t('settings.branch.locating') : t('settings.branch.creating')}
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" strokeWidth={2.5} />
                  {t('settings.branch.createBranch')}
                </>
              )}
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false)
                setCreateFormData({ name: '', slug: '', address: '', serviceBayCount: DEFAULT_SERVICE_BAY_COUNT })
                setFormError(null)
              }}
              disabled={isSubmitting}
              className="h-9 px-3 text-[13px] font-medium rounded-lg text-[#012619] dark:text-gray-200 hover:bg-[#e2e8e5] dark:hover:bg-gray-700 transition-colors"
            >
              {t('settings.common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Branches list */}
      <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        {branches.length === 0 ? (
          <div className="text-center py-12 px-6">
            <MapPin className="w-8 h-8 text-[#c8d5ce] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#012619] dark:text-white">{t('settings.branch.emptyTitle')}</p>
            <p className="text-[12.5px] text-[#8a9e94] mt-1">{t('settings.branch.emptyBody')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#e2e8e5] dark:divide-gray-700">
            {branches.map(branch => (
              <li key={branch.id} className="group">
                {editingBranch === branch.id ? (
                  /* Inline edit */
                  <div className="p-4 bg-[#f5f9f7] dark:bg-gray-800/40 space-y-3.5">
                    <div>
                      <label className={labelCls}>{t('settings.branch.name')}</label>
                      <input
                        type="text"
                        value={editFormData.name}
                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                        className={inputCls}
                        disabled={isSubmitting}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className={labelCls}>{t('settings.branch.address')}</label>
                      <input
                        type="text"
                        value={editFormData.address}
                        onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                        placeholder={t('settings.branch.addressPlaceholder')}
                        className={inputCls}
                        disabled={isSubmitting}
                      />
                      {isGeocoding && (
                        <p className="text-[11px] text-[#025940] mt-1 inline-flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          {t('settings.branch.resolvingLocation')}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className={labelCls}>{t('settings.branch.serviceBays')}</label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={editFormData.serviceBayCount}
                        onChange={(e) => setEditFormData({
                          ...editFormData,
                          serviceBayCount: parseInt(e.target.value, 10) || 1,
                        })}
                        className={`${inputCls} sm:w-32`}
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleSaveEdit(branch.id)}
                        disabled={isSubmitting}
                        className="h-9 px-3 text-[13px] font-medium rounded-lg bg-[#025940] hover:bg-[#012619] disabled:opacity-60 text-white inline-flex items-center gap-1.5 transition-colors"
                      >
                        {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-4 h-4" strokeWidth={2.5} />}
                        {t('settings.common.save')}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={isSubmitting}
                        className="h-9 px-3 text-[13px] font-medium rounded-lg text-[#012619] dark:text-gray-200 hover:bg-[#e2e8e5] dark:hover:bg-gray-700 transition-colors inline-flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        {t('settings.common.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* View mode — dense row */
                  <div className="flex items-start gap-3 px-3 sm:px-4 py-3 hover:bg-[#f5f9f7] dark:hover:bg-gray-800/40 transition-colors">
                    <MapPin className="w-4 h-4 text-[#8a9e94] flex-shrink-0 mt-0.5" />

                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13.5px] font-medium text-[#012619] dark:text-white truncate">
                          {branch.name}
                        </span>
                        {branch.isMain && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[#C5D9D0]/40 text-[#025940] dark:bg-[#025940]/30 dark:text-[#72A68E]">
                            {t('settings.branch.mainBadge')}
                          </span>
                        )}
                        <span className="text-[11px] text-[#8a9e94] font-mono">
                          /{branch.isMain ? 'dashboard' : `dashboard/${branch.slug}`}
                        </span>
                      </div>
                      <p className={`text-[12px] ${branch.address ? 'text-[#5a6c64] dark:text-gray-400' : 'text-[#c8d5ce] italic'} truncate`}>
                        {branch.address || t('settings.branch.noAddress')}
                        {branch.serviceBayCount ? (
                          <span className="text-[#8a9e94]">{t(branch.serviceBayCount === 1 ? 'settings.branch.bayOne' : 'settings.branch.bayMany', { count: branch.serviceBayCount })}</span>
                        ) : null}
                      </p>
                    </div>

                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => handleStartEdit(branch.id)}
                        aria-label={t('settings.branch.editBranch')}
                        className="w-7 h-7 rounded-md inline-flex items-center justify-center text-[#8a9e94] hover:text-[#025940] hover:bg-[#C5D9D0]/40 dark:hover:bg-gray-700 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setLayoutBranch({ id: branch.id, name: branch.name })}
                        aria-label={t('settings.branch.editYardLayout')}
                        title={t('settings.branch.editYardLayout')}
                        className="w-7 h-7 rounded-md inline-flex items-center justify-center text-[#8a9e94] hover:text-[#025940] hover:bg-[#C5D9D0]/40 dark:hover:bg-gray-700 transition-colors"
                      >
                        <Map className="w-3.5 h-3.5" />
                      </button>
                      {!branch.isMain && (
                        <button
                          onClick={() => handleDeleteBranch(branch.id, branch.name)}
                          aria-label={t('settings.branch.deleteBranch')}
                          className="w-7 h-7 rounded-md inline-flex items-center justify-center text-[#8a9e94] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Yard Layout Modal */}
      {layoutBranch && (
        <YardLayoutModal
          open={!!layoutBranch}
          branchId={layoutBranch.id}
          branchName={layoutBranch.name}
          onClose={() => setLayoutBranch(null)}
        />
      )}
    </div>
  )
}