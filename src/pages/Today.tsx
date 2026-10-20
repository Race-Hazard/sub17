import { useEffect, useRef, useState } from 'react'
import {
  AlarmClock,
  CalendarPlus,
  Check,
  ChevronRight,
  Moon,
  Timer,
} from 'lucide-react'
import { LapTimer, type LapTimerResult } from '../components/LapTimer'
import { QualityCard } from '../components/QualityCard'
import { ReadinessBadge } from '../components/ReadinessBadge'
import { Button, Card, Pill, SectionTitle, Stat } from '../components/ui'
import { saveCheckin, saveSession } from '../db/repo'
import {
  formatDuration,
  formatKm,
  formatLongDate,
  formatPace,
  formatPaceRange,
  isAfterTime,
  nowIso,
  secondsPerKm,
  uid,
} from '../domain/format'
import type { TrainingStatus } from '../domain/status'
import type {
  Checkin,
  IsoDate,
  Plan,
  PlannedSession,
  Profile,
  Session,
  SleepRecord,
} from '../domain/types'

export function Today({
  profile,
  status,
  today,
  activePlan,
  planned,
  sessions,
  sleep,
  checkin,
  onLog,
  onSleep,
  onPlan,
  onStatus,
}: {
  profile: Profile
  status: TrainingStatus
  today: IsoDate
  activePlan: Plan | null
  planned: PlannedSession | null
  sessions: Session[]
  sleep: SleepRecord | undefined
  checkin: Checkin | undefined
  onLog: (prefill?: Partial<Session>) => void
  onSleep: () => void
  onPlan: () => void
  onStatus: () => void
}) {
  const [showTimer, setShowTimer] = useState(false)
  const [restSaved, setRestSaved] = useState(false)
  const timerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (showTimer) {
      timerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [showTimer])
  const todaySessions = sessions.filter((s) => s.date === today)
  const hasLoggedRun = todaySessions.some((s) => s.type !== 'rest' && s.type !== 'strength')
  const hasAnyLog = todaySessions.length > 0 || checkin != null || restSaved
  const late = isAfterTime(profile.reminderTime)
  const sleepLate = isAfterTime(profile.sleepReminderTime)
  const missingSleep = !sleep

  const saveRest = async () => {
    await saveCheckin({
      date: today,
      status: 'rest',
      fatigue: checkin?.fatigue,
      notes: checkin?.notes,
      updatedAt: nowIso(),
    })
    setRestSaved(true)
  }

  const saveLapResult = async (result: LapTimerResult) => {
    const isTest = result.mode === 'tt' && result.distanceM >= 1500
    await saveSession({
      id: uid(),
      date: today,
      type: result.mode === 'tt' ? 'time_trial' : 'interval',
      distanceM: result.distanceM,
      durationSec: result.durationSec,
      rpe: result.mode === 'tt' ? 9 : 7,
      isTest,
      testDistanceM: isTest ? result.distanceM : undefined,
      notes: `400 m 圈计时（${result.mode === 'tt' ? '计时赛' : '自由计圈'}）`,
      source: 'manual',
      plannedSessionId: planned?.id,
      segments: result.laps.map((lap) => ({
        kind: 'work' as const,
        distanceM: lap.distanceM ?? 400,
        durationSec: Math.round(lap.splitMs / 1000),
      })),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
    setShowTimer(false)
  }

  const todayRun = todaySessions.find((s) => s.type !== 'rest' && s.type !== 'strength')
  const todayPace = todayRun?.distanceM && todayRun?.durationSec
    ? secondsPerKm(todayRun.distanceM, todayRun.durationSec)
    : null

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold tracking-[0.3em] text-accent">SUB17</div>
          <h1 className="mt-0.5 text-2xl font-bold text-slate-50">{formatLongDate(today)}</h1>
        </div>
        <Pill tone={status.readiness.level === 'green' ? 'good' : status.readiness.level === 'yellow' ? 'warn' : 'bad'}>
          {status.readiness.level === 'green' ? '可训练' : status.readiness.level === 'yellow' ? '注意恢复' : '建议降级'}
        </Pill>
      </header>

      {late && !hasAnyLog ? (
        <div className="rounded-2xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
          <div className="flex items-center gap-2 font-semibold">
            <AlarmClock size={16} /> 今天还没记录
          </div>
          <p className="mt-1 text-xs text-bad/80">记录训练或休息只需要几秒；漏记会让准备度失真。</p>
        </div>
      ) : null}

      {sleepLate && missingSleep ? (
        <div className="rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
          <div className="flex items-center gap-2 font-semibold">
            <Moon size={16} /> 昨晚睡眠还没记
          </div>
          <button className="mt-1 text-xs underline underline-offset-2" onClick={onSleep}>
            现在补录
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <Stat label="当前 5K" value={formatDuration(status.current5kSec)} hint="等价成绩" tone="accent" />
        <Stat
          label="本周跑量"
          value={`${status.weeklyKm.toFixed(1)} km`}
          hint={
            status.lastWeekKm > 0
              ? `上周 ${status.lastWeekKm.toFixed(1)} km`
              : `目标 ${activePlan?.targetKm ?? '—'} km`
          }
        />
        <Stat
          label="准备度"
          value={status.readiness.level === 'green' ? '绿' : status.readiness.level === 'yellow' ? '黄' : '红'}
          hint={`睡眠 ${status.sleep.totalAverageMin != null ? (status.sleep.totalAverageMin / 60).toFixed(1) + ' h' : '—'}`}
          tone={status.readiness.level === 'green' ? 'good' : status.readiness.level === 'yellow' ? 'warn' : 'bad'}
        />
      </div>

      {status.quality.last && status.quality.last.date === today ? (
        <QualityCard evaluation={status.quality.last} />
      ) : null}

      <SectionTitle>今日课表</SectionTitle>
      {planned ? (
        <Card className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-slate-50">{planned.title}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Pill tone={planned.type === 'rest' ? 'neutral' : 'accent'}>
                  {planned.type === 'rest' ? '休息' : planned.type === 'time_trial' ? '计时赛' : planned.zone ?? '训练'}
                </Pill>
                {planned.distanceM ? <Pill>{formatKm(planned.distanceM)}</Pill> : null}
                {planned.targetPace ? (
                  <Pill tone="sky">{formatPaceRange(planned.targetPace.fastSecKm, planned.targetPace.slowSecKm)}/km</Pill>
                ) : null}
              </div>
            </div>
            {planned.type !== 'rest' ? (
              <Button size="sm" onClick={() => onLog({ type: planned.type, plannedSessionId: planned.id })}>
                <Check size={14} /> 记录
              </Button>
            ) : null}
          </div>
          <p className="text-sm leading-relaxed text-slate-300">{planned.details}</p>
          <div className="rounded-xl border border-line/70 bg-surface-2/40 p-3 text-xs leading-relaxed text-muted">
            <div>目的：{planned.purpose}</div>
            <div className="mt-1">降级：{planned.downgrade}</div>
          </div>
          <ReadinessBadge readiness={status.readiness} />
        </Card>
      ) : activePlan ? (
        <Card className="space-y-2">
          <div className="text-sm font-semibold text-slate-200">本周计划未覆盖今天</div>
          <p className="text-xs leading-relaxed text-muted">
            计划从周一开始；今天可以轻松跑或休息。去「计划」查看本周安排。
          </p>
          <Button variant="secondary" size="sm" onClick={onPlan}>打开计划</Button>
        </Card>
      ) : (
        <Card className="space-y-2">
          <div className="text-sm font-semibold text-slate-200">准备周</div>
          <p className="text-xs leading-relaxed text-muted">
            26 周计划将在 {profile.startDate} 开始。今天保持轻松跑或休息，先把睡眠补上。
          </p>
          <Button variant="secondary" size="sm" onClick={onPlan}>查看计划</Button>
        </Card>
      )}

      <SectionTitle>快速记录</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => onLog({ type: 'easy' })}>
          <CalendarPlus size={16} /> 记录训练
        </Button>
        <Button variant="secondary" onClick={saveRest} disabled={restSaved}>
          <Check size={16} /> {restSaved || checkin?.status === 'rest' ? '已记录休息' : '今天休息'}
        </Button>
        <Button variant="secondary" onClick={onSleep}>
          <Moon size={16} /> 记录睡眠
        </Button>
        <Button variant="secondary" onClick={() => setShowTimer((v) => !v)}>
          <Timer size={16} /> 400 m 计时
        </Button>
      </div>

      {showTimer ? (
        <div ref={timerRef} className="scroll-mt-4">
          <LapTimer onSave={saveLapResult} />
        </div>
      ) : null}

      {hasLoggedRun ? (
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-200">今天的记录</div>
            <Button variant="ghost" size="sm" onClick={() => onLog({ type: 'easy' })}>
              再加一条 <ChevronRight size={14} />
            </Button>
          </div>
          {todaySessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-xs">
              <span className="text-muted">{s.type}</span>
              <span className="tabular text-slate-200">
                {s.distanceM ? formatKm(s.distanceM) : '—'}
                {s.durationSec ? ` · ${formatDuration(s.durationSec)}` : ''}
                {s.distanceM && s.durationSec ? ` · ${formatPace(secondsPerKm(s.distanceM, s.durationSec) ?? 0)}/km` : ''}
              </span>
            </div>
          ))}
        </Card>
      ) : null}

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-200">目标差距</div>
          <Button variant="ghost" size="sm" onClick={onStatus}>
            状态详情 <ChevronRight size={14} />
          </Button>
        </div>
        <div className="flex items-center justify-between text-xs text-muted">
          <span>17:00 需要 {formatPace(204)}/km</span>
          <span className="text-slate-200">现在 {formatPace(status.current5kPaceSecKm)}/km</span>
        </div>
        <div className="text-[11px] text-muted">
          目标置信度 {status.goal.label}；所需月增速 {status.goal.requiredGainPerMonth.toFixed(2)} VDOT。{status.nextMilestone ? `下一检查点：W${status.nextMilestone.week} ${status.nextMilestone.label}` : ''}
        </div>
      </Card>

      {todayPace != null ? (
        <div className="text-center text-[11px] text-muted">今天平均配速 {formatPace(todayPace)}/km</div>
      ) : null}
    </div>
  )
}
