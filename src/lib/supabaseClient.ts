// src/lib/supabaseClient.ts
// Single Supabase browser client shared by the web (PWA) and Capacitor (mobile)
// builds. Both ship the SAME static bundle and hit the SAME Supabase endpoints.
//
// Auth session storage:
//   * Web → default localStorage (handled by supabase-js).
//   * Capacitor native → @capacitor/preferences, so the session survives the
//     native webview / app restarts. We detect Capacitor at runtime and plug a
//     Preferences-backed storage adapter into the auth config.
//
// Env (set in .env.local — see .env.local.example):
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  // Surfaced loudly in dev; in prod these are baked in at build time.
  console.warn(
    '[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set.'
  )
}

// Capacitor Preferences adapter conforming to supabase-js' storage interface.
const capacitorStorage = {
  getItem: async (key: string) => (await Preferences.get({ key })).value,
  setItem: async (key: string, value: string) => {
    await Preferences.set({ key, value })
  },
  removeItem: async (key: string) => {
    await Preferences.remove({ key })
  },
}

const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(isNative ? { storage: capacitorStorage } : {}),
    persistSession: true,
    autoRefreshToken: true,
    // static export has no server callback route; tokens come back in the URL hash
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})
