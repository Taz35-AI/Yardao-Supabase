// src/components/features/hire/AddCustomerModal.tsx
// Create / edit a B2B HIRE customer (public.rental_customers only — garage
// customers are a separate population and are never touched here). Captures the
// full record: company / registration / contact / billing / bank, plus (on
// create) an optional fleet-insurance document that gates hiring.
'use client'

import React, { useEffect, useState } from 'react'
import { X, Loader2, ShieldCheck, Building2, User, Wallet, Landmark } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { hireCustomerService } from '@/lib/services/hireCustomerService'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'
import type { RentalCustomer } from '@/types/hire'

export function AddCustomerModal({
  organizationId,
  editing,
  onClose,
  onSaved,
}: {
  organizationId: string | null
  editing?: RentalCustomer | null
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const { user } = useAuth()
  const isEdit = !!editing
  const [name, setName] = useState(editing?.name || '')
  const [isBusiness, setIsBusiness] = useState(editing ? editing.isBusiness : true)
  const [company, setCompany] = useState(editing?.companyName || '')
  const [companyNumber, setCompanyNumber] = useState(editing?.companyNumber || '')
  const [vatNumber, setVatNumber] = useState(editing?.vatNumber || '')
  const [website, setWebsite] = useState(editing?.website || '')
  const [address, setAddress] = useState(editing?.address || '')
  const [contact, setContact] = useState(editing?.contactName || '')
  const [phone, setPhone] = useState(editing?.phone || '')
  const [email, setEmail] = useState(editing?.email || '')
  const [accountNo, setAccountNo] = useState(editing?.accountNo || '')
  const [accountManager, setAccountManager] = useState(editing?.accountManager || '')
  const [billingEmail, setBillingEmail] = useState(editing?.billingEmail || '')
  const [billingAddress, setBillingAddress] = useState(editing?.billingAddress || '')
  const [bankAccountName, setBankAccountName] = useState(editing?.bankAccountName || '')
  const [bankSortCode, setBankSortCode] = useState(editing?.bankSortCode || '')
  const [bankAccountNumber, setBankAccountNumber] = useState(editing?.bankAccountNumber || '')
  const [notes, setNotes] = useState(editing?.notes || '')
  const [insRef, setInsRef] = useState('')
  const [insExpiry, setInsExpiry] = useState('')
  // Original insurance (edit mode) — so we only write a renewal when it changes.
  const [origInsRef, setOrigInsRef] = useState('')
  const [origInsExpiry, setOrigInsExpiry] = useState('')
  const [saving, setSaving] = useState(false)

  // Edit mode: prefill from the customer's latest fleet-insurance policy so the
  // fields show the current cover and can be renewed/updated in place.
  useEffect(() => {
    if (!isEdit || !editing || !organizationId) return
    let cancelled = false
    ;(async () => {
      try {
        const docs = await hireCustomerService.getDocuments(organizationId, editing.id)
        const latest = docs
          .filter((d) => d.docType === 'fleet_insurance')
          .sort((a, b) => (a.expiryDate || '') < (b.expiryDate || '') ? 1 : -1)[0]
        if (latest && !cancelled) {
          setInsRef(latest.reference || '')
          setInsExpiry(latest.expiryDate || '')
          setOrigInsRef(latest.reference || '')
          setOrigInsExpiry(latest.expiryDate || '')
        }
      } catch { /* no docs table / none yet → leave blank */ }
    })()
    return () => { cancelled = true }
  }, [isEdit, editing, organizationId])

  const inputCls =
    'w-full px-3 py-2.5 rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-800 text-[#012619] dark:text-white text-sm placeholder:text-[#9db0a6] focus:ring-2 focus:ring-[#025940]/25 focus:border-[#025940] outline-none transition'
  const nz = (s: string) => (s.trim() ? s.trim() : null)

  const save = async () => {
    if (!organizationId || !name.trim()) {
      toast.error(t('hire.custName'))
      return
    }
    setSaving(true)
    try {
      const profile = user?.uid ? await userProfileService.getProfile(user.uid) : null
      const actorName = profile?.displayName || user?.email || 'Unknown'

      // Edit mode: update the existing customer's fields and finish.
      if (isEdit && editing) {
        await hireCustomerService.updateCustomer(editing.id, {
          name: name.trim(),
          is_business: isBusiness,
          company_name: isBusiness ? nz(company) : null,
          company_number: isBusiness ? nz(companyNumber) : null,
          vat_number: nz(vatNumber),
          website: nz(website),
          address: nz(address),
          contact_name: nz(contact),
          phone: nz(phone),
          email: nz(email),
          account_no: nz(accountNo),
          account_manager: nz(accountManager),
          billing_email: nz(billingEmail),
          billing_address: nz(billingAddress),
          bank_account_name: nz(bankAccountName),
          bank_sort_code: nz(bankSortCode),
          bank_account_number: nz(bankAccountNumber),
          notes: nz(notes),
        })
        // Insurance changed → record it as a (renewed) fleet-insurance policy.
        if (insExpiry && (insExpiry !== origInsExpiry || insRef.trim() !== origInsRef)) {
          await hireCustomerService.addDocument({
            organizationId,
            customerId: editing.id,
            docType: 'fleet_insurance',
            reference: insRef.trim() || null,
            expiryDate: insExpiry,
            createdBy: user?.uid || null,
            createdByName: actorName,
          })
        }
        toast.success(t('hire.customerSaved'))
        onSaved()
        return
      }

      const customerId = await hireCustomerService.createCustomer({
        organizationId,
        name: name.trim(),
        isBusiness,
        companyName: isBusiness ? nz(company) : null,
        companyNumber: isBusiness ? nz(companyNumber) : null,
        vatNumber: nz(vatNumber),
        website: nz(website),
        address: nz(address),
        contactName: nz(contact),
        phone: nz(phone),
        email: nz(email),
        accountNo: nz(accountNo),
        accountManager: nz(accountManager),
        billingEmail: nz(billingEmail),
        billingAddress: nz(billingAddress),
        bankAccountName: nz(bankAccountName),
        bankSortCode: nz(bankSortCode),
        bankAccountNumber: nz(bankAccountNumber),
        notes: nz(notes),
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
        <div className="sticky top-0 z-10 bg-gradient-to-br from-[#012619] to-[#025940] px-4 py-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-white">{isEdit ? t('hire.editCustomer') : t('hire.newCustomer')}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/15 rounded-lg"><X className="w-4 h-4 text-white" /></button>
        </div>

        <div className="p-4 space-y-4">
          <Field label={t('hire.custName')}>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={isBusiness} onChange={(e) => setIsBusiness(e.target.checked)} className="w-4 h-4 accent-[#025940]" />
            {t('hire.custBusiness')}
          </label>

          {/* Company */}
          {isBusiness && (
            <Section icon={<Building2 className="w-3.5 h-3.5" />} title={t('hire.secCompany')}>
              <Field label={t('hire.custCompany')}><input value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('hire.custCompanyNo')}><input value={companyNumber} onChange={(e) => setCompanyNumber(e.target.value)} className={inputCls} /></Field>
                <Field label={t('hire.custVat')}><input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder={t('hire.optional')} className={inputCls} /></Field>
              </div>
              <Field label={t('hire.custWebsite')}><input value={website} onChange={(e) => setWebsite(e.target.value)} className={inputCls} /></Field>
              <Field label={t('hire.custAddress')}><textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={inputCls} /></Field>
            </Section>
          )}

          {/* Contact */}
          <Section icon={<User className="w-3.5 h-3.5" />} title={t('hire.secContact')}>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('hire.custContact')}><input value={contact} onChange={(e) => setContact(e.target.value)} className={inputCls} /></Field>
              <Field label={t('hire.custPhone')}><input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} /></Field>
            </div>
            <Field label={t('hire.custEmail')}><input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></Field>
            {!isBusiness && (
              <Field label={t('hire.custAddress')}><textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={inputCls} /></Field>
            )}
          </Section>

          {/* Billing */}
          <Section icon={<Wallet className="w-3.5 h-3.5" />} title={t('hire.secBilling')}>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('hire.custAccountNo')}><input value={accountNo} onChange={(e) => setAccountNo(e.target.value)} className={inputCls} /></Field>
              <Field label={t('hire.custAccountManager')}><input value={accountManager} onChange={(e) => setAccountManager(e.target.value)} className={inputCls} /></Field>
            </div>
            <Field label={t('hire.custBillingEmail')}><input value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} className={inputCls} /></Field>
            <Field label={t('hire.custBillingAddress')}><textarea value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} rows={2} className={inputCls} /></Field>
          </Section>

          {/* Bank */}
          <Section icon={<Landmark className="w-3.5 h-3.5" />} title={t('hire.secBank')}>
            <Field label={t('hire.custBankName')}><input value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('hire.custSortCode')}><input value={bankSortCode} onChange={(e) => setBankSortCode(e.target.value)} placeholder="00-00-00" className={inputCls} /></Field>
              <Field label={t('hire.custAccountNumber')}><input value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} className={inputCls} /></Field>
            </div>
          </Section>

          <Field label={t('hire.custNotes')}><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} /></Field>

          {/* Fleet insurance — settable on create AND editable/renewable here */}
          <div className="mt-1 p-3 rounded-lg border border-[#b3f243]/40 bg-[#b3f243]/5">
            <p className="flex items-center gap-1.5 text-xs font-bold text-[#025940] dark:text-[#b3f243] mb-2">
              <ShieldCheck className="w-3.5 h-3.5" /> {isEdit ? t('hire.insuranceSectionEdit') : t('hire.insuranceSection')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('hire.insuranceRef')}><input value={insRef} onChange={(e) => setInsRef(e.target.value)} className={inputCls} /></Field>
              <Field label={t('hire.insuranceExpiry')}><input type="date" value={insExpiry} onChange={(e) => setInsExpiry(e.target.value)} className={inputCls} /></Field>
            </div>
            {isEdit && <p className="mt-1.5 text-[10px] text-[#72A68E] leading-snug">{t('hire.insuranceRenewHint')}</p>}
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-bold">{t('hire.cancel')}</button>
            <button onClick={save} disabled={saving} className="flex-1 px-4 py-2.5 rounded-lg bg-[#025940] hover:bg-[#012619] text-white text-sm font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? t('hire.saving') : isEdit ? t('hire.save') : t('hire.create')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-[#f6f8f7]/60 dark:bg-gray-800/40 p-3 space-y-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#025940] dark:text-[#72A68E]">{icon}{title}</p>
      {children}
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
