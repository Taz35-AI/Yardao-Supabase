// src/constants/brand.ts
// Centralised brand colours and design tokens for Yardao
// Mirrors the CSS variables already declared in globals.css
// Use these in TypeScript code; use the CSS vars in stylesheets

export const BRAND = {
  // Core brand palette
  darkest: '#012619',
  dark:    '#025940',
  mid:     '#72A68E',
  light:   '#C5D9D0',
  accent:  '#b3f243',

  // Surfaces
  bg:      '#f6f8f7',
  border:  '#e2e8e5',
  white:   '#ffffff',
  text:    '#1a1f1c',

  // States
  success: '#10b981',
  warning: '#f59e0b',
  error:   '#ef4444',
} as const

// Pre-mixed alpha utilities for common UI patterns
export const BRAND_ALPHA = {
  accentDim:    'rgba(179,242,67,0.15)',
  accentBright: 'rgba(179,242,67,0.6)',
  accentSoft:   'rgba(179,242,67,0.3)',
  midSoft:      'rgba(114,166,142,0.25)',
  midBright:    'rgba(114,166,142,0.5)',
  darkSoft:     'rgba(2,89,64,0.06)',
  darkMedium:   'rgba(2,89,64,0.1)',
  errorSoft:    'rgba(239,68,68,0.12)',
} as const

// Building/feature block colour palette (used in the yard layout editor)
// Curated to look good against the dashed grid background
export const BLOCK_COLORS = [
  BRAND.darkest,
  BRAND.dark,
  BRAND.mid,
  BRAND.accent,
  '#4F86F7', // friendly blue
  '#1e3a8a', // deep navy
  '#9ca3af', // neutral grey
  '#0a0a0a', // near-black
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#a855f7', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
] as const

// Colours where text should be DARK instead of white for legibility
export const LIGHT_BLOCK_COLORS = new Set<string>([
  BRAND.accent,
  '#9ca3af',
  '#eab308',
])