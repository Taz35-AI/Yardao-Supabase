// src/app/bodyshop/page.tsx
// ✅ PRESERVED: Every feature, function, hook call, prop, and component from original
// ✨ MOBILE: Stage filter tabs, card list with quick actions, bottom sheet detail, pipeline queue
// 🖥️ DESKTOP: Original layout fully preserved (kanban + side panel) via lg: breakpoints
// 🐛 FIX: Vehicle dropdown uses onMouseDown to prevent double-click selection bug
// 👥 NEW: Staff Activity button + modal wired into page header
// 🔧 NEW: Damage descriptions added at intake, estimated hours set by prep technician

'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Plus,
  Wrench,
  X,
  Car,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  CheckCircle2,
  Trash2,
  Users,
} from 'lucide-react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Navigation } from '@/components/Navigation'
import { useBodyshopJobs } from '@/hooks/useBodyshopJobs'
import { useMechanics } from '@/hooks/useMechanics'
import { JobDetailPanel } from '@/components/bodyshop/JobDetailPanel'
import { BodyshopKanban } from '@/components/bodyshop/BodyshopKanban'
import { vehicleService, userProfileService } from '@/lib/firestore'
import { useAuth } from '@/contexts/AuthContext'
import { useT, useLang } from '@/lib/i18n'
import type { BodyshopJob, BodyshopStage, DamageItem } from '@/types/bodyshop'
import type { Vehicle } from '@/types'
import { StaffActivityModal } from '@/components/bodyshop/StaffActivityModal'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHours(h: number) {
  if (!h) return '0h'
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  if (hrs === 0) return `${mins}m`
  if (mins === 0) return `${hrs}h`
  return `${hrs}h ${mins}m`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const STAGE_CONFIG: Record<BodyshopStage, { label: string; color: string; bgColor: string }> = {
  queued: { label: 'Queued', color: '#6b7280', bgColor: '#f3f4f6' },
  prep: { label: 'Prep', color: '#f59e0b', bgColor: '#fef3c7' },
  paint: { label: 'Paint', color: '#3b82f6', bgColor: '#dbeafe' },
  finishing: { label: 'Finishing', color: '#10b981', bgColor: '#d1fae5' },
}

const STAGES_ORDER: BodyshopStage[] = ['queued', 'prep', 'paint', 'finishing']

function getNextStage(stage: BodyshopStage): BodyshopStage | null {
  const idx = STAGES_ORDER.indexOf(stage)
  return idx < STAGES_ORDER.length - 1 ? STAGES_ORDER[idx + 1] : null
}

function getPrevStage(stage: BodyshopStage): BodyshopStage | null {
  const idx = STAGES_ORDER.indexOf(stage)
  return idx > 0 ? STAGES_ORDER[idx - 1] : null
}

// ─── Comprehensive bodyshop damage options ────────────────────────────────────

const DAMAGE_OPTIONS = [
  // Front end
  'Front bumper dent',
  'Front bumper scuff',
  'Front bumper crack',
  'Front bumper respray',
  'Front bumper replacement',
  'Bonnet dent',
  'Bonnet scratch',
  'Bonnet respray',
  'Bonnet replacement',
  'Front grille damage',
  'Headlight lens crack',
  'Headlight unit replacement',
  'Front fog light damage',
  // NSF — Near Side Front (passenger front, UK)
  'NSF wing dent',
  'NSF wing scratch',
  'NSF wing respray',
  'NSF wing replacement',
  'NSF door dent',
  'NSF door scratch',
  'NSF door respray',
  'NSF door replacement',
  'NSF door glass',
  'NSF sill dent',
  'NSF sill scuff',
  'NSF sill respray',
  'NSF mirror damage',
  'NSF mirror glass',
  'NSF mirror replacement',
  'NSF wheel arch damage',
  'NSF tyre sidewall damage',
  // OSF — Off Side Front (driver front, UK)
  'OSF wing dent',
  'OSF wing scratch',
  'OSF wing respray',
  'OSF wing replacement',
  'OSF door dent',
  'OSF door scratch',
  'OSF door respray',
  'OSF door replacement',
  'OSF door glass',
  'OSF sill dent',
  'OSF sill scuff',
  'OSF sill respray',
  'OSF mirror damage',
  'OSF mirror glass',
  'OSF mirror replacement',
  'OSF wheel arch damage',
  'OSF tyre sidewall damage',
  // NSR — Near Side Rear (passenger rear, UK)
  'NSR door dent',
  'NSR door scratch',
  'NSR door respray',
  'NSR door replacement',
  'NSR door glass',
  'NSR quarter panel dent',
  'NSR quarter panel scratch',
  'NSR quarter panel respray',
  'NSR sill dent',
  'NSR sill scuff',
  'NSR sill respray',
  'NSR wheel arch damage',
  'NSR tyre sidewall damage',
  // OSR — Off Side Rear (driver rear, UK)
  'OSR door dent',
  'OSR door scratch',
  'OSR door respray',
  'OSR door replacement',
  'OSR door glass',
  'OSR quarter panel dent',
  'OSR quarter panel scratch',
  'OSR quarter panel respray',
  'OSR sill dent',
  'OSR sill scuff',
  'OSR sill respray',
  'OSR wheel arch damage',
  'OSR tyre sidewall damage',
  // Rear end
  'Rear bumper dent',
  'Rear bumper scuff',
  'Rear bumper crack',
  'Rear bumper respray',
  'Rear bumper replacement',
  'Boot dent',
  'Boot scratch',
  'Boot respray',
  'Boot lid replacement',
  'Tailgate dent',
  'Tailgate scratch',
  'Tailgate respray',
  'Tailgate replacement',
  'Rear light cluster crack',
  'Rear light unit replacement',
  'Rear fog light damage',
  'Numberplate light damage',
  // Roof
  'Roof dent',
  'Roof scratch',
  'Roof respray',
  'Roof lining damage',
  'Panoramic roof crack',
  'Sunroof damage',
  // Underbody / Structural
  'Sill replacement NSF',
  'Sill replacement OSF',
  'Sill replacement NSR',
  'Sill replacement OSR',
  'Chassis damage',
  'Subframe damage',
  'Undertray damage',
  // Glass
  'Windscreen chip repair',
  'Windscreen replacement',
  'Rear screen replacement',
  'Side window replacement NSF',
  'Side window replacement OSF',
  'Side window replacement NSR',
  'Side window replacement OSR',
  // Wheels & Tyres
  'Alloy wheel refurb NSF',
  'Alloy wheel refurb OSF',
  'Alloy wheel refurb NSR',
  'Alloy wheel refurb OSR',
  'Tyre replacement NSF',
  'Tyre replacement OSF',
  'Tyre replacement NSR',
  'Tyre replacement OSR',
  // Interior
  'Interior trim damage',
  'Dashboard crack',
  'Seat damage',
  'Headlining stain',
  'Carpet damage',
  // General
  'PDR (Paintless Dent Repair)',
  'Full respray',
  'Stone chip repair',
  'Keying damage',
  'Hail damage',
  'Flood damage assessment',
  'Accident damage assessment',
  'Custom / other',
]

const DAMAGE_OPTIONS_RO = [
  // Partea frontală
  'Adâncitură bară față',
  'Zgârietură bară față',
  'Fisură bară față',
  'Revopsire bară față',
  'Înlocuire bară față',
  'Adâncitură capotă',
  'Zgârietură capotă',
  'Revopsire capotă',
  'Înlocuire capotă',
  'Deteriorare grilă față',
  'Fisură geam far',
  'Înlocuire ansamblu far',
  'Deteriorare proiector ceață față',
  // NSF — partea pasagerului față
  'Adâncitură aripă NSF',
  'Zgârietură aripă NSF',
  'Revopsire aripă NSF',
  'Înlocuire aripă NSF',
  'Adâncitură ușă NSF',
  'Zgârietură ușă NSF',
  'Revopsire ușă NSF',
  'Înlocuire ușă NSF',
  'Geam ușă NSF',
  'Adâncitură prag NSF',
  'Zgârietură prag NSF',
  'Revopsire prag NSF',
  'Deteriorare oglindă NSF',
  'Geam oglindă NSF',
  'Înlocuire oglindă NSF',
  'Deteriorare arc roată NSF',
  'Deteriorare flanc anvelopă NSF',
  // OSF — partea șoferului față
  'Adâncitură aripă OSF',
  'Zgârietură aripă OSF',
  'Revopsire aripă OSF',
  'Înlocuire aripă OSF',
  'Adâncitură ușă OSF',
  'Zgârietură ușă OSF',
  'Revopsire ușă OSF',
  'Înlocuire ușă OSF',
  'Geam ușă OSF',
  'Adâncitură prag OSF',
  'Zgârietură prag OSF',
  'Revopsire prag OSF',
  'Deteriorare oglindă OSF',
  'Geam oglindă OSF',
  'Înlocuire oglindă OSF',
  'Deteriorare arc roată OSF',
  'Deteriorare flanc anvelopă OSF',
  // NSR — partea pasagerului spate
  'Adâncitură ușă NSR',
  'Zgârietură ușă NSR',
  'Revopsire ușă NSR',
  'Înlocuire ușă NSR',
  'Geam ușă NSR',
  'Adâncitură aripă spate NSR',
  'Zgârietură aripă spate NSR',
  'Revopsire aripă spate NSR',
  'Adâncitură prag NSR',
  'Zgârietură prag NSR',
  'Revopsire prag NSR',
  'Deteriorare arc roată NSR',
  'Deteriorare flanc anvelopă NSR',
  // OSR — partea șoferului spate
  'Adâncitură ușă OSR',
  'Zgârietură ușă OSR',
  'Revopsire ușă OSR',
  'Înlocuire ușă OSR',
  'Geam ușă OSR',
  'Adâncitură aripă spate OSR',
  'Zgârietură aripă spate OSR',
  'Revopsire aripă spate OSR',
  'Adâncitură prag OSR',
  'Zgârietură prag OSR',
  'Revopsire prag OSR',
  'Deteriorare arc roată OSR',
  'Deteriorare flanc anvelopă OSR',
  // Partea din spate
  'Adâncitură bară spate',
  'Zgârietură bară spate',
  'Fisură bară spate',
  'Revopsire bară spate',
  'Înlocuire bară spate',
  'Adâncitură portbagaj',
  'Zgârietură portbagaj',
  'Revopsire portbagaj',
  'Înlocuire capac portbagaj',
  'Adâncitură hayon',
  'Zgârietură hayon',
  'Revopsire hayon',
  'Înlocuire hayon',
  'Fisură bloc stop spate',
  'Înlocuire ansamblu stop spate',
  'Deteriorare proiector ceață spate',
  'Deteriorare lampă plăcuță înmatriculare',
  // Plafon
  'Adâncitură plafon',
  'Zgârietură plafon',
  'Revopsire plafon',
  'Deteriorare căptușeală plafon',
  'Fisură plafon panoramic',
  'Deteriorare trapă',
  // Caroserie inferioară / Structural
  'Înlocuire prag NSF',
  'Înlocuire prag OSF',
  'Înlocuire prag NSR',
  'Înlocuire prag OSR',
  'Deteriorare șasiu',
  'Deteriorare cadru auxiliar',
  'Deteriorare scut motor',
  // Geamuri
  'Reparație ciobitură parbriz',
  'Înlocuire parbriz',
  'Înlocuire lunetă spate',
  'Înlocuire geam lateral NSF',
  'Înlocuire geam lateral OSF',
  'Înlocuire geam lateral NSR',
  'Înlocuire geam lateral OSR',
  // Jante și anvelope
  'Recondiționare jantă aliaj NSF',
  'Recondiționare jantă aliaj OSF',
  'Recondiționare jantă aliaj NSR',
  'Recondiționare jantă aliaj OSR',
  'Înlocuire anvelopă NSF',
  'Înlocuire anvelopă OSF',
  'Înlocuire anvelopă NSR',
  'Înlocuire anvelopă OSR',
  // Interior
  'Deteriorare ornament interior',
  'Fisură bord',
  'Deteriorare scaun',
  'Pată căptușeală plafon',
  'Deteriorare mochetă',
  // Generale
  'PDR (reparație adâncituri fără vopsire)',
  'Revopsire integrală',
  'Reparație ciobitură piatră',
  'Deteriorare prin zgâriere intenționată',
  'Deteriorare grindină',
  'Evaluare daune inundație',
  'Evaluare daune accident',
  'Personalizat / altele',
]

const DAMAGE_OPTIONS_BG = [
  // Предна част
  'Вдлъбнатина предна броня',
  'Ожулване предна броня',
  'Пукнатина предна броня',
  'Пребоядисване предна броня',
  'Смяна предна броня',
  'Вдлъбнатина преден капак',
  'Драскотина преден капак',
  'Пребоядисване преден капак',
  'Смяна преден капак',
  'Повреда предна решетка',
  'Пукнатина стъкло фар',
  'Смяна фар (комплект)',
  'Повреда преден халоген',
  // NSF — предна дясна (страна на пътника)
  'Вдлъбнатина калник NSF',
  'Драскотина калник NSF',
  'Пребоядисване калник NSF',
  'Смяна калник NSF',
  'Вдлъбнатина врата NSF',
  'Драскотина врата NSF',
  'Пребоядисване врата NSF',
  'Смяна врата NSF',
  'Стъкло врата NSF',
  'Вдлъбнатина праг NSF',
  'Ожулване праг NSF',
  'Пребоядисване праг NSF',
  'Повреда странично огледало NSF',
  'Стъкло странично огледало NSF',
  'Смяна странично огледало NSF',
  'Повреда калник на колелото NSF',
  'Повреда странична част на гумата NSF',
  // OSF — предна лява (страна на шофьора)
  'Вдлъбнатина калник OSF',
  'Драскотина калник OSF',
  'Пребоядисване калник OSF',
  'Смяна калник OSF',
  'Вдлъбнатина врата OSF',
  'Драскотина врата OSF',
  'Пребоядисване врата OSF',
  'Смяна врата OSF',
  'Стъкло врата OSF',
  'Вдлъбнатина праг OSF',
  'Ожулване праг OSF',
  'Пребоядисване праг OSF',
  'Повреда странично огледало OSF',
  'Стъкло странично огледало OSF',
  'Смяна странично огледало OSF',
  'Повреда калник на колелото OSF',
  'Повреда странична част на гумата OSF',
  // NSR — задна дясна (страна на пътника)
  'Вдлъбнатина врата NSR',
  'Драскотина врата NSR',
  'Пребоядисване врата NSR',
  'Смяна врата NSR',
  'Стъкло врата NSR',
  'Вдлъбнатина заден калник NSR',
  'Драскотина заден калник NSR',
  'Пребоядисване заден калник NSR',
  'Вдлъбнатина праг NSR',
  'Ожулване праг NSR',
  'Пребоядисване праг NSR',
  'Повреда калник на колелото NSR',
  'Повреда странична част на гумата NSR',
  // OSR — задна лява (страна на шофьора)
  'Вдлъбнатина врата OSR',
  'Драскотина врата OSR',
  'Пребоядисване врата OSR',
  'Смяна врата OSR',
  'Стъкло врата OSR',
  'Вдлъбнатина заден калник OSR',
  'Драскотина заден калник OSR',
  'Пребоядисване заден калник OSR',
  'Вдлъбнатина праг OSR',
  'Ожулване праг OSR',
  'Пребоядисване праг OSR',
  'Повреда калник на колелото OSR',
  'Повреда странична част на гумата OSR',
  // Задна част
  'Вдлъбнатина задна броня',
  'Ожулване задна броня',
  'Пукнатина задна броня',
  'Пребоядисване задна броня',
  'Смяна задна броня',
  'Вдлъбнатина заден капак (багажник)',
  'Драскотина заден капак (багажник)',
  'Пребоядисване заден капак (багажник)',
  'Смяна капак на багажника',
  'Вдлъбнатина заден капак',
  'Драскотина заден капак',
  'Пребоядисване заден капак',
  'Смяна заден капак',
  'Пукнатина заден стоп (блок)',
  'Смяна заден стоп (комплект)',
  'Повреда заден халоген за мъгла',
  'Повреда лампа регистрационна табела',
  // Таван
  'Вдлъбнатина таван',
  'Драскотина таван',
  'Пребоядисване таван',
  'Повреда тавана на купето (тапицерия)',
  'Пукнатина панорамен таван',
  'Повреда шибидах',
  // Долна част / Структурни
  'Смяна праг NSF',
  'Смяна праг OSF',
  'Смяна праг NSR',
  'Смяна праг OSR',
  'Повреда на шасито',
  'Повреда на спомагателната рама',
  'Повреда на кора под двигателя',
  // Стъкла
  'Ремонт на отчупване предно стъкло',
  'Смяна предно стъкло',
  'Смяна задно стъкло',
  'Смяна странично стъкло NSF',
  'Смяна странично стъкло OSF',
  'Смяна странично стъкло NSR',
  'Смяна странично стъкло OSR',
  // Джанти и гуми
  'Реставрация алуминиева джанта NSF',
  'Реставрация алуминиева джанта OSF',
  'Реставрация алуминиева джанта NSR',
  'Реставрация алуминиева джанта OSR',
  'Смяна гума NSF',
  'Смяна гума OSF',
  'Смяна гума NSR',
  'Смяна гума OSR',
  // Интериор
  'Повреда интериорна декорация',
  'Пукнатина табло',
  'Повреда седалка',
  'Петно по тавана на купето',
  'Повреда мокет',
  // Общи
  'PDR (изправяне на вдлъбнатини без боядисване)',
  'Цялостно пребоядисване',
  'Ремонт на удар от камък',
  'Повреда от надраскване (умишлено)',
  'Повреда от градушка',
  'Оценка на щети от наводнение',
  'Оценка на щети от ПТП',
  'Друго / по избор',
]

const DAMAGE_OPTIONS_PL = [
  // Przód
  'Wgniecenie zderzaka przedniego',
  'Otarcie zderzaka przedniego',
  'Pęknięcie zderzaka przedniego',
  'Lakierowanie zderzaka przedniego',
  'Wymiana zderzaka przedniego',
  'Wgniecenie maski',
  'Zarysowanie maski',
  'Lakierowanie maski',
  'Wymiana maski',
  'Uszkodzenie atrapy przedniej',
  'Pęknięcie klosza reflektora',
  'Wymiana reflektora (kompletny)',
  'Uszkodzenie przedniego światła przeciwmgłowego',
  // NSF — przód strona pasażera (UK)
  'Wgniecenie błotnika NSF',
  'Zarysowanie błotnika NSF',
  'Lakierowanie błotnika NSF',
  'Wymiana błotnika NSF',
  'Wgniecenie drzwi NSF',
  'Zarysowanie drzwi NSF',
  'Lakierowanie drzwi NSF',
  'Wymiana drzwi NSF',
  'Szyba drzwi NSF',
  'Wgniecenie progu NSF',
  'Otarcie progu NSF',
  'Lakierowanie progu NSF',
  'Uszkodzenie lusterka NSF',
  'Szkło lusterka NSF',
  'Wymiana lusterka NSF',
  'Uszkodzenie nadkola NSF',
  'Uszkodzenie boku opony NSF',
  // OSF — przód strona kierowcy (UK)
  'Wgniecenie błotnika OSF',
  'Zarysowanie błotnika OSF',
  'Lakierowanie błotnika OSF',
  'Wymiana błotnika OSF',
  'Wgniecenie drzwi OSF',
  'Zarysowanie drzwi OSF',
  'Lakierowanie drzwi OSF',
  'Wymiana drzwi OSF',
  'Szyba drzwi OSF',
  'Wgniecenie progu OSF',
  'Otarcie progu OSF',
  'Lakierowanie progu OSF',
  'Uszkodzenie lusterka OSF',
  'Szkło lusterka OSF',
  'Wymiana lusterka OSF',
  'Uszkodzenie nadkola OSF',
  'Uszkodzenie boku opony OSF',
  // NSR — tył strona pasażera (UK)
  'Wgniecenie drzwi NSR',
  'Zarysowanie drzwi NSR',
  'Lakierowanie drzwi NSR',
  'Wymiana drzwi NSR',
  'Szyba drzwi NSR',
  'Wgniecenie ćwiartki tylnej NSR',
  'Zarysowanie ćwiartki tylnej NSR',
  'Lakierowanie ćwiartki tylnej NSR',
  'Wgniecenie progu NSR',
  'Otarcie progu NSR',
  'Lakierowanie progu NSR',
  'Uszkodzenie nadkola NSR',
  'Uszkodzenie boku opony NSR',
  // OSR — tył strona kierowcy (UK)
  'Wgniecenie drzwi OSR',
  'Zarysowanie drzwi OSR',
  'Lakierowanie drzwi OSR',
  'Wymiana drzwi OSR',
  'Szyba drzwi OSR',
  'Wgniecenie ćwiartki tylnej OSR',
  'Zarysowanie ćwiartki tylnej OSR',
  'Lakierowanie ćwiartki tylnej OSR',
  'Wgniecenie progu OSR',
  'Otarcie progu OSR',
  'Lakierowanie progu OSR',
  'Uszkodzenie nadkola OSR',
  'Uszkodzenie boku opony OSR',
  // Tył
  'Wgniecenie zderzaka tylnego',
  'Otarcie zderzaka tylnego',
  'Pęknięcie zderzaka tylnego',
  'Lakierowanie zderzaka tylnego',
  'Wymiana zderzaka tylnego',
  'Wgniecenie klapy bagażnika',
  'Zarysowanie klapy bagażnika',
  'Lakierowanie klapy bagażnika',
  'Wymiana klapy bagażnika',
  'Wgniecenie tylnej klapy',
  'Zarysowanie tylnej klapy',
  'Lakierowanie tylnej klapy',
  'Wymiana tylnej klapy',
  'Pęknięcie lampy tylnej',
  'Wymiana lampy tylnej (kompletna)',
  'Uszkodzenie tylnego światła przeciwmgłowego',
  'Uszkodzenie oświetlenia tablicy rejestracyjnej',
  // Dach
  'Wgniecenie dachu',
  'Zarysowanie dachu',
  'Lakierowanie dachu',
  'Uszkodzenie podsufitki dachu',
  'Pęknięcie dachu panoramicznego',
  'Uszkodzenie szyberdachu',
  // Podwozie / Konstrukcja
  'Wymiana progu NSF',
  'Wymiana progu OSF',
  'Wymiana progu NSR',
  'Wymiana progu OSR',
  'Uszkodzenie ramy',
  'Uszkodzenie wózka pomocniczego',
  'Uszkodzenie osłony podwozia',
  // Szyby
  'Naprawa odprysku szyby czołowej',
  'Wymiana szyby czołowej',
  'Wymiana szyby tylnej',
  'Wymiana szyby bocznej NSF',
  'Wymiana szyby bocznej OSF',
  'Wymiana szyby bocznej NSR',
  'Wymiana szyby bocznej OSR',
  // Koła i opony
  'Renowacja felgi aluminiowej NSF',
  'Renowacja felgi aluminiowej OSF',
  'Renowacja felgi aluminiowej NSR',
  'Renowacja felgi aluminiowej OSR',
  'Wymiana opony NSF',
  'Wymiana opony OSF',
  'Wymiana opony NSR',
  'Wymiana opony OSR',
  // Wnętrze
  'Uszkodzenie tapicerki wnętrza',
  'Pęknięcie deski rozdzielczej',
  'Uszkodzenie fotela',
  'Plama na podsufitce',
  'Uszkodzenie wykładziny',
  // Ogólne
  'PDR (naprawa wgnieceń bez lakierowania)',
  'Pełne lakierowanie',
  'Naprawa odprysku od kamienia',
  'Uszkodzenie przez zarysowanie kluczem',
  'Uszkodzenie gradowe',
  'Ocena uszkodzeń powodziowych',
  'Ocena uszkodzeń powypadkowych',
  'Inne / niestandardowe',
]

// ─── Delete Confirmation Modal (PRESERVED) ────────────────────────────────────

function DeleteConfirmModal({
  job,
  onConfirm,
  onCancel,
}: {
  job: BodyshopJob
  onConfirm: () => void
  onCancel: () => void
}) {
  const t = useT()
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-[#012619]">{t('bodyshop.page.deleteJobTitle')}</h3>
            <p className="text-sm text-[#72A68E]">{job.vehicleRegistration}</p>
          </div>
        </div>
        <p className="text-sm text-[#72A68E] mb-6">
          {t('bodyshop.page.deleteJobBody')}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-[#025940]/20 rounded-xl text-sm font-semibold text-[#012619] hover:bg-[#f0f4f2] active:bg-[#e5ebe8] transition-colors"
          >
            {t('bodyshop.common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 bg-red-600 rounded-xl text-sm font-bold text-white hover:bg-red-700 active:bg-red-800 transition-colors"
          >
            {t('bodyshop.common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Completed Job Card (PRESERVED) ───────────────────────────────────────────

function CompletedJobCard({
  job,
  onClick,
  onDelete,
}: {
  job: BodyshopJob
  onClick: () => void
  onDelete: () => void
}) {
  const t = useT()
  return (
    <div className="bg-white rounded-xl border border-[#025940]/20 shadow-sm p-4 flex items-center gap-4">
      <button onClick={onClick} className="flex-1 text-left active:opacity-70 transition-opacity">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-black text-[#012619] tracking-wider">
            {job.vehicleRegistration}
          </span>
          <CheckCircle2 className="w-4 h-4 text-[#72A68E]" />
        </div>
        {(job.vehicleMake || job.vehicleModel) && (
          <p className="text-xs text-[#72A68E]">
            {[job.vehicleMake, job.vehicleModel].filter(Boolean).join(' ')}
          </p>
        )}
        <p className="text-xs text-[#72A68E]/60 mt-1">
          {t('bodyshop.page.completedSummary', { date: job.completedAt ? formatDate(job.completedAt) : '—', hours: formatHours(job.totalHours) })}
        </p>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="p-2 text-[#72A68E] hover:text-red-500 hover:bg-red-50 active:bg-red-100 rounded-lg transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}

// ─── New Job Form ─────────────────────────────────────────────────────────────
// 🔧 NEW: includes damage intake with searchable dropdown + free-text per line

function NewJobForm({
  onSubmit,
  onCancel,
  loading,
  organizationId,
}: {
  // 👤 Optional `assignedMechanic` — captured at creation time when an
  // admin already knows who'll do the work. Backward compatible: existing
  // callers that don't read it just ignore the parameter.
  onSubmit: (reg: string, make?: string, model?: string, vehicleId?: string, damages?: DamageItem[], assignedMechanic?: { id: string; name: string } | null) => void
  onCancel: () => void
  loading: boolean
  organizationId: string | null
}) {
  const t = useT()
  const { lang } = useLang()
  const { mechanics } = useMechanics()
  const [assignedMechanicId, setAssignedMechanicId] = useState<string>('')
  const [reg, setReg] = useState('')
  const [searchResults, setSearchResults] = useState<Vehicle[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const skipNextSearch = useRef(false)

  // ── Damage state ────────────────────────────────────────────────────────────
  const [damages, setDamages] = useState<DamageItem[]>([])
  const [damageInput, setDamageInput] = useState('')
  const [showDamageDropdown, setShowDamageDropdown] = useState(false)
  const damageInputRef = useRef<HTMLInputElement>(null)

  const damageOptions = lang === 'ro' ? DAMAGE_OPTIONS_RO : lang === 'bg' ? DAMAGE_OPTIONS_BG : lang === 'pl' ? DAMAGE_OPTIONS_PL : DAMAGE_OPTIONS
  const filteredDamageOptions = damageOptions.filter(opt =>
    opt.toLowerCase().includes(damageInput.toLowerCase())
  )

  const addDamage = (description: string) => {
    const trimmed = description.trim()
    if (!trimmed) return
    setDamages(prev => [...prev, { id: `dmg_${Date.now()}_${Math.random()}`, description: trimmed }])
    setDamageInput('')
    setShowDamageDropdown(false)
    // Keep focus so user can add another damage quickly
    setTimeout(() => damageInputRef.current?.focus(), 0)
  }

  const removeDamage = (id: string) => {
    setDamages(prev => prev.filter(d => d.id !== id))
  }

  // ── Vehicle search (PRESERVED + onMouseDown fix) ────────────────────────────

  useEffect(() => {
    const searchVehicles = async () => {
      if (skipNextSearch.current) {
        skipNextSearch.current = false
        return
      }
      if (!organizationId || reg.length < 2) {
        setSearchResults([])
        setShowDropdown(false)
        return
      }
      setSearching(true)
      try {
        const allVehicles = await vehicleService.getVehicles(organizationId)
        const term = reg.toLowerCase().trim()
        const matches = allVehicles
          .filter(v => {
            const registration = v.registration?.toLowerCase() || ''
            const make = v.make?.toLowerCase() || ''
            const model = v.model?.toLowerCase() || ''
            return registration.includes(term) || make.includes(term) || model.includes(term)
          })
          .slice(0, 6)
        setSearchResults(matches)
        setShowDropdown(matches.length > 0)
      } catch (error) {
        console.error('Error searching vehicles:', error)
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }
    const debounce = setTimeout(searchVehicles, 200)
    return () => clearTimeout(debounce)
  }, [reg, organizationId])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelectVehicle = (vehicle: Vehicle, e: React.MouseEvent) => {
    e.preventDefault()
    skipNextSearch.current = true
    setReg(vehicle.registration)
    setSelectedVehicle(vehicle)
    setShowDropdown(false)
    setSearchResults([])
  }

  const handleSubmit = () => {
    const cleaned = reg.toUpperCase().replace(/\s+/g, '').trim()
    if (!cleaned) return
    const mechPicked = assignedMechanicId
      ? mechanics.find(m => m.uid === assignedMechanicId)
      : null
    const mechParam = mechPicked
      ? { id: mechPicked.uid, name: mechPicked.displayName || mechPicked.email || 'Unknown' }
      : null
    if (
      selectedVehicle &&
      selectedVehicle.registration.toUpperCase().replace(/\s+/g, '') === cleaned
    ) {
      onSubmit(reg, selectedVehicle?.make, selectedVehicle?.model, selectedVehicle?.id, damages, mechParam)
    } else {
      onSubmit(cleaned, undefined, undefined, undefined, damages, mechParam)
    }
  }

  const handleRegChange = (value: string) => {
    setReg(value.toUpperCase())
    if (
      selectedVehicle &&
      value.toUpperCase().replace(/\s+/g, '') !==
        selectedVehicle.registration.toUpperCase().replace(/\s+/g, '')
    ) {
      setSelectedVehicle(null)
    }
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-[#025940]/30 bg-[#f0f4f2] p-4 space-y-4">
      <p className="text-sm font-semibold text-[#012619]">{t('bodyshop.page.newJob')}</p>

      {/* ── Registration search ─────────────────────────────────────────────── */}
      <div className="relative" ref={dropdownRef}>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              autoFocus
              placeholder={t('bodyshop.page.searchReg')}
              value={reg}
              onChange={e => handleRegChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { setShowDropdown(false); handleSubmit() }
                if (e.key === 'Escape') setShowDropdown(false)
              }}
              onFocus={() => {
                if (searchResults.length > 0 && reg.length >= 2) setShowDropdown(true)
              }}
              className="w-full bg-white border border-[#025940]/30 rounded-lg px-3 py-2.5 text-sm text-[#012619] font-mono tracking-wider focus:outline-none focus:border-[#025940] focus:ring-2 focus:ring-[#025940]/20 placeholder:text-[#72A68E] placeholder:font-sans placeholder:tracking-normal"
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-[#025940]/30 border-t-[#025940] rounded-full animate-spin" />
              </div>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={!reg.trim() || loading}
            className="px-4 py-2.5 bg-[#b3f243] text-[#012619] text-sm font-bold rounded-lg disabled:opacity-40 hover:bg-[#c5f564] active:bg-[#a8e03d] active:scale-95 transition-all"
          >
            {loading ? '…' : t('bodyshop.common.add')}
          </button>
          <button
            onClick={onCancel}
            className="p-2 text-[#72A68E] hover:text-[#012619] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* FIX: onMouseDown with preventDefault so selection fires before blur closes dropdown */}
        {showDropdown && searchResults.length > 0 && (
          <div className="absolute z-20 left-0 right-12 mt-1 bg-white border border-[#025940]/20 rounded-xl shadow-lg overflow-hidden">
            {searchResults.map((vehicle) => (
              <button
                key={vehicle.id}
                onMouseDown={(e) => handleSelectVehicle(vehicle, e)}
                className="w-full px-3 py-2.5 text-left hover:bg-[#f0f4f2] active:bg-[#e5ebe8] transition-colors flex items-center gap-3 border-b border-[#025940]/10 last:border-b-0"
              >
                <div className="w-8 h-8 rounded-lg bg-[#025940]/10 flex items-center justify-center flex-shrink-0">
                  <Car className="w-4 h-4 text-[#025940]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#012619] font-mono tracking-wider">
                    {vehicle.registration}
                  </p>
                  {(vehicle.make || vehicle.model) && (
                    <p className="text-xs text-[#72A68E] truncate">
                      {[vehicle.make, vehicle.model].filter(Boolean).join(' ')}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedVehicle && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#025940]/10 rounded-lg">
          <Car className="w-4 h-4 text-[#025940]" />
          <span className="text-xs text-[#025940]">
            {t('bodyshop.page.fleetVehicle')} <span className="font-semibold">{selectedVehicle.make} {selectedVehicle.model}</span>
          </span>
        </div>
      )}

      {/* ── Damage intake ───────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-[#025940] uppercase tracking-wider">
            {t('bodyshop.page.damageDescription')}
          </p>
          {damages.length > 0 && (
            <span className="text-[10px] font-bold text-[#72A68E]">
              {t(damages.length === 1 ? 'bodyshop.page.itemCountOne' : 'bodyshop.page.itemCountMany', { count: damages.length })}
            </span>
          )}
        </div>

        {/* Added damage lines */}
        {damages.length > 0 && (
          <div className="space-y-1.5">
            {damages.map((d, i) => (
              <div
                key={d.id}
                className="flex items-center gap-2 bg-white border border-[#025940]/20 rounded-xl px-3 py-2.5"
              >
                <span className="w-5 h-5 rounded-full bg-[#025940] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm text-[#012619] leading-tight">{d.description}</span>
                <button
                  type="button"
                  onClick={() => removeDamage(d.id)}
                  className="text-[#72A68E] hover:text-red-500 transition-colors flex-shrink-0 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Damage input row — type free text or pick from searchable dropdown */}
        <div className="relative flex gap-2">
          <div className="flex-1 relative">
            <input
              ref={damageInputRef}
              type="text"
              value={damageInput}
              onChange={e => {
                setDamageInput(e.target.value)
                setShowDamageDropdown(true)
              }}
              onFocus={() => setShowDamageDropdown(true)}
              onBlur={() => setTimeout(() => setShowDamageDropdown(false), 150)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); addDamage(damageInput) }
                if (e.key === 'Escape') setShowDamageDropdown(false)
              }}
              placeholder={t('bodyshop.page.damagePlaceholder')}
              className="w-full rounded-xl border border-[#025940]/30 bg-white px-3 py-2.5 text-sm text-[#012619] placeholder-[#72A68E] focus:outline-none focus:ring-2 focus:ring-[#025940]/30"
            />

            {/* Searchable damage dropdown */}
            {showDamageDropdown && filteredDamageOptions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-[#025940]/20 rounded-xl shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                {filteredDamageOptions.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onMouseDown={() => addDamage(opt)}
                    className="w-full text-left px-3 py-2.5 text-sm text-[#012619] hover:bg-[#f0f4f2] active:bg-[#e0e8e4] transition-colors border-b border-[#025940]/5 last:border-0"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => addDamage(damageInput)}
            disabled={!damageInput.trim()}
            className="px-3 py-2.5 bg-[#025940] text-white rounded-xl disabled:opacity-40 hover:bg-[#012619] active:scale-95 transition-all flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[10px] text-[#72A68E]">
          {t('bodyshop.page.damageHint')}
        </p>
      </div>

      {/* 👤 Mechanic assignment — only renders if the org has at least one
          mechanic. Optional: empty value = unassigned. */}
      {mechanics.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#025940]">
            {t('bodyshop.page.assignMechanic')} <span className="font-normal text-[#72A68E]">{t('bodyshop.common.optional')}</span>
          </p>
          <select
            value={assignedMechanicId}
            onChange={e => setAssignedMechanicId(e.target.value)}
            className="w-full rounded-xl border border-[#025940]/30 bg-white px-3 py-2.5 text-sm text-[#012619] focus:outline-none focus:ring-2 focus:ring-[#025940]/30"
          >
            <option value="">{t('bodyshop.page.unassigned')}</option>
            {mechanics.map(m => (
              <option key={m.uid} value={m.uid}>
                {m.displayName || m.email}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

// ─── Mobile Stage Tabs ────────────────────────────────────────────────────────

function MobileStageTabs({
  activeTab,
  onTabChange,
  jobCounts,
}: {
  activeTab: 'all' | BodyshopStage
  onTabChange: (tab: 'all' | BodyshopStage) => void
  jobCounts: Record<string, number>
}) {
  const t = useT()
  const stageLabel = (s: string) => t(`bodyshop.stage.${s}`)
  const tabs: { key: 'all' | BodyshopStage; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'queued', label: 'Queued' },
    { key: 'prep', label: 'Prep' },
    { key: 'paint', label: 'Paint' },
    { key: 'finishing', label: 'Finishing' },
  ]

  return (
    <div
      className="sticky top-0 z-10 bg-white border-b border-[#025940]/10 flex"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`flex-1 py-2.5 text-[11px] font-bold uppercase tracking-wide border-b-[2.5px] transition-all whitespace-nowrap flex items-center justify-center gap-1 ${
            activeTab === tab.key
              ? 'text-[#012619] border-[#b3f243]'
              : 'text-[#72A68E]/60 border-transparent'
          }`}
        >
          {tab.key === 'all' ? t('bodyshop.page.tabAll') : stageLabel(tab.key)}
          <span
            className={`text-[9px] font-mono min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center ${
              activeTab === tab.key
                ? 'bg-[#b3f243] text-[#012619]'
                : 'bg-[#025940]/8 text-[#025940]'
            }`}
          >
            {jobCounts[tab.key] || 0}
          </span>
        </button>
      ))}
    </div>
  )
}

// ─── Mobile Pipeline Card (Queued — no hours, clean) ──────────────────────────

function MobilePipelineCard({
  job,
  position,
  totalQueued,
  onJobClick,
  onMoveToPrep,
  onDelete,
}: {
  job: BodyshopJob
  position: number
  totalQueued: number
  onJobClick: () => void
  onMoveToPrep: () => void
  onDelete: () => void
}) {
  const t = useT()
  const stageLabel = (s: string) => t(`bodyshop.stage.${s}`)
  return (
    <button
      onClick={onJobClick}
      className="w-full bg-white rounded-xl border border-[#025940]/10 shadow-sm overflow-hidden active:bg-[#f8faf9] transition-colors"
    >
      <div className="flex items-center gap-3 px-3 py-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
          #{position}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <span className="text-sm font-black font-mono tracking-wider text-[#012619] truncate block">
            {job.vehicleRegistration}
          </span>
          {(job.vehicleMake || job.vehicleModel) && (
            <p className="text-xs text-[#72A68E] truncate mt-0.5">
              {[job.vehicleMake, job.vehicleModel].filter(Boolean).join(' ')}
            </p>
          )}
          {job.damages && job.damages.length > 0 && (
            <p className="text-[10px] text-amber-600 font-semibold mt-0.5">
              🔧 {t(job.damages.length === 1 ? 'bodyshop.page.damageCountOne' : 'bodyshop.page.damageCountMany', { count: job.damages.length })}
            </p>
          )}
        </div>
        <div
          onClick={(e) => { e.stopPropagation(); onMoveToPrep() }}
          className="flex-shrink-0 flex items-center gap-1 pl-2.5 pr-2 py-1.5 rounded-lg text-[11px] font-bold bg-amber-500/10 text-amber-600 active:bg-amber-500/20 transition-colors"
        >
          {stageLabel('prep')}
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </button>
  )
}

// ─── Mobile Job Card (Active stages: prep / paint / finishing) ─────────────────

function MobileJobCard({
  job,
  onJobClick,
  onMoveToStage,
  onComplete,
  onDelete,
}: {
  job: BodyshopJob
  onJobClick: () => void
  onMoveToStage: (stage: BodyshopStage) => void
  onComplete: () => void
  onDelete: () => void
}) {
  const t = useT()
  const stageLabel = (s: string) => t(`bodyshop.stage.${s}`)
  const prev = getPrevStage(job.stage)
  const next = getNextStage(job.stage)
  const stageConf = STAGE_CONFIG[job.stage]
  const currentStageHours = job.stageHours?.[job.stage] || 0
  const canAdvance = currentStageHours > 0

  return (
    <div className="w-full bg-white rounded-xl border border-[#025940]/10 shadow-sm overflow-hidden">
      <button onClick={onJobClick} className="w-full flex items-center gap-3 px-3 py-3 text-left active:bg-[#f8faf9] transition-colors">
        <div
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: stageConf.bgColor }}
        >
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stageConf.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black font-mono tracking-wider text-[#012619] truncate">
              {job.vehicleRegistration}
            </span>
            <span
              className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: stageConf.bgColor, color: stageConf.color }}
            >
              {stageLabel(job.stage)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {(job.vehicleMake || job.vehicleModel) && (
              <p className="text-xs text-[#72A68E] truncate">
                {[job.vehicleMake, job.vehicleModel].filter(Boolean).join(' ')}
              </p>
            )}
            <span className="text-[#72A68E]/40 text-xs">·</span>
            <span className="flex-shrink-0 text-xs font-mono font-semibold text-[#025940]">
              {formatHours(job.totalHours)}
            </span>
          </div>
          {job.damages && job.damages.length > 0 && (
            <p className="text-[10px] text-amber-600 font-semibold mt-0.5">
              🔧 {t(job.damages.length === 1 ? 'bodyshop.page.damageCountOne' : 'bodyshop.page.damageCountMany', { count: job.damages.length })}
            </p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-[#72A68E]/30 flex-shrink-0" />
      </button>

      <div className="px-3 pb-3 space-y-1.5">
        <div className="flex items-center gap-2">
          {prev && (
            <button
              onClick={(e) => { e.stopPropagation(); onMoveToStage(prev) }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold transition-all active:scale-[0.97]"
              style={{
                backgroundColor: STAGE_CONFIG[prev].bgColor,
                color: STAGE_CONFIG[prev].color,
              }}
            >
              <ChevronRight className="w-3 h-3 rotate-180" />
              {stageLabel(prev)}
            </button>
          )}
          {next ? (
            <button
              onClick={(e) => { e.stopPropagation(); if (canAdvance) onMoveToStage(next) }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold transition-all ${
                canAdvance ? 'active:scale-[0.97]' : 'opacity-40 cursor-not-allowed'
              }`}
              style={{
                backgroundColor: STAGE_CONFIG[next].bgColor,
                color: STAGE_CONFIG[next].color,
              }}
            >
              {stageLabel(next)}
              <ChevronRight className="w-3 h-3" />
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); if (canAdvance) onComplete() }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold transition-all ${
                canAdvance ? 'bg-emerald-50 text-emerald-600 active:scale-[0.97]' : 'bg-gray-50 text-gray-400 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t('bodyshop.page.complete')}
            </button>
          )}
        </div>
        {!canAdvance && (
          <p className="text-[10px] text-red-400/70 text-center">{t('bodyshop.page.logHoursWarn')}</p>
        )}
      </div>
    </div>
  )
}

// ─── Mobile Job List ──────────────────────────────────────────────────────────

function MobileJobList({
  jobs,
  activeTab,
  onJobClick,
  onMoveToStage,
  onComplete,
  onJobDelete,
}: {
  jobs: BodyshopJob[]
  activeTab: 'all' | BodyshopStage
  onJobClick: (job: BodyshopJob) => void
  onMoveToStage: (jobId: string, stage: BodyshopStage) => void
  onComplete: (jobId: string) => void
  onJobDelete: (job: BodyshopJob) => void
}) {
  const t = useT()
  const stageLabel = (s: string) => t(`bodyshop.stage.${s}`)
  const filteredJobs = activeTab === 'all' ? jobs : jobs.filter(j => j.stage === activeTab)

  const queuedJobs = filteredJobs
    .filter(j => j.stage === 'queued')
    .sort((a, b) => (a.priority || 999) - (b.priority || 999))
  const activeJobs = filteredJobs.filter(j => j.stage !== 'queued')
  const totalQueued = jobs.filter(j => j.stage === 'queued').length

  if (filteredJobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#72A68E]">
        <Wrench className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm opacity-60">
          {activeTab === 'all' ? t('bodyshop.page.noActiveJobs') : t('bodyshop.page.noJobsInStage', { stage: stageLabel(activeTab) })}
        </p>
      </div>
    )
  }

  return (
    <div className="px-3.5 py-3 space-y-2">
      {queuedJobs.length > 0 && (
        <div className="space-y-2">
          {activeTab === 'all' && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#72A68E] px-1 pt-1">{t('bodyshop.page.pipelineWaiting')}</p>
          )}
          {queuedJobs.map((job, idx) => (
            <MobilePipelineCard
              key={job.id}
              job={job}
              position={idx + 1}
              totalQueued={totalQueued}
              onJobClick={() => onJobClick(job)}
              onMoveToPrep={() => job.id && onMoveToStage(job.id, 'prep')}
              onDelete={() => onJobDelete(job)}
            />
          ))}
        </div>
      )}

      {activeJobs.length > 0 && (
        <div className="space-y-2">
          {activeTab === 'all' && queuedJobs.length > 0 && (
            <div className="px-1 pt-3 pb-0.5">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#72A68E]">{t('bodyshop.page.inProgress')}</p>
            </div>
          )}
          {activeJobs.map(job => (
            <MobileJobCard
              key={job.id}
              job={job}
              onJobClick={() => onJobClick(job)}
              onMoveToStage={(stage) => job.id && onMoveToStage(job.id, stage)}
              onComplete={() => job.id && onComplete(job.id)}
              onDelete={() => onJobDelete(job)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BodyshopPage() {
  const t = useT()
  const { user } = useAuth()
  const {
    jobs,
    loadingJobs,
    organizationId,
    createJob,
    moveToStage,
    reorderQueue,
    deleteJob,
    setJobStatus,
    saveLog,
    deleteLog,
    loadLogs,
    updateJobDamages,
    assignJobMechanic,
  } = useBodyshopJobs()
  const { mechanics } = useMechanics()

  const [showNewForm, setShowNewForm] = useState(false)
  const [creatingJob, setCreatingJob] = useState(false)
  const [selectedJob, setSelectedJob] = useState<BodyshopJob | null>(null)
  const [jobToDelete, setJobToDelete] = useState<BodyshopJob | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [localOrgId, setLocalOrgId] = useState<string | null>(organizationId)
  const [mobileStageTab, setMobileStageTab] = useState<'all' | BodyshopStage>('all')
  const [showStaffActivity, setShowStaffActivity] = useState(false)

  useEffect(() => {
    if (organizationId) setLocalOrgId(organizationId)
  }, [organizationId])

  useEffect(() => {
    const loadOrg = async () => {
      if (!localOrgId && user?.uid) {
        const profile = await userProfileService.getProfile(user.uid)
        if (profile?.organizationId) {
          setLocalOrgId(profile.organizationId)
        }
      }
    }
    loadOrg()
  }, [user, localOrgId])

  const openJobs = jobs.filter(j => j.status === 'open')
  const completedJobs = jobs.filter(j => j.status === 'complete')

  const jobCounts: Record<string, number> = {
    all: openJobs.length,
    queued: openJobs.filter(j => j.stage === 'queued').length,
    prep: openJobs.filter(j => j.stage === 'prep').length,
    paint: openJobs.filter(j => j.stage === 'paint').length,
    finishing: openJobs.filter(j => j.stage === 'finishing').length,
  }

  const handleCreateJob = async (
    reg: string,
    make?: string,
    model?: string,
    vehicleId?: string,
    damages?: DamageItem[],
    assignedMechanic?: { id: string; name: string } | null,
  ) => {
    setCreatingJob(true)
    const job = await createJob(reg, make, model, vehicleId, damages, assignedMechanic)
    setCreatingJob(false)
    if (job) {
      setShowNewForm(false)
      setSelectedJob(job)
    }
  }

  const handleDeleteJob = async () => {
    if (!jobToDelete?.id) return
    await deleteJob(jobToDelete.id)
    if (selectedJob?.id === jobToDelete.id) setSelectedJob(null)
    setJobToDelete(null)
  }

  const handleStatusChange = async (jobId: string, status: 'open' | 'complete') => {
    await setJobStatus(jobId, status)
    if (selectedJob?.id === jobId) {
      setSelectedJob(prev => prev ? { ...prev, status } : null)
    }
  }

  // Propagate damage saves back to selectedJob so the panel re-renders immediately
  const handleUpdateDamages = async (jobId: string, damages: DamageItem[]) => {
    const ok = await updateJobDamages(jobId, damages)
    if (ok && selectedJob?.id === jobId) {
      setSelectedJob(prev => prev ? { ...prev, damages } : null)
    }
    return ok
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#f6f8f7] overflow-x-hidden flex flex-col">
        <Navigation />

        <div className="flex flex-1 bg-white">
          <div className={`flex-1 flex flex-col transition-all duration-300 ${
            selectedJob ? 'lg:pr-[420px]' : ''
          }`}>

            {/* Header */}
            <div className="border-b border-[#e2e8e5] px-4 sm:px-6 py-4 bg-[#f6f8f7]/85 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#025940] flex items-center justify-center">
                    <Wrench className="w-4 h-4 text-[#b3f243]" />
                  </div>
                  <div>
                    <h1 className="text-lg font-black tracking-wide text-[#012619]">{t('bodyshop.page.title')}</h1>
                    <span className="text-xs text-[#72A68E] font-mono">
                      {t('bodyshop.page.headerCounts', { active: openJobs.length, complete: completedJobs.length })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {localOrgId && (
                    <button
                      onClick={() => setShowStaffActivity(true)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#025940]/10 border border-[#025940]/20 text-[#025940] hover:bg-[#025940]/20 active:scale-95 text-sm font-semibold transition-all"
                    >
                      <Users className="w-4 h-4" />
                      <span className="hidden sm:inline">{t('bodyshop.page.staffActivity')}</span>
                    </button>
                  )}
                  <button
                    onClick={() => setShowNewForm(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#b3f243] text-[#012619] text-sm font-bold rounded-xl hover:bg-[#c5f564] active:scale-95 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('bodyshop.page.newJob')}</span>
                    <span className="sm:hidden">{t('bodyshop.page.newJobShort')}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile stage tabs */}
            <div className="lg:hidden">
              <MobileStageTabs
                activeTab={mobileStageTab}
                onTabChange={setMobileStageTab}
                jobCounts={jobCounts}
              />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
              {showNewForm && (
                <div className="px-4 sm:px-6 pt-4">
                  <NewJobForm
                    onSubmit={handleCreateJob}
                    onCancel={() => setShowNewForm(false)}
                    loading={creatingJob}
                    organizationId={localOrgId}
                  />
                </div>
              )}

              {loadingJobs ? (
                <div className="flex justify-center py-12">
                  <div className="w-7 h-7 border-2 border-[#025940]/30 border-t-[#025940] rounded-full animate-spin" />
                </div>
              ) : openJobs.length === 0 && !showNewForm ? (
                <div className="text-center py-12">
                  <Wrench className="w-10 h-10 text-[#72A68E] mx-auto mb-3" />
                  <p className="text-[#72A68E] text-sm">{t('bodyshop.page.noActiveJobs')}</p>
                  <button
                    onClick={() => setShowNewForm(true)}
                    className="mt-3 text-xs text-[#025940] font-semibold hover:underline"
                  >
                    {t('bodyshop.page.startNewJob')}
                  </button>
                </div>
              ) : (
                <>
                  {/* Mobile: card list with stage filtering */}
                  <div className="lg:hidden">
                    <MobileJobList
                      jobs={openJobs}
                      activeTab={mobileStageTab}
                      onJobClick={setSelectedJob}
                      onMoveToStage={moveToStage}
                      onComplete={(jobId) => handleStatusChange(jobId, 'complete')}
                      onJobDelete={setJobToDelete}
                    />
                  </div>

                  {/* Desktop: Original Kanban (PRESERVED) */}
                  <div className="hidden lg:block px-4 sm:px-6 py-5">
                    <BodyshopKanban
                      jobs={openJobs}
                      onMoveToStage={moveToStage}
                      onReorderQueue={reorderQueue}
                      onJobClick={setSelectedJob}
                      onJobDelete={setJobToDelete}
                    />
                  </div>
                </>
              )}

              {/* Completed Jobs Section (PRESERVED) */}
              {completedJobs.length > 0 && (
                <div className="border-t border-[#025940]/10 pt-4 px-4 sm:px-6 pb-6">
                  <button
                    onClick={() => setShowCompleted(v => !v)}
                    className="flex items-center gap-2 text-sm font-semibold text-[#025940] hover:text-[#012619] transition-colors"
                  >
                    {showCompleted ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {t('bodyshop.page.completedJobs', { count: completedJobs.length })}
                  </button>
                  {showCompleted && (
                    <div className="mt-3 space-y-2">
                      {completedJobs.map(job => (
                        <CompletedJobCard
                          key={job.id}
                          job={job}
                          onClick={() => setSelectedJob(job)}
                          onDelete={() => setJobToDelete(job)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Detail panel */}
          {selectedJob && (
            <>
              {/* Mobile: bottom sheet — 80vh to accommodate damage panel */}
              <div className="lg:hidden">
                <div
                  className="fixed inset-0 bg-black/50 z-40"
                  onClick={() => setSelectedJob(null)}
                />
                <div className="fixed inset-x-0 bottom-0 bg-[#012619] border-t border-[#025940] z-50 flex flex-col shadow-2xl rounded-t-2xl overflow-hidden max-h-[80vh]">
                  <div className="flex justify-center py-2 flex-shrink-0">
                    <div className="w-9 h-1 rounded-full bg-white/20" />
                  </div>
                  <div className="flex-1 overflow-y-auto min-h-0">
                    <JobDetailPanel
                      job={selectedJob}
                      onClose={() => setSelectedJob(null)}
                      onStatusChange={handleStatusChange}
                      onSaveLog={saveLog}
                      onDeleteLog={deleteLog}
                      loadLogs={loadLogs}
                      onUpdateDamages={handleUpdateDamages}
                      onAssignMechanic={assignJobMechanic}
                    />
                  </div>
                </div>
              </div>

              {/* Desktop: side panel (PRESERVED) */}
              <div className="hidden lg:flex fixed inset-y-0 right-0 w-[420px] bg-[#012619] border-l border-[#025940] z-30 flex-col shadow-2xl">
                <JobDetailPanel
                  job={selectedJob}
                  onClose={() => setSelectedJob(null)}
                  onStatusChange={handleStatusChange}
                  onSaveLog={saveLog}
                  onDeleteLog={deleteLog}
                  loadLogs={loadLogs}
                  onUpdateDamages={handleUpdateDamages}
                  onAssignMechanic={assignJobMechanic}
                />
              </div>
            </>
          )}
        </div>

        {/* Delete confirmation modal (PRESERVED) */}
        {jobToDelete && (
          <DeleteConfirmModal
            job={jobToDelete}
            onConfirm={handleDeleteJob}
            onCancel={() => setJobToDelete(null)}
          />
        )}

        {/* Staff Activity Modal */}
        {showStaffActivity && localOrgId && (
          <StaffActivityModal
            organizationId={localOrgId}
            onClose={() => setShowStaffActivity(false)}
          />
        )}
      </div>
    </ProtectedRoute>
  )
}