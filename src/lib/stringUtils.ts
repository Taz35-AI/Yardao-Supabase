// src/lib/stringUtils.ts

/**
 * Safely converts a value to lowercase string
 * Handles null, undefined, and non-string values
 */
export function safeToLowerCase(value: any): string {
  if (value === null || value === undefined) {
    return ''
  }
  
  if (typeof value === 'string') {
    return value.toLowerCase()
  }
  
  // Convert other types to string first, then lowercase
  try {
    return String(value).toLowerCase()
  } catch (error) {
    return ''
  }
}

/**
 * Safely checks if a string includes another string
 * Handles null/undefined values gracefully
 */
export function safeIncludes(haystack: any, needle: string): boolean {
  const safeHaystack = safeToLowerCase(haystack)
  const safeNeedle = safeToLowerCase(needle)
  
  return safeHaystack.includes(safeNeedle)
}

/**
 * Safely searches through multiple fields
 */
export function searchInFields(searchTerm: string, ...fields: any[]): boolean {
  if (!searchTerm || !searchTerm.trim()) return true
  
  const searchLower = safeToLowerCase(searchTerm)
  
  return fields.some(field => {
    const fieldLower = safeToLowerCase(field)
    return fieldLower.includes(searchLower)
  })
}