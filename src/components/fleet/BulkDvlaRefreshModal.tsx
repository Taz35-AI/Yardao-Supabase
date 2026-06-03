// src/components/fleet/BulkDvlaRefreshModal.tsx
// Confirm → live progress → summary modal for the bulk "Refresh MOT & tax from DVLA".
'use client'

import React, { useEffect, useRef, useState } from 'react'
import { X, RefreshCw, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  bulkVehicleRefreshService,
  type BulkRefreshProgress,
} from '@/lib/services/bulkVehicleRefreshService'
import { useT } from '@/lib/i18n'

interface BulkDvlaRefreshModalProps {
  organizationId: string
  vehicleCount: number
  onClose: () => void
  onComplete: () => void
}

export function BulkDvlaRefreshModal({
  organizationId,
  vehicleCount,
  onClose,
  onComplete,
}: BulkDvlaRefreshModalProps) {
  const t = useT()
  const [phase, setPhase] = useState<'confirm' | 'running' | 'done' | 'error'>('confirm')
  const [progress, setProgress] = useState<BulkRefreshProgress | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const unsubRef = useRef<null | (() => void)>(null)

  // Clean up the Firestore subscription if the modal unmounts mid-run.
  useEffect(() => () => { if (unsubRef.current) unsubRef.current() }, [])

  const start = async () => {
    setPhase('running')
    setProgress({ status: 'running', total: vehicleCount, processed: 0, updated: 0, notFound: 0, errors: 0 })

    // Enqueue the job (returns immediately). The DVLA work runs server-side.
    try {
      const res = await bulkVehicleRefreshService.run()
      if (res.rateLimited) {
        setErrorMsg(t('fleet.bulkDvla.dailyCap', { minutes: res.minutesLeft ?? 10 }))
        setPhase('error')
        return
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : t('fleet.bulkDvla.failed'))
      setPhase('error')
      return
    }

    // Watch live progress. The job completes server-side even if this page is
    // closed or refreshed — reopening just resumes watching the same job.
    unsubRef.current = bulkVehicleRefreshService.subscribe(
      organizationId,
      (p) => {
        setProgress(p)
        if (p.status === 'done') {
          // Show the summary and STOP here. Do NOT refresh the fleet now — the
          // parent's refresh re-renders the page and remounts this modal, which
          // resets it to the confirm screen before the user ever sees the
          // result. The fleet refresh runs when they close the summary instead.
          setPhase('done')
          if (unsubRef.current) { unsubRef.current(); unsubRef.current = null }
        } else if (p.status === 'error') {
          setErrorMsg(p.errorMessage || t('fleet.bulkDvla.failed'))
          setPhase('error')
          if (unsubRef.current) { unsubRef.current(); unsubRef.current = null }
        }
      },
      // Listener died (e.g. permissions/network). The job still finishes
      // server-side, but we must unstick the UI instead of spinning forever.
      () => {
        setErrorMsg(t('fleet.bulkDvla.connectionLost'))
        setPhase('error')
        if (unsubRef.current) { unsubRef.current(); unsubRef.current = null }
      },
    )
  }

  const total = progress?.total || vehicleCount
  const processed = progress?.processed || 0
  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0
  const busy = phase === 'running'

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4 z-[60]"
      onClick={() => { if (!busy) onClose() }}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-[#e2e8e5] dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 bg-[#012619] px-5 py-4">
          <span className="flex-shrink-0 bg-[#b3f243]/10 border border-[#b3f243]/30 rounded-xl p-2">
            <RefreshCw className={`w-5 h-5 text-[#b3f243] ${busy ? 'animate-spin' : ''}`} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-white font-semibold text-sm">{t('fleet.bulkDvla.title')}</p>
            <p className="text-[#72A68E] text-xs mt-0.5">{t('fleet.bulkDvla.subtitle')}</p>
          </div>
          {!busy && (
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-[#72A68E] hover:text-white hover:bg-white/10 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-5">
          {/* Confirm */}
          {phase === 'confirm' && (
            <>
              <p className="text-sm text-[#012619] dark:text-gray-200">
                {t('fleet.bulkDvla.confirmBody', { count: vehicleCount })}
              </p>
              <p className="text-xs text-[#8a9e94] mt-2">{t('fleet.bulkDvla.confirmHint')}</p>
              <p className="text-[11px] text-[#8a9e94] mt-1">{t('fleet.bulkDvla.capNote')}</p>
              <div className="flex gap-2 mt-5">
                <Button
                  type="button"
                  onClick={onClose}
                  className="flex-1 bg-[#f0f4f2] dark:bg-gray-700 text-[#4a5e54] dark:text-gray-300 hover:bg-[#e2e8e5] dark:hover:bg-gray-600 font-semibold py-2.5 text-sm border border-[#c8d5ce] dark:border-gray-600 shadow-none"
                >
                  {t('fleet.bulkDvla.cancel')}
                </Button>
                <Button
                  type="button"
                  onClick={start}
                  className="flex-1 bg-[#025940] hover:bg-[#012619] text-white font-semibold py-2.5 text-sm border-0 shadow-none flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  {t('fleet.bulkDvla.start')}
                </Button>
              </div>
            </>
          )}

          {/* Running */}
          {phase === 'running' && (
            <>
              <div className="flex items-center gap-2 text-sm text-[#012619] dark:text-gray-200">
                <Loader2 className="w-4 h-4 animate-spin text-[#025940]" />
                {t('fleet.bulkDvla.running', { processed, total })}
              </div>
              <div className="mt-3 h-2.5 w-full bg-[#e2e8e5] dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-[#025940] transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-[#8a9e94] mt-1.5">
                <span>{pct}%</span>
                <span>{t('fleet.bulkDvla.updatedCount', { count: progress?.updated || 0 })}</span>
              </div>
              <p className="text-[11px] text-[#8a9e94] mt-3">{t('fleet.bulkDvla.dontClose')}</p>
            </>
          )}

          {/* Done */}
          {phase === 'done' && (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold text-[#025940] dark:text-[#b3f243]">
                <CheckCircle className="w-5 h-5" />
                {t('fleet.bulkDvla.doneTitle')}
              </div>
              <ul className="mt-3 space-y-1.5 text-sm text-[#012619] dark:text-gray-200">
                <li>✅ {t('fleet.bulkDvla.statUpdated', { count: progress?.updated || 0 })}</li>
                <li>🔍 {t('fleet.bulkDvla.statNotFound', { count: progress?.notFound || 0 })}</li>
                {(progress?.errors || 0) > 0 && (
                  <li>⚠️ {t('fleet.bulkDvla.statErrors', { count: progress?.errors || 0 })}</li>
                )}
              </ul>
              <Button
                type="button"
                onClick={() => { try { onComplete() } catch { /* best-effort */ } onClose() }}
                className="w-full mt-5 bg-[#025940] hover:bg-[#012619] text-white font-semibold py-2.5 text-sm border-0 shadow-none"
              >
                {t('fleet.bulkDvla.close')}
              </Button>
            </>
          )}

          {/* Error */}
          {phase === 'error' && (
            <>
              <div className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
              {(progress?.updated || 0) > 0 && (
                <p className="text-xs text-[#8a9e94] mt-2">{t('fleet.bulkDvla.partial', { count: progress?.updated || 0 })}</p>
              )}
              <Button
                type="button"
                onClick={onClose}
                className="w-full mt-5 bg-[#f0f4f2] dark:bg-gray-700 text-[#4a5e54] dark:text-gray-300 hover:bg-[#e2e8e5] dark:hover:bg-gray-600 font-semibold py-2.5 text-sm border border-[#c8d5ce] dark:border-gray-600 shadow-none"
              >
                {t('fleet.bulkDvla.close')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
