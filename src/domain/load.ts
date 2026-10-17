import { addDaysIso, daysBetween, secondsPerKm } from './format'
import type { IsoDate, LoadSummary, Session, SessionType } from './types'

export const RUN_TYPES: SessionType[] = [
  'easy',
  'long',
  'threshold',
  'interval',
  'repetition',
  'time_trial',
  'race',
]

export function isRunType(type: SessionType): boolean {
  return RUN_TYPES.includes(type)
}

const DEFAULT_RPE: Partial<Record<SessionType, number>> = {
  easy: 3,
  long: 4,
  threshold: 6,
  interval: 7,
  repetition: 7,
  time_trial: 9,
  race: 9,
}

export function effectiveRpe(session: Session): number | null {
  if (!isRunType(session.type)) return null
  if (session.rpe != null && session.rpe >= 1 && session.rpe <= 10) return session.rpe
  return DEFAULT_RPE[session.type] ?? null
}

/** Session-RPE load: RPE × minutes. Strength and rest are excluded. */
export function sessionLoad(session: Session): number {
  if (!isRunType(session.type)) return 0
  if (!session.durationSec || session.durationSec <= 0) return 0
  const rpe = effectiveRpe(session)
  if (rpe == null) return 0
  return rpe * (session.durationSec / 60)
}

export function sessionsOnDate(sessions: Session[], date: IsoDate): Session[] {
  return sessions.filter((s) => s.date === date)
}

export function dailyLoadMap(
  sessions: Session[],
  endDate: IsoDate,
  days: number,
): Map<IsoDate, number> {
  const map = new Map<IsoDate, number>()
  for (let i = days - 1; i >= 0; i -= 1) {
    map.set(addDaysIso(endDate, -i), 0)
  }
  for (const session of sessions) {
    if (!map.has(session.date)) continue
    map.set(session.date, (map.get(session.date) ?? 0) + sessionLoad(session))
  }
  return map
}

export function summarizeLoad(sessions: Session[], today: IsoDate): LoadSummary {
  const runSessions = sessions.filter((s) => isRunType(s.type))
  // Count distinct days with a run inside the 28-day window. A couple of old
  // tests plus one week of training should not produce a confident ACWR.
  const windowStart = addDaysIso(today, -27)
  const recentRunSessions = runSessions.filter((s) => s.date >= windowStart && s.date <= today)
  const daysOfData = new Set(recentRunSessions.map((s) => s.date)).size

  const last7 = dailyLoadMap(sessions, today, 7)
  const last28 = dailyLoadMap(sessions, today, 28)
  const acute = [...last7.values()].reduce((a, b) => a + b, 0)
  const chronicTotal = [...last28.values()].reduce((a, b) => a + b, 0)
  const chronic = chronicTotal > 0 ? chronicTotal / 4 : null
  // Do not fabricate an ACWR from a handful of days; wait for two weeks.
  const acwr =
    daysOfData >= 14 && chronic != null && chronic > 0 ? acute / chronic : null

  let status: LoadSummary['status'] = 'insufficient'
  if (daysOfData >= 14 && acwr != null) {
    if (acwr < 0.8) status = 'low'
    else if (acwr <= 1.3) status = 'optimal'
    else if (acwr <= 1.5) status = 'elevated'
    else status = 'high'
  }

  let monotony: number | null = null
  if (daysOfData >= 7) {
    const values = [...last7.values()]
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance =
      values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length
    const sd = Math.sqrt(variance)
    monotony = sd > 0 ? mean / sd : null
  }
  const strain = monotony != null ? acute * monotony : null

  return {
    acute: round1(acute),
    chronic: chronic != null ? round1(chronic) : null,
    acwr: acwr != null ? round2(acwr) : null,
    status,
    monotony: monotony != null ? round2(monotony) : null,
    strain: strain != null ? round1(strain) : null,
    daysOfData,
  }
}

export function weeklyKm(sessions: Session[], weekStart: IsoDate): number {
  const end = addDaysIso(weekStart, 6)
  return round1(
    sessions
      .filter((s) => isRunType(s.type) && s.date >= weekStart && s.date <= end)
      .reduce((sum, s) => sum + (s.distanceM ?? 0), 0) / 1000,
  )
}

export function weeklyMinutes(sessions: Session[], weekStart: IsoDate): number {
  const end = addDaysIso(weekStart, 6)
  return Math.round(
    sessions
      .filter((s) => isRunType(s.type) && s.date >= weekStart && s.date <= end)
      .reduce((sum, s) => sum + (s.durationSec ?? 0), 0) / 60,
  )
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

/**
 * Compare today's RPE at a similar pace with the median of the prior 6 weeks.
 * Returns null when there are fewer than 3 comparable sessions.
 */
export function rpeDrift(
  current: Session,
  history: Session[],
  today: IsoDate,
): number | null {
  if (!current.distanceM || !current.durationSec || current.rpe == null) return null
  const currentPace = secondsPerKm(current.distanceM, current.durationSec)
  if (currentPace == null) return null
  const comparable = history
    .filter((s) => s.id !== current.id)
    .filter((s) => isRunType(s.type) && s.rpe != null && s.distanceM && s.durationSec)
    .filter((s) => daysBetween(s.date, today) <= 42 && s.date < current.date)
    .map((s) => ({
      rpe: s.rpe as number,
      pace: secondsPerKm(s.distanceM as number, s.durationSec as number) as number,
    }))
    .filter((s) => Math.abs(s.pace - currentPace) <= 5)
  if (comparable.length < 3) return null
  return current.rpe - median(comparable.map((s) => s.rpe))
}

export function totalKm(sessions: Session[], from: IsoDate, to: IsoDate): number {
  return round1(
    sessions
      .filter((s) => isRunType(s.type) && s.date >= from && s.date <= to)
      .reduce((sum, s) => sum + (s.distanceM ?? 0), 0) / 1000,
  )
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
