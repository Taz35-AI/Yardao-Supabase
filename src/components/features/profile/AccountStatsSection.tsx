// src/components/features/profile/AccountStatsSection.tsx
'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { UserProfile } from '@/types'
import { useT } from '@/lib/i18n'
import { 
  Shield, 
  Calendar, 
  Building, 
  Mail,
  CheckCircle,
  AlertCircle,
  Clock,
  Users
} from 'lucide-react'

interface AccountStatsSectionProps {
  profile: UserProfile | null
}

export function AccountStatsSection({ profile }: AccountStatsSectionProps) {
  const t = useT()
  if (!profile) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      case 'member':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  const getAccountAge = () => {
    if (!profile.createdAt) return t('profile.stats.memberSinceUnknown')

    const createdDate = new Date(profile.createdAt)
    const now = new Date()
    const diffInDays = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24))

    if (diffInDays < 1) return t('profile.stats.today')
    if (diffInDays < 7) return t(diffInDays === 1 ? 'profile.stats.dayOne' : 'profile.stats.dayMany', { count: diffInDays })
    if (diffInDays < 30) {
      const weeks = Math.floor(diffInDays / 7)
      return t(weeks === 1 ? 'profile.stats.weekOne' : 'profile.stats.weekMany', { count: weeks })
    }
    if (diffInDays < 365) {
      const months = Math.floor(diffInDays / 30)
      return t(months === 1 ? 'profile.stats.monthOne' : 'profile.stats.monthMany', { count: months })
    }

    const years = Math.floor(diffInDays / 365)
    return t(years === 1 ? 'profile.stats.yearOne' : 'profile.stats.yearMany', { count: years })
  }

  const isAccountActive = () => {
    return profile.isActive !== false && profile.isDeleted !== true
  }

  const isEmailVerified = () => {
    return profile.emailVerified === true
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Account Status */}
      <Card className={`${isAccountActive() ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${isAccountActive() ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {t('profile.stats.accountStatus')}
              </p>
              <div className="flex items-center space-x-2 mt-1">
                <Badge className={isAccountActive() ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}>
                  {isAccountActive() ? t('profile.stats.active') : t('profile.stats.inactive')}
                </Badge>
              </div>
            </div>
            <div className={`w-8 h-8 ${isAccountActive() ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'} rounded-lg flex items-center justify-center`}>
              {isAccountActive() ? (
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              )}
            </div>
          </div>
          <p className={`text-xs mt-1 ${isAccountActive() ? 'text-green-600/70 dark:text-green-400/70' : 'text-red-600/70 dark:text-red-400/70'}`}>
            {isAccountActive() ? t('profile.stats.fullAccessEnabled') : t('profile.stats.contactAdmin')}
          </p>
        </CardContent>
      </Card>

      {/* User Role */}
      <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400">{t('profile.stats.userRole')}</p>
              <div className="flex items-center space-x-2 mt-1">
                <Badge className={getRoleColor(profile.role)}>
                  {t(profile.role === 'admin' ? 'profile.roleAdmin' : profile.role === 'mechanic' ? 'profile.roleMechanic' : 'profile.roleMember')}
                </Badge>
              </div>
            </div>
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              {profile.role === 'admin' ? (
                <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              ) : (
                <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              )}
            </div>
          </div>
          <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-1">
            {profile.role === 'admin' ? t('profile.stats.fullSystemAccess') : t('profile.stats.standardAccess')}
          </p>
        </CardContent>
      </Card>

      {/* Account Age */}
      <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-purple-600 dark:text-purple-400">{t('profile.stats.memberSince')}</p>
              <p className="text-lg font-bold text-purple-900 dark:text-purple-100">
                {getAccountAge()}
              </p>
            </div>
            <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <Calendar className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          <p className="text-xs text-purple-600/70 dark:text-purple-400/70 mt-1">
            {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : t('profile.stats.unknownDate')}
          </p>
        </CardContent>
      </Card>

      {/* Organization Info */}
      <Card className="bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 md:col-span-2">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{t('profile.stats.organization')}</p>
              <p className="text-lg font-bold text-indigo-900 dark:text-indigo-100 mt-1">
                {profile.organizationName || t('profile.stats.unknownOrg')}
              </p>
              <p className="text-xs text-indigo-600/70 dark:text-indigo-400/70 mt-1">
                {t('profile.stats.orgIdPrefix')} {profile.organizationId}
              </p>
            </div>
            <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
              <Building className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Last Updated */}
      <Card className="bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('profile.stats.profileLastUpdated')}</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">
                {profile.updatedAt ? new Date(profile.updatedAt).toLocaleDateString() : t('profile.stats.neverUpdated')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                {profile.updatedAt ? new Date(profile.updatedAt).toLocaleTimeString() : t('profile.stats.originalProfileData')}
              </p>
            </div>
            <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              <Clock className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}