import {
  addDaysIso,
  clamp,
  formatDuration,
  formatKm,
  formatPaceRange,
  formatWeekday,
  mondayOf,
  round,
  uid,
} from './format'
import type {
  IsoDate,
  PaceRange,
  Plan,
  PlannedSession,
  Profile,
  TrainingZone,
} from './types'
import { equivalentPaceSecKm, practicalEasyPace, trainingPaces, zonePace } from './vdot'

type Phase = 1 | 2 | 3 | 4 | 5

interface WorkoutBlueprint {
  kind: 'interval' | 'continuous' | 'test' | 'easy'
  zone?: TrainingZone
  reps?: number
  repDistanceM?: number
  recoverySec?: number
  continuousMin?: number
  testDistanceM?: number
  targetTimeSec?: number
  extra?: string
  purpose: string
}

interface WeekBlueprint {
  week: number
  phase: Phase
  targetKm: number
  longKm: number
  q1: WorkoutBlueprint
  q2: WorkoutBlueprint
  longNote?: string
  down?: boolean
  raceWeek?: boolean
  raceTargetSec?: number
}

const EASY_PURPOSE = '有氧恢复，保持轻松可对话'
const STRIDES_PURPOSE = '神经募集与跑姿，不产生明显疲劳'

function interval(
  reps: number,
  repDistanceM: number,
  zone: TrainingZone,
  recoverySec: number,
  purpose: string,
  extra?: string,
): WorkoutBlueprint {
  return { kind: 'interval', reps, repDistanceM, zone, recoverySec, purpose, extra }
}

function continuous(
  continuousMin: number,
  zone: TrainingZone,
  purpose: string,
): WorkoutBlueprint {
  return { kind: 'continuous', continuousMin, zone, purpose }
}

function test(distanceM: number, targetTimeSec: number, purpose: string): WorkoutBlueprint {
  return { kind: 'test', testDistanceM: distanceM, targetTimeSec, purpose }
}

const EASY_Q1: WorkoutBlueprint = {
  kind: 'easy',
  zone: 'E',
  purpose: `${EASY_PURPOSE}；为周五计时赛蓄力`,
}

const PHASE_NAMES: Record<Phase, string> = {
  1: '有氧基础与速度储备',
  2: '阈值强化',
  3: '5K 专项有氧功率',
  4: '峰值与比赛专项',
  5: '减量与测试',
}

/**
 * The 26-week sequence from the plan. Paces are not stored here: they are
 * derived from the current VDOT when a week is generated.
 */
