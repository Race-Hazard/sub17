import { round } from './format'
import { MILESTONES } from './projection'
import type { Checkin, Plan, PlannedSession, Session } from './types'

export interface WeekFeedback {
  completionRate: number
  qualityCompletionRate: number
  greenDays: number
  redDays: number
  acwr: number | null
  sleepDebtMin: number | null
  painScore: number | null
  previousTargetKm: number
  baseTargetKm: number
  checkpointVerdict?: CheckpointVerdict | null
}

export interface WeekAdjustment {
  targetKm: number
  rationale: string
  level: 'progress' | 'hold' | 'reduce'
}

/**
 * The weekly bridge between the static 26-week skeleton and what actually
 * happened. Safety always wins; then completion; then volume progression.
 */
export function adjustNextWeek(feedback: WeekFeedback): WeekAdjustment {
  const {
    completionRate,
    greenDays,
    redDays,
    acwr,
    sleepDebtMin,
    painScore,
    previousTargetKm,
    baseTargetKm,
    checkpointVerdict,
  } = feedback

  if (painScore != null && painScore >= 3) {
    return {
      targetKm: round(previousTargetKm * 0.7, 1),
      rationale: '疼痛 ≥3/10：下周减量 30%，取消质量课，优先恢复。',
      level: 'reduce',
    }
  }

  if (acwr != null && acwr > 1.5) {
    return {
      targetKm: round(baseTargetKm * 0.8, 1),
      rationale: `ACWR ${acwr.toFixed(2)} 超过 1.5：下周跑量 −20%，取消一次质量课。`,
      level: 'reduce',
    }
  }

  if (checkpointVerdict === 'slow') {
    return {
      targetKm: round(previousTargetKm * 0.95, 1),
      rationale: '检查点慢 >4%：目标下调一档，下周略减量并重算配速。',
      level: 'reduce',
    }
  }

  if (checkpointVerdict === 'slightlySlow') {
    return {
      targetKm: round(previousTargetKm, 1),
      rationale: '检查点慢 2–4%：保持当前跑量 1 周观察，不追加质量课。',
      level: 'hold',
    }
  }

  if (completionRate < 0.7 || redDays >= 2) {
    return {
      targetKm: round(previousTargetKm * 0.95, 1),
      rationale: '完成率 <70% 或红灯 ≥2 天：重复上周跑量，质量课总量 −20%。',
      level: 'hold',
    }
  }

  if (sleepDebtMin != null && sleepDebtMin > 300) {
    return {
      targetKm: round(baseTargetKm * 0.95, 1),
      rationale: '睡眠债 >5 h：下周略减量，增加一个完全休息日。',
      level: 'hold',
    }
  }

  if (completionRate >= 0.8 && greenDays >= 5 && (acwr == null || (acwr >= 0.8 && acwr <= 1.3))) {
    return {
      targetKm: round(baseTargetKm * 1.05, 1),
      rationale: '完成率 ≥80%、绿灯 ≥5 天、ACWR 在 0.8–1.3：按阶段目标 +5%。',
      level: 'progress',
    }
  }

  return {
    targetKm: baseTargetKm,
    rationale: '完成度与恢复处于可接受范围：按原计划推进。',
    level: 'progress',
  }
}

export type CheckpointVerdict = 'ahead' | 'onTrack' | 'slightlySlow' | 'slow'

export function checkpointVerdict(actualSec: number, targetSec: number): CheckpointVerdict {
  const diff = (actualSec - targetSec) / targetSec
  if (diff <= -0.015) return 'ahead'
  if (diff <= 0.02) return 'onTrack'
  if (diff <= 0.04) return 'slightlySlow'
  return 'slow'
}

export function checkpointAction(verdict: CheckpointVerdict): string {
  if (verdict === 'ahead') return '按新成绩上调配速；周跑量仍按原计划递增，不跳周。'
  if (verdict === 'onTrack') return '继续当前阶段。'
  if (verdict === 'slightlySlow') return '保持当前周跑量 1 周观察，不追加质量课。'
  return '保持 2 周并重算配速；若仍慢于目标 4%，目标下调一档。'
}

export function latestCheckpointVerdict(
  tests: { date: string; distanceM: number; timeSec: number }[],
  currentWeekIndex: number,
): CheckpointVerdict | null {
  const last = [...tests].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
  if (!last) return null
  const milestone = MILESTONES.filter(
    (m) => m.distanceM === last.distanceM && m.week <= currentWeekIndex,
  ).at(-1)
  if (!milestone) return null
  return checkpointVerdict(last.timeSec, milestone.targetSec)
}

export interface ComplianceResult {
  planned: number
  completed: number
  rate: number
  qualityPlanned: number
  qualityCompleted: number
  qualityRate: number
  missing: PlannedSession[]
}

const RUN_LIKE = new Set(['easy', 'long', 'threshold', 'interval', 'repetition', 'time_trial', 'race'])

function isQuality(session: PlannedSession): boolean {
  return ['threshold', 'interval', 'repetition', 'time_trial', 'race'].includes(session.type)
}

function matchingActual(planned: PlannedSession, sessions: Session[]): Session | undefined {
  return sessions.find(
    (s) =>
      s.date === planned.date &&
      (s.plannedSessionId === planned.id ||
        (RUN_LIKE.has(planned.type) && s.type !== 'rest' && s.type !== 'strength')),
  )
}

/**
 * Completion denominator: six runs + one rest day = 7. Strength is recorded
 * but does not count toward compliance.
 */
export function complianceForPlan(
  plan: Plan,
  sessions: Session[],
  checkins: Checkin[],
  ignoreBefore?: string,
): ComplianceResult {
  const counted = plan.plannedSessions.filter(
    (s) => s.countsTowardCompliance && (!ignoreBefore || s.date >= ignoreBefore),
  )
  const quality = counted.filter(isQuality)
  let completed = 0
  let qualityCompleted = 0
  const missing: PlannedSession[] = []

  for (const planned of counted) {
    if (planned.type === 'rest') {
      const rest = checkins.some((c) => c.date === planned.date && c.status === 'rest')
      if (rest) completed += 1
      else missing.push(planned)
      continue
    }
    const actual = matchingActual(planned, sessions)
    if (!actual) {
      missing.push(planned)
      continue
    }
    const durationOk =
      planned.durationMin == null ||
      planned.durationMin === 0 ||
      (actual.durationSec ?? 0) >= planned.durationMin * 60 * 0.8
    const requiredM = planned.testDistanceM ?? planned.distanceM
    const distanceOk =
      requiredM == null ||
      (actual.distanceM ?? 0) >= requiredM * (planned.testDistanceM ? 0.95 : 0.8)
    if (durationOk && distanceOk) {
      completed += 1
      if (isQuality(planned)) qualityCompleted += 1
    } else {
      missing.push(planned)
    }
  }

  return {
    planned: counted.length,
    completed,
    rate: counted.length > 0 ? completed / counted.length : 0,
    qualityPlanned: quality.length,
    qualityCompleted,
    qualityRate: quality.length > 0 ? qualityCompleted / quality.length : 0,
    missing,
  }
}
