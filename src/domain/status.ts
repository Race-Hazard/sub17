import { complianceForPlan, type ComplianceResult } from './coach'
import { addDaysIso, daysBetween, mondayOf, secondsPerKm, weekdayIndex } from './format'
import { rpeDrift, summarizeLoad, totalKm, weeklyKm } from './load'
import { goalConfidence, bestCurrentVdot, MILESTONES, type GoalConfidence } from './projection'
import { evaluateReadiness } from './readiness'
import { qualitySummary, type QualitySummary } from './quality'
import { sleepSummary } from './sleep'
import type {
  Checkin,
  IsoDate,
  LoadSummary,
  PaceRange,
  Plan,
  Profile,
  Readiness,
  Session,
  SleepRecord,
  SleepSummary,
  TrainingZone,
} from './types'
import {
  equivalentPaceSecKm,
  equivalentTimeSec,
  practicalEasyPace,
  trainingPaces,
  vdotForGoal,
  vdotFromPerformance,
} from './vdot'
import { getWeekIndex, phaseForWeek } from './plan'

export interface TrainingStatus {
  currentVdot: number
  current5kSec: number
  current5kPaceSecKm: number
  paces: Record<'E' | 'M' | 'T' | 'I' | 'R', PaceRange>
  goal5kPaceSecKm: number
  load: LoadSummary
  sleep: SleepSummary
  readiness: Readiness
  weeklyKm: number
  lastWeekKm: number
  fourWeekAvgKm: number
  currentWeekIndex: number
  currentWeekDay: number
  phase: number
  weeksRemaining: number
  goal: GoalConfidence
  quality: QualitySummary
  compliance: ComplianceResult | null
  nextMilestone: (typeof MILESTONES)[number] | null
  tests: { date: IsoDate; distanceM: number; timeSec: number; vdot: number }[]
}

export interface StatusInput {
  sessions: Session[]
  sleeps: SleepRecord[]
  checkins: Checkin[]
  profile: Profile
  activePlan: Plan | null
  plans?: Plan[]
  today: IsoDate
}

export function computeStatus(input: StatusInput): TrainingStatus {
  const { sessions, sleeps, checkins, profile, activePlan, today } = input
  const plans = input.plans ?? (activePlan ? [activePlan] : [])

  const tests = sessions
    .filter((s) => s.isTest && (s.testDistanceM ?? s.distanceM ?? 0) >= 1500)
    .map((s) => {
      const distanceM = s.testDistanceM ?? s.distanceM ?? 0
      const timeSec = s.durationSec ?? 0
      return {
        date: s.date,
        distanceM,
        timeSec,
        vdot: timeSec > 0 ? vdotFromPerformance(distanceM, timeSec) : 0,
      }
    })
    .filter((t) => t.vdot > 0)

  const best = bestCurrentVdot(tests, today)
  const manual = profile.manualVdot
  const safeManual =
    manual != null && Number.isFinite(manual) && manual > 0 ? manual : undefined
  const seedVdot =
    Number.isFinite(profile.seedVdot) && profile.seedVdot > 0 ? profile.seedVdot : 50
  const currentVdot = best?.vdot ?? safeManual ?? seedVdot

  const todaysRuns = sessions.filter((s) => s.date === today && s.type !== 'rest' && s.type !== 'strength')
  const latestToday = todaysRuns[todaysRuns.length - 1]
  const drift = latestToday ? rpeDrift(latestToday, sessions, today) : null

  const load = summarizeLoad(sessions, today)
  const sleep7 = sleepSummary(sleeps, profile.sleepTargetMin, today, 7)
  const todaySleep = sleeps.find((s) => s.date === today) ?? null
  const todayCheckin = checkins.find((c) => c.date === today) ?? null
  const hasRpeData = sessions.some(
    (s) => s.rpe != null && daysBetween(s.date, today) <= 42,
  )

  const readiness = evaluateReadiness({
    sleepMin: todaySleep?.durationMin ?? null,
    painScore: todayCheckin?.painScore ?? null,
    rpeDrift: drift,
    load,
    hasRpeData,
    override: todayCheckin?.readinessOverride ?? null,
    overrideReason: todayCheckin?.overrideReason,
  })

  const weekStart = mondayOf(today)
  const weekly = weeklyKm(sessions, weekStart)
  const fourWeekAvg = totalKm(sessions, addDaysIso(today, -27), today) / 4
  const weeksRemaining = Math.max(0, daysBetween(today, profile.goalDate) / 7)
  const currentWeekIndex = getWeekIndex(profile.startDate, today)
  const paces = trainingPaces(currentVdot)
  paces.E = practicalEasyPace(currentVdot)
  const goalVdot = vdotForGoal(5000, profile.goalTimeSec)
  const quality = qualitySummary(sessions, plans, currentVdot)

  return {
    currentVdot,
    current5kSec: equivalentTimeSec(currentVdot, 5000),
    current5kPaceSecKm: equivalentPaceSecKm(currentVdot, 5000),
    paces,
    goal5kPaceSecKm: (17 * 60) / 5,
    load,
    sleep: sleep7,
    readiness,
    weeklyKm: weekly,
    lastWeekKm: weeklyKm(sessions, addDaysIso(weekStart, -7)),
    fourWeekAvgKm: Math.round(fourWeekAvg * 10) / 10,
    currentWeekIndex,
    currentWeekDay: weekdayIndex(today),
    phase: phaseForWeek(currentWeekIndex || 1),
    weeksRemaining: Math.round(weeksRemaining * 10) / 10,
    goal: goalConfidence(currentVdot, weeksRemaining, goalVdot),
    quality,
    compliance: activePlan
      ? complianceForPlan(activePlan, sessions, checkins, profile.createdDate)
      : null,
    nextMilestone: MILESTONES.find((m) => m.week >= currentWeekIndex) ?? null,
    tests,
  }
}

export function paceForZone(status: TrainingStatus, zone: TrainingZone): PaceRange {
  if (zone === '5K') {
    return { fastSecKm: status.current5kPaceSecKm, slowSecKm: status.current5kPaceSecKm }
  }
  return status.paces[zone]
}

export function sessionPaceLabel(session: Session): string {
  if (!session.distanceM || !session.durationSec) return '—'
  const pace = secondsPerKm(session.distanceM, session.durationSec)
  return pace != null ? `${Math.floor(pace / 60)}:${Math.round(pace % 60).toString().padStart(2, '0')}/km` : '—'
}
