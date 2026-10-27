import {
  addDaysIso,
  daysBetween,
  formatKm,
  formatPaceRange,
  formatShortDate,
  nowIso,
  uid,
} from './format'
import type {
  IsoDate,
  PaceRange,
  Plan,
  PlannedSession,
  PlannedWorkout,
  SessionType,
  TestDay,
} from './types'
import { equivalentPaceSecKm, practicalEasyPace } from './vdot'

const QUALITY_TYPES: SessionType[] = [
  'interval',
  'repetition',
  'threshold',
  'time_trial',
  'race',
]

/** Hard sessions within this many days of the test become easy runs. */
const QUALITY_WINDOW_DAYS = 2
/** Long runs are also reduced within this window (includes weekend long runs). */
const LONG_WINDOW_DAYS = 3

function paceEqual(a: PaceRange | null | undefined, b: PaceRange | null | undefined): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.fastSecKm === b.fastSecKm && a.slowSecKm === b.slowSecKm
}

function workoutEqual(a: PlannedWorkout | undefined, b: PlannedWorkout | undefined): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return (
    a.mode === b.mode &&
    a.zone === b.zone &&
    a.reps === b.reps &&
    a.repDistanceM === b.repDistanceM &&
    a.recoverySec === b.recoverySec &&
    a.continuousMin === b.continuousMin &&
    a.adviceFromSessionId === b.adviceFromSessionId
  )
}

function sameSession(a: PlannedSession, b: PlannedSession): boolean {
  return (
    a.date === b.date &&
    a.type === b.type &&
    a.title === b.title &&
    a.zone === b.zone &&
    a.distanceM === b.distanceM &&
    a.testDistanceM === b.testDistanceM &&
    a.targetTimeSec === b.targetTimeSec &&
    a.purpose === b.purpose &&
    a.details === b.details &&
    a.downgrade === b.downgrade &&
    a.countsTowardCompliance === b.countsTowardCompliance &&
    a.status === b.status &&
    a.locked === b.locked &&
    paceEqual(a.targetPace, b.targetPace) &&
    workoutEqual(a.workout, b.workout)
  )
}

/** Build the planned time-trial session for a manually scheduled test day. */
export function testDaySession(testDay: TestDay, vdot: number): PlannedSession {
  const distanceM = Math.max(1000, Math.round(testDay.distanceM))
  const targetPaceSecKm =
    testDay.targetTimeSec && testDay.targetTimeSec > 0
      ? (testDay.targetTimeSec / distanceM) * 1000
      : equivalentPaceSecKm(vdot, distanceM)
  return {
    id: uid(),
    date: testDay.date,
    type: 'time_trial',
    title: `${formatKm(distanceM)} 计时赛`,
    zone: '5K',
    distanceM: distanceM + 4000,
    testDistanceM: distanceM,
    targetTimeSec: testDay.targetTimeSec,
    targetPace: { fastSecKm: targetPaceSecKm, slowSecKm: targetPaceSecKm },
    workout: {
      mode: 'interval',
      zone: '5K',
      reps: 1,
      repDistanceM: distanceM,
    },
    purpose: testDay.note?.trim() || '临时测试日：校准当前能力，不追成绩',
    details: `热身 2–3 km + 3×60 m 加速跑，休息 5–10 分钟；${formatKm(distanceM)} 全力计时，记录每 400 m 分段；前 400 m 保守 2–3 秒；结束后 2 km 放松。`,
    downgrade: '状态红：改 3 km 轻松节奏，不硬测',
    countsTowardCompliance: true,
    status: 'pending',
    locked: true,
  }
}

function asEasy(
  session: PlannedSession,
  distanceM: number,
  title: string,
  details: string,
  purpose: string,
  vdot: number,
): PlannedSession {
  const pace = practicalEasyPace(vdot)
  return {
    ...session,
    type: 'easy',
    zone: 'E',
    distanceM,
    targetPace: null,
    targetTimeSec: undefined,
    testDistanceM: undefined,
    workout: undefined,
    title,
    details: `${details} 轻松跑 ${formatKm(distanceM)} @ ${formatPaceRange(
      pace.fastSecKm,
      pace.slowSecKm,
    )}/km，保持可对话。`,
    purpose,
    status: 'adjusted',
    locked: false,
  }
}

function easyForOffset(
  session: PlannedSession,
  offset: number,
  vdot: number,
): PlannedSession {
  if (offset === -1) {
    return asEasy(
      session,
      5000,
      '赛前轻松跑 5 km',
      '为计时赛蓄力，结束后 4×20 秒加速跑。',
      '赛前唤醒',
      vdot,
    )
  }
  if (offset === 1) {
    return asEasy(
      session,
      5000,
      '赛后恢复跑 5 km',
      '测试后恢复，不追配速。',
      '恢复',
      vdot,
    )
  }
  return asEasy(
    session,
    6000,
    '轻松跑 6 km（测试周调整）',
    '为测试日让路，取消强度刺激。',
    '为测试日让路',
    vdot,
  )
}

