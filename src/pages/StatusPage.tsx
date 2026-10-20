import { useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertTriangle, Award, Copy, Gauge, HeartPulse, Moon } from 'lucide-react'
import { Button, Card, Pill, SectionTitle, Stat } from '../components/ui'
import {
  addDaysIso,
  formatDuration,
  formatPace,
  formatPaceRange,
  formatShortDate,
  nowIso,
} from '../domain/format'
import { checkpointAction, checkpointVerdict } from '../domain/coach'
import { qualityKindLabel } from '../domain/quality'
import { QualityCard } from '../components/QualityCard'
import { downgradeGoal, GOAL_TIERS, MILESTONES } from '../domain/projection'
import { saveProfile } from '../db/repo'
import type { TrainingStatus } from '../domain/status'
import type { Plan, Profile } from '../domain/types'

const ZONE_LABEL = { E: '轻松', M: '马拉松', T: '阈值', I: '间歇', R: '重复' } as const

export function StatusPage({
  status,
  profile,
  activePlan,
}: {
  status: TrainingStatus
  profile: Profile
  activePlan: Plan | null
}) {
  const chartData = status.tests
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => ({ date: formatShortDate(t.date), vdot: Number(t.vdot.toFixed(1)) }))

  const gapSec = status.current5kSec - 17 * 60
  const gapText =
    gapSec > 0
      ? `还差 ${Math.floor(gapSec / 60)}:${Math.round(gapSec % 60).toString().padStart(2, '0')}`
      : '已达标'

  const riskItems = [
    status.load.acwr != null && status.load.acwr > 1.5
      ? `ACWR ${status.load.acwr.toFixed(2)} 偏高，建议下周减量。`
      : null,
    status.sleep.averageMin != null && status.sleep.averageMin < 6 * 60
      ? '近 7 天平均睡眠低于 6 小时。'
      : null,
    status.readiness.level === 'red' ? `准备度红：${status.readiness.reasons.join('；')}` : null,
    status.compliance && status.compliance.rate < 0.7 && status.currentWeekDay >= 5
      ? '本周完成率低于 70%，下一周会重复而非加量。'
      : null,
  ].filter((x): x is string => x != null)

  const lastTest = [...status.tests].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
  const checkpoint = lastTest
    ? MILESTONES.filter(
        (m) => m.distanceM === lastTest.distanceM && m.week <= status.currentWeekIndex,
      ).at(-1)
    : undefined
  const verdict =
    lastTest && checkpoint
      ? checkpointVerdict(lastTest.timeSec, checkpoint.targetSec)
      : null
  const verdictLabel =
    verdict === 'ahead'
      ? '快于目标'
      : verdict === 'onTrack'
        ? '在目标内'
        : verdict === 'slightlySlow'
          ? '慢 2–4%'
          : verdict === 'slow'
            ? '慢 >4%'
            : null

  const [copied, setCopied] = useState(false)
  const report = [
    `Sub17 第 ${status.currentWeekIndex} 周小结`,
    `跑量 ${status.weeklyKm.toFixed(1)} km（4 周平均 ${status.fourWeekAvgKm.toFixed(1)} km/周）`,
    status.compliance
      ? `完成 ${status.compliance.completed}/${status.compliance.planned}（质量课 ${status.compliance.qualityCompleted}/${status.compliance.qualityPlanned}）`
      : '本周计划尚未生成',
    status.sleep.totalAverageMin != null
      ? `总睡眠平均 ${(status.sleep.totalAverageMin / 60).toFixed(1)} h（含午睡），债 ${((status.sleep.debtMin ?? 0) / 60).toFixed(1)} h`
      : '睡眠未记录',
    `准备度 ${status.readiness.level === 'green' ? '绿' : status.readiness.level === 'yellow' ? '黄' : '红'}；ACWR ${status.load.acwr != null ? status.load.acwr.toFixed(2) : '数据不足'}`,
    `当前 5K 等价 ${formatDuration(status.current5kSec)}；目标置信度 ${status.goal.label}`,
    `下周重点：${status.readiness.level === 'red' ? '恢复优先，质量课降级' : '完成周二/周五质量课，周日长距离保持轻松'}`,
  ].join('\n')

  const [goalMsg, setGoalMsg] = useState<string | null>(null)

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be unavailable in insecure contexts.
    }
  }

  const shiftGoal = async (days: number) => {
    await saveProfile({
      ...profile,
      goalDate: addDaysIso(profile.goalDate, days),
      updatedAt: nowIso(),
    })
    setGoalMsg(`目标日期已顺延 ${days} 天`)
  }

  const lowerGoal = async () => {
    const current =
      GOAL_TIERS.find((t) => t.timeSec === profile.goalTimeSec) ??
      GOAL_TIERS.find((t) => t.timeSec >= profile.goalTimeSec) ??
      GOAL_TIERS[0]
    const next = downgradeGoal(current)
    if (next.key === current.key) {
      setGoalMsg('已经是 D 档，建议延长周期而不是继续下调')
      return
    }
    await saveProfile({
      ...profile,
      goalTimeSec: next.timeSec,
      updatedAt: nowIso(),
    })
    setGoalMsg(`目标已下调到 ${next.label}`)
  }

  return (
    <div className="space-y-4">
      <header>
        <div className="text-xs font-semibold tracking-[0.3em] text-accent">STATUS</div>
        <h1 className="mt-0.5 text-2xl font-bold text-slate-50">当前状态</h1>
      </header>

      <Card className="space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-muted">当前 5 km 等价</div>
            <div className="mt-0.5 text-4xl font-bold tabular text-slate-50">{formatDuration(status.current5kSec)}</div>
            <div className="mt-1 text-xs text-muted">
              VDOT {status.currentVdot.toFixed(1)} · {formatPace(status.current5kPaceSecKm)}/km
            </div>
          </div>
          <Pill tone={status.goal.level === 'low' ? 'bad' : status.goal.level === 'medium' ? 'warn' : 'good'}>
            目标置信度 {status.goal.label}
          </Pill>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-line/70 bg-surface-2/40 px-3 py-2 text-xs">
          <span className="text-muted">17:00 目标</span>
          <span className={gapSec > 0 ? 'text-warn' : 'text-good'}>{gapText}</span>
          <span className="text-muted">需 {status.goal.requiredGainPerMonth.toFixed(2)} VDOT/月</span>
        </div>
        <div className="text-[11px] leading-relaxed text-muted">
          预期落点 17:50–18:20；sub-17 是 stretch。检查点未达时 App 会让你选择顺延、下调或延长周期，不会静默改目标。
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="周跑量" value={`${status.weeklyKm.toFixed(1)} km`} hint={activePlan ? `本周目标 ${activePlan.targetKm} km` : '—'} />
        <Stat label="4 周平均" value={`${status.fourWeekAvgKm.toFixed(1)} km`} hint="每周" />
        <Stat
          label="ACWR"
          value={status.load.acwr != null ? status.load.acwr.toFixed(2) : '数据不足'}
          hint={status.load.status === 'optimal' ? '0.8–1.3 安全区' : status.load.status === 'insufficient' ? '累计 ≥14 天后显示' : '关注负荷'}
          tone={status.load.status === 'high' ? 'bad' : status.load.status === 'elevated' ? 'warn' : status.load.status === 'optimal' ? 'good' : 'default'}
        />
        <Stat
          label="睡眠 7 天"
          value={status.sleep.totalAverageMin != null ? `${(status.sleep.totalAverageMin / 60).toFixed(1)} h` : '—'}
          hint={status.sleep.debtMin != null ? `含午睡 · 债 ${(status.sleep.debtMin / 60).toFixed(1)} h` : '记录后显示'}
          tone={status.sleep.totalAverageMin != null && status.sleep.totalAverageMin < 7 * 60 ? 'warn' : 'default'}
        />
      </div>

      <SectionTitle>训练配速</SectionTitle>
      <Card className="space-y-2">
        {(['E', 'M', 'T', 'I', 'R'] as const).map((zone) => (
          <div key={zone} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs text-muted">{zone} {ZONE_LABEL[zone]}</span>
            </div>
            <span className="tabular text-slate-200">
              {formatPaceRange(status.paces[zone].fastSecKm, status.paces[zone].slowSecKm)}/km
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-line/70 pt-2 text-sm">
          <span className="text-xs text-muted">5K 当前</span>
          <span className="tabular text-accent">{formatPace(status.current5kPaceSecKm)}/km</span>
        </div>
      </Card>

      <SectionTitle>质量课评估</SectionTitle>
      {status.quality.last ? (
        <div className="space-y-2">
          <QualityCard evaluation={status.quality.last} />
          {status.quality.history.length > 1 ? (
            <Card className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-300">最近几次</div>
              {status.quality.history.slice(1, 4).map((evaluation) => (
                <div
                  key={evaluation.sessionId}
                  className="flex min-w-0 items-center justify-between gap-2 text-[11px]"
                >
                  <span className="min-w-0 truncate text-muted">
                    {formatShortDate(evaluation.date)} · {qualityKindLabel(evaluation.kind)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="tabular text-slate-300">
                      {formatPace(evaluation.avgPaceSecKm)}/km
                    </span>
                    <Pill
                      tone={
                        evaluation.verdict === 'excellent' ||
                        evaluation.verdict === 'onTarget'
                          ? 'good'
                          : evaluation.verdict === 'fade'
                            ? 'warn'
                            : evaluation.verdict === 'fast'
                              ? 'sky'
                              : 'bad'
                      }
                    >
                      {evaluation.verdictLabel}
                    </Pill>
                  </div>
                </div>
              ))}
            </Card>
          ) : null}
        </div>
      ) : (
        <Card>
          <div className="text-xs leading-relaxed text-muted">
            还没有质量课评估。记录一次间歇/阈值/重复后，这里会自动生成评价和下次建议。
          </div>
        </Card>
      )}

      <SectionTitle>VDOT 趋势</SectionTitle>
      <Card>
        {chartData.length >= 2 ? (
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#25324a" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: '#8fa0b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fill: '#8fa0b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#121a2b', border: '1px solid #25324a', borderRadius: 12, fontSize: 12 }}
                  labelStyle={{ color: '#8fa0b8' }}
                />
                <Line type="monotone" dataKey="vdot" stroke="#c7f464" strokeWidth={2} dot={{ r: 3, fill: '#c7f464' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-4 text-center text-xs text-muted">
            还只有一个有效测试。W4 的 5 km 计时赛后会出现趋势。
          </div>
        )}
        <div className="mt-2 text-[11px] text-muted">
          只有 `isTest=true` 且 ≥1500 m 的成绩进入 VDOT；间歇与 400 m 不计入。
        </div>
      </Card>

      <SectionTitle>检查点</SectionTitle>
      <Card className="space-y-2">
        {MILESTONES.map((m) => {
          const done = status.tests.some((t) => t.date >= profile.startDate && t.distanceM === m.distanceM && t.timeSec <= m.targetSec)
          const upcoming = m.week >= status.currentWeekIndex
          return (
            <div key={m.week} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${done ? 'bg-good/15 text-good' : upcoming ? 'bg-surface-2 text-muted' : 'bg-surface-2 text-muted'}`}>
                  {done ? '✓' : m.week}
                </span>
                <span className="text-slate-300">W{m.week} · {m.label}</span>
              </div>
              <span className="text-muted">{m.note}</span>
            </div>
          )
        })}
      </Card>

      {lastTest && checkpoint ? (
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-200">
              最近检查点 W{checkpoint.week} · {checkpoint.label}
            </div>
            <Pill tone={verdict === 'ahead' || verdict === 'onTrack' ? 'good' : verdict === 'slightlySlow' ? 'warn' : 'bad'}>
              {verdictLabel}
            </Pill>
          </div>
          <div className="text-xs text-muted">
            实际 {formatDuration(lastTest.timeSec)}（{formatShortDate(lastTest.date)}），目标 {formatDuration(checkpoint.targetSec)}。
          </div>
          <div className="text-xs leading-relaxed text-slate-300">
            {verdict ? checkpointAction(verdict) : ''}
          </div>
          {verdict === 'slightlySlow' || verdict === 'slow' ? (
            <div className="space-y-2 border-t border-line/70 pt-2">
              <div className="text-[11px] text-muted">目标协商（需要你确认，App 不会自动改）</div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => void shiftGoal(14)}>
                  顺延 2 周
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void lowerGoal()}>
                  目标下调一档
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void shiftGoal(28)}>
                  延长 4 周
                </Button>
              </div>
              {goalMsg ? <div className="text-[11px] text-accent">{goalMsg}</div> : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      <SectionTitle>风险与提醒</SectionTitle>
      <Card className="space-y-2">
        {riskItems.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-good">
            <HeartPulse size={14} /> 目前没有触发风险规则。
          </div>
        ) : (
          riskItems.map((item) => (
            <div key={item} className="flex items-start gap-2 text-xs text-warn">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {item}
            </div>
          ))
        )}
        <div className="flex items-center gap-2 border-t border-line/70 pt-2 text-[11px] text-muted">
          <Moon size={13} /> 睡眠目标 {profile.sleepTargetMin / 60} h · 单调性 {status.load.monotony ?? '—'} · 应变 {status.load.strain ?? '—'}
        </div>
      </Card>

      <SectionTitle>本周小结</SectionTitle>
      <Card className="space-y-3">
        <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-300">
          {report}
        </pre>
        <Button size="sm" variant="secondary" onClick={() => void copyReport()}>
          <Copy size={14} /> {copied ? '已复制' : '复制小结'}
        </Button>
      </Card>

      <SectionTitle>目标阶梯</SectionTitle>
      <Card className="space-y-2">
        {GOAL_TIERS.map((tier) => (
          <div key={tier.key} className="flex items-center justify-between text-xs">
            <span className="text-muted">{tier.key} 目标</span>
            <span className="text-slate-200">{tier.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <Award size={13} /> 未达检查点时按 A→B→C→D 下调一档，需要你确认。
        </div>
      </Card>

      <div className="pb-2 text-center text-[10px] text-muted">
        <Gauge size={12} className="mr-1 inline" /> 数据只在本机计算；没有手表时准备度主要依赖睡眠与 RPE。
      </div>
    </div>
  )
}
