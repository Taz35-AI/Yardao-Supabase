// src/components/stock/CreateInvoiceModal.tsx
// 🔥 UPDATED: Company dropdowns from Settings + all features preserved

'use client'

import React, { useState, useEffect } from 'react'
import { X, FileText, Plus, Trash2, Search, Building2, ChevronDown, Check } from 'lucide-react'
import { stockService } from '@/lib/services/stockService'
import { settingsService, FromCompanyDetails, ToCompanyDetails } from '@/lib/services/settingsService'
import { vehicleService, userProfileService } from '@/lib/firestore'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { Vehicle } from '@/types'
import { PartUsageRecord, LABOUR_PRESETS, DEFAULT_LABOUR_RATE, InvoicePart, LabourLine, Invoice } from '@/types/stock'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabaseClient'
import { toCamelList } from '@/lib/dbMap'
import { getEffectiveSlotCount } from '@/utils/serviceBookings/slotHelpers'
import { useT } from '@/lib/i18n'

interface CreateInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  /** When set, the modal opens in EDIT mode: it skips the vehicle-search step,
   *  pre-fills every field from this invoice, and saves back to it instead of
   *  creating a new one. */
  editInvoice?: Invoice | null
}

// Reverse the parts markup that was baked into a saved invoice, so reloading
// it into the form (which re-applies the from-company markup) doesn't double
// it. Identity when markup is 0. Penny-level rounding is possible but shown
// before save.
function reverseMarkup(parts: InvoicePart[], markupPercent: number): InvoicePart[] {
  const f = 1 + (markupPercent || 0) / 100
  const round2 = (n: number) => Math.round(n * 100) / 100
  if (f === 1) return parts.map(p => ({ ...p }))
  return parts.map(p => {
    const unitPrice = round2(p.unitPrice / f)
    return { ...p, unitPrice, total: round2(unitPrice * p.quantity) }
  })
}

// One selectable completed job for the vehicle. Parts are the rows attributed
// to that exact booking (migration 0039), so picking a job invoices only its
// parts + labour — never two services merged by a date window.
interface JobOption {
  id: string
  date: string
  workLabel: string
  booking: any
  parts: InvoicePart[]
  partsTotal: number
  alreadyInvoiced: boolean   // this job already has an invoice raised from it
}

// Aggregate raw usage rows into invoice part lines (sum quantities per part).
function aggregateUsage(records: PartUsageRecord[]): InvoicePart[] {
  const map = new Map<string, InvoicePart>()
  records.forEach(r => {
    const existing = map.get(r.partId)
    if (existing) {
      existing.quantity += r.quantityUsed
      existing.total = existing.quantity * existing.unitPrice
    } else {
      map.set(r.partId, {
        partId: r.partId,
        partName: r.partName,
        partNumber: r.partNumber,
        quantity: r.quantityUsed,
        unitPrice: r.netPrice,
        total: r.totalCost,
      })
    }
  })
  return Array.from(map.values())
}

function jobWorkLabel(booking: any): string {
  const w = booking.workRequired
  if (Array.isArray(w)) return w.filter(Boolean).join(', ') || 'Service'
  return w ? String(w) : 'Service'
}

