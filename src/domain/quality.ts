import { formatPace, formatPaceRange } from './format'
import type {
  IsoDate,
  PaceRange,
  Plan,
  PlannedSession,
  Session,
  SessionType,
} from './types'
import { equivalentPaceSecKm, trainingPaces } from './vdot'

export type QualityKind = 'I' | 'T' | 'R' | '5K' | 'TEST'
export type QualityVerdict =
  | 'excellent'
  | 'onTarget'
  | 'fade'
  | 'overload'
  | 'fast'
  | 'slow'
  | 'incomplete'

export interface NextQualityWorkout {
  kind: QualityKind
  mode: 'interval' | 'continuous'
  repsDelta?: number
  continuousMinDelta?: number
  sourceSessionId?: string
}

export interface QualityEvaluation {
  sessionId: string
  date: IsoDate
  kind: QualityKind
  type: SessionType
  plannedId?: string
  reps: number
  repDistanceM?: number
  avgPaceSecKm: number
  fastestSecKm: number
  slowestSecKm: number
  fadePct: number
  rpe: number | null
  completionPct: number
  targetPace: PaceRange | null
  verdict: QualityVerdict
  verdictLabel: string
  summary: string
  nextAdvice: string
  nextWorkout: NextQualityWorkout | null
  isSeed?: boolean
}

export interface QualitySummary {
  last: QualityEvaluation | null
  history: QualityEvaluation[]
  lastByKind: Partial<Record<QualityKind, QualityEvaluation>>
}

const QUALITY_TYPES: SessionType[] = [
  'interval',
  'repetition',
  'threshold',
  'time_trial',
  'race',
]

const EXPECTED_RPE: Record<QualityKind, number> = {
  I: 8,
  T: 7,
  R: 8,
  '5K': 8,
  TEST: 9,
}

const KIND_LABEL: Record<QualityKind, string> = {
  I: '间歇 I',
  T: '阈值 T',
  R: '重复 R',
  '5K': '5K 配速',
  TEST: '计时赛',
}

export function qualityKindLabel(kind: QualityKind): string {
  return KIND_LABEL[kind]
}

export function isQualitySession(session: Session): boolean {
  return QUALITY_TYPES.includes(session.type)
}

function kindFor(session: Session, planned?: PlannedSession): QualityKind {
  if (session.type === 'time_trial' || session.type === 'race') return 'TEST'
  if (planned?.zone === 'I' || planned?.zone === 'T' || planned?.zone === 'R') {
    return planned.zone
  }
  if (planned?.zone === '5K') return '5K'
  if (session.type === 'interval') return 'I'
  if (session.type === 'repetition') return 'R'
  return 'T'
}

function targetFor(
  kind: QualityKind,
  planned: PlannedSession | undefined,
  vdot: number,
): PaceRange | null {
  if (planned?.targetPace) return planned.targetPace
  if (kind === 'I' || kind === 'T' || kind === 'R') return trainingPaces(vdot)[kind]
  return { fastSecKm: equivalentPaceSecKm(vdot, 5000), slowSecKm: equivalentPaceSecKm(vdot, 5000) }
}

function findPlanned(
  session: Session,
  plans: Plan[],
): PlannedSession | undefined {
  const all = plans.flatMap((p) => p.plannedSessions)
  const byId = all.find((p) => p.id === session.plannedSessionId)
  if (byId) return byId
  return all.find(
    (p) => p.date === session.date && p.type === session.type,
  )
}

interface WorkRep {
  distanceM: number
  durationSec: number
  paceSecKm: number
}

function workReps(session: Session): WorkRep[] {
  const fromSegments = (session.segments ?? [])
    .filter((s) => s.kind === 'work' && s.distanceM && s.durationSec)
    .map((s) => ({
      distanceM: s.distanceM as number,
      durationSec: s.durationSec as number,
      paceSecKm: ((s.durationSec as number) / (s.distanceM as number)) * 1000,
    }))
  if (fromSegments.length > 0) return fromSegments
  if (session.distanceM && session.durationSec) {
    return [
      {
        distanceM: session.distanceM,
        durationSec: session.durationSec,
        paceSecKm: (session.durationSec / session.distanceM) * 1000,
      },
    ]
  }
  return []
}

