// src/components/legal/LegalFooter.tsx
'use client'

import React, { useState } from 'react'
import { LegalModal } from './LegalModal'
import { PrivacyPolicyContent } from './PrivacyPolicyContent'
import { TermsConditionsContent } from './TermsConditionsContent'

interface LegalFooterProps {
  variant?: 'light' | 'dark'
  className?: string
}

export const LegalFooter: React.FC<LegalFooterProps> = ({ 
  variant = 'dark',
  className = '' 
}) => {
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false)
  const [showTerms, setShowTerms] = useState(false)

  const isDark = variant === 'dark'

  return (
    <>
      <footer 
        className={`
          py-4 sm:py-6 relative z-10
          ${isDark 
            ? 'bg-[#0D0D0D] text-[#72A68E]' 
            : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-800'
          }
          ${className}
        `}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Main Footer Content */}
          <div className="flex flex-col items-center space-y-3">
            {/* Copyright */}
            <p className="text-xs sm:text-sm text-center">
              © 2025 Yardao. Built for yard managers who want to get stuff done.
            </p>

            {/* Desktop: Everything on one row | Mobile: Stacked vertically */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center items-center gap-y-2 gap-x-2 text-xs w-full">
              {/* Legal Links & Email - One row on mobile, inline on desktop */}
              <div className="flex flex-wrap justify-center items-center gap-2">
                <button
                  onClick={() => setShowPrivacyPolicy(true)}
                  className={`
                    hover:underline transition-colors whitespace-nowrap
                    ${isDark 
                      ? 'text-[#C5D9D0] hover:text-white' 
                      : 'text-[#025940] hover:text-[#012619] dark:text-teal-400 dark:hover:text-teal-300'
                    }
                  `}
                >
                  Privacy Policy
                </button>
                
                <span className="text-gray-400">•</span>
                
                <button
                  onClick={() => setShowTerms(true)}
                  className={`
                    hover:underline transition-colors whitespace-nowrap
                    ${isDark 
                      ? 'text-[#C5D9D0] hover:text-white' 
                      : 'text-[#025940] hover:text-[#012619] dark:text-teal-400 dark:hover:text-teal-300'
                    }
                  `}
                >
                  Terms & Conditions
                </button>

                <span className="text-gray-400">•</span>

                <a 
                  href="mailto:support@yardao.com"
                  className={`
                    hover:underline whitespace-nowrap
                    ${isDark 
                      ? 'text-[#C5D9D0] hover:text-white' 
                      : 'text-[#025940] hover:text-[#012619] dark:text-teal-400 dark:hover:text-teal-300'
                    }
                  `}
                >
                  support@yardao.com
                </a>
              </div>

              {/* Separator for desktop only */}
              <span className="hidden sm:inline text-gray-400">•</span>

              {/* Address - Smaller text, separate row on mobile */}
              <div className="text-[10px] sm:text-xs opacity-80 text-center">
                Office 183, 18 Young St, UNIT LGE, Edinburgh, EH2 4JB, Scotland
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <LegalModal
        isOpen={showPrivacyPolicy}
        onClose={() => setShowPrivacyPolicy(false)}
        title="Privacy Policy"
      >
        <PrivacyPolicyContent />
      </LegalModal>

      <LegalModal
        isOpen={showTerms}
        onClose={() => setShowTerms(false)}
        title="Terms & Conditions"
      >
        <TermsConditionsContent />
      </LegalModal>
    </>
  )
}