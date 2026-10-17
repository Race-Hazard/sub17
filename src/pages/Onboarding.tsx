import { useMemo, useState } from 'react'
import { ChevronRight, Footprints, Timer, Waves } from 'lucide-react'
import { saveProfile, setMeta } from '../db/repo'
import { addDaysIso, formatDuration, formatKm, parseDuration, todayIso } from '../domain/format'
import { totalKm } from '../domain/load'
import { bestCurrentVdot } from '../domain/projection'
import type { Profile, Session } from '../domain/types'
import { equivalentTimeSec, vdotFromPerformance } from '../domain/vdot'
import { Button, Card, Pill } from '../components/ui'

export function Onboarding({
  profile,
  sessions,
  onDone,
}: {
  profile: Profile
  sessions: Session[]
  onDone: () => void
}) {
  const [step, setStep] = useState(0)
  const [goalText, setGoalText] = useState(formatDuration(profile.goalTimeSec))
  const [goalDate, setGoalDate] = useState(profile.goalDate)
  const [sleepHours, setSleepHours] = useState((profile.sleepTargetMin / 60).toFixed(1))
  const [reminder, setReminder] = useState(profile.reminderTime)
  const [sleepReminder, setSleepReminder] = useState(profile.sleepReminderTime)
  const [saving, setSaving] = useState(false)

  const seedStats = useMemo(() => {
    const today = todayIso()
    const tests = sessions
      .filter((s) => s.isTest && (s.testDistanceM ?? s.distanceM ?? 0) >= 1500)
      .map((s) => ({
        date: s.date,
        distanceM: s.testDistanceM ?? s.distanceM ?? 0,
        timeSec: s.durationSec ?? 0,
        vdot:
          s.durationSec && (s.testDistanceM ?? s.distanceM)
            ? vdotFromPerformance(s.testDistanceM ?? s.distanceM ?? 0, s.durationSec)
            : 0,
      }))
      .filter((t) => t.vdot > 0)
    const best = bestCurrentVdot(tests, today)
    const vdot = best?.vdot ?? profile.seedVdot
    const seedDates = sessions.filter((s) => s.isSeed).map((s) => s.date).sort()
    const seedEnd = seedDates.at(-1) ?? today
    return {
      count: sessions.length,
      weeklyKm: totalKm(sessions, addDaysIso(seedEnd, -6), seedEnd),
      vdot,
      fiveK: equivalentTimeSec(vdot, 5000),
    }
  }, [sessions, profile.seedVdot])

  const save = async () => {
    setSaving(true)
    const goalSec = parseDuration(goalText) ?? profile.goalTimeSec
    const sleepMin = Math.round((Number(sleepHours) || 7.5) * 60)
    await saveProfile({
      ...profile,
      goalTimeSec: goalSec,
      goalDate,
      sleepTargetMin: sleepMin,
      reminderTime: reminder,
      sleepReminderTime: sleepReminder,
    })
    await setMeta('onboarded', '1')
    setSaving(false)
    onDone()
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-8 pt-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold tracking-[0.3em] text-accent">SUB17</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-50">个人 5K 训练日志</h1>
        </div>
        <Pill tone="sky">离线优先</Pill>
      </div>

      <div className="mb-5 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-line'}`}
          />
        ))}
      </div>

      {step === 0 ? (
        <div className="space-y-4 animate-fade-up">
          <Card className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Footprints size={18} className="text-accent" /> 记录 → 诊断 → 调整
            </div>
            <p className="text-sm leading-relaxed text-muted">
              每天记录训练或休息、睡眠与体感。App 会实时更新 5 km 等价成绩、负荷与准备度，并生成下一周课表。
            </p>
            <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-muted">
              <div className="rounded-xl border border-line bg-surface-2/50 px-2 py-3">
                <Timer size={18} className="mx-auto mb-1 text-accent-2" />
                400 m 圈计时
              </div>
              <div className="rounded-xl border border-line bg-surface-2/50 px-2 py-3">
                <Waves size={18} className="mx-auto mb-1 text-accent-2" />
                VDOT 与配速
              </div>
              <div className="rounded-xl border border-line bg-surface-2/50 px-2 py-3">
                <Footprints size={18} className="mx-auto mb-1 text-accent-2" />
                26 周课表
              </div>
            </div>
          </Card>
          <Card className="space-y-2 text-sm text-muted">
            <div className="font-semibold text-slate-200">先说清楚边界</div>
            <p>· 数据只存在这台手机，不会上传；请定期导出备份。</p>
            <p>· 纯离线 PWA 无法保证后台定时通知，提醒以 .ics 日历为主。</p>
            <p>· 目标是北极星，不是承诺；App 会如实显示差距。</p>
          </Card>
          <Button size="lg" className="w-full" onClick={() => setStep(1)}>
            开始设置 <ChevronRight size={18} />
          </Button>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4 animate-fade-up">
          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">目标与作息</h2>
            <label className="block text-xs text-muted">
              5 km 目标成绩
              <input
                value={goalText}
                onChange={(e) => setGoalText(e.target.value)}
                inputMode="numeric"
                className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
                placeholder="17:00"
              />
            </label>
            <label className="block text-xs text-muted">
              目标日期
              <input
                type="date"
                value={goalDate}
                onChange={(e) => setGoalDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-muted">
                睡眠目标（小时）
                <input
                  value={sleepHours}
                  onChange={(e) => setSleepHours(e.target.value)}
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
                />
              </label>
              <label className="block text-xs text-muted">
                训练提醒
                <input
                  type="time"
                  value={reminder}
                  onChange={(e) => setReminder(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
                />
              </label>
            </div>
            <label className="block text-xs text-muted">
              睡眠提醒
              <input
                type="time"
                value={sleepReminder}
                onChange={(e) => setSleepReminder(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
              />
            </label>
          </Card>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setStep(0)}>
              返回
            </Button>
            <Button className="flex-1" onClick={() => setStep(2)}>
              下一步 <ChevronRight size={18} />
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4 animate-fade-up">
          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">已导入最近一周</h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-xl font-semibold tabular text-slate-50">{seedStats.count}</div>
                <div className="text-[11px] text-muted">条记录</div>
              </div>
              <div>
                <div className="text-xl font-semibold tabular text-slate-50">{formatKm(seedStats.weeklyKm * 1000)}</div>
                <div className="text-[11px] text-muted">种子 7 天跑量</div>
              </div>
              <div>
                <div className="text-xl font-semibold tabular text-accent">{seedStats.vdot.toFixed(1)}</div>
                <div className="text-[11px] text-muted">当前 VDOT</div>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-surface-2/40 p-3 text-xs leading-relaxed text-muted">
              当前 5 km 等价约 <span className="text-slate-200">{formatDuration(seedStats.fiveK)}</span>。
              种子日期按最近一个周六反推，首次进入后可在记录页修改。W4 的 5 km 计时赛会重新校准配速。
            </div>
          </Card>
          <Card className="space-y-2 text-xs leading-relaxed text-muted">
            <div className="text-sm font-semibold text-slate-200">接下来</div>
            <p>· 先按 RPE 与配速区间跑 3 周，W4 计时赛后锁定五档配速。</p>
            <p>· 每天 20:30 记录训练/休息，07:30 记录睡眠。</p>
            <p>· 设置页可导出备份与 .ics 日历提醒。</p>
          </Card>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setStep(1)}>
              返回
            </Button>
            <Button className="flex-1" onClick={save} disabled={saving}>
              {saving ? '保存中…' : '进入 App'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
