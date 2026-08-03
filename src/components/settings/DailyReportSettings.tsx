// src/components/settings/DailyReportSettings.tsx
// Recipients of the daily 6AM email report + instant external-booking alerts.
// Each recipient has a toggle for the INSTANT external-booking emails —
// everyone on the list always gets the 6AM daily report. Owner / admin /
// garage-manager only (the Settings page already gates the Organization tab;
// this component re-checks for safety).

'use client'

import { useEffect, useState } from 'react'
import { Mail, Plus, Trash2, Clock, ShieldAlert, Loader2, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { settingsService, type DailyReportRecipient } from '@/lib/services/settingsService'
import { isAdminRole } from '@/lib/permissions'
import { logger } from '@/lib/logger'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function DailyReportSettings() {
  const { user } = useAuth()
  const [orgId, setOrgId] = useState<string | null>(null)
  const [allowed, setAllowed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [recipients, setRecipients] = useState<DailyReportRecipient[]>([])
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
          setRecipients(await settingsService.getDailyReportEmails(profile.organizationId))
        }
      } catch (err) {
        logger.error('DailyReportSettings load failed:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user?.uid])

  const persist = async (next: DailyReportRecipient[], okMsg = 'Saved') => {
    if (!orgId) return
    setSaving(true)
    try {
      await settingsService.saveDailyReportEmails(orgId, next)
      setRecipients(next)
      toast.success(okMsg)
    } catch {
      toast.error('Could not save — please try again')
    } finally {
      setSaving(false)
    }
  }

  const addEmail = async () => {
    const e = newEmail.trim().toLowerCase()
    if (!EMAIL_RE.test(e)) { toast.error('Enter a valid email address'); return }
    if (recipients.some(r => r.email === e)) { toast.error('That address is already on the list'); return }
    setNewEmail('')
    await persist([...recipients, { email: e, externalBookings: true }], 'Recipient added')
  }

  const removeEmail = async (email: string) => {
    await persist(recipients.filter(r => r.email !== email), 'Recipient removed')
  }

  const toggleExternal = async (email: string) => {
    const next = recipients.map(r => r.email === email ? { ...r, externalBookings: !r.externalBookings } : r)
    const target = next.find(r => r.email === email)
    await persist(next, target?.externalBookings ? 'External booking alerts ON' : 'External booking alerts OFF')
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
      {/* What the emails are */}
      <div className="rounded-2xl border border-[#e2e8e5] dark:border-gray-700 bg-gradient-to-br from-white to-[#025940]/[0.04] dark:from-gray-800 dark:to-[#025940]/10 p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Clock className="w-4 h-4 text-[#025940] dark:text-[#b3f243]" />
          <h3 className="text-sm font-bold text-[#012619] dark:text-white">Email reports &amp; alerts</h3>
        </div>
        <p className="text-xs text-[#4a5e54] dark:text-gray-300 leading-relaxed">
          Everyone on this list receives the <strong>daily report at 6AM</strong> (garage bookings,
          MOT &amp; tax expiries, uninsured not in yard). The <strong>⚡ External bookings</strong>{' '}
          toggle controls the <em>instant</em> email sent when a vehicle is booked at an external
          garage — switch it off for anyone who only wants the morning digest.
          Remove all addresses to switch emails off entirely.
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
      {recipients.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          No recipients yet — email reports are currently <span className="font-semibold">off</span>.
        </p>
      ) : (
        <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 divide-y divide-[#eef2f0] dark:divide-gray-700/60 overflow-hidden">
          {recipients.map(r => (
            <div key={r.email} className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-gray-800">
              <Mail className="w-4 h-4 text-[#72A68E] flex-shrink-0" />
              <span className="flex-1 text-sm text-[#012619] dark:text-white truncate">{r.email}</span>

              {/* External-booking alerts toggle */}
              <button
                type="button"
                onClick={() => toggleExternal(r.email)}
                disabled={saving}
                title={r.externalBookings ? 'Receiving instant external-booking alerts — click to turn OFF' : 'Not receiving external-booking alerts — click to turn ON'}
                className={`inline-flex items-center gap-1.5 flex-shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  r.externalBookings
                    ? 'bg-[#e9f8ef] border-[#a9dcbc] text-[#0a6b4d] dark:bg-emerald-900/20 dark:border-emerald-800/50 dark:text-emerald-300'
                    : 'bg-gray-100 border-gray-200 text-gray-400 dark:bg-gray-700/50 dark:border-gray-600 dark:text-gray-400'
                }`}
              >
                <Zap className="w-3 h-3" />
                External bookings
                <span
                  className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                    r.externalBookings ? 'bg-[#0a6b4d]' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                      r.externalBookings ? 'translate-x-3.5' : 'translate-x-0.5'
                    }`}
                  />
                </span>
              </button>

              <button
                type="button"
                onClick={() => removeEmail(r.email)}
                disabled={saving}
                title="Remove recipient"
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
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
