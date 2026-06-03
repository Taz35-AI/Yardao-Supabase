// src/lib/groqNoteParser.ts
// ─────────────────────────────────────────────────────────────────────────────
// Groq Smart Note Parser — COMPREHENSIVE UK BODYSHOP VERSION
// Handles: multi-vehicle emails, WhatsApp messages, informal yard notes,
// postcodes, staff names, time slang, parts orders, supplier calls, and more.
// ✅ v2: adds scheduledTime (HH:mm | null) — triggers countdown reminders
// 🔒 Groq API key is now server-side only — calls Cloud Function instead.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabaseClient'
import { logger } from '@/lib/logger'

export interface ParsedNote {
  summary: string
  vehicleReg: string | null
  date: string
  scheduledTime: string | null   // ← NEW: HH:mm (24h) or null
  priority: 'low' | 'medium' | 'urgent'
  category: 'vehicle' | 'work' | 'personal' | 'finance'
  rawText: string
  contactDetails?: {
    company: string
    phones: string[]
    emails: string[]
    url: string
  } | null
}

// Response shape from the callGroq Cloud Function
interface CallGroqFunctionResponse {
  content: string
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getTodayString() {
  return new Date().toISOString().split('T')[0]
}

function getNextWeekday(dayName: string): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const targetDay = days.indexOf(dayName.toLowerCase())
  if (targetDay === -1) return getTodayString()
  const today = new Date()
  const todayDay = today.getDay()
  let daysAhead = targetDay - todayDay
  if (daysAhead <= 0) daysAhead += 7
  const result = new Date(today)
  result.setDate(today.getDate() + daysAhead)
  return result.toISOString().split('T')[0]
}

function addDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function extractUrls(text: string): string[] {
  return text.match(/https?:\/\/[^\s]+/g) || []
}

// ─── Web scraper ─────────────────────────────────────────────────────────────

interface ScrapeResult {
  title: string
  description: string
  phones: string[]
  emails: string[]
  domain: string
}

