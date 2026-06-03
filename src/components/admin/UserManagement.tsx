// src/components/admin/UserManagement.tsx — premium dense layout
'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { supabase } from '@/lib/supabaseClient'
import { UserProfile, isUserActive, isUserDeleted } from '@/types'
import { formatLastLogin } from '@/utils/dateUtils'
import {
  Users, Plus, Mail, Lock, Shield, User, Copy, Check, AlertCircle,
  Trash2, Loader2, RefreshCw, Eye, EyeOff, Clock, X, Wrench,
} from 'lucide-react'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

// ─── shared classes (same fonts/inputs across all org settings tabs) ─────────
const inputCls = 'w-full h-9 px-3 text-sm border border-[#e2e8e5] dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-[#012619] dark:text-white placeholder-[#c8d5ce] focus:outline-none focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940]'
const labelCls = 'block text-[11px] uppercase tracking-widest font-semibold text-[#8a9e94] mb-1.5'
const primaryBtnCls = 'h-9 px-4 text-[13px] font-medium rounded-lg bg-[#025940] hover:bg-[#012619] disabled:opacity-60 text-white inline-flex items-center gap-1.5 transition-colors'
const ghostBtnCls = 'h-9 px-3 text-[13px] font-medium rounded-lg text-[#012619] dark:text-gray-200 hover:bg-[#e2e8e5] dark:hover:bg-gray-700 transition-colors inline-flex items-center gap-1'
const iconBtnCls = 'w-7 h-7 rounded-md inline-flex items-center justify-center text-[#8a9e94] hover:bg-[#C5D9D0]/40 dark:hover:bg-gray-700 transition-colors'

