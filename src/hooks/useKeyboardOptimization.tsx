// src/hooks/useKeyboardOptimization.tsx
'use client'

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'

/**
 * Custom hook to optimize keyboard/input behavior on Android
 * Fixes backspace lag and improves input responsiveness
 */
export function useKeyboardOptimization() {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') {
      return // Only apply optimizations on Android
    }

    // Fix 1: Add custom styles to improve input performance
    const style = document.createElement('style')
    style.textContent = `
      /* Disable text selection highlighting during input to improve performance */
      input:focus,
      textarea:focus {
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
        -webkit-tap-highlight-color: transparent;
      }

      /* Optimize text input rendering */
      input,
      textarea {
        -webkit-transform: translateZ(0);
        -moz-transform: translateZ(0);
        -ms-transform: translateZ(0);
        transform: translateZ(0);
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      /* Disable auto-correct and auto-capitalize for smoother typing */
      input[type="text"],
      input[type="email"],
      input[type="password"],
      textarea {
        autocorrect: off;
        autocapitalize: off;
      }

      /* Prevent zoom on focus for mobile */
      input:focus,
      textarea:focus,
      select:focus {
        font-size: 16px !important;
      }
    `
    document.head.appendChild(style)

    // Composition event handlers to fix input lag (declare before use)
    const handleCompositionStart = () => {
      // Track composition state if needed
    }
    
    const handleCompositionEnd = (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement
      // Force a reflow to ensure the input is updated
      target.style.transform = 'translateZ(0)'
    }
    
    const handleTouchStart = (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement
      // Ensure keyboard shows immediately on touch
      target.focus()
    }

    // Fix 2: Debounce input events for better performance
    const handleInputOptimization = () => {
      const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
      
      inputs.forEach((input) => {
        // Remove any existing listeners to prevent duplicates
        input.removeEventListener('compositionstart', handleCompositionStart)
        input.removeEventListener('compositionend', handleCompositionEnd)
        input.removeEventListener('touchstart', handleTouchStart)
        
        // Add composition event handlers
        input.addEventListener('compositionstart', handleCompositionStart)
        input.addEventListener('compositionend', handleCompositionEnd)
        
        // Add touch event optimization
        input.addEventListener('touchstart', handleTouchStart, { passive: true })
      })
    }

    // Fix 3: Monitor for dynamically added inputs
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          handleInputOptimization()
        }
      })
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true
    })

    // Initial optimization
    handleInputOptimization()

    // Fix 4: Handle keyboard events globally for better backspace handling
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          // Force immediate update
          e.stopPropagation()
          // Allow default behavior but optimize rendering
          requestAnimationFrame(() => {
            (target as HTMLInputElement | HTMLTextAreaElement).dispatchEvent(
              new Event('input', { bubbles: true })
            )
          })
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown, { capture: true })

    // Cleanup
    return () => {
      if (style.parentNode) {
        style.parentNode.removeChild(style)
      }
      observer.disconnect()
      document.removeEventListener('keydown', handleKeyDown, { capture: true })
      
      // Clean up event listeners from inputs
      const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
      inputs.forEach((input) => {
        input.removeEventListener('compositionstart', handleCompositionStart)
        input.removeEventListener('compositionend', handleCompositionEnd)
        input.removeEventListener('touchstart', handleTouchStart)
      })
    }
  }, [])
}

// Export a component wrapper for easy use
export function KeyboardOptimizationProvider({ children }: { children: React.ReactNode }) {
  useKeyboardOptimization()
  return <>{children}</>
}