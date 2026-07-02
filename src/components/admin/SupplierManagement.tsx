// src/components/admin/SupplierManagement.tsx
// Supplier management for organization settings — premium dense layout

'use client'

import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Package, PackageOpen, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService, settingsService } from '@/lib/firestore'
import { isAdminRole } from '@/lib/permissions'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

export function SupplierManagement() {
  const t = useT()
  const { user } = useAuth()
  const [userProfile, setUserProfile] = useState<any>(null)
  const [suppliers, setSuppliers] = useState<string[]>([])
  const [newSupplier, setNewSupplier] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingSupplier, setDeletingSupplier] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [user])

  const loadData = async () => {
    if (!user?.uid) return

    setLoading(true)
    try {
      const profile = await userProfileService.getProfile(user.uid)
      setUserProfile(profile)

      if (profile?.organizationId) {
        const suppliersData = await settingsService.getSuppliers(profile.organizationId)
        setSuppliers(suppliersData)
      }
    } catch (error) {
      logger.error('Error loading suppliers:', error)
      toast.error(t('settings.supplier.loadFail'))
    } finally {
      setLoading(false)
    }
  }

  const handleAddSupplier = async () => {
    if (!newSupplier.trim()) {
      toast.error(t('settings.supplier.enterName'))
      return
    }

    if (!userProfile?.organizationId) {
      toast.error(t('settings.supplier.orgNotFound'))
      return
    }

    if (suppliers.some(s => s.toLowerCase() === newSupplier.trim().toLowerCase())) {
      toast.error(t('settings.supplier.alreadyExists'))
      return
    }

    setSaving(true)
    try {
      const updatedSuppliers = [...suppliers, newSupplier.trim()]
      await settingsService.saveSuppliers(userProfile.organizationId, updatedSuppliers)
      setSuppliers(updatedSuppliers)
      setNewSupplier('')
      toast.success(t('settings.supplier.added'))
    } catch (error) {
      logger.error('Error adding supplier:', error)
      toast.error(t('settings.supplier.addFail'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSupplier = async (supplier: string) => {
    if (!window.confirm(t('settings.supplier.confirmDelete', { name: supplier }))) return
    if (!userProfile?.organizationId) {
      toast.error(t('settings.supplier.orgNotFound'))
      return
    }

    setDeletingSupplier(supplier)
    try {
      const updatedSuppliers = suppliers.filter(s => s !== supplier)
      await settingsService.saveSuppliers(userProfile.organizationId, updatedSuppliers)
      setSuppliers(updatedSuppliers)
      toast.success(t('settings.supplier.deleted'))
    } catch (error) {
      logger.error('Error deleting supplier:', error)
      toast.error(t('settings.supplier.deleteFail'))
    } finally {
      setDeletingSupplier(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#025940] border-t-transparent" />
      </div>
    )
  }

  if (!isAdminRole(userProfile?.role)) {
    return (
      <div className="max-w-4xl px-4 sm:px-6 py-6">
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-900/10 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-900 dark:text-amber-300">{t('settings.common.accessRestricted')}</p>
            <p className="text-[12.5px] text-amber-700 dark:text-amber-400 mt-0.5">{t('settings.supplier.accessBody')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl px-4 sm:px-6 py-6 space-y-5">
      {/* Section heading */}
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-[#012619] dark:text-white tracking-tight">
          {t('settings.supplier.heading')}
        </h3>
        <p className="text-[12.5px] text-[#8a9e94] mt-0.5">
          {t(suppliers.length === 1 ? 'settings.supplier.subtitleOne' : 'settings.supplier.subtitleMany', { count: suppliers.length })}
        </p>
      </div>

      {/* Add toolbar */}
      <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <input
            type="text"
            value={newSupplier}
            onChange={(e) => setNewSupplier(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddSupplier() }}
            placeholder={t('settings.supplier.namePlaceholder')}
            className="h-9 px-3 text-sm flex-1 border border-[#e2e8e5] dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-[#012619] dark:text-white placeholder-[#c8d5ce] focus:outline-none focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940]"
          />
          <button
            onClick={handleAddSupplier}
            disabled={saving || !newSupplier.trim()}
            className="h-9 px-4 text-[13px] font-medium rounded-lg bg-[#025940] hover:bg-[#012619] disabled:opacity-60 text-white inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t('settings.common.adding')}
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" strokeWidth={2.5} />
                {t('settings.common.add')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Suppliers list */}
      <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        {suppliers.length === 0 ? (
          <div className="text-center py-12 px-6">
            <PackageOpen className="w-8 h-8 text-[#c8d5ce] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#012619] dark:text-white">{t('settings.supplier.emptyTitle')}</p>
            <p className="text-[12.5px] text-[#8a9e94] mt-1">{t('settings.supplier.emptyBody')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#e2e8e5] dark:divide-gray-700">
            {suppliers.map((supplier) => (
              <li key={supplier} className="group">
                <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-[#f5f9f7] dark:hover:bg-gray-800/40 transition-colors">
                  <Package className="w-3.5 h-3.5 text-[#8a9e94] flex-shrink-0" />
                  <span className="text-[13.5px] font-medium text-[#012619] dark:text-white truncate flex-1 min-w-0">
                    {supplier}
                  </span>
                  <button
                    onClick={() => handleDeleteSupplier(supplier)}
                    disabled={deletingSupplier === supplier}
                    aria-label={t('settings.supplier.deleteSupplier')}
                    className="w-7 h-7 rounded-md inline-flex items-center justify-center text-[#8a9e94] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-60 transition-colors flex-shrink-0"
                  >
                    {deletingSupplier === supplier ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
