// src/components/common/ui/InsuranceToggle.tsx
// ✅ UPDATED: Policy-aware toggle
// - Toggling ON → opens PolicyPickerModal so user picks which policy
// - Toggling OFF → instant, no picker needed
// - Shows policy name + expiry badge below the toggle when insured

'use client'

import React, { useState, useEffect } from 'react'
import { Shield, ShieldAlert, Calendar, Building2, AlertTriangle } from 'lucide-react'
import { InsuranceStatus, getInsuranceStatusConfig } from '@/types'
import { PolicyPickerModal } from '@/components/common/Modals/PolicyPickerModal'
import { settingsService, InsurancePolicy } from '@/lib/services/settingsService'
import { userProfileService } from '@/lib/firestore'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/lib/logger'

// ── Helpers ────────────────────────────────────────────────────────────────────

function getDaysUntilExpiry(expiryDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(expiryDate).getTime() - today.getTime()) / 86_400_000)
}

function formatDisplayDate(isoDate: string): string {
  if (!isoDate) return ''
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface InsuranceToggleProps {
  insuranceStatus: InsuranceStatus | null
  onToggle: (status: InsuranceStatus, policy?: InsurancePolicy | null) => void
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
  showLabel?: boolean
  /** Currently assigned policy ID — used to highlight it in the picker */
  currentPolicyId?: string | null
  /** Currently assigned policy name — displayed in the badge */
  currentPolicyName?: string | null
  /** Currently assigned policy expiry — shown in the badge */
  currentPolicyExpiry?: string | null
  /** Registration shown in the picker modal title */
  vehicleRegistration?: string
}

// ── Size config ────────────────────────────────────────────────────────────────

const SIZE = {
  sm: { toggle: 'w-11 h-6', circle: 'w-5 h-5', translate: 'translate-x-5', text: 'text-xs' },
  md: { toggle: 'w-14 h-7', circle: 'w-6 h-6', translate: 'translate-x-7', text: 'text-sm' },
  lg: { toggle: 'w-16 h-8', circle: 'w-7 h-7', translate: 'translate-x-8', text: 'text-base' },
} as const

// ── Component ──────────────────────────────────────────────────────────────────

export function InsuranceToggle({
  insuranceStatus,
  onToggle,
  disabled = false,
  size = 'md',
  className = '',
  showLabel = true,
  currentPolicyId,
  currentPolicyName,
  currentPolicyExpiry,
  vehicleRegistration = 'Vehicle',
}: InsuranceToggleProps) {
  const { user } = useAuth()

  const isInsured = insuranceStatus === 'Insured'
  const config = getInsuranceStatusConfig(insuranceStatus)
  const sizes = SIZE[size]

  // Policy picker state
  const [pickerOpen, setPickerOpen] = useState(false)
  const [policies, setPolicies] = useState<InsurancePolicy[]>([])
  const [policiesLoaded, setPoliciesLoaded] = useState(false)

  // Load policies lazily — only when first opened
  const loadPolicies = async () => {
    if (policiesLoaded) return
    try {
      if (!user?.uid) return
      const profile = await userProfileService.getProfile(user.uid)
      if (!profile?.organizationId) return
      const data = await settingsService.getInsurancePolicies(profile.organizationId)
      setPolicies(data)
      setPoliciesLoaded(true)
      logger.log('🛡️ Insurance policies loaded for picker:', data.length)
    } catch (err) {
      logger.error('Failed to load policies for picker:', err)
      setPolicies([])
      setPoliciesLoaded(true)
    }
  }

  const handleToggleClick = async () => {
    if (disabled) return

    if (isInsured) {
      // Toggling OFF — instant, no picker
      onToggle('Not Insured', null)
    } else {
      // Toggling ON — load policies then open picker
      await loadPolicies()
      setPickerOpen(true)
    }
  }

  const handlePolicySelect = (policy: InsurancePolicy) => {
    setPickerOpen(false)
    onToggle('Insured', policy)
    logger.log('🛡️ Policy selected:', policy.name)
  }

  const handlePickerCancel = () => {
    setPickerOpen(false)
    // Don't change status — user cancelled
  }

  // Expiry badge for the current policy (shown below toggle)
  const policyExpiryBadge = (() => {
    if (!currentPolicyExpiry) return null
    const days = getDaysUntilExpiry(currentPolicyExpiry)
    if (days < 0)   return { label: 'Expired',      cls: 'text-red-600 dark:text-red-400',    icon: AlertTriangle }
    if (days <= 30) return { label: `Expires soon`,  cls: 'text-amber-600 dark:text-amber-400', icon: AlertTriangle }
    return           { label: `Exp. ${formatDisplayDate(currentPolicyExpiry)}`, cls: 'text-green-600 dark:text-green-400', icon: Calendar }
  })()

  return (
    <>
      <div className={`flex flex-col gap-2 ${className}`}>
        {/* Toggle row */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleToggleClick}
            disabled={disabled}
            className={`
              relative inline-flex ${sizes.toggle} items-center flex-shrink-0 cursor-pointer rounded-full
              transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2
              ${isInsured
                ? 'bg-green-500 hover:bg-green-600 focus:ring-green-400 shadow-lg shadow-green-500/25'
                : 'bg-red-500 hover:bg-red-600 focus:ring-red-400 shadow-lg shadow-red-500/25'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-xl active:scale-95'}
            `}
            role="switch"
            aria-checked={isInsured}
            aria-label={`Insurance status: ${config.label}`}
          >
            <span
              className={`
                ${isInsured ? sizes.translate : 'translate-x-0.5'}
                inline-block ${sizes.circle} transform rounded-full
                bg-white shadow-lg transition-all duration-300 ease-in-out
              `}
            />
          </button>

          {showLabel && (
            <div className="flex flex-col">
              <span className={`font-medium ${config.color} ${sizes.text}`}>
                {config.label}
              </span>
              {!insuranceStatus && (
                <span className="text-xs text-gray-500 dark:text-gray-400">Not Set</span>
              )}
            </div>
          )}
        </div>

        {/* Policy badge — shown when insured + policy assigned */}
        {isInsured && currentPolicyName && (
          <div className="flex flex-wrap items-center gap-1.5 pl-1">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#025940] dark:text-[#72A68E] bg-[#f0faf4] dark:bg-[#025940]/20 px-2.5 py-1 rounded-full border border-[#c3e6d0] dark:border-[#025940]">
              <Shield className="w-3 h-3 flex-shrink-0" />
              <span className="truncate max-w-[150px]">{currentPolicyName}</span>
            </span>
            {policyExpiryBadge && (() => {
              const BadgeIcon = policyExpiryBadge.icon
              return (
                <span className={`inline-flex items-center gap-1 text-xs ${policyExpiryBadge.cls}`}>
                  <BadgeIcon className="w-3 h-3" />
                  {policyExpiryBadge.label}
                </span>
              )
            })()}
          </div>
        )}

        {/* Hint when insured but no policy assigned */}
        {isInsured && !currentPolicyName && (
          <p className="text-xs text-gray-400 dark:text-gray-500 pl-1">
            Tap toggle to assign a policy
          </p>
        )}
      </div>

      {/* Policy picker modal */}
      <PolicyPickerModal
        isOpen={pickerOpen}
        vehicleRegistration={vehicleRegistration}
        policies={policies}
        onSelect={handlePolicySelect}
        onCancel={handlePickerCancel}
        currentPolicyId={currentPolicyId}
      />
    </>
  )
}

// ── Static badge (display-only, no toggle) ────────────────────────────────────

interface InsuranceStatusBadgeProps {
  status: InsuranceStatus | null
  showIcon?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function InsuranceStatusBadge({
  status,
  showIcon = true,
  size = 'md',
  className = '',
}: InsuranceStatusBadgeProps) {
  const config = getInsuranceStatusConfig(status)

  const sizeCls = { sm: 'px-2 py-1 text-xs', md: 'px-3 py-1.5 text-sm', lg: 'px-4 py-2 text-base' }
  const iconCls = { sm: 'w-3 h-3', md: 'w-4 h-4', lg: 'w-5 h-5' }

  return (
    <div className={`inline-flex items-center space-x-1.5 rounded-full font-medium border ${config.bgColor} ${config.borderColor} ${config.textColor} ${sizeCls[size]} ${className}`}>
      {showIcon && (
        <>
          {status === 'Insured'     && <Shield      className={iconCls[size]} />}
          {status === 'Not Insured' && <ShieldAlert className={iconCls[size]} />}
          {!status                  && <ShieldAlert className={`${iconCls[size]} text-gray-400`} />}
        </>
      )}
      <span>{config.label}</span>
    </div>
  )
}

export default InsuranceToggle