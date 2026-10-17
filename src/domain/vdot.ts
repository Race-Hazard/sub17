import type { PaceRange, TrainingZone, VdotResult } from './types'

/**
 * Daniels' running formulas.
 * v is velocity in metres per minute; t is duration in minutes.
 */
export function vo2AtVelocity(vMetersPerMin: number): number {
  return -4.6 + 0.182258 * vMetersPerMin + 0.000104 * vMetersPerMin ** 2
}

export function percentVo2maxAtDuration(tMinutes: number): number {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * tMinutes) +
    0.2989558 * Math.exp(-0.1932605 * tMinutes)
  )
}

export function vdotFromPerformance(distanceM: number, durationSec: number): number {
  if (distanceM <= 0 || durationSec <= 0) {
    throw new Error('distanceM and durationSec must be positive')
  }
  const t = durationSec / 60
  const v = distanceM / t
  return vo2AtVelocity(v) / percentVo2maxAtDuration(t)
}

/** Invert VO2(v) = target for velocity (m/min). */
export function velocityForVo2(targetVo2: number): number {
  const a = 0.000104
  const b = 0.182258
  const c = -(targetVo2 + 4.6)
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
}

export function paceSecKmForPercent(vdot: number, fraction: number): number {
  if (vdot <= 0 || fraction <= 0) return Number.NaN
  const v = velocityForVo2(vdot * fraction)
  return (1000 / v) * 60
}

/**
 * Training pace bands. Fractions of VDOT are the usual Daniels intensity
 * percentages. fastSecKm is the faster (smaller) bound.
 */
export function trainingPaces(vdot: number): Record<'E' | 'M' | 'T' | 'I' | 'R', PaceRange> {
  const band = (slowPct: number, fastPct: number): PaceRange => ({
    fastSecKm: paceSecKmForPercent(vdot, fastPct),
    slowSecKm: paceSecKmForPercent(vdot, slowPct),
  })
  return {
    E: band(0.65, 0.75),
    M: band(0.8, 0.84),
    T: band(0.88, 0.9),
    I: band(0.97, 1.0),
    R: band(1.05, 1.1),
  }
}

/** Solve for the performance time that would produce the given VDOT. */
export function equivalentTimeSec(vdot: number, distanceM: number): number {
  let lo = 45
  let hi = 24 * 3600
  for (let i = 0; i < 90; i += 1) {
    const mid = (lo + hi) / 2
    const candidate = vdotFromPerformance(distanceM, mid)
    if (candidate > vdot) {
      // Too fast for this VDOT: allow more time.
      lo = mid
    } else {
      hi = mid
    }
  }
  return (lo + hi) / 2
}

export function equivalentPaceSecKm(vdot: number, distanceM: number): number {
  return (equivalentTimeSec(vdot, distanceM) / distanceM) * 1000
}

export function vdotSummary(distanceM: number, durationSec: number): VdotResult {
  const vdot = vdotFromPerformance(distanceM, durationSec)
  return {
    vdot,
    equivalent5kSec: equivalentTimeSec(vdot, 5000),
    equivalent3kSec: equivalentTimeSec(vdot, 3000),
  }
}

/** VDOT inputs are only valid for maximal efforts of at least 1500 m. */
export function isValidVdotInput(distanceM: number, isTest: boolean): boolean {
  return isTest && distanceM >= 1500
}

/**
 * Practical easy pace for this athlete: the slow end of Daniels' E band.
 * The full E band reaches close to marathon pace, which is too fast for most
 * daily easy runs (and is the exact mistake the plan is trying to fix).
 */
export function practicalEasyPace(vdot: number): PaceRange {
  return {
    fastSecKm: paceSecKmForPercent(vdot, 0.7),
    slowSecKm: paceSecKmForPercent(vdot, 0.65),
  }
}

export function zonePace(
  vdot: number,
  zone: TrainingZone,
): PaceRange {
  const paces = trainingPaces(vdot)
  if (zone === '5K') {
    const pace = equivalentPaceSecKm(vdot, 5000)
    return { fastSecKm: pace, slowSecKm: pace }
  }
  return paces[zone]
}

/** VDOT required to hit a goal time. */
export function vdotForGoal(distanceM: number, goalSec: number): number {
  return vdotFromPerformance(distanceM, goalSec)
}

export function equivalentTimeLabel(vdot: number, distanceM: number): string {
  const sec = equivalentTimeSec(vdot, distanceM)
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export const GOAL_5K_SEC = 17 * 60
export const GOAL_VDOT = vdotForGoal(5000, GOAL_5K_SEC)
