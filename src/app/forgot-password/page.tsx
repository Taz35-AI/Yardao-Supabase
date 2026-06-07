// src/app/forgot-password/page.tsx - Forgot Password page with animated background
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Mail, Check, AlertCircle, ArrowLeft } from 'lucide-react'
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const { resetPassword } = useAuth()
  const router = useRouter()

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await resetPassword(email)
      setSuccess(true)
    } catch (error: any) {
      logger.error('Password reset error:', error)
      
      if (error.code === 'auth/user-not-found') {
        setError('No account found with this email address')
      } else if (error.code === 'auth/invalid-email') {
        setError('Please enter a valid email address')
      } else if (error.code === 'auth/too-many-requests') {
        setError('Too many requests. Please try again later.')
      } else {
        setError('Failed to send reset email. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#012619] dark:bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
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

        <div className="w-full max-w-md relative z-10">
          <Card className="border-[#72A68E] bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-[#72A68E]/20 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-[#025940] dark:text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-[#012619] dark:text-white mb-2">
                Check Your Email
              </h2>
              <p className="text-[#025940] dark:text-slate-400 mb-6">
                We've sent a password reset link to {email}. 
                Follow the instructions in the email to reset your password.
              </p>
              <div className="space-y-3">
                <Link href="/login">
                  <Button className="w-full bg-[#025940] hover:bg-[#012619] text-white dark:bg-gradient-to-r dark:from-blue-600 dark:to-teal-600 dark:hover:from-blue-700 dark:hover:to-teal-700">
                    Back to Sign In
                  </Button>
                </Link>
                <button
                  onClick={() => {
                    setSuccess(false)
                    setEmail('')
                  }}
                  className="w-full text-sm text-[#72A68E] hover:text-[#025940] dark:text-teal-400 dark:hover:text-teal-300"
                >
                  Didn't receive the email? Try again
                </button>
              </div>
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
    <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
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

      <div className="w-full max-w-md relative z-10">
        {/* Logo Section */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <div className="relative group">
              <img
                src="/logo-yardao.png"
                alt="Yardao Logo"
                className="h-14 sm:h-16 w-auto mx-auto object-contain transition-transform duration-200 group-hover:scale-105"
              />
              <div className="absolute -inset-2 bg-gradient-to-r from-[#b3f243]/20 to-[#72A68E]/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10"></div>
            </div>
          </Link>
        </div>

        <Card className="border-[#72A68E] bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-[#012619] dark:text-white">
              Reset your password
            </CardTitle>
            <CardDescription className="text-[#025940] dark:text-slate-400">
              Enter your email address and we'll send you a link to reset your password
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-4 bg-red-50/50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
                <div className="flex items-center">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mr-2" />
                  <span className="text-red-700 dark:text-red-300 font-medium">{error}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[#012619] dark:text-white mb-1">
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
                    className="pl-10 border-[#72A68E] focus:border-[#025940] focus:ring-[#025940] dark:bg-slate-800 dark:border-slate-700 dark:focus:border-teal-500"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-[#025940] hover:bg-[#012619] text-white dark:bg-gradient-to-r dark:from-blue-600 dark:to-teal-600 dark:hover:from-blue-700 dark:hover:to-teal-700"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Sending reset email...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    Send Reset Email
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link
                href="/login"
                className="inline-flex items-center text-sm font-medium text-[#025940] hover:text-[#012619] dark:text-teal-400 dark:hover:text-teal-300"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Sign In
              </Link>
            </div>

            <div className="mt-4 text-center">
              <p className="text-sm text-[#025940] dark:text-slate-400">
                Don't have an account?{' '}
                <Link
                  href="/register"
                  className="font-medium text-[#025940] hover:text-[#012619] dark:text-teal-400 dark:hover:text-teal-300"
                >
                  Sign up here
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-[#C5D9D0]/70 dark:text-slate-500">
            © 2025 YARDAO Fleet Management. All rights reserved.
          </p>
        </div>
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