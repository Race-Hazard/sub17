import { addDaysIso, daysBetween, formatKm, nowIso } from './format'
import type {
  Checkin,
  Plan,
  PlannedSession,
  ReadinessLevel,
  Session,
  SessionType,
} from './types'
import { practicalEasyPace } from './vdot'
import type { NextQualityWorkout, QualityKind } from './quality'

const QUALITY_TYPES: SessionType[] = [
  'interval',
  'repetition',
  'threshold',
  'time_trial',
  'race',
]

export interface ReplanInput {
  plan: Plan
  sessions: Session[]
  checkins: Checkin[]
  today: string
  vdot: number
  readiness: ReadinessLevel
  qualityAdvice?: Partial<Record<QualityKind, NextQualityWorkout>>
}

function isQualityType(type: SessionType): boolean {
  return QUALITY_TYPES.includes(type)
}

function isRun(type: SessionType): boolean {
  return type !== 'strength' && type !== 'rest'
}

function km(session: Session | PlannedSession): number {
  return (session.distanceM ?? 0) / 1000
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function setEasy(
  planned: PlannedSession,
  distanceM: number,
  title: string,
  details: string,
  reason: string,
): void {
  planned.type = 'easy'
  planned.zone = 'E'
  planned.distanceM = Math.round(distanceM)
  planned.targetPace = null
  planned.targetTimeSec = undefined
  planned.testDistanceM = undefined
  planned.title = title
  planned.details = details
  planned.purpose = reason
  planned.status = 'adjusted'
}

function applyPlannedAdvice(
  planned: PlannedSession,
  advice: Partial<Record<QualityKind, NextQualityWorkout>> | undefined,
): string | null {
  const workout = planned.workout
  if (!workout || !isQualityType(planned.type)) return null
  if (planned.type === 'time_trial' || planned.type === 'race') return null
  const kind: QualityKind | null =
    workout.zone === 'I'
      ? 'I'
      : workout.zone === 'T'
        ? 'T'
        : workout.zone === 'R'
          ? 'R'
          : workout.zone === '5K'
            ? '5K'
            : null
  if (!kind) return null
  const next = advice?.[kind]
  if (!next) return null
  if (
    workout.adviceFromSessionId &&
    workout.adviceFromSessionId === next.sourceSessionId
  ) {
    return null
  }

  if (next.mode === 'interval' && workout.mode === 'interval' && workout.reps) {
    const floor = kind === 'R' ? 4 : kind === 'T' ? 2 : 3
    const reps = clamp(workout.reps + (next.repsDelta ?? 0), floor, 16)
    if (reps === workout.reps) return null
    const repM = workout.repDistanceM ?? 1000
    workout.reps = reps
    workout.adviceFromSessionId = next.sourceSessionId
    planned.distanceM = Math.round(((reps * repM) / 1000 + 4) * 1000)
    planned.title = `${reps} × ${formatKm(repM)} ${workout.zone}`
    planned.details = `按上次质量课评估调整：${reps} × ${formatKm(repM)}，组间 ${workout.recoverySec ?? 90} s 慢跑；热身/放松各 2 km。`
    planned.status = 'adjusted'
    return `按上次质量课评估把 ${workout.zone} 课调整为 ${reps}×${formatKm(repM)}`
  }

  if (
    next.mode === 'continuous' &&
    workout.mode === 'continuous' &&
    workout.continuousMin
  ) {
    const min = clamp(workout.continuousMin + (next.continuousMinDelta ?? 0), 20, 40)
    if (min === workout.continuousMin) return null
    workout.continuousMin = min
    workout.adviceFromSessionId = next.sourceSessionId
    const pace = planned.targetPace
    const avg = pace ? (pace.fastSecKm + pace.slowSecKm) / 2 : 255
    planned.distanceM = Math.round(((min * 60) / avg + 4) * 1000)
    planned.title = `${min} min 阈值跑`
    planned.details = `按上次质量课评估调整：${min} min 连续阈值跑 @ 目标 T 配速；热身/放松各 2 km。`
    planned.status = 'adjusted'
    return `按上次质量课评估把阈值课调整为 ${min} min`
  }
  return null
}

/**
 * Rebuild the remaining days of the current week from what was actually done.
 * It never adds a new hard session, never touches the Sunday rest day, and
 * keeps the weekly volume close to target.
 */
export function replanRemainingWeek(input: ReplanInput): Plan | null {
  const { plan, sessions, today, readiness } = input
  const weekStart = plan.weekStart
  const weekEnd = addDaysIso(weekStart, 6)
  if (today < weekStart || today > weekEnd) return null

  const planned = plan.plannedSessions.map((s) => ({ ...s }))
  const actualRuns = sessions.filter(
    (s) =>
      s.date >= weekStart &&
      s.date <= weekEnd &&
      s.date <= today &&
      isRun(s.type),
  )
  const actualQuality = actualRuns.filter(
    (s) => isQualityType(s.type) || ((s.type === 'easy' || s.type === 'long') && (s.rpe ?? 0) >= 7),
  )
  const actualLong = actualRuns.filter(
    (s) => s.type === 'long' || (s.distanceM ?? 0) >= 15000,
  )
  const lastHardDate = actualQuality
    .map((s) => s.date)
    .sort()
    .at(-1)
  const easyPace = practicalEasyPace(input.vdot)
  const paceText = `${Math.floor(easyPace.fastSecKm / 60)}:${Math.round(easyPace.fastSecKm % 60)
    .toString()
    .padStart(2, '0')}–${Math.floor(easyPace.slowSecKm / 60)}:${Math.round(
    easyPace.slowSecKm % 60,
  )
    .toString()
    .padStart(2, '0')}/km`

  const future = planned.filter((s) => s.date > today)
  const reasons: string[] = []
  const newAdjustments: Plan['adjustments'] = []
  let changed = false

  const longPlanned = future.find((s) => s.type === 'long')
  if (longPlanned) {
    const duplicateLong = actualLong.some((s) => s.date < longPlanned.date)
    const gapToLong = lastHardDate ? daysBetween(lastHardDate, longPlanned.date) : 99
    const tooCloseToLong = gapToLong < 2
    const redLong = readiness === 'red'
    if (duplicateLong || tooCloseToLong || redLong) {
      const baseDistance = longPlanned.distanceM ?? 12000
      const factor = duplicateLong ? 0.7 : tooCloseToLong ? 0.75 : 0.8
      const distance = Math.min(12000, Math.max(8000, Math.round(baseDistance * factor)))
      const reason = duplicateLong
        ? '本周已有长距离，原长距离改为中长跑'
        : tooCloseToLong
          ? '长距离前不足 48h 有质量课，原长距离改为中长跑'
          : '准备度红，长距离缩减为中长跑'
      setEasy(
        longPlanned,
        distance,
        `中长跑 ${formatKm(distance)}（按实际调整）`,
        `按实际训练与恢复调整：今天中长跑 ${formatKm(distance)} @ ${paceText}，保持轻松。`,
        reason,
      )
      reasons.push(reason)
      newAdjustments.push({
        plannedSessionId: longPlanned.id,
        action: 'downgrade-easy',
        reason,
        at: nowIso(),
      })
      changed = true
    }
  }

  for (const session of future) {
    if (!isQualityType(session.type)) continue
    const gap = lastHardDate ? daysBetween(lastHardDate, session.date) : 99
    const tooClose = gap < 2
    const tooMany = actualQuality.length >= 2
    const readinessRed = readiness === 'red'
    if (!tooClose && !tooMany && !readinessRed) continue

    const distance = Math.max(
      5000,
      Math.min(8000, Math.round((session.distanceM ?? 7000) * 0.7)),
    )
    const reason = tooMany
      ? '本周已完成 ≥2 次质量刺激，未来质量课改为轻松跑'
      : tooClose
        ? `距上次质量课不足 48h（${lastHardDate}），未来质量课改为轻松跑`
        : '准备度红，未来质量课改为轻松跑'
    setEasy(
      session,
      distance,
      `轻松跑 ${formatKm(distance)}（按实际调整）`,
      `实际训练已经包含质量刺激或恢复不足；今天改为轻松跑 @ ${paceText}，保持可对话。`,
      reason,
    )
    reasons.push(reason)
    newAdjustments.push({
      plannedSessionId: session.id,
      action: 'downgrade-easy',
      reason,
      at: nowIso(),
    })
    changed = true
  }

  // Apply the last same-kind quality evaluation to the remaining quality
  // sessions: only the first session of each kind, after recovery downgrades.
  const advisedKinds = new Set<QualityKind>()
  for (const session of future) {
    if (!isQualityType(session.type)) continue
    const zone = session.workout?.zone
    const kind: QualityKind | null =
      zone === 'I'
        ? 'I'
        : zone === 'T'
          ? 'T'
          : zone === 'R'
            ? 'R'
            : zone === '5K'
              ? '5K'
              : null
    if (kind) {
      if (advisedKinds.has(kind)) continue
      advisedKinds.add(kind)
    }
    const reason = applyPlannedAdvice(session, input.qualityAdvice)
    if (reason) {
      reasons.push(reason)
      newAdjustments.push({
        plannedSessionId: session.id,
        action: 'apply-advice',
        reason,
        at: nowIso(),
      })
      changed = true
    }
  }

  // Keep weekly volume near target by adjusting only future easy days.
  const actualKm = actualRuns.reduce((sum, s) => sum + km(s), 0)
  const futureKm = future.reduce((sum, s) => sum + km(s), 0)
  const desiredFuture = clamp(plan.targetKm - actualKm, 0, plan.targetKm)
  const delta = desiredFuture - futureKm
  const easyFuture = future.filter((s) => s.type === 'easy')
  if (Math.abs(delta) >= 1 && easyFuture.length > 0) {
    if (delta < 0) {
      const totalEasy = easyFuture.reduce((sum, s) => sum + km(s), 0)
      const factor = totalEasy > 0 ? Math.max(0.5, (totalEasy + delta) / totalEasy) : 1
      for (const session of easyFuture) {
        const before = km(session)
        const nextKm = Math.max(4, Math.round(before * factor * 10) / 10)
        if (nextKm < before - 0.05) {
          const distance = Math.round(nextKm * 1000)
          session.distanceM = distance
          session.title = `轻松跑 ${formatKm(distance)}（按实际调整）`
          session.details = `实际跑量高于计划；今天轻松跑 ${formatKm(distance)} @ ${paceText}。`
          session.status = 'adjusted'
          changed = true
        }
      }
      reasons.push('实际跑量高于计划，未来轻松跑下调')
      newAdjustments.push({
        plannedSessionId: easyFuture[0].id,
        action: 'adjust-volume',
        reason: '实际跑量高于计划，未来轻松跑下调',
        at: nowIso(),
      })
    } else {
      let remaining = delta
      for (const session of easyFuture) {
        if (remaining <= 0.2) break
        const before = km(session)
        const cap = session.date === addDaysIso(longPlanned?.date ?? weekEnd, -1) ? 10 : 14
        const nextKm = Math.min(cap, Math.round((before + remaining) * 10) / 10)
        const added = nextKm - before
        if (added <= 0.05) continue
        const distance = Math.round(nextKm * 1000)
        session.distanceM = distance
        session.title = `轻松跑 ${formatKm(distance)}（按实际调整）`
        session.details = `实际跑量低于计划；今天轻松跑 ${formatKm(distance)} @ ${paceText}。`
        session.status = 'adjusted'
        remaining -= added
        changed = true
      }
      if (remaining < delta - 0.2) {
        reasons.push('实际跑量低于计划，未来轻松跑上调')
        newAdjustments.push({
          plannedSessionId: easyFuture[0].id,
          action: 'adjust-volume',
          reason: '实际跑量低于计划，未来轻松跑上调',
          at: nowIso(),
        })
      }
    }
  }

  if (!changed) return null

  const baseRationale = plan.rationale
    .split('；按实际训练调整：')[0]
    .replace(/[。；;]\s*$/, '')
  const joined = [...new Set(reasons)]
  return {
    ...plan,
    version: plan.version + 1,
    status: 'active',
    plannedSessions: planned,
    adjustments: [...plan.adjustments, ...newAdjustments].slice(-30),
    rationale: joined.length > 0 ? `${baseRationale}；按实际训练调整：${joined.join('；')}` : baseRationale,
    createdAt: nowIso(),
  }
}

