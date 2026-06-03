// src/hooks/useVoiceCommand.ts
// =====================================================
// YARDAO VOICE COMMAND SYSTEM
// =====================================================
// Handles: Deepgram speech-to-text, registration extraction,
// vehicle matching, and comment updates.
//
// Usage: const voice = useVoiceCommand({ checkedInVehicles })
//        voice.startListening()
// =====================================================

'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import { CheckedInVehicle } from '@/types'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'


// ==================== TYPES ====================

export interface VoiceCommandResult {
  registration: string
  matchedVehicle: CheckedInVehicle | null
  matchedVehicles?: CheckedInVehicle[]  // Array of partial matches
  comment: string
  confidence: 'exact' | 'fuzzy' | 'partial' | 'none'
  rawTranscript: string
}

export interface VoiceCommandState {
  isListening: boolean
  isProcessing: boolean
  isConnecting: boolean
  liveTranscript: string
  finalTranscript: string
  lastResult: VoiceCommandResult | null
  error: string | null
  sessionActive: boolean
  commandHistory: VoiceCommandResult[]
}

interface UseVoiceCommandProps {
  checkedInVehicles: CheckedInVehicle[]
  onCommandConfirmed?: (result: VoiceCommandResult) => Promise<void>
}

// ==================== UK REGISTRATION PATTERNS ====================

// UK registration plate patterns:
// Current format: AB12 CDE (2 letters, 2 numbers, 3 letters)
// Older formats: A123 BCD, AB12 CDE, ABC 123D, etc.
const UK_REG_PATTERNS = [
  /([A-Z]{2}\s?\d{2}\s?[A-Z]{3})/gi,  // Removed \b - catches regs without word boundaries
  /([A-Z]\d{3}\s?[A-Z]{3})/gi,
  /([A-Z]{3}\s?\d{3}[A-Z])/gi,
  /([A-Z]{3}\s?\d{4})/gi,
  /([A-Z]\d{2}\s?[A-Z]{3})/gi,
]

// Common speech-to-text number word replacements
const NUMBER_WORDS: Record<string, string> = {
  'zero': '0', 'oh': '0', 'o': '0',
  'one': '1', 'won': '1',
  'two': '2', 'to': '2', 'too': '2',
  'three': '3', 'tree': '3',
  'four': '4', 'for': '4', 'fore': '4',
  'five': '5',
  'six': '6', 'sex': '6',
  'seven': '7',
  'eight': '8', 'ate': '8',
  'nine': '9', 'niner': '9',
}

// NATO alphabet mapping
const NATO_ALPHABET: Record<string, string> = {
  'alpha': 'A', 'alfa': 'A',
  'bravo': 'B',
  'charlie': 'C',
  'delta': 'D',
  'echo': 'E',
  'foxtrot': 'F',
  'golf': 'G',
  'hotel': 'H',
  'india': 'I',
  'juliet': 'J', 'juliett': 'J',
  'kilo': 'K',
  'lima': 'L',
  'mike': 'M',
  'november': 'N',
  'oscar': 'O',
  'papa': 'P',
  'quebec': 'Q',
  'romeo': 'R',
  'sierra': 'S',
  'tango': 'T',
  'uniform': 'U',
  'victor': 'V',
  'whiskey': 'W', 'whisky': 'W',
  'xray': 'X', 'x-ray': 'X',
  'yankee': 'Y',
  'zulu': 'Z',
}

// Phonetic letter pronunciations (how speech recognition hears single letters)
const PHONETIC_LETTERS: Record<string, string> = {
  // British/American letter pronunciations
  'zed': 'Z',        // British pronunciation of Z
  'zee': 'Z',        // American pronunciation
  'aitch': 'H',      // British pronunciation of H
  'haitch': 'H',     // Alternative H pronunciation
  'jay': 'J',
  'kay': 'K',
  'cue': 'Q',
  'queue': 'Q',
  'are': 'R',
  'arr': 'R',
  'ess': 'S',
  'ex': 'X',
  'why': 'Y',
  'wye': 'Y',
  'double you': 'W',
  'doubleyou': 'W',
  
  // Common misheard letters
  'bee': 'B',
  'see': 'C',
  'sea': 'C',
  'dee': 'D',
  'eee': 'E',
  'eff': 'F',
  'gee': 'G',
  'eye': 'I',
  'aye': 'I',
  'em': 'M',
  'en': 'N',
  'pee': 'P',
  'tea': 'T',
  'tee': 'T',
  'you': 'U',
  'vee': 'V',

  // Single letter transcriptions (when AI just gives you "r" or "d")
  'a': 'A',
  'b': 'B',
  'c': 'C',
  'd': 'D',
  'e': 'E',
  'f': 'F',
  'g': 'G',
  'h': 'H',
  'i': 'I',
  'j': 'J',
  'k': 'K',
  'l': 'L',
  'm': 'M',
  'n': 'N',
  'o': 'O',
  'p': 'P',
  'q': 'Q',
  'r': 'R',
  's': 'S',
  't': 'T',
  'u': 'U',
  'v': 'V',
  'w': 'W',
  'x': 'X',
  'y': 'Y',
  'z': 'Z',
}

