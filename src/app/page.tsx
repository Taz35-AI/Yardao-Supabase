'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'
import { useT } from '@/lib/i18n'
import { LegalFooter } from '@/components/legal/LegalFooter'
import {
  ArrowRight, Car, Clock, AlertTriangle, CheckCircle, Search, Plus,
  Calendar, Building, Eye, Truck, Shield, X, ChevronLeft, ChevronRight,
  CheckCircle2, Wrench, XCircle, Menu, ExternalLink, TruckIcon, MapPin,
  LogIn, Package, Settings, Mic, Sparkles, MessageSquare, Zap,
  FileText, Receipt, DollarSign, BarChart2, Hash, Tag
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { useState, useEffect } from 'react'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabaseClient'
import { toCamelList } from '@/lib/dbMap'

const carImages = [
  '/cars/car (1).png', '/cars/car (2).png', '/cars/car (3).png',
  '/cars/car (4).png', '/cars/car (5).png', '/cars/car (6).png',
]

interface Vehicle {
  id: string; imageSrc: string; lane: number; y: number
  duration: number; delay: number; size: number
}

const zaoConversations = [
  {
    prompt: 'Which vehicles are at the bodyshop?',
    reply: '3 vehicles at external garages - HN74ABC, BD24XYZ and LM23DEF.',
  },
  {
    prompt: 'Mark HN74ABC MOT as done today',
    reply: '✅ Done. HN74ABC MOT marked complete. Expiry updated to ' + new Date(Date.now() + 365*24*60*60*1000).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) + '.',
  },
  {
    prompt: 'Any MOTs due this week?',
    reply: '2 vehicles - BD24XYZ expires Thursday and YK69ABC on Friday. Want me to book them in?',
  },
  {
    prompt: 'Return YK69 from external garage',
    reply: '✅ Done. YK69ABC returned from Joe\'s Garage. Cleared from external status.',
  },
  {
    prompt: 'How many vehicles are ready?',
    reply: '27 out of 42 in the yard are Ready. 8 need attention - want the full list?',
  },
  {
    prompt: 'Book HN74 in for tyres on Friday',
    reply: '✅ Booked. HN74ABC - Tyres x4 at Joe\'s Garage, Friday 10:00. Confirmed.',
  },
]

