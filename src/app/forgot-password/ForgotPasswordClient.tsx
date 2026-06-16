// src/app/forgot-password/page.tsx — Account recovery, styled to match the
// login (premium dark-forest glass) but visually distinct: a key tile, a big
// "Forgot your password?" headline, and a dedicated "Check your inbox" success
// state. Wired to the real Supabase reset flow (resetPassword).
'use client'
import './forgot-password.css'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/lib/logger'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const { resetPassword } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await resetPassword(email)
      setSuccess(true)
    } catch (err: any) {
      logger.error('Password reset error:', err)
      if (err?.code === 'auth/user-not-found') {
        setError('No account found with this email address.')
      } else if (err?.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.')
      } else if (err?.code === 'auth/too-many-requests') {
        setError('Too many requests. Please try again later.')
      } else {
        setError('Failed to send reset email. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

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
          <p className="eyebrow eyebrow--recovery">Account recovery</p>
          <h1 id="page-title">{success ? 'Check your inbox' : 'Forgot your password?'}</h1>
          <p>
            {success
              ? 'Your reset link is on its way. Open it to set a new password and get back to running your yard.'
              : "No worries — it happens. Enter your email and we'll send a secure link to set a new password."}
          </p>
        </div>
      </section>

      <section className="auth-panel" aria-label="Password reset">
        <div className="panel-glow" aria-hidden="true"></div>

        {success ? (
          <div className="recovery-success">
            <span className="success-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" />
                <path d="m22 7-10 5L2 7" />
                <path d="m16 19 2 2 4-4" />
              </svg>
            </span>
            <h2>Check your email</h2>
            <p className="recovery-success__text">
              We sent a password reset link to <strong>{email}</strong>. Follow the instructions in the
              email to choose a new password.
            </p>
            <Link href="/login" className="submit-button submit-button--link">
              <span className="button-text">Back to sign in</span>
            </Link>
            <button
              type="button"
              className="link-button"
              onClick={() => { setSuccess(false); setEmail(''); setError('') }}
            >
              Didn't get the email? Try again
            </button>
          </div>
        ) : (
          <>
            <div className="panel-header">
              <span className="reset-tile" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" />
                  <circle cx="16.5" cy="7.5" r="0.5" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <div>
                <p>Password reset</p>
                <h2>
                  <span className="desktop-title">Reset your password</span>
                  <span className="mobile-title">Reset password</span>
                </h2>
              </div>
            </div>

            <form className="login-form" onSubmit={handleSubmit} noValidate>
              <div className="field">
                <label htmlFor="emailInput">Email address</label>
                <span className="input-with-icon">
                  <svg className="field-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
                    <path d="m3 6 9 6 9-6" />
                  </svg>
                  <input
                    id="emailInput"
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="Enter your account email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    required
                  />
                </span>
              </div>

              <button className={`submit-button ${loading ? 'is-loading' : ''}`} type="submit" disabled={loading}>
                <span className="button-text">Send reset link</span>
                <span className="button-loader" aria-hidden="true"></span>
              </button>

              {(error || loading) && (
                <p
                  className="form-status"
                  role="status"
                  aria-live="polite"
                  style={{ color: error ? '#ffb1a8' : 'rgba(225, 255, 172, 0.9)' }}
                >
                  {error || 'Sending your secure reset link…'}
                </p>
              )}
            </form>
          </>
        )}

        <div className="panel-footer">
          <Link href="/login">Back to sign in</Link>
          <span aria-hidden="true"></span>
          <Link href="/register">Register here</Link>
        </div>
      </section>
    </main>
  )
}
