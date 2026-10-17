import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Moon, Trash2 } from 'lucide-react'
import { Button, Card, EmptyState, Pill, SectionTitle, Stat } from '../components/ui'
import { deleteSleep, saveSleep } from '../db/repo'
import {
  addDaysIso,
  formatShortDate,
  formatWeekday,
  nowIso,
} from '../domain/format'
import { durationBetween, formatSleepMinutes, sleepSummary } from '../domain/sleep'
import type { IsoDate, Profile, SleepRecord } from '../domain/types'

export function SleepPage({
  sleeps,
  profile,
  today,
  onSaved,
}: {
  sleeps: SleepRecord[]
  profile: Profile
  today: IsoDate
  onSaved: () => void
}) {
  const [date, setDate] = useState(today)
  const [mode, setMode] = useState<'times' | 'duration'>('times')
  const [bedtime, setBedtime] = useState('23:00')
  const [wakeTime, setWakeTime] = useState('07:00')
  const [hours, setHours] = useState('7.5')
  const [quality, setQuality] = useState(3)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const durationMin = mode === 'times'
    ? durationBetween(bedtime, wakeTime) ?? 0
    : Math.round((Number(hours) || 0) * 60)

  const summary = useMemo(
    () => sleepSummary(sleeps, profile.sleepTargetMin, today, 7),
    [sleeps, profile.sleepTargetMin, today],
  )

  const chartData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDaysIso(today, -(6 - i)))
    return days.map((d) => {
      const rec = sleeps.find((s) => s.date === d)
      return {
        date: formatWeekday(d),
        hours: rec ? Number((rec.durationMin / 60).toFixed(1)) : 0,
        has: rec != null,
      }
    })
  }, [sleeps, today])

  const invalidDuration = durationMin <= 0 || durationMin > 16 * 60

  const save = async () => {
    if (invalidDuration) return
    setSaving(true)
    await saveSleep({
      date,
      bedtime: mode === 'times' ? bedtime : undefined,
      wakeTime: mode === 'times' ? wakeTime : undefined,
      durationMin,
      quality,
      notes: notes.trim() || undefined,
      updatedAt: nowIso(),
    })
    setSaving(false)
    setNotes('')
    onSaved()
  }

  const remove = async (d: IsoDate) => {
    if (!window.confirm('删除这晚的睡眠记录？')) return
    await deleteSleep(d)
  }

  const recent = [...sleeps].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10)

  return (
    <div className="space-y-4">
      <header>
        <div className="text-xs font-semibold tracking-[0.3em] text-accent">SLEEP</div>
        <h1 className="mt-0.5 text-2xl font-bold text-slate-50">睡眠</h1>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Stat
          label="7 天平均"
          value={summary.averageMin != null ? `${(summary.averageMin / 60).toFixed(1)} h` : '—'}
          hint={summary.nights ? `${summary.nights} 晚` : '还没记录'}
          tone={
            summary.averageMin == null
              ? 'default'
              : summary.averageMin < profile.sleepTargetMin
                ? 'warn'
                : 'good'
          }
        />
        <Stat
          label="睡眠债"
          value={summary.debtMin != null ? `${(summary.debtMin / 60).toFixed(1)} h` : '—'}
          hint={`目标 ${(profile.sleepTargetMin / 60).toFixed(1)} h`}
          tone={
            summary.debtMin == null
              ? 'default'
              : summary.debtMin > 300
                ? 'bad'
                : summary.debtMin > 0
                  ? 'warn'
                  : 'good'
          }
        />
        <Stat
          label="作息规律"
          value={summary.midpointStdMin != null ? `±${summary.midpointStdMin} min` : '—'}
          hint="中点标准差"
        />
      </div>

      <Card className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
            <CartesianGrid stroke="#25324a" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#8fa0b8', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 10]} tick={{ fill: '#8fa0b8', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#121a2b', border: '1px solid #25324a', borderRadius: 12, fontSize: 12 }}
              formatter={(value) => [`${value} h`, '睡眠']}
            />
            <ReferenceLine y={profile.sleepTargetMin / 60} stroke="#c7f464" strokeDasharray="4 4" />
            <Bar dataKey="hours" fill="#38bdf8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <SectionTitle>记录睡眠</SectionTitle>
      <Card className="space-y-3">
        <div className="flex gap-2">
          <Button variant={mode === 'times' ? 'primary' : 'secondary'} size="sm" className="flex-1" onClick={() => setMode('times')}>
            上床/起床
          </Button>
          <Button variant={mode === 'duration' ? 'primary' : 'secondary'} size="sm" className="flex-1" onClick={() => setMode('duration')}>
            只记总时长
          </Button>
        </div>
        <label className="block text-xs text-muted">
          日期（醒来那天）
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
          />
        </label>
        {mode === 'times' ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-muted">
              上床
              <input
                type="time"
                value={bedtime}
                onChange={(e) => setBedtime(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
              />
            </label>
            <label className="block text-xs text-muted">
              起床
              <input
                type="time"
                value={wakeTime}
                onChange={(e) => setWakeTime(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
              />
            </label>
          </div>
        ) : (
          <label className="block text-xs text-muted">
            总时长（小时）
            <input
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
            />
          </label>
        )}
        <div className="flex items-center justify-between rounded-xl border border-line/70 bg-surface-2/40 px-3 py-2 text-sm">
          <span className="text-muted">计算时长</span>
          <span className="tabular text-slate-100">{formatSleepMinutes(durationMin)}</span>
        </div>
        {invalidDuration ? (
          <div className="text-[11px] text-bad">请检查上床/起床时间（时长应在 0–16 h）。</div>
        ) : null}
        <label className="block text-xs text-muted">
          睡眠质量 <span className="text-slate-300">{quality}/5</span>
          <input
            type="range"
            min={1}
            max={5}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="mt-2 w-full accent-[color:var(--color-accent)]"
          />
        </label>
        <label className="block text-xs text-muted">
          备注
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="醒来次数、梦多、咖啡因…"
            className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-accent"
          />
        </label>
        <Button className="w-full" onClick={save} disabled={saving || invalidDuration}>
          <Moon size={16} /> {saving ? '保存中…' : '保存睡眠'}
        </Button>
      </Card>

      <SectionTitle>最近睡眠</SectionTitle>
      {recent.length === 0 ? (
        <EmptyState title="还没有睡眠记录" hint="先记昨晚：上床 23:00、起床 07:00。" />
      ) : (
        <div className="space-y-2">
          {recent.map((r) => (
            <Card key={r.date} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm text-slate-200">{formatShortDate(r.date)}</div>
                <div className="text-[11px] text-muted">
                  {r.bedtime && r.wakeTime ? `${r.bedtime}–${r.wakeTime} · ` : ''}
                  {formatSleepMinutes(r.durationMin)}
                  {r.quality ? ` · 质量 ${r.quality}/5` : ''}
                </div>
              </div>
              <button onClick={() => remove(r.date)} className="rounded-lg p-2 text-muted hover:text-bad" aria-label="删除">
                <Trash2 size={16} />
              </button>
            </Card>
          ))}
        </div>
      )}

      <div className="pb-2 text-center text-[10px] text-muted">
        <Pill tone="neutral">睡眠债按已记录夜晚计算，缺失夜晚不臆测</Pill>
      </div>
    </div>
  )
}
