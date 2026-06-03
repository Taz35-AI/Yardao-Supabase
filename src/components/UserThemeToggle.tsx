'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { Button } from '@/components/ui/Button'
import { Sun, Moon, Monitor } from 'lucide-react'
import { logger } from '@/lib/logger'

export function UserThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()
  const { user } = useAuth()
  const [userTheme, setUserTheme] = useState<'light' | 'dark' | 'system'>('system')

  useEffect(() => {
    setMounted(true)
    
    // Load user's theme preference
    const loadUserTheme = async () => {
      if (!user) return
      
      try {
        const profile = await userProfileService.getProfile(user.uid)
        if (profile?.themePreference) {
          setUserTheme(profile.themePreference)
          setTheme(profile.themePreference)
        }
      } catch (error) {
        logger.error('Error loading user theme:', error)
      }
    }

    loadUserTheme()
  }, [user, setTheme])

  const cycleTheme = async () => {
    if (!user) return

    const themeOrder: ('light' | 'dark' | 'system')[] = ['light', 'dark', 'system']
    const currentIndex = themeOrder.indexOf(userTheme)
    const nextTheme = themeOrder[(currentIndex + 1) % themeOrder.length]

    setUserTheme(nextTheme)
    setTheme(nextTheme)

    // Save to user profile
    try {
      await userProfileService.updateProfile(user.uid, {
        themePreference: nextTheme
      })
    } catch (error) {
      logger.error('Error saving theme preference:', error)
    }
  }

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="w-10 h-10">
        <div className="w-5 h-5" />
      </Button>
    )
  }

  const getThemeIcon = () => {
    switch (userTheme) {
      case 'light':
        return <Sun className="w-5 h-5 text-yellow-500" />
      case 'dark':
        return <Moon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
      case 'system':
      default:
        return <Monitor className="w-5 h-5 text-gray-700 dark:text-gray-300" />
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      className="w-10 h-10"
      title={`Current theme: ${userTheme} (click to cycle)`}
    >
      {getThemeIcon()}
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}