// src/components/admin/VehicleSupplierManagement.tsx
// Manage the VEHICLE suppliers list (leasing companies / dealers) — separate
// from the parts/stock suppliers. Feeds the Supplier dropdown in the Add/Edit
// vehicle forms. Same premium list-editor pattern as SupplierManagement.
'use client'

import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Truck, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { settingsService } from '@/lib/services/settingsService'
import { isAdminRole } from '@/lib/permissions'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

export function VehicleSupplierManagement() {
  const t = useT()
  const { user } = useAuth()
  const [userProfile, setUserProfile] = useState<any>(null)
  const [suppliers, setSuppliers] = useState<string[]>([])
  const [newSupplier, setNewSupplier] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      if (!user?.uid) return
      setLoading(true)
      try {
        const profile = await userProfileService.getProfile(user.uid)
        setUserProfile(profile)
        if (profile?.organizationId) {
          setSuppliers(await settingsService.getVehicleSuppliers(profile.organizationId))
        }
      } catch (error) {
        logger.error('Error loading vehicle suppliers:', error)
      } finally {
        setLoading(false)
      }
    })()
  }, [user])

  const handleAdd = async () => {
    const name = newSupplier.trim()
    if (!name) return toast.error(t('settings.vehicleSupplier.enterName'))
    if (!userProfile?.organizationId) return
    if (suppliers.some((s) => s.toLowerCase() === name.toLowerCase())) {
      return toast.error(t('settings.vehicleSupplier.alreadyExists'))
    }
    setSaving(true)
    try {
      const updated = [...suppliers, name].sort((a, b) => a.localeCompare(b))
      await settingsService.saveVehicleSuppliers(userProfile.organizationId, updated)
      setSuppliers(updated)
      setNewSupplier('')
      toast.success(t('settings.vehicleSupplier.added'))
    } catch {
      toast.error(t('settings.vehicleSupplier.saveFail'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (name: string) => {
    if (!userProfile?.organizationId) return
    if (!window.confirm(t('settings.vehicleSupplier.confirmDelete', { name }))) return
    setDeleting(name)
    try {
      const updated = suppliers.filter((s) => s !== name)
      await settingsService.saveVehicleSuppliers(userProfile.organizationId, updated)
      setSuppliers(updated)
      toast.success(t('settings.vehicleSupplier.deleted'))
    } catch {
      toast.error(t('settings.vehicleSupplier.saveFail'))
    } finally {
      setDeleting(null)
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
          <p className="text-sm font-medium text-amber-900 dark:text-amber-300">{t('settings.common.accessRestricted')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl px-4 sm:px-6 py-6 space-y-5">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-[#012619] dark:text-white tracking-tight inline-flex items-center gap-2">
          <Truck className="w-4 h-4 text-[#025940]" />
          {t('settings.vehicleSupplier.heading')}
        </h3>
        <p className="text-[12.5px] text-[#8a9e94] mt-0.5">{t('settings.vehicleSupplier.subtitle')}</p>
      </div>

      <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <input
            type="text"
            value={newSupplier}
            onChange={(e) => setNewSupplier(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            placeholder={t('settings.vehicleSupplier.namePlaceholder')}
            className="h-9 px-3 text-sm flex-1 border border-[#e2e8e5] dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-[#012619] dark:text-white placeholder-[#c8d5ce] focus:outline-none focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940]"
          />
          <button
            onClick={handleAdd}
            disabled={saving || !newSupplier.trim()}
            className="h-9 px-4 text-[13px] font-medium rounded-lg bg-[#025940] hover:bg-[#012619] disabled:opacity-60 text-white inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-4 h-4" strokeWidth={2.5} />}
            {saving ? t('settings.common.adding') : t('settings.common.add')}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        {suppliers.length === 0 ? (
          <div className="text-center py-12 px-6">
            <Truck className="w-8 h-8 text-[#c8d5ce] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#012619] dark:text-white">{t('settings.vehicleSupplier.emptyTitle')}</p>
            <p className="text-[12.5px] text-[#8a9e94] mt-1">{t('settings.vehicleSupplier.emptyBody')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#e2e8e5] dark:divide-gray-700">
            {suppliers.map((s) => (
              <li key={s}>
                <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-[#f5f9f7] dark:hover:bg-gray-800/40 transition-colors">
                  <Truck className="w-3.5 h-3.5 text-[#8a9e94] flex-shrink-0" />
                  <span className="text-[13.5px] font-medium text-[#012619] dark:text-white truncate flex-1 min-w-0">{s}</span>
                  <button
                    onClick={() => handleDelete(s)}
                    disabled={deleting === s}
                    aria-label={t('settings.vehicleSupplier.delete')}
                    className="w-7 h-7 rounded-md inline-flex items-center justify-center text-[#8a9e94] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-60 transition-colors flex-shrink-0"
                  >
                    {deleting === s ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
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