// ==================== ✅ NEW: DAMAGE KEYWORDS (BODYSHOP) ====================
// Any voice note containing these words gets auto-flagged with 🔴 DAMAGE:

const DAMAGE_KEYWORDS = [
  // Physical damage
  'scratch', 'scratched', 'scratches', 'scratching',
  'dent', 'dented', 'dents', 'denting',
  'crack', 'cracked', 'cracks', 'cracking',
  'chip', 'chipped', 'chips', 'chipping',
  'buckled', 'buckle', 'buckling',
  'bent', 'bend', 'bending',
  'smashed', 'smash', 'shattered', 'shatters',
  'broken', 'broke', 'break', 'breaking',
  'torn', 'tear', 'tearing', 'ripped', 'rip',
  'missing', 'snapped', 'snaps',
  'crushed', 'crumpled', 'collapsed',
  'warped', 'twisted', 'deformed',
  // Bodywork specific
  'damaged', 'damage', 'damages',
  'corrosion', 'corroded', 'rust', 'rusty', 'rusting',
  'scuff', 'scuffed', 'scuffs',
  'gouge', 'gouged', 'gouges',
  'scrape', 'scraped', 'scrapes',
  'split', 'splits', 'splitting',
  'hole', 'holes', 'holed',
  'paintwork', 'lacquer',
  // Mechanical damage
  'leak', 'leaking', 'leaks', 'seeping',
  'blown', 'burnt', 'burning',
  'seized', 'seizing',
  'worn', 'wear', 'wearing',
  'failed', 'failure',
  'flat', 'deflated', 'puncture', 'punctured',
  'noise', 'noisy', 'rattling', 'rattle', 'knocking', 'knock',
  'grinding', 'grind', 'squealing', 'squeal', 'squeaking', 'squeak',
  'vibration', 'vibrating', 'shaking',
  'overheating', 'overheat',
]

// ==================== ✅ NEW: COMMON DEEPGRAM MISHEARS ====================
// Maps what Deepgram commonly returns → what it probably meant
// Add more as you discover them from real usage

