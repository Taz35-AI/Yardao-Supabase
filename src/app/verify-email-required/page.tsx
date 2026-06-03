// src/app/verify-email-required/page.tsx - Enhanced with Auto-Redirect (Fixed Router Error)
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Mail, RefreshCw, LogOut, CheckCircle } from 'lucide-react'
import { logger } from '@/lib/logger'

export default function VerifyEmailRequiredPage() {
  const { user, sendVerificationEmail, logout } = useAuth()
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const [countdown, setCountdown] = useState(3)

  // Check verification status periodically
  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }

    // Initial check
    if (user.emailVerified) {
      handleVerificationSuccess()
      return
    }

    // Set up polling to check verification status every 5 seconds
    const pollInterval = setInterval(async () => {
      try {
        // Refresh the session to pick up fresh email-verification status
        const { data } = await supabase.auth.refreshSession()
        if (data.user?.email_confirmed_at) {
          clearInterval(pollInterval)
          handleVerificationSuccess()
        }
      } catch (error) {
        logger.error('Error checking verification status:', error)
      }
    }, 5000) // Check every 5 seconds

    return () => clearInterval(pollInterval)
  }, [user, router])

  // Handle successful verification
  const handleVerificationSuccess = () => {
    setIsVerified(true)
  }

  // Handle countdown when verified
  useEffect(() => {
    if (!isVerified) return

    const countdownInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(countdownInterval)
  }, [isVerified])

  // Handle navigation when countdown reaches 0
  useEffect(() => {
    if (isVerified && countdown === 0) {
      router.push('/dashboard')
    }
  }, [isVerified, countdown, router])

  const handleResendVerification = async () => {
    setSending(true)
    setError('')
    setSuccess(false)

    try {
      await sendVerificationEmail()
      setSuccess(true)
      setTimeout(() => setSuccess(false), 5000)
    } catch (error: any) {
      setError('Failed to send verification email. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const handleManualCheck = async () => {
    if (!user) return
    
    try {
      const { data } = await supabase.auth.refreshSession()
      if (data.user?.email_confirmed_at) {
        handleVerificationSuccess()
      } else {
        setError('Email not verified yet. Please check your inbox and click the verification link.')
        setTimeout(() => setError(''), 3000)
      }
    } catch (error) {
      setError('Error checking verification status. Please try again.')
      setTimeout(() => setError(''), 3000)
    }
  }

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  const handleGoToDashboard = () => {
    router.push('/dashboard')
  }

  if (!user) {
    return null
  }

  // Show success state when email is verified
  if (isVerified) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">
                Email Verified Successfully!
              </CardTitle>
              <CardDescription>
                Welcome to your dashboard
              </CardDescription>
            </CardHeader>
            
            <CardContent>
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <p className="text-sm text-green-800 dark:text-green-300 text-center">
                    🎉 Your email has been verified! 
                    <br />
                    Redirecting to dashboard in <strong>{countdown}</strong> seconds...
                  </p>
                </div>

                <Button
                  onClick={handleGoToDashboard}
                  className="w-full"
                >
                  Go to Dashboard Now
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-orange-600 dark:text-orange-400" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">
              Email Verification Required
            </CardTitle>
            <CardDescription>
              Please verify your email address to continue
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  We've sent a verification email to <strong>{user.email}</strong>. 
                  <br />
                  <br />
                  💡 <strong>New:</strong> Once you click the verification link, you'll be automatically redirected to your dashboard!
                </p>
              </div>

              {success && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <p className="text-sm text-green-800 dark:text-green-300">
                    Verification email sent successfully! Check your inbox.
                  </p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
                </div>
              )}

              <div className="space-y-3 pt-4">
                <Button
                  onClick={handleManualCheck}
                  className="w-full flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Check Verification Status
                </Button>

                <Button
                  onClick={handleResendVerification}
                  variant="outline"
                  disabled={sending}
                  className="w-full"
                >
                  {sending ? 'Sending...' : 'Resend verification email'}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-300 dark:border-gray-600" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white dark:bg-gray-800 px-2 text-gray-500">or</span>
                  </div>
                </div>

                <Button
                  onClick={handleLogout}
                  variant="ghost"
                  className="w-full text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Log out
                </Button>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <p className="text-xs text-yellow-800 dark:text-yellow-300">
                  ⚡ <strong>Auto-Detection:</strong> We're automatically checking for verification every 5 seconds. 
                  Just click the link in your email and wait!
                </p>
              </div>

              <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-4">
                If you don't see the email, check your spam folder.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}