// src/app/login/page.tsx — Premium dark-forest login, ported from the design
// example the owner dropped in this folder (index.html). Structure + CSS match
// that mock; wired to the real Supabase auth logic (email/password). The CSS is
// injected via styled-jsx global so the element/keyframe selectors resolve
// regardless of the app's Tailwind build.
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { completePendingOrgSetup } from '@/lib/orgSetup'
import { logger } from '@/lib/logger'
import { isUserActive, isUserDeleted } from '@/types'

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

      <style jsx global>{`
        :root {
          color-scheme: dark;
          --ink: #effff6;
          --muted: rgba(239, 255, 246, 0.72);
          --soft: rgba(239, 255, 246, 0.5);
          --lime: #b5ee21;
          --lime-bright: #d6ff2f;
          --gold: #ffd038;
          --orange: #ff8a00;
          --panel: rgba(4, 33, 25, 0.66);
          --panel-border: rgba(211, 255, 70, 0.24);
          --shadow: rgba(0, 0, 0, 0.36);
        }
        body {
          margin: 0;
          background:
            radial-gradient(ellipse 70vw 52vh at 16% 42%, rgba(214, 255, 47, 0.12), transparent 68%),
            radial-gradient(ellipse 72vw 44vh at 54% 50%, rgba(255, 204, 48, 0.055), transparent 72%),
            linear-gradient(130deg, #02160f 0%, #042a1d 38%, #073923 63%, #111d0d 100%);
          color: var(--ink);
          overflow-x: hidden;
        }
        .login-shell, .login-shell * { box-sizing: border-box; }
        .login-shell button, .login-shell input { font: inherit; }
        .login-shell a { color: inherit; text-decoration: none; }

        .login-shell {
          position: relative;
          display: grid;
          grid-template-columns: minmax(380px, 0.98fr) minmax(360px, 430px);
          gap: clamp(2.5rem, 5vw, 5rem);
          align-items: center;
          width: min(1180px, calc(100% - 2.5rem));
          min-height: 100vh;
          margin: 0 auto;
          padding: clamp(1.25rem, 4vw, 4.5rem) 0;
          isolation: isolate;
          overflow: visible;
          font-family: var(--font-geist-sans), Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        }

        .ambient-grid, .light-beam, .sparkles { pointer-events: none; position: fixed; }
        .panel-glow { pointer-events: none; position: absolute; }
        .ambient-grid {
          inset: -18vmax; z-index: -4;
          background: radial-gradient(ellipse 95vw 58vh at 30% 48%, rgba(214, 255, 47, 0.06), transparent 76%);
        }
        .light-beam {
          z-index: -3; top: 48%; left: 36%; width: 136vw; height: 78vh; border-radius: 50%;
          background:
            radial-gradient(ellipse at 18% 45%, rgba(214, 255, 47, 0.16), transparent 38%),
            radial-gradient(ellipse at 48% 52%, rgba(255, 213, 55, 0.09), transparent 52%),
            radial-gradient(ellipse at 74% 56%, rgba(255, 138, 0, 0.04), transparent 58%);
          filter: blur(92px); opacity: 0.5;
          transform: translate(-50%, -50%) rotate(5deg);
          animation: beam-pulse 7s ease-in-out infinite; will-change: opacity, transform;
        }
        .sparkles { inset: 0; z-index: -1; }
        .sparkles span {
          position: absolute; width: 0.5rem; height: 0.5rem; border-radius: 999px;
          background: var(--lime-bright); box-shadow: 0 0 18px 4px rgba(216, 255, 47, 0.78);
          opacity: 0; animation: twinkle 3.8s ease-in-out infinite;
        }
        .sparkles span:nth-child(1) { top: 20%; left: 38%; }
        .sparkles span:nth-child(2) { top: 28%; left: 62%; animation-delay: 1.1s; background: var(--gold); }
        .sparkles span:nth-child(3) { top: 69%; left: 34%; animation-delay: 2s; }
        .sparkles span:nth-child(4) { top: 72%; right: 18%; animation-delay: 2.7s; background: var(--orange); }

        .brand-stage {
          position: relative; display: grid; align-content: center; justify-items: start;
          gap: clamp(1.5rem, 4vw, 3rem); min-height: min(720px, 84vh); justify-self: center;
          width: min(560px, 100%); transform: translateY(clamp(-2.25rem, -3vw, -1.25rem));
        }
        .favicon-orbit { position: relative; width: clamp(220px, 34vw, 440px); aspect-ratio: 1; display: grid; place-items: center; }
        .favicon-orbit::before, .favicon-orbit::after { content: ""; position: absolute; border-radius: 999px; inset: 5%; }
        .favicon-orbit::before {
          background:
            radial-gradient(circle, rgba(216, 255, 47, 0.13), transparent 54%),
            conic-gradient(from 210deg, rgba(255, 138, 0, 0.22), rgba(214, 255, 47, 0.2), rgba(255, 255, 255, 0), rgba(255, 138, 0, 0.18));
          filter: blur(22px); animation: halo-breathe 5.6s ease-in-out infinite;
        }
        .favicon-orbit::after {
          inset: 17%; border: 1px solid rgba(218, 255, 57, 0.08);
          box-shadow: inset 0 0 14px rgba(218, 255, 57, 0.04), 0 0 36px rgba(255, 157, 0, 0.08);
        }
        .favicon-orbit img {
          position: relative; z-index: 2; width: 84%; height: auto; object-fit: contain;
          filter: drop-shadow(0 20px 30px rgba(0, 0, 0, 0.34)) drop-shadow(0 0 16px rgba(219, 255, 50, 0.22));
          animation: float-mark 6s ease-in-out infinite;
        }
        .orbital-ring { position: absolute; inset: 6%; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.06); transform: rotate(-18deg) skew(4deg); }
        .orbital-ring::before {
          content: ""; position: absolute; top: 12%; right: 16%; width: 1rem; height: 1rem; border-radius: 999px;
          background: #fff8ba; box-shadow: 0 0 8px rgba(255, 248, 186, 0.45), 0 0 16px rgba(255, 208, 56, 0.24);
        }

        .brand-copy { max-width: 620px; }
        .eyebrow, .panel-header p {
          margin: 0 0 0.55rem; color: var(--lime-bright); font-size: 0.78rem; font-weight: 800;
          letter-spacing: 0.16em; text-transform: uppercase;
        }
        .login-shell h1, .login-shell h2, .login-shell p { margin-top: 0; }
        .login-shell h1 { margin-bottom: 0.9rem; font-size: clamp(2.25rem, 5.4vw, 4.8rem); line-height: 0.98; letter-spacing: 0; text-wrap: balance; font-weight: 800; }
        .brand-copy p:last-child { max-width: 32rem; margin-bottom: 0; color: var(--muted); font-size: clamp(1rem, 1.5vw, 1.18rem); line-height: 1.7; }

        .auth-panel {
          position: relative; width: 100%; justify-self: center; padding: clamp(1.25rem, 3vw, 2rem);
          border: 1px solid var(--panel-border); border-radius: 28px;
          background: linear-gradient(150deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.035)), var(--panel);
          box-shadow: 0 28px 80px var(--shadow), inset 0 1px 0 rgba(255, 255, 255, 0.13);
          backdrop-filter: blur(24px); overflow: hidden;
        }
        .auth-panel::before {
          content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px;
          background: linear-gradient(135deg, rgba(214, 255, 47, 0.64), transparent 36%, rgba(255, 138, 0, 0.46));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude; pointer-events: none;
        }
        .panel-glow { inset: auto -30% -42% 20%; height: 14rem; border-radius: 999px; background: rgba(209, 255, 37, 0.18); filter: blur(46px); }

        .panel-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; }
        .panel-header img { width: 3.2rem; height: 3.2rem; object-fit: contain; filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.35)) drop-shadow(0 0 14px rgba(212, 255, 44, 0.34)); }
        .panel-header h2 { margin: 0; font-size: clamp(1.45rem, 3vw, 1.9rem); font-weight: 800; }
        .mobile-title { display: none; }

        .login-form { display: grid; gap: 1rem; }
        .field { display: grid; gap: 0.5rem; }
        .field > label { color: rgba(239, 255, 246, 0.82); font-size: 0.86rem; font-weight: 700; }
        .field input {
          width: 100%; min-height: 3.25rem; border: 1px solid rgba(226, 255, 177, 0.18); border-radius: 16px;
          outline: none; background: rgba(2, 22, 15, 0.62); color: var(--ink); padding: 0 1rem;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
          transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
        }
        .field input::placeholder { color: rgba(239, 255, 246, 0.42); }
        .field input:focus {
          border-color: rgba(215, 255, 47, 0.72); background: rgba(2, 28, 19, 0.82);
          box-shadow: 0 0 0 4px rgba(215, 255, 47, 0.12), 0 0 28px rgba(215, 255, 47, 0.16);
        }
        .password-wrap { position: relative; display: block; }
        .password-wrap input { padding-right: 3.5rem; }
        .icon-button {
          position: absolute; top: 50%; right: 0.55rem; display: inline-grid; place-items: center;
          width: 2.25rem; height: 2.25rem; border: 0; border-radius: 12px; background: rgba(215, 255, 47, 0.1);
          color: var(--lime-bright); cursor: pointer; transform: translateY(-50%);
          transition: background 180ms ease, color 180ms ease;
        }
        .icon-button:hover, .icon-button:focus-visible { background: rgba(215, 255, 47, 0.18); color: #ffffff; }
        .icon-button svg { width: 1.2rem; height: 1.2rem; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

        .form-row, .panel-footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
        .form-row { margin: 0.1rem 0 0.35rem; color: var(--muted); font-size: 0.88rem; }
        .remember { display: inline-flex; align-items: center; gap: 0.5rem; cursor: pointer; }
        .remember input { width: 1rem; height: 1rem; accent-color: var(--lime); }
        .form-row a, .panel-footer a { color: var(--lime-bright); font-weight: 700; }
        .form-row a:hover, .panel-footer a:hover { text-decoration: underline; text-underline-offset: 0.24em; }

        .submit-button {
          position: relative; display: inline-flex; align-items: center; justify-content: center; min-height: 3.35rem;
          border: 0; border-radius: 16px; overflow: hidden;
          background: linear-gradient(100deg, var(--orange), var(--gold) 34%, var(--lime-bright) 76%, var(--lime));
          color: #082313; font-weight: 900; cursor: pointer;
          box-shadow: 0 18px 40px rgba(173, 255, 36, 0.19), 0 10px 24px rgba(255, 138, 0, 0.12);
        }
        .submit-button::before {
          content: ""; position: absolute; inset: 0;
          background: linear-gradient(110deg, transparent, rgba(255, 255, 255, 0.52), transparent);
          transform: translateX(-120%); transition: transform 520ms ease;
        }
        .submit-button:hover::before, .submit-button:focus-visible::before { transform: translateX(120%); }
        .submit-button:disabled { cursor: wait; opacity: 0.82; }
        .button-text, .button-loader { position: relative; z-index: 1; }
        .button-loader {
          display: none; width: 1.15rem; height: 1.15rem; border: 2px solid rgba(8, 35, 19, 0.28);
          border-top-color: #082313; border-radius: 999px; animation: spin 800ms linear infinite;
        }
        .submit-button.is-loading .button-text { display: none; }
        .submit-button.is-loading .button-loader { display: inline-block; }

        .form-status { min-height: 1.25rem; margin: 0; font-size: 0.88rem; line-height: 1.4; }
        .panel-footer { margin-top: 1.4rem; padding-top: 1.25rem; border-top: 1px solid rgba(226, 255, 177, 0.12); color: var(--soft); font-size: 0.86rem; }
        .panel-footer span { width: 0.24rem; height: 0.24rem; border-radius: 999px; background: rgba(239, 255, 246, 0.36); }

        @keyframes beam-pulse {
          0%, 100% { opacity: 0.46; transform: translate(-50%, -50%) rotate(5deg) scale(0.98); }
          50% { opacity: 0.62; transform: translate(-50%, -50%) rotate(5deg) scale(1.03); }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0; transform: scale(0.4); }
          45%, 58% { opacity: 1; transform: scale(1); }
        }
        @keyframes halo-breathe {
          0%, 100% { opacity: 0.34; transform: scale(0.96); }
          50% { opacity: 0.52; transform: scale(1.04); }
        }
        @keyframes float-mark {
          0%, 100% { transform: translateY(0) rotate(-2deg); }
          50% { transform: translateY(-1rem) rotate(2deg); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 920px) {
          .login-shell { grid-template-columns: 1fr; gap: 1.5rem; align-content: start; padding: 1.25rem; }
          .brand-stage { min-height: auto; justify-items: center; gap: 1rem; text-align: center; justify-self: center; transform: none; width: 100%; }
          .favicon-orbit { width: min(280px, 76vw); }
          .brand-copy { max-width: 36rem; }
          .auth-panel { max-width: 460px; margin: 0 auto; }
        }
        @media (max-width: 520px) {
          body {
            background:
              linear-gradient(108deg, rgba(210, 255, 45, 0.09), rgba(255, 204, 48, 0.055) 52%, transparent 78%),
              linear-gradient(145deg, #02160f, #063420 70%, #101e0d);
          }
          .login-shell { min-height: 100svh; align-content: center; gap: 1.15rem; padding: 0.35rem; width: 100%; }
          .ambient-grid { opacity: 0.8; }
          .light-beam { width: 42rem; height: 22rem; opacity: 0.42; }
          .brand-copy { display: none; }
          .brand-stage { display: block; min-height: auto; margin-top: -1.35rem; margin-bottom: 0; }
          .favicon-orbit { width: min(150px, 43vw); margin: 0 auto; }
          .favicon-orbit::before { filter: blur(18px); }
          .favicon-orbit::after { inset: 13%; }
          .favicon-orbit img { width: 70%; animation: none; }
          .orbital-ring::before { width: 0.65rem; height: 0.65rem; }
          .login-shell h1 { font-size: clamp(2rem, 11vw, 3rem); }
          .auth-panel { border-radius: 20px; max-width: 520px; padding: 0.85rem; }
          .panel-header { gap: 0.75rem; margin-bottom: 0.8rem; }
          .panel-header img { width: 2.55rem; height: 2.55rem; border-radius: 0.9rem; }
          .panel-header p { margin-bottom: 0.3rem; font-size: 0.68rem; }
          .panel-header h2 { font-size: clamp(1.25rem, 7vw, 1.55rem); }
          .desktop-title { display: none; }
          .mobile-title { display: inline; }
          .login-form { gap: 0.58rem; }
          .field { gap: 0.38rem; }
          .field > label, .form-row, .panel-footer, .form-status { font-size: 0.8rem; }
          .field input { min-height: 2.55rem; border-radius: 13px; padding: 0 0.85rem; }
          .password-wrap input { padding-right: 3.1rem; }
          .icon-button { width: 2rem; height: 2rem; border-radius: 10px; }
          .submit-button { min-height: 2.7rem; border-radius: 13px; }
          .form-row, .panel-footer { align-items: center; flex-direction: row; flex-wrap: wrap; gap: 0.45rem 0.65rem; }
          .panel-footer span { display: inline-block; }
          .panel-footer { margin-top: 0.45rem; padding-top: 0.65rem; }
        }
        @media (prefers-reduced-motion: reduce) {
          .login-shell *, .login-shell *::before, .login-shell *::after {
            animation-duration: 1ms !important; animation-iteration-count: 1 !important;
          }
        }
      `}</style>
    </main>
  )
}
