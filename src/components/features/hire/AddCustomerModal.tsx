// src/components/features/hire/AddCustomerModal.tsx
// Create a hire customer + (optional but recommended) fleet insurance doc.
'use client'

import React, { useState } from 'react'
import { X, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { hireCustomerService } from '@/lib/services/hireCustomerService'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

export function AddCustomerModal({
  organizationId,
  onClose,
  onSaved,
}: {
  organizationId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [isBusiness, setIsBusiness] = useState(true)
  const [company, setCompany] = useState('')
  const [contact, setContact] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [insRef, setInsRef] = useState('')
  const [insExpiry, setInsExpiry] = useState('')
  const [saving, setSaving] = useState(false)

  const inputCls =
    'w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm'

  const save = async () => {
    if (!organizationId || !name.trim()) {
      toast.error(t('hire.custName'))
      return
    }
    setSaving(true)
    try {
      const profile = user?.uid ? await userProfileService.getProfile(user.uid) : null
      const actorName = profile?.displayName || user?.email || 'Unknown'
      const customerId = await hireCustomerService.createCustomer({
        organizationId,
        name: name.trim(),
        isBusiness,
        companyName: isBusiness ? company.trim() || null : null,
        contactName: contact.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        createdBy: user?.uid || null,
        createdByName: actorName,
      })
      if (insExpiry) {
        await hireCustomerService.addDocument({
          organizationId,
          customerId,
          docType: 'fleet_insurance',
          reference: insRef.trim() || null,
          expiryDate: insExpiry,
          createdBy: user?.uid || null,
          createdByName: actorName,
        })
      }
      toast.success(t('hire.customerSaved'))
      onSaved()
    } catch (err) {
      logger.error('AddCustomerModal save failed:', err)
      toast.error(t('hire.needMigrations'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative bg-white dark:bg-gray-900 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl border border-[#025940]/20 max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-br from-[#012619] to-[#025940] px-4 py-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-white">{t('hire.newCustomer')}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/15 rounded-lg"><X className="w-4 h-4 text-white" /></button>
        </div>

        <div className="p-4 space-y-3">
          <Field label={t('hire.custName')}>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={isBusiness} onChange={(e) => setIsBusiness(e.target.checked)} className="w-4 h-4 accent-[#025940]" />
            {t('hire.custBusiness')}
          </label>
          {isBusiness && (
            <Field label={t('hire.custCompany')}>
              <input value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('hire.custContact')}><input value={contact} onChange={(e) => setContact(e.target.value)} className={inputCls} /></Field>
            <Field label={t('hire.custPhone')}><input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} /></Field>
          </div>
          <Field label={t('hire.custEmail')}><input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></Field>

          {/* Insurance */}
          <div className="mt-1 p-3 rounded-lg border border-[#b3f243]/40 bg-[#b3f243]/5">
            <p className="flex items-center gap-1.5 text-xs font-bold text-[#025940] dark:text-[#b3f243] mb-2">
              <ShieldCheck className="w-3.5 h-3.5" /> {t('hire.insuranceSection')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('hire.insuranceRef')}><input value={insRef} onChange={(e) => setInsRef(e.target.value)} className={inputCls} /></Field>
              <Field label={t('hire.insuranceExpiry')}><input type="date" value={insExpiry} onChange={(e) => setInsExpiry(e.target.value)} className={inputCls} /></Field>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-bold">{t('hire.cancel')}</button>
            <button onClick={save} disabled={saving} className="flex-1 px-4 py-2.5 rounded-lg bg-[#025940] hover:bg-[#012619] text-white text-sm font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? t('hire.saving') : t('hire.create')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      {children}
    </div>
  )
}
