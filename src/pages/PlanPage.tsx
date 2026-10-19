import { useState } from 'react'
import { CalendarCheck, RefreshCw } from 'lucide-react'
import { Button, Card, EmptyState, Pill, ProgressBar, SectionTitle } from '../components/ui'
import {
  adjustNextWeek,
  complianceForPlan,
  latestCheckpointVerdict,
} from '../domain/coach'
import { qualityAdviceFromSummary } from '../domain/quality'
import {
  addDaysIso,
  formatKm,
  formatPaceRange,
  formatShortDate,
  formatWeekday,
  mondayOf,
} from '../domain/format'
import { phaseName, weeklyTargetKm, WEEK_BLUEPRINTS } from '../domain/plan'
import type { Checkin, IsoDate, Plan, PlannedSession, Profile, Session } from '../domain/types'
import type { TrainingStatus } from '../domain/status'
import { ensurePlanForWeek, regeneratePlanWeek } from '../db/repo'

export function PlanPage({
  profile,
  plans,
  activePlan,
  status,
  sessions,
  checkins,
  today,
}: {
  profile: Profile
  plans: Plan[]
  activePlan: Plan | null
  status: TrainingStatus
  sessions: Session[]
  checkins: Checkin[]
  today: IsoDate
}) {
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const nextWeekIndex = activePlan ? Math.min(26, activePlan.weekIndex + 1) : 1
  const nextWeekStart = activePlan ? addDaysIso(activePlan.weekStart, 7) : mondayOf(today)
  const nextPlan = plans.find((p) => p.weekStart === nextWeekStart)

  const generateNext = async () => {
    if (!activePlan) return
    setGenerating(true)
    const baseTarget = weeklyTargetKm(nextWeekIndex)
    const feedback = {
      completionRate: status.compliance?.rate ?? 0.8,
      qualityCompletionRate: status.compliance?.qualityRate ?? 0.8,
      greenDays: status.readiness.level === 'green' ? 5 : status.readiness.level === 'yellow' ? 3 : 1,
      redDays: status.readiness.level === 'red' ? 2 : 0,
      acwr: status.load.acwr,
      sleepDebtMin: status.sleep.debtMin,
      painScore: checkins.find((c) => c.date === today)?.painScore ?? null,
      previousTargetKm: activePlan.targetKm,
      baseTargetKm: baseTarget,
      checkpointVerdict: latestCheckpointVerdict(status.tests, status.currentWeekIndex),
    }
    const adjustment = adjustNextWeek(feedback)
    const plan = await ensurePlanForWeek(
      nextWeekIndex,
      nextWeekStart,
      status.currentVdot,
      profile,
      `第 ${nextWeekIndex} 周：${adjustment.rationale}`,
      false,
      qualityAdviceFromSummary(status.quality),
    )
    setMessage(`${plan.weekStart} 周已生成：目标 ${plan.targetKm} km。${adjustment.rationale}`)
    setGenerating(false)
  }

  const regenerateCurrent = async () => {
    if (!activePlan) return
    if (
      !window.confirm(
        '重新生成本周会替换未完成的计划课表，不会删除已有训练记录。继续？',
      )
    ) {
      return
    }
    setGenerating(true)
    const updated = await regeneratePlanWeek(
      activePlan,
      status.currentVdot,
      profile,
      qualityAdviceFromSummary(status.quality),
    )
    setMessage(`本周已重新生成：目标 ${updated.targetKm} km。`)
    setGenerating(false)
  }

  if (!activePlan) {
    return (
      <div className="space-y-4">
        <header>
          <div className="text-xs font-semibold tracking-[0.3em] text-accent">PLAN</div>
          <h1 className="mt-0.5 text-2xl font-bold text-slate-50">26 周计划</h1>
        </header>
        <EmptyState
          title="还没有生成计划"
          hint={`计划从 ${profile.startDate} 开始。到「今日」页签到，或等到周一自动生成。`}
        />
      </div>
    )
  }

  const compliance = complianceForPlan(activePlan, sessions, checkins, profile.createdDate)

  const statusOf = (planned: PlannedSession): 'done' | 'pending' | 'skipped' | 'adjusted' => {
    if (planned.status === 'adjusted') return 'adjusted'
    if (profile.createdDate && planned.date < profile.createdDate) return 'adjusted'
    if (planned.type === 'rest') {
      return checkins.some((c) => c.date === planned.date && c.status === 'rest') ? 'done' : planned.date < today ? 'skipped' : 'pending'
    }
    const actual = sessions.find(
      (s) =>
        s.date === planned.date &&
        (s.plannedSessionId === planned.id || (s.type !== 'rest' && s.type !== 'strength')),
    )
    if (actual) return 'done'
    return planned.date < today ? 'skipped' : 'pending'
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold tracking-[0.3em] text-accent">PLAN</div>
          <h1 className="mt-0.5 text-2xl font-bold text-slate-50">第 {activePlan.weekIndex} 周</h1>
          <div className="mt-1 text-xs text-muted">
            W{activePlan.weekIndex} · {phaseName(activePlan.phase)} · {formatShortDate(activePlan.weekStart)} 起
          </div>
        </div>
        <Pill tone="sky">{activePlan.targetKm} km</Pill>
      </header>

      <Card className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-200">本周完成度</span>
          <span className="tabular text-slate-200">
            {compliance.completed}/{compliance.planned} · {Math.round(compliance.rate * 100)}%
          </span>
        </div>
        <ProgressBar value={compliance.completed} max={compliance.planned} tone={compliance.rate >= 0.85 ? 'good' : compliance.rate >= 0.7 ? 'warn' : 'bad'} />
        <p className="text-xs leading-relaxed text-muted">{activePlan.rationale}</p>
      </Card>

      {activePlan.adjustments.length > 0 ? (
        <Card className="space-y-1.5">
          <div className="text-xs font-semibold text-slate-200">最近按实际训练调整</div>
          {activePlan.adjustments
            .slice(-3)
            .reverse()
            .map((adjustment, index) => (
              <div key={`${adjustment.plannedSessionId}-${index}`} className="text-[11px] leading-relaxed text-muted">
                · {adjustment.reason}
              </div>
            ))}
        </Card>
      ) : null}

      {status.quality.last ? (
        <Card className="space-y-1.5">
          <div className="text-xs font-semibold text-slate-200">下次同类质量课建议</div>
          <div className="text-[11px] leading-relaxed text-slate-300">
            {status.quality.last.nextAdvice}
          </div>
        </Card>
      ) : null}

      <SectionTitle>本周课表</SectionTitle>
      <div className="space-y-2">
        {activePlan.plannedSessions.map((planned) => {
          const s = statusOf(planned)
          return (
            <Card key={planned.id} className="space-y-1.5 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="w-10 text-[11px] text-muted">{formatWeekday(planned.date)}</span>
                  <span className="text-sm font-medium text-slate-200">{planned.title}</span>
                </div>
                <Pill tone={s === 'done' ? 'good' : s === 'skipped' ? 'bad' : s === 'adjusted' ? 'warn' : 'neutral'}>
                  {s === 'done' ? '已完成' : s === 'skipped' ? '未完成' : s === 'adjusted' ? '已调整' : '待完成'}
                </Pill>
              </div>
              <div className="pl-12 text-[11px] leading-relaxed text-muted">
                {planned.distanceM ? `${formatKm(planned.distanceM)} · ` : ''}
                {planned.targetPace ? `${formatPaceRange(planned.targetPace.fastSecKm, planned.targetPace.slowSecKm)}/km · ` : ''}
                {planned.purpose}
              </div>
            </Card>
          )
        })}
      </div>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-200">下一周</div>
            <div className="text-[11px] text-muted">
              {nextPlan ? `${formatShortDate(nextPlan.weekStart)} 起 · ${nextPlan.targetKm} km` : `W${nextWeekIndex} · 目标 ${weeklyTargetKm(nextWeekIndex)} km`}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void regenerateCurrent()}
              disabled={generating}
            >
              重新生成本周
            </Button>
            <Button size="sm" onClick={generateNext} disabled={generating || activePlan.weekIndex >= 26 || !!nextPlan}>
              <RefreshCw size={14} /> {nextPlan ? '已生成' : generating ? '生成中…' : '生成下周'}
            </Button>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-muted">
          依据最近完成度、准备度、ACWR、睡眠债和实际训练调整；周中会重排未来几天，不改已完成记录，也不会改掉周日休息。
        </p>
        {message ? <div className="rounded-xl border border-good/25 bg-good/10 px-3 py-2 text-xs text-good">{message}</div> : null}
      </Card>

      <SectionTitle>26 周时间轴</SectionTitle>
      <Card className="space-y-3">
        <div className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-1">
          {WEEK_BLUEPRINTS.map((w) => {
            const current = w.week === activePlan.weekIndex
            const past = w.week < activePlan.weekIndex
            const test = w.q2.kind === 'test' || w.raceWeek
            return (
              <div
                key={w.week}
                className={`relative flex h-8 items-center justify-center rounded-md text-[10px] tabular ${
                  current
                    ? 'bg-accent text-ink font-bold'
                    : past
                      ? 'bg-surface-2 text-muted'
                      : 'bg-surface-2/50 text-muted'
                }`}
                title={`W${w.week} · ${phaseName(w.phase)} · ${w.targetKm} km`}
              >
                {w.week}
                {test ? <span className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-accent-2" /> : null}
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-3 text-[10px] text-muted">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> 当前周</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-accent-2" /> 计时赛</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <CalendarCheck size={14} /> 检查点：W4 / W8 / W12 / W16 / W20 / W26
        </div>
      </Card>
    </div>
  )
}
