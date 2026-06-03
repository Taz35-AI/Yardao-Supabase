// src/lib/zao/intentDetectors.ts
// Pure functions that classify user intent from raw message text.
// NO Firestore. NO Groq. NO React. Zero cost to run.
// Every function is independently testable.

const REG_STOP_WORDS = new Set([
  'CHECK', 'CHECKED', 'OUT', 'TO', 'THE', 'AND', 'FOR', 'MOT', 'SEND', 'TAKE',
  'MOVE', 'DROP', 'AT', 'IN', 'GONE', 'SENT', 'WENT', 'LEFT', 'RETURN',
  'RETURNED', 'BACK', 'CAME', 'COME', 'COLLECTED', 'PICKED', 'FROM',
  'HEADING', 'DELIVER', 'DELIVERED', 'BOOK', 'BOOKING', 'SCHEDULE',
  // Generic words that appear in chip phrases — must never be treated as regs
  'VEHICLE', 'EXTERNAL', 'GARAGE', 'HIRE', 'DONE', 'MARK', 'SET', 'AN',
  'INTERNAL', 'MARK', 'PLEASE', 'CAN', 'WANT',
])

/**
 * Extract the most likely vehicle registration from a message.
 * Prefers tokens with both letters AND numbers (more reg-like).
 */
export function extractRegHint(msg: string, extraStopWords: string[] = []): string {
  const blocked = new Set([...REG_STOP_WORDS, ...extraStopWords.map(w => w.toUpperCase())])
  const tokens = msg.match(/\b([A-Z0-9]{2,8})\b/gi) || []
  return (
    tokens.find(t => !blocked.has(t.toUpperCase()) && /[A-Z]/i.test(t) && /[0-9]/.test(t)) ||
    tokens.find(t => !blocked.has(t.toUpperCase()) && t.length >= 3) ||
    ''
  )
}

/**
 * Detect intent to send a vehicle to an external garage.
 * "AB12 out to ALK" | "send AB12 to bodyshop" | "AB12 gone"
 */
export function detectCheckoutIntent(msg: string): { isCheckout: boolean; regHint: string; garageHint: string } {
  const isCheckout =
    /\b(check\s*out|checked\s*out|checkout)\b/i.test(msg) ||
    /\b(send|take|move|drop|deliver|gone|going|left|heading|went|sent)\b/i.test(msg) ||
    /\b\w{2,8}\b\s+out\s+to\b/i.test(msg) ||
    /\b[A-Z0-9]{3,8}\s+to\s+[A-Z][a-z]/i.test(msg) ||
    /\b(to|at|into)\s+(garage|bodyshop|body\s*shop|workshop|repairs?)\b/i.test(msg)

  const regHint = extractRegHint(msg)
  const toMatch = msg.match(/\bto\s+([A-Za-z][A-Za-z0-9\s]{1,30}?)(?:\s*$|\s*garage|\s*bodyshop)/i)
  const garageHint = toMatch?.[1]?.trim().toLowerCase() || ''

  return { isCheckout, regHint, garageHint }
}

/**
 * Detect intent to return a vehicle FROM an external garage.
 * "AB12 returned" | "AB12 back" | "picked up AB12"
 */
export function detectReturnIntent(msg: string): { isReturn: boolean; regHint: string } {
  const isReturn =
    (
      /\b(return(ed|ing)?|back|came\s*back|come\s*back|collect(ed)?|pick(ed)?\s*up|picked\s*up|is\s*back|back\s*in)\b/i.test(msg) &&
      !/\b(book|schedule|service|mot)\b/i.test(msg)
    ) ||
    /\b[A-Z0-9]{3,8}\s+back\b/i.test(msg) ||
    /\bback\s+[A-Z0-9]{3,8}\b/i.test(msg)

  const regHint = extractRegHint(msg, ['BACK', 'RETURN', 'RETURNED', 'FROM', 'CAME', 'COME', 'COLLECTED', 'PICKED'])
  return { isReturn, regHint }
}

/**
 * Detect MOT-done intent.
 * "MOT done on AB12" | "AB12 passed MOT yesterday"
 */
