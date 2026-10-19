import { daysBetween, round } from './format'
import type { IsoDate, Milestone } from './types'
import { GOAL_VDOT } from './vdot'

export function riegelTime(
  fromDistanceM: number,
  fromTimeSec: number,
  toDistanceM: number,
  exponent = 1.06,
): number {
  return fromTimeSec * (toDistanceM / fromDistanceM) ** exponent
}

export function riegel5k(fromDistanceM: number, fromTimeSec: number): number {
  return riegelTime(fromDistanceM, fromTimeSec, 5000)
}

export interface GoalTier {
  key: 'A' | 'B' | 'C' | 'D'
  label: string
  timeSec: number
}

export const GOAL_TIERS: GoalTier[] = [
  { key: 'A', label: 'sub-17:00', timeSec: 17 * 60 },
  { key: 'B', label: 'sub-17:30', timeSec: 17 * 60 + 30 },
  { key: 'C', label: 'sub-18:00', timeSec: 18 * 60 },
  { key: 'D', label: 'sub-18:30', timeSec: 18 * 60 + 30 },
]

export function downgradeGoal(tier: GoalTier): GoalTier {
  const idx = GOAL_TIERS.findIndex((t) => t.key === tier.key)
  return GOAL_TIERS[Math.min(idx + 1, GOAL_TIERS.length - 1)]
}

export interface GoalConfidence {
  requiredGain: number
  requiredGainPerMonth: number
  level: 'low' | 'medium' | 'high'
  label: string
}

/**
 * Narrative probability is deliberately not exposed as a fake precise number.
 * We show the required monthly VDOT gain and a coarse level.
 */
export function goalConfidence(
  currentVdot: number,
  weeksRemaining: number,
  goalVdot: number = GOAL_VDOT,
): GoalConfidence {
  const months = Math.max(weeksRemaining / (52 / 12), 0.25)
  const requiredGain = goalVdot - currentVdot
  const perMonth = requiredGain / months
  let level: GoalConfidence['level'] = 'high'
  let label = '高'
  if (perMonth > 1.2) {
    level = 'low'
    label = '低'
  } else if (perMonth >= 0.8) {
    level = 'medium'
    label = '中'
  }
  return {
    requiredGain: round(requiredGain, 1),
    requiredGainPerMonth: round(perMonth, 2),
    level,
    label,
  }
}

export const MILESTONES: Milestone[] = [
  { week: 4, distanceM: 5000, targetSec: 19 * 60 + 15, label: '5 km 19:15', note: '目标优先：第一次校准' },
  { week: 8, distanceM: 5000, targetSec: 18 * 60 + 45, label: '5 km 18:45', note: '必须达标；否则不加量' },
  { week: 12, distanceM: 3000, targetSec: 10 * 60 + 50, label: '3 km 10:50', note: '5k ≈ 18:15' },
  { week: 16, distanceM: 5000, targetSec: 17 * 60 + 55, label: '5 km 17:55', note: '进入 sub-18:00' },
  { week: 20, distanceM: 5000, targetSec: 17 * 60 + 30, label: '5 km 17:30', note: '关键门槛，决定最终目标' },
  { week: 26, distanceM: 5000, targetSec: 17 * 60, label: '5 km 17:00', note: 'sub-17 目标' },
]

export function milestoneForWeek(week: number): Milestone | undefined {
  return MILESTONES.find((m) => m.week === week)
}

/** 1.0 through 4 weeks, linear to 0.9 at 8 weeks, then unusable. */
export function vdotWeight(ageDays: number): number {
  if (ageDays <= 28) return 1
  if (ageDays >= 56) return 0
  return 1 - 0.1 * ((ageDays - 28) / 28)
}

export interface VdotTest {
  date: IsoDate
  distanceM: number
  timeSec: number
  vdot: number
}

export function bestCurrentVdot(
  tests: VdotTest[],
  today: IsoDate,
): { vdot: number; test: VdotTest } | null {
  let best: { vdot: number; test: VdotTest } | null = null
  for (const test of tests) {
    const weight = vdotWeight(daysBetween(test.date, today))
    if (weight <= 0) continue
    const effective = test.vdot * weight
    if (!best || effective > best.vdot) best = { vdot: effective, test }
  }
  return best
}

export function formatGoalGap(current5kSec: number, goalSec = 17 * 60): string {
  const diff = current5kSec - goalSec
  if (diff <= 0) return '已达标'
  const m = Math.floor(diff / 60)
  const s = Math.round(diff % 60)
  return `差 ${m}:${s.toString().padStart(2, '0')}`
}