export const WEEK_BLUEPRINTS: WeekBlueprint[] = [
  { week: 1, phase: 1, targetKm: 40, longKm: 12, q1: interval(5, 600, 'I', 120, '建立速度耐力，不追求极限'), q2: continuous(25, 'T', '引入阈值刺激') },
  { week: 2, phase: 1, targetKm: 44, longKm: 13, q1: interval(6, 600, 'I', 120, '延长 VO2max 刺激'), q2: continuous(28, 'T', '阈值巡航') },
  { week: 3, phase: 1, targetKm: 48, longKm: 14, q1: interval(6, 800, 'I', 120, 'VO2max 刺激'), q2: interval(3, 2000, 'T', 90, '阈值分段') },
  { week: 4, phase: 1, targetKm: 38, longKm: 10, down: true, q1: EASY_Q1, q2: test(5000, 19 * 60 + 15, '目标优先第一次校准') },
  { week: 5, phase: 1, targetKm: 52, longKm: 15, q1: interval(6, 1000, 'I', 150, 'VO2max 刺激'), q2: continuous(30, 'T', '阈值巡航') },
  { week: 6, phase: 1, targetKm: 56, longKm: 15, q1: interval(8, 400, 'R', 90, '速度与跑步经济性'), q2: interval(3, 2000, 'T', 90, '阈值分段') },

  { week: 7, phase: 2, targetKm: 60, longKm: 16, q1: interval(5, 1000, 'I', 75, '阈值与 VO2 交界'), q2: interval(3, 2000, 'T', 90, '阈值分段') },
  { week: 8, phase: 2, targetKm: 46, longKm: 12, down: true, q1: EASY_Q1, q2: test(5000, 18 * 60 + 45, '第二个 5 km 门槛，必须达标') },
  { week: 9, phase: 2, targetKm: 62, longKm: 16, q1: interval(6, 1000, 'I', 75, '阈值与 VO2 交界'), q2: interval(4, 2000, 'T', 90, '阈值分段') },
  { week: 10, phase: 2, targetKm: 65, longKm: 17, q1: interval(6, 1000, 'I', 75, 'VO2max 刺激'), q2: interval(2, 3000, 'T', 120, '长阈值分段'), longNote: '最后 3 km @ M' },
  { week: 11, phase: 2, targetKm: 67, longKm: 17, q1: interval(6, 1000, 'T', 75, '阈值维持'), q2: continuous(35, 'T', '连续阈值巡航') },
  { week: 12, phase: 2, targetKm: 50, longKm: 13, down: true, q1: EASY_Q1, q2: test(3000, 10 * 60 + 50, '3 km 阈值校准') },

  { week: 13, phase: 3, targetKm: 68, longKm: 17, q1: interval(6, 1000, 'I', 150, '5K 专项 VO2'), q2: interval(4, 1600, 'T', 90, '阈值分段') },
  { week: 14, phase: 3, targetKm: 70, longKm: 18, q1: interval(6, 1000, 'I', 150, '5K 专项 VO2'), q2: interval(3, 2000, 'T', 90, '阈值分段') },
  { week: 15, phase: 3, targetKm: 70, longKm: 18, q1: interval(8, 800, 'I', 120, '延长 5K 专项刺激'), q2: interval(3, 2000, 'T', 90, '阈值分段'), longNote: '最后 5 km @ M/T' },
  { week: 16, phase: 3, targetKm: 52, longKm: 13, down: true, q1: EASY_Q1, q2: test(5000, 17 * 60 + 55, '专项期 5 km 门槛') },
  { week: 17, phase: 3, targetKm: 72, longKm: 18, q1: interval(6, 1000, 'I', 120, '5K 专项 VO2'), q2: interval(2, 3000, '5K', 120, '5K 配速适应') },
  { week: 18, phase: 3, targetKm: 72, longKm: 18, q1: interval(8, 800, 'I', 120, '5K 专项 VO2'), q2: interval(2, 3000, '5K', 120, '5K 配速适应') },

  { week: 19, phase: 4, targetKm: 72, longKm: 18, q1: interval(5, 1000, '5K', 120, '5K 配速耐受'), q2: interval(3, 2000, '5K', 120, '5K 配速适应') },
  { week: 20, phase: 4, targetKm: 54, longKm: 14, down: true, q1: EASY_Q1, q2: test(5000, 17 * 60 + 30, '目标优先关键门槛') },
  { week: 21, phase: 4, targetKm: 72, longKm: 18, q1: interval(5, 1000, '5K', 120, '5K 配速耐受'), q2: interval(3, 2000, '5K', 120, '5K 配速适应', '最后加 4×200 m @ R') },
  { week: 22, phase: 4, targetKm: 72, longKm: 18, q1: interval(8, 400, 'R', 75, '速度和换挡'), q2: interval(2, 3000, '5K', 120, '5K 配速耐受', '最后加 4×200 m @ R') },
  { week: 23, phase: 4, targetKm: 68, longKm: 17, q1: interval(6, 1000, '5K', 120, '5K 配速耐受'), q2: interval(2, 3000, '5K', 120, '5K 配速耐受') },

  { week: 24, phase: 5, targetKm: 50, longKm: 12, down: true, q1: interval(4, 800, 'I', 120, '保持强度感觉'), q2: interval(2, 1000, '5K', 90, '5K 配速', '最后加 4×200 m @ R') },
  { week: 25, phase: 5, targetKm: 44, longKm: 12, q1: interval(6, 400, '5K', 90, '5K 配速唤醒'), q2: interval(2, 1000, 'T', 90, '阈值维持') },
  { week: 26, phase: 5, targetKm: 36, longKm: 0, raceWeek: true, raceTargetSec: 17 * 60, q1: interval(4, 400, '5K', 90, '赛前唤醒'), q2: interval(3, 200, 'R', 90, '赛前速度感觉') },
]

export function phaseForWeek(week: number): Phase {
  const bp = WEEK_BLUEPRINTS.find((w) => w.week === week)
  return bp?.phase ?? 5
}

export function phaseName(phase: number): string {
  return PHASE_NAMES[phase as Phase] ?? '训练'
}