function completionOf(session: Session, planned?: PlannedSession): number {
  if (!planned) return session.distanceM || session.durationSec ? 100 : 0
  if (planned.testDistanceM) {
    const actual = session.testDistanceM ?? session.distanceM ?? 0
    return Math.min(150, (actual / planned.testDistanceM) * 100)
  }
  if (planned.distanceM) {
    return Math.min(150, ((session.distanceM ?? 0) / planned.distanceM) * 100)
  }
  if (planned.durationMin) {
    return Math.min(150, ((session.durationSec ?? 0) / (planned.durationMin * 60)) * 100)
  }
  return session.distanceM || session.durationSec ? 100 : 0
}

function label(verdict: QualityVerdict): string {
  if (verdict === 'excellent') return '优秀'
  if (verdict === 'onTarget') return '达标'
  if (verdict === 'fade') return '前快后慢'
  if (verdict === 'overload') return '过载/过快'
  if (verdict === 'fast') return '快于目标'
  if (verdict === 'slow') return '慢于目标'
  return '未完成'
}

function verdictFor(input: {
  avgPace: number
  firstPace: number
  fadePct: number
  reps: number
  rpe: number | null
  completion: number
  target: PaceRange | null
  expectedRpe: number
}): QualityVerdict {
  const { avgPace, firstPace, fadePct, reps, rpe, completion, target, expectedRpe } =
    input
  if (completion < 80) return 'incomplete'
  const within = target
    ? avgPace >= target.fastSecKm - 2 && avgPace <= target.slowSecKm + 2
    : true
  const tooFast = target ? avgPace < target.fastSecKm - 4 : false
  const tooSlow = target ? avgPace > target.slowSecKm + 8 : false
  const firstTooFast = target ? firstPace < target.fastSecKm - 4 : false

  if (rpe != null && rpe >= 9 && !within && !tooSlow) return 'overload'
  if (tooFast && (rpe == null || rpe >= expectedRpe)) return 'overload'
  if (fadePct > 4 || (reps >= 2 && firstTooFast)) return 'fade'
  if (tooFast) return 'fast'
  if (tooSlow) return 'slow'
  if (
    completion >= 98 &&
    within &&
    fadePct <= 2 &&
    (rpe == null || rpe <= expectedRpe)
  ) {
    return 'excellent'
  }
  if (within || (!tooFast && !tooSlow && completion >= 90)) return 'onTarget'
  return 'onTarget'
}

function buildNextWorkout(
  kind: QualityKind,
  verdict: QualityVerdict,
  reps: number,
  continuousMin: number | undefined,
): NextQualityWorkout | null {
  if (kind === 'TEST') return null
  const isContinuous = kind === 'T' && (continuousMin != null || reps <= 1)
  if (isContinuous) {
    const delta =
      verdict === 'excellent' || verdict === 'onTarget'
        ? 5
        : verdict === 'slow' || verdict === 'overload'
          ? -5
          : 0
    return { kind, mode: 'continuous', continuousMinDelta: delta }
  }
  let delta = 0
  if (kind === 'R') {
    delta =
      verdict === 'excellent'
        ? 2
        : verdict === 'onTarget'
          ? 1
          : verdict === 'slow' || verdict === 'overload'
            ? -2
            : 0
  } else if (kind === 'I' || kind === '5K') {
    delta =
      verdict === 'excellent' || verdict === 'onTarget'
        ? 1
        : verdict === 'slow' || verdict === 'overload'
          ? -1
          : 0
  } else if (kind === 'T') {
    delta =
      verdict === 'excellent' || verdict === 'onTarget'
        ? 1
        : verdict === 'overload'
          ? -1
          : 0
  }
  return { kind, mode: 'interval', repsDelta: delta }
}

