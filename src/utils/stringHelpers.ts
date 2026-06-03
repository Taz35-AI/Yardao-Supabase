// src/utils/stringHelpers.ts

/**
 * Safely trims a string value, handling undefined/null
 * Returns empty string if value is undefined or null
 */
export function safeStringTrim(value: string | undefined | null): string {
  return (value || '').toString().trim()
}

/**
 * Capitalizes the first letter of a string
 */
export function capitalize(str: string): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Converts a string to title case
 * Example: "hello world" -> "Hello World"
 */
export function toTitleCase(str: string): string {
  if (!str) return ''
  return str
    .toLowerCase()
    .split(' ')
    .map(word => capitalize(word))
    .join(' ')
}

/**
 * Truncates a string to a maximum length
 * Adds ellipsis if truncated
 */
export function truncate(str: string, maxLength: number): string {
  if (!str || str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

/**
 * Removes extra whitespace from a string
 */
export function normalizeWhitespace(str: string): string {
  if (!str) return ''
  return str.replace(/\s+/g, ' ').trim()
}

/**
 * Checks if a string is empty (null, undefined, or only whitespace)
 */
export function isEmpty(str: string | undefined | null): boolean {
  return !str || str.trim().length === 0
}

/**
 * Formats a registration plate consistently (uppercase, no extra spaces)
 */
export function formatRegistration(registration: string): string {
  return safeStringTrim(registration).toUpperCase()
}