// src/components/features/profile/ProfileForm.tsx
'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { User, Save, Mail, Building, Palette } from 'lucide-react'
import { UserProfile } from '@/types'
import { useT } from '@/lib/i18n'

interface ProfileFormProps {
  formData: {
    displayName: string
    email: string
    themePreference: 'light' | 'dark' | 'system'
  }
  profile: UserProfile | null
  saving: boolean
  onFormDataChange: (field: string, value: string) => void
  onSubmit: (e: React.FormEvent) => void
  className?: string
}

export const ProfileForm = React.memo(function ProfileForm({
  formData,
  profile,
  saving,
  onFormDataChange,
  onSubmit,
  className = ''
}: ProfileFormProps) {
  const t = useT()
  return (
    <Card className={`bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-all duration-300 ${className}`}>
      <CardHeader className="pb-6">
        <CardTitle className="flex items-center text-xl font-bold text-gray-900 dark:text-white">
          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mr-3">
            <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          {t('profile.form.title')}
        </CardTitle>
        <CardDescription className="text-gray-600 dark:text-gray-300">
          {t('profile.form.description')}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <form onSubmit={onSubmit} className="space-y-5">
          {/* Display Name */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
              {t('profile.form.displayName')}
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                value={formData.displayName}
                onChange={(e) => onFormDataChange('displayName', e.target.value)}
                className="pl-10 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                placeholder={t('profile.form.displayNamePlaceholder')}
                required
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
              {t('profile.form.emailAddress')}
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => onFormDataChange('email', e.target.value)}
                className="pl-10 bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                disabled
                placeholder={t('profile.form.emailDisabledPlaceholder')}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('profile.form.emailHelper')}
            </p>
          </div>

          {/* Organization */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
              {t('profile.form.organization')}
            </label>
            <div className="relative">
              <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                value={profile?.organizationName || t('profile.form.orgLoading')}
                className="pl-10 bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                disabled
                placeholder={t('profile.form.orgPlaceholder')}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>{t('profile.form.orgHelper')}</span>
              {profile?.role && (
                <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                  {t(profile.role === 'admin' ? 'profile.roleAdmin' : profile.role === 'mechanic' ? 'profile.roleMechanic' : 'profile.roleMember')}
                </span>
              )}
            </div>
          </div>

          {/* Theme Preference */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
              {t('profile.form.themePreference')}
            </label>
            <div className="relative">
              <Palette className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <select
                value={formData.themePreference}
                onChange={(e) => onFormDataChange('themePreference', e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="system">{t('profile.form.themeSystem')}</option>
                <option value="light">{t('profile.form.themeLight')}</option>
                <option value="dark">{t('profile.form.themeDark')}</option>
              </select>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('profile.form.themeHelper')}
            </p>
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <Button
              type="submit"
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors duration-200"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? t('profile.form.savingChanges') : t('profile.form.saveProfile')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
})