// src/components/features/customers/CustomersContent.tsx
// Browse / search / edit / delete customers. The list is real-time —
// new customers created automatically by the booking-save upsert appear
// here without a refresh.
'use client'

import React, { useMemo, useState } from 'react'
import {
  Users, Plus, Search,
  X, AlertCircle,
} from 'lucide-react'
import { CustomerHistoryModal } from './CustomerHistoryModal'
import { useCustomers } from '@/hooks/useCustomers'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent } from '@/components/ui/Card'
import { ConfirmationModal } from '@/components/common/Modals/ConfirmationModal'
import { AlertModal } from '@/components/common/Modals/AlertModal'
import { normalizePhone } from '@/lib/utils/phone'
import { normalizeReg } from '@/lib/utils/registration'
import { useT } from '@/lib/i18n'
import type { Customer } from '@/types/customer'

interface EditState {
  mode: 'create' | 'edit'
  id?: string
  firstName: string
  lastName: string
  phone: string
  email: string
  notes: string
}

const blankForm: Omit<EditState, 'mode'> = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  notes: '',
}

// 'YYYY-MM-DD' → 'DD/MM/YYYY' (UK), or '—' when missing/malformed.
function formatUkDate(iso?: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

// Legacy records may only have `name`. Pre-fill the edit form by splitting
// it so the user gets first/last fields populated. Also used to derive
// First name / Surname columns for legacy records.
function splitForEdit(c: Customer): { firstName: string; lastName: string } {
  if (c.firstName || c.lastName) {
    return { firstName: c.firstName || '', lastName: c.lastName || '' }
  }
  const parts = (c.name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

export function CustomersContent() {
  const { customers, loading, error, createCustomer, updateCustomer, deleteCustomer, clearError } =
    useCustomers()
  const t = useT()

  const [search, setSearch] = useState('')
  const [editState, setEditState] = useState<EditState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null)
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Search by name, phone (digits-only), email, or vehicle registration.
  // Reg match is normalised (UPPER, no spaces) so "ca24 aod" finds a
  // customer whose booking saved "CA24AOD". Pure in-memory filter of the
  // already-loaded customers list — ZERO extra Firestore reads.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    const phoneQ = normalizePhone(search)
    const regQ = normalizeReg(search)
    return customers.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true
      if (phoneQ && c.phoneNormalized.includes(phoneQ)) return true
      if (c.email && c.email.toLowerCase().includes(q)) return true
      if (
        regQ &&
        (c.registrations || []).some((r) => normalizeReg(r).includes(regQ))
      )
        return true
      return false
    })
  }, [customers, search])

  const totalBookings = useMemo(
    () => customers.reduce((sum, c) => sum + (c.bookingCount || 0), 0),
    [customers],
  )

  const openCreate = () =>
    setEditState({ mode: 'create', ...blankForm })

  const openEdit = (c: Customer) => {
    const { firstName, lastName } = splitForEdit(c)
    setEditState({
      mode: 'edit',
      id: c.id,
      firstName,
      lastName,
      phone: c.phone,
      email: c.email || '',
      notes: c.notes || '',
    })
  }

  const closeEdit = () => {
    setEditState(null)
    setFormError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editState) return
    const firstName = editState.firstName.trim()
    const lastName = editState.lastName.trim()
    const phone = editState.phone.trim()
    if (!firstName && !lastName) {
      setFormError(t('customers.errNameRequired'))
      return
    }
    if (!phone || phone.replace(/\D+/g, '').length < 6) {
      setFormError(t('customers.errPhoneRequired'))
      return
    }
    // Pass '' (NOT undefined) for emptied optional fields. customerService
    // .updateCustomer only patches a field when `changes.x !== undefined`,
    // so coercing a cleared email/notes to `undefined` here made "delete
    // the email + Save" a silent no-op — the old value stayed in Firestore.
    // An empty string flows through and the service writes null to clear
    // it; the create path still treats '' as "not provided".
    const payload = {
      firstName,
      lastName,
      phone,
      email: editState.email.trim(),
      notes: editState.notes.trim(),
    }
    let ok = false
    if (editState.mode === 'create') {
      const id = await createCustomer(payload)
      ok = !!id
    } else if (editState.id) {
      ok = await updateCustomer(editState.id, payload)
    }
    if (ok) {
      setSuccess(editState.mode === 'create' ? t('customers.successAdded') : t('customers.successUpdated'))
      closeEdit()
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const ok = await deleteCustomer(pendingDelete.id)
    if (ok) setSuccess(t('customers.successRemoved', { name: pendingDelete.name }))
    setPendingDelete(null)
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-shrink-0 flex items-center gap-3">
          <Users className="w-6 h-6 text-[#025940] dark:text-[#72A68E]" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white leading-tight">
              {t('customers.title')}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {t('customers.headerCount', { count: customers.length, bookings: totalBookings })}
            </p>
          </div>
        </div>

        <div className="flex-1 flex items-center gap-2 sm:max-w-md sm:ml-auto">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('customers.searchPlaceholder')}
              className="w-full pl-9 pr-7 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#025940]/40 focus:border-[#025940]"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={t('customers.clearAria')}
              >
                ×
              </button>
            )}
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 bg-[#b3f243] hover:bg-[#9fd93a] text-[#012619] text-sm font-bold px-3 py-2 rounded-lg transition-colors shadow-sm whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {t('customers.addCustomer')}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-900/20">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300 flex-1">{error}</p>
            <button
              onClick={clearError}
              className="text-red-600 hover:text-red-800 text-sm font-bold"
            >
              ×
            </button>
          </CardContent>
        </Card>
      )}

      {/* List */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">{t('customers.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              {customers.length === 0
                ? t('customers.emptyNone')
                : t('customers.emptyNoMatch')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="text-left font-semibold px-3 py-2">{t('customers.col.firstName')}</th>
                  <th className="text-left font-semibold px-3 py-2">{t('customers.col.surname')}</th>
                  <th className="text-left font-semibold px-3 py-2">{t('customers.col.phone')}</th>
                  <th className="text-left font-semibold px-3 py-2">{t('customers.col.email')}</th>
                  <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">{t('customers.col.lastService')}</th>
                  <th className="text-left font-semibold px-3 py-2">{t('customers.col.vehicles')}</th>
                  <th className="text-right font-semibold px-3 py-2"><span className="sr-only">{t('customers.col.actions')}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map((c) => {
                  const { firstName, lastName } = c.firstName || c.lastName
                    ? { firstName: c.firstName || '', lastName: c.lastName || '' }
                    : splitForEdit(c)
                  const regsText = c.registrations && c.registrations.length > 0
                    ? c.registrations.join(', ')
                    : null
                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors align-top"
                    >
                      <td className="px-3 py-2.5 font-semibold text-gray-900 dark:text-white whitespace-nowrap">{firstName || '—'}</td>
                      <td className="px-3 py-2.5 font-semibold text-gray-900 dark:text-white whitespace-nowrap">{lastName || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {c.phone ? (
                          <a href={`tel:${c.phone}`} className="hover:text-[#025940] dark:hover:text-[#72A68E]">
                            {c.phone}
                          </a>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">
                        {c.email ? (
                          <a
                            href={`mailto:${c.email}`}
                            className="hover:text-[#025940] dark:hover:text-[#72A68E] truncate inline-block max-w-[18rem] align-bottom"
                          >
                            {c.email}
                          </a>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap tabular-nums">
                        {formatUkDate(c.lastBookingDate)}
                      </td>
                      <td className="px-3 py-2.5 text-gray-800 dark:text-gray-200">
                        {regsText
                          ? <span className="font-mono text-[12px]">{regsText}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setHistoryCustomer(c)}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-[#025940] dark:hover:text-[#72A68E] hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title={t('customers.history.viewTitle')}
                          >
                            <img src="/history.svg" alt="" className="w-4 h-4 object-contain" />
                          </button>
                          <button
                            onClick={() => openEdit(c)}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-[#025940] dark:hover:text-[#72A68E] hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title={t('customers.editTitle')}
                          >
                            <img src="/edit.svg" alt="" className="w-4 h-4 object-contain" />
                          </button>
                          <button
                            onClick={() => setPendingDelete(c)}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title={t('customers.deleteTitle')}
                          >
                            <img src="/delete.svg" alt="" className="w-4 h-4 object-contain" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {editState && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
          onClick={closeEdit}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-[#025940] to-[#72A68E] text-white">
              <h2 className="text-base font-bold">
                {editState.mode === 'create' ? t('customers.addCustomer') : t('customers.editCustomerTitle')}
              </h2>
              <button
                type="button"
                onClick={closeEdit}
                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                aria-label={t('customers.closeAria')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {formError && (
                <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                    {t('customers.firstNameLabel')}
                  </span>
                  <Input
                    value={editState.firstName}
                    onChange={(e) => setEditState({ ...editState, firstName: e.target.value })}
                    placeholder={t('customers.firstNamePlaceholder')}
                    autoComplete="given-name"
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                    {t('customers.surnameLabel')}
                  </span>
                  <Input
                    value={editState.lastName}
                    onChange={(e) => setEditState({ ...editState, lastName: e.target.value })}
                    placeholder={t('customers.surnamePlaceholder')}
                    autoComplete="family-name"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                  {t('customers.phoneLabel')}
                </span>
                <Input
                  type="tel"
                  value={editState.phone}
                  onChange={(e) => setEditState({ ...editState, phone: e.target.value })}
                  placeholder={t('customers.phonePlaceholder')}
                  autoComplete="tel"
                  inputMode="tel"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                  {t('customers.emailLabel')} <span className="text-gray-400 font-normal">{t('customers.optional')}</span>
                </span>
                <Input
                  type="email"
                  value={editState.email}
                  onChange={(e) => setEditState({ ...editState, email: e.target.value })}
                  placeholder={t('customers.emailPlaceholder')}
                  autoComplete="email"
                  inputMode="email"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                  {t('customers.notesLabel')} <span className="text-gray-400 font-normal">{t('customers.optional')}</span>
                </span>
                <textarea
                  value={editState.notes}
                  onChange={(e) => setEditState({ ...editState, notes: e.target.value })}
                  placeholder={t('customers.notesPlaceholder')}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#025940]/40"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-200 dark:border-gray-700">
              <Button
                type="button"
                onClick={closeEdit}
                className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 font-semibold py-2 px-4 rounded-lg"
              >
                {t('customers.cancel')}
              </Button>
              <Button
                type="submit"
                className="bg-[#025940] hover:bg-[#012619] text-white font-bold py-2 px-4 rounded-lg"
              >
                {editState.mode === 'create' ? t('customers.addCustomer') : t('customers.saveChanges')}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Customer history (vehicles + past jobs, internal & external) */}
      {historyCustomer && (
        <CustomerHistoryModal
          customer={historyCustomer}
          onClose={() => setHistoryCustomer(null)}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmationModal
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title={t('customers.deleteModalTitle')}
        message={
          pendingDelete
            ? t('customers.deleteModalMessage', { name: pendingDelete.name })
            : ''
        }
        confirmText={t('customers.deleteConfirm')}
        cancelText={t('customers.cancel')}
        variant="danger"
      />

      {/* Success toast */}
      <AlertModal
        isOpen={!!success}
        onClose={() => setSuccess(null)}
        title={t('customers.doneTitle')}
        message={success || ''}
        variant="success"
        actionText={t('customers.ok')}
      />
    </div>
  )
}

export default CustomersContent