export function detectMOTDoneIntent(msg: string): { isMOTDone: boolean; regHint: string; daysAgo: number } {
  const isMOTDone =
    /\bmot\b.*(done|complete|completed|passed|finished|sorted)/i.test(msg) ||
    /(done|complete|completed|passed|finished|sorted).*\bmot\b/i.test(msg)

  let daysAgo = 0
  if (/yesterday/i.test(msg)) daysAgo = 1
  const daysMatch = msg.match(/(\d+)\s*days?\s*ago/i)
  if (daysMatch) daysAgo = parseInt(daysMatch[1], 10)

  const stripped = msg
    .replace(/\b(mot|done|today|yesterday|days?|ago|complete|completed|passed|finished|sorted|the|for|on|mark|as|a|vehicle|external|garage|hire|internal|set|out|check|return|returned)\b/gi, '')
    .trim()
  const regHint = stripped.match(/\b([A-Z0-9]{3,8})\b/i)?.[1]?.toUpperCase() || ''

  return { isMOTDone, regHint, daysAgo }
}

/**
 * Detect CREATE booking intent — user wants to make a new booking.
 * "book AB12 for service" | "schedule a MOT for LB22" | "can you book CF74 next friday"
 * Excludes queries about existing bookings: "do I have a booking?", "what's on friday?"
 */
