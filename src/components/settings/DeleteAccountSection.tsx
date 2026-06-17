// src/components/settings/DeleteAccountSection.tsx
// Self-service account deletion (App Store Guideline 5.1.1(v)).
//
// Danger-zone card + confirmation modal. Requires re-authentication (password)
// AND typing DELETE before the irreversible action. Admin/owner accounts are
// warned that this wipes the ENTIRE organisation; members delete only their own
// account. The actual deletion runs in the `delete-account` edge function
// (service role) — the client just confirms intent + identity.
'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { supabase } from '@/lib/supabaseClient'
import { useT } from '@/lib/i18n'
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react'
import { logger } from '@/lib/logger'

export function DeleteAccountSection() {
  const t = useT()
  const router = useRouter()
  const { user } = useAuth()

  const [isOwner, setIsOwner] = useState(false)
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user?.uid) return
    userProfileService.getProfile(user.uid)
      .then(p => setIsOwner(p?.role === 'admin'))
      .catch(() => {})
  }, [user?.uid])

  const reset = () => { setPassword(''); setConfirmText(''); setError(''); setBusy(false) }
  const close = () => { if (!busy) { setOpen(false); reset() } }

  const canConfirm = password.trim().length > 0 && confirmText.trim().toUpperCase() === 'DELETE'

  const handleDelete = async () => {
    if (!canConfirm || !user?.email) return
    setBusy(true)
    setError('')
    try {
      // 1. Re-authenticate — verify the password before anything destructive.
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      })
      if (authErr) {
        setError(t('deleteAccount.wrongPassword'))
        setBusy(false)
        return
      }

      // 2. Run the privileged deletion (identity is taken from the JWT server-side).
      const { data, error: fnErr } = await supabase.functions.invoke('delete-account')
      if (fnErr || (data && (data as any).error)) {
        throw new Error((fnErr?.message) || (data as any)?.error || 'delete failed')
      }

      // 3. Sign out locally and leave. The account no longer exists.
      await supabase.auth.signOut().catch(() => {})
      router.replace('/login?reason=account-deleted')
    } catch (err) {
      logger.error('Account deletion failed:', err)
      setError(t('deleteAccount.failed'))
      setBusy(false)
    }
  }

  return (
    <>
      {/* Danger-zone card */}
      <div className="mt-6 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-900/10 p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-red-800 dark:text-red-300">{t('deleteAccount.title')}</h4>
            <p className="text-xs text-red-700/80 dark:text-red-300/70 mt-1 leading-relaxed">
              {isOwner ? t('deleteAccount.ownerBlurb') : t('deleteAccount.memberBlurb')}
            </p>
            <button
              onClick={() => setOpen(true)}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('deleteAccount.button')}
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">{t('deleteAccount.confirmTitle')}</h3>
              </div>
              <button onClick={close} disabled={busy} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-xl bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-900/40 p-3">
                <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed font-medium">
                  {isOwner ? t('deleteAccount.ownerWarning') : t('deleteAccount.memberWarning')}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('deleteAccount.passwordLabel')}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={busy}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                  placeholder={t('deleteAccount.passwordPlaceholder')}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('deleteAccount.typeToConfirm')}
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  disabled={busy}
                  autoCapitalize="characters"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-red-500/30 focus:border-red-500 font-mono tracking-widest"
                  placeholder="DELETE"
                />
              </div>

              {error && (
                <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />{error}
                </p>
              )}
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={close}
                disabled={busy}
                className="flex-1 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {t('deleteAccount.cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={!canConfirm || busy}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {busy ? t('deleteAccount.deleting') : t('deleteAccount.confirmButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default DeleteAccountSection
