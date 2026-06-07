// src/app/login/page.tsx - Full featured login with interactive fleet background + Legal Footer
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { completePendingOrgSetup } from '@/lib/orgSetup'
import { logger } from '@/lib/logger'
import { isUserActive, isUserDeleted } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LegalFooter } from '@/components/legal/LegalFooter'
import { Check, AlertCircle, Ban, Clock } from 'lucide-react'

// Car PNG images for animated background
const carImages = [
  '/cars/car (1).png',
  '/cars/car (2).png',
  '/cars/car (3).png',
  '/cars/car (4).png',
  '/cars/car (5).png',
  '/cars/car (6).png'
]

interface Vehicle {
  id: string
  imageSrc: string
  lane: number
  y: number
  duration: number
  delay: number
  size: number
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const router = useRouter()

  // Message states
  const [showRegistrationSuccess, setShowRegistrationSuccess] = useState(false)
  const [showTimeoutMessage, setShowTimeoutMessage] = useState(false)
  const [accountError, setAccountError] = useState('')

  // Animated vehicles state
  const [vehicles, setVehicles] = useState<Vehicle[]>([])

  // Initialize animated vehicles
  useEffect(() => {
    const lanes = 6
    const vehiclesPerLane = 2 // 2 cars per lane for fuller look
    
    const newVehicles: Vehicle[] = []
    
    // Predefined speeds and delays for natural, asymmetric flow
    const laneConfigs = [
      { speed: 22, startDelay: -5 },   // Lane 1
      { speed: 18, startDelay: -12 },  // Lane 2
      { speed: 28, startDelay: -3 },   // Lane 3
      { speed: 24, startDelay: -18 },  // Lane 4
      { speed: 20, startDelay: -8 },   // Lane 5
      { speed: 26, startDelay: -15 }   // Lane 6
    ]
    
    for (let lane = 0; lane < lanes; lane++) {
      const config = laneConfigs[lane]
      
      for (let i = 0; i < vehiclesPerLane; i++) {
        newVehicles.push({
          id: `${lane}-${i}`,
          imageSrc: carImages[Math.floor(Math.random() * carImages.length)],
          lane: lane,
          y: (lane * (100 / lanes)) + (100 / lanes / 2),
          duration: config.speed, // Each lane has unique speed
          delay: config.startDelay - (i * (config.speed / 2)), // Cars spaced half the duration apart
          size: 100 + Math.random() * 50 // Varied sizes (100-150px)
        })
      }
    }
    setVehicles(newVehicles)
  }, [])

