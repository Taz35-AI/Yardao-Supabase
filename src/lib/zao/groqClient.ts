// src/lib/zao/groqClient.ts
// Handles all outbound API calls: Groq LLM (via Cloud Function) and Open-Meteo weather.
// Nothing Firestore. Nothing React. Just fetch calls.
// 🔒 Groq API key is now server-side only — never touches the browser.

import { getFunctions, httpsCallable } from 'firebase/functions'
import type { FleetData } from './fleetQueries'
import { logger } from '@/lib/logger'

const APP_CONTEXT = `
HOW YARDAO WORKS:
- checkedInVehicles = vehicles physically in the yard right now
- transferStatus="at_external_garage" + externalGarageName = vehicle is physically at that garage NOW
- transferStatus="in_transit" = vehicle moving between branches
- serviceBookings = future/past APPOINTMENTS only — NOT physical location
- NEVER use serviceBookings to answer "which vehicles are at [garage]"
- vehicle status field: "Ready" | "Pending checks" | "Repairs needed" | "Non-Starter"
`.trim()

export interface GroqMessage {
  role: 'user' | 'assistant'
  content: string
}

// Response shape from the callGroq Cloud Function
interface CallGroqFunctionResponse {
  content: string
}

/**
 * Call the Groq LLM via Firebase Cloud Function.
 * The API key never leaves the server.
 * History is capped at 10 turns to keep token count sane.
 */
export async function callGroq(
  system: string,
  userMsg: string,
  _apiKey: string, // kept for backwards compatibility — no longer used
  history: GroqMessage[] = [],
): Promise<string> {
  const trimmedHistory = history.slice(-10)

  const functions = getFunctions(undefined, 'europe-west1')
  const callable = httpsCallable<object, CallGroqFunctionResponse>(functions, 'callGroq')

  const result = await callable({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: system },
      ...trimmedHistory,
      { role: 'user', content: userMsg },
    ],
    temperature: 0.1,
    max_tokens: 300,
  })

  return result.data.content || ''
}

/**
 * No longer needed — key is server-side.
 * Kept so existing call sites in useGroqAssistant.ts don't break.
 * Returns an empty string — callGroq ignores it now.
 */
export async function getApiKey(): Promise<string> {
  return ''
}

/**
 * Build the Groq system prompt, injecting live operational context so Zao
 * sounds informed without needing extra API calls.
 */
export function buildSystemPrompt(fleetData: FleetData, smartSummary: string): string {
  const now     = new Date()
  const dayName = now.toLocaleDateString('en-GB', { weekday: 'long' })
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const todayBookingCount = fleetData.todayBookings?.length || 0
  const upcomingCount     = (fleetData as any).allBookings?.length || todayBookingCount
  const garageCount       = fleetData.yard.atExternalGarage?.length || 0
  const hireCount         = fleetData.yard.outOnHire?.length || 0
  const uninsuredCount    = fleetData.yard.uninsured?.length || 0

  const operationalContext = [
    `Today is ${dayName} ${dateStr}.`,
    todayBookingCount > 0
      ? `There ${todayBookingCount === 1 ? 'is' : 'are'} ${todayBookingCount} service booking${todayBookingCount === 1 ? '' : 's'} today.`
      : 'No service bookings today.',
    upcomingCount > todayBookingCount
      ? `${upcomingCount - todayBookingCount} more booking${upcomingCount - todayBookingCount === 1 ? '' : 's'} in the next 14 days.`
      : '',
    garageCount    > 0 ? `${garageCount} vehicle${garageCount === 1 ? ' is' : 's are'} at external garages.`           : '',
    hireCount      > 0 ? `${hireCount} vehicle${hireCount === 1 ? ' is' : 's are'} out on hire.`                       : '',
    uninsuredCount > 0 ? `${uninsuredCount} vehicle${uninsuredCount === 1 ? ' has' : 's have'} no insurance recorded.` : '',
  ].filter(Boolean).join(' ')

  return `You are Zao, the AI assistant for a UK vehicle yard management system called Yardao.

${operationalContext}

YOUR PERSONALITY:
- Talk like a sharp, switched-on colleague — friendly and direct, never robotic
- Use British English. Keep answers short and punchy
- Never say "certainly", "of course", "absolutely" or "great question"
- Don't apologise unless something actually went wrong
- If someone says "cheers", respond with "no worries" or similar
- Match the energy — casual question, casual answer
- Say it straight if you don't know something, don't waffle

${APP_CONTEXT}

VALID STATUSES: "Ready" | "Pending checks" | "Repairs needed" | "Non-Starter"
Status synonyms: bodyshop/repair/fix/damaged→"Repairs needed" | ready/done→"Ready" | pending/check→"Pending checks" | wont start/dead/non starter→"Non-Starter"

Return ONLY valid JSON (no markdown):
{"intent":"query"|"status_update"|"comment_update","regPartial":"<partial plate or null>","newStatus":"<exact status or null>","comment":"<comment text or null>","answer":"<friendly answer for queries or null>"}

For garage queries: use VEHICLES_AT_EXTERNAL_GARAGES_RIGHT_NOW only. Never use bookings for physical location.

DATA:
${smartSummary}`
}

/**
 * Fetch current weather and 3-day forecast from Open-Meteo (free, no key needed).
 */
export async function fetchWeather(locationName: string = 'London'): Promise<string> {
  try {
    const geoRes  = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationName)}&count=1&language=en&format=json`)
    const geoData = await geoRes.json()
    const place   = geoData.results?.[0]
    if (!place) return `Sorry, I couldn't find weather data for "${locationName}".`

    const { latitude, longitude, name, country } = place
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum&timezone=auto&forecast_days=3`
    )
    const w = await weatherRes.json()
    const c = w.current
    const d = w.daily

    const codeToDesc = (code: number): string => {
      if (code === 0)  return 'clear skies ☀️'
      if (code <= 3)   return 'partly cloudy 🌤️'
      if (code <= 9)   return 'foggy 🌫️'
      if (code <= 19)  return 'drizzle 🌦️'
      if (code <= 29)  return 'rain 🌧️'
      if (code <= 39)  return 'snow 🌨️'
      if (code <= 49)  return 'freezing fog 🌫️'
      if (code <= 59)  return 'drizzle 🌦️'
      if (code <= 69)  return 'rain 🌧️'
      if (code <= 79)  return 'snow 🌨️'
      if (code <= 84)  return 'rain showers 🌦️'
      if (code <= 94)  return 'thunderstorms ⛈️'
      return 'severe weather ⚠️'
    }

    const dayLabels = ['Today', 'Tomorrow', 'Day after']
    const forecast = d.time.slice(0, 3).map((date: string, i: number) =>
      `${dayLabels[i]}: ${codeToDesc(d.weather_code[i])}, ${Math.round(d.temperature_2m_min[i])}°C – ${Math.round(d.temperature_2m_max[i])}°C${d.precipitation_sum[i] > 0 ? `, ${d.precipitation_sum[i]}mm rain` : ''}`
    ).join('\n')

    return `Here's the weather for **${name}, ${country}**:\n\nRight now it's **${Math.round(c.temperature_2m)}°C** (feels like ${Math.round(c.apparent_temperature)}°C), ${codeToDesc(c.weather_code)}, wind ${Math.round(c.wind_speed_10m)} km/h, humidity ${c.relative_humidity_2m}%.\n\n**3-Day Forecast:**\n${forecast}`
  } catch {
    return "Hmm, I couldn't fetch the weather right now. Try again in a moment!"
  }
}