// src/components/settings/CompanyManagement.tsx
// FROM & TO companies for invoices — premium dense layout

'use client'

import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Building2, Users, Check, X, Mail, Image as ImageIcon } from 'lucide-react'
import { settingsService, FromCompanyDetails, ToCompanyDetails } from '@/lib/services/settingsService'
import { userProfileService } from '@/lib/firestore'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

// ─── shared classes (same fonts/inputs across all org settings tabs) ─────────
const inputCls = 'w-full h-9 px-3 text-sm border border-[#e2e8e5] dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-[#012619] dark:text-white placeholder-[#c8d5ce] focus:outline-none focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940]'
const textareaCls = 'w-full px-3 py-2 text-sm border border-[#e2e8e5] dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-[#012619] dark:text-white placeholder-[#c8d5ce] focus:outline-none focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] resize-none'
const labelCls = 'block text-[11px] uppercase tracking-widest font-semibold text-[#8a9e94] mb-1.5'
const primaryBtnCls = 'h-9 px-4 text-[13px] font-medium rounded-lg bg-[#025940] hover:bg-[#012619] disabled:opacity-60 text-white inline-flex items-center gap-1.5 transition-colors'
const ghostBtnCls = 'h-9 px-3 text-[13px] font-medium rounded-lg text-[#012619] dark:text-gray-200 hover:bg-[#e2e8e5] dark:hover:bg-gray-700 transition-colors inline-flex items-center gap-1'
const iconBtnCls = 'w-7 h-7 rounded-md inline-flex items-center justify-center text-[#8a9e94] hover:bg-[#C5D9D0]/40 dark:hover:bg-gray-700 transition-colors'

