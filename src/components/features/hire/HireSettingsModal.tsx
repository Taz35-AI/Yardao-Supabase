// src/components/features/hire/HireSettingsModal.tsx
// Edit the renamable hire-agreement label (singular + plural).
'use client'

import React, { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { hireSettingsService } from '@/lib/services/hireSettingsService'
import { useHire } from '@/contexts/HireContext'
import { useT } from '@/lib/i18n'

export function HireSettingsModal({ onClose }: { onClose: () => void }) {
  const t = useT()
  const { organizationId, settings, reloadSettings } = useHire()
  const [singular, setSingular] = useState(settings.agreementLabelSingular)
  const [plural, setPlural] = useState(settings.agreementLabelPlural)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!organizationId) return
    setSaving(true)
    try {
      await hireSettingsService.saveHireSettings(organizationId, {
        ...settings,
        agreementLabelSingular: singular.trim() || 'Hire Agreement',
        agreementLabelPlural: plural.trim() || 'Hire Agreements',
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
    'w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative bg-white dark:bg-gray-900 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl border border-[#025940]/20">
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
