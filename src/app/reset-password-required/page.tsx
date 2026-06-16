'use client'

import './reset-password-required.css'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { supabase } from '@/lib/supabaseClient'

export default function ResetPasswordRequiredPage() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { user, loading: authLoading, refreshProfile } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // Only redirect once auth is fully RESOLVED — never on the transient null
    // that occurs while the session is still loading right after login.
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

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
      const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword })
      if (pwErr) throw pwErr

      await userProfileService.updateProfile(user.uid, { requiresPasswordReset: false })
      // Refresh the cached profile so PasswordResetGuard sees the cleared flag.
      await refreshProfile()

      router.push('/dashboard')
    } catch (error: any) {
      if (error.code === 'auth/weak-password') {
        setError('Password is too weak. Please choose a stronger password.')
      } else if (error.code === 'auth/requires-recent-login') {
        setError('Please log out and log back in before changing your password.')
      } else {
        setError(error.message || 'Could not set your password. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  // While auth is still resolving, show a neutral branded loader.
  if (authLoading) {
    return (
      <main className="login-shell" aria-busy="true" style={{ placeItems: 'center' }}>
        <span style={{ width: 40, height: 40, border: '3px solid rgba(214,255,47,.25)', borderTopColor: '#d6ff2f', borderRadius: '999px', display: 'inline-block', animation: 'spin .8s linear infinite' }} />
      </main>
    )
  }

  if (!user) return null

  return (
    <main className="login-shell login-shell--recovery" aria-labelledby="page-title">
      <div className="ambient-grid" aria-hidden="true"></div>
      <div className="light-beam" aria-hidden="true"></div>
      <div className="sparkles" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </div>

      <section className="brand-stage" aria-label="Yardao brand">
        <div className="favicon-orbit" aria-hidden="true">
          <div className="orbital-ring"></div>
          <img src="/yardao-logo.png" alt="Yardao" />
        </div>

        <div className="brand-copy">
          <p className="eyebrow eyebrow--recovery">Account security</p>
          <h1 id="page-title">Set a new password</h1>
          <p>One quick step to secure your account — choose a new password and you&apos;re straight into your yard.</p>
        </div>
      </section>

      <section className="auth-panel" aria-label="Set a new password">
        <div className="panel-glow" aria-hidden="true"></div>

        <div className="panel-header">
          <span className="reset-tile" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
              <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
              <circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <div>
            <p>Password reset required</p>
            <h2>
              <span className="desktop-title">Set a new password</span>
              <span className="mobile-title">New password</span>
            </h2>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="rpr-notice">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></svg>
            <div>
              <strong>Welcome to Yardao!</strong>
              <span>Set a new password to secure your account. This is a one-time step.</span>
            </div>
          </div>

          <div className="field">
            <label htmlFor="newPassword">New password</label>
            <span className="password-wrap">
              <input
                id="newPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Enter your new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={loading}
                required
              />
              <button
                className="icon-button"
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.1 12s3.6-6.5 9.9-6.5S21.9 12 21.9 12s-3.6 6.5-9.9 6.5S2.1 12 2.1 12Z" /><circle cx="12" cy="12" r="3" /><path d="M3 3l18 18" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.1 12s3.6-6.5 9.9-6.5S21.9 12 21.9 12s-3.6 6.5-9.9 6.5S2.1 12 2.1 12Z" /><circle cx="12" cy="12" r="3" /></svg>
                )}
              </button>
            </span>
            <p className="hint">Must be at least 6 characters</p>
          </div>

          <div className="field">
            <label htmlFor="confirmPassword">Confirm new password</label>
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Confirm your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <button className={`submit-button ${loading ? 'is-loading' : ''}`} type="submit" disabled={loading}>
            <span className="button-text">Set new password</span>
            <span className="button-loader" aria-hidden="true"></span>
          </button>

          {(error || loading) && (
            <p className="form-status" role="status" aria-live="polite"
              style={{ color: error ? '#ffb1a8' : 'rgba(225, 255, 172, 0.9)' }}>
              {error || 'Setting your password…'}
            </p>
          )}
        </form>

        <div className="panel-footer">
          <a href="/login">Back to sign in</a>
          <span aria-hidden="true"></span>
          <a href="/">Back to home</a>
        </div>
      </section>
    </main>
  )
}
