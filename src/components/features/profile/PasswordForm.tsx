// src/components/features/profile/PasswordForm.tsx
'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Lock, Save, Eye, EyeOff } from 'lucide-react'
import { useT } from '@/lib/i18n'

interface PasswordFormProps {
  passwordData: {
    currentPassword: string
    newPassword: string
    confirmPassword: string
  }
  showCurrentPassword: boolean
  showNewPassword: boolean
  showConfirmPassword: boolean
  changingPassword: boolean
  onPasswordDataChange: (field: string, value: string) => void
  onTogglePasswordVisibility: (field: string) => void
  onSubmit: (e: React.FormEvent) => void
  className?: string
}

export const PasswordForm = React.memo(function PasswordForm({
  passwordData,
  showCurrentPassword,
  showNewPassword,
  showConfirmPassword,
  changingPassword,
  onPasswordDataChange,
  onTogglePasswordVisibility,
  onSubmit,
  className = ''
}: PasswordFormProps) {
  const t = useT()
  return (
    <Card className={`bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-all duration-300 ${className}`}>
      <CardHeader className="pb-6">
        <CardTitle className="flex items-center text-xl font-bold text-gray-900 dark:text-white">
          <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center mr-3">
            <Lock className="w-4 h-4 text-orange-600 dark:text-orange-400" />
          </div>
          {t('profile.password.title')}
        </CardTitle>
        <CardDescription className="text-gray-600 dark:text-gray-300">
          {t('profile.password.description')}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <form onSubmit={onSubmit} className="space-y-5">
          {/* Current Password */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
              {t('profile.password.currentPassword')}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type={showCurrentPassword ? 'text' : 'password'}
                value={passwordData.currentPassword}
                onChange={(e) => onPasswordDataChange('currentPassword', e.target.value)}
                className="pl-10 pr-10 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                placeholder={t('profile.password.currentPlaceholder')}
                required
              />
              <button
                type="button"
                onClick={() => onTogglePasswordVisibility('current')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
              {t('profile.password.newPassword')}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type={showNewPassword ? 'text' : 'password'}
                value={passwordData.newPassword}
                onChange={(e) => onPasswordDataChange('newPassword', e.target.value)}
                className="pl-10 pr-10 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                placeholder={t('profile.password.newPlaceholder')}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => onTogglePasswordVisibility('new')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('profile.password.minHelper')}
            </p>
          </div>

          {/* Confirm New Password */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
              {t('profile.password.confirmPassword')}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type={showConfirmPassword ? 'text' : 'password'}
                value={passwordData.confirmPassword}
                onChange={(e) => onPasswordDataChange('confirmPassword', e.target.value)}
                className="pl-10 pr-10 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                placeholder={t('profile.password.confirmPlaceholder')}
                required
              />
              <button
                type="button"
                onClick={() => onTogglePasswordVisibility('confirm')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <Button
              type="submit"
              disabled={changingPassword}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-2.5 rounded-lg transition-colors duration-200"
            >
              <Save className="w-4 h-4 mr-2" />
              {changingPassword ? t('profile.password.changing') : t('profile.password.changePassword')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
})