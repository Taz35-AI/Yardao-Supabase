// src/components/settings/DataManagement.tsx
// Admin-only CSV exports — premium dense layout, matches other org settings tabs

'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { toast } from 'sonner'
import {
  Car, ClipboardCheck, CalendarClock, GitBranch, FileText, Wrench,
  Shield, Users, Download, AlertCircle, Loader2,
} from 'lucide-react'
import { settingsService } from '@/lib/services/settingsService'
import { logger } from '@/lib/logger'
import { toCSV, downloadCSV, buildExportFilename, CsvColumn } from '@/lib/utils/csvExport'
import { useT } from '@/lib/i18n'

type ExportKey =
  | 'fleet' | 'checkedIn' | 'serviceBookings'
  | 'branches' | 'contracts' | 'externalGarages'
  | 'insurancePolicies' | 'users' | 'customers'

interface ExportDef {
  key: ExportKey
  label: string
  description: string
  icon: React.ElementType
  /** Filename slug (no extension) */
  slug: string
  /** Fetch the records for this dataset for a given organisation */
  fetch: (orgId: string) => Promise<any[]>
  /** CSV columns */
  columns: CsvColumn<any>[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const fromFirestore = async (collectionName: string, orgId: string) => {
  const snap = await getDocs(
    query(collection(db, collectionName), where('organizationId', '==', orgId))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

const formatDate = (v: any): string => {
  if (!v) return ''
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'string') return v
  if (typeof v === 'object' && typeof v.toDate === 'function') {
    try { return v.toDate().toISOString() } catch { return '' }
  }
  return ''
}

// ── Export definitions ────────────────────────────────────────────────────────

const EXPORT_DEFS: ExportDef[] = [
  {
    key: 'fleet',
    label: 'Fleet vehicles',
    description: 'Every vehicle in the fleet inventory · registrations, make/model, contract, insurance',
    icon: Car,
    slug: 'fleet',
    fetch: (orgId) => fromFirestore('vehicles', orgId),
    columns: [
      { header: 'Registration',  value: (r) => r.registration },
      { header: 'Make',          value: (r) => r.make },
      { header: 'Model',         value: (r) => r.model },
      { header: 'Colour',        value: (r) => r.colour },
      { header: 'Size',          value: (r) => r.size },
      { header: 'Condition',     value: (r) => r.condition },
      { header: 'Contract',      value: (r) => r.contract ?? '' },
      { header: 'Current status',value: (r) => r.currentStatus ?? '' },
      { header: 'MOT expiry',    value: (r) => r.motExpiry ?? '' },
      { header: 'Tax expiry',    value: (r) => r.taxExpiry ?? '' },
      { header: 'Insurance',     value: (r) => r.insuranceStatus ?? '' },
      { header: 'Policy',        value: (r) => r.insurancePolicyName ?? '' },
      { header: 'Policy expiry', value: (r) => r.insurancePolicyExpiry ?? '' },
      { header: 'Date acquired', value: (r) => r.dateAcquired ?? '' },
      { header: 'Defleeted',     value: (r) => (r.isDefleeted ? 'Yes' : 'No') },
      { header: 'Defleet reason',value: (r) => r.defleetReason ?? '' },
      { header: 'Defleet date',  value: (r) => r.defleetDate ?? '' },
      { header: 'Comments',      value: (r) => r.comments ?? '' },
      { header: 'Created',       value: (r) => formatDate(r.createdAt) },
    ],
  },
  {
    key: 'checkedIn',
    label: 'Yard occupancy',
    description: 'Currently checked-in vehicles · status, contract, hire state, parking',
    icon: ClipboardCheck,
    slug: 'yard-occupancy',
    fetch: (orgId) => fromFirestore('checkedInVehicles', orgId),
    columns: [
      { header: 'Registration',     value: (r) => r.registration },
      { header: 'Make',             value: (r) => r.make },
      { header: 'Model',            value: (r) => r.model },
      { header: 'Status',           value: (r) => r.status },
      { header: 'Hire status',      value: (r) => r.hireStatus ?? '' },
      { header: 'Contract',         value: (r) => r.contract ?? '' },
      { header: 'Condition',        value: (r) => r.condition },
      { header: 'Mileage',          value: (r) => r.mileage ?? '' },
      { header: 'Bay',              value: (r) => r.bay ?? '' },
      { header: 'Location',         value: (r) => r.location ?? '' },
      { header: 'Branch',           value: (r) => r.branchId ?? '' },
      { header: 'Insurance',        value: (r) => r.insuranceStatus ?? '' },
      { header: 'Policy',           value: (r) => r.insurancePolicyName ?? '' },
      { header: 'MOT expiry',       value: (r) => r.motExpiry ?? '' },
      { header: 'Tax expiry',       value: (r) => r.taxExpiry ?? '' },
      { header: 'Check-in time',    value: (r) => formatDate(r.checkInTime ?? r.createdAt) },
      { header: 'Hired at',         value: (r) => formatDate(r.hiredAt) },
      { header: 'Hired by',         value: (r) => r.hiredByName ?? '' },
      { header: 'Hire notes',       value: (r) => r.hireNotes ?? '' },
      { header: 'Transfer status',  value: (r) => r.transferStatus ?? '' },
      { header: 'Target branch',    value: (r) => r.targetBranchName ?? '' },
      { header: 'External garage',  value: (r) => r.externalGarageName ?? '' },
      { header: 'Notes',            value: (r) => r.notes ?? '' },
      { header: 'Comments',         value: (r) => r.comments ?? '' },
    ],
  },
  {
    key: 'serviceBookings',
    label: 'Service bookings',
    description: 'All scheduled and historical service appointments',
    icon: CalendarClock,
    slug: 'service-bookings',
    fetch: (orgId) => fromFirestore('serviceBookings', orgId),
    columns: [
      { header: 'Registration',  value: (r) => r.registration ?? r.vehicleRegistration ?? '' },
      { header: 'Make/model',    value: (r) => [r.make, r.model].filter(Boolean).join(' ') },
      { header: 'Status',        value: (r) => r.status ?? '' },
      { header: 'Service type',  value: (r) => r.serviceType ?? r.type ?? '' },
      { header: 'Scheduled for', value: (r) => formatDate(r.scheduledFor ?? r.scheduledDate ?? r.date) },
      { header: 'Bay',           value: (r) => r.bay ?? '' },
      { header: 'Branch',        value: (r) => r.branchId ?? '' },
      { header: 'Assigned to',   value: (r) => r.assignedToName ?? r.assignedTo ?? '' },
      { header: 'External garage', value: (r) => r.externalGarageName ?? '' },
      { header: 'Notes',         value: (r) => r.notes ?? r.comments ?? '' },
      { header: 'Created',       value: (r) => formatDate(r.createdAt) },
      { header: 'Completed',     value: (r) => formatDate(r.completedAt) },
    ],
  },
  {
    key: 'branches',
    label: 'Branches',
    description: 'Yard locations · slug, address, service bay count',
    icon: GitBranch,
    slug: 'branches',
    fetch: (orgId) => fromFirestore('branches', orgId),
    columns: [
      { header: 'Name',          value: (r) => r.name },
      { header: 'Slug',          value: (r) => r.slug },
      { header: 'Main',          value: (r) => (r.isMain ? 'Yes' : 'No') },
      { header: 'Address',       value: (r) => r.address ?? '' },
      { header: 'Postcode',      value: (r) => r.postcode ?? '' },
      { header: 'Service bays',  value: (r) => r.serviceBayCount ?? '' },
      { header: 'Latitude',      value: (r) => r.latitude ?? '' },
      { header: 'Longitude',     value: (r) => r.longitude ?? '' },
      { header: 'Created',       value: (r) => formatDate(r.createdAt) },
    ],
  },
  {
    key: 'contracts',
    label: 'Contracts',
    description: 'Contract types · name, colour, default flag',
    icon: FileText,
    slug: 'contracts',
    fetch: (orgId) => fromFirestore('contracts', orgId),
    columns: [
      { header: 'Name',     value: (r) => r.name },
      { header: 'Colour',   value: (r) => r.color ?? '' },
      { header: 'Default',  value: (r) => (r.isDefault ? 'Yes' : 'No') },
      { header: 'Created',  value: (r) => formatDate(r.createdAt) },
      { header: 'Updated',  value: (r) => formatDate(r.updatedAt) },
    ],
  },
  {
    key: 'externalGarages',
    label: 'External garages',
    description: 'Third-party service providers used for bookings',
    icon: Wrench,
    slug: 'external-garages',
    fetch: (orgId) => fromFirestore('externalGarages', orgId),
    columns: [
      { header: 'Name',     value: (r) => r.name },
      { header: 'Address',  value: (r) => r.address ?? '' },
      { header: 'Active',   value: (r) => (r.isActive ? 'Yes' : 'No') },
      { header: 'Created',  value: (r) => formatDate(r.createdAt) },
    ],
  },
  {
    key: 'insurancePolicies',
    label: 'Insurance policies',
    description: 'Fleet insurance policies with expiry dates',
    icon: Shield,
    slug: 'insurance-policies',
    fetch: async (orgId) => settingsService.getInsurancePolicies(orgId),
    columns: [
      { header: 'Name',          value: (r) => r.name },
      { header: 'Provider',      value: (r) => r.provider },
      { header: 'Policy number', value: (r) => r.policyNumber },
      { header: 'Expiry date',   value: (r) => r.expiryDate },
      { header: 'Notes',         value: (r) => r.notes ?? '' },
      { header: 'Created',       value: (r) => formatDate(r.createdAt) },
    ],
  },
  {
    key: 'users',
    label: 'Team members',
    description: 'Users in your organisation · role, status, last login',
    icon: Users,
    slug: 'team',
    fetch: async (orgId) => {
      const all = await userProfileService.getUsersByOrganization(orgId)
      return all.filter((u: any) => !u.isDeleted)
    },
    columns: [
      { header: 'Name',         value: (r) => r.displayName },
      { header: 'Email',        value: (r) => r.email },
      { header: 'Role',         value: (r) => r.role },
      { header: 'Active',       value: (r) => (r.isActive === false ? 'No' : 'Yes') },
      { header: 'Last login',   value: (r) => formatDate(r.lastLoginAt) },
      { header: 'Created',      value: (r) => formatDate(r.createdAt) },
    ],
  },
  {
    key: 'customers',
    label: 'Garage customers',
    description: 'Customer directory · names, phone, email, vehicle registrations, booking counts',
    icon: Users,
    slug: 'garage-customers',
    fetch: (orgId) => fromFirestore('customers', orgId),
    columns: [
      { header: 'First name',   value: (r) => r.firstName ?? '' },
      { header: 'Surname',      value: (r) => r.lastName ?? '' },
      { header: 'Full name',    value: (r) => r.name ?? '' },
      { header: 'Phone',        value: (r) => r.phone ?? '' },
      { header: 'Email',        value: (r) => r.email ?? '' },
      { header: 'Registrations',value: (r) => (Array.isArray(r.registrations) ? r.registrations.join(' ') : '') },
      { header: 'Bookings',     value: (r) => (typeof r.bookingCount === 'number' ? r.bookingCount : 0) },
      { header: 'Last booking', value: (r) => r.lastBookingDate ?? '' },
      { header: 'Notes',        value: (r) => r.notes ?? '' },
      { header: 'Added by',     value: (r) => r.createdByName ?? '' },
      { header: 'Added on',     value: (r) => formatDate(r.createdAt) },
    ],
  },
]

// ─── shared classes ───────────────────────────────────────────────────────────
const primaryBtnCls = 'h-9 px-4 text-[13px] font-medium rounded-lg bg-[#025940] hover:bg-[#012619] disabled:opacity-60 text-white inline-flex items-center gap-1.5 transition-colors'

// ── Component ─────────────────────────────────────────────────────────────────

export function DataManagement() {
  const t = useT()
  const defLabel = (k: string) =>
    t('settings.data.' + (({ fleet: 'fleetLabel', checkedIn: 'yardLabel', serviceBookings: 'bookingsLabel', branches: 'branchesLabel', contracts: 'contractsLabel', externalGarages: 'extGaragesLabel', insurancePolicies: 'insuranceLabel', users: 'teamLabel', customers: 'customersLabel' } as any)[k] || ''))
  const defDesc = (k: string) =>
    t('settings.data.' + (({ fleet: 'fleetDesc', checkedIn: 'yardDesc', serviceBookings: 'bookingsDesc', branches: 'branchesDesc', contracts: 'contractsDesc', externalGarages: 'extGaragesDesc', insurancePolicies: 'insuranceDesc', users: 'teamDesc', customers: 'customersDesc' } as any)[k] || ''))
  const { user } = useAuth()
  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgName, setOrgName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [exportingKey, setExportingKey] = useState<ExportKey | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (!user?.uid) { setLoading(false); return }
      try {
        const profile = await userProfileService.getProfile(user.uid)
        setIsAdmin(profile?.role === 'admin')
        setOrgId(profile?.organizationId ?? null)
        setOrgName(profile?.organizationName ?? '')
      } catch (err) {
        logger.error('Failed to load profile for data management:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  const handleExport = async (def: ExportDef) => {
    if (!orgId) return
    setExportingKey(def.key)
    try {
      const rows = await def.fetch(orgId)
      if (rows.length === 0) {
        toast.info(t('settings.data.nothingToExport', { label: defLabel(def.key).toLowerCase() }))
        return
      }
      const csv = toCSV(rows, def.columns)
      const filename = buildExportFilename(def.slug)
      downloadCSV(filename, csv)
      toast.success(t('settings.data.exportSuccess', { count: rows.length, label: defLabel(def.key).toLowerCase(), filename }))
    } catch (err) {
      logger.error(`Export failed for ${def.key}:`, err)
      toast.error(t('settings.data.exportFail', { label: defLabel(def.key).toLowerCase() }))
    } finally {
      setExportingKey(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#025940] border-t-transparent" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="max-w-4xl px-4 sm:px-6 py-6">
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-900/10 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-900 dark:text-amber-300">{t('settings.data.accessRestricted')}</p>
            <p className="text-[12.5px] text-amber-700 dark:text-amber-400 mt-0.5">{t('settings.data.accessBody')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl px-4 sm:px-6 py-6 space-y-5">
      {/* Header */}
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-[#012619] dark:text-white tracking-tight">
          {t('settings.data.heading')}
        </h3>
        <p className="text-[12.5px] text-[#8a9e94] mt-0.5">
          {t('settings.data.introPre')}{orgName && <> · {orgName}</>}{t('settings.data.introPost')}
        </p>
      </div>

      {/* Export list */}
      <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        <ul className="divide-y divide-[#e2e8e5] dark:divide-gray-700">
          {EXPORT_DEFS.map((def) => {
            const Icon = def.icon
            const busy = exportingKey === def.key
            return (
              <li key={def.key} className="group">
                <div className="flex items-start gap-3 px-3 sm:px-4 py-3 hover:bg-[#f5f9f7] dark:hover:bg-gray-800/40 transition-colors">
                  <Icon className="w-4 h-4 text-[#8a9e94] flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="text-[13.5px] font-medium text-[#012619] dark:text-white truncate">
                      {defLabel(def.key)}
                    </div>
                    <div className="text-[12px] text-[#5a6c64] dark:text-gray-400">
                      {defDesc(def.key)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleExport(def)}
                    disabled={busy || exportingKey !== null}
                    className={primaryBtnCls}
                  >
                    {busy ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t('settings.data.exporting')}
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        {t('settings.data.exportBtn')}
                      </>
                    )}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Tiny note */}
      <p className="text-[11px] text-[#8a9e94] leading-relaxed">
        {t('settings.data.footnote')}
      </p>
    </div>
  )
}