export function weeklyTargetKm(week: number): number {
  return WEEK_BLUEPRINTS.find((w) => w.week === week)?.targetKm ?? 30
}

export function getWeekIndex(startDate: IsoDate, today: IsoDate): number {
  if (today < startDate) return 0
  const start = new Date(`${startDate}T00:00:00`).getTime()
  const now = new Date(`${today}T00:00:00`).getTime()
  const days = Math.floor((now - start) / 86400000)
  return clamp(Math.floor(days / 7) + 1, 1, 26)
}

export function nextMonday(iso: IsoDate): IsoDate {
  const monday = mondayOf(iso)
  return monday > iso ? monday : addDaysIso(monday, 7)
}

export function formatWorkoutPace(
  bp: WorkoutBlueprint,
  vdot: number,
): PaceRange | null {
  if (bp.kind === 'test') return null
  if (bp.zone) return zonePace(vdot, bp.zone)
  return null
}

function workoutMainKm(bp: WorkoutBlueprint, vdot: number): number {
  if (bp.kind === 'interval' && bp.reps && bp.repDistanceM) {
    return (bp.reps * bp.repDistanceM) / 1000
  }
  if (bp.kind === 'continuous' && bp.continuousMin) {
    const pace = zonePace(vdot, bp.zone ?? 'T')
    const avg = (pace.fastSecKm + pace.slowSecKm) / 2
    return (bp.continuousMin * 60) / avg
  }
  if (bp.kind === 'test' && bp.testDistanceM) {
    return bp.testDistanceM / 1000
  }
  return 0
}

function totalKmForWorkout(bp: WorkoutBlueprint, vdot: number): number {
  if (bp.kind === 'easy') return 5
  return workoutMainKm(bp, vdot) + 4 // warm-up + cool-down
}

function workoutDetails(
  bp: WorkoutBlueprint,
  vdot: number,
): { title: string; details: string; distanceM?: number; testDistanceM?: number; durationMin?: number; targetPace: PaceRange | null; targetTimeSec?: number } {
  if (bp.kind === 'easy') {
    const pace = practicalEasyPace(vdot)
    return {
      title: '轻松跑',
      details: `轻松跑 @ ${formatPaceRange(pace.fastSecKm, pace.slowSecKm)}/km，保持可对话；结束后 6×20 s 加速跑。`,
      distanceM: 5000,
      targetPace: pace,
    }
  }

  if (bp.kind === 'test') {
    const distanceM = bp.testDistanceM ?? 5000
    const targetTimeSec = bp.targetTimeSec ?? 0
    const pace = targetTimeSec > 0 ? (targetTimeSec / distanceM) * 1000 : null
    return {
      title: `${formatKm(distanceM)} 计时赛`,
      details: `热身 2–3 km + 3×60 m 加速跑，休息 5–10 min；${formatKm(distanceM)} 全力计时，记录每 400 m 分段；前 400 m 保守 2–3 s；结束后 2 km 放松。`,
      distanceM: distanceM + 4000,
      testDistanceM: distanceM,
      targetPace: pace ? { fastSecKm: pace, slowSecKm: pace } : null,
      targetTimeSec,
    }
  }

  const pace = bp.zone ? zonePace(vdot, bp.zone) : null
  if (bp.kind === 'continuous') {
    const mainKm = workoutMainKm(bp, vdot)
    const min = bp.continuousMin ?? 20
    return {
      title: `${min} min 阈值跑`,
      details: `热身 2 km；${min} min 连续 @ ${formatPaceRange(pace?.fastSecKm, pace?.slowSecKm)}/km；放松 2 km。`,
      distanceM: Math.round((mainKm + 4) * 1000),
      durationMin: Math.round((mainKm * ((pace!.fastSecKm + pace!.slowSecKm) / 2)) / 60 + 16),
      targetPace: pace,
    }
  }

  const reps = bp.reps ?? 4
  const repM = bp.repDistanceM ?? 800
  const repSecFast = (repM / 1000) * (pace?.fastSecKm ?? 0)
  const repSecSlow = (repM / 1000) * (pace?.slowSecKm ?? 0)
  const mainKm = (reps * repM) / 1000
  const extra = bp.extra ? `；${bp.extra}` : ''
  return {
    title: `${reps} × ${formatKm(repM)} ${bp.zone ?? ''}`,
    details: `热身 2 km；${reps} × ${formatKm(repM)} @ ${formatPaceRange(pace?.fastSecKm, pace?.slowSecKm)}/km（每组 ${formatDuration(repSecFast)}–${formatDuration(repSecSlow)}），组间 ${bp.recoverySec ?? 90} s 慢跑${extra}；放松 2 km。`,
    distanceM: Math.round((mainKm + 4) * 1000),
    targetPace: pace,
  }
}

