// src/app/profile/page.tsx
// Full-width layout matching other Yardao pages
'use client'

import React from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Navigation } from '@/components/Navigation'
import { ProfileForm } from '@/components/features/profile/ProfileForm'
import { PasswordForm } from '@/components/features/profile/PasswordForm'
import { UserActivitySection } from '@/components/features/profile/UserActivitySection'
import { useProfileLogic } from '@/hooks/features/useProfileLogic'
import { useT } from '@/lib/i18n'
import {
  AlertCircle, CheckCircle, User, Activity, Shield,
  Mail, Calendar as CalendarIcon, Building2
} from 'lucide-react'

const roleKey = (r?: string) =>
  r === 'admin' ? 'profile.roleAdmin' : r === 'mechanic' ? 'profile.roleMechanic' : 'profile.roleMember'

export default function ProfilePage() {
  const t = useT()
  const {
    profile, loading, saving, changingPassword,
    error, success,
    formData, passwordData,
    showCurrentPassword, showNewPassword, showConfirmPassword,
    handleFormDataChange, handlePasswordDataChange,
    handleTogglePasswordVisibility,
    handleProfileUpdate, handlePasswordChange
  } = useProfileLogic()

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-slate-800">
          <Navigation />
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-[#025940]" />
              <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">{t('profile.page.loading')}</span>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-slate-800">
        <Navigation />

        {/* Full-width: same pattern as fleet/dashboard — w-full, px-2 sm:px-4 lg:px-6 */}
        <div className="pt-0 w-full px-2 sm:px-4 lg:px-6 py-5 sm:py-7">

          {/* ── Page Header ── */}
          <div className="mb-4 sm:mb-5">
            <div className="flex items-center gap-3 mb-0.5">
              <div className="w-8 h-8 rounded-xl bg-[#012619] dark:bg-[#b3f243]/20 flex items-center justify-center shadow-sm flex-shrink-0">
                <User className="w-4 h-4 text-white dark:text-[#b3f243]" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#012619] dark:text-white tracking-tight">
                {t('profile.page.title')}
              </h1>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 pl-11">
              {t('profile.page.subtitle')}
            </p>
          </div>

          {/* ── Alerts ── */}
          {error && (
            <div className="mb-4 flex items-start gap-3 p-3.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-red-700 dark:text-red-300 font-medium">{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-4 flex items-start gap-3 p-3.5 rounded-xl bg-[#012619]/5 dark:bg-[#b3f243]/5 border border-[#025940]/20 dark:border-[#b3f243]/20">
              <CheckCircle className="w-4 h-4 text-[#025940] dark:text-[#b3f243] flex-shrink-0 mt-0.5" />
              <span className="text-sm text-[#025940] dark:text-[#72A68E] font-medium">{success}</span>
            </div>
          )}

          {/* ── Hero Profile Card ── */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/80 shadow-sm overflow-hidden mb-4">
            <div className="h-1 w-full bg-gradient-to-r from-[#012619] via-[#025940] to-[#72A68E]" />
            <div className="p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#012619] to-[#72A68E] flex items-center justify-center shadow-md">
                    <User className="w-7 h-7 text-white" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center ring-1 ring-white dark:ring-gray-800">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  </div>
                </div>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                      {profile?.displayName || t('profile.page.userFallback')}
                    </h2>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      profile?.role === 'admin'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                        : 'bg-[#012619]/10 text-[#025940] dark:bg-[#b3f243]/10 dark:text-[#b3f243]'
                    }`}>
                      {t(roleKey(profile?.role))}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {profile?.email}
                    </span>
                    <span className="flex items-center gap-1">
                      <CalendarIcon className="w-3 h-3" />
                      {t('profile.page.memberSince')} {profile?.createdAt
                        ? new Date(profile.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
                        : t('profile.page.unknown')}
                    </span>
                  </div>
                </div>

                {/* Org pill */}
                <div className="flex-shrink-0 rounded-xl border border-gray-200 dark:border-gray-700/60 px-3.5 py-2.5 bg-gray-50/80 dark:bg-gray-700/30">
                  <p className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-0.5">{t('profile.page.organisation')}</p>
                  <p className="font-bold text-sm text-gray-900 dark:text-white truncate max-w-[160px]">
                    {profile?.organizationName || t('profile.page.defaultOrg')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Stats Strip ── */}
          <div className="mb-4">
            <MicroAccountStats profile={profile} />
          </div>

          {/* ── 3-column grid ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Activity */}
            <div>
              <SectionHeader icon={Activity} label={t('profile.page.recentActivity')} dotColor="bg-emerald-500" />
              <UserActivitySection />
            </div>

            {/* Profile Form */}
            <div>
              <SectionHeader icon={User} label={t('profile.page.profileInformation')} dotColor="bg-[#025940]" />
              <ProfileForm
                formData={formData}
                profile={profile}
                saving={saving}
                onFormDataChange={handleFormDataChange}
                onSubmit={handleProfileUpdate}
              />
            </div>

            {/* Security */}
            <div>
              <SectionHeader icon={Shield} label={t('profile.page.securitySettings')} dotColor="bg-orange-500" />
              <PasswordForm
                passwordData={passwordData}
                changingPassword={changingPassword}
                showCurrentPassword={showCurrentPassword}
                showNewPassword={showNewPassword}
                showConfirmPassword={showConfirmPassword}
                onPasswordDataChange={handlePasswordDataChange}
                onTogglePasswordVisibility={handleTogglePasswordVisibility}
                onSubmit={handlePasswordChange}
              />
            </div>

          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}

// ── Section Header ─────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label, dotColor }: { icon: any; label: string; dotColor: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <div className={`w-1.5 h-4 rounded-full ${dotColor}`} />
      <div className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-gray-700/60 flex items-center justify-center">
        <Icon className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />
      </div>
      <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">{label}</h3>
    </div>
  )
}

// ── Stats Strip ────────────────────────────────────────────────────────
function MicroAccountStats({ profile }: { profile: any }) {
  const t = useT()
  if (!profile) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/80 h-[72px]" />
        ))}
      </div>
    )
  }

  const isActive = () => profile.isActive !== false && profile.isDeleted !== true

  const getAccountAge = () => {
    if (!profile.createdAt) return t('profile.page.ageUnknown')
    const days = Math.floor((Date.now() - new Date(profile.createdAt).getTime()) / 86400000)
    if (days < 1) return t('profile.page.ageLessThanDay')
    if (days < 7) return t('profile.page.ageDays', { count: days })
    if (days < 30) return t('profile.page.ageWeeks', { count: Math.floor(days / 7) })
    if (days < 365) return t('profile.page.ageMonths', { count: Math.floor(days / 30) })
    const y = Math.floor(days / 365), m = Math.floor((days % 365) / 30)
    return m > 0 ? t('profile.page.ageYearsMonths', { y, m }) : t('profile.page.ageYears', { count: y })
  }

  const stats = [
    { id: 'status', label: t('profile.page.statStatus'), value: isActive() ? t('profile.page.statActive') : t('profile.page.statInactive'), icon: CheckCircle, accent: isActive() ? '#10b981' : '#ef4444', valueCls: isActive() ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400' },
    { id: 'role', label: t('profile.page.statRole'), value: t(profile.role === 'admin' ? 'profile.roleAdminShort' : roleKey(profile.role)), icon: Shield, accent: profile.role === 'admin' ? '#ef4444' : '#025940', valueCls: profile.role === 'admin' ? 'text-red-600 dark:text-red-400' : 'text-[#025940] dark:text-[#72A68E]' },
    { id: 'memberFor', label: t('profile.page.statMemberFor'), value: getAccountAge(), icon: CalendarIcon, accent: '#41705c', valueCls: 'text-[#41705c] dark:text-[#72A68E]' },
    { id: 'org', label: t('profile.page.statOrganisation'), value: profile.organizationName?.split(' ')[0] || '—', icon: Building2, accent: '#025940', valueCls: 'text-[#025940] dark:text-[#72A68E]' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      {stats.map(stat => {
        const Icon = stat.icon
        return (
          <div key={stat.id} className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/80 overflow-hidden">
            <div className="h-0.5" style={{ backgroundColor: stat.accent }} />
            <div className="px-3.5 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{stat.label}</span>
                <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ backgroundColor: `${stat.accent}18` }}>
                  <Icon className="w-2.5 h-2.5" style={{ color: stat.accent }} />
                </div>
              </div>
              <p className={`text-sm font-bold truncate ${stat.valueCls}`}>{stat.value}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}