export function detectBookingIntent(msg: string): boolean {
  if (/\bmot done\b/i.test(msg)) return false

  // Strong create signals — verb + vehicle-ish context
  const hasCreateVerb = /\b(book|schedule|set up|arrange|make a booking|add a booking)\b/i.test(msg)

  // Weak signals that could be queries — require a reg to also be present
  const hasWeakSignal  = /\b(booking|appointment|service booking)\b/i.test(msg)
  const hasReg         = /\b[A-Z]{2}\d{2}[A-Z]{3}\b/i.test(msg)

  // Explicit query phrases — never treat as create
const isQuery = /\b(do i have|have i got|is there|what.*booking|any booking|any bookings|check.*booking|show.*booking|whats.*on|what'?s.*on|for next|for this|for tomorrow|for today|on friday|on monday|on tuesday|on wednesday|on thursday|on saturday|on sunday|bookings (for|on|next|this|today|tomorrow)|what.?s (on|booked|coming) (next|this|today|tomorrow))\b/i.test(msg)

  if (isQuery) return false
  return hasCreateVerb || (hasWeakSignal && hasReg)
}

/**
 * Detect mileage update intent.
 * "AB12 45000" | "AB12 45000 miles" | "45000 on AB12" | "AB12 mileage 45000"
 */
export function detectMileageIntent(msg: string): { isMileage: boolean; regHint: string; mileage: string } {
  const numMatch = msg.match(/\b(\d{4,7})\b/)
  if (!numMatch) return { isMileage: false, regHint: '', mileage: '' }

  const mileage = numMatch[1]
  const hasKeyword = /\b(mile(s|age)?|odometer|odo|reading|reads|showing|on\s+\d|is\s+on|done|clocked)\b/i.test(msg)
  const regThenNum = /\b[A-Z]{2}\d{2}[A-Z]{3}\b.{0,30}\b\d{4,7}\b/i.test(msg) ||
                     /\b[A-Z]{2,3}\d{2,4}[A-Z]{0,3}\b.{0,20}\b\d{4,7}\b/i.test(msg)
  const numThenReg = /\b\d{4,7}\b.{0,20}\b[A-Z]{2}\d{2}[A-Z]{3}\b/i.test(msg) ||
                     /\b\d{4,7}\b.{0,20}\b[A-Z]{2,3}\d{2,4}[A-Z]{0,3}\b/i.test(msg)
  const isMileage = hasKeyword || regThenNum || numThenReg

  const regHint = extractRegHint(
    msg.replace(/\b\d{4,7}\b/g, ''),
    ['MILES', 'MILEAGE', 'ON', 'IS', 'AT', 'DONE', 'READS', 'SHOWING', 'CLOCKED', 'UPDATE', 'SET']
  )

  return { isMileage, regHint, mileage }
}

/**
 * Detect check-in intent (adding a vehicle from fleet inventory into the yard).
 * "check in AB12" | "AB12 arrived" | "bring AB12 in"
 */
export function detectCheckInIntent(msg: string): { isCheckIn: boolean; regHint: string } {
  const hasGarageOut = /\b(out\s+to|checkout|checked\s*out|send\s+to|to\s+garage|to\s+bodyshop)\b/i.test(msg)
  if (hasGarageOut) return { isCheckIn: false, regHint: '' }

  const isCheckIn =
    /\bcheck[\s-]?in\b/i.test(msg) ||
    /\bcheckin\b/i.test(msg) ||
    /\bchecking[\s-]?in\b/i.test(msg) ||
    /\b(add|bring|put|pull)\b.{0,20}\b(in|into)\b.{0,20}(yard|fleet)/i.test(msg) ||
    /\b(arrived?|is\s+in|came\s+in|just\s+in|inbound)\b/i.test(msg)

  const regHint = extractRegHint(msg, [
    'CHECK', 'CHECKIN', 'CHECKING', 'IN', 'INTO', 'YARD', 'FLEET', 'ADD', 'BRING', 'PUT', 'ARRIVED',
  ])

  return { isCheckIn, regHint }
}

/**
 * Detect set-out-on-hire intent.
 * "AB12 out on hire" | "AB12 hired" | "put AB12 on hire"
 */
export function detectHireOutIntent(msg: string): { isHireOut: boolean; regHint: string } {
  const isReturn = /\b(back|return(ed)?|came\s*back|off\s+hire|end\s+of\s+hire|returned\s+from\s+hire)\b/i.test(msg)
  if (isReturn) return { isHireOut: false, regHint: '' }

  const isHireOut =
    /\b(out\s+on\s+hire|on\s+hire|hire\s+out|hired\s+out)\b/i.test(msg) ||
    /\b(hired|hire)\b/i.test(msg) ||
    /\b(put|send|set|mark)\b.{0,20}\b(on\s+hire|hire)\b/i.test(msg) ||
    /\b(gone\s+on\s+hire|going\s+on\s+hire|is\s+hired)\b/i.test(msg)

  const regHint = extractRegHint(msg, [
    'HIRE', 'HIRED', 'OUT', 'ON', 'HIREOUT', 'PUT', 'SEND', 'SET', 'MARK', 'GONE', 'GOING',
  ])

  return { isHireOut, regHint }
}

/**
 * Detect return-from-hire intent.
 * "AB12 off hire" | "AB12 back from hire" | "AB12 returned from hire"
 */
export function detectHireReturnIntent(msg: string): { isHireReturn: boolean; regHint: string } {
  const isHireReturn =
    /\b(off\s+hire|end\s+(of\s+)?hire|returned?\s+from\s+hire|back\s+from\s+hire|hire\s+end(ed)?)\b/i.test(msg) ||
    /\b(return(ed)?|back|came\s*back|is\s*back)\b.{0,30}\bhire\b/i.test(msg) ||
    /\bhire\b.{0,30}\b(return(ed)?|back|ended?|over|done|finished)\b/i.test(msg)

  const regHint = extractRegHint(msg, [
    'HIRE', 'BACK', 'RETURN', 'RETURNED', 'FROM', 'OFF', 'END', 'ENDED', 'CAME', 'IS',
  ])

  return { isHireReturn, regHint }
}

/**
 * Detect intent to CREATE a note/reminder via Zao.
 * "remind me to call insurance tomorrow at 10"
 * "note — CF74 coming in Monday for MOT"
 * "add a note: chase Copart payment urgent"
 * "don't forget to call Dave at 3pm"
 * "set a reminder for..."
 */
export function detectNoteIntent(msg: string): boolean {
  return /\b(remind me|reminder|set a reminder|add a note|add note|note[:\-–]|note that|don'?t forget|make a note|quick note|jot|log a note)\b/i.test(msg)
}

/**
 * Detect intent to READ existing notes via Zao.
 * "what notes do I have today?" | "show my reminders" | "any notes for tomorrow?"
 */
export function detectReadNotesIntent(msg: string): boolean {
  return /\b(my notes|my reminders|show.*notes|show.*reminders|what.*notes|what are my|whats my|what'?s my|any notes|notes for|reminders for|upcoming notes|upcoming reminders|what('?s| is) on my|what do i have (today|tomorrow|this week|next week)|any upcoming)\b/i.test(msg)
}