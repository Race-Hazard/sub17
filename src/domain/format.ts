import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfWeek,
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { IsoDate } from './types'

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function round(n: number, digits = 0): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

export function dateFromIso(iso: IsoDate): Date {
  return parseISO(`${iso}T00:00:00`)
}

export function isoFromDate(d: Date): IsoDate {
  return format(d, 'yyyy-MM-dd')
}

export function todayIso(now = new Date()): IsoDate {
  return isoFromDate(now)
}

export function addDaysIso(iso: IsoDate, days: number): IsoDate {
  return isoFromDate(addDays(dateFromIso(iso), days))
}

/** Monday-based weekday: 1 = Monday ... 7 = Sunday */
export function weekdayIndex(iso: IsoDate): number {
  const d = dateFromIso(iso)
  const js = d.getDay() // 0 = Sunday
  return js === 0 ? 7 : js
}

export function mondayOf(iso: IsoDate): IsoDate {
  return isoFromDate(startOfWeek(dateFromIso(iso), { weekStartsOn: 1 }))
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return differenceInCalendarDays(dateFromIso(to), dateFromIso(from))
}

export function formatShortDate(iso: IsoDate): string {
  return format(dateFromIso(iso), 'M月d日', { locale: zhCN })
}

export function formatWeekday(iso: IsoDate): string {
  return format(dateFromIso(iso), 'EEE', { locale: zhCN })
}

export function formatLongDate(iso: IsoDate): string {
  return format(dateFromIso(iso), 'M月d日 EEEE', { locale: zhCN })
}

export function formatPace(secPerKm: number | null | undefined): string {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return '—'
  const total = Math.round(secPerKm)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatPaceRange(
  fastSecKm: number | null | undefined,
  slowSecKm: number | null | undefined,
): string {
  if (fastSecKm == null || slowSecKm == null) return '—'
  return `${formatPace(fastSecKm)}–${formatPace(slowSecKm)}`
}

/** Accepts "3:55", "3:55/km", "235" (seconds). Returns seconds per km. */
export function parsePace(input: string): number | null {
  const text = input.trim().replace(/\/?km$/i, '').replace(/\s/g, '')
  if (!text) return null
  if (/^\d+$/.test(text)) {
    const n = Number(text)
    return n > 0 ? n : null
  }
  const m = text.match(/^(\d+):([0-5]?\d)$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** Accepts "32:10", "1:02:10", or minutes as a number. */
export function parseDuration(input: string): number | null {
  const text = input.trim()
  if (!text) return null
  const parts = text.split(':').map(Number)
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return null
  if (parts.length === 1) return Math.round(parts[0] * 60)
  if (parts.length === 2) {
    if (parts[1] >= 60) return null
    return parts[0] * 60 + parts[1]
  }
  if (parts.length === 3) {
    if (parts[1] >= 60 || parts[2] >= 60) return null
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  return null
}

export function formatDuration(totalSec: number | null | undefined): string {
  if (totalSec == null || !Number.isFinite(totalSec) || totalSec < 0) return '—'
  const s = Math.round(totalSec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function formatDurationMin(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '—'
  return formatDuration(min * 60)
}

export function formatKm(distanceM: number | null | undefined): string {
  if (distanceM == null || !Number.isFinite(distanceM)) return '—'
  if (distanceM < 1000) return `${Math.round(distanceM)} m`
  const km = distanceM / 1000
  return `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)} km`
}

export function secondsPerKm(distanceM: number, durationSec: number): number | null {
  if (distanceM <= 0 || durationSec <= 0) return null
  return (durationSec / distanceM) * 1000
}

export function distanceForDuration(durationSec: number, paceSecKm: number): number {
  if (paceSecKm <= 0) return 0
  return (durationSec / paceSecKm) * 1000
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function minutesOfDay(hhmm: string): number {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return 0
  return Number(m[1]) * 60 + Number(m[2])
}

export function isAfterTime(hhmm: string, now = new Date()): boolean {
  return now.getHours() * 60 + now.getMinutes() >= minutesOfDay(hhmm)
}