  useEffect(() => {
    // Check URL parameters manually to avoid useSearchParams issues
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const justRegistered = urlParams.get('registered') === 'true'
      const logoutReason = urlParams.get('reason')
      const errorType = urlParams.get('error')
      
      // Handle registration success message
      if (justRegistered) {
        setShowRegistrationSuccess(true)
        // Hide success message after 5 seconds
        const timer = setTimeout(() => {
          setShowRegistrationSuccess(false)
        }, 5000)
        return () => clearTimeout(timer)
      }

      // Handle auto-logout timeout message
      if (logoutReason === 'timeout') {
        setShowTimeoutMessage(true)
        // Hide timeout message after 10 seconds
        const timer = setTimeout(() => {
          setShowTimeoutMessage(false)
        }, 10000)
        return () => clearTimeout(timer)
      }

      // Handle account-related errors
      if (errorType) {
        switch (errorType) {
          case 'account-deleted':
            setAccountError('Your account has been deleted by an administrator. Please contact support if you believe this is an error.')
            break
          case 'account-inactive':
            setAccountError('Your account has been deactivated by an administrator. Please contact support to reactivate your account.')
            break
          case 'profile-error':
            setAccountError('There was an error accessing your account. Please try logging in again.')
            break
          default:
            setAccountError('')
        }
      }
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setAccountError('')
    setLoading(true)

    try {
      const userCredential = await signIn(email, password)
      const user = userCredential.user

      // Finish a deferred signup's organisation setup, if any (no-op for normal
      // logins). This runs on first login after email confirmation.
      try {
        await completePendingOrgSetup()
      } catch (orgErr) {
        logger.error('Deferred org setup failed on login:', orgErr)
        setError('We could not finish setting up your organization. Please try signing in again.')
        setLoading(false)
        return
      }

      // Check if user profile exists and is active
      const profile = await userProfileService.getProfile(user.uid)
      
      if (!profile) {
        setError('Account profile not found. Please contact your administrator.')
        setLoading(false)
        return
      }

      // Check if user is deleted using helper function
      if (isUserDeleted(profile)) {
        setError('Your account has been deleted. Please contact your administrator.')
        setLoading(false)
        return
      }

      // Check if user is inactive using helper function
      if (!isUserActive(profile)) {
        setError('Your account has been deactivated. Please contact your administrator.')
        setLoading(false)
        return
      }

      // Admin-created / migrated users sign in with a temporary password. We no
      // longer force a reset: they go straight to the dashboard, where the
      // non-blocking TempPasswordNotice tells them they can change it later from
      // their Profile page if they want. (The forced-reset flow at
      // /reset-password-required is kept as a fallback, just not auto-enforced.)
      router.push('/dashboard')
    } catch (error: any) {
      setLoading(false)
      
      if (error.code === 'auth/user-not-found') {
        setError('No account found with this email address')
      } else if (error.code === 'auth/wrong-password') {
        setError('Incorrect password')
      } else if (error.code === 'auth/invalid-email') {
        setError('Invalid email address')
      } else if (error.code === 'auth/too-many-requests') {
        setError('Too many failed login attempts. Please try again later.')
      } else if (error.code === 'auth/invalid-credential') {
        setError('Invalid email or password')
      } else {
        setError('Login failed. Please try again.')
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#012619] dark:bg-slate-950 flex flex-col relative overflow-hidden">
      {/* Animated Fleet Background */}
      <div className="absolute inset-0 overflow-hidden opacity-20 dark:opacity-25 pointer-events-none">
        {/* Road lanes */}
        {[...Array(6)].map((_, i) => (
          <div
            key={`lane-${i}`}
            className="absolute left-0 right-0 border-t border-dashed border-slate-300 dark:border-slate-700 opacity-30"
            style={{
              top: `${(i + 1) * (100 / 7)}%`
            }}
          />
        ))}

        {/* Animated Vehicles */}
        {vehicles.map((vehicle) => {
          return (
            <div
              key={vehicle.id}
              className="absolute transition-transform hover:scale-110"
              style={{
                top: `${vehicle.y}%`,
                width: `${vehicle.size}px`,
                height: 'auto',
                animationName: 'driveRight',
                animationDuration: `${vehicle.duration}s`,
                animationTimingFunction: 'linear',
                animationIterationCount: 'infinite',
                animationDelay: `${vehicle.delay}s`,
                transform: 'translateY(-50%)',
                left: '-200px'
              }}
            >
              <img 
                src={vehicle.imageSrc} 
                alt="Vehicle"
                className="w-full h-auto object-contain opacity-70 dark:opacity-80"
                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}
              />
            </div>
          )
        })}
      </div>

      {/* Theme Toggle */}
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      
      {/* ✅ UPDATED: Main content wrapper with flex-1 */}
      <div className="flex-1 flex flex-col justify-center p-4 py-8 relative z-10">
        {/* Login Card */}
        <div className="w-full max-w-md mx-auto">
          {/* Logo on the dark-green page background for strong contrast (like the sidebar) */}
          <div className="flex justify-center mb-5">
            <div className="relative group">
              <img
                src="/logo-yardao.png"
                alt="Yardao Logo"
                className="h-24 sm:h-40 w-auto max-w-full object-contain transition-transform duration-200 group-hover:scale-105"
              />
              <div className="absolute -inset-2 bg-gradient-to-r from-[#b3f243]/20 to-[#72A68E]/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10"></div>
            </div>
          </div>
          <Card className="border-[#72A68E] bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
            <CardHeader className="text-center pb-3">
              <CardTitle className="text-xl sm:text-2xl font-bold text-[#012619] dark:text-white">
                Welcome Back
              </CardTitle>
              <CardDescription className="text-sm text-[#025940] dark:text-slate-400">
                Sign in to your account to continue
              </CardDescription>
            </CardHeader>
            
            <CardContent className="pt-3 px-4 pb-4">
              {/* Registration Success Message */}
              {showRegistrationSuccess && (
                <div className="mb-4 p-3 bg-[#72A68E]/10 dark:bg-emerald-900/20 border border-[#72A68E] dark:border-emerald-700 rounded-lg">
                  <div className="flex items-center">
                    <Check className="w-5 h-5 text-[#025940] dark:text-emerald-400 mr-2 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-[#012619] dark:text-white font-medium">
                        Registration successful!
                      </p>
                      <p className="text-xs text-[#025940] dark:text-slate-400 mt-1">
                        Please check your email for verification instructions.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Session Timeout Message */}
              {showTimeoutMessage && (
                <div className="mb-4 p-3 bg-[#C5D9D0]/30 dark:bg-amber-900/20 border border-[#72A68E] dark:border-amber-700 rounded-lg">
                  <div className="flex items-start">
                    <Clock className="w-5 h-5 text-[#025940] dark:text-amber-400 mr-2 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-[#012619] dark:text-white font-medium">
                        Session expired
                      </p>
                      <p className="text-xs text-[#025940] dark:text-slate-400 mt-1">
                        You've been logged out due to inactivity. 
                        Please sign in again to continue.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Account Error Messages */}
              {accountError && (
                <div className="mb-4 p-3 bg-red-50/50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
                  <div className="flex items-start">
                    <Ban className="w-5 h-5 text-red-600 dark:text-red-400 mr-2 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-red-700 dark:text-red-300 font-medium">
                      {accountError}
                    </span>
                  </div>
                </div>
              )}

              {/* Login Error Messages */}
              {error && (
                <div className="mb-4 p-3 bg-red-50/50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
                  <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mr-2 flex-shrink-0" />
                    <span className="text-sm text-red-700 dark:text-red-300 font-medium">{error}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label htmlFor="email" className="block text-xs font-medium text-[#012619] dark:text-white mb-1">
                    Email Address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    autoComplete="email"
                    disabled={loading}
                    className="text-sm h-9 border-[#72A68E] focus:border-[#025940] focus:ring-[#025940] dark:bg-slate-800 dark:border-slate-700 dark:focus:border-teal-500"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-xs font-medium text-[#012619] dark:text-white mb-1">
                    Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                    disabled={loading}
                    className="text-sm h-9 border-[#72A68E] focus:border-[#025940] focus:ring-[#025940] dark:bg-slate-800 dark:border-slate-700 dark:focus:border-teal-500"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-[#025940] hover:bg-[#012619] text-white dark:bg-gradient-to-r dark:from-blue-600 dark:to-teal-600 dark:hover:from-blue-700 dark:hover:to-teal-700 h-9 text-sm"
                  disabled={loading}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>

              <div className="mt-4 space-y-2">
                <div className="text-center">
                  <Link
                    href="/forgot-password"
                    className="text-xs text-[#025940] hover:text-[#012619] dark:text-teal-400 dark:hover:text-teal-300 font-medium"
                  >
                    Forgot your password?
                  </Link>
                </div>
                
                <div className="text-center text-xs text-[#025940] dark:text-slate-400">
                  Don't have an account?{' '}
                  <Link
                    href="/register"
                    className="text-[#025940] hover:text-[#012619] dark:text-teal-400 dark:hover:text-teal-300 font-medium"
                  >
                    Register here
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ✅ NEW: Legal Footer Component */}
      <LegalFooter variant="dark" className="!bg-transparent" />

      <style jsx>{`
        @keyframes driveRight {
          0% { left: -200px; }
          100% { left: calc(100% + 200px); }
        }
      `}</style>
    </div>
  )
}