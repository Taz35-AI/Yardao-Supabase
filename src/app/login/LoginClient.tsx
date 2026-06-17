// src/app/login/page.tsx — Premium dark-forest login, ported from the design
// example the owner dropped in this folder (index.html). Structure + CSS match
// that mock; wired to the real Supabase auth logic (email/password). The CSS is
// injected via styled-jsx global so the element/keyframe selectors resolve
// regardless of the app's Tailwind build.
'use client'
import './login.css'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { completePendingOrgSetup } from '@/lib/orgSetup'
import { supabase } from '@/lib/supabaseClient'
import { logger } from '@/lib/logger'
import { isUserActive, isUserDeleted } from '@/types'

// Show the one-tap demo sign-in only once it's been set up (demo account +
// secrets + deployed function). Set NEXT_PUBLIC_ENABLE_DEMO=true to reveal it.
const DEMO_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEMO === 'true'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const router = useRouter()

  // Message states (from URL params)
  const [showRegistrationSuccess, setShowRegistrationSuccess] = useState(false)
  const [showTimeoutMessage, setShowTimeoutMessage] = useState(false)
  const [accountError, setAccountError] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const urlParams = new URLSearchParams(window.location.search)
    const justRegistered = urlParams.get('registered') === 'true'
    const logoutReason = urlParams.get('reason')
    const errorType = urlParams.get('error')

    if (justRegistered) {
      setShowRegistrationSuccess(true)
      const timer = setTimeout(() => setShowRegistrationSuccess(false), 6000)
      return () => clearTimeout(timer)
    }
    if (logoutReason === 'timeout') {
      setShowTimeoutMessage(true)
      const timer = setTimeout(() => setShowTimeoutMessage(false), 10000)
      return () => clearTimeout(timer)
    }
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
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setAccountError('')
    setLoading(true)

    try {
      const userCredential = await signIn(email, password)
      const user = userCredential.user

      try {
        await completePendingOrgSetup()
      } catch (orgErr) {
        logger.error('Deferred org setup failed on login:', orgErr)
        setError('We could not finish setting up your organization. Please try signing in again.')
        setLoading(false)
        return
      }

      const profile = await userProfileService.getProfile(user.uid)
      if (!profile) {
        setError('Account profile not found. Please contact your administrator.')
        setLoading(false)
        return
      }
      if (isUserDeleted(profile)) {
        setError('Your account has been deleted. Please contact your administrator.')
        setLoading(false)
        return
      }
      if (!isUserActive(profile)) {
        setError('Your account has been deactivated. Please contact your administrator.')
        setLoading(false)
        return
      }

      router.push('/dashboard')
    } catch (error: any) {
      setLoading(false)
      const code = error?.code || ''
      const msg = (error?.message || '').toLowerCase()
      if (code === 'auth/too-many-requests' || msg.includes('too many')) {
        setError('Too many failed attempts. Please try again in a few minutes.')
      } else if (code === 'auth/invalid-email' || (msg.includes('invalid') && msg.includes('email') && !msg.includes('credential'))) {
        setError('Please enter a valid email address.')
      } else {
        setError('Incorrect email or password. Please try again.')
      }
    }
  }

  // One-tap demo sign-in (App Store reviewer access). Identity + password live
  // server-side in the demo-login function; we just apply the returned session.
  const handleDemo = async () => {
    setError('')
    setAccountError('')
    setLoading(true)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('demo-login')
      const tokens = data as { access_token?: string; refresh_token?: string; error?: string } | null
      if (fnErr || !tokens?.access_token || !tokens?.refresh_token) {
        throw new Error(fnErr?.message || tokens?.error || 'demo unavailable')
      }
      const { error: sessErr } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      })
      if (sessErr) throw sessErr
      router.push('/dashboard')
    } catch (err) {
      logger.error('Demo sign-in failed:', err)
      setLoading(false)
      setError('The demo is unavailable right now. Please try again later.')
    }
  }

  // Single status line (matches the mock's .form-status)
  const status: { text: string; kind: 'error' | 'ok' | 'warn' | 'info' } | null =
    error ? { text: error, kind: 'error' }
    : accountError ? { text: accountError, kind: 'error' }
    : showRegistrationSuccess ? { text: 'Registration successful — check your email to verify your account.', kind: 'ok' }
    : showTimeoutMessage ? { text: "You were signed out due to inactivity. Please sign in again.", kind: 'warn' }
    : loading ? { text: 'Checking your secure access…', kind: 'info' }
    : null

  const statusColor =
    status?.kind === 'error' ? '#ffb1a8'
    : status?.kind === 'ok' ? '#d6ff2f'
    : status?.kind === 'warn' ? '#ffd038'
    : 'rgba(225, 255, 172, 0.9)'

  return (
    <main className="login-shell" aria-labelledby="page-title">
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
          <p className="eyebrow">Yard management, made sharper</p>
          <h1 id="page-title">Welcome Back</h1>
          <p>Sign in to coordinate your yard operations with clarity, speed, and control.</p>
        </div>
      </section>

      <section className="auth-panel" aria-label="Sign in form">
        <div className="panel-glow" aria-hidden="true"></div>
        <div className="panel-header">
          <img src="/yardao-mark.webp" alt="Yardao" />
          <div>
            <p>Secure access</p>
            <h2>
              <span className="desktop-title">Sign in to Yardao</span>
              <span className="mobile-title">Welcome to Yardao</span>
            </h2>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="emailInput">Email address</label>
            <input
              id="emailInput"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="passwordInput">Password</label>
            <span className="password-wrap">
              <input
                id="passwordInput"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M2.1 12s3.6-6.5 9.9-6.5S21.9 12 21.9 12s-3.6 6.5-9.9 6.5S2.1 12 2.1 12Z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M3 3l18 18"></path>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M2.1 12s3.6-6.5 9.9-6.5S21.9 12 21.9 12s-3.6 6.5-9.9 6.5S2.1 12 2.1 12Z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </span>
          </div>

          <div className="form-row">
            <label className="remember">
              <input type="checkbox" name="remember" />
              <span>Remember me</span>
            </label>
            <Link href="/forgot-password" aria-label="Reset your password">Forgot password?</Link>
          </div>

          <button className={`submit-button ${loading ? 'is-loading' : ''}`} type="submit" disabled={loading}>
            <span className="button-text">Sign In</span>
            <span className="button-loader" aria-hidden="true"></span>
          </button>

          {DEMO_ENABLED && (
            <>
              <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0', color: 'rgba(225,255,172,0.45)', fontSize: 12 }}>
                <span style={{ flex: 1, height: 1, background: 'rgba(225,255,172,0.18)' }} />
                or
                <span style={{ flex: 1, height: 1, background: 'rgba(225,255,172,0.18)' }} />
              </div>
              <button
                type="button"
                onClick={handleDemo}
                disabled={loading}
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 12, cursor: loading ? 'not-allowed' : 'pointer',
                  background: 'transparent', border: '1px solid rgba(214,255,47,0.4)', color: '#d6ff2f',
                  fontWeight: 600, fontSize: 14, transition: 'background .2s, border-color .2s', opacity: loading ? 0.6 : 1,
                }}
              >
                Explore the demo
              </button>
            </>
          )}

          {status && (
            <p className="form-status" role="status" aria-live="polite" style={{ color: statusColor }}>
              {status.text}
            </p>
          )}
        </form>

        <div className="panel-footer">
          <Link href="/">Back to home</Link>
          <span aria-hidden="true"></span>
          <Link href="/register">Register here</Link>
        </div>
      </section>
    </main>
  )
}