function longForOffset(
  session: PlannedSession,
  offset: number,
  vdot: number,
): PlannedSession {
  const distanceM =
    offset < 0
      ? offset === -1
        ? 5000
        : offset === -2
          ? 7000
          : 9000
      : offset === 1
        ? 5000
        : offset === 2
          ? 8000
          : 10000
  return asEasy(
    session,
    distanceM,
    offset === -1
      ? `赛前中长跑 ${formatKm(distanceM)}`
      : `长距离缩减为 ${formatKm(distanceM)}（测试周）`,
    offset < 0
      ? '测试前不堆长距离，保持腿部新鲜。'
      : '测试后先恢复，再逐步回到长距离。',
    offset < 0 ? '为测试日减量' : '测试后恢复',
    vdot,
  )
}

export interface ApplyTestDayInput {
  plan: Plan
  testDay: TestDay
  vdot: number
  today: IsoDate
}

/**
 * Put a manual time trial on its date and make room around it: quality
 * sessions within 48 hours and long runs within 72 hours become easy runs.
 * Locked (manually scheduled) sessions are never downgraded, and days that
 * already have actual training are left alone.
 */
export function applyTestDayToPlan(input: ApplyTestDayInput): {
  plan: Plan
  changed: boolean
  reasons: string[]
} {
  const { plan, testDay, vdot, today } = input
  const weekStart = plan.weekStart
  const weekEnd = addDaysIso(weekStart, 6)
  const nearWeek =
    testDay.date >= addDaysIso(weekStart, -LONG_WINDOW_DAYS) &&
    testDay.date <= addDaysIso(weekEnd, LONG_WINDOW_DAYS)
  if (!nearWeek || testDay.date < today) {
    return { plan, changed: false, reasons: [] }
  }

  const sessions = plan.plannedSessions.map((session) => ({ ...session }))
  const reasons: string[] = []
  const changes: Plan['adjustments'] = []
  let changed = false

  const inThisWeek = testDay.date >= weekStart && testDay.date <= weekEnd
  if (inThisWeek) {
    const targetIndex = sessions.findIndex((session) => session.date === testDay.date)
    const next = testDaySession(testDay, vdot)
    if (targetIndex >= 0) {
      next.id = sessions[targetIndex].id
      if (!sameSession(sessions[targetIndex], next)) {
        sessions[targetIndex] = next
        changed = true
        reasons.push(
          `${formatShortDate(testDay.date)} 设为 ${formatKm(testDay.distanceM)} 计时赛`,
        )
        changes.push({
          plannedSessionId: next.id,
          action: 'schedule-test',
          reason: `临时测试日：${formatKm(testDay.distanceM)} 计时赛`,
          at: nowIso(),
        })
      }
    } else {
      sessions.push(next)
      changed = true
      reasons.push(
        `${formatShortDate(testDay.date)} 设为 ${formatKm(testDay.distanceM)} 计时赛`,
      )
      changes.push({
        plannedSessionId: next.id,
        action: 'schedule-test',
        reason: `临时测试日：${formatKm(testDay.distanceM)} 计时赛`,
        at: nowIso(),
      })
    }
  }

  for (const session of sessions) {
    if (session.date === testDay.date) continue
    if (session.date < today) continue
    if (session.locked) continue
    const offset = daysBetween(testDay.date, session.date)
    let next: PlannedSession | null = null
    if (QUALITY_TYPES.includes(session.type) && Math.abs(offset) <= QUALITY_WINDOW_DAYS) {
      next = easyForOffset(session, offset, vdot)
    } else if (session.type === 'long' && Math.abs(offset) <= LONG_WINDOW_DAYS) {
      next = longForOffset(session, offset, vdot)
    }
    if (!next || sameSession(session, next)) continue
    Object.assign(session, next)
    changed = true
    const reason =
      offset < 0
        ? `测试日 ${formatShortDate(testDay.date)} 前 ${Math.abs(offset)} 天，强度课/长距离降为轻松跑`
        : `测试日 ${formatShortDate(testDay.date)} 后 ${offset} 天，强度课/长距离降为轻松跑`
    reasons.push(reason)
    changes.push({
      plannedSessionId: session.id,
      action: 'schedule-test',
      reason,
      at: nowIso(),
    })
  }

  if (!changed) return { plan, changed: false, reasons: [] }

  sessions.sort((a, b) => a.date.localeCompare(b.date))
  const marker = `临时测试日 ${formatShortDate(testDay.date)}`
  const rationale = plan.rationale.includes(marker)
    ? plan.rationale
    : `${plan.rationale.replace(/[。；;]\s*$/, '')}；${marker}：${formatKm(
        testDay.distanceM,
      )} 计时赛，前后 2–3 天强度课已降级。`

  return {
    plan: {
      ...plan,
      version: plan.version + 1,
      plannedSessions: sessions,
      adjustments: [...plan.adjustments, ...changes].slice(-30),
      rationale,
      createdAt: nowIso(),
    },
    changed: true,
    reasons,
  }
}

/** Apply every stored test day that can affect this plan (including adjacent days). */
export function applyTestDaysToPlan(
  plan: Plan,
  testDays: TestDay[],
  vdot: number,
  today: IsoDate,
): { plan: Plan; changed: boolean; reasons: string[] } {
  let current = plan
  let changed = false
  const reasons: string[] = []
  for (const testDay of [...testDays].sort((a, b) => a.date.localeCompare(b.date))) {
    const result = applyTestDayToPlan({ plan: current, testDay, vdot, today })
    if (result.changed) {
      current = result.plan
      changed = true
      reasons.push(...result.reasons)
    }
  }
  return { plan: current, changed, reasons }
}