function UserManagement() {
  const t = useT()
  const { user } = useAuth()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [showPassword, setShowPassword] = useState(true)
  const [recentlyCreatedUsers, setRecentlyCreatedUsers] = useState<Array<{
    email: string
    password: string
    displayName: string
    createdAt: Date
  }>>([])
  const [deletingUser, setDeletingUser] = useState<string | null>(null)
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null)
  const [savingRoleFor, setSavingRoleFor] = useState<string | null>(null)

  const [newUser, setNewUser] = useState<{
    email: string
    displayName: string
    temporaryPassword: string
    role: 'member' | 'mechanic'
  }>({ email: '', displayName: '', temporaryPassword: '', role: 'member' })

  useEffect(() => {
    if (success && !success.includes('User created successfully')) {
      const timer = setTimeout(() => setSuccess(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [success])

  useEffect(() => {
    if (error && !error.includes('permission')) {
      const timer = setTimeout(() => setError(''), 8000)
      return () => clearTimeout(timer)
    }
  }, [error])

  useEffect(() => {
    const cleanup = () => {
      const now = new Date()
      setRecentlyCreatedUsers(prev =>
        prev.filter(u => (now.getTime() - u.createdAt.getTime()) / (1000 * 60 * 60) < 24)
      )
    }
    const interval = setInterval(cleanup, 60 * 60 * 1000)
    cleanup()
    return () => clearInterval(interval)
  }, [])

  const loadData = async (showLoading = true) => {
    if (!user) return
    try {
      if (showLoading) setLoading(true)
      setError('')
      const profile = await userProfileService.getProfile(user.uid)
      if (!profile) {
        setError(t('settings.users.profileNotFound'))
        return
      }
      setUserProfile(profile)
      if (profile.role === 'admin' && profile.organizationId) {
        try {
          const orgUsers = await userProfileService.getUsersByOrganization(profile.organizationId)
          setUsers(orgUsers.filter(u => !isUserDeleted(u)))
        } catch (userLoadError) {
          logger.error('Error loading organization users:', userLoadError)
          setError(t('settings.users.loadUsersFail'))
        }
      } else if (profile.role !== 'admin') {
        setError('You do not have admin permissions to manage users.')
      } else {
        setError(t('settings.users.noOrgFound'))
      }
    } catch (err) {
      logger.error('Error loading profile:', err)
      setError(t('settings.users.loadProfileFail'))
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [user])

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%'
    let password = ''
    for (let i = 0; i < 12; i++) password += chars.charAt(Math.floor(Math.random() * chars.length))
    setNewUser(prev => ({ ...prev, temporaryPassword: password }))
  }

  const handleToggleUserStatus = async (userItem: UserProfile) => {
    if (!userProfile || userProfile.role !== 'admin') return setError('No permission')
    if (userItem.role === 'admin') return setError(t('settings.users.cannotDeactivateAdmin'))
    try {
      setDeletingUser(userItem.uid)
      const newStatus = !isUserActive(userItem)
      await userProfileService.updateProfile(userItem.uid, { isActive: newStatus })
      setSuccess(t('settings.users.userStatusChanged', { status: t(newStatus ? 'settings.users.statusActivated' : 'settings.users.statusDeactivated') }))
      setTimeout(() => setSuccess(''), 3000)
      await loadData(false)
    } catch (err) {
      logger.error('Error updating user status:', err)
      setError(t('settings.users.updateStatusFail'))
    } finally {
      setDeletingUser(null)
    }
  }

  const handleRoleChange = async (userItem: UserProfile, newRole: 'admin' | 'member' | 'mechanic') => {
    if (!userProfile || userProfile.role !== 'admin') return setError('No permission')
    if (newRole === userItem.role) return

    // Block self-edit (would lock you out)
    if (userItem.uid === user?.uid) {
      setError(t('settings.users.cannotChangeOwnRoleErr'))
      return
    }

    // Last-admin protection
    const adminCount = users.filter(u => u.role === 'admin' && isUserActive(u)).length
    if (userItem.role === 'admin' && newRole !== 'admin' && adminCount <= 1) {
      setError(t('settings.users.cannotDemoteLastAdminErr'))
      return
    }

    // High-impact transitions get a confirmation
    const isAdminTransition = userItem.role === 'admin' || newRole === 'admin'
    if (isAdminTransition) {
      const message = newRole === 'admin'
        ? `Promote "${userItem.displayName}" to admin?\n\nAdmins have full access including user management, settings, and the ability to delete data.`
        : `Demote "${userItem.displayName}" from admin to ${newRole}?\n\nThey will lose access to user management and other admin-only features.`
      if (!window.confirm(message)) return
    }

    try {
      setSavingRoleFor(userItem.uid)
      setError('')
      await userProfileService.updateProfile(userItem.uid, { role: newRole })
      setSuccess(t('settings.users.roleUpdatedTo', { role: t('settings.role.' + (({ 'admin': 'admin', 'member': 'member', 'mechanic': 'mechanic' } as any)[newRole] || 'member')) }))
      setTimeout(() => setSuccess(''), 3000)
      await loadData(false)
    } catch (err) {
      logger.error('Error updating user role:', err)
      setError(t('settings.users.updateRoleFail'))
    } finally {
      setSavingRoleFor(null)
    }
  }

  const handleDeleteUser = async () => {
    if (!userProfile || userProfile.role !== 'admin' || !userToDelete) return
    if (userToDelete.role === 'admin') {
      setError(t('settings.users.cannotDeleteAdmin'))
      setUserToDelete(null)
      return
    }
    try {
      setDeletingUser(userToDelete.uid)
      await userProfileService.updateProfile(userToDelete.uid, {
        isActive: false,
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: user!.uid,
      })
      setSuccess(t('settings.users.userDeleted', { name: userToDelete.displayName }))
      setTimeout(() => setSuccess(''), 3000)
      setUserToDelete(null)
      await loadData(false)
    } catch (err) {
      logger.error('Error deleting user:', err)
      setError(t('settings.users.deleteUserFail'))
    } finally {
      setDeletingUser(null)
    }
  }

  const copyToClipboard = async (text: string, type: 'email' | 'creds') => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'email') {
        setCopiedEmail(text)
        setTimeout(() => setCopiedEmail(null), 2000)
      }
    } catch (err) {
      logger.error('Failed to copy:', err)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userProfile || userProfile.role !== 'admin') return setError('No permission')
    if (!newUser.email.trim() || !newUser.displayName.trim() || !newUser.temporaryPassword.trim()) {
      return setError(t('settings.users.fillAllFields'))
    }
    if (!newUser.email.includes('@')) return setError(t('settings.users.invalidEmail'))
    if (newUser.temporaryPassword.length < 6) return setError(t('settings.users.passwordTooShort'))

    setCreating(true)
    setError('')
    setSuccess('')

    try {
      // Supabase cannot create auth users from the client without the
      // service-role key, so creating the new account (without logging the
      // current admin out — the old Firebase "secondary app" trick) is done by
      // a privileged Edge Function that runs with the service role.
      // TODO(phase5): admin-create-user edge function (service role) not deployed yet
      const { data: createResult, error: createError } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: newUser.email.trim(),
          displayName: newUser.displayName.trim(),
          temporaryPassword: newUser.temporaryPassword,
          organizationId: userProfile.organizationId,
          organizationName: userProfile.organizationName || '',
          createdBy: user!.uid,
        },
      })
      if (createError) throw createError

      const createdUid = (createResult as any)?.uid ?? (createResult as any)?.id ?? (createResult as any)?.user?.id
      if (!createdUid) throw new Error('Failed to create user')

      const newUserProfile = {
        uid: createdUid,
        displayName: newUser.displayName.trim(),
        email: newUser.email.trim(),
        organizationId: userProfile.organizationId,
        organizationName: userProfile.organizationName || '',
        role: newUser.role,
        requiresPasswordReset: false,
        isActive: true,
        isDeleted: false,
        createdBy: user!.uid,
        themePreference: 'system' as const,
      }
      await userProfileService.createProfile(newUserProfile)

      setRecentlyCreatedUsers(prev => [
        { email: newUser.email.trim(), password: newUser.temporaryPassword, displayName: newUser.displayName.trim(), createdAt: new Date() },
        ...prev,
      ])
      setSuccess(`User created successfully! Credentials saved below (24h).`)
      setNewUser({ email: '', displayName: '', temporaryPassword: '', role: 'member' })
      setShowCreateForm(false)
      await loadData(false)
    } catch (err: any) {
      logger.error('Error creating user:', err)
      if (err.code === 'auth/email-already-in-use') setError('An account with this email already exists')
      else if (err.code === 'auth/invalid-email')   setError('Please enter a valid email address')
      else if (err.code === 'auth/weak-password')   setError('Password is too weak')
      else if (err.code === 'auth/network-request-failed') setError('Network error. Please check your connection.')
      else setError(err.message || 'Failed to create user.')
    } finally {
      setCreating(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#025940] border-t-transparent" />
      </div>
    )
  }

  if (!userProfile || userProfile.role !== 'admin') {
    return (
      <div className="max-w-4xl px-4 sm:px-6 py-6">
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-900/10 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-900 dark:text-amber-300">{t('settings.users.adminRequired')}</p>
            <p className="text-[12.5px] text-amber-700 dark:text-amber-400 mt-0.5">{t('settings.users.adminRequiredBody')}</p>
          </div>
        </div>
      </div>
    )
  }

  const adminCount = users.filter(u => u.role === 'admin').length
  const inactiveCount = users.filter(u => !isUserActive(u)).length

  return (
    <div className="max-w-4xl px-4 sm:px-6 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-[#012619] dark:text-white tracking-tight">
            {t('settings.users.team')}
          </h3>
          <p className="text-[12.5px] text-[#8a9e94] mt-0.5">
            {t(users.length === 1 ? 'settings.users.userOne' : 'settings.users.userMany', { count: users.length })} {t('settings.users.inOrg')} {userProfile.organizationName}
            {adminCount > 0 && <span>{t(adminCount === 1 ? 'settings.users.adminOne' : 'settings.users.adminMany', { count: adminCount })}</span>}
            {inactiveCount > 0 && <span>{t('settings.users.inactiveSuffix', { count: inactiveCount })}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => loadData()}
            disabled={loading}
            title={t('settings.common.refresh')}
            aria-label={t('settings.common.refresh')}
            className={iconBtnCls}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {!showCreateForm && (
            <button onClick={() => setShowCreateForm(true)} className={primaryBtnCls}>
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              {t('settings.users.addUser')}
            </button>
          )}
        </div>
      </div>

      {/* Error / success banners */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-900/10 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-[12.5px] text-red-700 dark:text-red-300 leading-relaxed flex-1">{error}</p>
          <button onClick={() => setError('')} className="text-red-600/60 hover:text-red-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 dark:border-green-900/40 bg-green-50/60 dark:bg-green-900/10 p-3 flex items-start gap-2">
          <Check className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-[12.5px] text-green-700 dark:text-green-300 leading-relaxed flex-1">{success}</p>
        </div>
      )}

      {/* Create user form */}
      {showCreateForm && (
        <form onSubmit={handleCreateUser} className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('settings.users.fullName')}</label>
              <input
                type="text"
                value={newUser.displayName}
                onChange={(e) => setNewUser(prev => ({ ...prev, displayName: e.target.value }))}
                placeholder={t('settings.users.namePlaceholder')}
                required
                className={inputCls}
                autoFocus
              />
            </div>
            <div>
              <label className={labelCls}>{t('settings.users.email')}</label>
              <input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                placeholder={t('settings.users.emailPlaceholder')}
                required
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>{t('settings.users.roleLabel')}</label>
            <select
              value={newUser.role}
              onChange={(e) => setNewUser(prev => ({ ...prev, role: e.target.value as 'member' | 'mechanic' }))}
              className={`${inputCls} cursor-pointer pr-8`}
            >
              <option value="member">{t('settings.users.roleMemberOpt')}</option>
              <option value="mechanic">{t('settings.users.roleMechanicOpt')}</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>{t('settings.users.tempPassword')}</label>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a9e94] w-3.5 h-3.5 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newUser.temporaryPassword}
                  onChange={(e) => setNewUser(prev => ({ ...prev, temporaryPassword: e.target.value }))}
                  placeholder={t('settings.users.passwordPlaceholder')}
                  required
                  className={`${inputCls} pl-9 pr-9 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8a9e94] hover:text-[#025940]"
                  aria-label={showPassword ? t('settings.users.hidePassword') : t('settings.users.showPassword')}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button type="button" onClick={generatePassword} className={ghostBtnCls}>
                {t('settings.users.generate')}
              </button>
            </div>
            <p className="text-[11px] text-[#8a9e94] mt-1">
              {t('settings.users.passwordHint')}
            </p>
          </div>

          <div className="flex items-center gap-1.5 pt-1">
            <button type="submit" disabled={creating} className={primaryBtnCls}>
              {creating ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" />{t('settings.users.creating')}</>
              ) : (
                <><Check className="w-4 h-4" strokeWidth={2.5} />{t('settings.users.createUser')}</>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false)
                setNewUser({ email: '', displayName: '', temporaryPassword: '', role: 'member' })
                setError('')
              }}
              className={ghostBtnCls}
            >
              <X className="w-3.5 h-3.5" />
              {t('settings.common.cancel')}
            </button>
          </div>
        </form>
      )}

      {/* Recently created credentials — 24h reference */}
      {recentlyCreatedUsers.length > 0 && (
        <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#e2e8e5] dark:border-gray-700 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-[#025940]" />
            <span className="text-[12px] uppercase tracking-widest font-semibold text-[#8a9e94]">
              {t('settings.users.recentlyCreated')}
            </span>
          </div>
          <ul className="divide-y divide-[#e2e8e5] dark:divide-gray-700">
            {recentlyCreatedUsers.map((cred, index) => (
              <li key={index} className="px-3 sm:px-4 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[#012619] dark:text-white truncate">
                    {cred.displayName}
                  </div>
                  <div className="text-[12px] text-[#8a9e94] truncate">{cred.email}</div>
                </div>
                <code className="text-[11px] bg-[#f5f9f7] dark:bg-gray-800 text-[#012619] dark:text-gray-200 px-2 py-1 rounded font-mono">
                  {cred.password}
                </code>
                <button
                  onClick={() => copyToClipboard(`Email: ${cred.email}\nPassword: ${cred.password}`, 'creds')}
                  aria-label={t('settings.users.copyCredentials')}
                  title={t('settings.users.copyCredentials')}
                  className={iconBtnCls}
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Users list */}
      <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        {users.length === 0 ? (
          <div className="text-center py-12 px-6">
            <Users className="w-8 h-8 text-[#c8d5ce] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#012619] dark:text-white">{t('settings.users.emptyTitle')}</p>
            <p className="text-[12.5px] text-[#8a9e94] mt-1">{t('settings.users.emptyBody')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#e2e8e5] dark:divide-gray-700">
            {users.map((userItem) => {
              const active = isUserActive(userItem)
              const isAdmin = userItem.role === 'admin'
              const isMechanic = userItem.role === 'mechanic'
              const isSelf = userItem.uid === user?.uid
              const activeAdminCount = users.filter(u => u.role === 'admin' && isUserActive(u)).length
              const isLastAdmin = isAdmin && activeAdminCount <= 1
              const roleLocked = isSelf || isLastAdmin

              const RoleIcon = isAdmin ? Shield : isMechanic ? Wrench : User
              const roleIconCls =
                isAdmin    ? 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20' :
                isMechanic ? 'text-[#025940] bg-[#C5D9D0]/40 dark:text-[#72A68E] dark:bg-[#025940]/20' :
                             'text-[#8a9e94] bg-[#f5f9f7] dark:bg-gray-800'

              const roleChipCls =
                isAdmin    ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' :
                isMechanic ? 'bg-[#C5D9D0]/40 text-[#025940] dark:bg-[#025940]/30 dark:text-[#72A68E]' :
                             'bg-[#f5f9f7] text-[#5a6c64] dark:bg-gray-800 dark:text-gray-400'

              const selectCls =
                isAdmin    ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-900/40' :
                isMechanic ? 'bg-[#C5D9D0]/40 text-[#025940] border-[#C5D9D0] dark:bg-[#025940]/30 dark:text-[#72A68E] dark:border-[#025940]/50' :
                             'bg-[#f5f9f7] text-[#5a6c64] border-[#e2e8e5] dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'

              return (
                <li key={userItem.uid} className="group">
                  <div className={`flex items-start gap-3 px-3 sm:px-4 py-3 hover:bg-[#f5f9f7] dark:hover:bg-gray-800/40 transition-colors ${!active ? 'opacity-60' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${roleIconCls}`}>
                      <RoleIcon className="w-3.5 h-3.5" />
                    </div>

                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13.5px] font-medium text-[#012619] dark:text-white truncate">
                          {userItem.displayName}
                        </span>

                        {/* Role: editable inline select, or locked chip */}
                        {roleLocked ? (
                          <span
                            title={isSelf ? t('settings.users.cantChangeOwnRole') : t('settings.users.cantDemoteLastAdmin')}
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${roleChipCls}`}
                          >
                            {t('settings.role.' + (({ 'admin': 'admin', 'member': 'member', 'mechanic': 'mechanic' } as any)[userItem.role] || 'member'))}
                            {isLastAdmin && !isSelf && <Lock className="w-2.5 h-2.5 ml-1 opacity-70" />}
                          </span>
                        ) : (
                          <select
                            value={userItem.role}
                            onChange={(e) => handleRoleChange(userItem, e.target.value as 'admin' | 'member' | 'mechanic')}
                            disabled={savingRoleFor === userItem.uid}
                            aria-label={t('settings.users.changeRole')}
                            className={`h-5 pl-1.5 pr-5 rounded text-[10px] font-semibold uppercase tracking-wider border cursor-pointer disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#025940]/30 transition-colors ${selectCls}`}
                          >
                            <option value="member">{t('settings.role.member')}</option>
                            <option value="mechanic">{t('settings.role.mechanic')}</option>
                            <option value="admin">{t('settings.role.admin')}</option>
                          </select>
                        )}

                        {savingRoleFor === userItem.uid && (
                          <Loader2 className="w-3 h-3 animate-spin text-[#025940]" />
                        )}

                        {!active && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[#e2e8e5] text-[#8a9e94] dark:bg-gray-700 dark:text-gray-400">
                            {t('settings.users.inactiveBadge')}
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-[#5a6c64] dark:text-gray-400 truncate inline-flex items-center gap-1">
                        <Mail className="w-3 h-3 flex-shrink-0" />
                        {userItem.email}
                        {copiedEmail === userItem.email && (
                          <span className="text-green-600 dark:text-green-400 inline-flex items-center gap-0.5 ml-1">
                            <Check className="w-3 h-3" />
                            {t('settings.users.copied')}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#8a9e94]">
                        {t('settings.users.lastLogin')} {formatLastLogin(userItem.lastLoginAt)}
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => copyToClipboard(userItem.email, 'email')}
                        aria-label={t('settings.users.copyEmail')}
                        title={t('settings.users.copyEmail')}
                        className={`${iconBtnCls} hover:text-[#025940]`}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {!isAdmin && (
                        <>
                          <button
                            onClick={() => handleToggleUserStatus(userItem)}
                            disabled={deletingUser === userItem.uid}
                            aria-label={active ? t('settings.users.deactivate') : t('settings.users.activate')}
                            title={active ? t('settings.users.deactivate') : t('settings.users.activate')}
                            className={`${iconBtnCls} hover:text-[#025940]`}
                          >
                            {deletingUser === userItem.uid ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : active ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => setUserToDelete(userItem)}
                            disabled={deletingUser === userItem.uid}
                            aria-label={t('settings.users.deleteUser')}
                            className={`${iconBtnCls} hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Delete confirmation modal */}
      {userToDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-[#e2e8e5] dark:border-gray-700 p-5 max-w-sm w-full shadow-xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-4 h-4 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-semibold text-[#012619] dark:text-white">{t('settings.users.deleteTitle')}</h3>
                <p className="text-[12.5px] text-[#5a6c64] dark:text-gray-400 mt-1">
                  {t('settings.users.deleteBodyPre')}<span className="font-medium text-[#012619] dark:text-white">{userToDelete.displayName}</span> ({userToDelete.email}){t('settings.users.deleteBodyPost')}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <button onClick={() => setUserToDelete(null)} className={ghostBtnCls}>
                {t('settings.common.cancel')}
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deletingUser === userToDelete.uid}
                className="h-9 px-4 text-[13px] font-medium rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white inline-flex items-center gap-1.5 transition-colors"
              >
                {deletingUser === userToDelete.uid ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                {t('settings.common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UserManagement
