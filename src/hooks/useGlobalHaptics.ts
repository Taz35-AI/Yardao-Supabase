// src/hooks/useGlobalHaptics.ts
import { useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

export const useGlobalHaptics = () => {
  useEffect(() => {
    const handleGlobalClick = async (e: Event) => {
      const target = e.target as HTMLElement
      
      // Check if the clicked element or its parent is interactive
      const isClickable = (
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.closest('button') ||
        target.closest('a') ||
        target.closest('[role="button"]') ||
        target.closest('[onclick]') ||
        target.closest('.clickable') ||
        target.closest('[data-testid]') ||
        target.classList.contains('cursor-pointer') ||
        target.style.cursor === 'pointer' ||
        // Catch divs, spans, and other elements that might be clickable
        getComputedStyle(target).cursor === 'pointer' ||
        // Check if parent elements are clickable
        target.parentElement?.onclick ||
        target.closest('[data-haptic]')
      )

      // Skip if element is disabled
      const isDisabled = (
        target.hasAttribute('disabled') ||
        target.closest('[disabled]') ||
        target.classList.contains('disabled') ||
        target.closest('.disabled')
      )

      if (isClickable && !isDisabled) {
        try {
          // Check for custom haptic intensity on the element or parent
          const hapticElement = target.closest('[data-haptic-intensity]')
          const intensityAttr = hapticElement?.getAttribute('data-haptic-intensity')
          
          let style = ImpactStyle.Light // Default
          
          if (intensityAttr === 'medium') {
            style = ImpactStyle.Medium
          } else if (intensityAttr === 'heavy') {
            style = ImpactStyle.Heavy
          }
          
          await Haptics.impact({ style })
        } catch (error) {
          // Haptic feedback not available (web browser, etc.)
          // Silently fail
        }
      }
    }

    // Add the global click listener
    document.addEventListener('click', handleGlobalClick, true)
    
    // Cleanup on unmount
    return () => {
      document.removeEventListener('click', handleGlobalClick, true)
    }
  }, [])
}

// Export individual haptic functions for manual use
export const triggerHaptic = async (style: ImpactStyle = ImpactStyle.Light) => {
  try {
    await Haptics.impact({ style })
  } catch (error) {
    // Haptic not available
  }
}

export const triggerLightHaptic = () => triggerHaptic(ImpactStyle.Light)
export const triggerMediumHaptic = () => triggerHaptic(ImpactStyle.Medium)
export const triggerHeavyHaptic = () => triggerHaptic(ImpactStyle.Heavy)