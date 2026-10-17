import type { LoadSummary, Readiness, ReadinessLevel } from './types'

export interface ReadinessInput {
  sleepMin: number | null
  painScore: number | null
  rpeDrift: number | null
  load: LoadSummary
  hasRpeData: boolean
  override?: ReadinessLevel | null
  overrideReason?: string
}

/**
 * Deliberately coarse: no watch means sleep and RPE are the only reliable
 * inputs. A three-level signal with explicit reasons beats a fake 0–100 score.
 */
export function evaluateReadiness(input: ReadinessInput): Readiness {
  if (input.override) {
    return {
      level: input.override,
      reasons: [input.overrideReason ?? '手动覆盖'],
      overridden: true,
    }
  }

  const reasons: string[] = []
  let level: ReadinessLevel = 'green'

  if (input.sleepMin == null) {
    level = 'yellow'
    reasons.push('缺少昨晚睡眠记录')
  } else if (input.sleepMin < 360) {
    level = 'red'
    reasons.push(`睡眠 ${(input.sleepMin / 60).toFixed(1)} 小时，低于 6 小时`)
  } else if (input.sleepMin < 420) {
    level = worsen(level, 'yellow')
    reasons.push(`睡眠 ${(input.sleepMin / 60).toFixed(1)} 小时，低于 7 小时`)
  }

  if (input.painScore != null && input.painScore >= 3) {
    level = 'red'
    reasons.push(`疼痛 ${input.painScore}/10`)
  }

  if (input.rpeDrift != null) {
    if (input.rpeDrift >= 2) {
      level = 'red'
      reasons.push('同配速 RPE 比平时高 2 分以上')
    } else if (input.rpeDrift >= 1) {
      level = worsen(level, 'yellow')
      reasons.push('同配速 RPE 比平时高 1 分')
    }
  } else if (!input.hasRpeData) {
    level = 'yellow'
    reasons.push('缺少近期 RPE 基线')
  }

  if (input.load.status === 'high') {
    level = 'red'
    reasons.push(`ACWR ${input.load.acwr?.toFixed(2)}，超过 1.5`)
  } else if (input.load.status === 'elevated') {
    level = worsen(level, 'yellow')
    reasons.push(`ACWR ${input.load.acwr?.toFixed(2)}，偏高`)
  }

  if (reasons.length === 0) {
    reasons.push('睡眠、RPE、负荷都在可接受范围')
  }

  return { level, reasons, overridden: false }
}

const ORDER: ReadinessLevel[] = ['green', 'yellow', 'red']

function worsen(current: ReadinessLevel, next: ReadinessLevel): ReadinessLevel {
  return ORDER.indexOf(next) > ORDER.indexOf(current) ? next : current
}

export function readinessLabel(level: ReadinessLevel): string {
  if (level === 'green') return '绿'
  if (level === 'yellow') return '黄'
  return '红'
}

export function readinessAdvice(level: ReadinessLevel): string {
  if (level === 'green') return '按计划训练'
  if (level === 'yellow') return '质量课总量 −20%，其余按计划'
  return '质量课降为轻松跑；连续两天红则完全休息'
}
