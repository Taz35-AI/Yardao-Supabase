// src/hooks/features/useProfileLogic.ts - Fixed Implementation with proper typing
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { UserProfile } from '@/types'
import { supabase } from '@/lib/supabaseClient'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

export function useProfileLogic() {
  const { user } = useAuth()
  const t = useT()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  // Password visibility states
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Form data states
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    themePreference: 'system' as 'light' | 'dark' | 'system'
  })

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  // Load profile data
  useEffect(() => {
    if (!user) return

    const loadProfile = async () => {
      try {
        setLoading(true)
        let userProfile = await userProfileService.getProfile(user.uid)
        
        if (!userProfile) {
          // Create profile with proper structure for centralized types
          userProfile = await userProfileService.createProfile({
            uid: user.uid,
            displayName: user.displayName || '',
            email: user.email || '',
            organizationId: 'default',
            organizationName: 'Default Organization',
            themePreference: 'system',
            role: 'member',
            isActive: true, // Explicitly set default values
            isDeleted: false
          })
        }
        
        setProfile(userProfile as UserProfile)
        setFormData({
          displayName: userProfile.displayName || '',
          email: userProfile.email || '',
          themePreference: userProfile.themePreference || 'system'
        })
      } catch (err) {
        logger.error('Error loading profile:', err)
        setError(t('profile.msg.loadFail'))
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [user])

  // Clear messages on user interaction
  const clearMessages = useCallback(() => {
    if (error) setError('')
    if (success) setSuccess('')
  }, [error, success])

  // Form data handlers
  const handleFormDataChange = useCallback((field: string, value: string) => {
    clearMessages()
    setFormData(prev => ({ ...prev, [field]: value }))
  }, [clearMessages])

  const handlePasswordDataChange = useCallback((field: string, value: string) => {
    clearMessages()
    setPasswordData(prev => ({ ...prev, [field]: value }))
  }, [clearMessages])

  // Password visibility toggle with string parameter
  const handleTogglePasswordVisibility = useCallback((field: string) => {
    switch (field) {
      case 'current':
        setShowCurrentPassword(prev => !prev)
        break
      case 'new':
        setShowNewPassword(prev => !prev)
        break
      case 'confirm':
        setShowConfirmPassword(prev => !prev)
        break
      default:
        logger.log(`Unknown password field: ${field}`)
    }
  }, [])

  // Profile update handler
  const handleProfileUpdate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !profile) return

    try {
      setSaving(true)
      clearMessages()

      // Validate form data
      if (!formData.displayName.trim()) {
        setError(t('profile.msg.displayNameRequired'))
        return
      }

      // Update profile in Firestore
      await userProfileService.updateProfile(user.uid, {
        displayName: formData.displayName.trim(),
        themePreference: formData.themePreference
      })

      // Update auth profile if display name changed
      if (formData.displayName !== user.displayName) {
        await userProfileService.updateUserDisplayName(user, formData.displayName)
      }

      setSuccess(t('profile.msg.profileUpdated'))
      
      // Reload profile to get latest data
      const updatedProfile = await userProfileService.getProfile(user.uid)
      if (updatedProfile) {
        setProfile(updatedProfile as UserProfile)
      }

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      logger.error('Error updating profile:', err)
      setError(t('profile.msg.profileUpdateFail'))
    } finally {
      setSaving(false)
    }
  }, [user, profile, formData, clearMessages])

  // Password change handler
  const handlePasswordChange = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    try {
      setChangingPassword(true)
      clearMessages()

      // Validate passwords
      if (!passwordData.currentPassword) {
        setError(t('profile.msg.currentPwdRequired'))
        return
      }

      if (!passwordData.newPassword) {
        setError(t('profile.msg.newPwdRequired'))
        return
      }

      if (passwordData.newPassword.length < 6) {
        setError(t('profile.msg.pwdMinLength'))
        return
      }

      if (passwordData.newPassword !== passwordData.confirmPassword) {
        setError(t('profile.msg.pwdMismatch'))
        return
      }

      if (passwordData.currentPassword === passwordData.newPassword) {
        setError(t('profile.msg.pwdSameAsCurrent'))
        return
      }

      // Re-authenticate by verifying the current password (Supabase has no
      // explicit reauthenticate; a successful sign-in confirms it).
      const { error: reauthErr } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: passwordData.currentPassword,
      })
      if (reauthErr) {
        setError(t('profile.msg.currentPwdIncorrect'))
        return
      }

      // Update password
      const { error: pwErr } = await supabase.auth.updateUser({ password: passwordData.newPassword })
      if (pwErr) throw pwErr

      setSuccess(t('profile.msg.pwdChanged'))
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      logger.error('Error changing password:', err)
      if (err.code === 'auth/wrong-password') {
        setError(t('profile.msg.currentPwdIncorrect'))
      } else if (err.code === 'auth/weak-password') {
        setError(t('profile.msg.newPwdTooWeak'))
      } else if (err.code === 'auth/requires-recent-login') {
        setError(t('profile.msg.reauthRequired'))
      } else {
        setError(t('profile.msg.pwdChangeFail'))
      }
    } finally {
      setChangingPassword(false)
    }
  }, [user, passwordData, clearMessages])

  return {
    profile,
    loading,
    saving,
    changingPassword,
    error,
    success,
    formData,
    passwordData,
    showCurrentPassword,
    showNewPassword,
    showConfirmPassword,
    handleFormDataChange,
    handlePasswordDataChange,
    handleTogglePasswordVisibility,
    handleProfileUpdate,
    handlePasswordChange
  }
}