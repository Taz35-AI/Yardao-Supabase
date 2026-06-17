// src/components/settings/UserSettings.tsx
// User Settings component for theme and notification preferences

'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from 'next-themes'
import { useLang, useT, LANGS } from '@/lib/i18n'
import { userProfileService } from '@/lib/firestore'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { toast } from 'sonner'
import {
  Sun,
  Moon,
  Monitor,
  Bell,
  BellOff,
  Palette,
  Save,
  Smartphone,
  Settings,
  Columns3,
  LayoutList,
  LayoutGrid,
  Map,
  MapPin,
  Languages,
} from 'lucide-react'
import { logger } from '@/lib/logger'
import { useBranches } from '@/hooks/useBranches'
import { DeleteAccountSection } from '@/components/settings/DeleteAccountSection'

type DefaultView = 'pipeline' | 'table' | 'cards' | 'layout'

export function UserSettings() {
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()
  const { lang, setLang } = useLang()
  const t = useT()
  const { branches, loading: branchesLoading } = useBranches()

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt')
  const [selectedTheme, setSelectedTheme] = useState<'light' | 'dark' | 'system'>('system')
  // ✨ PHASE 3: Dashboard preferences
  const [selectedDefaultView, setSelectedDefaultView] = useState<DefaultView>('pipeline')
  const [selectedDefaultBranch, setSelectedDefaultBranch] = useState<string>('main')
  
  // Ensure component is mounted before rendering theme UI
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Load user profile and settings
  useEffect(() => {
    loadUserSettings()
  }, [user])
  
  // Check notification permissions on mount
  useEffect(() => {
    checkNotificationStatus()
  }, [])
  
  const loadUserSettings = async () => {
    if (!user?.uid) {
      setLoading(false)
      return
    }
    
    try {
      const profile = await userProfileService.getProfile(user.uid)
      setUserProfile(profile)
      
      // Set theme from profile or use current theme
      const savedTheme = profile?.themePreference || theme || 'system'
      setSelectedTheme(savedTheme as any)

      // 🌐 Apply saved language (cross-device). The instant per-device
      // pref already loaded from localStorage via LanguageProvider; if the
      // profile carries a different saved choice, honour it.
      if (profile?.languagePreference && profile.languagePreference !== lang) {
        setLang(profile.languagePreference)
      }

      // Set notification preference
      setNotificationsEnabled(profile?.notificationsEnabled !== false) // Default to true

      // ✨ PHASE 3: Default view + branch
      if (profile?.defaultView) setSelectedDefaultView(profile.defaultView as DefaultView)
      if (profile?.defaultBranchSlug) setSelectedDefaultBranch(profile.defaultBranchSlug)
      
    } catch (error) {
      logger.error('Error loading user settings:', error)
      toast.error(t('settings.user.loadFail'))
    } finally {
      setLoading(false)
    }
  }
  
  const checkNotificationStatus = async () => {
    if (!Capacitor.isNativePlatform()) {
      // Web notification check
      if ('Notification' in window) {
        setNotificationPermission(Notification.permission as any)
      }
      return
    }
    
    try {
      // Mobile notification check
      const permStatus = await PushNotifications.checkPermissions()
      setNotificationPermission(permStatus.receive as any)
    } catch (error) {
      logger.error('Error checking notification status:', error)
    }
  }
  
  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setSelectedTheme(newTheme)
    setTheme(newTheme)
  }
  
  const handleNotificationToggle = async () => {
    const newValue = !notificationsEnabled
    
    // If enabling notifications and permission not granted, request permission
    if (newValue && notificationPermission !== 'granted') {
      const granted = await requestNotificationPermission()
      if (!granted) {
        toast.error(t('settings.user.notifDenied'))
        return
      }
    }
    
    setNotificationsEnabled(newValue)
    
    if (!newValue) {
      toast.info(t('settings.user.notifDisabled'))
    } else {
      toast.success(t('settings.user.notifEnabled'))
    }
  }
  
  const requestNotificationPermission = async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) {
      // Web notifications
      if ('Notification' in window) {
        const permission = await Notification.requestPermission()
        setNotificationPermission(permission as any)
        return permission === 'granted'
      }
      return false
    }
    
    try {
      // Mobile notifications
      const result = await PushNotifications.requestPermissions()
      setNotificationPermission(result.receive as any)
      
      if (result.receive === 'granted') {
        await PushNotifications.register()
        return true
      }
      return false
    } catch (error) {
      logger.error('Error requesting notification permission:', error)
      return false
    }
  }
  
  const handleSaveSettings = async () => {
    if (!user?.uid) {
      toast.error(t('settings.user.noUser'))
      return
    }
    
    setSaving(true)
    
    try {
      await userProfileService.updateProfile(user.uid, {
        themePreference: selectedTheme,
        languagePreference: lang,
        notificationsEnabled: notificationsEnabled,
        // ✨ PHASE 3: dashboard preferences
        defaultView: selectedDefaultView,
        defaultBranchSlug: selectedDefaultBranch,
        updatedAt: new Date().toISOString()
      })
      
      toast.success(t('settings.user.saved'))
    } catch (error) {
      logger.error('Error saving settings:', error)
      toast.error(t('settings.user.saveFail'))
    } finally {
      setSaving(false)
    }
  }
  
  if (loading || !mounted) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#025940]"></div>
      </div>
    )
  }

  // Shared chrome — mirrors the booking-form retheme + Add Fleet Vehicle
  // wizard so every settings card looks like one family.
  const sectionCard =
    'bg-[#f8faf9] dark:bg-gray-800/60 rounded-xl shadow-sm p-4 sm:p-5 border border-[#e2e8e5] dark:border-gray-700'
  const sectionHeader = 'flex items-center gap-3 mb-4'
  const iconBadge =
    'flex items-center justify-center w-9 h-9 rounded-lg bg-[#025940]/10 border border-[#025940]/20 flex-shrink-0'
  const sectionTitle =
    'text-sm sm:text-base font-bold text-[#012619] dark:text-white uppercase tracking-wide'
  const sectionDesc =
    'text-xs text-[#8a9e94] dark:text-gray-400 mt-0.5'
  const subLabel =
    'block text-[11px] font-semibold text-[#4a5e54] dark:text-gray-300 uppercase tracking-wide mb-2'
  const optionCard = (active: boolean) =>
    `relative p-3 sm:p-4 rounded-xl border-2 transition-all ${
      active
        ? 'border-[#025940] bg-[#025940]/8 dark:border-[#72A68E] dark:bg-[#025940]/20 shadow-sm'
        : 'border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-[#72A68E]'
    }`
  const optionText = (active: boolean) =>
    `text-xs sm:text-sm font-semibold ${
      active ? 'text-[#025940] dark:text-[#72A68E]' : 'text-[#012619] dark:text-gray-200'
    }`
  const selectedDot = (
    <span className="absolute top-2 right-2">
      <span className="block w-2 h-2 rounded-full bg-[#b3f243] ring-2 ring-[#025940]/30" />
    </span>
  )

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Appearance */}
      <div className={sectionCard}>
        <div className={sectionHeader}>
          <span className={iconBadge}>
            <Palette className="w-4 h-4 text-[#025940] dark:text-[#72A68E]" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className={sectionTitle}>{t('settings.user.appearance')}</h3>
            <p className={sectionDesc}>{t('settings.user.appearanceDesc')}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {([
            { value: 'light',  label: t('settings.user.themeLight'),  Icon: Sun },
            { value: 'dark',   label: t('settings.user.themeDark'),   Icon: Moon },
            { value: 'system', label: t('settings.user.themeSystem'), Icon: Monitor },
          ] as const).map(({ value, label, Icon }) => {
            const active = selectedTheme === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => handleThemeChange(value)}
                className={optionCard(active)}
              >
                <div className="flex flex-col items-center gap-1.5 sm:gap-2">
                  <Icon
                    className={`w-5 h-5 sm:w-6 sm:h-6 ${
                      active ? 'text-[#025940] dark:text-[#72A68E]' : 'text-[#4a5e54] dark:text-gray-400'
                    }`}
                  />
                  <span className={optionText(active)}>{label}</span>
                </div>
                {active && selectedDot}
              </button>
            )
          })}
        </div>
      </div>

      {/* Language */}
      <div className={sectionCard}>
        <div className={sectionHeader}>
          <span className={iconBadge}>
            <Languages className="w-4 h-4 text-[#025940] dark:text-[#72A68E]" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className={sectionTitle}>{t('userSettings.language.title')}</h3>
            <p className={sectionDesc}>{t('userSettings.language.subtitle')}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {LANGS.map((opt) => {
            const active = lang === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setLang(opt.value)}
                className={optionCard(active)}
              >
                <span className={`${optionText(active)} block text-center`}>{opt.label}</span>
                {active && selectedDot}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-[#8a9e94] dark:text-gray-400 mt-3">
          {lang === 'ro'
            ? 'Traducerea este în curs — textul netradus apare în engleză. Apasă „Salvează" pentru a păstra alegerea pe toate dispozitivele.'
            : lang === 'bg'
            ? 'Преводът е в процес — непреведеният текст се показва на английски. Натиснете „Запази“, за да запазите избора на всички устройства.'
            : lang === 'pl'
            ? 'Tłumaczenie w toku — nieprzetłumaczony tekst pojawia się po angielsku. Naciśnij „Zapisz”, aby zachować wybór na wszystkich urządzeniach.'
            : 'Translation in progress — untranslated text shows in English. Press “Save” to keep this across devices.'}
        </p>
      </div>

      {/* Dashboard preferences */}
      <div className={sectionCard}>
        <div className={sectionHeader}>
          <span className={iconBadge}>
            <Settings className="w-4 h-4 text-[#025940] dark:text-[#72A68E]" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className={sectionTitle}>{t('settings.user.dashPrefs')}</h3>
            <p className={sectionDesc}>{t('settings.user.dashPrefsDesc')}</p>
          </div>
        </div>

        <div className="mb-5">
          <label className={subLabel}>{t('settings.user.defaultView')}</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {([
              { value: 'pipeline', label: t('settings.user.viewPipeline'), icon: Columns3 },
              { value: 'table',    label: t('settings.user.viewList'),     icon: LayoutList },
              { value: 'cards',    label: t('settings.user.viewCards'),    icon: LayoutGrid },
              { value: 'layout',   label: t('settings.user.viewYardMap'), icon: Map },
            ] as { value: DefaultView; label: string; icon: any }[]).map(opt => {
              const Icon = opt.icon
              const active = selectedDefaultView === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedDefaultView(opt.value)}
                  className={`${optionCard(active)} flex flex-col items-center gap-1.5`}
                >
                  <Icon
                    className={`w-5 h-5 ${
                      active ? 'text-[#025940] dark:text-[#72A68E]' : 'text-[#4a5e54] dark:text-gray-400'
                    }`}
                  />
                  <span className={optionText(active)}>{opt.label}</span>
                  {active && selectedDot}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className={subLabel}>{t('settings.user.defaultBranch')}</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#025940] dark:text-[#72A68E] pointer-events-none" />
            <select
              value={selectedDefaultBranch}
              onChange={(e) => setSelectedDefaultBranch(e.target.value)}
              disabled={branchesLoading}
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-[#c8d5ce] dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[#012619] dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940] shadow-sm disabled:opacity-60"
            >
              <option value="main">{t('settings.user.mainBranchOption')}</option>
              {branches.map(b => (
                <option key={b.id} value={b.slug}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-[#8a9e94] dark:text-gray-400 mt-1.5">
            {branchesLoading
              ? t('settings.user.loadingBranches')
              : t('settings.user.branchSwitchHint')}
          </p>
        </div>
      </div>

      {/* Notifications */}
      <div className={sectionCard}>
        <div className={sectionHeader}>
          <span className={iconBadge}>
            <Bell className="w-4 h-4 text-[#025940] dark:text-[#72A68E]" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className={sectionTitle}>{t('settings.user.notifications')}</h3>
            <p className={sectionDesc}>{t('settings.user.notificationsDesc')}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-start sm:items-center justify-between gap-3 p-3 sm:p-4 bg-white dark:bg-gray-900/40 rounded-lg border border-[#e2e8e5] dark:border-gray-700">
            <div className="flex items-start sm:items-center gap-2 sm:gap-3 min-w-0 flex-1">
              {notificationsEnabled ? (
                <Bell className="w-5 h-5 text-[#025940] dark:text-[#72A68E] flex-shrink-0 mt-0.5 sm:mt-0" />
              ) : (
                <BellOff className="w-5 h-5 text-[#8a9e94] flex-shrink-0 mt-0.5 sm:mt-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm sm:text-base font-semibold text-[#012619] dark:text-white">
                  {t('settings.user.pushNotifications')}
                </p>
                <p className="text-xs sm:text-sm text-[#8a9e94] dark:text-gray-400 mt-0.5">
                  {t('settings.user.pushNotificationsDesc')}
                </p>
              </div>
            </div>

            <button
              onClick={handleNotificationToggle}
              aria-pressed={notificationsEnabled}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 mt-1 sm:mt-0 ${
                notificationsEnabled
                  ? 'bg-[#025940]'
                  : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  notificationsEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {Capacitor.isNativePlatform() && (
            <div className="p-3 bg-[#025940]/8 dark:bg-[#025940]/15 rounded-lg border border-[#025940]/20 dark:border-[#72A68E]/30">
              <div className="flex items-start gap-2">
                <Smartphone className="w-4 h-4 text-[#025940] dark:text-[#72A68E] flex-shrink-0 mt-0.5" />
                <p className="text-xs sm:text-sm text-[#012619] dark:text-[#e3efe9] leading-relaxed">
                  {notificationPermission === 'granted'
                    ? t('settings.user.permGranted')
                    : notificationPermission === 'denied'
                    ? t('settings.user.permBlocked')
                    : t('settings.user.permNotRequested')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save button — premium brand primary */}
      <div className="flex justify-end pt-1">
        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-[#025940] hover:bg-[#012619] text-white font-bold rounded-lg shadow-sm transition-colors text-sm sm:text-base disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {t('settings.user.savingBtn')}
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              {t('settings.user.saveBtn')}
            </>
          )}
        </button>
      </div>

      {/* Danger zone — self-service account deletion (App Store requirement) */}
      <DeleteAccountSection />
    </div>
  )
}