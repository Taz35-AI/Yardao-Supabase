// supabase/functions/send-email/index.ts
// Transactional email via Resend — keeps the Resend API key server-side.
//
// Client contract:
//   supabase.functions.invoke('send-email', { body: { to, subject, html, from? } })
//   then reads Resend's response (e.g. `data.id`), or `data.error` on failure.
//
// Env (must be set as a function secret — NOT auto-injected):
//   RESEND_API_KEY — your Resend API key
//     supabase secrets set RESEND_API_KEY=re_xxx
//
// IMPORTANT — sender domain:
//   The `from` address must use a domain that has been VERIFIED in Resend
//   (Resend dashboard → Domains). Until a domain is verified, Resend will only
//   accept sends from its sandbox address. Update the default `from` below to a
//   verified Yardao sender (e.g. 'Yardao <noreply@yardao.app>').
//
// NOTE — this is for APP transactional email only (e.g. "your account was
//   created"). Supabase's own AUTH emails (signup verification, password reset,
//   magic-link / invite) are configured SEPARATELY in the Supabase dashboard
//   under Authentication → Emails → SMTP Settings, pointing at Resend's SMTP
//   relay (host smtp.resend.com, port 465/587, user "resend", pass = the Resend
//   API key). Those auth emails do NOT flow through this function.

import { handlePreflight, json } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  try {
    const { to, subject, html, from } = await req.json()

    if (!to || !subject || !html) {
      return json({ error: 'to, subject and html are required.' }, 400)
    }

    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) {
      return json({ error: 'Email service is not configured.' }, 500)
    }

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Default sender — Resend-verified domain (yardao.com).
        from: from || 'Yardao <noreply@yardao.com>',
        to,
        subject,
        html,
      }),
    })

    const data = await resp.json().catch(() => ({}))

    if (!resp.ok) {
      console.error('Resend API error:', resp.status, data)
      return json(
        { error: data?.message ?? `Resend API error: ${resp.status}` },
        resp.status,
      )
    }

    // Return Resend's response (typically `{ id: "..." }`).
    return json(data)
  } catch (e) {
    console.error('send-email failed:', e)
    return json({ error: e instanceof Error ? e.message : 'send-email failed.' }, 400)
  }
})
