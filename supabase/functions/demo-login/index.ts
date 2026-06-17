// supabase/functions/demo-login/index.ts
// One-tap demo sign-in for App Store reviewers (and prospects).
//
// Apple's reviewer must be able to get past the login screen. Rather than ship
// demo credentials inside the app bundle (where anyone could read them), the
// demo email/password live ONLY here as Edge Function secrets. The client calls
// this with no input; we sign in as the demo account server-side and return the
// session tokens, which the client applies via supabase.auth.setSession().
//
// Setup (owner):
//   1. Create a demo organisation + a demo user in Supabase (with sample data).
//   2. supabase secrets set DEMO_EMAIL=demo@yardao.com DEMO_PASSWORD=•••••••
//   3. supabase functions deploy demo-login
//   4. Set NEXT_PUBLIC_ENABLE_DEMO=true in the web env to show the button.
//
// Env (auto-injected): SUPABASE_URL, SUPABASE_ANON_KEY
// Secrets (owner-set):  DEMO_EMAIL, DEMO_PASSWORD

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handlePreflight, json } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const demoEmail = Deno.env.get('DEMO_EMAIL')
    const demoPassword = Deno.env.get('DEMO_PASSWORD')

    if (!demoEmail || !demoPassword) {
      return json({ error: 'Demo account is not configured.' }, 503)
    }

    const client = createClient(supabaseUrl, anonKey)
    const { data, error } = await client.auth.signInWithPassword({
      email: demoEmail,
      password: demoPassword,
    })
    if (error || !data?.session) {
      return json({ error: error?.message || 'Demo sign-in failed.' }, 400)
    }

    return json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    })
  } catch (e) {
    console.error('demo-login failed:', e)
    return json({ error: e instanceof Error ? e.message : 'demo-login failed.' }, 400)
  }
})