interface EasyAllocation {
  mediumLong: number
  easy: number
  recovery: number
  long: number
}

function allocateEasyKm(
  targetKm: number,
  q1Km: number,
  q2Km: number,
  longKm: number,
): EasyAllocation {
  let long = longKm
  let remaining = targetKm - q1Km - q2Km - long
  if (remaining < 9 && long > 8) {
    const shrink = Math.min(9 - remaining, long - 8)
    long -= shrink
    remaining += shrink
  }
  remaining = Math.max(remaining, 9)
  let mediumLong = round(remaining * 0.45, 1)
  let easy = round(remaining * 0.35, 1)
  let recovery = round(remaining - mediumLong - easy, 1)
  if (recovery < 3) {
    const need = 3 - recovery
    recovery = 3
    mediumLong = Math.max(3, mediumLong - need / 2)
    easy = Math.max(3, easy - need / 2)
  }
  mediumLong = Math.max(3, mediumLong)
  easy = Math.max(3, easy)
  recovery = Math.max(3, recovery)
  const sum = mediumLong + easy + recovery
  const diff = round(remaining - sum, 1)
  mediumLong = Math.max(3, round(mediumLong + diff, 1))
  return { mediumLong, easy, recovery, long }
}

function simpleSession(
  date: IsoDate,
  type: PlannedSession['type'],
  title: string,
  details: string,
  opts: Partial<PlannedSession> = {},
): PlannedSession {
  return {
    id: uid(),
    date,
    type,
    title,
    details,
    purpose: '',
    downgrade: '状态红：改为轻松跑或休息',
    countsTowardCompliance: true,
    status: 'pending',
    ...opts,
  }
}

export interface GenerateWeekOptions {
  weekIndex: number
  weekStart: IsoDate
  vdot: number
  profile: Profile
  targetKmOverride?: number
  phaseOverride?: number
  rationale?: string
  version?: number
}

/**
 * Build one week of planned sessions. Session content is structural; the
 * concrete paces are computed from the VDOT passed in.
 */
