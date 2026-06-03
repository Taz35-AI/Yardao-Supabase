// src/utils/deliveryHelpers.ts
// ✅ RESTYLED: Brand-aligned colours - #b3f243, #012619, #025940, #72A68E, #C5D9D0
import { Package, RouteOff, LucideIcon } from 'lucide-react'
import { DeliveryOperationType } from '@/components/features/deliveries-defleet/DeliveriesDefleetContent'

/**
 * Gets the appropriate icon for an operation type
 */
export function getOperationIcon(operationType: DeliveryOperationType): LucideIcon {
  return operationType === 'delivery' ? Package : RouteOff
}

/**
 * Gets human-readable label for operation type
 */
export function getOperationLabel(operationType: DeliveryOperationType): string {
  return operationType === 'delivery' ? 'Delivery' : 'Defleet'
}

/**
 * Gets the color scheme for an operation type
 * ✅ RESTYLED: Uses brand colours instead of generic Tailwind
 */
export function getOperationColor(operationType: DeliveryOperationType): {
  badge: string
  bg: string
  border: string
  text: string
  /** Inline style overrides for precise brand colours */
  style: {
    badgeBg: string
    badgeText: string
    badgeBorder: string
    bgColor: string
    borderColor: string
    textColor: string
  }
} {
  if (operationType === 'delivery') {
    return {
      // Tailwind fallbacks for basic compatibility
      badge: 'text-white border',
      bg: '',
      border: '',
      text: '',
      // Precise brand colours via inline styles
      style: {
        badgeBg: '#025940',
        badgeText: '#b3f243',
        badgeBorder: '#72A68E',
        bgColor: 'rgba(2,89,64,0.06)',
        borderColor: 'rgba(114,166,142,0.25)',
        textColor: '#025940',
      }
    }
  } else {
    return {
      badge: 'text-white border',
      bg: '',
      border: '',
      text: '',
      style: {
        badgeBg: '#7f1d1d',
        badgeText: '#fca5a5',
        badgeBorder: '#991b1b',
        bgColor: 'rgba(127,29,29,0.06)',
        borderColor: 'rgba(153,27,27,0.2)',
        textColor: '#991b1b',
      }
    }
  }
}

/**
 * Gets the color scheme for completion status
 * ✅ RESTYLED: Brand-aligned
 */
export function getCompletionColor(isCompleted: boolean): {
  badge: string
  bg: string
  border: string
  text: string
  style: {
    badgeBg: string
    badgeText: string
    badgeBorder: string
    bgColor: string
    borderColor: string
    textColor: string
  }
} {
  if (isCompleted) {
    return {
      badge: 'text-white border',
      bg: '',
      border: '',
      text: '',
      style: {
        badgeBg: '#025940',
        badgeText: '#b3f243',
        badgeBorder: '#72A68E',
        bgColor: 'rgba(2,89,64,0.08)',
        borderColor: 'rgba(114,166,142,0.3)',
        textColor: '#025940',
      }
    }
  } else {
    return {
      badge: 'text-white border',
      bg: '',
      border: '',
      text: '',
      style: {
        badgeBg: '#92400e',
        badgeText: '#fde68a',
        badgeBorder: '#b45309',
        bgColor: 'rgba(146,64,14,0.06)',
        borderColor: 'rgba(180,83,9,0.2)',
        textColor: '#92400e',
      }
    }
  }
}

/**
 * Gets human-readable label for completion status
 */
export function getCompletionLabel(isCompleted: boolean): string {
  return isCompleted ? 'Completed' : 'Pending'
}

/**
 * Validates if defleet entry has required fields
 */
export function validateDefleetEntry(reason?: string, destination?: string): {
  isValid: boolean
  error?: string
} {
  if (!reason || !reason.trim()) {
    return { isValid: false, error: 'Defleet reason is required' }
  }
  if (!destination || !destination.trim()) {
    return { isValid: false, error: 'Defleet destination is required' }
  }
  return { isValid: true }
}

/**
 * Validates if delivery entry has minimum required fields
 */
export function validateDeliveryEntry(registration: string): {
  isValid: boolean
  error?: string
} {
  if (!registration || !registration.trim()) {
    return { isValid: false, error: 'Registration is required' }
  }
  return { isValid: true }
}