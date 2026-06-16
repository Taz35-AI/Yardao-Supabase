// src/app/register/page.tsx — "Request a demo" page (replaces self-serve
// register). Styled to match the login/forgot pages (premium dark-forest glass)
// but distinct: a calendar tile + "Request a demo" headline. Collects org
// details and stores them in the public.demo_requests table (see migration
// 0042_demo_requests.sql — run it in Supabase for this to work).
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { logger } from '@/lib/logger'

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

function buildDemoEmailHtml(d: Record<string, string | null>): string {
  const row = (label: string, value: string | null) =>
    value
      ? `<tr><td style="padding:5px 14px 5px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:5px 0;font-weight:600;color:#0f1f18">${esc(String(value))}</td></tr>`
      : ''
  return `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;color:#0f1f18">
      <h2 style="margin:0 0 2px;color:#025940">New demo request</h2>
      <p style="margin:0 0 16px;color:#6b7280;font-size:14px">Someone just requested a Yardao demo.</p>
      <table style="border-collapse:collapse;font-size:14px;width:100%">
        ${row('Name', d.full_name)}
        ${row('Work email', d.work_email)}
        ${row('Phone', d.phone)}
        ${row('Organization', d.organization_name)}
      </table>
    </div>`
}

export default function RequestDemoPage() {
  const [fullName, setFullName] = useState('')
  const [workEmail, setWorkEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [organizationName, setOrganizationName] = useState('')

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!fullName.trim() || !workEmail.trim() || !phone.trim() || !organizationName.trim()) {
      setError('Please fill in your name, phone, work email and organization.')
      return
    }

    setLoading(true)
    try {
      const payload = {
        full_name: fullName.trim(),
        work_email: workEmail.trim(),
        phone: phone.trim(),
        organization_name: organizationName.trim(),
      }
      const { error: insertError } = await supabase.from('demo_requests').insert(payload)
      if (insertError) throw insertError

      // Notify the team via the existing Resend-backed edge function. Best-effort:
      // the request is already saved, so an email hiccup must not fail the user.
      try {
        await supabase.functions.invoke('send-email', {
          body: {
            to: 'support@yardao.com',
            subject: `New demo request — ${payload.organization_name}`,
            html: buildDemoEmailHtml(payload),
          },
        })
      } catch (mailErr) {
        logger.error('Demo request email failed (request still saved):', mailErr)
      }

      setSuccess(true)
    } catch (err: any) {
      logger.error('Demo request error:', err)
      setError('Something went wrong sending your request. Please try again, or email support@yardao.com.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-shell login-shell--demo" aria-labelledby="page-title">
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
          <p className="eyebrow eyebrow--demo">See Yardao on your yard</p>
          <h1 id="page-title">{success ? "You're all set" : 'Request a demo'}</h1>
          <p>
            {success
              ? "Thanks — your request is in. Our team will be in touch shortly to set up a walkthrough tailored to your operation."
              : 'Tell us a little about your operation and we’ll set up a tailored walkthrough of Yardao — yard view, service, stock, invoicing, compliance and more.'}
          </p>
          {!success && (
            <ul className="demo-points" aria-hidden="true">
              <li>Personalised to your fleet &amp; sites</li>
              <li>No commitment, no card</li>
              <li>UK support team</li>
            </ul>
          )}
        </div>
      </section>

      <section className="auth-panel" aria-label="Request a demo form">
        <div className="panel-glow" aria-hidden="true"></div>

        {success ? (
          <div className="recovery-success">
            <span className="success-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
                <path d="M3 9h18M8 2.5v4M16 2.5v4" />
                <path d="m8.5 14.5 2.2 2.2 4.3-4.4" />
              </svg>
            </span>
            <h2>Request received</h2>
            <p className="recovery-success__text">
              Thanks <strong>{fullName.split(' ')[0] || 'there'}</strong> — we’ll reach out to{' '}
              <strong>{workEmail}</strong> to schedule your Yardao demo.
            </p>
            <Link href="/" className="submit-button submit-button--link">
              <span className="button-text">Back to home</span>
            </Link>
            <Link href="/login" className="link-button">Already have an account? Sign in</Link>
          </div>
        ) : (
          <>
            <div className="panel-header">
              <span className="demo-tile" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
                  <path d="M3 9h18M8 2.5v4M16 2.5v4" />
                  <path d="m9 14 2 2 4-4" />
                </svg>
              </span>
              <div>
                <p>Let&apos;s talk</p>
                <h2>
                  <span className="desktop-title">Request your demo</span>
                  <span className="mobile-title">Request a demo</span>
                </h2>
              </div>
            </div>

            <form className="login-form" onSubmit={handleSubmit} noValidate>
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="fullName">Full name</label>
                  <input id="fullName" type="text" autoComplete="name" placeholder="Your name"
                    value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={loading} required />
                </div>
                <div className="field">
                  <label htmlFor="phone">Phone</label>
                  <input id="phone" type="tel" autoComplete="tel" placeholder="e.g. 07700 900123"
                    value={phone} onChange={(e) => setPhone(e.target.value)} disabled={loading} required />
                </div>
              </div>

              <div className="field">
                <label htmlFor="workEmail">Work email</label>
                <input id="workEmail" type="email" autoComplete="email" placeholder="you@company.co.uk"
                  value={workEmail} onChange={(e) => setWorkEmail(e.target.value)} disabled={loading} required />
              </div>

              <div className="field">
                <label htmlFor="organizationName">Organization name</label>
                <input id="organizationName" type="text" autoComplete="organization" placeholder="Your company"
                  value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} disabled={loading} required />
              </div>

              <button className={`submit-button ${loading ? 'is-loading' : ''}`} type="submit" disabled={loading}>
                <span className="button-text">Request my demo</span>
                <span className="button-loader" aria-hidden="true"></span>
              </button>

              {(error || loading) && (
                <p className="form-status" role="status" aria-live="polite"
                  style={{ color: error ? '#ffb1a8' : 'rgba(225, 255, 172, 0.9)' }}>
                  {error || 'Sending your request…'}
                </p>
              )}
            </form>
          </>
        )}

        <div className="panel-footer">
          <Link href="/login">Already a customer? Sign in</Link>
          <span aria-hidden="true"></span>
          <Link href="/">Back to home</Link>
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
        .login-shell button, .login-shell input, .login-shell select, .login-shell textarea { font: inherit; }
        .login-shell a { color: inherit; text-decoration: none; }

        .login-shell {
          position: relative;
          display: grid;
          grid-template-columns: minmax(380px, 0.94fr) minmax(380px, 460px);
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
          gap: clamp(1.25rem, 3vw, 2.25rem); min-height: min(720px, 84vh); justify-self: center;
          width: min(560px, 100%); transform: translateY(clamp(-1.5rem, -2vw, -0.5rem));
        }
        .favicon-orbit { position: relative; width: clamp(200px, 30vw, 400px); aspect-ratio: 1; display: grid; place-items: center; }
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
        .login-shell h1 { margin-bottom: 0.9rem; font-size: clamp(2.1rem, 5vw, 4.4rem); line-height: 0.98; letter-spacing: 0; text-wrap: balance; font-weight: 800; }
        .brand-copy p:last-child, .brand-copy p:nth-of-type(2) { max-width: 32rem; margin-bottom: 0; color: var(--muted); font-size: clamp(1rem, 1.4vw, 1.12rem); line-height: 1.65; }
        .demo-points { list-style: none; margin: 1.4rem 0 0; padding: 0; display: grid; gap: 0.6rem; }
        .demo-points li { position: relative; padding-left: 1.6rem; color: var(--muted); font-size: 0.95rem; }
        .demo-points li::before {
          content: ""; position: absolute; left: 0; top: 0.15rem; width: 1.05rem; height: 1.05rem; border-radius: 999px;
          background: rgba(214, 255, 47, 0.16) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23d6ff2f' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m20 6-11 11-5-5'/%3E%3C/svg%3E") center / 0.7rem no-repeat;
          border: 1px solid rgba(214, 255, 47, 0.4);
        }

        .auth-panel {
          position: relative; width: 100%; justify-self: center; padding: clamp(1.25rem, 3vw, 1.9rem);
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

        .panel-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
        .panel-header h2 { margin: 0; font-size: clamp(1.4rem, 3vw, 1.8rem); font-weight: 800; }
        .mobile-title { display: none; }

        .demo-tile {
          display: inline-grid; place-items: center; width: 3.2rem; height: 3.2rem; border-radius: 1.15rem; flex-shrink: 0;
          background: linear-gradient(140deg, rgba(214, 255, 47, 0.95), rgba(255, 138, 0, 0.9));
          color: #06210f; box-shadow: 0 0 30px rgba(212, 255, 44, 0.36);
        }
        .demo-tile svg { width: 1.65rem; height: 1.65rem; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }

        .login-form { display: grid; gap: 0.85rem; }
        .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; }
        .field { display: grid; gap: 0.4rem; min-width: 0; }
        .field > label { color: rgba(239, 255, 246, 0.82); font-size: 0.84rem; font-weight: 700; }
        .field .optional { color: var(--soft); font-weight: 600; }
        .field input, .field select, .field textarea {
          width: 100%; min-height: 3rem; border: 1px solid rgba(226, 255, 177, 0.18); border-radius: 14px;
          outline: none; background: rgba(2, 22, 15, 0.62); color: var(--ink); padding: 0 0.95rem;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
          transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
        }
        .field textarea { min-height: 4.75rem; padding: 0.7rem 0.95rem; resize: vertical; line-height: 1.5; }
        .field input::placeholder, .field textarea::placeholder { color: rgba(239, 255, 246, 0.42); }
        .field select { appearance: none; -webkit-appearance: none; padding-right: 2.5rem; cursor: pointer;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23d6ff2f' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 0.85rem center; background-size: 1.05rem;
        }
        .field select:invalid { color: rgba(239, 255, 246, 0.42); }
        .field input:focus, .field select:focus, .field textarea:focus {
          border-color: rgba(215, 255, 47, 0.72); background: rgba(2, 28, 19, 0.82);
          box-shadow: 0 0 0 4px rgba(215, 255, 47, 0.12), 0 0 28px rgba(215, 255, 47, 0.16);
        }

        .submit-button {
          position: relative; display: inline-flex; align-items: center; justify-content: center; min-height: 3.35rem;
          border: 0; border-radius: 16px; overflow: hidden; width: 100%; text-align: center; margin-top: 0.15rem;
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

        .form-status { min-height: 1.25rem; margin: 0.1rem 0 0; font-size: 0.88rem; line-height: 1.4; }

        .recovery-success { display: grid; justify-items: center; text-align: center; gap: 0.65rem; padding: 0.5rem 0 0.25rem; }
        .success-mark {
          display: inline-grid; place-items: center; width: 4.25rem; height: 4.25rem; border-radius: 999px; margin-bottom: 0.35rem;
          background: radial-gradient(circle at 50% 35%, rgba(214, 255, 47, 0.28), rgba(255, 138, 0, 0.16));
          border: 1px solid rgba(214, 255, 47, 0.4); box-shadow: 0 0 36px rgba(214, 255, 47, 0.22);
          color: var(--lime-bright);
        }
        .success-mark svg { width: 2rem; height: 2rem; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
        .recovery-success h2 { margin: 0; font-size: clamp(1.5rem, 3vw, 1.9rem); font-weight: 800; }
        .recovery-success__text { margin: 0 0 0.4rem; max-width: 25rem; color: var(--muted); font-size: 0.94rem; line-height: 1.6; }
        .recovery-success__text strong { color: var(--ink); }
        .submit-button--link { text-decoration: none; max-width: 22rem; margin: 0.35rem auto 0; }
        .link-button {
          margin-top: 0.15rem; border: 0; background: transparent; color: var(--lime-bright); font-weight: 700;
          font-size: 0.86rem; cursor: pointer;
        }
        .link-button:hover { text-decoration: underline; text-underline-offset: 0.24em; }

        .panel-footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 1.3rem; padding-top: 1.15rem; border-top: 1px solid rgba(226, 255, 177, 0.12); color: var(--soft); font-size: 0.84rem; }
        .panel-footer a { color: var(--lime-bright); font-weight: 700; }
        .panel-footer a:hover { text-decoration: underline; text-underline-offset: 0.24em; }
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
          .favicon-orbit { width: min(240px, 64vw); }
          .demo-points { display: none; }
          .brand-copy { max-width: 36rem; }
          .auth-panel { max-width: 520px; margin: 0 auto; }
        }
        @media (max-width: 520px) {
          body {
            background:
              linear-gradient(108deg, rgba(210, 255, 45, 0.09), rgba(255, 204, 48, 0.055) 52%, transparent 78%),
              linear-gradient(145deg, #02160f, #063420 70%, #101e0d);
          }
          .login-shell { min-height: 100svh; align-content: start; gap: 1rem; padding: 0.6rem; width: 100%; }
          .ambient-grid { opacity: 0.8; }
          .light-beam { width: 42rem; height: 22rem; opacity: 0.42; }
          .brand-copy { display: none; }
          .brand-stage { display: block; min-height: auto; margin: 0.4rem 0 -0.2rem; }
          .favicon-orbit { width: min(120px, 34vw); margin: 0 auto; }
          .favicon-orbit::before { filter: blur(18px); }
          .favicon-orbit::after { inset: 13%; }
          .favicon-orbit img { width: 84%; animation: none; }
          .orbital-ring::before { width: 0.6rem; height: 0.6rem; }
          .auth-panel { border-radius: 20px; max-width: 560px; padding: 0.9rem; }
          .field-grid { grid-template-columns: 1fr; gap: 0.55rem; }
          .panel-header { gap: 0.75rem; margin-bottom: 0.85rem; }
          .demo-tile { width: 2.55rem; height: 2.55rem; border-radius: 0.9rem; }
          .demo-tile svg { width: 1.35rem; height: 1.35rem; }
          .panel-header p { margin-bottom: 0.3rem; font-size: 0.68rem; }
          .panel-header h2 { font-size: clamp(1.25rem, 7vw, 1.5rem); }
          .desktop-title { display: none; }
          .mobile-title { display: inline; }
          .login-form { gap: 0.55rem; }
          .field { gap: 0.32rem; }
          .field > label, .panel-footer, .form-status { font-size: 0.8rem; }
          .field input, .field select { min-height: 2.7rem; border-radius: 12px; }
          .submit-button { min-height: 2.85rem; border-radius: 13px; }
          .panel-footer { flex-wrap: wrap; gap: 0.45rem 0.65rem; margin-top: 0.7rem; padding-top: 0.75rem; }
          .panel-footer span { display: inline-block; }
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