export function generatePlanWeek(opts: GenerateWeekOptions): Plan {
  const { weekIndex, weekStart, vdot, profile } = opts
  const bp = WEEK_BLUEPRINTS.find((w) => w.week === weekIndex) ?? WEEK_BLUEPRINTS[25]
  const phase = (opts.phaseOverride as Phase | undefined) ?? bp.phase
  const targetKm = opts.targetKmOverride ?? bp.targetKm
  const sessions: PlannedSession[] = []

  const restDay = profile.restDay ?? 7
  const qualityDays = profile.qualityDays?.length >= 2 ? profile.qualityDays : [2, 4]
  const longDay = profile.longRunDay ?? 6
  const q1Day = qualityDays[0]
  const q2Day = qualityDays[1]
  const dayDate = (dayNumber: number) => addDaysIso(weekStart, dayNumber - 1)
  const weekday = (dayNumber: number) => formatWeekday(dayDate(dayNumber))
  const easyDays = [1, 2, 3, 4, 5, 6, 7].filter(
    (d) => d !== restDay && !qualityDays.includes(d) && d !== longDay,
  )
  const mediumLongDay =
    easyDays.find((d) => d > q1Day) ?? easyDays.find((d) => d !== restDay) ?? 3
  const stridesDay =
    easyDays.find((d) => d !== mediumLongDay && d < longDay) ??
    easyDays.find((d) => d !== mediumLongDay) ??
    5
  const recoveryDay =
    easyDays.find((d) => d !== mediumLongDay && d !== stridesDay) ?? 1
  const easyPace = practicalEasyPace(vdot)

  sessions.push(
    simpleSession(
      dayDate(restDay),
      'rest',
      '完全休息',
      '不跑；可做 10 min 拉伸/泡沫轴，睡眠优先。',
      {
        purpose: '恢复与适应',
        targetPace: null,
        durationMin: 0,
      },
    ),
  )

  if (bp.raceWeek) {
    const q1 = workoutDetails(bp.q1, vdot)
    const q2 = workoutDetails(bp.q2, vdot)
    const q1Km = totalKmForWorkout(bp.q1, vdot)
    const q2Km = totalKmForWorkout(bp.q2, vdot)
    const raceKm = 9
    const alloc = allocateEasyKm(targetKm, q1Km, q2Km + raceKm, 0)

    sessions.push(
      simpleSession(dayDate(q1Day), 'repetition', q1.title, q1.details, {
        zone: bp.q1.zone,
        distanceM: q1.distanceM,
        targetPace: q1.targetPace,
        purpose: bp.q1.purpose,
        downgrade: '状态黄：减到 3 组；红：改 20 min 轻松跑',
      }),
    )
    sessions.push(
      simpleSession(dayDate(mediumLongDay), 'easy', `轻松跑 ${alloc.mediumLong.toFixed(1)} km`, `轻松跑 ${alloc.mediumLong.toFixed(1)} km @ ${formatPaceRange(easyPace.fastSecKm, easyPace.slowSecKm)}/km。`, {
        distanceM: Math.round(alloc.mediumLong * 1000),
        zone: 'E',
        targetPace: easyPace,
        purpose: EASY_PURPOSE,
      }),
    )
    sessions.push(
      simpleSession(dayDate(q2Day), 'repetition', q2.title, q2.details, {
        zone: bp.q2.zone,
        distanceM: q2.distanceM,
        targetPace: q2.targetPace,
        purpose: bp.q2.purpose,
        downgrade: '状态黄：减到 2 组；红：只做 20 min 轻松跑',
      }),
    )
    sessions.push(
      simpleSession(dayDate(stridesDay), 'easy', '赛前轻松跑', '20 min 轻松跑 + 3×60 m 加速跑，不练到累。', {
        distanceM: Math.round(alloc.easy * 1000),
        zone: 'E',
        targetPace: easyPace,
        purpose: '赛前唤醒',
      }),
    )
    sessions.push(
      simpleSession(dayDate(recoveryDay), 'easy', '赛前恢复跑', '20–30 min 轻松跑，或完全休息。', {
        distanceM: Math.round(alloc.recovery * 1000),
        zone: 'E',
        targetPace: easyPace,
        purpose: '为比赛蓄力',
      }),
    )
    const raceTarget = bp.raceTargetSec ?? 17 * 60
    const racePace = raceTarget / 5
    sessions.push(
      simpleSession(dayDate(longDay), 'time_trial', '5 km 计时赛', '按 W20 的 5 km 配速执行；前 1 km 保守 2–3 s/400 m，最后 1 km 提速。', {
        distanceM: 9000,
        testDistanceM: 5000,
        zone: '5K',
        targetTimeSec: raceTarget,
        targetPace: { fastSecKm: racePace, slowSecKm: racePace },
        purpose: '6 个月最终测试；sub-17 为 stretch',
        downgrade: '状态红：改 3 km 轻松节奏，不硬测',
      }),
    )
  } else {
    const testWeek = bp.q2.kind === 'test'
    const q1 = workoutDetails(bp.q1, vdot)
    const q2 = workoutDetails(bp.q2, vdot)
    const q1Km = testWeek ? 5 : totalKmForWorkout(bp.q1, vdot)
    const q2Km = totalKmForWorkout(bp.q2, vdot)
    const alloc = allocateEasyKm(targetKm, q1Km, q2Km, bp.longKm)

    sessions.push(
      simpleSession(
        dayDate(q1Day),
        testWeek ? 'easy' : bp.q1.zone === 'R' ? 'repetition' : bp.q1.zone === 'T' ? 'threshold' : 'interval',
        q1.title,
        q1.details,
        {
          zone: bp.q1.zone,
          distanceM: q1.distanceM,
          targetPace: q1.targetPace,
          purpose: testWeek ? `${EASY_PURPOSE}；为计时赛蓄力` : bp.q1.purpose,
          downgrade: testWeek ? '不安排质量课；只做轻松跑 + 加速跑' : '状态黄：减 1–2 组；红：30 min 轻松跑 + 4×20 s',
        },
      ),
    )

    sessions.push(
      simpleSession(dayDate(mediumLongDay), 'easy', `中长跑 ${alloc.mediumLong.toFixed(1)} km + 力量 A`, `中长跑 ${alloc.mediumLong.toFixed(1)} km @ ${formatPaceRange(easyPace.fastSecKm, easyPace.slowSecKm)}/km；随后力量 A 30 min（深蹲、髋铰链、单腿、提踵）。`, {
        distanceM: Math.round(alloc.mediumLong * 1000),
        zone: 'E',
        targetPace: easyPace,
        purpose: '有氧容量 + 力量维持',
      }),
    )
    sessions.push(
      simpleSession(dayDate(stridesDay), 'easy', `轻松跑 ${alloc.easy.toFixed(1)} km + 加速跑`, `轻松跑 ${alloc.easy.toFixed(1)} km @ ${formatPaceRange(easyPace.fastSecKm, easyPace.slowSecKm)}/km；结束后 6×20 s 加速跑 + 核心 B 15 min。`, {
        distanceM: Math.round(alloc.easy * 1000),
        zone: 'E',
        targetPace: easyPace,
        purpose: `${STRIDES_PURPOSE}；核心/髋稳定`,
      }),
    )

    sessions.push(
      simpleSession(
        dayDate(q2Day),
        testWeek ? 'time_trial' : bp.q2.zone === 'T' ? 'threshold' : 'interval',
        q2.title,
        q2.details,
        {
          zone: bp.q2.zone,
          distanceM: q2.distanceM,
          testDistanceM: q2.testDistanceM,
          targetPace: q2.targetPace,
          targetTimeSec: q2.targetTimeSec,
          purpose: bp.q2.purpose,
          downgrade: testWeek ? '状态黄：改 3 km 节奏跑；红：改轻松跑' : '状态黄：减 1 组；红：30 min 轻松跑 + 4×20 s',
        },
      ),
    )

    sessions.push(
      simpleSession(dayDate(recoveryDay), 'easy', `恢复跑 ${alloc.recovery.toFixed(1)} km`, `恢复跑 ${alloc.recovery.toFixed(1)} km @ ${formatPaceRange(easyPace.fastSecKm, easyPace.slowSecKm)}/km，或完全休息。`, {
        distanceM: Math.round(alloc.recovery * 1000),
        zone: 'E',
        targetPace: easyPace,
        purpose: '恢复',
      }),
    )

    sessions.push(
      simpleSession(dayDate(longDay), 'long', `长距离 ${alloc.long.toFixed(0)} km`, `长距离 ${alloc.long.toFixed(0)} km @ ${formatPaceRange(easyPace.fastSecKm, easyPace.slowSecKm)}/km，保持可对话。${bp.longNote ? `；${bp.longNote}` : ''}`, {
        distanceM: Math.round(alloc.long * 1000),
        zone: 'E',
        targetPace: easyPace,
        purpose: '有氧基础与脂肪氧化',
      }),
    )
  }

  sessions.sort((a, b) => a.date.localeCompare(b.date))

  const rationale =
    opts.rationale ??
    `第 ${weekIndex} 周（${phaseName(phase)}）：目标 ${targetKm} km；${weekday(q1Day)}、${weekday(q2Day)} 质量课，${weekday(longDay)} 长距离，${weekday(restDay)} 休息；${
      bp.down ? '本周为减量周。' : '质量课之外全部轻松跑。'
    }`

  return {
    id: uid(),
    version: opts.version ?? 1,
    weekStart,
    weekIndex,
    phase,
    targetKm,
    rationale,
    status: 'active',
    plannedSessions: sessions,
    adjustments: [],
    createdAt: new Date().toISOString(),
  }
}

export function findPlannedSession(
  plans: Plan[],
  date: IsoDate,
): { plan: Plan; session: PlannedSession } | null {
  for (const plan of plans) {
    for (const session of plan.plannedSessions) {
      if (session.date === date) return { plan, session }
    }
  }
  return null
}

export const CURRENT_5K_PACE = equivalentPaceSecKm(50, 5000)

export const PACE_ZONE_LABEL: Record<TrainingZone, string> = {
  E: '轻松',
  M: '马拉松',
  T: '阈值',
  I: '间歇',
  R: '重复',
  '5K': '5K 配速',
}

export function pacesForVdot(vdot: number) {
  return trainingPaces(vdot)
}

export function formatPlanPace(pace: PaceRange | null | undefined): string {
  if (!pace) return '—'
  return `${formatPaceRange(pace.fastSecKm, pace.slowSecKm)}/km`
}
