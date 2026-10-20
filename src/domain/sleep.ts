import { addDaysIso } from './format'
import type { IsoDate, SleepRecord, SleepSummary } from './types'

export function minutesOfClock(hhmm: string): number | null {
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

/** Bedtime may be later than wake time (crosses midnight). */
export function durationBetween(bedtime: string, wakeTime: string): number | null {
  const bed = minutesOfClock(bedtime)
  const wake = minutesOfClock(wakeTime)
  if (bed == null || wake == null) return null
  const raw = wake - bed
  const minutes = raw >= 0 ? raw : raw + 24 * 60
  // More than 16 h is almost certainly a typo (bedtime/wake swapped).
  return minutes > 0 && minutes <= 16 * 60 ? minutes : null
}

export function formatSleepMinutes(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '—'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${h} h ${m.toString().padStart(2, '0')} min`
}

export function sleepForDate(
  records: SleepRecord[],
  date: IsoDate,
): SleepRecord | undefined {
  return records.find((r) => r.date === date)
}

/** Net debt over recorded nights; missing nights are excluded, not assumed. */
export function sleepDebt(
  records: SleepRecord[],
  targetMin: number,
  endDate: IsoDate,
  days = 7,
): { debtMin: number | null; nights: number; averageMin: number | null } {
  const start = addDaysIso(endDate, -(days - 1))
  const inRange = records.filter((r) => r.date >= start && r.date <= endDate)
  if (inRange.length === 0) return { debtMin: null, nights: 0, averageMin: null }
  const total = inRange.reduce((sum, r) => sum + r.durationMin, 0)
  const debt = inRange.reduce(
    (sum, r) => sum + (targetMin - r.durationMin - (r.napMin ?? 0)),
    0,
  )
  return {
    debtMin: Math.round(debt),
    nights: inRange.length,
    averageMin: Math.round(total / inRange.length),
  }
}

/** Sleep midpoint relative to noon, so 23:00 and 01:00 are close together. */
function midpointSinceNoon(record: SleepRecord): number | null {
  if (!record.bedtime) return null
  const bed = minutesOfClock(record.bedtime)
  if (bed == null) return null
  const sinceNoon = (bed - 12 * 60 + 24 * 60) % (24 * 60)
  return (sinceNoon + record.durationMin / 2) % (24 * 60)
}

export function sleepSummary(
  records: SleepRecord[],
  targetMin: number,
  endDate: IsoDate,
  days = 7,
): SleepSummary {
  const start = addDaysIso(endDate, -(days - 1))
  const inRange = records.filter((r) => r.date >= start && r.date <= endDate)
  if (inRange.length === 0) {
    return {
      averageMin: null,
      napAverageMin: null,
      totalAverageMin: null,
      debtMin: null,
      midpointStdMin: null,
      nights: 0,
    }
  }
  const average = inRange.reduce((s, r) => s + r.durationMin, 0) / inRange.length
  const napAverage =
    inRange.reduce((s, r) => s + (r.napMin ?? 0), 0) / inRange.length
  const totalAverage = average + napAverage
  const debt = inRange.reduce(
    (s, r) => s + (targetMin - r.durationMin - (r.napMin ?? 0)),
    0,
  )
  const midpoints = inRange
    .map(midpointSinceNoon)
    .filter((m): m is number => m != null)
  let sd: number | null = null
  if (midpoints.length >= 2) {
    const mean = midpoints.reduce((a, b) => a + b, 0) / midpoints.length
    const variance =
      midpoints.reduce((acc, m) => acc + (m - mean) ** 2, 0) / midpoints.length
    sd = Math.sqrt(variance)
  }
  return {
    averageMin: Math.round(average),
    napAverageMin: Math.round(napAverage),
    totalAverageMin: Math.round(totalAverage),
    debtMin: Math.round(debt),
    midpointStdMin: sd != null ? Math.round(sd) : null,
    nights: inRange.length,
  }
}
