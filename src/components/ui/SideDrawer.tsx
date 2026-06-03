// src/components/ui/SideDrawer.tsx
// Reusable side drawer component with glassmorphism design
// Slides in from the right with overlay backdrop
// ✅ FIXED: Proper z-index and positioning to ensure drawer is fully visible

'use client'

import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createPortal } from 'react-dom'

interface SideDrawerProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: 'sm' | 'md' | 'lg' | 'xl'
}

const widthClasses = {
  sm: 'w-80',      // 320px
  md: 'w-96',      // 384px  
  lg: 'w-[450px]', // 450px - REDUCED from 500px
  xl: 'w-[550px]'  // 550px - REDUCED from 600px
}

export function SideDrawer({ 
  isOpen, 
  onClose, 
  title, 
  children,
  width = 'lg'
}: SideDrawerProps) {
  
  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])
  
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])
  
  if (!isOpen) return null
  
  // 🔥 FIXED: Use React Portal to render directly in body, bypassing parent overflow issues
  const drawerContent = (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        style={{ 
          animation: 'fadeIn 0.2s ease-out',
          zIndex: 9997 // Lower than drawer and modals
        }}
      />
      
      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 h-full ${widthClasses[width]} bg-white dark:bg-gray-900 shadow-2xl overflow-hidden flex flex-col`}
        style={{
          animation: 'slideInRight 0.3s ease-out',
          borderLeft: '2px solid #72A68E',
          zIndex: 9998, // Below modals (which use 9999+) but above everything else
          maxWidth: '90vw', // Ensure it doesn't exceed 90% of viewport width on mobile
          // iPhone notch / Dynamic Island clearance — without this, the
          // drawer header (and its X button) sit behind the system UI and
          // become untappable. env() returns 0 on Android / non-notch
          // devices so layout there is unchanged.
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Header */}
        <div 
          className="px-6 py-4 border-b flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #025940 0%, #012619 100%)',
            borderBottom: '1px solid rgba(114, 166, 142, 0.3)'
          }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">
              {title}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
      
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideInRight {
          from { 
            transform: translateX(100%);
          }
          to { 
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  )

  // 🔥 FIXED: Render in a portal directly to document.body to avoid parent container overflow issues
  return typeof window !== 'undefined' 
    ? createPortal(drawerContent, document.body)
    : null
}