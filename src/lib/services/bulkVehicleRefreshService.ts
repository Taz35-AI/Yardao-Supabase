// src/lib/services/bulkVehicleRefreshService.ts
// Bulk-refresh MOT & road-tax for the whole fleet from DVLA, via Cloud Function.
// The function does the throttled DVLA work server-side and reports live progress
// to bulkRefreshJobs/{organizationId}, which we subscribe to for a progress bar.

import { getFunctions, httpsCallable } from 'firebase/functions'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export interface BulkRefreshProgress {
  status: 'requested' | 'running' | 'done' | 'error'
  total: number
  processed: number
  updated: number
  notFound: number
  errors: number
  errorMessage?: string | null
}

export interface BulkRefreshStartResult {
  started: boolean
  alreadyRunning?: boolean
  rateLimited?: boolean
  minutesLeft?: number
}

class BulkVehicleRefreshService {
  /**
   * Watch live progress of the running job for this organisation.
   * Returns an unsubscribe function.
   */
  subscribe(
    organizationId: string,
    onProgress: (p: BulkRefreshProgress) => void,
    onError?: (e: Error) => void,
  ): () => void {
    const ref = doc(db, 'bulkRefreshJobs', organizationId)
    return onSnapshot(
      ref,
      (snap) => {
        const data = snap.data()
        if (!data) return
        onProgress({
          status: data.status,
          total: data.total ?? 0,
          processed: data.processed ?? 0,
          updated: data.updated ?? 0,
          notFound: data.notFound ?? 0,
          errors: data.errors ?? 0,
          errorMessage: data.errorMessage ?? null,
        })
      },
      // A terminal listener error (e.g. permissions/network) would otherwise
      // leave the caller's UI stuck forever with no resolution — surface it.
      (err) => onError?.(err instanceof Error ? err : new Error(String(err))),
    )
  }

  /**
   * Enqueue the bulk refresh. Returns immediately — the actual DVLA work runs
   * server-side in a Firestore trigger, so it survives a page refresh.
   * Watch progress/completion via subscribe().
   */
  async run(): Promise<BulkRefreshStartResult> {
    const functions = getFunctions(undefined, 'europe-west1')
    const callable = httpsCallable<Record<string, never>, BulkRefreshStartResult>(
      functions,
      'bulkRefreshVehicleData'
    )
    const result = await callable({})
    return result.data
  }
}

export const bulkVehicleRefreshService = new BulkVehicleRefreshService()