export function CreateInvoiceModal({ isOpen, onClose, onSuccess, editInvoice }: CreateInvoiceModalProps) {
  const t = useT()
  const { user } = useAuth()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [userDisplayName, setUserDisplayName] = useState<string>('Unknown')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'vehicle' | 'details'>('vehicle')
  
  // Vehicle selection
  const [searchTerm, setSearchTerm] = useState('')
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [filteredVehicles, setFilteredVehicles] = useState<Vehicle[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
  
  // 🔥 NEW: Company data from settings
  const [fromCompanies, setFromCompanies] = useState<FromCompanyDetails[]>([])
  const [toCompanies, setToCompanies] = useState<ToCompanyDetails[]>([])
  const [selectedFromCompany, setSelectedFromCompany] = useState<FromCompanyDetails | null>(null)
  const [selectedToCompany, setSelectedToCompany] = useState<ToCompanyDetails | null>(null)
  const [showFromDropdown, setShowFromDropdown] = useState(false)
  const [showToDropdown, setShowToDropdown] = useState(false)
  
  // Invoice data
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [parts, setParts] = useState<InvoicePart[]>([])
  const [labour, setLabour] = useState<LabourLine[]>([])
  const [labourRate, setLabourRate] = useState(DEFAULT_LABOUR_RATE)
  // Org-wide default labour rate (settings). A from-company can override it.
  const [orgDefaultRate, setOrgDefaultRate] = useState(DEFAULT_LABOUR_RATE)
  // Per-invoice discount % (decided at generation; defaults from the from-company).
  const [discountPercent, setDiscountPercent] = useState(0)
  // Odometer / mileage reading shown on the invoice as "ODO: ".
  const [mileage, setMileage] = useState('')
  // 👥 Customer pulled from the vehicle's recent service bookings.
  // Used to populate a "Use customer from bookings" quick-pick alongside
  // the org-preset to-companies — the booking is the only source of
  // truth for who the work was actually done for, especially for custom
  // (non-fleet) vehicles.
  const [customerFromBookings, setCustomerFromBookings] = useState<ToCompanyDetails | null>(null)
  // 🧩 Per-job invoicing (migration 0039). The vehicle's recent completed jobs;
  // picking one pulls only that job's attributed parts + that job's labour.
  // selectedJobId === null means the legacy "last 10 days" window is in use
  // (the fallback for vehicles whose parts were never tied to a job).
  const [vehicleJobs, setVehicleJobs] = useState<JobOption[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  // Default the discount % from the selected from-company (still editable per invoice).
  // Skipped in edit mode so the invoice's saved discount isn't clobbered.
  useEffect(() => {
    if (editInvoice) return
    setDiscountPercent(selectedFromCompany?.discountPercent || 0)
    // Labour rate: the selected company's own rate, else the org default, else
    // the hardcoded fallback. Re-rate existing labour lines so a company change
    // reflects its rate. Skipped in edit mode so saved invoices aren't touched.
    const rate = selectedFromCompany?.labourRate ?? orgDefaultRate ?? DEFAULT_LABOUR_RATE
    setLabourRate(rate)
    setLabour(prev => prev.map(l => ({ ...l, rate, total: Math.round((l.hours || 0) * rate * 100) / 100 })))
  }, [selectedFromCompany, orgDefaultRate, editInvoice])

  // Pre-fill the odometer from the selected vehicle, if it carries a mileage.
  // Skipped in edit mode (the invoice's own mileage is loaded instead).
  useEffect(() => {
    if (editInvoice) return
    if (selectedVehicle) {
      const m = (selectedVehicle as any).mileage
      setMileage(m != null && m !== '' ? String(m) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVehicle?.id, selectedVehicle?.registration, editInvoice])

  // ✏️ EDIT MODE — pre-fill the whole form from a saved invoice. Skips the
  // vehicle-search step and never runs the per-job loaders (guarded below), so
  // the saved parts/labour are preserved exactly.
  useEffect(() => {
    if (!isOpen || !editInvoice) return
    const v: Vehicle = {
      registration: editInvoice.vehicleRegistration,
      make: editInvoice.vehicleMake || '',
      model: editInvoice.vehicleModel || '',
      colour: '',
      size: '',
      motExpiry: '',
      taxExpiry: '',
      comments: '',
      condition: '',
      insurancePolicyId: null,
      insurancePolicyName: null,
      insurancePolicyExpiry: null,
      createdAt: new Date().toISOString(),
      organizationId: editInvoice.organizationId,
      createdBy: '',
    }
    if (editInvoice.vehicleId) v.id = editInvoice.vehicleId
    setSelectedVehicle(v)
    setSearchTerm(editInvoice.vehicleRegistration)
    setStep('details')
    setInvoiceDate(editInvoice.invoiceDate)
    setParts(reverseMarkup(editInvoice.parts || [], editInvoice.markupPercent || 0))
    setLabour(editInvoice.labour || [])
    setLabourRate(editInvoice.labour?.[0]?.rate || DEFAULT_LABOUR_RATE)
    setDiscountPercent(editInvoice.discountPercent || 0)
    setMileage(editInvoice.vehicleMileage || '')
    setVehicleJobs([])
    setSelectedJobId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editInvoice])

  // Fetch organizationId and user profile
  useEffect(() => {
    const fetchUserData = async () => {
      if (user?.uid && isOpen) {
        try {
          const profile = await userProfileService.getProfile(user.uid)
          if (profile?.organizationId) {
            setOrganizationId(profile.organizationId)
            setUserDisplayName(profile.displayName || 'Unknown')
          }
        } catch (error) {
          logger.error('Error fetching user data:', error)
          toast.error(t('stock.createInvoice.loadUserFail'))
        }
      }
    }
    fetchUserData()
  }, [user, isOpen])

  const loadBodyshopHours = async () => {
  if (!selectedVehicle || !organizationId) return

  try {
    // Find any bodyshop jobs for this vehicle registration
    const { data: jobsData, error: jobsError } = await supabase
      .from('bodyshop_jobs')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('vehicle_registration', selectedVehicle.registration)
    if (jobsError) throw jobsError

    if (!jobsData || jobsData.length === 0) return

    // Sum up hours per stage across all jobs. The timeEntries sub-collection
    // is now the org-scoped bodyshop_time_entries table (re-parented via
    // job_id), so a single query over this reg's jobs replaces the per-job
    // sub-collection reads.
    const stageHourTotals: Record<string, number> = {}

    const jobIds = jobsData.map(j => j.id as string)
    const { data: logsData, error: logsError } = await supabase
      .from('bodyshop_time_entries')
      .select('stage, hours')
      .eq('organization_id', organizationId)
      .in('job_id', jobIds)
    if (logsError) throw logsError

    ;(logsData ?? []).forEach(log => {
      const stage: string = log.stage || 'bodyshop'
      const hours: number = log.hours || 0
      stageHourTotals[stage] = (stageHourTotals[stage] || 0) + hours
    })

    // Convert to labour lines
    const stageLabels: Record<string, string> = {
      prep: 'Bodyshop - Prep',
      paint: 'Bodyshop - Paint',
      finishing: 'Bodyshop - Finishing',
      queued: 'Bodyshop - General',
      bodyshop: 'Bodyshop Labour',
    }

    const bodyshopLabourLines: LabourLine[] = Object.entries(stageHourTotals)
      .filter(([, hrs]) => hrs > 0)
      .map(([stage, hrs]) => ({
        id: `bodyshop-${stage}-${Date.now()}`,
        description: stageLabels[stage] || `Bodyshop - ${stage}`,
        hours: Math.round(hrs * 100) / 100,
        rate: labourRate,
        total: Math.round(hrs * labourRate * 100) / 100,
      }))

    if (bodyshopLabourLines.length > 0) {
      // Idempotent: drop any previously-loaded bodyshop lines first so a
      // re-run (Strict-Mode double-invoke, selectedVehicle backfill, etc.)
      // can't duplicate them. Manual/preset lines (no `bodyshop-` id
      // prefix) and service lines are preserved.
      setLabour(prev => [
        ...prev.filter(l => !l.id.startsWith('bodyshop-')),
        ...bodyshopLabourLines,
      ])
      toast.success(t('stock.createInvoice.loadedBodyshop', { count: bodyshopLabourLines.length }))
      logger.log('Bodyshop hours loaded for invoice:', { reg: selectedVehicle.registration, stageHourTotals })
    }
  } catch (error) {
    logger.error('Error loading bodyshop hours:', error)
    // Non-blocking (the invoice can still be created), but surfaced: a
    // swallowed failure here previously looked identical to "no bodyshop
    // work", so missing hours went unnoticed.
    toast.error(t('stock.createInvoice.bodyshopFail'))
  }
}

// 🕐 Load service-bay hours from the serviceBookings collection. Each
// booking spans N×30-min atomic slots (getEffectiveSlotCount handles
// legacy 90-min bookings transparently), so total hours = slots × 0.5.
// We also collect customer contact info from those bookings so the user
// can invoice the actual customer the work was done for instead of the
// org's preset to-company.
const loadServiceBookingHoursAndCustomer = async () => {
  if (!selectedVehicle || !organizationId) return

  try {
    const tenDaysAgo = new Date()
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
    const tenDaysAgoStr = tenDaysAgo.toISOString().split('T')[0] // YYYY-MM-DD

    const { data: bookingsData, error: bookingsError } = await supabase
      .from('service_bookings')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('registration', selectedVehicle.registration)
      .gte('date', tenDaysAgoStr)
    if (bookingsError) throw bookingsError
    if (!bookingsData || bookingsData.length === 0) return

    // Map snake→camel so downstream field access (timeSlot, slotCount,
    // isExternalProvider, workRequired, customerName, …) is unchanged; the
    // jsonb work_required passes through verbatim per dbMap.
    const bookings = toCamelList<any>(bookingsData)

    // Aggregate hours per work-type. Cancelled bookings + scheduled-only
    // bookings (no work yet) + external-provider bookings (work didn't
    // happen in our bays) are excluded — we're invoicing for *our* labour.
    const hoursByWorkType: Record<string, number> = {}
    let mostRecentCustomerBooking: { date: string; data: any } | null = null
    // Latest booking carrying make/model — used to backfill a custom
    // (non-fleet) vehicle's make/model on the invoice so it isn't blank.
    let latestVehicleInfo: { date: string; make: string; model: string } | null = null
    // Latest booking carrying an odometer reading (captured at "Mark Complete")
    // — used to auto-fill the invoice ODO so it isn't entered by hand.
    let latestMileage: { date: string; mileage: string } | null = null

    bookings.forEach((b: any) => {
      const status = b.status as string | undefined
      if (status === 'cancelled' || status === 'scheduled') return
      if (b.isExternalProvider) return

      // 30-min atomic slots → 0.5 hr each. Legacy 90-min slot ids are
      // handled inside getEffectiveSlotCount.
      const slots = getEffectiveSlotCount({
        timeSlot: b.timeSlot ?? '',
        slotCount: typeof b.slotCount === 'number' ? b.slotCount : 1,
      })
      const hours = slots * 0.5

      const workArr: string[] = Array.isArray(b.workRequired)
        ? b.workRequired.filter(Boolean)
        : b.workRequired
          ? [String(b.workRequired)]
          : ['Service']
      // Split the booking's hours evenly across its work types so the
      // labour line totals reconcile back to the actual time spent.
      const perTypeHours = hours / workArr.length
      workArr.forEach((w) => {
        hoursByWorkType[w] = (hoursByWorkType[w] || 0) + perTypeHours
      })

      // Track most-recent booking that has customer info — that's the
      // candidate to surface in the to-company picker.
      if ((b.customerName || b.customerPhone) && b.date) {
        if (!mostRecentCustomerBooking || b.date > mostRecentCustomerBooking.date) {
          mostRecentCustomerBooking = { date: b.date, data: b }
        }
      }

      // Track most-recent booking that has make/model so a custom
      // vehicle's details show on the invoice instead of "no make/model".
      if ((b.make || b.model) && b.date) {
        if (!latestVehicleInfo || b.date > latestVehicleInfo.date) {
          latestVehicleInfo = {
            date: b.date,
            make: (b.make || '').trim(),
            model: (b.model || '').trim(),
          }
        }
      }

      // Track most-recent booking that recorded an odometer reading at
      // completion → auto-fills the invoice ODO.
      if (b.mileage != null && String(b.mileage).trim() !== '' && b.date) {
        if (!latestMileage || b.date > latestMileage.date) {
          latestMileage = { date: b.date, mileage: String(b.mileage).trim() }
        }
      }
    })

    // Build labour lines from the per-work-type hour totals.
    const serviceLabourLines: LabourLine[] = Object.entries(hoursByWorkType)
      .filter(([, hrs]) => hrs > 0)
      .map(([workType, hrs]) => ({
        id: `service-${workType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        description: `Service - ${workType}`,
        hours: Math.round(hrs * 100) / 100,
        rate: labourRate,
        total: Math.round(hrs * labourRate * 100) / 100,
      }))

    if (serviceLabourLines.length > 0) {
      // Idempotent: replace previously-loaded service lines (id prefix
      // `service-`) rather than appending, so a re-run can't double the
      // labour. Manual/preset + bodyshop lines are preserved.
      setLabour((prev) => [
        ...prev.filter((l) => !l.id.startsWith('service-')),
        ...serviceLabourLines,
      ])
      const totalHrs = serviceLabourLines.reduce((s, l) => s + l.hours, 0)
      toast.success(
        t('stock.createInvoice.loadedService', { count: serviceLabourLines.length, hours: totalHrs.toFixed(1) }),
      )
      logger.log('Service booking hours loaded:', {
        reg: selectedVehicle.registration,
        hoursByWorkType,
      })
    }

    // Backfill make/model onto a CUSTOM (non-fleet) vehicle from its
    // most-recent booking, so the invoice card shows the real vehicle
    // instead of "No make / model on file". Fleet vehicles already have
    // their own make/model — left untouched.
    if (latestVehicleInfo) {
      const info = latestVehicleInfo as { date: string; make: string; model: string }
      setSelectedVehicle((prev) =>
        prev && !prev.id && !prev.make && !prev.model
          ? { ...prev, make: info.make, model: info.model }
          : prev,
      )
    }

    // Auto-fill the ODO from the most-recent booking's completion mileage —
    // this is the reading the mechanic entered at "Mark Complete", which is the
    // most relevant odometer for the invoice (overrides the fleet record's
    // older value).
    if (latestMileage) {
      setMileage((latestMileage as { date: string; mileage: string }).mileage)
    }

    // Surface the most-recent booking's customer as a to-company option.
    if (mostRecentCustomerBooking) {
      const cust = (mostRecentCustomerBooking as { date: string; data: any }).data
      setCustomerFromBookings({
        name: cust.customerName?.trim() || cust.customerPhone || 'Customer',
        // Service bookings don't capture address yet — leave blank so the
        // user can hand-edit the saved invoice if needed.
        address: '',
        postcode: '',
        email: cust.customerEmail || '',
      })
    }
  } catch (error) {
    logger.error('Error loading service booking hours:', error)
    // Non-blocking but surfaced: a swallowed failure here (e.g. a missing
    // Firestore index) previously looked identical to "no service history"
    // — the user had no idea hours/customer failed to load.
    toast.error(t('stock.createInvoice.serviceFail'))
  }
}

  // 🔥 NEW: Load companies from settings
  useEffect(() => {
    const loadCompanies = async () => {
      if (!organizationId || !isOpen) return
      
      try {
        const [from, to, rate] = await Promise.all([
          settingsService.getFromCompanies(organizationId),
          settingsService.getToCompanies(organizationId),
          settingsService.getDefaultLabourRate(organizationId),
        ])

        setFromCompanies(from)
        setToCompanies(to)
        setOrgDefaultRate(rate)

        if (editInvoice) {
          // Edit mode: select the invoice's saved companies by name. If a
          // from-company was renamed/removed we fall back to the first (its
          // markup/logo can't be recovered from the stored name alone).
          setSelectedFromCompany(from.find(c => c.name === editInvoice.fromCompany) || from[0] || null)
          setSelectedToCompany(
            to.find(c => c.name === editInvoice.toCompany) ||
            (editInvoice.toCompany
              ? { name: editInvoice.toCompany, address: '', postcode: '', email: '' }
              : to[0] || null),
          )
        } else {
          // Auto-select first company if available
          if (from.length > 0 && !selectedFromCompany) {
            setSelectedFromCompany(from[0])
          }
          if (to.length > 0 && !selectedToCompany) {
            setSelectedToCompany(to[0])
          }
        }
      } catch (error) {
        logger.error('Error loading companies:', error)
        toast.error(t('stock.createInvoice.loadCompanyFail'))
      }
    }
    
    loadCompanies()
  }, [organizationId, isOpen])

  // Load vehicles
  useEffect(() => {
    if (isOpen && organizationId) {
      loadVehicles()
    }
  }, [isOpen, organizationId])

  // Filter vehicles
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredVehicles(vehicles.slice(0, 10))
    } else {
      const term = searchTerm.toLowerCase()
      const filtered = vehicles.filter(v =>
        v.registration.toLowerCase().includes(term) ||
        v.id?.toLowerCase().includes(term) ||
        `${v.make} ${v.model}`.toLowerCase().includes(term)
      ).slice(0, 10)
      setFilteredVehicles(filtered)
    }
  }, [searchTerm, vehicles])

  // Load parts + labour when a vehicle is selected. Keyed by the
  // vehicle's stable identity (id for fleet, registration for custom)
  // NOT the object reference — so the make/model backfill inside
  // loadServiceBookingHoursAndCustomer (which calls setSelectedVehicle)
  // can't re-trigger the loaders and double the labour. The loaders are
  // also idempotent now as a belt-and-braces guard.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // In edit mode the saved parts/labour are loaded from the invoice — never
    // overwrite them with the per-job/window loaders.
    if (editInvoice) return
    if (selectedVehicle && step === 'details') {
      loadForVehicle()
    }
  }, [selectedVehicle?.id, selectedVehicle?.registration, step, editInvoice])

  const loadVehicles = async () => {
    if (!organizationId) return
    
    try {
      const allVehicles = await vehicleService.getVehicles(organizationId)
      setVehicles(allVehicles)
      setFilteredVehicles(allVehicles.slice(0, 10))
    } catch (error) {
      logger.error('Error loading vehicles:', error)
      toast.error(t('stock.createInvoice.loadVehiclesFail'))
    }
  }

  const loadVehiclePartsUsage = async () => {
    if (!selectedVehicle) return

    try {
      const tenDaysAgo = new Date()
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
      const tenDaysAgoISO = tenDaysAgo.toISOString()

      // Fleet vehicle → query by id. Custom (no id) → query by the
      // normalised registration key, exactly the same data the parts
      // scan-out now writes for non-fleet vehicles.
      const usageRecords = !organizationId
        ? []
        : selectedVehicle.id
          ? await stockService.getVehicleUsageHistory(
              organizationId,
              selectedVehicle.id,
              tenDaysAgoISO,
            )
          : await stockService.getVehicleUsageHistoryByRegistration(
              organizationId,
              selectedVehicle.registration,
              tenDaysAgoISO,
            )
      
      if (usageRecords.length === 0) {
        toast.info(t('stock.createInvoice.noPartsUsed'))
        setParts([])
        return
      }
      
      // Aggregate parts
      const partsMap = new Map<string, InvoicePart>()
      
      usageRecords.forEach(record => {
        const key = record.partId
        if (partsMap.has(key)) {
          const existing = partsMap.get(key)!
          existing.quantity += record.quantityUsed
          existing.total = existing.quantity * existing.unitPrice
        } else {
          partsMap.set(key, {
            partId: record.partId,
            partName: record.partName,
            partNumber: record.partNumber,
            quantity: record.quantityUsed,
            unitPrice: record.netPrice,
            total: record.totalCost
          })
        }
      })
      
      const invoiceParts = Array.from(partsMap.values())
      setParts(invoiceParts)
      
      if (invoiceParts.length > 0) {
        toast.success(t('stock.createInvoice.loadedParts', { count: invoiceParts.length }))
      }
    } catch (error) {
      logger.error('Error loading parts usage:', error)
      toast.error(t('stock.createInvoice.loadPartsFail'))
    }
  }

  // Labour lines derived from ONE booking's slots (mirrors the per-booking
  // maths used by the legacy window loader, scoped to a single job).
  const computeBookingLabour = (b: any): LabourLine[] => {
    const slots = getEffectiveSlotCount({
      timeSlot: b.timeSlot ?? '',
      slotCount: typeof b.slotCount === 'number' ? b.slotCount : 1,
    })
    const hours = slots * 0.5
    const workArr: string[] = Array.isArray(b.workRequired)
      ? b.workRequired.filter(Boolean)
      : b.workRequired
        ? [String(b.workRequired)]
        : ['Service']
    const perType = hours / Math.max(1, workArr.length)
    const byType: Record<string, number> = {}
    workArr.forEach(w => { byType[w] = (byType[w] || 0) + perType })
    return Object.entries(byType)
      .filter(([, h]) => h > 0)
      .map(([w, h]) => ({
        id: `service-${w}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        description: `Service - ${w}`,
        hours: Math.round(h * 100) / 100,
        rate: labourRate,
        total: Math.round(h * labourRate * 100) / 100,
      }))
  }

  // Invoice from ONE completed job: only its attributed parts + its labour.
  const applyJob = (job: JobOption) => {
    // Guard against duplicating an invoice from the stock page: this job already
    // has one — make the user confirm before invoicing it again.
    if (job.alreadyInvoiced && !editInvoice) {
      const ok = window.confirm(t('stock.createInvoice.alreadyInvoicedConfirm'))
      if (!ok) return
    }
    setSelectedJobId(job.id)
    setParts(job.parts)
    // Replace service-derived labour with just this job's; keep manual/bodyshop.
    setLabour(prev => [
      ...prev.filter(l => !l.id.startsWith('service-')),
      ...computeBookingLabour(job.booking),
    ])
    const b = job.booking
    if (b.mileage != null && String(b.mileage).trim() !== '') {
      setMileage(String(b.mileage).trim())
    }
    if (b.customerName || b.customerPhone) {
      setCustomerFromBookings({
        name: b.customerName?.trim() || b.customerPhone || 'Customer',
        address: '',
        postcode: '',
        email: b.customerEmail || '',
      })
    }
    // Backfill make/model onto a custom (non-fleet) vehicle from the booking.
    if (b.make || b.model) {
      setSelectedVehicle(prev =>
        prev && !prev.id && !prev.make && !prev.model
          ? { ...prev, make: (b.make || '').trim(), model: (b.model || '').trim() }
          : prev,
      )
    }
  }

  // Fallback: the original "everything for this reg in the last 10 days" path.
  // Used when no job has attributed parts (legacy data) or the user picks it.
  const applyLegacyWindow = () => {
    setSelectedJobId(null)
    setParts([])
    loadVehiclePartsUsage()
    loadServiceBookingHoursAndCustomer()
  }

  // Orchestrates step-2 loading: bodyshop hours (job-independent), then builds
  // the completed-job list and defaults to the most recent job that actually
  // has parts attributed — falling back to the legacy 10-day window otherwise.
  const loadForVehicle = async () => {
    if (!selectedVehicle || !organizationId) return

    loadBodyshopHours()

    try {
      // Wider 90-day window so a job picker is meaningful, grouped by job id.
      const since = new Date()
      since.setDate(since.getDate() - 90)
      const sinceIso = since.toISOString()
      const sinceDate = sinceIso.split('T')[0]

      const usagePromise = selectedVehicle.id
        ? stockService.getVehicleUsageHistory(organizationId, selectedVehicle.id, sinceIso)
        : stockService.getVehicleUsageHistoryByRegistration(organizationId, selectedVehicle.registration, sinceIso)

      const bookingsPromise = supabase
        .from('service_bookings')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('registration', selectedVehicle.registration)
        .gte('date', sinceDate)

      const [usage, bookingsRes] = await Promise.all([usagePromise, bookingsPromise])
      if (bookingsRes.error) throw bookingsRes.error
      const bookings = toCamelList<any>(bookingsRes.data || [])

      // Group attributed usage rows by their job id.
      const byJob = new Map<string, PartUsageRecord[]>()
      usage.forEach(u => {
        if (!u.serviceBookingId) return
        const arr = byJob.get(u.serviceBookingId) || []
        arr.push(u)
        byJob.set(u.serviceBookingId, arr)
      })

      const options: JobOption[] = bookings
        .filter(b => b.status === 'completed' && !b.isExternalProvider)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .map(b => {
          const recs = byJob.get(b.id) || []
          const parts = aggregateUsage(recs)
          return {
            id: b.id,
            date: b.date,
            workLabel: jobWorkLabel(b),
            booking: b,
            parts,
            partsTotal: parts.reduce((s, p) => s + p.total, 0),
            alreadyInvoiced: !!b.invoiceId,
          }
        })

      setVehicleJobs(options)

      // Default to the most recent NOT-yet-invoiced job that has parts (so we
      // never auto-load an already-invoiced job); else the legacy window.
      const firstWithParts = options.find(o => o.parts.length > 0 && !o.alreadyInvoiced)
      if (firstWithParts) {
        applyJob(firstWithParts)
      } else {
        applyLegacyWindow()
      }
    } catch (error) {
      logger.error('Error loading vehicle jobs:', error)
      // Never leave the user stuck — fall back to the proven window loader.
      setVehicleJobs([])
      applyLegacyWindow()
    }
  }

  const selectVehicle = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle)
    setSearchTerm(vehicle.registration)
    setStep('details')
  }

  // 🚗 "Use as custom vehicle" — for invoicing a registration that isn't
  // in the fleet (e.g. a one-off retail customer). We synthesise a
  // Vehicle-shaped object with id=undefined; the rest of the modal's
  // loaders skip when id is missing (no parts to look up by id) but the
  // service-booking and bodyshop loaders still work because they query
  // by registration string.
  const selectCustomVehicle = (rawReg: string) => {
    const reg = rawReg.trim().toUpperCase()
    if (!reg) return
    const synthetic: Vehicle = {
      // id deliberately omitted → marks this as custom downstream.
      registration: reg,
      make: '',
      model: '',
      colour: '',
      size: '',
      motExpiry: '',
      taxExpiry: '',
      comments: '',
      condition: '',
      insurancePolicyId: null,
      insurancePolicyName: null,
      insurancePolicyExpiry: null,
      createdAt: new Date().toISOString(),
      organizationId: organizationId || '',
      createdBy: user?.uid || '',
    }
    setSelectedVehicle(synthetic)
    setSearchTerm(reg)
    setStep('details')
  }

  const addLabourPreset = (preset: keyof typeof LABOUR_PRESETS) => {
    const presetData = LABOUR_PRESETS[preset]
    const newLabour: LabourLine = {
      id: Date.now().toString(),
      description: presetData.description,
      hours: presetData.hours,
      rate: labourRate,
      total: presetData.hours * labourRate
    }
    setLabour([...labour, newLabour])
  }

  const addCustomLabour = () => {
    const newLabour: LabourLine = {
      id: Date.now().toString(),
      description: '',
      hours: 1,
      rate: labourRate,
      total: labourRate
    }
    setLabour([...labour, newLabour])
  }

  const updateLabour = (id: string, field: keyof LabourLine, value: any) => {
    setLabour(labour.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value }
        if (field === 'hours' || field === 'rate') {
          updated.total = updated.hours * updated.rate
        }
        return updated
      }
      return item
    }))
  }

  const removeLabour = (id: string) => {
    setLabour(labour.filter(item => item.id !== id))
  }

  const addCustomPart = () => {
    const newPart: InvoicePart = {
      partId: `custom-${Date.now()}`,
      partName: '',
      partNumber: '',
      quantity: 1,
      unitPrice: 0,
      total: 0
    }
    setParts([...parts, newPart])
  }

  const updatePart = (index: number, field: keyof InvoicePart, value: any) => {
    setParts(parts.map((part, i) => {
      if (i === index) {
        const updated = { ...part, [field]: value }
        if (field === 'quantity' || field === 'unitPrice') {
          updated.total = updated.quantity * updated.unitPrice
        }
        return updated
      }
      return part
    }))
  }

  const removePart = (index: number) => {
    setParts(parts.filter((_, i) => i !== index))
  }

  const calculateTotals = () => {
    const round2 = (n: number) => Math.round(n * 100) / 100
    const markup = (selectedFromCompany?.partsMarkupPercent || 0) / 100
    const discountPct = (discountPercent || 0) / 100
    // Markup applies to PARTS ONLY — recompute each line at the marked-up unit price.
    const markedParts = parts.map(part => {
      const unitPrice = round2(part.unitPrice * (1 + markup))
      return { ...part, unitPrice, total: round2(unitPrice * part.quantity) }
    })
    const rawPartsTotal = round2(parts.reduce((sum, part) => sum + part.total, 0)) // entered cost, no markup
    const partsTotal = round2(markedParts.reduce((sum, part) => sum + part.total, 0)) // with markup
    const labourTotal = round2(labour.reduce((sum, item) => sum + item.total, 0))
    const subtotal = round2(partsTotal + labourTotal)
    // Discount applied to the net (before VAT), shown as its own line.
    const discount = round2(subtotal * discountPct)
    const net = round2(subtotal - discount)
    const vat = round2(net * 0.20)
    const total = round2(net + vat)
    const markupPercent = selectedFromCompany?.partsMarkupPercent || 0
    return { markedParts, rawPartsTotal, partsTotal, markupPercent, labourTotal, subtotal, discount, net, vat, total }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!user || !organizationId || !selectedVehicle) {
      toast.error(t('stock.createInvoice.missingInfo'))
      return
    }

    if (!selectedFromCompany || !selectedToCompany) {
      toast.error(t('stock.createInvoice.selectBothCompanies'))
      return
    }

    if (parts.length === 0 && labour.length === 0) {
      toast.error(t('stock.createInvoice.addAtLeastOne'))
      return
    }

    setLoading(true)
    try {
      const totals = calculateTotals()

      // Fields shared by create + edit. Parts are stored at the marked-up price
      // (reversed back to raw when re-editing — see reverseMarkup).
      const editableFields = {
        invoiceDate,
        // Empty string when invoicing a custom (non-fleet) vehicle —
        // we still capture the registration so the invoice is fully
        // identifiable, but there's no fleet doc to reference.
        vehicleId: selectedVehicle.id ?? '',
        vehicleRegistration: selectedVehicle.registration,
        vehicleMake: selectedVehicle.make || '',
        vehicleModel: selectedVehicle.model || '',
        vehicleMileage: mileage,
        fromCompany: selectedFromCompany.name,
        toCompany: selectedToCompany.name,
        parts: totals.markedParts,
        labour,
        subtotal: totals.subtotal,
        discount: totals.discount,
        discountPercent,
        markupPercent: selectedFromCompany.partsMarkupPercent || 0,
        vat: totals.vat,
        total: totals.total,
        fromLogo: selectedFromCompany.logo || '',
      }

      if (editInvoice) {
        // Edit: update the same row — number, status, createdAt stay as-is.
        await stockService.updateInvoice(editInvoice.id!, editableFields)
        toast.success(t('stock.createInvoice.updated'))
      } else {
        const invoiceNumber = await stockService.generateInvoiceNumber(organizationId)
        const created = await stockService.createInvoice({
          invoiceNumber,
          ...editableFields,
          createdBy: user.uid,
          createdByName: userDisplayName,
          organizationId,
          status: 'draft',
        })
        // 🔗 Link the invoice back to the job it was raised from so the job is
        // marked invoiced (drives the "Invoiced" flag + stops accidental
        // duplicates). Only when a specific job was picked (not the legacy
        // last-10-days window). Non-fatal — the invoice is already saved.
        if (selectedJobId && created?.id) {
          try {
            await supabase
              .from('service_bookings')
              .update({ invoice_id: created.id })
              .eq('id', selectedJobId)
              .eq('organization_id', organizationId)
          } catch (linkErr) {
            logger.error('Linking invoice to booking failed (non-fatal):', linkErr)
          }
        }
        toast.success(t('stock.createInvoice.created'))
      }

      onSuccess()
      resetForm()
      onClose()
    } catch (error) {
      logger.error('Error saving invoice:', error)
      toast.error(t(editInvoice ? 'stock.createInvoice.updateFail' : 'stock.createInvoice.createFail'))
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setStep('vehicle')
    setSearchTerm('')
    setSelectedVehicle(null)
    setInvoiceDate(new Date().toISOString().split('T')[0])
    setSelectedFromCompany(fromCompanies[0] || null)
    setSelectedToCompany(toCompanies[0] || null)
    setParts([])
    setLabour([])
    setLabourRate(DEFAULT_LABOUR_RATE)
    setDiscountPercent(fromCompanies[0]?.discountPercent || 0)
    setMileage('')
    setCustomerFromBookings(null)
    setVehicleJobs([])
    setSelectedJobId(null)
  }

  if (!isOpen) return null

  const totals = calculateTotals()

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-6xl border border-gray-200 dark:border-gray-700 my-8 max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="relative z-20 flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-t-xl">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t(editInvoice ? 'stock.createInvoice.editTitle' : 'stock.createInvoice.title')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {editInvoice
                  ? t('stock.createInvoice.editingNumber', { number: editInvoice.invoiceNumber })
                  : t(step === 'vehicle' ? 'stock.createInvoice.step1' : 'stock.createInvoice.step2')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="relative z-10 flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="p-6">
            {step === 'vehicle' ? (
              /* STEP 1: Vehicle Selection */
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('stock.createInvoice.selectVehicle')}
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={t('stock.createInvoice.vehiclePlaceholder')}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                    />
                  </div>

                  {searchTerm && (
                    <div className="mt-2 max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-700">
                      {filteredVehicles.map(vehicle => (
                        <button
                          key={vehicle.id}
                          type="button"
                          onClick={() => selectVehicle(vehicle)}
                          className="w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors border-b border-gray-100 dark:border-gray-600"
                        >
                          <div className="font-medium text-gray-900 dark:text-white text-lg">{vehicle.registration}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {vehicle.make} {vehicle.model} • {vehicle.colour}
                          </div>
                        </button>
                      ))}
                      {/* Always offer "use as custom" so the user can
                          invoice any reg, including ones we've never seen
                          before. Distinct amber styling so it doesn't get
                          confused with a real fleet match. */}
                      {searchTerm.trim().length >= 2 && (
                        <button
                          type="button"
                          onClick={() => selectCustomVehicle(searchTerm)}
                          className="w-full p-4 text-left bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors border-t-2 border-amber-300 dark:border-amber-700"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300 bg-amber-200 dark:bg-amber-800/50 px-1.5 py-0.5 rounded">
                              {t('stock.createInvoice.customBadge')}
                            </span>
                            <span className="font-medium text-amber-900 dark:text-amber-100 text-lg">
                              {searchTerm.trim().toUpperCase()}
                            </span>
                          </div>
                          <div className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                            {t('stock.createInvoice.customDesc')}
                          </div>
                        </button>
                      )}
                      {filteredVehicles.length === 0 && searchTerm.trim().length < 2 && (
                        <div className="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                          {t('stock.createInvoice.typeToSearch')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* STEP 2: Invoice Details */
              <div className="space-y-6">
                {/* Selected Vehicle Info — amber-tinted when this is a
                    custom (non-fleet) vehicle so the user knows there are
                    no fleet records to back it up. */}
                <div className={`rounded-lg p-4 border ${
                  selectedVehicle?.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                    : 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className={`font-medium text-lg ${
                          selectedVehicle?.id
                            ? 'text-blue-900 dark:text-blue-100'
                            : 'text-amber-900 dark:text-amber-100'
                        }`}>
                          {selectedVehicle?.registration}
                        </div>
                        {!selectedVehicle?.id && (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300 bg-amber-200 dark:bg-amber-800/50 px-1.5 py-0.5 rounded">
                            {t('stock.createInvoice.customNotFleet')}
                          </span>
                        )}
                      </div>
                      <div className={`text-sm ${
                        selectedVehicle?.id
                          ? 'text-blue-700 dark:text-blue-300'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}>
                        {selectedVehicle?.make || selectedVehicle?.model
                          ? `${selectedVehicle?.make ?? ''} ${selectedVehicle?.model ?? ''}`.trim()
                          : t('stock.createInvoice.noMakeModel')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setStep('vehicle')
                        setSelectedVehicle(null)
                        setSearchTerm('')
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      {t('stock.createInvoice.changeVehicle')}
                    </button>
                  </div>
                </div>

                {/* 🧩 Which job? — pick a completed job to invoice only its
                    parts + labour. Hidden when the vehicle has no completed
                    jobs in range (legacy 10-day window used silently). */}
                {vehicleJobs.length > 0 && (
                  <div className="rounded-xl border border-[#e2e8e5] dark:border-gray-700 bg-[#f6f8f7] dark:bg-gray-900/40 p-4">
                    <label className="block text-sm font-semibold text-[#012619] dark:text-white mb-2">
                      {t('stock.createInvoice.whichJob')}
                    </label>
                    <div className="flex flex-col gap-1.5">
                      {vehicleJobs.map(job => {
                        const active = selectedJobId === job.id
                        return (
                          <button
                            key={job.id}
                            type="button"
                            onClick={() => applyJob(job)}
                            className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                              active
                                ? 'border-[#025940] bg-[#f0f7f4] dark:bg-[#025940]/20'
                                : 'border-[#e2e8e5] dark:border-gray-700 hover:border-[#72A68E] bg-white dark:bg-gray-800'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[#012619] dark:text-white truncate flex items-center gap-2">
                                <span className="truncate">{new Date(job.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {job.workLabel}</span>
                                {job.alreadyInvoiced && (
                                  <span className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                    {t('stock.createInvoice.alreadyInvoiced')}
                                  </span>
                                )}
                              </p>
                              <p className="text-[11px] text-[#72A68E]">
                                {job.parts.length > 0
                                  ? t('stock.createInvoice.jobParts', { count: job.parts.length, total: job.partsTotal.toFixed(2) })
                                  : t('stock.createInvoice.jobNoParts')}
                              </p>
                            </div>
                            {active && <Check className="w-4 h-4 text-[#025940] dark:text-[#72A68E] flex-shrink-0" />}
                          </button>
                        )
                      })}
                      <button
                        type="button"
                        onClick={applyLegacyWindow}
                        className={`px-3 py-2 rounded-lg border text-left text-xs transition-colors ${
                          selectedJobId === null
                            ? 'border-[#025940] bg-[#f0f7f4] dark:bg-[#025940]/20 text-[#025940] dark:text-[#72A68E] font-semibold'
                            : 'border-[#e2e8e5] dark:border-gray-700 hover:border-[#72A68E] text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {t('stock.createInvoice.legacyWindow')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Invoice Header */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('stock.createInvoice.invoiceDate')}
                    </label>
                    <input
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                      required
                    />
                  </div>

                  {/* 🔥 NEW: From Company Dropdown */}
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('stock.createInvoice.fromCompany')}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowFromDropdown(!showFromDropdown)
                        setShowToDropdown(false)
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 bg-white text-gray-900 dark:bg-gray-700 dark:text-white text-left flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-2">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">
                          {selectedFromCompany ? selectedFromCompany.name : t('stock.createInvoice.selectCompany')}
                        </span>
                      </div>
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </button>
                    
                    {showFromDropdown && (
                      <div className="absolute z-30 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {fromCompanies.length === 0 ? (
                          <div className="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                            {t('stock.createInvoice.noCompanies')}
                          </div>
                        ) : (
                          fromCompanies.map((company, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={() => {
                                setSelectedFromCompany(company)
                                setShowFromDropdown(false)
                              }}
                              className="w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-600 border-b border-gray-100 dark:border-gray-600 last:border-0"
                            >
                              <div className="font-medium text-gray-900 dark:text-white">{company.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {company.address} • {company.postcode}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {t('stock.createInvoice.vatPrefix')}{company.vatNumber} • {t('stock.createInvoice.regPrefix')}{company.companyRegNo}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* 🔥 NEW: To Company Dropdown */}
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {t('stock.createInvoice.toCompany')}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowToDropdown(!showToDropdown)
                        setShowFromDropdown(false)
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 bg-white text-gray-900 dark:bg-gray-700 dark:text-white text-left flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-2">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">
                          {selectedToCompany ? selectedToCompany.name : t('stock.createInvoice.selectCustomer')}
                        </span>
                      </div>
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </button>

                    {/* Quick-pick chip — when the vehicle's recent service
                        bookings have a customer attached, surface them as a
                        one-click option so the user doesn't need to dig
                        through the org's preset list. Especially useful for
                        custom (non-fleet) vehicles where the preset list
                        wouldn't have the right customer. */}
                    {customerFromBookings && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedToCompany(customerFromBookings)
                          setShowToDropdown(false)
                        }}
                        className={`mt-2 w-full px-3 py-2 rounded-lg border-2 text-left transition-colors ${
                          selectedToCompany?.name === customerFromBookings.name &&
                          selectedToCompany?.email === customerFromBookings.email
                            ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/30'
                            : 'border-pink-300 dark:border-pink-600 bg-pink-50/50 dark:bg-pink-900/10 hover:bg-pink-100 dark:hover:bg-pink-900/30'
                        }`}
                        title={t('stock.createInvoice.useBookingCustomer')}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-pink-700 dark:text-pink-300 bg-pink-200 dark:bg-pink-800/50 px-1.5 py-0.5 rounded flex-shrink-0">
                              {t('stock.createInvoice.fromBooking')}
                            </span>
                            <span className="font-semibold text-gray-900 dark:text-white truncate">
                              {customerFromBookings.name}
                            </span>
                          </div>
                          {customerFromBookings.email && (
                            <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                              {customerFromBookings.email}
                            </span>
                          )}
                        </div>
                      </button>
                    )}

                    {showToDropdown && (
                      <div className="absolute z-30 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {/* Booking-derived customer at the top of the
                            dropdown so it's findable even after the chip
                            closes. */}
                        {customerFromBookings && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedToCompany(customerFromBookings)
                              setShowToDropdown(false)
                            }}
                            className="w-full p-3 text-left hover:bg-pink-50 dark:hover:bg-pink-900/20 border-b border-gray-100 dark:border-gray-600 bg-pink-50/40 dark:bg-pink-900/10"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold uppercase text-pink-700 dark:text-pink-300 bg-pink-200 dark:bg-pink-800/50 px-1.5 py-0.5 rounded">
                                {t('stock.createInvoice.fromBooking')}
                              </span>
                              <span className="font-medium text-gray-900 dark:text-white">{customerFromBookings.name}</span>
                            </div>
                            {customerFromBookings.email && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                📧 {customerFromBookings.email}
                              </div>
                            )}
                          </button>
                        )}
                        {toCompanies.length === 0 && !customerFromBookings ? (
                          <div className="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                            {t('stock.createInvoice.noCustomers')}
                          </div>
                        ) : (
                          toCompanies.map((company, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={() => {
                                setSelectedToCompany(company)
                                setShowToDropdown(false)
                              }}
                              className="w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-600 border-b border-gray-100 dark:border-gray-600 last:border-0"
                            >
                              <div className="font-medium text-gray-900 dark:text-white">{company.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {company.address} • {company.postcode}
                              </div>
                              {company.email && (
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  📧 {company.email}
                                </div>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Parts Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('stock.createInvoice.parts')}</h3>
                    <button
                      type="button"
                      onClick={addCustomPart}
                      className="text-sm text-green-600 hover:text-green-700 dark:text-green-400 flex items-center space-x-1"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{t('stock.createInvoice.addCustomPart')}</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {parts.map((part, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 items-center bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg">
                        <input
                          type="text"
                          value={part.partName}
                          onChange={(e) => updatePart(index, 'partName', e.target.value)}
                          placeholder={t('stock.createInvoice.partNamePlaceholder')}
                          className="col-span-4 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                        />
                        <input
                          type="text"
                          value={part.partNumber}
                          onChange={(e) => updatePart(index, 'partNumber', e.target.value)}
                          placeholder={t('stock.createInvoice.partNumPlaceholder')}
                          className="col-span-2 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                        />
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={part.quantity}
                          onChange={(e) => updatePart(index, 'quantity', parseFloat(e.target.value) || 1)}
                          className="col-span-2 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={part.unitPrice}
                          onChange={(e) => updatePart(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                          className="col-span-2 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                        />
                        <div className="col-span-1 text-right text-sm font-medium">£{part.total.toFixed(2)}</div>
                        <button
                          type="button"
                          onClick={() => removePart(index)}
                          className="col-span-1 p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Labour Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('stock.createInvoice.labour')}</h3>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">{t('stock.createInvoice.rate')}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={labourRate}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || DEFAULT_LABOUR_RATE
                          setLabourRate(v)
                          // Re-price every existing labour line so changing the
                          // rate updates the whole invoice — not just new lines.
                          setLabour(prev => prev.map(l => ({
                            ...l,
                            rate: v,
                            total: Math.round((l.hours || 0) * v * 100) / 100,
                          })))
                        }}
                        className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-400">{t('stock.createInvoice.perHr')}</span>
                    </div>
                  </div>

                  {/* Labour Presets */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                    {Object.keys(LABOUR_PRESETS).map((key) => {
                      const preset = LABOUR_PRESETS[key as keyof typeof LABOUR_PRESETS]
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => addLabourPreset(key as keyof typeof LABOUR_PRESETS)}
                          className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
                        >
                          {preset.description}
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={addCustomLabour}
                      className="px-3 py-2 text-sm bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-900 dark:text-green-100 rounded-lg transition-colors flex items-center justify-center space-x-1"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{t('stock.createInvoice.custom')}</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {labour.map((item) => (
                      <div key={item.id} className="grid grid-cols-12 gap-2 items-center bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateLabour(item.id, 'description', e.target.value)}
                          placeholder={t('stock.createInvoice.descPlaceholder')}
                          className="col-span-5 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.hours}
                          onChange={(e) => updateLabour(item.id, 'hours', parseFloat(e.target.value) || 0)}
                          className="col-span-2 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.rate}
                          onChange={(e) => updateLabour(item.id, 'rate', parseFloat(e.target.value) || 0)}
                          className="col-span-2 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white text-gray-900 dark:bg-gray-700 dark:text-white"
                        />
                        <div className="col-span-2 text-right text-sm font-medium">£{item.total.toFixed(2)}</div>
                        <button
                          type="button"
                          onClick={() => removeLabour(item.id)}
                          className="col-span-1 p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Odometer + per-invoice discount */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 max-w-md ml-auto">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('stock.createInvoice.odoLabel')}</label>
                    <input
                      type="text"
                      value={mileage}
                      onChange={(e) => setMileage(e.target.value)}
                      placeholder="84,500"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('stock.createInvoice.discountLabel')}</label>
                    <input
                      type="number" min="0" max="100" step="any"
                      value={discountPercent || ''}
                      onChange={(e) => setDiscountPercent(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                      placeholder="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#025940]/30 focus:border-[#025940]"
                    />
                  </div>
                </div>

                {/* Totals */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <div className="space-y-2 max-w-md ml-auto">
                    {totals.markupPercent > 0 && (
                      <div className="flex justify-between text-gray-500 dark:text-gray-500 text-xs">
                        <span>{t('stock.createInvoice.partsCost')}</span>
                        <span>£{totals.rawPartsTotal.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>{totals.markupPercent > 0 ? t('stock.createInvoice.partsSubtotalMarkup', { percent: totals.markupPercent }) : t('stock.createInvoice.partsSubtotal')}</span>
                      <span>£{totals.partsTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>{t('stock.createInvoice.labourSubtotal')}</span>
                      <span>£{totals.labourTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-900 dark:text-white font-semibold border-t border-gray-200 dark:border-gray-700 pt-2">
                      <span>{t('stock.createInvoice.subtotal')}</span>
                      <span>£{totals.subtotal.toFixed(2)}</span>
                    </div>
                    {totals.discount > 0 && (
                      <div className="flex justify-between text-red-600 dark:text-red-400">
                        <span>{t('stock.createInvoice.discount', { percent: discountPercent })}</span>
                        <span>−£{totals.discount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>{t('stock.createInvoice.vat')}</span>
                      <span>£{totals.vat.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xl font-bold text-[#025940] dark:text-[#72A68E] border-t-2 border-[#025940] dark:border-[#72A68E] pt-2">
                      <span>{t('stock.createInvoice.total')}</span>
                      <span>£{totals.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between pt-6 border-t border-gray-200 dark:border-gray-700 mt-6">
              <button
                type="button"
                onClick={() => {
                  // In edit mode there's no vehicle-search step to go back to —
                  // the left button just cancels.
                  if (step === 'details' && !editInvoice) {
                    setStep('vehicle')
                  } else {
                    onClose()
                    resetForm()
                  }
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                disabled={loading}
              >
                {t(step === 'details' && !editInvoice ? 'stock.btn.back' : 'stock.btn.cancel')}
              </button>

              {step === 'details' && (
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all disabled:opacity-50"
                >
                  {loading
                    ? t(editInvoice ? 'stock.createInvoice.saving' : 'stock.createInvoice.creating')
                    : t(editInvoice ? 'stock.createInvoice.saveChanges' : 'stock.createInvoice.createInvoiceBtn')}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}