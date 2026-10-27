import { useState } from 'react'
import { CalendarCheck, ChevronRight, RefreshCw, Timer, Trash2 } from 'lucide-react'
import { Button, Card, EmptyState, Pill, ProgressBar, SectionTitle } from '../components/ui'
import { AdviceBox } from '../components/QualityCard'
import { DayDetail } from '../components/DayDetail'
import {
  adjustNextWeek,
  complianceForPlan,
  latestCheckpointVerdict,
} from '../domain/coach'
import { qualityAdviceFromSummary } from '../domain/quality'
import {
  addDaysIso,
  daysBetween,
  formatDuration,
  formatKm,
  formatPaceRange,
  formatShortDate,
  formatWeekday,
  mondayOf,
  parseDuration,
} from '../domain/format'
import { phaseName, weeklyTargetKm, WEEK_BLUEPRINTS } from '../domain/plan'
import type {
  Checkin,
  IsoDate,
  Plan,
  PlannedSession,
  Profile,
  Session,
  TestDay,
} from '../domain/types'
import type { TrainingStatus } from '../domain/status'
import {
  ensurePlanForWeek,
  regeneratePlanWeek,
  scheduleTestDay,
  unscheduleTestDay,
} from '../db/repo'

export function PlanPage({
  profile,
  plans,
  activePlan,
  status,
  sessions,
  testDays,
  checkins,
  today,
  onLog,
}: {
  profile: Profile
  plans: Plan[]
  activePlan: Plan | null
  status: TrainingStatus
  sessions: Session[]
  testDays: TestDay[]
  checkins: Checkin[]
  today: IsoDate
  onLog: (prefill?: Partial<Session>) => void
}) {
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [selected, setSelected] = useState<PlannedSession | null>(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [testDate, setTestDate] = useState(today)
  const [testDistanceM, setTestDistanceM] = useState(5000)
  const [testTimeText, setTestTimeText] = useState('')
  const [testNote, setTestNote] = useState('')
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [scheduling, setScheduling] = useState(false)

  const nextWeekIndex = activePlan ? Math.min(26, activePlan.weekIndex + 1) : 1
  const nextWeekStart = activePlan ? addDaysIso(activePlan.weekStart, 7) : mondayOf(today)
  const nextPlan = plans.find((p) => p.weekStart === nextWeekStart)

  const earliestTestDate = today > profile.startDate ? today : profile.startDate
  const latestTestDate = addDaysIso(profile.startDate, 26 * 7 - 1)
  const testWindowOpen = earliestTestDate <= latestTestDate
  const upcomingTests = testDays
    .filter((testDay) => testDay.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))

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

  const submitTestDay = async () => {
    const rawTime = testTimeText.trim()
    const targetTimeSec = rawTime ? parseDuration(rawTime) : null
    if (rawTime && targetTimeSec == null) {
      setScheduleError('目标时间格式应为 分:秒，例如 19:30。')
      return
    }
    if (!testWindowOpen || testDate < earliestTestDate || testDate > latestTestDate) {
      setScheduleError(`日期需在 ${formatShortDate(earliestTestDate)} 到 ${formatShortDate(latestTestDate)} 之间。`)
      return
    }
    setScheduling(true)
    setScheduleError(null)
    try {
      await scheduleTestDay({
        date: testDate,
        distanceM: testDistanceM,
        targetTimeSec: targetTimeSec ?? undefined,
        note: testNote.trim() || undefined,
        vdot: status.currentVdot,
        profile,
        today,
      })
      setScheduleOpen(false)
      setTestTimeText('')
      setTestNote('')
      setScheduleMessage(
        `已安排 ${formatShortDate(testDate)} ${formatWeekday(testDate)}：${formatKm(
          testDistanceM,
        )} 计时赛；当天课表已替换，前后 48 小时强度课已降级。`,
      )
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : '安排测试日失败')
    } finally {
      setScheduling(false)
    }
  }

  const removeTestDay = async (date: IsoDate) => {
    if (
      !window.confirm(
        '移除测试日会重新生成受影响的周课表（已有训练记录不会删除）。继续？',
      )
    ) {
      return
    }
    setScheduling(true)
    try {
      const result = await unscheduleTestDay({
        date,
        vdot: status.currentVdot,
        profile,
        today,
      })
      setScheduleMessage(
        `已移除 ${formatShortDate(date)} 的测试日，恢复 ${result.restored} 周课表。`,
      )
    } finally {
      setScheduling(false)
    }
  }

  const testDayCard = (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
            <Timer size={15} /> 测试日 · 计时赛
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-muted">
            临时指定本周或未来几周的某天做测试。当天课表替换为计时赛，前后 48 小时的质量课和长距离自动降为轻松跑；自动重排不会改掉测试日。
          </div>
        </div>
        <Button
          size="sm"
          variant={scheduleOpen ? 'secondary' : 'primary'}
          onClick={() => {
            setScheduleOpen((value) => !value)
            setTestDate((value) =>
              value < earliestTestDate
                ? earliestTestDate
                : value > latestTestDate
                  ? latestTestDate
                  : value,
            )
            setScheduleError(null)
          }}
          disabled={!testWindowOpen || scheduling}
        >
          {scheduleOpen ? '收起' : '安排'}
        </Button>
      </div>

      {upcomingTests.length > 0 ? (
        <div className="space-y-1.5">
          {upcomingTests.slice(0, 6).map((testDay) => (
            <div
              key={testDay.date}
              className="flex items-center justify-between gap-2 rounded-xl border border-line/70 bg-ink/30 px-2.5 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-xs text-slate-200">
                  {formatShortDate(testDay.date)} {formatWeekday(testDay.date)} ·{' '}
                  {formatKm(testDay.distanceM)} 计时赛
                  {testDay.targetTimeSec
                    ? ` · 目标 ${formatDuration(testDay.targetTimeSec)}`
                    : ''}
                </div>
                <div className="mt-0.5 truncate text-[10px] text-muted">
                  还有 {daysBetween(today, testDay.date)} 天
                  {testDay.note ? ` · ${testDay.note}` : ''}
                </div>
              </div>
              <button
                onClick={() => void removeTestDay(testDay.date)}
                disabled={scheduling}
                className="shrink-0 rounded-lg p-1.5 text-muted hover:text-bad disabled:opacity-40"
                aria-label="移除测试日"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-muted">还没有临时测试日。检查点周的计时赛不受影响。</div>
      )}

      {scheduleOpen ? (
        <div className="space-y-2 border-t border-line/70 pt-3">
          <label className="block text-xs text-muted">
            日期
            <input
              type="date"
              value={testDate}
              min={earliestTestDate}
              max={latestTestDate}
              onChange={(event) => setTestDate(event.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
            />
          </label>
          <div>
            <div className="text-xs text-muted">测试距离</div>
            <div className="mt-1 flex gap-1.5">
              {[3000, 5000, 10000].map((distanceM) => (
                <button
                  key={distanceM}
                  onClick={() => setTestDistanceM(distanceM)}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    testDistanceM === distanceM
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-line bg-surface-2/50 text-muted hover:text-slate-200'
                  }`}
                >
                  {formatKm(distanceM)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-muted">
              目标时间（可选）
              <input
                value={testTimeText}
                onChange={(event) => setTestTimeText(event.target.value)}
                inputMode="numeric"
                placeholder="19:30"
                className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-accent"
              />
            </label>
            <label className="block text-xs text-muted">
              备注（可选）
              <input
                value={testNote}
                onChange={(event) => setTestNote(event.target.value)}
                placeholder="场地 / 配速策略"
                className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-accent"
              />
            </label>
          </div>
          <p className="text-[10px] leading-relaxed text-muted">
            目标时间留空时，按当前 VDOT 在该距离的等价成绩评估。测试日同样计入完成度，但只有计时赛成绩会更新 VDOT。
          </p>
          {scheduleError ? (
            <div className="rounded-lg border border-bad/25 bg-bad/10 px-2.5 py-1.5 text-[11px] text-bad">
              {scheduleError}
            </div>
          ) : null}
          <Button
            className="w-full"
            size="sm"
            onClick={() => void submitTestDay()}
            disabled={scheduling || !testWindowOpen}
          >
            {scheduling ? '写入中…' : '写入计划并调整临近训练'}
          </Button>
        </div>
      ) : null}

      {!testWindowOpen ? (
        <div className="text-[11px] text-muted">26 周计划周期已结束，不能再安排测试日。</div>
      ) : null}
      {scheduleMessage ? (
        <div className="rounded-xl border border-good/25 bg-good/10 px-3 py-2 text-[11px] leading-relaxed text-good">
          {scheduleMessage}
        </div>
      ) : null}
    </Card>
  )

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
        <SectionTitle>测试日</SectionTitle>
        {testDayCard}
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

      {testDayCard}

      {activePlan.adjustments.length > 0 ? (
        <Card className="space-y-1.5">
          <div className="text-xs font-semibold text-slate-200">最近计划调整</div>
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
        <AdviceBox text={status.quality.last.nextAdvice} />
      ) : null}

      <SectionTitle>本周课表</SectionTitle>
      <div className="space-y-2">
        {activePlan.plannedSessions.map((planned) => {
          const s = statusOf(planned)
          return (
            <Card
              key={planned.id}
              className="space-y-1.5 py-3"
              onClick={() => setSelected(planned)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="w-10 shrink-0 text-[11px] text-muted">{formatWeekday(planned.date)}</span>
                  <span className="truncate text-sm font-medium text-slate-200">{planned.title}</span>
                  {planned.locked ? <Pill tone="warn">测试日</Pill> : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Pill tone={s === 'done' ? 'good' : s === 'skipped' ? 'bad' : s === 'adjusted' ? 'warn' : 'neutral'}>
                    {s === 'done' ? '已完成' : s === 'skipped' ? '未完成' : s === 'adjusted' ? '已调整' : '待完成'}
                  </Pill>
                  <ChevronRight size={14} className="text-muted" />
                </div>
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

      {selected ? (
        <DayDetail
          date={selected.date}
          planned={selected}
          sessions={sessions}
          vdot={status.currentVdot}
          today={today}
          status={statusOf(selected)}
          onClose={() => setSelected(null)}
          onLog={(prefill) => {
            setSelected(null)
            onLog(prefill)
          }}
        />
      ) : null}
    </div>
  )
}