const DEEPGRAM_MISHEARS: Record<string, string> = {
  // Automotive mishears
  'tight': 'tyre',
  'whether screen': 'windscreen',
  'wind screen': 'windscreen',
  'wind shield': 'windshield',
  'breaks': 'brakes',
  'near side': 'nearside',
  'near-side': 'nearside',
  'off side': 'offside',
  'off-side': 'offside',
  'em ot': 'MOT',
  'em oh tee': 'MOT',
  // Number confusions in plates
  'for tea': '4T',
  'niner': '9',
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Normalize a registration string: uppercase, remove extra spaces
 */
function normalizeReg(reg: string): string {
  return reg.toUpperCase().replace(/\s+/g, '').trim()
}

/**
 * Normalize O/0 confusion in registration plates
 * Converts likely 0s to Os and vice versa based on position and context
 */
function normalizeO0InRegistration(reg: string): string {
  const normalized = normalizeReg(reg)
  return normalized
    .replace(/0([A-Z])/g, 'O$1')  // 0 followed by letter likely should be O
    .replace(/([A-Z])0/g, '$1O')  // letter followed by 0 likely should be O
}

// ==================== ✅ NEW: O/0 variant generator ====================
// Generates all combinations of O↔0 swaps to handle both directions
// e.g. "AB12OBC" also tries "AB120BC" — the most common plate confusion

function generateO0Variants(reg: string): string[] {
  const variants = new Set<string>()
  variants.add(reg)

  const chars = reg.split('')
  const swappableIndices = chars
    .map((c, i) => (c === 'O' || c === '0') ? i : -1)
    .filter(i => i >= 0)

  // Generate all 2^n combinations, capped at 16 to avoid explosion
  const combCount = Math.min(Math.pow(2, swappableIndices.length), 16)
  for (let mask = 0; mask < combCount; mask++) {
    const variant = [...chars]
    swappableIndices.forEach((idx, bit) => {
      variant[idx] = (mask >> bit) & 1 ? '0' : 'O'
    })
    variants.add(variant.join(''))
  }

  return [...variants]
}

// ==================== ✅ NEW: Deepgram mishear fixer ====================

function applyDeepgramMishearFixes(text: string): string {
  let result = text
  for (const [mishear, correct] of Object.entries(DEEPGRAM_MISHEARS)) {
    const regex = new RegExp(`\\b${mishear}\\b`, 'gi')
    result = result.replace(regex, correct)
  }
  return result
}

// ==================== ✅ NEW: Damage detection ====================

function detectDamageAndFormat(comment: string): string {
  if (!comment) return comment
  const lowerComment = comment.toLowerCase()
  const isDamageNote = DAMAGE_KEYWORDS.some(keyword => lowerComment.includes(keyword))
  return isDamageNote ? `🔴 DAMAGE: ${comment}` : comment
}

/**
 * Convert number words and NATO alphabet in transcript to characters
 * e.g., "lima charlie seven zero" → "LC70"
 * e.g., "CJ23ZedRD" → "CJ23ZRD"
 */
function convertSpokenToCharacters(text: string): string {
  let result = text

  // ✅ Apply mishear fixes FIRST before any other conversion
  result = applyDeepgramMishearFixes(result)
  
  // Replace phonetic letters - global replace (no word boundaries)
  // This catches "Zed" in "CJ23ZedRD" where there's no space
  for (const [word, letter] of Object.entries(PHONETIC_LETTERS)) {
    const regex = new RegExp(word, 'gi')
    result = result.replace(regex, letter)
  }
  
  // Replace NATO alphabet
  for (const [word, letter] of Object.entries(NATO_ALPHABET)) {
    const regex = new RegExp(word, 'gi')
    result = result.replace(regex, letter)
  }
  
  // Replace number words
  for (const [word, digit] of Object.entries(NUMBER_WORDS)) {
    const regex = new RegExp(word, 'gi')
    result = result.replace(regex, digit)
  }
  
  return result
}

/**
 * Calculate similarity between two strings (Levenshtein-based)
 * Returns 0-1 where 1 is exact match
 */
function similarity(a: string, b: string): number {
  const s1 = normalizeReg(a)
  const s2 = normalizeReg(b)
  
  if (s1 === s2) return 1
  
  const longer = s1.length > s2.length ? s1 : s2
  const shorter = s1.length > s2.length ? s2 : s1
  
  if (longer.length === 0) return 1
  
  const costs: number[] = []
  for (let i = 0; i <= longer.length; i++) {
    let lastValue = i
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) {
        costs[j] = j
      } else if (j > 0) {
        let newValue = costs[j - 1]
        if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
        }
        costs[j - 1] = lastValue
        lastValue = newValue
      }
    }
    if (i > 0) costs[shorter.length] = lastValue
  }
  
  return (longer.length - costs[shorter.length]) / longer.length
}

// ==================== ✅ NEW: Transposition-aware similarity ====================
// Handles common adjacent character swaps e.g. "AB21CDE" → "AB12CDE"

function transpositionSimilarity(a: string, b: string): number {
  const base = similarity(a, b)
  if (base >= 0.9) return base

  // Try all single adjacent transpositions of `a`
  let best = base
  for (let i = 0; i < a.length - 1; i++) {
    const transposed = a.slice(0, i) + a[i + 1] + a[i] + a.slice(i + 2)
    const score = similarity(transposed, b)
    if (score > best) best = score
  }
  return best
}

// ==================== ✅ NEW: Positional scoring ====================
// Scores a partial match based on WHERE in the plate the chars appear

function positionalScore(partial: string, full: string): number {
  if (full === partial) return 100
  if (full.startsWith(partial)) return 90   // Prefix = very likely
  if (full.endsWith(partial)) return 85     // Suffix = likely
  if (full.includes(partial)) return 72     // Contains = reasonable

  // Check if it could be transposed chars within the plate
  for (let i = 0; i < partial.length - 1; i++) {
    const transposed = partial.slice(0, i) + partial[i + 1] + partial[i] + partial.slice(i + 2)
    if (full.includes(transposed)) return 65
  }

  // Substring matching for 3-4 char segments
  if (partial.length >= 4) {
    let maxSub = 0
    for (let len = 4; len >= 3; len--) {
      for (let i = 0; i <= partial.length - len; i++) {
        const sub = partial.substring(i, i + len)
        if (full.includes(sub)) {
          maxSub = Math.max(maxSub, 50 + len * 4)
        }
      }
    }
    if (maxSub > 0) return maxSub
  }

  return 0
}