function adviceFor(
  kind: QualityKind,
  verdict: QualityVerdict,
  reps: number,
  repDistanceM: number | undefined,
  continuousMin: number | undefined,
  target: PaceRange | null,
  vdot: number,
  nextWorkout: NextQualityWorkout | null,
): string {
  const pace = target ?? trainingPaces(vdot)[kind === 'TEST' || kind === '5K' ? 'I' : kind]
  const paceText = formatPaceRange(pace.fastSecKm, pace.slowSecKm)
  const repText = repDistanceM ? `${Math.round(repDistanceM / 100) * 100} m` : '组'
  const repCount = Math.max(1, reps)
  const continuous = nextWorkout?.mode === 'continuous' || (kind === 'T' && repCount <= 1)
  const recovery = continuous
    ? '连续完成，不设组间恢复'
    : kind === 'T'
      ? '组间 60–90 秒'
      : kind === 'R'
        ? '充分恢复 2–3 分钟'
        : '组间 2–3 分钟慢跑'

  let volume = `${repCount}×${repText}`
  if (kind === 'TEST') {
    volume =
      verdict === 'excellent' || verdict === 'onTarget'
        ? '下次 5 km 计时赛：前 1 km 稳，最后 1 km 提速'
        : verdict === 'fade'
          ? '3×1 km @ 5K 配速'
          : '先恢复 2 周，再做 3×1 km @ 5K'
  } else if (nextWorkout?.mode === 'continuous') {
    const delta = nextWorkout.continuousMinDelta ?? 0
    volume =
      delta === 0
        ? `保持计划时长（本次 ${continuousMin ?? '—'} 分钟）`
        : `计划基础上 ${delta > 0 ? '+' : ''}${delta} 分钟（本次 ${continuousMin ?? '—'} 分钟）`
  } else if (nextWorkout) {
    const delta = nextWorkout.repsDelta ?? 0
    volume =
      delta === 0
        ? `保持计划组数（本次 ${repCount}×${repText}）`
        : `计划基础上 ${delta > 0 ? '+' : ''}${delta} 组（本次 ${repCount}×${repText}）`
  }

  const cue = continuous
    ? verdict === 'excellent' || verdict === 'onTarget'
      ? '可以加 5 分钟，但不要同时提速。'
      : verdict === 'overload' || verdict === 'slow'
        ? '下次减 5 分钟，先稳住目标配速；必要时重测 VDOT。'
        : verdict === 'fast'
          ? '保持同量，不要继续加速；安排一次 5 km 计时赛校准 VDOT。'
          : '保持同量，先稳住节奏。'
    : verdict === 'excellent'
      ? '可以加组或缩短 15 秒恢复，但不要同时加量又提速。'
      : verdict === 'onTarget'
        ? '保持同样结构，最后 1–2 组再提速。'
        : verdict === 'fade'
          ? '前 1–2 组刻意慢 2–3 s/400 m，先稳后快；下次同量，不加组。'
          : verdict === 'overload'
            ? '这次强度偏高；先保睡眠和轻松跑，下次减量，不追配速。'
            : verdict === 'fast'
              ? '这次快于目标但 RPE 不高；保持同量，不要继续加速，安排一次 5 km 计时赛校准 VDOT。'
              : verdict === 'slow'
                ? '这次没有达到目标配速；下次同量或减 1 组，先稳住节奏，必要时重测 VDOT。'
                : '重复同量，不追加组数；检查睡眠、疼痛和当天状态。'

  const prefix = nextWorkout ? '下次同类课（已写入计划）' : '下次同类课'
  return `${prefix}：${volume} @ ${paceText}/km，${recovery}。${cue}`
}

