// src/components/settings/DailyReportSettings.tsx
// Recipients of the 6AM daily email report: external garage bookings (today +
// next 5 days), expired MOT / road tax, and MOT/tax expiring within 14 days.
// Owner / admin / garage-manager only (the Settings page already gates the
// Organization tab to admin roles; this component re-checks for safety).

'use client'

import { useEffect, useState } from 'react'
import { Mail, Plus, Trash2, Clock, ShieldAlert, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { settingsService } from '@/lib/services/settingsService'
import { isAdminRole } from '@/lib/permissions'
import { logger } from '@/lib/logger'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function DailyReportSettings() {
  const { user } = useAuth()
  const [orgId, setOrgId] = useState<string | null>(null)
  const [allowed, setAllowed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [emails, setEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState('')

  useEffect(() => {
    if (!user?.uid) return
    let cancelled = false
    ;(async () => {
      try {
        const profile = await userProfileService.getProfile(user.uid)
        if (cancelled) return
        setAllowed(isAdminRole(profile?.role))
        if (profile?.organizationId) {
          setOrgId(profile.organizationId)
          setEmails(await settingsService.getDailyReportEmails(profile.organizationId))
        }
      } catch (err) {
        logger.error('DailyReportSettings load failed:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user?.uid])

  const persist = async (next: string[]) => {
    if (!orgId) return
    setSaving(true)
    try {
      await settingsService.saveDailyReportEmails(orgId, next)
      setEmails(next)
      toast.success('Daily report recipients saved')
    } catch {
      toast.error('Could not save — please try again')
    } finally {
      setSaving(false)
    }
  }

  const addEmail = async () => {
    const e = newEmail.trim().toLowerCase()
    if (!EMAIL_RE.test(e)) { toast.error('Enter a valid email address'); return }
    if (emails.includes(e)) { toast.error('That address is already on the list'); return }
    setNewEmail('')
    await persist([...emails, e])
  }

  const removeEmail = async (e: string) => {
    await persist(emails.filter(x => x !== e))
  }

  if (loading) {
    return <div className="py-12 text-center text-[#72A68E]"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
  }

  if (!allowed) {
    return (
      <div className="py-10 text-center text-sm text-gray-400">
        <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-amber-300" />
        Only owners, admins and garage managers can manage the daily report.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* What the report contains */}
      <div className="rounded-2xl border border-[#e2e8e5] dark:border-gray-700 bg-gradient-to-br from-white to-[#025940]/[0.04] dark:from-gray-800 dark:to-[#025940]/10 p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Clock className="w-4 h-4 text-[#025940] dark:text-[#b3f243]" />
          <h3 className="text-sm font-bold text-[#012619] dark:text-white">Daily report — every morning at 6AM</h3>
        </div>
        <p className="text-xs text-[#4a5e54] dark:text-gray-300 leading-relaxed">
          Everyone on this list receives one email each morning with: today&apos;s external garage
          bookings, vehicles with expired MOT, vehicles with expired road tax, MOT/tax expiring in
          the next 14 days, and upcoming external garage bookings for the next 5 days.
          Remove all addresses to switch the report off.
        </p>
      </div>

      {/* Add */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#72A68E]" />
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addEmail() } }}
            placeholder="name@company.com"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-[#012619] dark:text-white placeholder:text-[#9db0a6] focus:ring-2 focus:ring-[#025940]/25 focus:border-[#025940] outline-none"
          />
        </div>
        <button
          type="button"
          onClick={addEmail}
          disabled={saving || !newEmail.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#012619] hover:bg-[#025940] disabled:opacity-50 text-white text-sm font-bold transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add
        </button>
      </div>

      {/* List */}
      {emails.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          No recipients yet — the daily report is currently <span className="font-semibold">off</span>.
        </p>
      ) : (
        <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 divide-y divide-[#eef2f0] dark:divide-gray-700/60 overflow-hidden">
          {emails.map(e => (
            <div key={e} className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-gray-800">
              <Mail className="w-4 h-4 text-[#72A68E] flex-shrink-0" />
              <span className="flex-1 text-sm text-[#012619] dark:text-white truncate">{e}</span>
              <button
                type="button"
                onClick={() => removeEmail(e)}
                disabled={saving}
                title="Remove"
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default DailyReportSettings
