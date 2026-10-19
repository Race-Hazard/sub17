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
    (p) =>
      p.date === session.date &&
      (p.type === session.type || QUALITY_TYPES.includes(p.type)),
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

function adviceFor(
  kind: QualityKind,
  verdict: QualityVerdict,
  reps: number,
  repDistanceM: number | undefined,
  target: PaceRange | null,
  vdot: number,
): string {
  const pace = target ?? trainingPaces(vdot)[kind === 'TEST' || kind === '5K' ? 'I' : kind]
  const paceText = formatPaceRange(pace.fastSecKm, pace.slowSecKm)
  const repText = repDistanceM ? `${Math.round(repDistanceM / 100) * 100} m` : '组'
  const repCount = Math.max(1, reps)
  const recovery =
    kind === 'T' && repCount <= 1
      ? '连续完成，不设组间恢复'
      : kind === 'T'
        ? '组间 60–90 s'
        : kind === 'R'
          ? '充分恢复 2–3 min'
          : '组间 2–3 min 慢跑'

  let volume = `${repCount}×${repText}`
  if (kind === 'TEST') {
    volume =
      verdict === 'excellent' || verdict === 'onTarget'
        ? '下次 5 km 计时赛：前 1 km 稳，最后 1 km 提速'
        : verdict === 'fade'
          ? '3×1 km @ 5K 配速'
          : '先恢复 2 周，再做 3×1 km @ 5K'
  } else if (kind === 'T' && repCount <= 1) {
    volume =
      verdict === 'excellent' || verdict === 'onTarget'
        ? '35 min 连续阈值跑'
        : '30 min 连续阈值跑'
  } else if (verdict === 'excellent') {
    volume =
      kind === 'R'
        ? `${repCount + 2}×${repText}`
        : kind === 'I'
          ? `${repCount + 1}×${repText}`
          : `${repCount + 1}×2 km`
  } else if (verdict === 'onTarget') {
    volume =
      kind === 'R'
        ? `${repCount + 1}×${repText}`
        : kind === 'I'
          ? `${repCount + 1}×${repText}`
          : `${repCount}×2 km`
  } else if (verdict === 'overload') {
    volume =
      kind === 'R'
        ? `${Math.max(4, repCount - 2)}×${repText}`
        : kind === 'I'
          ? `${Math.max(4, repCount - 1)}×${repText}`
          : `${Math.max(2, repCount - 1)}×2 km`
  } else if (verdict === 'slow') {
    volume =
      kind === 'R'
        ? `${Math.max(4, repCount - 1)}×${repText}`
        : kind === 'I'
          ? `${Math.max(4, repCount - 1)}×${repText}`
          : `${Math.max(2, repCount)}×2 km`
  }

  const cue =
    verdict === 'excellent'
      ? '可以加 1 组或缩短 15 s 恢复，但不要同时加量又提速。'
      : verdict === 'onTarget'
        ? '保持同样结构，最后 1–2 组再提速。'
        : verdict === 'fade'
          ? '前 1–2 组刻意慢 2–3 s/400 m，先稳后快；下周同量，不加组。'
          : verdict === 'overload'
            ? '这次强度偏高；先保睡眠和轻松跑，下次减量，不追配速。'
            : verdict === 'fast'
              ? '这次快于目标但 RPE 不高；保持同量，不要继续加速，安排一次 5 km 计时赛校准 VDOT。'
              : verdict === 'slow'
              ? '这次没有达到目标配速；下次同量或减 1 组，先稳住节奏，必要时重测 VDOT。'
              : '重复同量，不追加组数；检查睡眠、疼痛和当天状态。'

  return `下次同类课：${volume} @ ${paceText}/km，${recovery}。${cue}`
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
  const advice = adviceFor(kind, verdict, reps.length, repDistanceM, target, vdot)
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
  }
}

export function qualitySummary(
  sessions: Session[],
  plans: Plan[],
  vdot: number,
): QualitySummary {
  const evaluations = sessions
    .filter(isQualitySession)
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
