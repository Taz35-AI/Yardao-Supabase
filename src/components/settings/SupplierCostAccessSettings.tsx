// src/components/settings/SupplierCostAccessSettings.tsx
// Settings > Organization > Supplier costs. The org OWNER picks which admins
// may see supplier rental costs (Reports section + the rate field in the
// vehicle edit dialog). Owner always has access. Same toggle-list pattern as
// the Hire access section in HireSettingsModal. Enforced by RLS (0072).
'use client'

import React, { useEffect, useState } from 'react'
import { Wallet, ShieldCheck, Lock, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { isAdminRole } from '@/lib/permissions'
import { supplierCostAccessService } from '@/lib/services/supplierCostAccessService'
import { useSupplierCostAccess } from '@/hooks/useSupplierCostAccess'
import { logger } from '@/lib/logger'
import type { UserProfile } from '@/types'

export function SupplierCostAccessSettings() {
  const { user, profile } = useAuth()
  const access = useSupplierCostAccess()
  const orgId = profile?.organizationId

  const [admins, setAdmins] = useState<UserProfile[]>([])
  const [accessIds, setAccessIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!orgId || !access.isOwner) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [users, ids] = await Promise.all([
          userProfileService.getActiveUsersByOrganization(orgId),
          supplierCostAccessService.getAccessUserIds(orgId),
        ])
        if (cancelled) return
        // Eligible = admin-role users, excluding the owner (always has access).
        setAdmins(users.filter((u) => isAdminRole(u.role) && u.uid !== user?.uid))
        setAccessIds(new Set(ids))
      } catch (err) {
        logger.error('SupplierCostAccessSettings load failed:', err)
        if (!cancelled) setAdmins([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orgId, access.isOwner, user?.uid])

  const toggle = (uid: string) => {
    setAccessIds((prev) => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
    setDirty(true)
  }

  const save = async () => {
    if (!orgId) return
    setSaving(true)
    try {
      await supplierCostAccessService.saveAccessUserIds(orgId, Array.from(accessIds))
      setDirty(false)
      toast.success('Supplier cost access saved')
    } catch (err) {
      logger.error('SupplierCostAccessSettings save failed:', err)
      toast.error('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-3xl">
      <div className="flex items-start gap-3 mb-5">
        <div className="p-2 rounded-lg bg-[#025940]/10 dark:bg-[#b3f243]/10">
          <Wallet className="w-5 h-5 text-[#025940] dark:text-[#b3f243]" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Supplier costs</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Who can see what the business pays its vehicle suppliers: the Supplier Rental Costs
            section on the Reports page and the rate field in the vehicle edit dialog.
          </p>
        </div>
      </div>

      {access.loading || loading ? (
        <div className="py-10 text-center text-sm text-[#72A68E]"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
      ) : !access.isOwner ? (
        <div className="flex items-start gap-2 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-[#f6f8f7] dark:bg-gray-900/40 px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
          <Lock className="w-4 h-4 mt-0.5 flex-shrink-0 text-[#025940] dark:text-[#b3f243]" />
          <span>
            Only the organisation owner can change who sees supplier costs.
            {access.allowed ? ' You currently have access.' : ' You do not currently have access.'}
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5 mb-1">
            <Lock className="w-3.5 h-3.5 text-[#025940] dark:text-[#b3f243]" />
            <h4 className="text-sm font-bold text-[#012619] dark:text-white">Admins with access</h4>
          </div>
          <p className="text-[12px] text-[#72A68E] mb-2.5">
            Switch on each admin who should see supplier costs. Everyone else, including other admins,
            sees nothing.
          </p>

          <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 divide-y divide-[#eef2f0] dark:divide-gray-700 overflow-hidden bg-white dark:bg-gray-800">
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#012619] dark:text-white truncate">{user?.email || 'You'}</p>
                <p className="text-[11px] text-[#72A68E]">Organisation owner</p>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                <ShieldCheck className="w-3 h-3" /> Always
              </span>
            </div>

            {admins.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12px] text-[#72A68E]">No other admins in this organisation yet.</p>
            ) : (
              admins.map((a) => {
                const on = accessIds.has(a.uid)
                return (
                  <label key={a.uid} className="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#012619] dark:text-white truncate">{a.displayName || a.email}</p>
                      {a.displayName && <p className="text-[11px] text-[#72A68E] truncate">{a.email}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => toggle(a.uid)}
                      className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-[#025940]' : 'bg-[#cdd9d2] dark:bg-gray-600'}`}
                      aria-pressed={on}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[1.125rem]' : 'left-0.5'}`} />
                    </button>
                  </label>
                )
              })
            )}
          </div>

          <div className="flex justify-end pt-3">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#025940] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#01432f] transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>
        </>
      )}
    </div>
  )
}
