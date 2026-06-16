// src/app/register/page.tsx — "Request a demo" page (replaces self-serve
// register). Styled to match the login/forgot pages (premium dark-forest glass)
// but distinct: a calendar tile + "Request a demo" headline. Collects org
// details and stores them in the public.demo_requests table (see migration
// 0042_demo_requests.sql — run it in Supabase for this to work).
'use client'
import './request-demo.css'

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
    </main>
  )
}