/**
 * Extract registration plate from transcript text
 * Handles partial registrations (3+ characters like "DVP", "ZRD")
 */
function extractRegistration(text: string): string | null {
  logger.log('🔍 Extracting registration from:', text)
  
  const converted = convertSpokenToCharacters(text)
  logger.log('📝 After conversion:', converted)
  
  const upperText = converted.toUpperCase()
  
  // Split at punctuation FIRST
  const parts = upperText.split(/[,;.!?]+/)
  const searchText = parts[0].trim()
  
  logger.log('📍 Searching in:', searchText)
  
  // Collapse ALL spaces: "L C 73D V P" → "LC73DVP"
  const collapsed = searchText.replace(/\s+/g, '')
  logger.log('🔗 Collapsed (no spaces):', collapsed)
  
  // Try UK patterns on COLLAPSED version (no spaces)
  for (const pattern of UK_REG_PATTERNS) {
    pattern.lastIndex = 0
    const match = pattern.exec(collapsed)
    if (match) {
      const reg = normalizeReg(match[1])
      const normalized = normalizeO0InRegistration(reg)
      logger.log('✅ Found full registration:', normalized)
      return normalized
    }
  }

  // ✅ NEW: Also try on original spaced text for spaced-out speech
  for (const pattern of UK_REG_PATTERNS) {
    pattern.lastIndex = 0
    const match = pattern.exec(searchText)
    if (match) {
      const reg = normalizeReg(match[1])
      const normalized = normalizeO0InRegistration(reg)
      logger.log('✅ Found registration (with spaces):', normalized)
      return normalized
    }
  }
  
  logger.log('⚠️ No full reg match, trying partial extraction...')
  
  // Clean the collapsed version
  const cleaned = collapsed
    .replace(/\b(THE|A|AN|IS|HAS|NEEDS|NEED|NEEDED|GOT|GET|VEHICLE|CAR|VAN|TRUCK|REG|REGISTRATION|NUMBER|PLATE|FLAT|TIRE|TYRE|OIL|CHANGE|MOT|SERVICE|CHECK|AND|OR|WITH|WINDSCREEN|BROKEN|SCREEN|BOOKING|BOOK|BOOKED|APPOINTMENT|SCHEDULE|SCHEDULED|SENSOR|SENSORS|ISSUE|ISSUES|PROBLEM|PROBLEMS)\b/gi, '')
    .trim()
  
  logger.log('🧹 Cleaned (collapsed):', cleaned)
  
  if (cleaned.length >= 3 && cleaned.length <= 8 && /[A-Z]/.test(cleaned)) {
    const hasLetters = /[A-Z]/.test(cleaned)
    const hasNumbers = /[0-9]/.test(cleaned)
    
    // Prioritize alphanumeric
    if (hasLetters && hasNumbers) {
      const normalized = normalizeO0InRegistration(cleaned)
      logger.log('✅ Found alphanumeric match:', normalized)
      return normalized
    }
    
    // Accept letter-only if 3-6 chars
    if (hasLetters && cleaned.length >= 3 && cleaned.length <= 6) {
      const normalized = normalizeO0InRegistration(cleaned)
      logger.log('⚠️ Found letter-only match:', normalized)
      return normalized
    }
  }
  
  logger.log('❌ No registration found')
  return null
}

/**
 * Extract the comment/note part from transcript (everything that's not the registration)
 */
