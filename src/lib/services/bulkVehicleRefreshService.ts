// src/lib/services/bulkVehicleRefreshService.ts — SUPABASE re-implementation.
// Bulk-refresh MOT & road-tax for the whole fleet from DVLA, via an Edge
// Function. The function does the throttled DVLA work server-side and reports
// live progress to bulk_refresh_jobs (one row per organization), which we
// subscribe to via Supabase Realtime for a progress bar.
//
// Public interface + signatures are unchanged from the Firestore version:
//   * subscribe(orgId, onProgress, onError?) → unsubscribe fn (fires once with
//     the current state, then on every change — matching onSnapshot semantics)
//   * run() → BulkRefreshStartResult

import { supabase } from '@/lib/supabaseClient'

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

const BULK_REFRESH_JOBS = 'bulk_refresh_jobs'

// Map a bulk_refresh_jobs row → BulkRefreshProgress, applying the same defaults
// the Firestore version did (missing fields fall back to 0 / null).
function rowToProgress(data: any): BulkRefreshProgress {
  return {
    status: data.status,
    total: data.total ?? 0,
    processed: data.processed ?? 0,
    updated: data.updated ?? 0,
    notFound: data.not_found ?? 0,
    errors: data.errors ?? 0,
    errorMessage: data.error_message ?? null,
  }
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
    // Realtime subscription on this org's job row.
    const channel = supabase
      .channel(`bulk_refresh_jobs:${organizationId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: BULK_REFRESH_JOBS,
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const data = payload.new
          if (!data || Object.keys(data).length === 0) return
          onProgress(rowToProgress(data))
        },
      )
      .subscribe((status) => {
        // A terminal channel error (e.g. permissions/network) would otherwise
        // leave the caller's UI stuck forever with no resolution — surface it.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onError?.(new Error(`Realtime subscription ${status}`))
        }
      })

    // Emit the current state immediately (onSnapshot fired with the existing doc).
    supabase
      .from(BULK_REFRESH_JOBS)
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          onError?.(error instanceof Error ? error : new Error(String(error)))
          return
        }
        if (data) onProgress(rowToProgress(data))
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }

  /**
   * Enqueue the bulk refresh. Returns immediately — the actual DVLA work runs
   * server-side, so it survives a page refresh.
   * Watch progress/completion via subscribe().
   */
  async run(): Promise<BulkRefreshStartResult> {
    // TODO(phase5): edge function not deployed yet
    const { data, error } = await supabase.functions.invoke<BulkRefreshStartResult>(
      'bulkRefreshVehicleData',
      { body: {} },
    )
    if (error) throw error
    return data as BulkRefreshStartResult
  }
}

export const bulkVehicleRefreshService = new BulkVehicleRefreshService()
