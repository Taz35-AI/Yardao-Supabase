// src/app/register/page.tsx - FIXED: Remove side padding causing the gap
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { completePendingOrgSetup } from '@/lib/orgSetup'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LegalFooter } from '@/components/legal/LegalFooter'
import { Building2, Plus, Mail, Check, User, Lock, AlertCircle } from 'lucide-react'
import { logger } from '@/lib/logger'

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

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const { signUp } = useAuth()
  const router = useRouter()

  // Animated vehicles state
  const [vehicles, setVehicles] = useState<Vehicle[]>([])

  // Initialize animated vehicles
  useEffect(() => {
    const lanes = 6
    const vehiclesPerLane = 2
    
    const newVehicles: Vehicle[] = []
    
    const laneConfigs = [
      { speed: 22, startDelay: -5 },
      { speed: 18, startDelay: -12 },
      { speed: 28, startDelay: -3 },
      { speed: 24, startDelay: -18 },
      { speed: 20, startDelay: -8 },
      { speed: 26, startDelay: -15 }
    ]
    
    for (let lane = 0; lane < lanes; lane++) {
      const config = laneConfigs[lane]
      
      for (let i = 0; i < vehiclesPerLane; i++) {
        newVehicles.push({
          id: `${lane}-${i}`,
          imageSrc: carImages[Math.floor(Math.random() * carImages.length)],
          lane: lane,
          y: (lane * (100 / lanes)) + (100 / lanes / 2),
          duration: config.speed,
          delay: config.startDelay - (i * (config.speed / 2)),
          size: 100 + Math.random() * 50
        })
      }
    }
    setVehicles(newVehicles)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!agreedToTerms) {
      setError('You must agree to the Terms & Conditions and Privacy Policy')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (!displayName.trim()) {
      setError('Display name is required')
      return
    }

    if (!organizationName.trim()) {
      setError('Organization name is required')
      return
    }

    setLoading(true)

    try {
      // Sign up, stashing the display name + org name in user metadata. Supabase
      // emails a confirmation link; when email confirmation is ON, no session is
      // returned yet, so the organisation is created on first login after the
      // user confirms (see completePendingOrgSetup).
      const userCredential = await signUp(email, password, {
        displayName: displayName.trim(),
        organizationName: organizationName.trim(),
      })

      if (userCredential.session) {
        // Email confirmation is OFF → we already have a session; finish the
        // organisation setup now and go straight to the dashboard.
        await completePendingOrgSetup()
        router.push('/dashboard')
        return
      }

      // Email confirmation is ON → show the "check your email" screen.
      setSuccess(true)
      setTimeout(() => {
        router.push('/login?registered=true')
      }, 4000)

    } catch (error: any) {
      logger.error('Registration error:', error)
      const msg = (error?.message || '').toLowerCase()

      if (msg.includes('already registered') || msg.includes('already exists') || error.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Try signing in instead.')
      } else if (msg.includes('invalid') && msg.includes('email')) {
        setError('Please enter a valid email address')
      } else if (msg.includes('password')) {
        setError(error.message || 'Password is too weak. Please choose a stronger password.')
      } else if (error.code === 'auth/network-request-failed') {
        setError('Network error. Please check your connection and try again.')
      } else {
        setError(`Registration failed: ${error.message || 'Unknown error'}`)
      }
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#012619] dark:bg-slate-950 flex items-center justify-center relative overflow-hidden" style={{ margin: 0, padding: 0 }}>
        <div className="absolute inset-0 overflow-hidden opacity-20 dark:opacity-25 pointer-events-none">
          {[...Array(6)].map((_, i) => (
            <div
              key={`lane-${i}`}
              className="absolute left-0 right-0 border-t border-dashed border-slate-300 dark:border-slate-700 opacity-30"
              style={{
                top: `${(i + 1) * (100 / 7)}%`
              }}
            />
          ))}

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

        <div className="w-full max-w-md relative z-10 px-4">
          <Card className="border-[#72A68E] bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-[#72A68E]/20 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-[#025940] dark:text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-[#012619] dark:text-white mb-2">
                Registration Successful!
              </h2>
              <p className="text-[#025940] dark:text-slate-400 mb-4">
                We've sent a confirmation link to <span className="font-semibold">{email}</span>. Click it to verify your email,
                then sign in — your organization will be set up automatically on your first login.
              </p>
              <p className="text-sm text-[#72A68E] dark:text-teal-400">
                Taking you to the sign-in page…
              </p>
            </CardContent>
          </Card>
        </div>

        <style jsx>{`
          @keyframes driveRight {
            0% { left: -200px; }
            100% { left: calc(100% + 200px); }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#012619] dark:bg-slate-950 flex flex-col relative overflow-hidden" style={{ margin: 0, padding: 0 }}>
      {/* Animated Fleet Background */}
      <div className="absolute inset-0 overflow-hidden opacity-20 dark:opacity-25 pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <div
            key={`lane-${i}`}
            className="absolute left-0 right-0 border-t border-dashed border-slate-300 dark:border-slate-700 opacity-30"
            style={{
              top: `${(i + 1) * (100 / 7)}%`
            }}
          />
        ))}

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

      {/* ✅ FIXED: Removed p-4 and py-8 classes, added inline styles for zero spacing */}
      <div className="flex-1 flex flex-col justify-center relative z-10" style={{ padding: '2rem 1rem', margin: 0 }}>
        <div className="w-full max-w-md mx-auto">
          {/* Logo Section */}
          <div className="text-center mb-6">
            <Link href="/" className="inline-block">
              <div className="relative group">
                <img
                  src="/logo-yardao-trimmed.png"
                  alt="Yardao Logo"
                  className="h-14 sm:h-16 w-auto mx-auto object-contain transition-transform duration-200 group-hover:scale-105"
                />
                <div className="absolute -inset-2 bg-gradient-to-r from-[#b3f243]/20 to-[#72A68E]/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10"></div>
              </div>
            </Link>
          </div>

          <Card className="border-[#72A68E] bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
            <CardHeader className="text-center pb-3">
              <CardTitle className="text-xl sm:text-2xl font-bold text-[#012619] dark:text-white">
                Create your account
              </CardTitle>
              <CardDescription className="text-sm text-[#025940] dark:text-slate-400">
                Set up your organization and get started with fleet management
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {error && (
                <div className="mb-4 p-3 bg-red-50/50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
                  <div className="flex items-center">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mr-2 flex-shrink-0" />
                    <span className="text-sm text-red-700 dark:text-red-300 font-medium">{error}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Email Address */}
                <div>
                  <label htmlFor="email" className="block text-xs font-medium text-[#012619] dark:text-white mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#72A68E] dark:text-teal-400 w-4 h-4" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                      autoComplete="email"
                      disabled={loading}
                      className="pl-10 text-sm h-9 border-[#72A68E] focus:border-[#025940] focus:ring-[#025940] dark:bg-slate-800 dark:border-slate-700 dark:focus:border-teal-500"
                    />
                  </div>
                </div>

                {/* Display Name */}
                <div>
                  <label htmlFor="displayName" className="block text-xs font-medium text-[#012619] dark:text-white mb-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#72A68E] dark:text-teal-400 w-4 h-4" />
                    <Input
                      id="displayName"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Enter your full name"
                      required
                      autoComplete="name"
                      disabled={loading}
                      className="pl-10 text-sm h-9 border-[#72A68E] focus:border-[#025940] focus:ring-[#025940] dark:bg-slate-800 dark:border-slate-700 dark:focus:border-teal-500"
                    />
                  </div>
                </div>

                {/* Organization Name */}
                <div>
                  <label htmlFor="organizationName" className="block text-xs font-medium text-[#012619] dark:text-white mb-1">
                    Organization Name
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#72A68E] dark:text-teal-400 w-4 h-4" />
                    <Input
                      id="organizationName"
                      type="text"
                      value={organizationName}
                      onChange={(e) => setOrganizationName(e.target.value)}
                      placeholder="Your Company Name"
                      required
                      disabled={loading}
                      className="pl-10 text-sm h-9 border-[#72A68E] focus:border-[#025940] focus:ring-[#025940] dark:bg-slate-800 dark:border-slate-700 dark:focus:border-teal-500"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="password" className="block text-xs font-medium text-[#012619] dark:text-white mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#72A68E] dark:text-teal-400 w-4 h-4" />
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a strong password"
                      required
                      autoComplete="new-password"
                      disabled={loading}
                      className="pl-10 text-sm h-9 border-[#72A68E] focus:border-[#025940] focus:ring-[#025940] dark:bg-slate-800 dark:border-slate-700 dark:focus:border-teal-500"
                    />
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label htmlFor="confirmPassword" className="block text-xs font-medium text-[#012619] dark:text-white mb-1">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#72A68E] dark:text-teal-400 w-4 h-4" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm your password"
                      required
                      autoComplete="new-password"
                      disabled={loading}
                      className="pl-10 text-sm h-9 border-[#72A68E] focus:border-[#025940] focus:ring-[#025940] dark:bg-slate-800 dark:border-slate-700 dark:focus:border-teal-500"
                    />
                  </div>
                </div>

                {/* Terms Agreement Checkbox */}
                <div className="flex items-start space-x-2 p-2 bg-[#C5D9D0]/10 dark:bg-teal-900/10 rounded-lg border border-[#72A68E] dark:border-teal-800">
                  <input
                    id="agreedToTerms"
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    disabled={loading}
                    className="mt-0.5 h-4 w-4 text-[#025940] focus:ring-[#025940] border-[#72A68E] rounded cursor-pointer flex-shrink-0"
                  />
                  <label 
                    htmlFor="agreedToTerms" 
                    className="text-xs text-gray-700 dark:text-gray-300 cursor-pointer select-none leading-tight"
                  >
                    I have read and agree to Yardao's Terms & Conditions and Privacy Policy
                  </label>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-[#025940] hover:bg-[#012619] text-white dark:bg-gradient-to-r dark:from-blue-600 dark:to-teal-600 dark:hover:from-blue-700 dark:hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed h-9 text-sm"
                  disabled={loading || !agreedToTerms}
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Creating account...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Account
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-4 text-center">
                <p className="text-xs text-[#025940] dark:text-slate-400">
                  Already have an account?{' '}
                  <Link
                    href="/login"
                    className="font-medium text-[#025940] hover:text-[#012619] dark:text-teal-400 dark:hover:text-teal-300"
                  >
                    Sign in here
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer always visible at bottom */}
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