export function CompanyManagement() {
  const t = useT()
  const { user } = useAuth()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [fromCompanies, setFromCompanies] = useState<FromCompanyDetails[]>([])
  const [showFromForm, setShowFromForm] = useState(false)
  const [editingFromIndex, setEditingFromIndex] = useState<number | null>(null)
  const [fromForm, setFromForm] = useState<FromCompanyDetails>({
    name: '', address: '', postcode: '', vatNumber: '', companyRegNo: ''
  })

  // Org-wide default labour rate (£/hour) used when a company has no override.
  const [defaultLabourRate, setDefaultLabourRate] = useState<string>('')
  const [savingRate, setSavingRate] = useState(false)

  const [toCompanies, setToCompanies] = useState<ToCompanyDetails[]>([])
  const [showToForm, setShowToForm] = useState(false)
  const [editingToIndex, setEditingToIndex] = useState<number | null>(null)
  const [toForm, setToForm] = useState<ToCompanyDetails>({
    name: '', address: '', postcode: '', email: ''
  })

  useEffect(() => {
    const loadData = async () => {
      if (!user?.uid) return
      try {
        const profile = await userProfileService.getProfile(user.uid)
        if (profile?.organizationId) {
          setOrganizationId(profile.organizationId)
          const [from, to, rate] = await Promise.all([
            settingsService.getFromCompanies(profile.organizationId),
            settingsService.getToCompanies(profile.organizationId),
            settingsService.getDefaultLabourRate(profile.organizationId),
          ])
          setFromCompanies(from)
          setToCompanies(to)
          setDefaultLabourRate(String(rate))
        }
      } catch (error) {
        logger.error('Error loading companies:', error)
        toast.error(t('settings.company.loadFail'))
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [user])

  const handleSaveDefaultRate = async () => {
    if (!organizationId) return
    const n = parseFloat(defaultLabourRate)
    if (!(n > 0)) { toast.error(t('settings.company.labourRateInvalid')); return }
    setSavingRate(true)
    try {
      await settingsService.saveDefaultLabourRate(organizationId, n)
      toast.success(t('settings.company.labourRateSaved'))
    } catch {
      toast.error(t('settings.company.saveFail'))
    } finally {
      setSavingRate(false)
    }
  }

  // ── FROM handlers ────────────────────────────────────────────────────────
  const handleOpenFromAdd = () => {
    setEditingFromIndex(null)
    setFromForm({ name: '', address: '', postcode: '', vatNumber: '', companyRegNo: '' })
    setShowFromForm(true)
  }

  const handleEditFromCompany = (index: number) => {
    setEditingFromIndex(index)
    setFromForm(fromCompanies[index])
    setShowFromForm(true)
  }

  const handleCancelFromForm = () => {
    setShowFromForm(false)
    setEditingFromIndex(null)
  }

  // Read a logo file and store it (resized) as a base64 data URL on the company.
  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { toast.error(t('settings.company.logoTooBig')); return }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new window.Image()
      img.onload = () => {
        const max = 400
        let w = img.width, h = img.height
        if (w > max || h > max) {
          const r = Math.min(max / w, max / h)
          w = Math.round(w * r); h = Math.round(h * r)
        }
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, w, h)
        setFromForm(prev => ({ ...prev, logo: canvas.toDataURL('image/png') }))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  const handleSaveFromCompany = async () => {
    if (!organizationId) return
    if (!fromForm.name.trim())        return toast.error(t('settings.company.nameRequired'))
    if (!fromForm.address.trim())     return toast.error(t('settings.company.addressRequired'))
    if (!fromForm.postcode.trim())    return toast.error(t('settings.company.postcodeRequired'))
    if (!fromForm.vatNumber.trim())   return toast.error(t('settings.company.vatRequired'))
    if (!fromForm.companyRegNo.trim()) return toast.error(t('settings.company.regRequired'))

    try {
      const updated = editingFromIndex !== null
        ? fromCompanies.map((c, i) => i === editingFromIndex ? fromForm : c)
        : [...fromCompanies, fromForm]
      await settingsService.saveFromCompanies(organizationId, updated)
      setFromCompanies(updated)
      setShowFromForm(false)
      setEditingFromIndex(null)
      toast.success(t(editingFromIndex !== null ? 'settings.company.updated' : 'settings.company.added'))
    } catch (error) {
      logger.error('Error saving from company:', error)
      toast.error(t('settings.company.saveFail'))
    }
  }

  const handleDeleteFromCompany = async (index: number) => {
    if (!organizationId) return
    if (!confirm(t('settings.company.confirmDelete', { name: fromCompanies[index].name }))) return
    try {
      const updated = fromCompanies.filter((_, i) => i !== index)
      await settingsService.saveFromCompanies(organizationId, updated)
      setFromCompanies(updated)
      toast.success(t('settings.company.deleted'))
    } catch (error) {
      logger.error('Error deleting from company:', error)
      toast.error(t('settings.company.deleteFail'))
    }
  }

  // ── TO handlers ──────────────────────────────────────────────────────────
  const handleOpenToAdd = () => {
    setEditingToIndex(null)
    setToForm({ name: '', address: '', postcode: '', email: '' })
    setShowToForm(true)
  }

  const handleEditToCompany = (index: number) => {
    setEditingToIndex(index)
    setToForm(toCompanies[index])
    setShowToForm(true)
  }

  const handleCancelToForm = () => {
    setShowToForm(false)
    setEditingToIndex(null)
  }

  const handleSaveToCompany = async () => {
    if (!organizationId) return
    if (!toForm.name.trim())     return toast.error(t('settings.company.nameRequired'))
    if (!toForm.address.trim())  return toast.error(t('settings.company.addressRequired'))
    if (!toForm.postcode.trim()) return toast.error(t('settings.company.postcodeRequired'))

    try {
      const updated = editingToIndex !== null
        ? toCompanies.map((c, i) => i === editingToIndex ? toForm : c)
        : [...toCompanies, toForm]
      await settingsService.saveToCompanies(organizationId, updated)
      setToCompanies(updated)
      setShowToForm(false)
      setEditingToIndex(null)
      toast.success(t(editingToIndex !== null ? 'settings.company.updated' : 'settings.company.added'))
    } catch (error) {
      logger.error('Error saving to company:', error)
      toast.error(t('settings.company.saveFail'))
    }
  }

  const handleDeleteToCompany = async (index: number) => {
    if (!organizationId) return
    if (!confirm(t('settings.company.confirmDelete', { name: toCompanies[index].name }))) return
    try {
      const updated = toCompanies.filter((_, i) => i !== index)
      await settingsService.saveToCompanies(organizationId, updated)
      setToCompanies(updated)
      toast.success(t('settings.company.deleted'))
    } catch (error) {
      logger.error('Error deleting to company:', error)
      toast.error(t('settings.company.deleteFail'))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#025940] border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl px-4 sm:px-6 py-6 space-y-8">

      {/* ════════════════════════ DEFAULT LABOUR RATE ════════════════════════ */}
      <section className="rounded-2xl border border-[#e2e8e5] dark:border-gray-700 bg-[#f6f8f7] dark:bg-gray-800/50 p-4 sm:p-5">
        <h3 className="text-[15px] font-semibold text-[#012619] dark:text-white tracking-tight inline-flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[#025940]" />
          {t('settings.company.labourRateTitle')}
        </h3>
        <p className="text-[12.5px] text-[#8a9e94] mt-0.5 mb-3">{t('settings.company.labourRateHint')}</p>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className={labelCls}>{t('settings.company.labourRateTitle')}</label>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-[#4a5e54] dark:text-gray-300">£</span>
              <input
                type="number" min="0" step="0.5"
                value={defaultLabourRate}
                onChange={(e) => setDefaultLabourRate(e.target.value)}
                className={`${inputCls} w-28`}
                placeholder="50"
              />
              <span className="text-sm text-[#8a9e94]">{t('settings.company.perHour')}</span>
            </div>
          </div>
          <button
            onClick={handleSaveDefaultRate}
            disabled={savingRate}
            className="h-9 px-4 text-[13px] font-medium rounded-lg bg-[#025940] hover:bg-[#012619] text-white disabled:opacity-60 transition-colors"
          >
            {savingRate ? t('settings.company.saving') : t('settings.company.save')}
          </button>
        </div>
      </section>

      {/* ════════════════════════ FROM COMPANIES ════════════════════════ */}
      <section className="space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-[#012619] dark:text-white tracking-tight inline-flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#025940]" />
              {t('settings.company.yourBusiness')}
            </h3>
            <p className="text-[12.5px] text-[#8a9e94] mt-0.5">
              {t(fromCompanies.length === 1 ? 'settings.company.fromSubOne' : 'settings.company.fromSubMany', { count: fromCompanies.length })}
            </p>
          </div>
          {!showFromForm && (
            <button onClick={handleOpenFromAdd} className={`${primaryBtnCls} flex-shrink-0`}>
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              {t('settings.company.addCompany')}
            </button>
          )}
        </div>

        {/* Create / edit form */}
        {showFromForm && (
          <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3.5">
            <div>
              <label className={labelCls}>{t('settings.company.companyName')}</label>
              <input
                type="text"
                value={fromForm.name}
                onChange={(e) => setFromForm({ ...fromForm, name: e.target.value })}
                className={inputCls}
                placeholder="ABC Motors Ltd"
                autoFocus
              />
            </div>
            <div>
              <label className={labelCls}>{t('settings.company.address')}</label>
              <textarea
                value={fromForm.address}
                onChange={(e) => setFromForm({ ...fromForm, address: e.target.value })}
                rows={2}
                className={textareaCls}
                placeholder="123 High Street, London"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>{t('settings.company.postcode')}</label>
                <input
                  type="text"
                  value={fromForm.postcode}
                  onChange={(e) => setFromForm({ ...fromForm, postcode: e.target.value.toUpperCase() })}
                  className={inputCls}
                  placeholder="SW1A 1AA"
                />
              </div>
              <div>
                <label className={labelCls}>{t('settings.company.vatNumber')}</label>
                <input
                  type="text"
                  value={fromForm.vatNumber}
                  onChange={(e) => setFromForm({ ...fromForm, vatNumber: e.target.value })}
                  className={inputCls}
                  placeholder="GB123456789"
                />
              </div>
              <div>
                <label className={labelCls}>{t('settings.company.companyReg')}</label>
                <input
                  type="text"
                  value={fromForm.companyRegNo}
                  onChange={(e) => setFromForm({ ...fromForm, companyRegNo: e.target.value })}
                  className={inputCls}
                  placeholder="12345678"
                />
              </div>
            </div>
            {/* Invoicing: parts markup % + discount % + labour rate override */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>{t('settings.company.partsMarkup')}</label>
                <input
                  type="number" min="0" step="0.1"
                  value={fromForm.partsMarkupPercent ?? ''}
                  onChange={(e) => setFromForm({ ...fromForm, partsMarkupPercent: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                  className={inputCls}
                  placeholder="0"
                />
              </div>
              <div>
                <label className={labelCls}>{t('settings.company.discountPct')}</label>
                <input
                  type="number" min="0" max="100" step="0.1"
                  value={fromForm.discountPercent ?? ''}
                  onChange={(e) => setFromForm({ ...fromForm, discountPercent: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                  className={inputCls}
                  placeholder="0"
                />
              </div>
              <div>
                <label className={labelCls}>{t('settings.company.labourRate')}</label>
                <input
                  type="number" min="0" step="0.5"
                  value={fromForm.labourRate ?? ''}
                  onChange={(e) => setFromForm({ ...fromForm, labourRate: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                  className={inputCls}
                  placeholder={t('settings.company.labourRatePlaceholder')}
                />
              </div>
            </div>

            {/* Invoicing: bank / payment details (shown bottom-left of invoice) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>{t('settings.company.bankName')}</label>
                <input
                  value={fromForm.bankName ?? ''}
                  onChange={(e) => setFromForm({ ...fromForm, bankName: e.target.value })}
                  className={inputCls}
                  placeholder={t('settings.company.optional')}
                />
              </div>
              <div>
                <label className={labelCls}>{t('settings.company.sortCode')}</label>
                <input
                  value={fromForm.sortCode ?? ''}
                  onChange={(e) => setFromForm({ ...fromForm, sortCode: e.target.value })}
                  className={inputCls}
                  placeholder="00-00-00"
                />
              </div>
              <div>
                <label className={labelCls}>{t('settings.company.accountNumber')}</label>
                <input
                  value={fromForm.accountNumber ?? ''}
                  onChange={(e) => setFromForm({ ...fromForm, accountNumber: e.target.value })}
                  className={inputCls}
                  placeholder={t('settings.company.optional')}
                />
              </div>
            </div>

            {/* Invoicing: logo */}
            <div>
              <label className={labelCls}>{t('settings.company.logo')}</label>
              <div className="flex items-center gap-3">
                {fromForm.logo ? (
                  <img src={fromForm.logo} alt="" className="h-12 w-12 object-contain rounded border border-[#e2e8e5] dark:border-gray-700 bg-white p-1 flex-shrink-0" />
                ) : (
                  <div className="h-12 w-12 rounded border border-dashed border-[#c8d5ce] flex items-center justify-center flex-shrink-0">
                    <ImageIcon className="w-5 h-5 text-[#c8d5ce]" />
                  </div>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  onChange={handleLogoSelect}
                  className="text-xs text-[#4a5e54] dark:text-gray-300 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#025940] file:text-white hover:file:bg-[#012619] file:cursor-pointer"
                />
                {fromForm.logo && (
                  <button type="button" onClick={() => setFromForm({ ...fromForm, logo: undefined })} className="text-xs font-semibold text-red-600 hover:text-red-700 whitespace-nowrap">
                    {t('settings.company.removeLogo')}
                  </button>
                )}
              </div>
              <p className="text-[11px] text-[#8a9e94] mt-1">{t('settings.company.logoHint')}</p>
            </div>

            <div className="flex items-center gap-1.5 pt-1">
              <button onClick={handleSaveFromCompany} className={primaryBtnCls}>
                <Check className="w-4 h-4" strokeWidth={2.5} />
                {editingFromIndex !== null ? t('settings.common.saveChanges') : t('settings.company.addCompany')}
              </button>
              <button onClick={handleCancelFromForm} className={ghostBtnCls}>
                <X className="w-3.5 h-3.5" />
                {t('settings.common.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
          {fromCompanies.length === 0 ? (
            <div className="text-center py-10 px-6">
              <Building2 className="w-7 h-7 text-[#c8d5ce] mx-auto mb-2" />
              <p className="text-sm font-medium text-[#012619] dark:text-white">{t('settings.company.emptyFromTitle')}</p>
              <p className="text-[12.5px] text-[#8a9e94] mt-1">{t('settings.company.emptyFromBody')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#e2e8e5] dark:divide-gray-700">
              {fromCompanies.map((company, index) => (
                <li key={index} className="group">
                  <div className="flex items-start gap-3 px-3 sm:px-4 py-3 hover:bg-[#f5f9f7] dark:hover:bg-gray-800/40 transition-colors">
                    <Building2 className="w-4 h-4 text-[#8a9e94] flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="text-[13.5px] font-medium text-[#012619] dark:text-white truncate">
                        {company.name}
                      </div>
                      <div className="text-[12px] text-[#5a6c64] dark:text-gray-400 truncate">
                        {company.address} · {company.postcode}
                      </div>
                      <div className="text-[11px] text-[#8a9e94] font-mono truncate">
                        {t('settings.company.vatPrefix')} {company.vatNumber} · {t('settings.company.regPrefix')} {company.companyRegNo}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button onClick={() => handleEditFromCompany(index)} aria-label={t('settings.common.edit')} className={`${iconBtnCls} hover:text-[#025940]`}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDeleteFromCompany(index)} aria-label={t('settings.common.delete')} className={`${iconBtnCls} hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ════════════════════════ TO COMPANIES ════════════════════════ */}
      <section className="space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-[#012619] dark:text-white tracking-tight inline-flex items-center gap-2">
              <Users className="w-4 h-4 text-[#025940]" />
              {t('settings.company.customers')}
            </h3>
            <p className="text-[12.5px] text-[#8a9e94] mt-0.5">
              {t(toCompanies.length === 1 ? 'settings.company.toSubOne' : 'settings.company.toSubMany', { count: toCompanies.length })}
            </p>
          </div>
          {!showToForm && (
            <button onClick={handleOpenToAdd} className={`${primaryBtnCls} flex-shrink-0`}>
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              {t('settings.company.addCustomer')}
            </button>
          )}
        </div>

        {/* Create / edit form */}
        {showToForm && (
          <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3.5">
            <div>
              <label className={labelCls}>{t('settings.company.companyName')}</label>
              <input
                type="text"
                value={toForm.name}
                onChange={(e) => setToForm({ ...toForm, name: e.target.value })}
                className={inputCls}
                placeholder="Customer Ltd"
                autoFocus
              />
            </div>
            <div>
              <label className={labelCls}>{t('settings.company.address')}</label>
              <textarea
                value={toForm.address}
                onChange={(e) => setToForm({ ...toForm, address: e.target.value })}
                rows={2}
                className={textareaCls}
                placeholder="456 Business Park, Manchester"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('settings.company.postcode')}</label>
                <input
                  type="text"
                  value={toForm.postcode}
                  onChange={(e) => setToForm({ ...toForm, postcode: e.target.value.toUpperCase() })}
                  className={inputCls}
                  placeholder="M1 1AA"
                />
              </div>
              <div>
                <label className={labelCls}>{t('settings.company.emailOptional')}</label>
                <input
                  type="email"
                  value={toForm.email || ''}
                  onChange={(e) => setToForm({ ...toForm, email: e.target.value })}
                  className={inputCls}
                  placeholder="customer@example.com"
                />
              </div>
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <button onClick={handleSaveToCompany} className={primaryBtnCls}>
                <Check className="w-4 h-4" strokeWidth={2.5} />
                {editingToIndex !== null ? t('settings.common.saveChanges') : t('settings.company.addCustomer')}
              </button>
              <button onClick={handleCancelToForm} className={ghostBtnCls}>
                <X className="w-3.5 h-3.5" />
                {t('settings.common.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
          {toCompanies.length === 0 ? (
            <div className="text-center py-10 px-6">
              <Users className="w-7 h-7 text-[#c8d5ce] mx-auto mb-2" />
              <p className="text-sm font-medium text-[#012619] dark:text-white">{t('settings.company.emptyToTitle')}</p>
              <p className="text-[12.5px] text-[#8a9e94] mt-1">{t('settings.company.emptyToBody')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#e2e8e5] dark:divide-gray-700">
              {toCompanies.map((company, index) => (
                <li key={index} className="group">
                  <div className="flex items-start gap-3 px-3 sm:px-4 py-3 hover:bg-[#f5f9f7] dark:hover:bg-gray-800/40 transition-colors">
                    <Users className="w-4 h-4 text-[#8a9e94] flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="text-[13.5px] font-medium text-[#012619] dark:text-white truncate">
                        {company.name}
                      </div>
                      <div className="text-[12px] text-[#5a6c64] dark:text-gray-400 truncate">
                        {company.address} · {company.postcode}
                      </div>
                      {company.email && (
                        <div className="text-[11px] text-[#8a9e94] inline-flex items-center gap-1 truncate">
                          <Mail className="w-3 h-3" />
                          {company.email}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button onClick={() => handleEditToCompany(index)} aria-label={t('settings.common.edit')} className={`${iconBtnCls} hover:text-[#025940]`}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDeleteToCompany(index)} aria-label={t('settings.common.delete')} className={`${iconBtnCls} hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
