// src/hooks/useCustomers.ts
// Real-time customers list scoped to the current org. Used by:
//   - the customer search dropdown in CustomerSection (autocomplete)
//   - the /customers admin page (browse / edit / delete)
// Live listener so new customers created by the booking-save upsert appear
// in autocomplete immediately, without a page refresh.
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { wireResyncTriggers, onReconnectRefetch } from '@/lib/realtime/resync'
import { toCamelList } from '@/lib/dbMap'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { customerService, type CustomerInput } from '@/lib/customerService'
import type { Customer } from '@/types/customer'
import { logger } from '@/lib/logger'
import { useT } from '@/lib/i18n'

const COLLECTION_NAME = 'customers'

export interface UseCustomersReturn {
  customers: Customer[]
  loading: boolean
  error: string | null
  /** Create a customer manually (admin "+ Add" flow). */
  createCustomer: (input: CustomerInput) => Promise<string | null>
  /** Patch an existing customer. */
  updateCustomer: (id: string, changes: Partial<CustomerInput>) => Promise<boolean>
  /** Hard-delete a customer record. */
  deleteCustomer: (id: string) => Promise<boolean>
  clearError: () => void
}

export function useCustomers(): UseCustomersReturn {
  const { user } = useAuth()
  const t = useT()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [actorName, setActorName] = useState<string>('')

  // Resolve organizationId + actor name from the user profile (same pattern
  // as useExternalGarages — fetch once on mount).
  useEffect(() => {
    if (!user?.uid) {
      setOrganizationId(null)
      setActorName('')
      return
    }
    let cancelled = false
    userProfileService
      .getProfile(user.uid)
      .then((p) => {
        if (cancelled) return
        setOrganizationId(p?.organizationId ?? null)
        setActorName(p?.displayName || user.displayName || user.email || 'Unknown')
      })
      .catch((err) => logger.error('Error loading profile for useCustomers:', err))
    return () => {
      cancelled = true
    }
  }, [user])

  // Live subscription. We sort client-side to avoid an `orderBy` index
  // requirement (the collection is small — typically tens to hundreds of
  // entries — so a one-time sort per snapshot is fine).
  useEffect(() => {
    if (!organizationId) {
      setCustomers([])
      setLoading(false)
      return
    }
    setLoading(true)

    const org = organizationId

    // Initial fetch + re-fetch on any change to this org's customers.
    const refresh = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from(COLLECTION_NAME)
          .select('*')
          .eq('organization_id', org)
        if (fetchError) throw fetchError

        // Spread the raw row (camelCased) FIRST so any field added to the
        // Customer schema later flows through automatically — then fix only
        // the fields that need a default or a timestamp → Date coercion.
        const list: Customer[] = toCamelList<any>(data).map((row) => {
          return {
            ...row,
            id: row.id,
            name: row.name || '',
            phone: row.phone || '',
            phoneNormalized: row.phoneNormalized || '',
            registrations: Array.isArray(row.registrations) ? row.registrations : undefined,
            bookingCount: typeof row.bookingCount === 'number' ? row.bookingCount : 0,
            createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
            updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined,
          } as Customer
        })
        list.sort((a, b) => a.name.localeCompare(b.name))
        setCustomers(list)
        setLoading(false)
        setError(null)
      } catch (err) {
        logger.error('useCustomers fetch error:', err)
        setError(t('customers.errLoad'))
        setLoading(false)
      }
    }

    refresh()

    const channel = supabase
      .channel(`customers:${org}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: COLLECTION_NAME,
          filter: `organization_id=eq.${org}`,
        },
        () => {
          refresh()
        },
      )
      // Leg-2 resync: refetch when realtime reconnects after a drop.
      .subscribe(onReconnectRefetch(refresh))

    // Leg-2 resync: refetch on tab focus / network back online too.
    const stopResync = wireResyncTriggers(refresh)
    return () => {
      stopResync()
      supabase.removeChannel(channel)
    }
  }, [organizationId])

  const clearError = useCallback(() => setError(null), [])

  // Surface the real Firestore reason in the UI message — "permission-denied"
  // (the most common cause when a new collection lacks rules) is much more
  // actionable than a generic "Failed to create customer".
  const describeError = (err: unknown, fallback: string): string => {
    const code = (err as { code?: string })?.code
    const msg = (err as { message?: string })?.message
    if (code === 'permission-denied') {
      return t('customers.errPermissionDenied')
    }
    // Unique (organization_id, phone_normalized) — a customer with this phone
    // already exists (often auto-created from a past booking).
    if (code === '23505') return t('customers.errDuplicatePhone')
    if (code) return `${fallback} (${code})`
    if (msg) return `${fallback}: ${msg}`
    return fallback
  }

  const createCustomer = useCallback(
    async (input: CustomerInput): Promise<string | null> => {
      if (!organizationId || !user?.uid) {
        setError(t('customers.errNotAuthenticated'))
        return null
      }
      try {
        return await customerService.createCustomer(input, organizationId, user.uid, actorName)
      } catch (err) {
        logger.error('createCustomer error:', err)
        setError(describeError(err, t('customers.errCreate')))
        return null
      }
    },
    [organizationId, user, actorName],
  )

  const updateCustomer = useCallback(
    async (id: string, changes: Partial<CustomerInput>): Promise<boolean> => {
      if (!user?.uid) return false
      try {
        await customerService.updateCustomer(id, changes, user.uid, actorName)
        return true
      } catch (err) {
        logger.error('updateCustomer error:', err)
        setError(describeError(err, t('customers.errUpdate')))
        return false
      }
    },
    [user, actorName],
  )

  const deleteCustomer = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await customerService.deleteCustomer(id)
        return true
      } catch (err) {
        logger.error('deleteCustomer error:', err)
        setError(describeError(err, t('customers.errDelete')))
        return false
      }
    },
    [],
  )

  return useMemo(
    () => ({
      customers,
      loading,
      error,
      createCustomer,
      updateCustomer,
      deleteCustomer,
      clearError,
    }),
    [customers, loading, error, createCustomer, updateCustomer, deleteCustomer, clearError],
  )
}
