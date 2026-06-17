// src/components/settings/CheckInServiceSettings.tsx
// Org-level check-in / servicing preferences (migration 0043):
//   • require mileage at check-in (with an "odometer not available" escape)
//   • flag vehicles overdue for a service, with a configurable mile interval
'use client'

import React, { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { settingsService, ServiceSettings, DEFAULT_SERVICE_SETTINGS } from '@/lib/services/settingsService'
import { useT } from '@/lib/i18n'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Gauge, Wrench, Save } from 'lucide-react'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'

// Small reusable toggle (matches the brand green used across settings)
function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
        on ? 'bg-[#025940] border-[#025940]' : 'bg-gray-300 dark:bg-gray-600 border-gray-300 dark:border-gray-600'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform duration-200 ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export function CheckInServiceSettings() {
  const t = useT()
  const { user } = useAuth()
  const [orgId, setOrgId] = useState<string | null>(null)
  const [settings, setSettings] = useState<ServiceSettings>(DEFAULT_SERVICE_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (!user?.uid) { setLoading(false); return }
      try {
        const profile = await userProfileService.getProfile(user.uid)
        if (profile?.organizationId) {
          setOrgId(profile.organizationId)
          setSettings(await settingsService.getServiceSettings(profile.organizationId))
        }
      } catch (err) {
        logger.error('Failed to load check-in settings:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  const handleSave = async () => {
    if (!orgId) return
    setSaving(true)
    try {
      const threshold = Number.isFinite(settings.serviceDueThresholdMiles) && settings.serviceDueThresholdMiles > 0
        ? Math.round(settings.serviceDueThresholdMiles)
        : DEFAULT_SERVICE_SETTINGS.serviceDueThresholdMiles
      await settingsService.saveServiceSettings(orgId, { ...settings, serviceDueThresholdMiles: threshold })
      setSettings(s => ({ ...s, serviceDueThresholdMiles: threshold }))
      toast.success(t('checkInSettings.saved'))
    } catch (err) {
      logger.error('Failed to save check-in settings:', err)
      toast.error(t('checkInSettings.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#025940]" />
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-3xl">
      <div className="mb-6">
        <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-1">{t('checkInSettings.title')}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('checkInSettings.description')}</p>
      </div>

      {/* Mileage capture */}
      <Card className="mb-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="w-5 h-5 text-[#025940]" />
            <span>{t('checkInSettings.captureMileageLabel')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('checkInSettings.captureMileageHint')}</p>
            <Toggle
              on={settings.captureMileageOnCheckIn}
              onChange={v => setSettings(s => ({ ...s, captureMileageOnCheckIn: v }))}
              disabled={saving}
            />
          </div>
        </CardContent>
      </Card>

      {/* Service-due flagging */}
      <Card className="mb-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="w-5 h-5 text-[#025940]" />
            <span>{t('checkInSettings.serviceDueLabel')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('checkInSettings.serviceDueHint')}</p>
            <Toggle
              on={settings.serviceDueEnabled}
              onChange={v => setSettings(s => ({ ...s, serviceDueEnabled: v }))}
              disabled={saving}
            />
          </div>

          <div className={settings.serviceDueEnabled ? '' : 'opacity-50 pointer-events-none'}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('checkInSettings.thresholdLabel')}
            </label>
            <input
              type="number"
              min={1}
              step={500}
              value={settings.serviceDueThresholdMiles}
              onChange={e => setSettings(s => ({ ...s, serviceDueThresholdMiles: parseInt(e.target.value, 10) || 0 }))}
              disabled={saving || !settings.serviceDueEnabled}
              className="w-40 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940]"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('checkInSettings.thresholdHint')}</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !orgId}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#025940] hover:bg-[#012619] text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {saving ? t('checkInSettings.saving') : t('checkInSettings.save')}
        </button>
      </div>
    </div>
  )
}

export default CheckInServiceSettings