export function evaluateQualitySession(
  session: Session,
  planned: PlannedSession | undefined,
  vdot: number,
): QualityEvaluation | null {
  if (!isQualitySession(session)) return null
  const reps = workReps(session)
  if (reps.length === 0) return null
  const kind = kindFor(session, planned)
  const target = targetFor(kind, planned, vdot)
  const totalDistance = reps.reduce((sum, r) => sum + r.distanceM, 0)
  const totalDuration = reps.reduce((sum, r) => sum + r.durationSec, 0)
  if (totalDistance <= 0 || totalDuration <= 0) return null
  const avgPace = (totalDuration / totalDistance) * 1000
  const paces = reps.map((r) => r.paceSecKm)
  const fastest = Math.min(...paces)
  const slowest = Math.max(...paces)
  const fadePct =
    paces.length >= 2 ? ((paces[paces.length - 1] - paces[0]) / paces[0]) * 100 : 0
  const completion = completionOf(session, planned)
  const expectedRpe = EXPECTED_RPE[kind]
  const verdict = verdictFor({
    avgPace,
    firstPace: paces[0],
    fadePct,
    reps: reps.length,
    rpe: session.rpe ?? null,
    completion,
    target,
    expectedRpe,
  })
  const repDistanceM =
    reps.length > 0
      ? Math.round(reps.reduce((sum, r) => sum + r.distanceM, 0) / reps.length)
      : undefined
  const continuousMin =
    planned?.workout?.mode === 'continuous'
      ? planned.workout.continuousMin
      : reps.length <= 1
        ? Math.round(totalDuration / 60)
        : undefined
  const nextWorkout = buildNextWorkout(kind, verdict, reps.length, continuousMin)
  const advice = adviceFor(
    kind,
    verdict,
    reps.length,
    repDistanceM,
    continuousMin,
    target,
    vdot,
    nextWorkout,
  )
  const summary = `${KIND_LABEL[kind]} ${reps.length} 组｜平均 ${formatPace(
    avgPace,
  )}/km，最快 ${formatPace(fastest)}、最慢 ${formatPace(slowest)}${
    reps.length >= 2 ? `，衰减 ${fadePct.toFixed(1)}%` : ''
  }｜RPE ${session.rpe ?? '—'}｜完成 ${Math.round(completion)}%${
    target ? `｜目标 ${formatPaceRange(target.fastSecKm, target.slowSecKm)}/km` : ''
  }。`

  return {
    sessionId: session.id,
    date: session.date,
    kind,
    type: session.type,
    plannedId: planned?.id,
    reps: reps.length,
    repDistanceM,
    avgPaceSecKm: avgPace,
    fastestSecKm: fastest,
    slowestSecKm: slowest,
    fadePct,
    rpe: session.rpe ?? null,
    completionPct: completion,
    targetPace: target,
    verdict,
    verdictLabel: label(verdict),
    summary,
    nextAdvice: advice,
    nextWorkout,
    isSeed: session.isSeed,
  }
}

export function qualitySummary(
  sessions: Session[],
  plans: Plan[],
  vdot: number,
): QualitySummary {
  const evaluations = sessions
    .filter((s) => isQualitySession(s) && !s.isSeed)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => evaluateQualitySession(s, findPlanned(s, plans), vdot))
    .filter((e): e is QualityEvaluation => e != null)
    .sort((a, b) => b.date.localeCompare(a.date))

  const lastByKind: Partial<Record<QualityKind, QualityEvaluation>> = {}
  for (const evaluation of evaluations) {
    if (!lastByKind[evaluation.kind]) lastByKind[evaluation.kind] = evaluation
  }
  return {
    last: evaluations[0] ?? null,
    history: evaluations.slice(0, 6),
    lastByKind,
  }
}

export function qualityAdviceFromSummary(
  summary: QualitySummary,
): Partial<Record<QualityKind, NextQualityWorkout>> {
  const out: Partial<Record<QualityKind, NextQualityWorkout>> = {}
  for (const [kind, evaluation] of Object.entries(summary.lastByKind)) {
    if (evaluation?.nextWorkout) {
      out[kind as QualityKind] = {
        ...evaluation.nextWorkout,
        sourceSessionId: evaluation.sessionId,
      }
    }
  }
  return out
}
