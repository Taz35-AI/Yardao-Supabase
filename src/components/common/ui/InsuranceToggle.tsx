// src/components/common/ui/InsuranceToggle.tsx
// ✅ UPDATED: Policy-aware toggle
// - Toggling ON → opens PolicyPickerModal so user picks which policy
// - Toggling OFF → instant, no picker needed
// - Shows policy name + expiry badge below the toggle when insured

'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Shield, ShieldAlert, Calendar, AlertTriangle, ChevronDown, Check } from 'lucide-react'
import { InsuranceStatus, getInsuranceStatusConfig } from '@/types'
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

  // Dropdown state
  const [open, setOpen] = useState(false)
  const [policies, setPolicies] = useState<InsurancePolicy[]>([])
  const [policiesLoaded, setPoliciesLoaded] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

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
      logger.log('🛡️ Insurance policies loaded for dropdown:', data.length)
    } catch (err) {
      logger.error('Failed to load policies for dropdown:', err)
      setPolicies([])
      setPoliciesLoaded(true)
    }
  }

  const openMenu = async () => {
    if (disabled) return
    if (!open) await loadPolicies()
    setOpen(o => !o)
  }
  // onToggle is unchanged, so the existing fleet↔yard insurance sync is preserved.
  const chooseNotInsured = () => { setOpen(false); onToggle('Not Insured', null) }
  const choosePolicy = (policy: InsurancePolicy) => { setOpen(false); onToggle('Insured', policy); logger.log('🛡️ Policy selected:', policy.name) }

  // Expiry badge for the current policy (shown below toggle)
  const policyExpiryBadge = (() => {
    if (!currentPolicyExpiry) return null
    const days = getDaysUntilExpiry(currentPolicyExpiry)
    if (days < 0)   return { label: 'Expired',      cls: 'text-red-600 dark:text-red-400',    icon: AlertTriangle }
    if (days <= 30) return { label: `Expires soon`,  cls: 'text-amber-600 dark:text-amber-400', icon: AlertTriangle }
    return           { label: `Exp. ${formatDisplayDate(currentPolicyExpiry)}`, cls: 'text-green-600 dark:text-green-400', icon: Calendar }
  })()

  const triggerLabel = isInsured ? (currentPolicyName || 'Insured — choose policy') : 'Not Insured'

  return (
    <div className={`flex flex-col gap-2 ${className}`} ref={rootRef}>
      {/* Dropdown trigger */}
      <div className="relative">
        <button
          type="button"
          onClick={openMenu}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`inline-flex items-center gap-2 ${sizes.text} font-semibold rounded-xl border px-3 py-2 transition-colors max-w-full ${
            disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-sm'
          } ${
            isInsured
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/50'
              : 'bg-red-50 border-red-300 text-red-700 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/50'
          }`}
        >
          {isInsured ? <Shield className="w-4 h-4 flex-shrink-0" /> : <ShieldAlert className="w-4 h-4 flex-shrink-0" />}
          <span className="truncate">{triggerLabel}</span>
          {!disabled && <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />}
        </button>

        {/* Dropdown menu: Not Insured + every policy */}
        {open && (
          <div className="absolute left-0 z-50 mt-1 w-72 max-w-[85vw] rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl overflow-hidden" role="listbox">
            <div className="max-h-72 overflow-y-auto py-1">
              {/* Not Insured */}
              <button
                type="button"
                onClick={chooseNotInsured}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span className="flex-1 font-semibold text-red-700 dark:text-red-300">Not Insured</span>
                {!isInsured && <Check className="w-4 h-4 text-red-600" />}
              </button>

              <div className="my-1 border-t border-[#eef2f0] dark:border-gray-700" />

              {policies.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-400">No policies set up. Add them in Settings → Insurance.</p>
              ) : policies.map(p => {
                const selected = isInsured && (currentPolicyId ? currentPolicyId === p.id : currentPolicyName === p.name)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => choosePolicy(p)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                  >
                    <Shield className="w-4 h-4 text-[#025940] flex-shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-[#012619] dark:text-white truncate">{p.name}</span>
                      {(p as any).expiryDate && <span className="block text-[10px] text-gray-400">Exp. {formatDisplayDate((p as any).expiryDate)}</span>}
                    </span>
                    {selected && <Check className="w-4 h-4 text-[#025940] flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Expiry badge for the currently-assigned policy */}
      {isInsured && currentPolicyName && policyExpiryBadge && (() => {
        const BadgeIcon = policyExpiryBadge.icon
        return (
          <span className={`inline-flex items-center gap-1 text-xs pl-1 ${policyExpiryBadge.cls}`}>
            <BadgeIcon className="w-3 h-3" />
            {policyExpiryBadge.label}
          </span>
        )
      })()}
    </div>
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