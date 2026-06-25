// src/components/features/hire/HireSettingsModal.tsx
// Edit the renamable hire-agreement label (singular + plural) and — for the org
// OWNER only — manage which admins may see/use the Hire section.
'use client'

import React, { useEffect, useState } from 'react'
import { X, Loader2, ShieldCheck, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { hireSettingsService } from '@/lib/services/hireSettingsService'
import { userProfileService } from '@/lib/firestore'
import { useHire } from '@/contexts/HireContext'
import { useHireAccess } from '@/hooks/useHireAccess'
import { useAuth } from '@/contexts/AuthContext'
import { useT } from '@/lib/i18n'
import type { UserProfile } from '@/types'

export function HireSettingsModal({ onClose }: { onClose: () => void }) {
  const t = useT()
  const { user } = useAuth()
  const { organizationId, settings, reloadSettings } = useHire()
  const { isOwner } = useHireAccess()
  const [singular, setSingular] = useState(settings.agreementLabelSingular)
  const [plural, setPlural] = useState(settings.agreementLabelPlural)
  const [saving, setSaving] = useState(false)

  // Access management (owner only).
  const [admins, setAdmins] = useState<UserProfile[]>([])
  const [accessIds, setAccessIds] = useState<Set<string>>(new Set(settings.accessUserIds ?? []))
  const [loadingAdmins, setLoadingAdmins] = useState(false)

  useEffect(() => {
    if (!isOwner || !organizationId) return
    let cancelled = false
    setLoadingAdmins(true)
    userProfileService
      .getActiveUsersByOrganization(organizationId)
      .then((users) => {
        if (cancelled) return
        // Eligible = admins, excluding the owner (always has access).
        setAdmins(users.filter((u) => u.role === 'admin' && u.uid !== user?.uid))
      })
      .catch(() => setAdmins([]))
      .finally(() => !cancelled && setLoadingAdmins(false))
    return () => {
      cancelled = true
    }
  }, [isOwner, organizationId, user?.uid])

  const toggle = (uid: string) =>
    setAccessIds((prev) => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })

  const save = async () => {
    if (!organizationId) return
    setSaving(true)
    try {
      await hireSettingsService.saveHireSettings(organizationId, {
        ...settings,
        agreementLabelSingular: singular.trim() || 'Hire Agreement',
        agreementLabelPlural: plural.trim() || 'Hire Agreements',
        // Only the owner can change the allow-list; everyone else preserves it.
        accessUserIds: isOwner ? Array.from(accessIds) : settings.accessUserIds ?? [],
      })
      await reloadSettings()
      toast.success(t('hire.settingsSaved'))
      onClose()
    } catch {
      toast.error(t('hire.customerSaveFail'))
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full px-3 py-2.5 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-[#012619] dark:text-white text-sm placeholder:text-[#9db0a6] focus:ring-2 focus:ring-[#025940]/25 focus:border-[#025940] outline-none transition'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative bg-white dark:bg-gray-900 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl border border-[#025940]/20 max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-br from-[#012619] to-[#025940] px-4 py-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-white">{t('hire.settingsTitle')}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/15 rounded-lg"><X className="w-4 h-4 text-white" /></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-[#72A68E]">{t('hire.labelSetting')}</p>
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.labelSingular')}</label>
            <input value={singular} onChange={(e) => setSingular(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{t('hire.labelPlural')}</label>
            <input value={plural} onChange={(e) => setPlural(e.target.value)} className={inputCls} />
          </div>

          {/* Access control — owner only */}
          {isOwner && (
            <div className="pt-2 mt-1 border-t border-[#eef2f0] dark:border-gray-700">
              <div className="flex items-center gap-1.5 mb-1">
                <Lock className="w-3.5 h-3.5 text-[#025940] dark:text-[#b3f243]" />
                <h3 className="text-sm font-bold text-[#012619] dark:text-white">{t('hire.accessSectionTitle')}</h3>
              </div>
              <p className="text-[12px] text-[#72A68E] mb-2.5">{t('hire.accessSectionHint')}</p>

              <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 divide-y divide-[#eef2f0] dark:divide-gray-700 overflow-hidden">
                {/* Owner row — always on */}
                <div className="flex items-center justify-between px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#012619] dark:text-white truncate">{user?.email || t('hire.accessYou')}</p>
                    <p className="text-[11px] text-[#72A68E]">{t('hire.accessOwnerRow')}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    <ShieldCheck className="w-3 h-3" /> {t('hire.accessAlways')}
                  </span>
                </div>

                {loadingAdmins ? (
                  <div className="px-3 py-4 text-center text-xs text-[#72A68E]"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
                ) : admins.length === 0 ? (
                  <p className="px-3 py-4 text-center text-[12px] text-[#72A68E]">{t('hire.accessNoAdmins')}</p>
                ) : (
                  admins.map((a) => {
                    const on = accessIds.has(a.uid)
                    return (
                      <label key={a.uid} className="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#012619] dark:text-white truncate">{a.displayName || a.email}</p>
                          {a.displayName && <p className="text-[11px] text-[#72A68E] truncate">{a.email}</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => toggle(a.uid)}
                          className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-[#025940]' : 'bg-[#cdd9d2] dark:bg-gray-600'}`}
                          aria-pressed={on}
                        >
                          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[1.125rem]' : 'left-0.5'}`} />
                        </button>
                      </label>
                    )
                  })
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-bold">{t('hire.cancel')}</button>
            <button onClick={save} disabled={saving} className="flex-1 px-4 py-2.5 rounded-lg bg-[#025940] hover:bg-[#012619] text-white text-sm font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? t('hire.saving') : t('hire.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