export default function HomePage() {
  const { user } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [currentPrompt, setCurrentPrompt] = useState(0)
  const [displayText, setDisplayText] = useState('')
  const [displayReply, setDisplayReply] = useState('')
  const [isTyping, setIsTyping] = useState(true)
  const [showReply, setShowReply] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const laneConfigs = [
      { speed: 22, startDelay: -5 }, { speed: 18, startDelay: -12 },
      { speed: 28, startDelay: -3 }, { speed: 24, startDelay: -18 },
      { speed: 20, startDelay: -8 }, { speed: 26, startDelay: -15 },
    ]
    const newVehicles: Vehicle[] = []
    for (let lane = 0; lane < 6; lane++) {
      const config = laneConfigs[lane]
      for (let i = 0; i < 2; i++) {
        newVehicles.push({
          id: `${lane}-${i}`,
          imageSrc: carImages[Math.floor(Math.random() * carImages.length)],
          lane, y: (lane * (100 / 6)) + (100 / 6 / 2),
          duration: config.speed,
          delay: config.startDelay - (i * (config.speed / 2)),
          size: 100 + Math.random() * 50,
        })
      }
    }
    setVehicles(newVehicles)
  }, [])

  useEffect(() => {
    if (!user) {
      const convo = zaoConversations[currentPrompt]
      let i = 0
      setDisplayText('')
      setDisplayReply('')
      setIsTyping(true)
      setShowReply(false)

      const type = setInterval(() => {
        if (i < convo.prompt.length) {
          setDisplayText(convo.prompt.slice(0, i + 1))
          i++
        } else {
          clearInterval(type)
          setIsTyping(false)
          setTimeout(() => {
            setShowReply(true)
            setDisplayReply(convo.reply)
            setTimeout(() => {
              setCurrentPrompt(p => (p + 1) % zaoConversations.length)
            }, 3200)
          }, 600)
        }
      }, 36)
      return () => clearInterval(type)
    }
  }, [currentPrompt, user])

  if (!user) {
    return (
      <div className="min-h-screen bg-[#012619] relative overflow-hidden">

        {/* Animated Fleet Background */}
        <div className="fixed inset-0 overflow-hidden opacity-[0.06] pointer-events-none z-0">
          {[...Array(6)].map((_, i) => (
            <div key={`lane-${i}`}
              className="absolute left-0 right-0 border-t border-dashed border-[#72A68E] opacity-30"
              style={{ top: `${(i + 1) * (100 / 7)}%` }}
            />
          ))}
          {vehicles.map((vehicle) => (
            <div key={vehicle.id} className="absolute"
              style={{
                top: `${vehicle.y}%`, width: `${vehicle.size}px`,
                animationName: 'driveRight', animationDuration: `${vehicle.duration}s`,
                animationTimingFunction: 'linear', animationIterationCount: 'infinite',
                animationDelay: `${vehicle.delay}s`, transform: 'translateY(-50%)', left: '-200px',
              }}>
              <img src={vehicle.imageSrc} alt="Vehicle" className="w-full h-auto object-contain" />
            </div>
          ))}
        </div>

        {/* Radial glows */}
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] rounded-full opacity-[0.10]"
            style={{ background: 'radial-gradient(ellipse at center, #b3f243 0%, transparent 65%)' }} />
          <div className="absolute bottom-0 right-0 w-[700px] h-[500px] rounded-full opacity-[0.07]"
            style={{ background: 'radial-gradient(ellipse at bottom right, #72A68E 0%, transparent 70%)' }} />
        </div>

        {/* Grain */}
        <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.018]"
          style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'1\'/%3E%3C/svg%3E")', backgroundSize: '128px' }}
        />

        {/* Navigation */}
        <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#012619]/95 backdrop-blur-xl border-b border-[#025940]/50 shadow-2xl shadow-black/40' : 'bg-transparent'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16 items-center">
              <Link href="/" className="flex items-center">
                <img src="/logo-yardao.png" alt="Yardao" className="h-14 sm:h-16 w-auto object-contain" />
              </Link>
              <div className="hidden sm:flex items-center gap-3">
                <Link href="/login">
                  <Button variant="ghost" size="sm" className="text-[#72A68E] hover:text-white hover:bg-[#025940]/40 border border-transparent hover:border-[#025940]">
                    Sign In
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm" className="bg-[#b3f243] hover:bg-[#c8f96a] text-[#012619] font-bold shadow-lg shadow-[#b3f243]/20">
                    Get Started Free
                  </Button>
                </Link>
              </div>
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="sm:hidden text-[#72A68E] hover:text-white p-2">
                <Menu className="h-6 w-6" />
              </button>
            </div>
            {mobileMenuOpen && (
              <div className="sm:hidden pb-4 pt-2 space-y-2 border-t border-[#025940]/40">
                <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" size="sm" className="w-full text-[#72A68E] hover:text-white hover:bg-[#025940]/40 justify-center">Sign In</Button>
                </Link>
                <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
                  <Button size="sm" className="w-full bg-[#b3f243] hover:bg-[#c8f96a] text-[#012619] font-bold justify-center">Get Started Free</Button>
                </Link>
              </div>
            )}
          </div>
        </nav>

        {/* ══════════════════════════════════════════════════════
            HERO - Headline + yard dashboard preview
        ══════════════════════════════════════════════════════ */}
        <section className="relative z-10 min-h-screen flex flex-col justify-center pt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">

              <div className="fade-up">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#025940]/60 bg-[#025940]/20 mb-8">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#b3f243] animate-pulse" />
                  <span className="text-[#C5D9D0] text-xs font-semibold tracking-widest uppercase">Vehicle Yard Management</span>
                </div>

                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-white leading-[0.95] mb-6 tracking-tight">
                  Your yard.<br />
                  <span className="text-[#b3f243]">Under control.</span>
                </h1>

                <p className="text-[#72A68E] text-lg sm:text-xl leading-relaxed mb-4 max-w-lg">
                  Fleet tracking, MOT compliance, service bookings, stock and invoicing - all in one place, built for bodyshops and automotive yards.
                </p>

                <div className="flex items-center gap-2 mb-10 px-3 py-2 rounded-xl border border-[#b3f243]/20 bg-[#b3f243]/5 max-w-fit">
                  <Sparkles className="w-4 h-4 text-[#b3f243]" />
                  <span className="text-[#b3f243] text-sm font-semibold">Zao AI built in - run your yard by just talking to it</span>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Link href="/register" className="w-full sm:w-auto">
                    <Button size="lg" className="w-full sm:w-auto bg-[#b3f243] hover:bg-[#c8f96a] text-[#012619] font-black px-8 shadow-xl shadow-[#b3f243]/25 text-base group">
                      Start Free - No Card
                      <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </Link>
                  <Link href="/login" className="w-full sm:w-auto">
                    <Button variant="outline" size="lg" className="w-full sm:w-auto border-[#025940] text-[#C5D9D0] hover:bg-[#025940]/40 hover:text-white px-8 text-base">
                      Sign In
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Yard dashboard preview card */}
              <div className="relative">
                <div className="absolute -inset-8 rounded-3xl opacity-15 blur-3xl pointer-events-none"
                  style={{ background: 'radial-gradient(ellipse, #b3f243 0%, #72A68E 50%, transparent 70%)' }} />

                <div className="relative bg-[#0d1f17]/90 border border-[#025940]/70 rounded-2xl overflow-hidden shadow-2xl shadow-black/70 backdrop-blur-sm">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#025940]/50 bg-[#012619]/60">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                        <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                        <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                      </div>
                      <span className="text-[#72A68E] text-xs font-medium">Yard Dashboard - Main Branch</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#b3f243] animate-pulse" />
                      <span className="text-[#b3f243] text-[10px] font-semibold">LIVE</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-px bg-[#025940]/20 border-b border-[#025940]/40">
                    {[
                      { val: '42', label: 'In Yard', color: 'text-white' },
                      { val: '27', label: 'Ready', color: 'text-[#4ade80]' },
                      { val: '8', label: 'Attention', color: 'text-[#f87171]' },
                      { val: '3', label: 'MOT Due', color: 'text-[#fbbf24]' },
                    ].map((s, i) => (
                      <div key={i} className="bg-[#012619]/80 px-2 py-3 text-center">
                        <div className={`text-xl font-black ${s.color}`}>{s.val}</div>
                        <div className="text-[#72A68E] text-[9px] font-medium mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="p-3 grid grid-cols-3 gap-2">
                    {[
                      { reg: 'HN74 ABC', status: 'Ready', sc: 'text-[#4ade80]', sb: 'bg-[#4ade80]/10 border-[#4ade80]/20', vehicle: 'Ford Transit', bl: 'border-l-[#4ade80]' },
                      { reg: 'BD24 XYZ', status: 'Pending', sc: 'text-[#fbbf24]', sb: 'bg-[#fbbf24]/10 border-[#fbbf24]/20', vehicle: 'Mercedes Sprinter', bl: 'border-l-[#fbbf24]' },
                      { reg: 'LM23 DEF', status: 'Repairs', sc: 'text-[#f97316]', sb: 'bg-[#f97316]/10 border-[#f97316]/20', vehicle: 'Iveco Daily', bl: 'border-l-[#f97316]' },
                      { reg: 'YK69 ABC', status: 'Ready', sc: 'text-[#4ade80]', sb: 'bg-[#4ade80]/10 border-[#4ade80]/20', vehicle: 'VW Crafter', bl: 'border-l-[#4ade80]' },
                      { reg: 'FG21 RST', status: 'Non-Start', sc: 'text-[#f87171]', sb: 'bg-[#f87171]/10 border-[#f87171]/20', vehicle: 'Peugeot Boxer', bl: 'border-l-[#f87171]' },
                      { reg: 'MN70 XYZ', status: 'Ready', sc: 'text-[#4ade80]', sb: 'bg-[#4ade80]/10 border-[#4ade80]/20', vehicle: 'Nissan NV400', bl: 'border-l-[#4ade80]' },
                    ].map((v, i) => (
                      <div key={i} className={`bg-[#012619]/80 border border-[#025940]/40 border-l-2 ${v.bl} rounded-xl p-2.5 cursor-pointer hover:border-[#025940] transition-colors`}>
                        <div className="font-mono text-[11px] font-black bg-[#fbbf24]/15 text-[#fbbf24] px-1.5 py-0.5 rounded text-center mb-2">{v.reg}</div>
                        <div className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${v.sb} ${v.sc} text-center mb-1`}>{v.status}</div>
                        <div className="text-[#72A68E] text-[8px] text-center truncate">{v.vehicle}</div>
                      </div>
                    ))}
                  </div>

                  <div className="px-3 pb-3">
                    <div className="flex items-center gap-2 bg-[#025940]/15 border border-[#b3f243]/20 rounded-xl px-3 py-2.5">
                      <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-[#b3f243] to-[#72A68E] flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-3 h-3 text-[#012619]" />
                      </div>
                      <span className="text-[#72A68E]/70 text-xs flex-1">Ask Zao - "Mark HN74 MOT done…"</span>
                      <Mic className="w-3.5 h-3.5 text-[#b3f243]/50" />
                    </div>
                  </div>
                </div>

                <div className="absolute -top-4 -right-4 bg-[#012619] border border-[#fbbf24]/40 rounded-xl px-3 py-2 shadow-xl shadow-black/50 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#fbbf24]" />
                  <div>
                    <div className="text-white text-xs font-bold">3 MOTs due</div>
                    <div className="text-[#fbbf24] text-[9px]">This week</div>
                  </div>
                </div>

                <div className="absolute -bottom-4 -left-4 bg-[#012619] border border-[#72A68E]/40 rounded-xl px-3 py-2 shadow-xl shadow-black/50 flex items-center gap-2">
                  <Package className="w-3.5 h-3.5 text-[#72A68E]" />
                  <div>
                    <div className="text-white text-xs font-bold">Stock tracked</div>
                    <div className="text-[#72A68E] text-[9px]">148 parts</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 flex justify-center pb-8 animate-bounce">
            <div className="w-6 h-10 rounded-full border-2 border-[#025940] flex items-start justify-center pt-2">
              <div className="w-1 h-2 rounded-full bg-[#72A68E]" />
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════
            ZAO - Big hero section, front and centre
        ══════════════════════════════════════════════════════ */}
        <section className="relative z-10 py-20 sm:py-28 overflow-hidden">
          {/* Big background text */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
            <span className="text-[#b3f243]/[0.03] font-black leading-none"
              style={{ fontSize: 'clamp(120px, 25vw, 320px)' }}>ZAO</span>
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">

            {/* Section header - centred, oversized */}
            <div className="text-center mb-14">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#b3f243]/30 bg-[#b3f243]/8 mb-6">
                <Sparkles className="w-4 h-4 text-[#b3f243]" />
                <span className="text-[#b3f243] text-sm font-bold tracking-widest uppercase">Zao - AI Fleet Assistant</span>
                <Sparkles className="w-4 h-4 text-[#b3f243]" />
              </div>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-5 leading-[0.95] tracking-tight">
                Just talk to your yard.<br />
                <span className="text-[#b3f243]">Zao handles the rest.</span>
              </h2>
              <p className="text-[#72A68E] text-xl max-w-2xl mx-auto leading-relaxed">
                Type it or say it - Zao understands plain English and gets it done. No forms. No clicking around. Just your yard, on command.
              </p>
            </div>

            {/* Big two-column layout */}
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">

              {/* Left: live chat demo - large */}
              <div className="relative">
                <div className="absolute -inset-6 rounded-3xl opacity-25 blur-3xl pointer-events-none"
                  style={{ background: 'radial-gradient(ellipse, #b3f243 0%, transparent 65%)' }} />

                <div className="relative bg-[#011a10] border-2 border-[#b3f243]/20 rounded-2xl overflow-hidden shadow-2xl shadow-black/70">
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-[#025940]/60"
                    style={{ background: 'linear-gradient(135deg, #012619 0%, #011a10 100%)' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#b3f243] to-[#72A68E] flex items-center justify-center shadow-lg shadow-[#b3f243]/30 flex-shrink-0">
                        <Sparkles className="w-5 h-5 text-[#012619]" />
                      </div>
                      <div>
                        <div className="text-white font-black text-base">Zao</div>
                        <div className="text-[#72A68E] text-xs flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#b3f243] inline-block animate-pulse" />
                          AI Fleet Assistant - always on
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-[#025940]/30 rounded-lg px-2.5 py-1.5">
                      <Mic className="w-4 h-4 text-[#72A68E]" />
                      <span className="text-[#72A68E] text-xs">Voice</span>
                      <div className="w-px h-4 bg-[#025940]" />
                      <MessageSquare className="w-4 h-4 text-[#72A68E]" />
                      <span className="text-[#72A68E] text-xs">Text</span>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="px-5 py-6 space-y-5 min-h-[320px]">
                    {/* Zao greeting */}
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-xl bg-[#025940]/60 flex items-center justify-center flex-shrink-0 mt-0.5 border border-[#025940]">
                        <Sparkles className="w-4 h-4 text-[#b3f243]" />
                      </div>
                      <div className="bg-[#025940]/25 border border-[#025940]/50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-[#C5D9D0] max-w-sm leading-relaxed">
                        Morning. 3 MOTs due this week, 2 vehicles at external garages. What do you need?
                      </div>
                    </div>

                    {/* User typing */}
                    <div className="flex gap-3 justify-end">
                      <div className="bg-[#b3f243]/12 border border-[#b3f243]/25 rounded-2xl rounded-tr-sm px-4 py-3 text-sm text-[#b3f243] max-w-sm font-medium leading-relaxed">
                        {displayText}
                        {isTyping && (
                          <span className="inline-block w-0.5 h-4 bg-[#b3f243] ml-0.5 animate-pulse align-middle" />
                        )}
                      </div>
                      <div className="w-8 h-8 rounded-xl bg-[#025940]/40 border border-[#025940] flex items-center justify-center flex-shrink-0 mt-0.5 text-xs text-[#72A68E] font-black">U</div>
                    </div>

                    {/* Zao reply */}
                    {showReply && (
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-xl bg-[#025940]/60 flex items-center justify-center flex-shrink-0 mt-0.5 border border-[#025940]">
                          <Sparkles className="w-4 h-4 text-[#b3f243]" />
                        </div>
                        <div className="bg-[#025940]/25 border border-[#025940]/50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-[#C5D9D0] max-w-sm leading-relaxed">
                          {displayReply}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Input bar */}
                  <div className="px-5 pb-5">
                    <div className="flex items-center gap-3 bg-[#025940]/15 border border-[#b3f243]/15 rounded-xl px-4 py-3.5 hover:border-[#b3f243]/30 transition-colors">
                      <span className="text-[#72A68E]/50 text-sm flex-1">Ask Zao anything about your fleet…</span>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[#025940]/50 flex items-center justify-center hover:bg-[#025940] transition-colors cursor-pointer">
                          <Mic className="w-4 h-4 text-[#72A68E]" />
                        </div>
                        <div className="w-8 h-8 rounded-lg bg-[#b3f243]/15 flex items-center justify-center hover:bg-[#b3f243]/30 transition-colors cursor-pointer">
                          <ArrowRight className="w-4 h-4 text-[#b3f243]" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: capabilities grid */}
              <div className="space-y-4">
                <p className="text-[#72A68E] text-xs font-semibold uppercase tracking-widest mb-6">What you can ask Zao</p>

                {[
                  {
                    icon: <Truck className="w-5 h-5" />,
                    title: 'Vehicle Actions',
                    color: '#b3f243',
                    examples: ['"HN74 out to bodyshop"', '"Return BD24 from Joe\'s"', '"Set YK69 on hire"'],
                    desc: 'Check vehicles in and out, move to garages, update status - all by just saying it.',
                  },
                  {
                    icon: <CheckCircle className="w-5 h-5" />,
                    title: 'Compliance & MOT',
                    color: '#4ade80',
                    examples: ['"Mark HN74 MOT done today"', '"Any MOTs due this week?"', '"Update BD24 insurance"'],
                    desc: 'Stay on top of MOTs and insurance without digging through spreadsheets.',
                  },
                  {
                    icon: <Calendar className="w-5 h-5" />,
                    title: 'Service Bookings',
                    color: '#72A68E',
                    examples: ['"Book HN74 for tyres Friday"', '"What\'s on tomorrow?"', '"Cancel 10am booking"'],
                    desc: 'Book services, pick garages, pick time slots - Zao handles the back and forth.',
                  },
                  {
                    icon: <Mic className="w-5 h-5" />,
                    title: 'Voice Commands',
                    color: '#b3f243',
                    examples: ['Speak UK reg plates aloud', 'Phonetic alphabet support', '"DAMAGE: front bumper crack"'],
                    desc: 'Built-in speech recognition that understands UK registrations and damage notes.',
                  },
                ].map((card, i) => (
                  <div key={i} className="flex gap-4 bg-[#011a10] border border-[#025940]/50 rounded-xl p-4 hover:border-[#025940] transition-all duration-200 hover:-translate-y-0.5 group">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 transition-transform group-hover:scale-110"
                      style={{ background: `${card.color}15`, border: `1px solid ${card.color}25`, color: card.color }}>
                      {card.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-bold text-sm mb-1">{card.title}</div>
                      <p className="text-[#72A68E] text-xs mb-2 leading-relaxed">{card.desc}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {card.examples.map((ex, j) => (
                          <span key={j} className="text-[9px] font-mono px-2 py-0.5 rounded-md border text-[#C5D9D0]/70"
                            style={{ background: `${card.color}08`, borderColor: `${card.color}20` }}>
                            {ex}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Problem strip */}
        <div className="relative z-10 border-y border-[#025940]/25 bg-[#011a10]/60 backdrop-blur-sm py-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap justify-center gap-x-10 gap-y-3">
              {[
                { icon: <AlertTriangle className="w-3.5 h-3.5" />, label: 'MOT expiry chaos', color: '#fbbf24' },
                { icon: <Shield className="w-3.5 h-3.5" />, label: 'Insurance gaps', color: '#f87171' },
                { icon: <Truck className="w-3.5 h-3.5" />, label: 'Vehicle whereabouts', color: '#72A68E' },
                { icon: <Calendar className="w-3.5 h-3.5" />, label: 'Missed bookings', color: '#b3f243' },
                { icon: <Package className="w-3.5 h-3.5" />, label: 'Stock visibility', color: '#34d399' },
                { icon: <FileText className="w-3.5 h-3.5" />, label: 'Invoice admin', color: '#fb923c' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-[#C5D9D0]/50">
                  <span style={{ color: item.color }}>{item.icon}</span>
                  <span className="text-xs line-through">{item.label}</span>
                  <CheckCircle className="w-3 h-3 text-[#b3f243]" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            FEATURE SECTIONS
        ══════════════════════════════════════════════════════ */}
        <div className="relative z-10">

          {/* 01 - Yard View */}
          <div className="section-row py-20 sm:py-28">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-[#b3f243]/30 font-black text-6xl leading-none select-none">01</span>
                    <div className="w-10 h-px bg-[#025940]" />
                    <span className="text-[#72A68E] text-xs font-semibold uppercase tracking-widest">Real-Time Yard View</span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-black text-white mb-5 leading-tight">
                    Every vehicle.<br />Every status.<br /><span className="text-[#C5D9D0]">Instantly visible.</span>
                  </h2>
                  <p className="text-[#72A68E] text-lg mb-8 leading-relaxed">
                    A live grid of every vehicle in your yard. Colour-coded by status so you can see at a glance what's ready, what needs attention, and what's out at a garage.
                  </p>
                  <div className="space-y-3">
                    {['Colour-coded status per vehicle', 'Multi-branch support', 'Click any vehicle for full details', 'Bulk operations across the yard'].map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#b3f243] flex-shrink-0" />
                        <span className="text-[#C5D9D0] text-sm">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute -inset-4 bg-[#72A68E]/5 rounded-3xl blur-2xl" />
                  <div className="relative bg-white rounded-xl shadow-2xl p-3 sm:p-4 ring-1 ring-white/10">
                    <div className="grid grid-cols-2 gap-1.5 mb-3">
                      <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100">
                        <CardContent className="p-2">
                          <div className="flex items-center">
                            <Car className="w-3 h-3 text-blue-600 mr-1.5" />
                            <div><p className="text-[10px] font-medium text-blue-700 leading-none">Total in Yard</p><p className="text-xl font-black text-blue-900 leading-none mt-0.5">42</p></div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-green-200 bg-gradient-to-br from-green-50 to-green-100">
                        <CardContent className="p-2">
                          <div className="flex items-center">
                            <CheckCircle2 className="w-3 h-3 text-green-600 mr-1.5" />
                            <div><p className="text-[10px] font-medium text-green-700 leading-none">Ready</p><p className="text-xl font-black text-green-900 leading-none mt-0.5">27</p></div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {[
                        { reg: 'HN74ABC', status: 'Ready', icon: <CheckCircle className="w-2 h-2 mr-0.5 text-green-600" />, statusClass: 'bg-green-50 text-green-800', borderClass: 'border-l-green-500', vehicle: 'Ford Transit', size: 'Large' },
                        { reg: 'BD24XYZ', status: 'Pending', icon: <Clock className="w-2 h-2 mr-0.5 text-yellow-600" />, statusClass: 'bg-yellow-50 text-yellow-800', borderClass: 'border-l-yellow-500', vehicle: 'Mercedes Sprinter', size: 'XL' },
                        { reg: 'LM23DEF', status: 'Repairs', icon: <Wrench className="w-2 h-2 mr-0.5 text-orange-600" />, statusClass: 'bg-orange-50 text-orange-800', borderClass: 'border-l-orange-500', vehicle: 'Iveco Daily', size: 'Medium' },
                        { reg: 'YK69ABC', status: 'Ready', icon: <CheckCircle className="w-2 h-2 mr-0.5 text-green-600" />, statusClass: 'bg-green-50 text-green-800', borderClass: 'border-l-green-500', vehicle: 'VW Crafter', size: 'Large' },
                        { reg: 'FG21RST', status: 'Non-Starter', icon: <XCircle className="w-2 h-2 mr-0.5 text-red-600" />, statusClass: 'bg-red-50 text-red-800', borderClass: 'border-l-red-500', vehicle: 'Peugeot Boxer', size: 'Medium' },
                        { reg: 'MN70XYZ', status: 'Ready', icon: <CheckCircle className="w-2 h-2 mr-0.5 text-green-600" />, statusClass: 'bg-green-50 text-green-800', borderClass: 'border-l-green-500', vehicle: 'Nissan NV400', size: 'Large' },
                      ].map((v, i) => (
                        <Card key={i} className={`cursor-pointer border-l-2 ${v.borderClass} hover:scale-105 transition-transform duration-150`}>
                          <CardContent className="p-1.5 space-y-1.5">
                            <div className="text-center"><h3 className="font-bold text-gray-900 truncate" style={{ fontSize: '0.65rem' }}>{v.reg}</h3></div>
                            <div className={`inline-flex items-center px-1.5 py-0.5 rounded w-full justify-center ${v.statusClass}`}>
                              {v.icon}<span style={{ fontSize: '0.5rem' }}>{v.status}</span>
                            </div>
                            <p className="truncate text-gray-600 text-center" style={{ fontSize: '0.5rem' }}>{v.vehicle}</p>
                            <div className="text-center"><span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 w-full" style={{ fontSize: '0.45rem' }}>{v.size}</span></div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 02 - Service Bookings */}
          <div className="section-row py-20 sm:py-28 bg-[#011a10]/40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                <div className="order-1 relative">
                  <div className="absolute -inset-4 bg-[#b3f243]/3 rounded-3xl blur-2xl" />
                  <div className="relative bg-[#0d1f17] border border-[#025940]/60 rounded-2xl overflow-hidden shadow-2xl shadow-black/50">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[#025940]/40">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-[#72A68E]" />
                        <span className="text-white font-semibold text-sm">Service Bookings</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {['Today', 'Upcoming', 'All'].map((tab, i) => (
                          <span key={i} className={`px-2 py-0.5 rounded text-xs font-medium cursor-pointer ${i === 0 ? 'bg-[#025940] text-white' : 'text-[#72A68E]'}`}>{tab}</span>
                        ))}
                      </div>
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="text-[10px] font-semibold text-[#72A68E] uppercase tracking-wider mb-2">Today - 4 bookings</div>
                      {[
                        { reg: 'HN74 ABC', work: 'MOT + Full Service', time: '09:00', loc: 'In house', locIcon: <Clock className="w-3 h-3 text-[#72A68E]" />, status: 'Confirmed', ss: 'bg-[#b3f243]/15 text-[#b3f243] border-[#b3f243]/30', bar: 'bg-[#b3f243]' },
                        { reg: 'BD24 XYZ', work: 'Tyres x4', time: '10:30', loc: "Joe's Garage", locIcon: <ExternalLink className="w-3 h-3 text-purple-400" />, status: 'External', ss: 'bg-purple-500/15 text-purple-400 border-purple-500/30', bar: 'bg-purple-400' },
                        { reg: 'LM23 DEF', work: 'Brake inspection', time: '14:00', loc: 'In house', locIcon: <Clock className="w-3 h-3 text-[#72A68E]" />, status: 'Pending', ss: 'bg-[#72A68E]/15 text-[#72A68E] border-[#72A68E]/30', bar: 'bg-[#72A68E]' },
                      ].map((b, i) => (
                        <div key={i} className="flex items-center gap-3 p-2.5 bg-[#012619] rounded-xl border border-[#025940]/40 hover:border-[#025940] cursor-pointer transition-colors">
                          <div className={`w-1.5 h-8 rounded-full ${b.bar} flex-shrink-0`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold bg-[#fbbf24]/20 text-[#fbbf24] px-1.5 py-0.5 rounded">{b.reg}</span>
                              <span className="text-[#C5D9D0] text-xs">{b.work}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {b.locIcon}
                              <span className="text-[#72A68E] text-[10px]">{b.time} - {b.loc}</span>
                            </div>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${b.ss}`}>{b.status}</span>
                        </div>
                      ))}
                    </div>
                    <div className="px-3 pb-3">
                      <div className="text-[10px] font-semibold text-[#72A68E] uppercase tracking-wider mb-2">Upcoming</div>
                      <div className="flex gap-2">
                        {[
                          { date: 'Tue', reg: 'YK69', type: 'MOT', color: '#fbbf24' },
                          { date: 'Wed', reg: 'FG21', type: 'Service', color: '#72A68E' },
                          { date: 'Fri', reg: 'MN70', type: 'Tyres', color: '#b3f243' },
                        ].map((item, i) => (
                          <div key={i} className="flex-1 bg-[#012619] border border-[#025940]/40 rounded-lg p-2 text-center">
                            <div className="text-[#72A68E] text-[9px] font-semibold mb-1">{item.date}</div>
                            <div className="font-mono text-[9px] font-bold" style={{ color: item.color }}>{item.reg}</div>
                            <div className="text-[#72A68E] text-[9px]">{item.type}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="order-2">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-[#b3f243]/30 font-black text-6xl leading-none select-none">02</span>
                    <div className="w-10 h-px bg-[#025940]" />
                    <span className="text-[#72A68E] text-xs font-semibold uppercase tracking-widest">Service Management</span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-black text-white mb-5 leading-tight">
                    Bookings, services<br />and repairs -<br /><span className="text-[#C5D9D0]">all in one place.</span>
                  </h2>
                  <p className="text-[#72A68E] text-lg mb-8 leading-relaxed">
                    Schedule MOTs, services and repairs. Track in-house work or external garages. Know exactly where each vehicle is and what's being done.
                  </p>
                  <div className="space-y-3">
                    {['Today / Upcoming / Calendar views', 'External garage tracking', 'Book via the app or just tell Zao', 'Time slot management'].map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#b3f243] flex-shrink-0" />
                        <span className="text-[#C5D9D0] text-sm">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 03 - Stock */}
          <div className="section-row py-20 sm:py-28">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                <div className="order-2 lg:order-1">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-[#b3f243]/30 font-black text-6xl leading-none select-none">03</span>
                    <div className="w-10 h-px bg-[#025940]" />
                    <span className="text-[#72A68E] text-xs font-semibold uppercase tracking-widest">Stock Management</span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-black text-white mb-5 leading-tight">
                    Parts tracked.<br />Stock counted.<br /><span className="text-[#C5D9D0]">Nothing missed.</span>
                  </h2>
                  <p className="text-[#72A68E] text-lg mb-8 leading-relaxed">
                    Full parts and stock management. Scan barcodes to check items in and out. Smart category grouping keeps everything organised without the faff.
                  </p>
                  <div className="space-y-3">
                    {['28 smart part categories', 'Barcode scanner - physical or camera', 'Stock adjustment with reason codes', 'Parts used today tab', 'Order history tracking'].map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#b3f243] flex-shrink-0" />
                        <span className="text-[#C5D9D0] text-sm">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stock card illustration */}
                <div className="order-1 lg:order-2 relative">
                  <div className="absolute -inset-4 bg-[#34d399]/5 rounded-3xl blur-2xl" />
                  <div className="relative bg-[#0d1f17] border border-[#025940]/60 rounded-2xl overflow-hidden shadow-2xl shadow-black/50">
                    {/* Stock header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[#025940]/40">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-[#72A68E]" />
                        <span className="text-white font-semibold text-sm">Stock</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-[#025940]/40 rounded-lg">
                          <Hash className="w-3 h-3 text-[#72A68E]" />
                          <span className="text-[#72A68E] text-xs">148 parts</span>
                        </div>
                        <div className="w-7 h-7 bg-[#b3f243]/15 rounded-lg flex items-center justify-center cursor-pointer hover:bg-[#b3f243]/25 transition-colors">
                          <Plus className="w-3.5 h-3.5 text-[#b3f243]" />
                        </div>
                      </div>
                    </div>

                    {/* Search */}
                    <div className="px-3 pt-3 pb-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#72A68E]/60" />
                        <div className="w-full pl-8 pr-3 py-2 bg-[#012619] border border-[#025940]/50 rounded-lg text-[#72A68E]/50 text-xs">Search parts…</div>
                      </div>
                    </div>

                    {/* Category groups */}
                    <div className="px-3 pb-3 space-y-2">
                      {[
                        {
                          category: 'Tyres & Wheels',
                          count: 24,
                          color: '#b3f243',
                          parts: [
                            { name: '205/55R16 - Continental', qty: 8, status: 'good' },
                            { name: '225/45R17 - Michelin', qty: 3, status: 'low' },
                            { name: 'Winter tyre 195/65R15', qty: 12, status: 'good' },
                          ]
                        },
                        {
                          category: 'Brakes',
                          count: 18,
                          color: '#f87171',
                          parts: [
                            { name: 'Front brake pads - Transit', qty: 2, status: 'low' },
                            { name: 'Rear brake discs', qty: 6, status: 'good' },
                          ]
                        },
                        {
                          category: 'Fluids & Oils',
                          count: 31,
                          color: '#72A68E',
                          parts: [
                            { name: '5W-30 Engine Oil 5L', qty: 14, status: 'good' },
                            { name: 'Brake fluid DOT4', qty: 0, status: 'out' },
                          ]
                        },
                      ].map((group, gi) => (
                        <div key={gi} className="bg-[#012619] border border-[#025940]/40 rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 cursor-pointer">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ background: group.color }} />
                              <span className="text-white text-xs font-semibold">{group.category}</span>
                            </div>
                            <span className="text-[#72A68E] text-[10px]">{group.count} items</span>
                          </div>
                          {gi === 0 && (
                            <div className="border-t border-[#025940]/30">
                              {group.parts.map((part, pi) => (
                                <div key={pi} className="flex items-center justify-between px-3 py-2 border-b border-[#025940]/20 last:border-0 hover:bg-[#025940]/10 transition-colors">
                                  <span className="text-[#C5D9D0] text-[10px] flex-1 truncate mr-2">{part.name}</span>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-[10px] font-bold" style={{
                                      color: part.status === 'good' ? '#4ade80' : part.status === 'low' ? '#fbbf24' : '#f87171'
                                    }}>×{part.qty}</span>
                                    <span className={`text-[8px] px-1.5 py-0.5 rounded font-semibold ${
                                      part.status === 'good' ? 'bg-green-500/15 text-green-400' :
                                      part.status === 'low' ? 'bg-yellow-500/15 text-yellow-400' :
                                      'bg-red-500/15 text-red-400'
                                    }`}>{part.status === 'out' ? 'OUT' : part.status === 'low' ? 'LOW' : 'OK'}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Bottom strip */}
                    <div className="px-3 pb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[10px] text-[#72A68E]">
                        <div className="w-2 h-2 rounded-full bg-red-400" />3 out of stock
                        <div className="w-2 h-2 rounded-full bg-yellow-400 ml-1" />7 low
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-[#025940]/30 rounded-lg cursor-pointer hover:bg-[#025940]/50 transition-colors">
                        <Tag className="w-3 h-3 text-[#72A68E]" />
                        <span className="text-[#72A68E] text-[10px]">Parts used today</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 04 - Invoicing */}
          <div className="section-row py-20 sm:py-28 bg-[#011a10]/40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">

                {/* Invoice card */}
                <div className="order-1 relative">
                  <div className="absolute -inset-4 bg-[#fbbf24]/5 rounded-3xl blur-2xl" />
                  <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden max-w-sm mx-auto lg:max-w-none ring-1 ring-black/5">
                    {/* Invoice header */}
                    <div className="bg-gradient-to-r from-[#012619] to-[#025940] px-5 py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-white font-black text-base">INVOICE</div>
                          <div className="text-[#C5D9D0] text-xs">#INV-0042</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[#b3f243] font-black text-xl">£485.00</div>
                          <div className="text-[#C5D9D0] text-xs">inc. VAT</div>
                        </div>
                      </div>
                    </div>

                    <div className="p-4">
                      {/* From / To */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">From</div>
                          <div className="text-xs font-bold text-gray-900">Yardao Bodyshop Ltd</div>
                          <div className="text-[10px] text-gray-500">Unit 4, Industrial Estate</div>
                          <div className="text-[10px] text-gray-500">London, E1 6RF</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">To</div>
                          <div className="text-xs font-bold text-gray-900">Fleet Direct Ltd</div>
                          <div className="text-[10px] text-gray-500">123 Business Park</div>
                          <div className="text-[10px] text-gray-500">Birmingham, B1 2XX</div>
                        </div>
                      </div>

                      {/* Vehicle ref */}
                      <div className="flex items-center gap-2 mb-3 px-2.5 py-1.5 bg-[#fbbf24]/10 rounded-lg border border-[#fbbf24]/20">
                        <span className="font-mono text-xs font-black text-[#fbbf24] bg-[#fbbf24]/20 px-2 py-0.5 rounded">HN74 ABC</span>
                        <span className="text-xs text-gray-600">Ford Transit - Full Service + MOT</span>
                      </div>

                      {/* Line items */}
                      <div className="space-y-1.5 mb-3">
                        {[
                          { desc: 'Labour - Full Service (2.5h)', qty: 1, unit: '£125.00', total: '£125.00' },
                          { desc: 'Labour - MOT Preparation (1h)', qty: 1, unit: '£50.00', total: '£50.00' },
                          { desc: 'Engine Oil 5W-30 5L', qty: 2, unit: '£18.50', total: '£37.00' },
                          { desc: 'Oil Filter', qty: 1, unit: '£12.00', total: '£12.00' },
                          { desc: 'Brake Pads - Front', qty: 1, unit: '£54.00', total: '£54.00' },
                        ].map((line, i) => (
                          <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] text-gray-800 font-medium truncate">{line.desc}</div>
                              <div className="text-[9px] text-gray-400">×{line.qty} @ {line.unit}</div>
                            </div>
                            <div className="text-xs font-bold text-gray-900 ml-3">{line.total}</div>
                          </div>
                        ))}
                      </div>

                      {/* Totals */}
                      <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                        <div className="flex justify-between text-xs text-gray-600">
                          <span>Subtotal</span><span className="font-semibold">£404.17</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-600">
                          <span>VAT (20%)</span><span className="font-semibold">£80.83</span>
                        </div>
                        <div className="flex justify-between text-sm font-black text-[#012619] border-t border-gray-200 pt-1.5 mt-1.5">
                          <span>Total</span><span>£485.00</span>
                        </div>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button className="flex-1 bg-[#012619] text-white py-2 rounded-xl text-xs font-bold hover:bg-[#025940] transition-colors">
                          Download PDF
                        </button>
                        <button className="flex-1 border border-[#025940] text-[#025940] py-2 rounded-xl text-xs font-bold hover:bg-[#025940]/10 transition-colors">
                          Send to Client
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="order-2">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-[#b3f243]/30 font-black text-6xl leading-none select-none">04</span>
                    <div className="w-10 h-px bg-[#025940]" />
                    <span className="text-[#72A68E] text-xs font-semibold uppercase tracking-widest">Invoicing</span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-black text-white mb-5 leading-tight">
                    Professional invoices.<br />Built right in.<br /><span className="text-[#C5D9D0]">Zero admin.</span>
                  </h2>
                  <p className="text-[#72A68E] text-lg mb-8 leading-relaxed">
                    Generate professional invoices directly from your service records. Add labour, parts, and notes. VAT calculated automatically. Download as PDF or send straight to the client.
                  </p>
                  <div className="space-y-3">
                    {['VAT at 20%, calculated automatically', 'Labour presets - tyres, service, MOT', 'Parts pulled from your stock', 'PDF download and client sending', 'Company details stored in settings'].map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#b3f243] flex-shrink-0" />
                        <span className="text-[#C5D9D0] text-sm">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 05 - Compliance */}
          <div className="section-row py-20 sm:py-28">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                <div className="order-2 lg:order-1">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-[#b3f243]/30 font-black text-6xl leading-none select-none">05</span>
                    <div className="w-10 h-px bg-[#025940]" />
                    <span className="text-[#72A68E] text-xs font-semibold uppercase tracking-widest">Compliance</span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-black text-white mb-5 leading-tight">
                    MOTs, insurance,<br />compliance -<br /><span className="text-[#C5D9D0]">never miss one.</span>
                  </h2>
                  <p className="text-[#72A68E] text-lg mb-8 leading-relaxed">
                    Visual MOT and insurance tracking across your whole fleet. 30-day warnings before anything expires. See what's compliant, what's at risk, and what needs action - at a glance.
                  </p>
                  <div className="space-y-3">
                    {['30-day MOT warnings', 'Insurance status per vehicle', 'Export compliance reports', 'Mark MOTs done instantly via Zao'].map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#b3f243] flex-shrink-0" />
                        <span className="text-[#C5D9D0] text-sm">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="order-1 lg:order-2 relative">
                  <div className="absolute -inset-4 bg-[#fbbf24]/5 rounded-3xl blur-2xl" />
                  <div className="relative bg-white rounded-xl shadow-xl p-4 sm:p-5 max-w-sm mx-auto lg:max-w-none ring-1 ring-black/5">
                    <h3 className="text-sm font-bold text-[#012619] mb-3">Fleet Compliance Overview</h3>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                        <CardContent className="p-2">
                          <div className="flex items-center">
                            <Truck className="w-3 h-3 text-blue-600 mr-1.5" />
                            <div><p className="text-[10px] font-medium text-blue-700 leading-none">Total</p><p className="text-lg font-bold text-blue-900 leading-none mt-0.5">87</p></div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
                        <CardContent className="p-2">
                          <div className="flex items-center">
                            <AlertTriangle className="w-3 h-3 text-amber-600 mr-1.5" />
                            <div><p className="text-[10px] font-medium text-amber-700 leading-none">MOT Due</p><p className="text-lg font-bold text-amber-900 leading-none mt-0.5">12</p></div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
                        <CardContent className="p-2">
                          <div className="flex items-center">
                            <Shield className="w-3 h-3 text-red-600 mr-1.5" />
                            <div><p className="text-[10px] font-medium text-red-700 leading-none">No Insurance</p><p className="text-lg font-bold text-red-900 leading-none mt-0.5">3</p></div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                    <div className="space-y-2">
                      {[
                        { reg: 'BD24XYZ', label: 'MOT Expired', border: 'border-red-500', bg: 'bg-red-50', text: 'text-red-600' },
                        { reg: 'HG71ABC', label: 'MOT in 5 days', border: 'border-amber-500', bg: 'bg-amber-50', text: 'text-amber-600' },
                        { reg: 'LM23DEF', label: 'Insurance Expired', border: 'border-amber-500', bg: 'bg-amber-50', text: 'text-amber-600' },
                      ].map((v, i) => (
                        <div key={i} className={`flex items-center justify-between p-2.5 ${v.bg} rounded-lg border-l-2 ${v.border}`}>
                          <span className="text-xs font-bold text-[#012619] font-mono">{v.reg}</span>
                          <span className={`text-xs ${v.text} font-medium`}>{v.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 06 - Deliveries & Defleet */}
          <div className="section-row py-20 sm:py-28 bg-[#011a10]/40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                <div className="order-2 lg:order-1">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-[#b3f243]/30 font-black text-6xl leading-none select-none">06</span>
                    <div className="w-10 h-px bg-[#025940]" />
                    <span className="text-[#72A68E] text-xs font-semibold uppercase tracking-widest">Logistics</span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-black text-white mb-5 leading-tight">
                    Deliveries in.<br />Defleets out.<br /><span className="text-[#C5D9D0]">All tracked.</span>
                  </h2>
                  <p className="text-[#72A68E] text-lg mb-8 leading-relaxed">
                    Track incoming deliveries and outgoing defleets on one calendar. Know what's arriving, what's leaving, and plan your yard space accordingly.
                  </p>
                  <div className="space-y-3">
                    {['Delivery supplier tracking', 'Defleet reason & destination', 'Calendar view of all movements', 'Mark complete when done'].map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#b3f243] flex-shrink-0" />
                        <span className="text-[#C5D9D0] text-sm">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="order-1 lg:order-2 relative">
                  <div className="absolute -inset-4 bg-[#34d399]/5 rounded-3xl blur-2xl" />
                  <div className="relative bg-white rounded-xl shadow-xl p-4 sm:p-5 max-w-sm mx-auto lg:max-w-none ring-1 ring-black/5">
                    <h3 className="text-sm font-semibold text-[#012619] mb-3">Deliveries & Defleet</h3>
                    <div className="flex gap-2 mb-3">
                      <div className="flex items-center px-2 py-1 bg-gradient-to-r from-[#72A68E] to-[#72A68E]/80 text-white rounded-lg">
                        <Truck className="w-3 h-3 mr-1" /><span className="text-xs font-semibold">5 Deliveries</span>
                      </div>
                      <div className="flex items-center px-2 py-1 bg-gradient-to-r from-red-100 to-red-50 text-red-800 rounded-lg">
                        <TruckIcon className="w-3 h-3 mr-1" /><span className="text-xs font-semibold">3 Defleets</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-xs mb-3">
                      {['S','M','T','W','T','F','S'].map((day, i) => (
                        <div key={`${day}-${i}`} className="text-center font-semibold text-gray-600 py-1">{day}</div>
                      ))}
                      {[1,2,3,4,5,6,7].map(date => {
                        const hasDelivery = [2, 5].includes(date)
                        const hasDefleet = [3, 6].includes(date)
                        const isToday = date === 4
                        return (
                          <div key={date} className={`p-2 text-center rounded cursor-pointer border ${isToday ? 'bg-blue-100 font-bold border-blue-500' : 'border-gray-200'} hover:bg-gray-50`}>
                            <div className="text-xs">{date}</div>
                            {(hasDelivery || hasDefleet) && (
                              <div className="flex justify-center mt-1 gap-0.5">
                                {hasDelivery && <div className="w-1 h-1 bg-green-500 rounded-full" />}
                                {hasDefleet && <div className="w-1 h-1 bg-red-500 rounded-full" />}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-gray-600 mb-1">Today</div>
                      <div className="p-2 bg-gradient-to-r from-[#72A68E]/20 to-[#72A68E]/10 rounded-lg border border-[#025940]">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Truck className="w-3 h-3 text-green-600" />
                            <div><span className="text-xs font-semibold text-gray-900">NEW TRANSIT</span><span className="text-xs text-gray-600 ml-1">Delivery</span></div>
                          </div>
                          <span className="text-xs text-gray-500">From: BCA</span>
                        </div>
                      </div>
                      <div className="p-2 bg-gradient-to-r from-red-100 to-red-50 rounded-lg border border-red-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TruckIcon className="w-3 h-3 text-red-600" />
                            <div><span className="text-xs font-semibold text-gray-900">YK69ABC</span><span className="text-xs text-gray-600 ml-1">Defleet</span></div>
                          </div>
                          <span className="text-xs text-gray-500">To: Auction</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            FINAL CTA
        ══════════════════════════════════════════════════════ */}
        <section className="relative z-10 border-t border-[#025940]/30 py-24 sm:py-32 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
            <span className="text-[#b3f243]/[0.025] font-black leading-none"
              style={{ fontSize: 'clamp(80px, 18vw, 240px)' }}>YARDAO</span>
          </div>
          <div className="max-w-3xl mx-auto px-4 text-center relative">
            <div className="relative inline-block mb-8">
              <div className="absolute inset-0 bg-[#b3f243]/25 rounded-3xl blur-2xl" />
              <img src="/logo-yardao.png" alt="Yardao" className="relative h-28 sm:h-40 w-auto object-contain" />
            </div>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-5 leading-tight tracking-tight">
              Your yard deserves<br />
              <span className="text-[#b3f243]">better tools.</span>
            </h2>
            <p className="text-[#72A68E] text-lg sm:text-xl mb-10 max-w-xl mx-auto leading-relaxed">
              No credit card. No setup fees. No faff. Get started in minutes.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link href="/register">
                <Button size="lg"
                  className="w-full sm:w-auto bg-[#b3f243] hover:bg-[#c8f96a] text-[#012619] font-black px-10 py-6 text-lg shadow-2xl shadow-[#b3f243]/30 group">
                  Start Free Now
                  <ArrowRight className="ml-3 h-6 w-6 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="lg"
                  className="w-full sm:w-auto border-[#025940] text-[#C5D9D0] hover:bg-[#025940]/40 hover:text-white px-10 py-6 text-lg">
                  Already have an account
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <LegalFooter variant="dark" className="mt-0" />

        <style jsx>{`
          @keyframes driveRight {
            0% { left: -200px; }
            100% { left: calc(100% + 200px); }
          }
          .fade-up {
            animation: fadeUp 0.9s ease both;
          }
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(28px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .section-row {
            border-top: 1px solid rgba(2, 89, 64, 0.15);
          }
        `}</style>
      </div>
    )
  }

  return <AuthenticatedHome user={user} />
}

// ─────────────────────────────────────────────────────────────────────────────
function AuthenticatedHome({ user }: { user: any }) {
  const [snapshot, setSnapshot] = useState<{
    total: number; ready: number; motDueSoon: number; needsAttention: number
  } | null>(null)
  const [snapshotLoading, setSnapshotLoading] = useState(true)
  const t = useT()

  useEffect(() => {
    let unsubYard: (() => void) | null = null
    let unsubFleet: (() => void) | null = null

    const load = async () => {
      if (!user) return
      try {
        const { userProfileService } = await import('@/lib/firestore')

        const userProfile = await userProfileService.getProfile(user.uid)
        if (!userProfile?.organizationId) return
        const orgId = userProfile.organizationId

        const today = new Date()
        const thirtyDaysFromNow = new Date()
        thirtyDaysFromNow.setDate(today.getDate() + 30)
        const thirtyDaysStr = thirtyDaysFromNow.toISOString().split('T')[0]
        const todayStr = today.toISOString().split('T')[0]

        let yardVehicles: any[] = []
        let fleetVehicles: any[] = []

        const updateSnapshot = () => {
          const total = yardVehicles.length
          const ready = yardVehicles.filter(v => v.status === 'Ready').length
          const notReady = yardVehicles.filter(v =>
            v.status === 'Repairs needed' || v.status === 'Non-Starter'
          ).length
          const motDueSoon = fleetVehicles.filter(v => {
            if (!v.motExpiry || v.currentStatus === 'defleeted' || v.isDefleeted) return false
            return v.motExpiry >= todayStr && v.motExpiry <= thirtyDaysStr
          }).length
          setSnapshot({ total, ready, motDueSoon, needsAttention: notReady })
          setSnapshotLoading(false)
        }

        // Initial fetch + re-fetch on any change to this org's yard vehicles.
        const refreshYard = async () => {
          const { data, error } = await supabase
            .from('checked_in_vehicles')
            .select('*')
            .eq('organization_id', orgId)
          if (error) throw error
          yardVehicles = toCamelList<any>(data)
          updateSnapshot()
        }

        // Initial fetch + re-fetch on any change to this org's fleet vehicles.
        const refreshFleet = async () => {
          const { data, error } = await supabase
            .from('vehicles')
            .select('*')
            .eq('organization_id', orgId)
          if (error) throw error
          fleetVehicles = toCamelList<any>(data)
            .filter((v: any) => v.currentStatus !== 'defleeted' && !v.isDefleeted)
          updateSnapshot()
        }

        await Promise.all([refreshYard(), refreshFleet()])

        const yardChannel = supabase
          .channel(`checked_in_vehicles:${orgId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'checked_in_vehicles', filter: `organization_id=eq.${orgId}` },
            () => { refreshYard() },
          )
          .subscribe()
        unsubYard = () => { supabase.removeChannel(yardChannel) }

        const fleetChannel = supabase
          .channel(`vehicles:${orgId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'vehicles', filter: `organization_id=eq.${orgId}` },
            () => { refreshFleet() },
          )
          .subscribe()
        unsubFleet = () => { supabase.removeChannel(fleetChannel) }
      } catch (e) {
        logger.error('Snapshot load error:', e)
        setSnapshotLoading(false)
      }
    }

    load()
    return () => { unsubYard?.(); unsubFleet?.() }
  }, [user])

  return (
    <div className="min-h-screen bg-[#f8faf9]">
      <nav className="bg-[#012619] border-b-2 border-[#025940]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link href="/dashboard" className="flex items-center">
              <img src="/logo-yardao.png" alt="Yardao" className="h-14 sm:h-16 w-auto object-contain" />
            </Link>
            <div className="flex items-center">
              <span className="text-[#C5D9D0] mr-4 hidden sm:block text-sm">{user.email}</span>
              <Link href="/dashboard">
                <Button size="sm" className="bg-[#025940] hover:bg-[#72A68E] text-white">Dashboard</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-10 sm:py-16">
        <div className="text-center mb-10 sm:mb-12">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#012619] mb-3">{t('home.welcomeBack')}</h1>
          <p className="text-base sm:text-lg text-[#025940] mb-8">{t('home.yardWaiting')}</p>
          <Link href="/dashboard">
            <Button size="lg" className="bg-[#025940] hover:bg-[#012619] text-white px-8 sm:px-12 py-4 sm:py-6 text-base sm:text-lg shadow-lg">
              {t('home.goToDashboard')}<ArrowRight className="ml-2 sm:ml-3 h-5 sm:h-6 w-5 sm:w-6" />
            </Button>
          </Link>
        </div>

        <div className="bg-[#012619] rounded-2xl p-5 sm:p-6 mb-10 sm:mb-12">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#72A68E] mb-4">Yard Snapshot</p>
          {snapshotLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="text-center">
                  <div className="h-10 w-16 bg-white/10 rounded-lg mx-auto mb-2 animate-pulse" />
                  <div className="h-3 w-20 bg-white/5 rounded mx-auto" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Link href="/dashboard" className="group">
                <div className="text-center">
                  <p className="text-3xl sm:text-4xl font-black text-white group-hover:text-[#b3f243] transition-colors">{snapshot?.total ?? 0}</p>
                  <p className="text-xs text-[#72A68E] mt-1">Vehicles in Yard</p>
                </div>
              </Link>
              <Link href="/dashboard" className="group">
                <div className="text-center">
                  <p className="text-3xl sm:text-4xl font-black text-[#4ade80] group-hover:text-[#b3f243] transition-colors">{snapshot?.ready ?? 0}</p>
                  <p className="text-xs text-[#72A68E] mt-1">Ready</p>
                </div>
              </Link>
              <Link href="/fleet" className="group">
                <div className="text-center">
                  <p className="text-3xl sm:text-4xl font-black text-[#fbbf24] group-hover:text-[#b3f243] transition-colors">{snapshot?.motDueSoon ?? 0}</p>
                  <p className="text-xs text-[#72A68E] mt-1">MOT Due Soon</p>
                </div>
              </Link>
              <Link href="/dashboard" className="group">
                <div className="text-center">
                  <p className="text-3xl sm:text-4xl font-black text-[#f87171] group-hover:text-[#b3f243] transition-colors">{snapshot?.needsAttention ?? 0}</p>
                  <p className="text-xs text-[#72A68E] mt-1">Needs Attention</p>
                </div>
              </Link>
            </div>
          )}
        </div>

        <p className="text-xs font-semibold uppercase tracking-widest text-[#72A68E] text-center mb-5">Quick Access</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {[
            { href: '/dashboard', icon: <Car className="w-5 h-5" />, label: 'Check-in Vehicle', sub: 'Add to yard' },
            { href: '/fleet', icon: <Building className="w-5 h-5" />, label: 'View Fleet', sub: 'All vehicles' },
            { href: '/service-bookings', icon: <Calendar className="w-5 h-5" />, label: 'Service Schedule', sub: 'Bookings & MOTs' },
            { href: '/stock', icon: <Package className="w-5 h-5" />, label: 'Stock', sub: 'Parts & items' },
            { href: '/deliveries-defleet', icon: <Truck className="w-5 h-5" />, label: 'Deliveries', sub: '& Defleet' },
            { href: '/settings', icon: <Settings className="w-5 h-5" />, label: 'Settings', sub: 'Account & org' },
          ].map((item, i) => (
            <Link key={i} href={item.href} className="block group">
              <div className="h-full bg-white hover:bg-[#025940] border border-[#C5D9D0] hover:border-[#025940] p-5 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md text-center flex flex-col items-center justify-center gap-3 min-h-[120px]">
                <div className="w-10 h-10 bg-[#C5D9D0]/50 group-hover:bg-white/20 rounded-lg flex items-center justify-center transition-colors text-[#025940] group-hover:text-white">
                  {item.icon}
                </div>
                <div>
                  <p className="text-[#012619] group-hover:text-white font-semibold text-sm transition-colors">{item.label}</p>
                  <p className="text-[#72A68E] group-hover:text-[#C5D9D0] text-xs mt-0.5 transition-colors">{item.sub}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}