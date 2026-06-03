// src/components/voice/VoiceCommandButton.tsx
// =====================================================
// YARDAO VOICE COMMAND UI
// =====================================================
// Floating microphone button + full-screen voice overlay
// with live transcription, vehicle matching, and confirmation.
//
// Features:
// - Manual search fallback
// - Re-record voice button
// - Edit comment (voice or text)
// - Partial registration matching
// - ✅ Mobile scroll fix: overlay is scrollable, action buttons always reachable
// - ✅ Damage notes highlighted in red when flagged with 🔴 DAMAGE:
// =====================================================

'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Mic, MicOff, X, Check, RotateCcw, AlertTriangle, Volume2, ChevronUp, ChevronDown } from 'lucide-react'
import { useVoiceCommand, VoiceCommandResult } from '@/hooks/useVoiceCommand'
import { CheckedInVehicle } from '@/types'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { createAuditLog } from '@/lib/auditUtils'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'

interface VoiceCommandButtonProps {
  checkedInVehicles: CheckedInVehicle[]
  userDisplayName?: string
  floatingClassName?: string
}

export function VoiceCommandButton({
  checkedInVehicles,
  userDisplayName = 'User',
  floatingClassName = '',
}: VoiceCommandButtonProps) {
  const { user } = useAuth()
  const [showOverlay, setShowOverlay] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [manualSearch, setManualSearch] = useState('')
  const [manualResults, setManualResults] = useState<CheckedInVehicle[]>([])
  const [editingComment, setEditingComment] = useState(false)
  const [editedComment, setEditedComment] = useState('')

  // Handler: Save the voice command as a comment/note on the vehicle
  const handleCommandConfirmed = useCallback(async (result: VoiceCommandResult) => {
    if (!result.matchedVehicle || !user) return

    const vehicleId = result.matchedVehicle.id
    if (!vehicleId) {
      toast.error('Vehicle ID not found')
      return
    }

    try {
      // Append to existing comments (don't overwrite)
      const existingComments = result.matchedVehicle.comments || ''
      const timestamp = new Date().toLocaleString('en-GB', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit'
      })

      const newComment = existingComments
        ? `${existingComments}\n🎤 [${timestamp}] ${result.comment}`
        : `🎤 [${timestamp}] ${result.comment}`

      // Create audit log
      const auditLog = createAuditLog(
        `Voice note added by ${userDisplayName}: "${result.comment}"`,
        user.uid,
        userDisplayName
      )

      const { error } = await supabase
        .from('checked_in_vehicles')
        .update({
          comments: newComment,
          last_edit_log: auditLog,
          updated_at: new Date().toISOString(),
        })
        .eq('id', vehicleId)
      if (error) throw error

    } catch (error) {
      logger.error('❌ Failed to save voice command:', error)
      throw error
    }
  }, [user, userDisplayName])

  // Initialize voice command hook
  const voice = useVoiceCommand({
    checkedInVehicles,
    onCommandConfirmed: handleCommandConfirmed,
  })

  // Reset editing state when result changes
  useEffect(() => {
    if (voice.lastResult) {
      setEditedComment(voice.lastResult.comment || '')
      setEditingComment(false)
    }
  }, [voice.lastResult])

  // 🎤 Listen for long-press trigger from Zao bot icon
  useEffect(() => {
    const handler = () => handleMicPress()
    window.addEventListener('yardao:toggle-voice', handler)
    return () => window.removeEventListener('yardao:toggle-voice', handler)
  }, [])

  const handleMicPress = () => {
    if (voice.isListening) {
      voice.stopListening()
    } else {
      setShowOverlay(true)
      voice.startListening()
    }
  }

  const handleClose = () => {
    voice.stopListening()
    setShowOverlay(false)
    setShowHistory(false)
    setManualSearch('')
    setManualResults([])
    setEditingComment(false)
  }

  const handleReRecord = () => {
    voice.rejectCommand()
    setManualSearch('')
    setManualResults([])
    setEditingComment(false)
    setTimeout(() => {
      voice.startListening()
    }, 100)
  }

  // ✅ Helper: check if a comment has been damage-flagged
  const isDamageComment = (comment: string) => comment.startsWith('🔴 DAMAGE:')

  return (
    <>
      {/* Floating mic FAB intentionally removed — voice now opens via a
          3-second long-press on the Check In button (handled in
          DashboardSummaryCards), which fires the 'yardao:toggle-voice'
          event the effect above listens for. */}

      {/* ==================== VOICE OVERLAY ==================== */}
      {showOverlay && (
        // ✅ MOBILE SCROLL FIX: outer container is a flex column that fills the screen.
        // The inner content area is overflow-y-auto so everything scrolls freely,
        // meaning Reject/Confirm buttons are always reachable by scrolling down.
        <div className="fixed inset-0 z-[80] bg-gradient-to-b from-[#012619] via-[#012619]/98 to-[#025940]/95 backdrop-blur-xl flex flex-col">
          
          {/* ── HEADER (never scrolls away) ── */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 pt-6 pb-4 max-w-lg mx-auto w-full safe-area-inset">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-[#025940] flex items-center justify-center border border-[#72A68E]/30">
                <Volume2 className="w-5 h-5 text-[#b3f243]" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Voice Command</h2>
                <p className="text-xs text-[#C5D9D0]">
                  {voice.vehicleCount} vehicles in yard
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-6 h-6 text-[#C5D9D0]" />
            </button>
          </div>

          {/* ── SCROLLABLE BODY ── */}
          <div className="flex-1 overflow-y-auto px-4 pb-8 max-w-lg mx-auto w-full">
            <div className="flex flex-col items-center space-y-6">

              {/* Big Mic Button */}
              <button
                onClick={handleMicPress}
                disabled={voice.isConnecting}
                className={`
                  relative w-28 h-28 rounded-full
                  flex items-center justify-center
                  transition-all duration-500
                  ${voice.isConnecting 
                    ? 'bg-[#025940]/50 border-2 border-[#72A68E]/30'
                    : voice.isListening 
                      ? 'bg-gradient-to-br from-red-500 to-red-700 border-2 border-red-400 shadow-lg shadow-red-500/30' 
                      : 'bg-gradient-to-br from-[#025940] to-[#012619] border-2 border-[#72A68E]/50 hover:border-[#b3f243]/50'
                  }
                `}
              >
                {voice.isConnecting ? (
                  <div className="w-8 h-8 border-3 border-[#C5D9D0] border-t-[#b3f243] rounded-full animate-spin" />
                ) : voice.isListening ? (
                  <MicOff className="w-10 h-10 text-white" />
                ) : (
                  <Mic className="w-10 h-10 text-[#b3f243]" />
                )}
                
                {voice.isListening && (
                  <>
                    <span className="absolute inset-0 rounded-full border-2 border-red-400/60 animate-ping" />
                    <span className="absolute -inset-3 rounded-full border border-red-400/30 animate-pulse" />
                    <span className="absolute -inset-6 rounded-full border border-red-400/15 animate-pulse" style={{ animationDelay: '0.5s' }} />
                  </>
                )}
              </button>

              {/* Status Text */}
              <div className="text-center">
                {voice.isConnecting && (
                  <p className="text-[#C5D9D0] text-sm animate-pulse">Connecting to voice service...</p>
                )}
                {voice.isListening && !voice.liveTranscript && !voice.finalTranscript && (
                  <p className="text-[#b3f243] text-sm font-medium animate-pulse">
                    Listening... say a registration + note
                  </p>
                )}
                {!voice.isListening && !voice.isConnecting && !voice.lastResult && (
                  <p className="text-[#C5D9D0] text-sm">Tap the microphone to start</p>
                )}
              </div>

              {/* Live Transcription Display */}
              {(voice.liveTranscript || voice.finalTranscript) && (
                <div className="w-full max-w-sm">
                  <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-[#72A68E]/20 p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-xs text-[#C5D9D0] font-medium uppercase tracking-wider">Live Transcription</span>
                    </div>
                    <p className="text-white text-lg leading-relaxed">
                      {voice.finalTranscript && (
                        <span className="text-white">{voice.finalTranscript} </span>
                      )}
                      {voice.liveTranscript && (
                        <span className="text-[#C5D9D0]/70 italic">{voice.liveTranscript}</span>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* ==================== RESULT CARD ==================== */}
              {voice.lastResult && (
                <div className="w-full max-w-sm animate-in slide-in-from-bottom-4 duration-300">
                  {voice.lastResult.confidence === 'partial' && voice.lastResult.matchedVehicles && voice.lastResult.matchedVehicles.length > 0 ? (
                    // ✅ PARTIAL MATCHES
                    <div className="rounded-xl border-2 border-yellow-500/50 bg-yellow-500/5 overflow-hidden">
                      <div className="px-4 py-3 bg-yellow-500/10">
                        <p className="text-xs text-[#C5D9D0] font-medium uppercase tracking-wider mb-1">
                          🔍 Multiple Matches Found
                        </p>
                        <p className="text-xl font-bold text-white">
                          "{voice.lastResult.registration}" matched {voice.lastResult.matchedVehicles.length} vehicle{voice.lastResult.matchedVehicles.length > 1 ? 's' : ''}
                        </p>
                      </div>
                      
                      <div className="max-h-64 overflow-y-auto">
                        {voice.lastResult.matchedVehicles.map((vehicle, idx) => (
                          <button
                            key={vehicle.id || idx}
                            onClick={() => {
                              const selectedResult: VoiceCommandResult = {
                                ...voice.lastResult!,
                                matchedVehicle: vehicle,
                                registration: vehicle.registration,
                                confidence: 'exact',
                                comment: editedComment || voice.lastResult!.comment,
                              }
                              voice.confirmCommand(selectedResult)
                            }}
                            className="w-full px-4 py-3 border-b border-white/10 hover:bg-white/5 transition-colors text-left"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-lg font-bold text-white tracking-wider">
                                  {vehicle.registration}
                                </p>
                                <p className="text-xs text-[#C5D9D0]">
                                  {vehicle.make} {vehicle.model} • {vehicle.colour}
                                </p>
                              </div>
                              <span className={`text-xs px-2 py-1 rounded ${
                                vehicle.status === 'Ready' 
                                  ? 'bg-green-500/20 text-green-300'
                                  : vehicle.status === 'Pending checks'
                                  ? 'bg-orange-500/20 text-orange-300'
                                  : 'bg-red-500/20 text-red-300'
                              }`}>
                                {vehicle.status}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                      
                      {voice.lastResult.comment && (
                        <div className="px-4 py-3 border-t border-white/10 bg-white/5">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs text-[#C5D9D0] font-medium uppercase tracking-wider">
                              Note:
                            </p>
                            <button
                              onClick={() => setEditingComment(!editingComment)}
                              className="text-xs text-[#b3f243] hover:text-[#b3f243]/80 font-medium"
                            >
                              {editingComment ? 'Done' : 'Edit'}
                            </button>
                          </div>
                          {editingComment ? (
                            <textarea
                              value={editedComment}
                              onChange={(e) => setEditedComment(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg bg-[#012619] border border-[#72A68E]/30 text-white text-sm resize-none focus:outline-none focus:border-[#b3f243]/50"
                              rows={3}
                            />
                          ) : (
                            // ✅ Damage highlighting
                            <p className={`text-sm ${isDamageComment(editedComment) ? 'text-red-300 font-semibold' : 'text-white'}`}>
                              {editedComment}
                            </p>
                          )}
                        </div>
                      )}
                      
                      <button
                        onClick={() => voice.rejectCommand()}
                        className="w-full py-3 text-sm font-semibold text-[#C5D9D0] hover:bg-white/5 border-t border-white/10"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : voice.lastResult.matchedVehicle ? (
                    // ✅ EXACT/FUZZY MATCH
                    <div className={`rounded-xl border-2 overflow-hidden ${
                      voice.lastResult.confidence === 'exact'
                        ? 'border-[#b3f243] bg-[#b3f243]/5'
                        : 'border-yellow-500 bg-yellow-500/5'
                    }`}>
                      <div className={`px-4 py-3 ${
                        voice.lastResult.confidence === 'exact'
                          ? 'bg-[#b3f243]/10'
                          : 'bg-yellow-500/10'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-[#C5D9D0] font-medium uppercase tracking-wider mb-1">
                              {voice.lastResult.confidence === 'exact' ? '✅ Vehicle Found' : '⚠️ Best Match'}
                            </p>
                            <p className="text-2xl font-bold text-white tracking-wider">
                              {voice.lastResult.registration}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-[#C5D9D0]">
                              {voice.lastResult.matchedVehicle.make} {voice.lastResult.matchedVehicle.model}
                            </p>
                            <p className="text-xs text-[#C5D9D0]">
                              {voice.lastResult.matchedVehicle.colour}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="px-4 py-3 border-t border-white/10">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-[#C5D9D0] font-medium uppercase tracking-wider">
                            Note:
                          </p>
                          <button
                            onClick={() => setEditingComment(!editingComment)}
                            className="text-xs text-[#b3f243] hover:text-[#b3f243]/80 font-medium"
                          >
                            {editingComment ? 'Done' : 'Edit'}
                          </button>
                        </div>
                        {editingComment ? (
                          <textarea
                            value={editedComment}
                            onChange={(e) => setEditedComment(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-[#012619] border border-[#72A68E]/30 text-white text-sm resize-none focus:outline-none focus:border-[#b3f243]/50"
                            rows={3}
                          />
                        ) : (
                          // ✅ Damage highlighting
                          <p className={`text-sm ${isDamageComment(editedComment) ? 'text-red-300 font-semibold' : 'text-white'}`}>
                            {editedComment || '(no comment)'}
                          </p>
                        )}
                      </div>
                      
                      {voice.lastResult.confidence === 'fuzzy' && (
                        <div className="px-4 py-2 bg-yellow-500/10 border-t border-yellow-500/20">
                          <div className="flex items-center space-x-2">
                            <AlertTriangle className="w-4 h-4 text-yellow-500" />
                            <p className="text-xs text-yellow-300">
                              Fuzzy match - verify registration
                            </p>
                          </div>
                        </div>
                      )}

                      {/* ✅ Damage warning banner */}
                      {isDamageComment(editedComment) && (
                        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20">
                          <div className="flex items-center space-x-2">
                            <AlertTriangle className="w-4 h-4 text-red-400" />
                            <p className="text-xs text-red-300">
                              Damage detected — will be flagged on vehicle record
                            </p>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex border-t border-white/10">
                        <button
                          onClick={() => voice.rejectCommand()}
                          disabled={voice.isProcessing}
                          className="flex-1 py-3.5 text-red-400 hover:bg-red-500/10 border-r border-white/10"
                        >
                          <X className="w-5 h-5 inline mr-2" />
                          <span className="text-sm font-semibold">Reject</span>
                        </button>
                        <button
                          onClick={() => {
                            const updatedResult: VoiceCommandResult = {
                              ...voice.lastResult!,
                              comment: editedComment || voice.lastResult!.comment,
                            }
                            voice.confirmCommand(updatedResult)
                            setEditingComment(false)
                          }}
                          disabled={voice.isProcessing}
                          className="flex-1 py-3.5 text-[#b3f243] hover:bg-[#b3f243]/10"
                        >
                          {voice.isProcessing ? (
                            <div className="w-5 h-5 border-2 border-[#b3f243] border-t-transparent rounded-full animate-spin inline-block" />
                          ) : (
                            <>
                              <Check className="w-5 h-5 inline mr-2" />
                              <span className="text-sm font-semibold">Confirm</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    // ❌ NO VEHICLE FOUND
                    <div className="rounded-xl border-2 border-red-500/50 bg-red-500/5 overflow-hidden">
                      <div className="px-4 py-4 text-center border-b border-red-500/20">
                        <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-3">
                          <AlertTriangle className="w-6 h-6 text-red-400" />
                        </div>
                        <p className="text-white font-semibold mb-1">Vehicle Not Found</p>
                        <p className="text-[#C5D9D0] text-sm mb-2">
                          {voice.lastResult.registration 
                            ? `"${voice.lastResult.registration}" is not checked into the yard`
                            : "Couldn't detect a registration"
                          }
                        </p>
                        <p className="text-[#C5D9D0]/60 text-xs italic mb-2">
                          "{voice.lastResult.rawTranscript}"
                        </p>
                        
                        {voice.lastResult.registration && (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20">
                            <span className="text-xs text-[#C5D9D0]/80">Detected:</span>
                            <span className="text-sm font-bold text-white tracking-wider">
                              {voice.lastResult.registration}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div className="px-4 py-4 bg-white/5 border-b border-white/10">
                        <p className="text-xs text-[#C5D9D0] font-medium uppercase tracking-wider mb-2">
                          🔍 Search manually:
                        </p>
                        <input
                          type="text"
                          placeholder="Type 2-3 letters..."
                          value={manualSearch}
                          onChange={(e) => {
                            const search = e.target.value.toUpperCase()
                            setManualSearch(search)
                            
                            if (search.length >= 2) {
                              const results = checkedInVehicles.filter(v => 
                                v.registration.toUpperCase().includes(search)
                              ).slice(0, 5)
                              setManualResults(results)
                            } else {
                              setManualResults([])
                            }
                          }}
                          className="w-full px-3 py-2 rounded-lg bg-[#012619] border border-[#72A68E]/30 text-white placeholder-[#C5D9D0]/50 focus:outline-none focus:border-[#b3f243]/50"
                          autoFocus
                        />
                        
                        {manualResults.length > 0 && (
                          <div className="mt-2 rounded-lg border border-[#72A68E]/20 overflow-hidden">
                            {manualResults.map(vehicle => (
                              <button
                                key={vehicle.id}
                                onClick={() => {
                                  const selectedResult: VoiceCommandResult = {
                                    ...voice.lastResult!,
                                    matchedVehicle: vehicle,
                                    registration: vehicle.registration,
                                    confidence: 'exact',
                                    comment: editedComment || voice.lastResult!.comment,
                                  }
                                  voice.confirmCommand(selectedResult)
                                  setManualSearch('')
                                  setManualResults([])
                                }}
                                className="w-full px-3 py-2.5 text-left hover:bg-white/10 border-b border-white/5 last:border-0"
                              >
                                <p className="text-sm font-bold text-white">{vehicle.registration}</p>
                                <p className="text-xs text-[#C5D9D0]">
                                  {vehicle.make} {vehicle.model} • {vehicle.colour}
                                </p>
                              </button>
                            ))}
                          </div>
                        )}
                        
                        {manualSearch.length >= 2 && manualResults.length === 0 && (
                          <p className="text-xs text-[#C5D9D0]/60 mt-2 text-center italic">
                            No vehicles found matching "{manualSearch}"
                          </p>
                        )}
                      </div>
                      
                      {voice.lastResult.comment && (
                        <div className="px-4 py-4 bg-white/5 border-b border-white/10">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-[#C5D9D0] font-medium uppercase tracking-wider">
                              💬 Your note:
                            </p>
                            <button
                              onClick={() => setEditingComment(!editingComment)}
                              className="text-xs text-[#b3f243] hover:text-[#b3f243]/80 font-medium"
                            >
                              {editingComment ? 'Done' : 'Edit'}
                            </button>
                          </div>
                          {editingComment ? (
                            <textarea
                              value={editedComment}
                              onChange={(e) => setEditedComment(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg bg-[#012619] border border-[#72A68E]/30 text-white text-sm resize-none focus:outline-none focus:border-[#b3f243]/50"
                              rows={3}
                              placeholder="Type your note..."
                            />
                          ) : (
                            // ✅ Damage highlighting in no-match card too
                            <p className={`text-sm leading-relaxed ${isDamageComment(editedComment) ? 'text-red-300 font-semibold' : 'text-white'}`}>
                              {editedComment}
                            </p>
                          )}
                        </div>
                      )}
                      
                      <div className="flex border-t border-white/10">
                        <button
                          onClick={handleReRecord}
                          className="flex-1 py-3 text-[#C5D9D0] hover:bg-white/5 border-r border-white/10"
                        >
                          <Mic className="w-4 h-4 inline mr-2" />
                          <span className="text-sm font-medium">Re-record</span>
                        </button>
                        <button
                          onClick={() => {
                            voice.rejectCommand()
                            setManualSearch('')
                            setManualResults([])
                          }}
                          className="flex-1 py-3 text-red-400 hover:bg-red-500/10"
                        >
                          <X className="w-4 h-4 inline mr-2" />
                          <span className="text-sm font-medium">Cancel</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error Display */}
              {voice.error && (
                <div className="w-full max-w-sm">
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                    <div className="flex items-start space-x-3">
                      <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-red-300 text-sm">{voice.error}</p>
                        <button
                          onClick={voice.clearError}
                          className="text-xs text-red-400/60 hover:text-red-400 mt-2"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Command History */}
              {voice.commandHistory.length > 0 && (
                <div className="w-full max-w-sm mt-4">
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="flex items-center space-x-2 text-[#C5D9D0] text-xs font-medium mb-2 hover:text-white"
                  >
                    {showHistory ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    <span>Command History ({voice.commandHistory.length})</span>
                  </button>
                  
                  {showHistory && (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {voice.commandHistory.map((cmd, i) => (
                        <div
                          key={i}
                          className="flex items-center space-x-3 bg-white/5 rounded-lg px-3 py-2 border border-white/10"
                        >
                          <span className="text-[#b3f243] font-mono text-xs font-bold min-w-[80px]">
                            {cmd.registration}
                          </span>
                          <span className={`text-xs truncate flex-1 ${isDamageComment(cmd.comment) ? 'text-red-300' : 'text-[#C5D9D0]'}`}>
                            {cmd.comment}
                          </span>
                          <Check className="w-3 h-3 text-[#b3f243] flex-shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Instructions Footer */}
              <div className="mt-4 text-center pb-4">
                <p className="text-[#C5D9D0]/40 text-xs leading-relaxed">
                  Say a registration followed by a note, e.g.<br />
                  "LC70 DVP needs a nearside front tire"
                </p>
              </div>

            </div>
          </div>
          {/* end scrollable body */}

        </div>
      )}
    </>
  )
}