'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { updatePassword } from 'firebase/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Lock, AlertCircle } from 'lucide-react'

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

export default function ResetPasswordRequiredPage() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()
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

  useEffect(() => {
    if (!user) {
      router.push('/login')
    }
  }, [user, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!user) return

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      // Update password
      await updatePassword(user, newPassword)
      
      // Update user profile to remove password reset requirement
      await userProfileService.updateProfile(user.uid, {
        requiresPasswordReset: false
      })
      
      // Redirect to dashboard
      router.push('/dashboard')
    } catch (error: any) {
      if (error.code === 'auth/weak-password') {
        setError('Password is too weak. Please choose a stronger password.')
      } else if (error.code === 'auth/requires-recent-login') {
        setError('Please log out and log back in before changing your password.')
      } else {
        setError(error.message)
      }
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return null
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
        <Card className="border-[#72A68E] bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-orange-600 dark:text-orange-400" />
            </div>
            <CardTitle className="text-2xl font-bold text-[#012619] dark:text-white">
              Password Reset Required
            </CardTitle>
            <CardDescription className="text-[#025940] dark:text-slate-400">
              Your administrator requires you to set a new password before continuing
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-[#72A68E]/10 dark:bg-blue-900/20 border border-[#72A68E] dark:border-blue-800 rounded-lg p-4 mb-4">
                <div className="flex items-start">
                  <AlertCircle className="w-5 h-5 text-[#025940] dark:text-blue-400 mr-2 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-[#012619] dark:text-blue-300">
                    <p className="font-medium mb-1">Welcome to YARDAO!</p>
                    <p>Please set a new password to secure your account. This is a one-time requirement.</p>
                  </div>
                </div>
              </div>

              <Input
                label="New Password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter your new password"
                required
                autoComplete="new-password"
                helperText="Must be at least 6 characters"
                className="border-[#72A68E] focus:border-[#025940] focus:ring-[#025940] dark:bg-slate-800 dark:border-slate-700 dark:focus:border-teal-500"
              />
              
              <Input
                label="Confirm New Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your new password"
                required
                autoComplete="new-password"
                className="border-[#72A68E] focus:border-[#025940] focus:ring-[#025940] dark:bg-slate-800 dark:border-slate-700 dark:focus:border-teal-500"
              />
              
              {error && (
                <div className="p-4 bg-red-50/50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
                  <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mr-2" />
                    <span className="text-red-700 dark:text-red-300 font-medium">{error}</span>
                  </div>
                </div>
              )}
              
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#025940] hover:bg-[#012619] text-white dark:bg-gradient-to-r dark:from-blue-600 dark:to-teal-600 dark:hover:from-blue-700 dark:hover:to-teal-700"
              >
                {loading ? 'Setting password...' : 'Set New Password'}
              </Button>
            </form>
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