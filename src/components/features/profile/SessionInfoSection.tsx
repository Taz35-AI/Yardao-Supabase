// src/components/features/profile/SessionInfoSection.tsx
'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useAuth } from '@/contexts/AuthContext'
import { 
  Monitor, 
  Smartphone, 
  Wifi, 
  MapPin, 
  Clock,
  Shield,
  Globe,
  RefreshCw,
  LogOut
} from 'lucide-react'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

interface SessionInfo {
  device: string
  browser: string
  os: string
  ip: string
  location: string
  lastActive: Date
  currentSession: boolean
}


export function SessionInfoSection() {
  const t = useT()
  const { user, logout } = useAuth()
  const [sessionInfo, setSessionInfo] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(false)

  // Mock session data (in a real app, this would come from your backend)
  useEffect(() => {
    const mockSessions: SessionInfo[] = [
      {
        device: 'Desktop',
        browser: 'Chrome 120',
        os: 'Windows 11',
        ip: '192.168.1.100',
        location: 'London, UK',
        lastActive: new Date(),
        currentSession: true
      },
      // You could add more sessions here from your backend
    ]
    
    setSessionInfo(mockSessions)
  }, [])

  const getDeviceIcon = (device: string) => {
    if (device.toLowerCase().includes('mobile') || device.toLowerCase().includes('phone')) {
      return <Smartphone className="w-4 h-4" />
    }
    return <Monitor className="w-4 h-4" />
  }

  const formatLastActive = (date: Date) => {
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return t('profile.session.activeNow')
    if (diffInMinutes < 60) return t('profile.session.minAgo', { count: diffInMinutes })

    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) return t('profile.session.hourAgo', { count: diffInHours })

    const diffInDays = Math.floor(diffInHours / 24)
    return t('profile.session.dayAgo', { count: diffInDays })
  }

  const handleLogoutEverywhere = async () => {
    if (window.confirm(t('profile.session.confirmLogoutAll'))) {
      try {
        await logout()
      } catch (error) {
        logger.error('Error logging out:', error)
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Security Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600 dark:text-green-400">{t('profile.session.securityStatus')}</p>
                <p className="text-lg font-bold text-green-900 dark:text-green-100">{t('profile.session.secure')}</p>
              </div>
              <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <p className="text-xs text-green-600/70 dark:text-green-400/70 mt-1">{t('profile.session.allSystemsSecure')}</p>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400">{t('profile.session.activeSessions')}</p>
                <p className="text-lg font-bold text-blue-900 dark:text-blue-100">{sessionInfo.length}</p>
              </div>
              <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Wifi className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-1">{t('profile.session.currentDeviceSessions')}</p>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600 dark:text-purple-400">{t('profile.session.lastLogin')}</p>
                <p className="text-lg font-bold text-purple-900 dark:text-purple-100">{t('profile.session.today')}</p>
              </div>
              <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            <p className="text-xs text-purple-600/70 dark:text-purple-400/70 mt-1">
              {new Date().toLocaleTimeString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center">
                <Monitor className="w-5 h-5 mr-2 text-gray-600 dark:text-gray-400" />
                {t('profile.session.activeSessionsTitle')}
              </CardTitle>
              <CardDescription>
                {t('profile.session.activeSessionsDesc')}
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setLoading(!loading)}
                disabled={loading}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                {t('profile.session.refresh')}
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleLogoutEverywhere}
                className="flex items-center gap-2 text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-600 dark:hover:bg-red-900/20"
              >
                <LogOut className="w-4 h-4" />
                {t('profile.session.logoutAll')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sessionInfo.map((session, index) => (
              <div 
                key={index}
                className={`p-4 rounded-lg border ${session.currentSession 
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' 
                  : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${session.currentSession 
                      ? 'bg-blue-100 dark:bg-blue-900/30' 
                      : 'bg-gray-100 dark:bg-gray-700'
                    }`}>
                      {getDeviceIcon(session.device)}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {session.device} • {session.browser}
                        </p>
                        {session.currentSession && (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs">
                            {t('profile.session.currentSession')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400 mt-1">
                        <div className="flex items-center space-x-1">
                          <Globe className="w-3 h-3" />
                          <span>{session.os}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <MapPin className="w-3 h-3" />
                          <span>{session.location}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Wifi className="w-3 h-3" />
                          <span>{session.ip}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {formatLastActive(session.lastActive)}
                    </p>
                    {!session.currentSession && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2 text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-600 dark:hover:bg-red-900/20"
                      >
                        {t('profile.session.revoke')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Security Tips */}
      <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
        <CardHeader>
          <CardTitle className="flex items-center text-yellow-800 dark:text-yellow-200">
            <Shield className="w-5 h-5 mr-2" />
            {t('profile.session.securityTips')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-yellow-800 dark:text-yellow-200">
            <li className="flex items-start space-x-2">
              <span className="w-2 h-2 bg-yellow-600 dark:bg-yellow-400 rounded-full mt-2"></span>
              <span>{t('profile.session.tip1')}</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="w-2 h-2 bg-yellow-600 dark:bg-yellow-400 rounded-full mt-2"></span>
              <span>{t('profile.session.tip2')}</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="w-2 h-2 bg-yellow-600 dark:bg-yellow-400 rounded-full mt-2"></span>
              <span>{t('profile.session.tip3')}</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="w-2 h-2 bg-yellow-600 dark:bg-yellow-400 rounded-full mt-2"></span>
              <span>{t('profile.session.tip4')}</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}