async function scrapeUrl(url: string): Promise<ScrapeResult | null> {
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    const html: string = data.contents || ''
    if (!html) return null

    const titleMatch = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i)
    const rawTitle = titleMatch ? titleMatch[1] : ''
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,120})["']/i)
    const ogTitle = ogTitleMatch ? ogTitleMatch[1].trim() : ''
    const title = (rawTitle || ogTitle)
      .replace(/&amp;/g, '&').replace(/&#\d+;/g, '').replace(/&[a-z]+;/gi, '').trim()

    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i)
      || html.match(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+name=["']description["']/i)
    const description = descMatch ? descMatch[1].trim() : ''

    const telHrefMatches = [...html.matchAll(/href=["']tel:([+\d\s\-().]{7,20})["']/gi)]
    const telPhones = telHrefMatches.map(m => m[1].trim())
    const ukPhoneMatches = [...html.matchAll(/(?<![a-zA-Z0-9@])((?:\+44|0)[\s\-.]?(?:\d[\s\-.]?){9,11}\d)(?![a-zA-Z0-9])/g)]
    const rawPhones = ukPhoneMatches.map(m => m[1].trim())
    const allPhones = [...new Set([...telPhones, ...rawPhones])]
      .map(p => p.replace(/[\s\-.()\u00a0]+/g, ' ').trim())
      .filter(p => { const d = p.replace(/\D/g, ''); return d.length >= 10 && d.length <= 13 })
      .slice(0, 3)

    const mailtoMatches = [...html.matchAll(/href=["']mailto:([^"'?&\s]{3,80})["']/gi)]
    const mailtoEmails = mailtoMatches.map(m => m[1].toLowerCase().trim())
    const emailMatches = [...(html.match(/[a-zA-Z0-9._%+\-]{1,40}@[a-zA-Z0-9.\-]{1,40}\.[a-zA-Z]{2,6}/g) || [])]
    const allEmails = [...new Set([...mailtoEmails, ...emailMatches])]
      .map(e => e.toLowerCase())
      .filter(e => !e.includes('example.') && !e.includes('sentry.') && !e.includes('schema.') && !e.includes('@2x.') && !e.match(/\.(png|jpg|gif|svg|webp)$/))
      .slice(0, 2)

    const domain = new URL(url).hostname.replace('www.', '')
    return { title, description, phones: allPhones, emails: allEmails, domain }
  } catch {
    return null
  }
}

// ─── Time string normaliser → HH:mm or null ──────────────────────────────────

function parseTime(raw: any): string | null {
  if (!raw || typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s || s === 'null') return null

  const hhmm = s.match(/^(\d{1,2}):(\d{2})$/)
  if (hhmm) {
    const h = parseInt(hhmm[1]), m = parseInt(hhmm[2])
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59)
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
  }

  const ampm = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  if (ampm) {
    let h = parseInt(ampm[1])
    const m = ampm[2] ? parseInt(ampm[2]) : 0
    const period = ampm[3].toLowerCase()
    if (period === 'pm' && h !== 12) h += 12
    if (period === 'am' && h === 12) h = 0
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59)
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
  }

  const hhmmAnywhere = s.match(/(\d{1,2}):(\d{2})/)
  if (hhmmAnywhere) {
    const h = parseInt(hhmmAnywhere[1]), m = parseInt(hhmmAnywhere[2])
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59)
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
  }

  return null
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function parseMessageWithGroq(rawText: string): Promise<ParsedNote[]> {
  // ── Step 1: Scrape any URLs ──────────────────────────────────────────────────
  let enrichedText = rawText
  let contactDetails: ParsedNote['contactDetails'] = null

  const urls = extractUrls(rawText)
  if (urls.length > 0) {
    const results = await Promise.all(urls.map(async (url) => ({ url, scraped: await scrapeUrl(url) })))
    for (const { url, scraped } of results) {
      if (!scraped) continue
      const contextParts = [`[Page: ${scraped.title}`]
      if (scraped.description) contextParts.push(scraped.description)
      if (scraped.phones.length > 0) contextParts.push(`Tel: ${scraped.phones.join(', ')}`)
      if (scraped.emails.length > 0) contextParts.push(`Email: ${scraped.emails.join(', ')}`)
      contextParts.push(']')
      enrichedText = enrichedText.replace(url, `${url} ${contextParts.join(' — ')}`)
      if (scraped.phones.length > 0 || scraped.emails.length > 0) {
        contactDetails = { company: scraped.title || scraped.domain, phones: scraped.phones, emails: scraped.emails, url }
      }
    }
  }

  // ── Step 2: Build date context ───────────────────────────────────────────────
  const today     = getTodayString()
  const todayDate = new Date()
  const todayName = todayDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const weekdays  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const nextDates = weekdays.map(d => `next ${d} = ${getNextWeekday(d)}`).join(', ')

  const tomorrow      = addDays(1)
  const dayAfter      = addDays(2)
  const endOfWeek     = getNextWeekday('friday')
  const startNextWeek = getNextWeekday('monday')

  // ── Step 3: The comprehensive prompt ────────────────────────────────────────
  const prompt = `You are an intelligent note-taking assistant for Yardao, a UK vehicle yard management system used by bodyshops and automotive businesses.

Today is ${today} (${todayName}).
Tomorrow = ${tomorrow}
Day after tomorrow = ${dayAfter}
End of this week (Friday) = ${endOfWeek}
Start of next week (Monday) = ${startNextWeek}
${nextDates}

════════════════════════════════════════
YOUR JOB
════════════════════════════════════════
Parse the message and return ONLY a valid JSON array of note objects.
No markdown fences, no explanation, no preamble — just the raw JSON array.

If the message contains MULTIPLE vehicles, dates, or tasks → create a SEPARATE note for EACH one.
If it is one task → return an array with one object.

════════════════════════════════════════
EACH NOTE OBJECT MUST HAVE THESE FIELDS
════════════════════════════════════════
- summary       : Professional, clear action note. Start with [REG] in brackets if a reg is known. Name the assigned person if mentioned. Include destination/postcode if given. Flag if info is TBC/pending.
- vehicleReg    : UK vehicle registration in UPPERCASE with no spaces, or null. Must be 2–7 alphanumeric characters (e.g. HN24VXK, AB12CDE, XOJ). Ignore words that aren't regs.
- date          : YYYY-MM-DD. Parse ALL natural language date expressions (see rules below). Default to today (${today}) only if absolutely no date context exists.
- scheduledTime : If a specific clock time is mentioned (e.g. "9am", "14:30", "2pm", "half 3"), return it as HH:mm in 24h format (e.g. "09:00", "14:30", "15:30"). Otherwise return null. Also include the time in the summary text.
- priority      : "urgent" | "medium" | "low" (see rules below)
- category      : "vehicle" | "work" | "personal" | "finance" (see rules below)

════════════════════════════════════════
DATE PARSING RULES — BE THOROUGH
════════════════════════════════════════
RELATIVE:
- "today", "now", "asap", "straight away"          → ${today}
- "tomorrow", "tom", "tmrw", "1st thing tomorrow"  → ${tomorrow}
- "day after tomorrow", "day after"                → ${dayAfter}
- "this week", "end of week", "EOW", "by friday"   → ${endOfWeek}
- "next week", "start of next week"                → ${startNextWeek}
- "next monday/tuesday/..." etc                    → use the calculated dates above
- "morning" with no date                           → ${tomorrow} (assume next morning)
- "1st thing", "first thing"                       → ${tomorrow} (first thing = next morning)
- "in a few days", "shortly", "soon"               → ${addDays(3)}
- "in a week", "next week sometime"                → ${addDays(7)}
- "in a couple of weeks"                           → ${addDays(14)}
- "end of month"                                   → last day of current month
- "beginning of next month"                        → 1st of next month

ABSOLUTE UK FORMATS:
- "26th April", "26 Apr", "26/04", "26-04"         → parse as ${todayDate.getFullYear()}-04-26 (assume current year if year not stated, next year if date has already passed)
- "26-Apr-26", "26 Apr 2026"                       → 2026-04-26
- "Monday 3rd", "Tue 4th"                          → find the nearest upcoming date matching that weekday + day number

TIME OF DAY — extract into scheduledTime AND mention in summary:
- "9am", "9:00", "9 o'clock"                        → scheduledTime: "09:00", mention "at 9:00am" in summary
- "half 3", "half past 3"                           → scheduledTime: "15:30"
- "quarter to 4"                                    → scheduledTime: "15:45"
- "2pm", "14:00", "14:30"                           → scheduledTime: "14:00" / "14:30"
- "first thing", "morning" (no exact time)          → scheduledTime: null, note "first thing in the morning" in summary
- "afternoon", "end of day", "EOD", "close of play" → scheduledTime: null, note in summary
- "before 4", "before 4pm"                          → scheduledTime: null, note "before 4:00pm" in summary

════════════════════════════════════════
PRIORITY RULES
════════════════════════════════════════
URGENT  → today / ASAP / now / straight away / emergency / broken down / customer waiting / keys needed urgently / already overdue
MEDIUM  → specific named future date / tomorrow / booked appointment / scheduled task / "need to" / "don't forget"
LOW     → vague future / "when we get a chance" / "eventually" / "at some point" / reminder with no urgency / FYI notes

════════════════════════════════════════
CATEGORY RULES
════════════════════════════════════════
VEHICLE  → anything involving a specific car, van, reg plate, MOT, service, collection, delivery, bodywork, repair, inspection, insurance write-off
WORK     → supplier calls, orders, business admin, staff tasks, quotes, invoices, insurance companies, auctions, deliveries without a specific reg, postcodes/addresses for work trips
PERSONAL → personal reminders, non-work tasks, family, health, general life admin
FINANCE  → payments, invoices, purchase orders, costs, estimates, insurance payouts, auction fees

════════════════════════════════════════
ENTITY RECOGNITION — WHAT TO EXTRACT
════════════════════════════════════════
STAFF NAMES: First names or nicknames = staff assigned to the task. Include in summary as "Sam to..." or "Ask Dave to...".
  Examples: "get Sam to...", "tell Mike to...", "ask the lads to..." → name the person or say "team"

VEHICLE REGS: UK formats only. Examples: AB12CDE, HN24VXK, XOJ, YD21ABC.
  - Short plates (3 chars like XOJ) are valid private/cherished plates — include them
  - Ignore: postcode fragments, model numbers (V220, 3-Series), part numbers, years (2023)
  - Watch for typos: O and 0 are often confused in plates

POSTCODES: UK postcodes (e.g. HR9 5BS, SW1A 2AA) = destinations. Include in summary as "to HR9 5BS" or resolve to town if known common postcode.

MAKE/MODEL: If a vehicle make/model is mentioned (Mercedes, BMW 3 Series, Transit, etc.) include it in summary.

PHONE NUMBERS: If a phone number appears in the message, note it in summary as "Tel: 07xxx"

PENDING/TBC INFO: Phrases like "will get full address", "TBC", "to confirm", "waiting on", "to follow" → flag in summary as "(address TBC)" or "(awaiting confirmation)"

ACTION VERBS — use the right one:
- "collect", "pick up", "grab"          → "to be collected"
- "drop off", "drop", "take"            → "to be delivered / dropped off"
- "hit the road", "head out", "set off" → "to travel to"
- "book in", "book for"                 → "booked for"
- "call", "ring", "phone", "get onto"   → "call [name/company]"
- "chase", "chase up", "follow up"      → "chase up [subject]"
- "order", "get", "buy"                 → "order [item]"
- "check", "look into", "have a look"   → "check / investigate"
- "sort", "sort out"                    → "arrange / sort out"
- "remind", "don't forget"              → "reminder:"

════════════════════════════════════════
EXAMPLES — STUDY THESE CAREFULLY
════════════════════════════════════════

INPUT: "We will get Sam to hit the road 1st thing. Post code - HR9 5BS. Will get full address"
OUTPUT: [{"summary":"Sam to travel to HR9 5BS first thing in the morning — full address TBC","vehicleReg":null,"date":"${tomorrow}","scheduledTime":null,"priority":"medium","category":"work"}]

INPUT: "collect XOJ from service next thursday"
OUTPUT: [{"summary":"[XOJ] to be collected from service","vehicleReg":"XOJ","date":"${getNextWeekday('thursday')}","scheduledTime":null,"priority":"medium","category":"vehicle"}]

INPUT: "The vehicles below are due back:\n26-Apr-26\nMercedes Benz V220 HN24VXK\n17-Apr-26\nMercedes Benz V300 HN24XEX"
OUTPUT: [{"summary":"[HN24VXK] Mercedes Benz V220 due back","vehicleReg":"HN24VXK","date":"2026-04-26","scheduledTime":null,"priority":"medium","category":"vehicle"},{"summary":"[HN24XEX] Mercedes Benz V300 due back","vehicleReg":"HN24XEX","date":"2026-04-17","scheduledTime":null,"priority":"medium","category":"vehicle"}]

INPUT: "ring Steve at Copart asap about the BMW write off, he said call before 4"
OUTPUT: [{"summary":"Call Steve at Copart ASAP re: BMW write-off — call before 4:00pm","vehicleReg":null,"date":"${today}","scheduledTime":null,"priority":"urgent","category":"work"}]

INPUT: "don't forget to order brake pads for the transit, should arrive end of week"
OUTPUT: [{"summary":"Order brake pads for Transit — expected delivery by end of week","vehicleReg":null,"date":"${endOfWeek}","scheduledTime":null,"priority":"low","category":"work"}]

INPUT: "YD21ABC needs to go to MOT station tomorrow morning 9am, booked at Kwik Fit"
OUTPUT: [{"summary":"[YD21ABC] Kwik Fit MOT booked — at 9:00am","vehicleReg":"YD21ABC","date":"${tomorrow}","scheduledTime":"09:00","priority":"medium","category":"vehicle"}]

INPUT: "customer chasing AB12CDE — insurance company still haven't approved the repair"
OUTPUT: [{"summary":"[AB12CDE] Chase insurance company re: repair approval — customer waiting","vehicleReg":"AB12CDE","date":"${today}","scheduledTime":null,"priority":"urgent","category":"vehicle"}]

INPUT: "invoice from Smiths bodyparts needs paying by end of month, £340"
OUTPUT: [{"summary":"Pay Smiths Bodyparts invoice — £340 due by end of month","vehicleReg":null,"date":"${new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).toISOString().split('T')[0]}","scheduledTime":null,"priority":"medium","category":"finance"}]

INPUT: "tell Mike to chase up the Copart auction payment, it's been 3 days"
OUTPUT: [{"summary":"Mike to chase Copart auction payment — outstanding 3 days","vehicleReg":null,"date":"${today}","scheduledTime":null,"priority":"urgent","category":"finance"}]

INPUT: "parts for XJ14 KLM arriving tuesday — someone needs to be here to sign"
OUTPUT: [{"summary":"[XJ14KLM] Parts delivery arriving — staff needed to sign","vehicleReg":"XJ14KLM","date":"${getNextWeekday('tuesday')}","scheduledTime":null,"priority":"medium","category":"vehicle"}]

INPUT: "MOT for AB12 CDE tomorrow at 2pm, then call insurance at 10am"
OUTPUT: [{"summary":"[AB12CDE] MOT appointment — at 2:00pm","vehicleReg":"AB12CDE","date":"${tomorrow}","scheduledTime":"14:00","priority":"medium","category":"vehicle"},{"summary":"Call insurance company — at 10:00am","vehicleReg":null,"date":"${tomorrow}","scheduledTime":"10:00","priority":"medium","category":"work"}]

INPUT: "remind me to ring the auction house at half 3 today"
OUTPUT: [{"summary":"Call auction house — at 3:30pm","vehicleReg":null,"date":"${today}","scheduledTime":"15:30","priority":"medium","category":"work"}]

════════════════════════════════════════
MESSAGE TO PARSE
════════════════════════════════════════
"${enrichedText}"

Return ONLY the JSON array. No markdown. No explanation:`

  // ── Step 4: Call Groq via Cloud Function ─────────────────────────────────────
  // TODO(phase5): 'callGroq' Edge Function (Groq LLM) not deployed yet.
  const { data, error } = await supabase.functions.invoke<CallGroqFunctionResponse>('callGroq', {
    body: {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1000,
    },
  })
  if (error) throw error
  const content = data?.content
  if (!content) throw new Error('Empty response from Groq')

  const cleaned = content.replace(/```json|```/g, '').trim()

  try {
    const parsed = JSON.parse(cleaned)
    const items: any[] = Array.isArray(parsed) ? parsed : [parsed]

    return items.map(item => ({
      summary:       item.summary    || rawText,
      vehicleReg:    item.vehicleReg || null,
      date:          item.date       || today,
      scheduledTime: parseTime(item.scheduledTime),
      priority:      item.priority   || 'medium',
      category:      item.category   || 'work',
      rawText,
      contactDetails,
    }))
  } catch {
    throw new Error('Could not understand AI response. Please try rephrasing.')
  }
}