// src/hooks/useCustomers.ts
// Real-time customers list scoped to the current org. Used by:
//   - the customer search dropdown in CustomerSection (autocomplete)
//   - the /customers admin page (browse / edit / delete)
// Live listener so new customers created by the booking-save upsert appear
// in autocomplete immediately, without a page refresh.
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
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
    const q = query(
      collection(db, COLLECTION_NAME),
      where('organizationId', '==', organizationId),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        // Spread the raw doc FIRST so any field added to the Customer
        // schema later flows through automatically — then fix only the
        // fields that need a default or a Timestamp → Date coercion.
        // (Was a hand-listed allowlist that silently dropped new fields —
        // e.g. firstName/lastName/registrations had to be added by hand.)
        const list: Customer[] = snap.docs.map((d) => {
          const data = d.data() as any
          return {
            ...data,
            id: d.id,
            name: data.name || '',
            phone: data.phone || '',
            phoneNormalized: data.phoneNormalized || '',
            registrations: Array.isArray(data.registrations) ? data.registrations : undefined,
            bookingCount: typeof data.bookingCount === 'number' ? data.bookingCount : 0,
            createdAt: data.createdAt?.toDate?.() || data.createdAt || new Date(),
            updatedAt: data.updatedAt?.toDate?.() || data.updatedAt || undefined,
          } as Customer
        })
        list.sort((a, b) => a.name.localeCompare(b.name))
        setCustomers(list)
        setLoading(false)
        setError(null)
      },
      (err) => {
        logger.error('useCustomers snapshot error:', err)
        setError(t('customers.errLoad'))
        setLoading(false)
      },
    )
    return () => unsub()
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
