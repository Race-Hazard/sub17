import { CalendarPlus, Sparkles, X } from 'lucide-react'
import {
  formatDuration,
  formatKm,
  formatLongDate,
  formatPace,
  formatPaceRange,
  secondsPerKm,
} from '../domain/format'
import {
  evaluateQualitySession,
  type QualityEvaluation,
} from '../domain/quality'
import type {
  IsoDate,
  PlannedSession,
  Session,
  SessionType,
} from '../domain/types'
import { QualityCard } from './QualityCard'
import { Button, EmptyState, Pill } from './ui'

const TYPE_LABEL: Record<SessionType, string> = {
  easy: '轻松跑',
  long: '长距离',
  threshold: '阈值 T',
  interval: '间歇 I',
  repetition: '重复 R',
  time_trial: '计时赛',
  race: '比赛',
  strength: '力量',
  rest: '休息',
}

const TEST_TYPES: SessionType[] = [
  'interval',
  'repetition',
  'threshold',
  'time_trial',
  'race',
]

function workSummary(session: Session): string | null {
  const work = (session.segments ?? []).filter(
    (segment) => segment.kind === 'work' && segment.distanceM && segment.durationSec,
  )
  if (work.length === 0) return null
  const paces = work.map(
    (segment) => ((segment.durationSec as number) / (segment.distanceM as number)) * 1000,
  )
  const fastest = Math.min(...paces)
  const slowest = Math.max(...paces)
  const avgDistance = Math.round(
    work.reduce((sum, segment) => sum + (segment.distanceM as number), 0) / work.length,
  )
  return `${work.length} 组 · 平均 ${formatKm(avgDistance)}/组 · 最快 ${formatPace(
    fastest,
  )}、最慢 ${formatPace(slowest)}/km`
}

export function DayDetail({
  date,
  planned,
  sessions,
  vdot,
  today,
  status,
  onClose,
  onLog,
}: {
  date: IsoDate
  planned: PlannedSession
  sessions: Session[]
  vdot: number
  today: IsoDate
  status: 'done' | 'pending' | 'skipped' | 'adjusted'
  onClose: () => void
  onLog: (prefill?: Partial<Session>) => void
}) {
  const actuals = sessions
    .filter((session) => session.date === date)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const evaluations = actuals
    .filter((session) => TEST_TYPES.includes(session.type))
    .map((session) => evaluateQualitySession(session, planned, vdot))
    .filter((evaluation): evaluation is QualityEvaluation => evaluation != null)
  const actualKm = actuals.reduce((sum, session) => sum + (session.distanceM ?? 0), 0)
  const actualSec = actuals.reduce((sum, session) => sum + (session.durationSec ?? 0), 0)
  const actualPace = actualKm > 0 && actualSec > 0 ? secondsPerKm(actualKm, actualSec) : null
  const plannedKm = planned.distanceM ?? 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-line bg-surface p-4 pb-8 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold tracking-wide text-accent">
              {formatLongDate(date)}
            </div>
            <h2 className="mt-0.5 text-xl font-bold text-slate-50">{planned.title}</h2>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Pill
                tone={
                  status === 'done'
                    ? 'good'
                    : status === 'skipped'
                      ? 'bad'
                      : status === 'adjusted'
                        ? 'warn'
                        : 'neutral'
                }
              >
                {status === 'done'
                  ? '已完成'
                  : status === 'skipped'
                    ? '未完成'
                    : status === 'adjusted'
                      ? '已调整'
                      : '待完成'}
              </Pill>
              <Pill tone={planned.type === 'rest' ? 'neutral' : 'accent'}>
                {TYPE_LABEL[planned.type] ?? planned.type}
              </Pill>
              {planned.distanceM ? <Pill>{formatKm(planned.distanceM)}</Pill> : null}
              {planned.targetPace ? (
                <Pill tone="sky">
                  {formatPaceRange(
                    planned.targetPace.fastSecKm,
                    planned.targetPace.slowSecKm,
                  )}
                  /km
                </Pill>
              ) : null}
              {planned.targetTimeSec ? (
                <Pill tone="sky">目标 {formatDuration(planned.targetTimeSec)}</Pill>
              ) : null}
              {planned.locked ? <Pill tone="warn">测试日</Pill> : null}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-line bg-surface-2/60 p-2 text-muted hover:text-slate-100"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-3 rounded-xl border border-line/70 bg-surface-2/40 p-3">
          <p className="text-xs leading-relaxed text-slate-300">{planned.details}</p>
          <div className="mt-2 text-[11px] leading-relaxed text-muted">
            <div>目的：{planned.purpose}</div>
            <div className="mt-0.5">降级：{planned.downgrade}</div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-200">实际完成</div>
          {actuals.length > 0 ? (
            <div className="text-[11px] text-muted">
              {formatKm(actualKm)}
              {plannedKm > 0 ? ` / 计划 ${formatKm(plannedKm)}` : ''}
              {actualPace != null ? ` · ${formatPace(actualPace)}/km` : ''}
            </div>
          ) : null}
        </div>

        {actuals.length === 0 ? (
          <div className="mt-2">
            {planned.type === 'rest' && status === 'done' ? (
              <div className="rounded-xl border border-good/25 bg-good/10 px-3 py-2 text-xs text-good">
                这天已记录为休息。
              </div>
            ) : (
              <EmptyState
                title="这天还没有训练记录"
                hint={
                  date < today
                    ? '可以补记，补记后评估会立即更新。'
                    : date === today
                      ? '训练后回来记录，评估会自动生成。'
                      : '到当天训练结束后再记录。'
                }
              />
            )}
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            {actuals.map((session) => {
              const pace =
                session.distanceM && session.durationSec
                  ? secondsPerKm(session.distanceM, session.durationSec)
                  : null
              const segments = workSummary(session)
              return (
                <div
                  key={session.id}
                  className="rounded-xl border border-line/70 bg-ink/30 px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="text-sm font-medium text-slate-200">
                      {TYPE_LABEL[session.type] ?? session.type}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {session.isTest ? <Pill tone="accent">测试</Pill> : null}
                      {session.source === 'gpx' ? <Pill tone="neutral">GPX</Pill> : null}
                      {session.rpe != null ? (
                        <span className="text-[11px] text-muted">RPE {session.rpe}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] text-muted">
                    {session.distanceM ? formatKm(session.distanceM) : '—'}
                    {session.durationSec ? ` · ${formatDuration(session.durationSec)}` : ''}
                    {pace != null ? ` · ${formatPace(pace)}/km` : ''}
                    {session.avgHr ? ` · 心率 ${session.avgHr}` : ''}
                  </div>
                  {segments ? <div className="mt-1 text-[11px] text-muted">{segments}</div> : null}
                  {session.notes ? (
                    <div className="mt-1 text-[11px] leading-relaxed text-slate-300">
                      {session.notes}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}

        {evaluations.length > 0 ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-accent">
              <Sparkles size={13} /> 质量课评估
            </div>
            {evaluations.map((evaluation) => (
              <QualityCard key={evaluation.sessionId} evaluation={evaluation} />
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <Button
            className="flex-1"
            onClick={() =>
              onLog({
                date,
                type: planned.type,
                plannedSessionId: planned.id,
              })
            }
          >
            <CalendarPlus size={16} /> {actuals.length > 0 ? '再记一条' : '记录训练'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </div>
  )
}
