// src/lib/conditionUtils.ts - Fixed Color Handling for Custom Conditions
import { ConditionCategory } from './firestore'
import { logger } from '@/lib/logger'

// Store condition objects for quick lookup
let conditionLookup: Map<string, ConditionCategory> = new Map()

// Function to update the condition lookup cache
export const updateConditionLookup = (conditions: ConditionCategory[]) => {
  conditionLookup.clear()
  conditions.forEach(condition => {
    conditionLookup.set(condition.name, condition)
  })
}

// Function to get condition color with proper fallbacks
export const getConditionColor = (condition: ConditionCategory | string): string => {
  // If it's already a ConditionCategory object, use its color
  if (typeof condition === 'object' && condition.color) {
    return condition.color
  }

  // If it's a string, look it up in our cache first
  if (typeof condition === 'string') {
    const foundCondition = conditionLookup.get(condition)
    if (foundCondition && foundCondition.color) {
      return foundCondition.color
    }

    // Fallback for predefined condition names
    switch (condition.toLowerCase()) {
      case 'excellent':
        return '#16a34a' // Dark green - best condition
      case 'good':
        return '#22c55e' // Light green - good condition
      case 'fair':
        return '#eab308' // Yellow/amber - needs attention
      case 'poor':
        return '#f97316' // Orange - significant issues
      case 'critical':
        return '#ef4444' // Red - major problems
      
      // LEGACY SUPPORT - Keep old condition names for backward compatibility
      case 'perfect bodywork':
        return '#16a34a' // Dark green
      case 'decent bodywork':
        return '#22c55e' // Light green
      case 'needs bodywork':
        return '#eab308' // Yellow
      case 'major bodywork needed':
        return '#f97316' // Orange
      case 'needs repair':
        return '#ef4444' // Red
      case 'non-starter':
        return '#991b1b' // Dark red
      
      default:
        // For unknown custom conditions, return default gray
        logger.log(`Unknown condition "${condition}", using default color`)
        return '#6b7280' // Gray for unknown conditions
    }
  }
  
  // Ultimate fallback
  return '#6b7280'
}

// Function to get condition object by name
export const getConditionByName = (conditionName: string): ConditionCategory | null => {
  return conditionLookup.get(conditionName) || null
}

export const getConditionTextColor = (backgroundColor: string): string => {
  // For dark backgrounds, use white text
  const darkColors = ['#16a34a', '#991b1b', '#ef4444', '#dc2626', '#065f46', '#374151', '#1f2937', '#4b5563']
  return darkColors.includes(backgroundColor) ? '#ffffff' : '#000000'
}

export const getConditionSeverityLevel = (condition: ConditionCategory | string): number => {
  if (typeof condition === 'string') {
    // Check cache first for custom conditions
    const foundCondition = conditionLookup.get(condition)
    if (foundCondition) {
      return getSeverityNumber(foundCondition.severity)
    }

    // Updated severity mapping - NEW CONDITION NAMES
    switch (condition.toLowerCase()) {
      case 'excellent': return 5
      case 'good': return 4
      case 'fair': return 3
      case 'poor': return 2
      case 'critical': return 1
      
      // LEGACY SUPPORT - Keep old condition names for backward compatibility
      case 'perfect bodywork': return 5
      case 'decent bodywork': return 4
      case 'needs bodywork': return 3
      case 'major bodywork needed': return 2
      case 'needs repair': return 1
      case 'non-starter': return 0
      
      default: return 0
    }
  }
  
  // For ConditionCategory objects, use the severity property
  return getSeverityNumber(condition.severity)
}

// Helper function to convert severity to number
const getSeverityNumber = (severity: ConditionCategory['severity']): number => {
  switch (severity) {
    case 'excellent': return 5
    case 'good': return 4
    case 'fair': return 3
    case 'poor': return 2
    case 'critical': return 1
    default: return 0
  }
}

// NEW UTILITY FUNCTION: Get condition badge styling
export const getConditionBadgeStyle = (condition: ConditionCategory | string) => {
  const color = getConditionColor(condition)
  const textColor = getConditionTextColor(color)
  
  return {
    backgroundColor: color,
    color: textColor,
    border: `1px solid ${color}`,
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '12px',
    fontWeight: '500',
    display: 'inline-block'
  }
}

// NEW UTILITY FUNCTION: Get condition display name
export const getConditionDisplayName = (condition: ConditionCategory | string): string => {
  if (typeof condition === 'string') {
    // Check cache first for custom conditions
    const foundCondition = conditionLookup.get(condition)
    if (foundCondition) {
      return foundCondition.name
    }

    // Convert legacy names to new names
    switch (condition.toLowerCase()) {
      case 'perfect bodywork': return 'Excellent'
      case 'decent bodywork': return 'Good'
      case 'needs bodywork': return 'Fair'
      case 'major bodywork needed': return 'Critical'
      case 'needs repair': return 'Critical'
      case 'non-starter': return 'Critical'
      default: return condition
    }
  }
  
  return condition.name
}