function extractComment(text: string, registration: string): string {
  const parts = text.split(/[,;.!?]/)
  
  if (parts.length > 1) {
    // Get ALL parts after the first (registration)
    const allCommentParts = parts.slice(1)
      .map(p => p.trim())
      .filter(p => p.length > 0)
    
    if (allCommentParts.length === 0) return ''
    
    // Join all sentences with periods
    let comment = allCommentParts.join('. ')
    
    // Clean and capitalize
    comment = comment
      .replace(/^\s*(the\s+)?(vehicle|car|van|truck|reg|registration)?\s*/i, '')
      .replace(/^\s*(needs?|has|got|is)\s*/i, '')
      .trim()
    
    if (comment && !comment.match(/[.!?]$/)) {
      comment += '.'
    }
    
    if (comment.length > 0) {
      comment = comment.charAt(0).toUpperCase() + comment.slice(1)
    }
    
    return comment
  }
  
  // FALLBACK: Old method if no punctuation
  const regNormalized = normalizeReg(registration)
  const regWithSpaces = regNormalized.replace(/(.)/g, '$1\\s*')
  const regRegex = new RegExp(regWithSpaces, 'gi')
  
  let comment = text
    .replace(regRegex, '')
    .replace(/^\s*(the\s+)?(vehicle|car|van|truck|reg|registration)?\s*/i, '')
    .replace(/^\s*(needs?|has|got|is|it\s+needs?|it\s+has|it\s+is)\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  
  if (comment.length > 0) {
    comment = comment.charAt(0).toUpperCase() + comment.slice(1)
  }
  
  return comment
}

// ==================== ✅ IMPROVED: Find partial matches ====================

/**
 * Find vehicles matching a partial registration
 * Returns array of matches sorted by relevance
 * Now uses positional scoring + O/0 variants + transposition awareness
 */
function findPartialMatches(
  partialReg: string,
  vehicles: CheckedInVehicle[]
): CheckedInVehicle[] {
  if (!partialReg || partialReg.length < 3 || vehicles.length === 0) {
    return []
  }
  
  const normalized = normalizeReg(partialReg)
  // Generate O/0 variants of the extracted reg
  const variants = generateO0Variants(normalized)

  const matches: Array<{ vehicle: CheckedInVehicle; score: number }> = []
  
  for (const vehicle of vehicles) {
    const vehReg = normalizeReg(vehicle.registration)
    let bestScore = 0

    // Try each O/0 variant with positional scoring
    for (const variant of variants) {
      const score = positionalScore(variant, vehReg)
      if (score > bestScore) bestScore = score
    }

    // Also try transposition-aware similarity
    const transSim = transpositionSimilarity(normalized, vehReg)
    if (transSim >= 0.6) {
      const transScore = transSim * 85
      if (transScore > bestScore) bestScore = transScore
    }
    
    if (bestScore > 0) {
      matches.push({ vehicle, score: bestScore })
    }
  }
  
  // Sort by score and return top 5
  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(m => m.vehicle)
}

// ==================== ✅ IMPROVED: Find matching vehicle ====================

/**
 * Find the best matching vehicle from the checked-in list
 * Supports: exact, O/0 variants, transposition-aware fuzzy, partial matching
 */
function findMatchingVehicle(
  extractedReg: string,
  vehicles: CheckedInVehicle[]
): { 
  vehicle: CheckedInVehicle | null
  vehicles: CheckedInVehicle[]
  confidence: 'exact' | 'fuzzy' | 'partial' | 'none' 
} {
  if (!extractedReg || vehicles.length === 0) {
    return { vehicle: null, vehicles: [], confidence: 'none' }
  }
  
  const normalized = normalizeReg(extractedReg)
  
  // 1. Try exact match
  const exactMatch = vehicles.find(
    v => normalizeReg(v.registration) === normalized
  )
  if (exactMatch) {
    return { vehicle: exactMatch, vehicles: [exactMatch], confidence: 'exact' }
  }

  // ✅ 2. Try O/0 variants for exact match — very common source of mismatch
  const variants = generateO0Variants(normalized)
  for (const variant of variants) {
    const variantMatch = vehicles.find(v => normalizeReg(v.registration) === variant)
    if (variantMatch) {
      logger.log(`✅ O/0 variant match: ${normalized} → ${variant}`)
      return { vehicle: variantMatch, vehicles: [variantMatch], confidence: 'exact' }
    }
  }
  
  // ✅ 3. Transposition-aware fuzzy match (for full registrations with typos/digit swaps)
  if (normalized.length >= 5) {
    let bestMatch: CheckedInVehicle | null = null
    let bestScore = 0
    
    for (const vehicle of vehicles) {
      const vehReg = normalizeReg(vehicle.registration)

      // Standard transposition-aware similarity
      let score = transpositionSimilarity(normalized, vehReg)

      // Also try O/0 variants against the vehicle reg
      for (const variant of variants) {
        const varScore = transpositionSimilarity(variant, vehReg)
        if (varScore > score) score = varScore
      }

      if (score > bestScore) {
        bestScore = score
        bestMatch = vehicle
      }
    }
    
    // Strong fuzzy match (70%+)
    if (bestMatch && bestScore >= 0.7) {
      return { vehicle: bestMatch, vehicles: [bestMatch], confidence: 'fuzzy' }
    }
  }
  
  // 4. Try partial match (3+ characters)
  if (normalized.length >= 3) {
    const partialMatches = findPartialMatches(normalized, vehicles)
    
    if (partialMatches.length > 0) {
      return { 
        vehicle: null,
        vehicles: partialMatches,
        confidence: 'partial' 
      }
    }
  }
  
  return { vehicle: null, vehicles: [], confidence: 'none' }
}

// ==================== MAIN HOOK ====================

export function useVoiceCommand({ checkedInVehicles, onCommandConfirmed }: UseVoiceCommandProps) {
  const { user } = useAuth()
  
  const [state, setState] = useState<VoiceCommandState>({
    isListening: false,
    isProcessing: false,
    isConnecting: false,
    liveTranscript: '',
    finalTranscript: '',
    lastResult: null,
    error: null,
    sessionActive: false,
    commandHistory: [],
  })
  
  // Refs for WebSocket and MediaRecorder
  const socketRef = useRef<WebSocket | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const keepAliveRef = useRef<NodeJS.Timeout | null>(null)

  // Store recorded chunks
  const audioChunksRef = useRef<Blob[]>([])
  const autoStopTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const MAX_RECORDING_MS = 15000
  const MAX_AUDIO_BYTES = 6 * 1024 * 1024

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening()
    }
  }, [])

  // ==================== FIREBASE TRANSCRIPTION ====================

  /**
   * Transcribe audio via Firebase Cloud Function
   */
  const transcribeViaFirebase = useCallback(async (blob: Blob): Promise<string> => {
    const arrayBuffer = await blob.arrayBuffer()

    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((acc, b) => acc + String.fromCharCode(b), '')
    )

    // Pass vehicle registrations for Deepgram keyterm boosting
    const registrations = checkedInVehicles.map(v => v.registration)

    // TODO(phase5): 'transcribeAudio' Edge Function not deployed yet.
    const { data: invokeData, error } = await supabase.functions.invoke<{ transcript?: string }>('transcribeAudio', {
      body: { audioBase64: base64, mimeType: blob.type || 'audio/webm', registrations },
    })
    if (error) throw error
    return invokeData?.transcript || ''
  }, [checkedInVehicles])

  /**
   * Build the Deepgram WebSocket URL with optimal settings
   * (UNUSED - kept for reference)
   */
  const buildDeepgramUrl = useCallback((apiKey: string): string => {
    const registrations = checkedInVehicles
      .map(v => normalizeReg(v.registration))
      .filter(Boolean)
    
    const autoVocab = [
      'nearside', 'offside', 'front', 'rear', 'driver', 'passenger',
      'tire', 'tyre', 'brake', 'bumper', 'windscreen', 'windshield',
      'bonnet', 'boot', 'sill', 'arch', 'wing', 'door', 'mirror',
      'exhaust', 'suspension', 'steering', 'clutch', 'gearbox',
      'radiator', 'alternator', 'starter', 'battery', 'caliper',
      'oil', 'coolant', 'antifreeze', 'washer', 'filter',
      'MOT', 'service', 'inspection', 'dent', 'scratch', 'crack',
      'leak', 'noise', 'vibration', 'warning', 'light',
      'defleet', 'check', 'repair', 'replace', 'needs',
    ]
    
    const keywords = [...registrations, ...autoVocab]
      .slice(0, 100)
      .map(k => encodeURIComponent(k))
      .join('&keywords=')
    
    const params = new URLSearchParams({
      model: 'nova-2',
      language: 'en-GB',
      smart_format: 'true',
      punctuate: 'true',
      interim_results: 'true',
      utterance_end_ms: '1500',
      vad_events: 'true',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
    })
    
    let url = `wss://api.deepgram.com/v1/listen?${params.toString()}`
    if (keywords.length > 0) url += `&keywords=${keywords}`
    return url
  }, [checkedInVehicles])

  // ==================== START LISTENING ====================

  const startListening = useCallback(async () => {
    if (state.isListening || state.isConnecting) return
    
    setState(prev => ({ 
      ...prev, 
      isConnecting: true, 
      error: null, 
      liveTranscript: '',
      finalTranscript: '',
      lastResult: null,
    }))
    
    try {
      // Haptic feedback
      try { await Haptics.impact({ style: ImpactStyle.Medium }) } catch {}

      // 1. Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      })
      streamRef.current = stream

      // Record audio locally, then send to Firebase on stop
      audioChunksRef.current = []
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        try {
          setState(prev => ({
            ...prev,
            isProcessing: true,
            isListening: false,
            isConnecting: false,
          }))

          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
          if (blob.size === 0) {
            setState(prev => ({
              ...prev,
              isProcessing: false,
              error: "No audio captured. Please try again.",
            }))
            try { await Haptics.notification({ type: NotificationType.Warning }) } catch {}
            return
          }

          if (blob.size > MAX_AUDIO_BYTES) {
            setState(prev => ({
              ...prev,
              isProcessing: false,
              error: 'Recording too long. Please keep voice notes under 15 seconds.',
            }))
            try { await Haptics.notification({ type: NotificationType.Warning }) } catch {}
            return
          }
          
          const transcript = await transcribeViaFirebase(blob)

          if (!transcript.trim()) {
            setState(prev => ({
              ...prev,
              isProcessing: false,
              error: "Couldn't hear anything clearly. Please try again.",
            }))
            try { await Haptics.notification({ type: NotificationType.Warning }) } catch {}
            return
          }

          const result = processCommand(transcript)

          setState(prev => ({
            ...prev,
            isProcessing: false,
            lastResult: result,
            finalTranscript: transcript,
            liveTranscript: '',
          }))

        } catch (err: any) {
          logger.error('❌ Transcription error:', err)
          const functionCode = err?.code || ''
          const functionMessage = err?.message || ''
          let errorMessage = 'Voice transcription failed. Please try again.'

          if (functionCode.includes('unauthenticated')) {
            errorMessage = 'Please sign in again to use voice commands.'
          } else if (functionCode.includes('unavailable')) {
            errorMessage = 'Voice service is unavailable right now. Please try again shortly.'
          } else if (functionCode.includes('invalid-argument')) {
            errorMessage = 'Voice recording was invalid. Please try recording again.'
          } else if (functionMessage) {
            errorMessage = functionMessage
          }

          setState(prev => ({
            ...prev,
            isProcessing: false,
            error: errorMessage,
          }))
          try { await Haptics.notification({ type: NotificationType.Error }) } catch {}
        }
      }

      recorder.start()

      setState(prev => ({ 
        ...prev, 
        isListening: true, 
        isConnecting: false,
        sessionActive: true,
      }))

      toast.success('Voice command active — start speaking!', {
        duration: 2000,
        icon: '🎤',
      })

    } catch (error: any) {
      logger.error('❌ Voice command error:', error)
      
      let errorMessage = 'Failed to start voice command.'
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage = 'Microphone permission denied. Please allow microphone access in your browser settings.'
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone.'
      }
      
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isListening: false,
        isConnecting: false,
      }))
      
      cleanup()
      try { await Haptics.notification({ type: NotificationType.Error }) } catch {}
    }
  }, [state.isListening, state.isConnecting, transcribeViaFirebase])

  // ==================== AUDIO STREAMING ====================
  // (UNUSED - kept for reference)

  const startAudioStream = useCallback((stream: MediaStream, socket: WebSocket) => {
    const audioContext = new AudioContext({ sampleRate: 16000 })
    const source = audioContext.createMediaStreamSource(stream)
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    
    processor.onaudioprocess = (e) => {
      if (socket.readyState !== WebSocket.OPEN) return
      
      const inputData = e.inputBuffer.getChannelData(0)
      const int16Data = new Int16Array(inputData.length)
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]))
        int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
      }
      
      socket.send(int16Data.buffer)
    }
    
    source.connect(processor)
    processor.connect(audioContext.destination)
    
    mediaRecorderRef.current = { audioContext, source, processor } as any
  }, [])

  // ==================== HANDLE DEEPGRAM RESPONSES ====================
  // (UNUSED - kept for reference)

  const handleDeepgramResponse = useCallback((data: any) => {
    if (data.type === 'Results') {
      const transcript = data.channel?.alternatives?.[0]?.transcript || ''
      const isFinal = data.is_final
      
      if (transcript) {
        if (isFinal) {
          setState(prev => ({
            ...prev,
            finalTranscript: prev.finalTranscript 
              ? `${prev.finalTranscript} ${transcript}` 
              : transcript,
            liveTranscript: '',
          }))
        } else {
          setState(prev => ({
            ...prev,
            liveTranscript: transcript,
          }))
        }
      }
    }
    
    if (data.type === 'UtteranceEnd') {
      setState(prev => {
        const fullTranscript = prev.finalTranscript.trim()
        if (!fullTranscript) return prev
        
        const result = processCommand(fullTranscript)
        
        return {
          ...prev,
          lastResult: result,
          isProcessing: false,
          finalTranscript: '',
          liveTranscript: '',
        }
      })
    }
  }, [checkedInVehicles])

  // ==================== PROCESS VOICE COMMAND ====================

  const processCommand = useCallback((transcript: string): VoiceCommandResult => {
    logger.log('🎤 Processing command:', transcript)
    
    const extractedReg = extractRegistration(transcript)
    logger.log('📋 Extracted reg:', extractedReg)
    
    if (!extractedReg) {
      try { Haptics.notification({ type: NotificationType.Warning }) } catch {}
      return {
        registration: '',
        matchedVehicle: null,
        matchedVehicles: [],
        comment: transcript,
        confidence: 'none',
        rawTranscript: transcript,
      }
    }
    
    const { vehicle, vehicles, confidence } = findMatchingVehicle(extractedReg, checkedInVehicles)
    logger.log('🚗 Match:', vehicle?.registration, 'Confidence:', confidence)
    logger.log('📋 Partial matches:', vehicles.length)
    
    const rawComment = extractComment(transcript, extractedReg)
    // ✅ NEW: Auto-flag damage notes
    const comment = detectDamageAndFormat(rawComment)

    logger.log('💬 Comment:', comment)
    
    // Haptic feedback based on match type
    if (confidence === 'exact') {
      try { Haptics.impact({ style: ImpactStyle.Heavy }) } catch {}
    } else if (confidence === 'partial') {
      try { Haptics.impact({ style: ImpactStyle.Medium }) } catch {}
    } else {
      try { Haptics.notification({ type: NotificationType.Warning }) } catch {}
    }
    
    return {
      registration: vehicle ? vehicle.registration : extractedReg,
      matchedVehicle: vehicle,
      matchedVehicles: vehicles,
      comment,
      confidence,
      rawTranscript: transcript,
    }
  }, [checkedInVehicles])

  // ==================== CONFIRM COMMAND ====================

  const confirmCommand = useCallback(async (result?: VoiceCommandResult) => {
    const commandResult = result || state.lastResult
    if (!commandResult?.matchedVehicle || !commandResult.comment) return
    
    setState(prev => ({ ...prev, isProcessing: true }))
    
    try {
      if (onCommandConfirmed) {
        await onCommandConfirmed(commandResult)
      }
      
      setState(prev => ({
        ...prev,
        isProcessing: false,
        commandHistory: [commandResult, ...prev.commandHistory].slice(0, 20),
        lastResult: null,
      }))
      
      try { await Haptics.notification({ type: NotificationType.Success }) } catch {}
      
      toast.success(
        `Updated ${commandResult.registration}`, 
        { duration: 2000, icon: '✅' }
      )
      
    } catch (error) {
      logger.error('❌ Failed to save command:', error)
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: 'Failed to save. Please try again.',
      }))
      try { await Haptics.notification({ type: NotificationType.Error }) } catch {}
    }
  }, [state.lastResult, onCommandConfirmed])

  // ==================== REJECT / SKIP COMMAND ====================

  const rejectCommand = useCallback(() => {
    setState(prev => ({
      ...prev,
      lastResult: null,
      finalTranscript: '',
      liveTranscript: '',
    }))
    try { Haptics.impact({ style: ImpactStyle.Light }) } catch {}
  }, [])

  // ==================== STOP LISTENING ====================

  const stopListening = useCallback(() => {
    // Stop MediaRecorder (will trigger onstop -> transcription)
    if (mediaRecorderRef.current && typeof (mediaRecorderRef.current as any).stop === 'function') {
      try { mediaRecorderRef.current.stop() } catch {}
    }

    cleanup()
    
    setState(prev => ({
      ...prev,
      isListening: false,
      isConnecting: false,
      sessionActive: false,
    }))
  }, [])

  // ==================== CLEANUP ====================

  const cleanup = useCallback(() => {
    // Stop keep-alive
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current)
      keepAliveRef.current = null
    }
    
    // Stop audio processing
    if (mediaRecorderRef.current && (mediaRecorderRef.current as any).audioContext) {
      const recorder = mediaRecorderRef.current as any
      try {
        recorder.processor?.disconnect()
        recorder.source?.disconnect()
        recorder.audioContext?.close()
      } catch {}
      mediaRecorderRef.current = null
    }
    
    // Stop microphone
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    
    // Close socket
    if (socketRef.current) {
      try { socketRef.current.close() } catch {}
      socketRef.current = null
    }
  }, [])

  // ==================== CLEAR ERROR ====================

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }))
  }, [])

  // ==================== RETURN ====================

  return {
    ...state,
    startListening,
    stopListening,
    confirmCommand,
    rejectCommand,
    clearError,
    processCommand,
    vehicleCount: checkedInVehicles.length,
  }
}