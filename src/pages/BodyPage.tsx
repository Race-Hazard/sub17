import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Scale, Trash2 } from 'lucide-react'
import { Button, Card, EmptyState, SectionTitle, Stat } from '../components/ui'
import { deleteBody, saveBody } from '../db/repo'
import {
  addDaysIso,
  formatShortDate,
  nowIso,
} from '../domain/format'
import type { BodyMetric, IsoDate } from '../domain/types'

function latestOf(metrics: BodyMetric[]): BodyMetric | undefined {
  return [...metrics].sort((a, b) => b.date.localeCompare(a.date))[0]
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function BodyPage({
  metrics,
  today,
  onSaved,
}: {
  metrics: BodyMetric[]
  today: IsoDate
  onSaved: () => void
}) {
  const latest = latestOf(metrics)
  const [date, setDate] = useState(today)
  const [height, setHeight] = useState(
    latest?.heightCm != null ? String(latest.heightCm) : '',
  )
  const [weight, setWeight] = useState(
    latest?.weightKg != null ? String(latest.weightKg) : '',
  )
  const [bodyFat, setBodyFat] = useState('')
  const [waist, setWaist] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const record = metrics.find((m) => m.date === date)
    const fallback = latestOf(metrics)
    setHeight(
      record?.heightCm != null
        ? String(record.heightCm)
        : fallback?.heightCm != null
          ? String(fallback.heightCm)
          : '',
    )
    setWeight(record?.weightKg != null ? String(record.weightKg) : '')
    setBodyFat(record?.bodyFatPct != null ? String(record.bodyFatPct) : '')
    setWaist(record?.waistCm != null ? String(record.waistCm) : '')
    setNotes(record?.notes ?? '')
    // Only re-prefill when the selected date changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const withWeight = useMemo(
    () =>
      [...metrics]
        .filter((m) => m.weightKg != null)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [metrics],
  )
  const recentWeights = withWeight.filter((m) => m.date >= addDaysIso(today, -6))
  const avg7 = average(recentWeights.map((m) => m.weightKg as number))
  const fourWeeksAgo = addDaysIso(today, -28)
  const baseline = withWeight
    .filter((m) => m.date <= fourWeeksAgo)
    .at(-1)
  const current = withWeight.at(-1)?.weightKg
  const change4w =
    baseline?.weightKg != null && current != null
      ? current - baseline.weightKg
      : null
  const heightCm = latest?.heightCm
  const bmi =
    heightCm && current
      ? current / (heightCm / 100) ** 2
      : null

  const chartData = withWeight
    .filter((m) => m.date >= addDaysIso(today, -30))
    .map((m) => ({ date: formatShortDate(m.date), weight: m.weightKg }))

  const save = async () => {
    const w = Number(weight)
    const h = Number(height)
    if (!weight && !height) return
    setSaving(true)
    await saveBody({
      date,
      heightCm: Number.isFinite(h) && h > 0 ? h : undefined,
      weightKg: Number.isFinite(w) && w > 0 ? w : undefined,
      bodyFatPct: Number(bodyFat) > 0 ? Number(bodyFat) : undefined,
      waistCm: Number(waist) > 0 ? Number(waist) : undefined,
      notes: notes.trim() || undefined,
      updatedAt: nowIso(),
    })
    setSaving(false)
    onSaved()
  }

  const remove = async (d: IsoDate) => {
    if (!window.confirm('删除这天的身体数据？')) return
    await deleteBody(d)
  }

  const recent = [...metrics].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10)

  return (
    <div className="space-y-4">
      <header>
        <div className="text-xs font-semibold tracking-[0.3em] text-accent">BODY</div>
        <h1 className="mt-0.5 text-2xl font-bold text-slate-50">身体数据</h1>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Stat
          label="体重"
          value={current != null ? `${current.toFixed(1)} kg` : '—'}
          hint={avg7 != null ? `7 天均 ${avg7.toFixed(1)}` : '记录后显示'}
          tone="accent"
        />
        <Stat
          label="身高"
          value={heightCm != null ? `${heightCm.toFixed(0)} cm` : '—'}
          hint="成人每年测一次即可"
        />
        <Stat
          label="BMI"
          value={bmi != null ? bmi.toFixed(1) : '—'}
          hint="仅参考，不用于训练评分"
          tone={bmi != null && bmi < 18.5 ? 'warn' : 'default'}
        />
      </div>

      {change4w != null ? (
        <div className="rounded-xl border border-line/70 bg-surface-2/40 px-3 py-2 text-xs text-muted">
          4 周体重变化：
          <span className={Math.abs(change4w) > 2 ? 'text-warn' : 'text-slate-200'}>
            {change4w > 0 ? '+' : ''}
            {change4w.toFixed(1)} kg
          </span>
          {Math.abs(change4w) > 2 ? '；降幅/增幅偏大，先检查能量摄入和恢复。' : '；在正常波动范围内。'}
        </div>
      ) : null}

      <SectionTitle>记录身体数据</SectionTitle>
      <Card className="space-y-3">
        <label className="block text-xs text-muted">
          日期
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-muted">
            身高（cm）
            <input
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              inputMode="decimal"
              placeholder="175"
              className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
            />
          </label>
          <label className="block text-xs text-muted">
            体重（kg）
            <input
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              inputMode="decimal"
              placeholder="65.0"
              className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
            />
          </label>
          <label className="block text-xs text-muted">
            体脂（%，可选）
            <input
              value={bodyFat}
              onChange={(e) => setBodyFat(e.target.value)}
              inputMode="decimal"
              placeholder="12"
              className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
            />
          </label>
          <label className="block text-xs text-muted">
            腰围（cm，可选）
            <input
              value={waist}
              onChange={(e) => setWaist(e.target.value)}
              inputMode="decimal"
              placeholder="78"
              className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
            />
          </label>
        </div>
        <label className="block text-xs text-muted">
          备注
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="晨起空腹、同一体重秤…"
            className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-accent"
          />
        </label>
        <Button className="w-full" onClick={save} disabled={saving || (!weight && !height)}>
          <Scale size={16} /> {saving ? '保存中…' : '保存身体数据'}
        </Button>
      </Card>

      <SectionTitle>体重趋势（30 天）</SectionTitle>
      <Card className="h-44">
        {chartData.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="#25324a" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: '#8fa0b8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fill: '#8fa0b8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#121a2b', border: '1px solid #25324a', borderRadius: 12, fontSize: 12 }}
                formatter={(value) => [`${value} kg`, '体重']}
              />
              <Line type="monotone" dataKey="weight" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3, fill: '#38bdf8' }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">
            至少记录两次体重后显示趋势。
          </div>
        )}
      </Card>

      <Card className="space-y-1.5">
        <div className="text-xs font-semibold text-slate-200">建议更新周期</div>
        <div className="text-[11px] leading-relaxed text-muted">
          · 体重：每周 2–3 次，固定晨起、排便后、空腹、同一体重秤；看 7 天平均，不看单日波动。
        </div>
        <div className="text-[11px] leading-relaxed text-muted">
          · 身高：设置时记一次即可；成人每年复测一次。
        </div>
        <div className="text-[11px] leading-relaxed text-muted">
          · 体脂/腰围：每 2–4 周一次，条件尽量一致。
        </div>
        <div className="text-[11px] leading-relaxed text-muted">
          · 比赛周/减量周不主动减重；体重周降幅 &gt;1% 或 4 周持续下降，先增加碳水和恢复。
        </div>
      </Card>

      <SectionTitle>最近记录</SectionTitle>
      {recent.length === 0 ? (
        <EmptyState title="还没有身体数据" hint="先记一次身高和晨起体重。" />
      ) : (
        <div className="space-y-2">
          {recent.map((metric) => (
            <Card key={metric.date} className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <div className="text-sm text-slate-200">{formatShortDate(metric.date)}</div>
                <div className="truncate text-[11px] text-muted">
                  {metric.heightCm ? `${metric.heightCm.toFixed(0)} cm` : '—'}
                  {metric.weightKg ? ` · ${metric.weightKg.toFixed(1)} kg` : ''}
                  {metric.bodyFatPct ? ` · 体脂 ${metric.bodyFatPct}%` : ''}
                  {metric.waistCm ? ` · 腰围 ${metric.waistCm} cm` : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => void remove(metric.date)}
                  className="rounded-lg p-2 text-muted hover:text-bad"
                  aria-label="删除身体数据"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="pb-2 text-center text-[10px] text-muted">
        体重受水分、糖原、盐分影响，单日 ±1 kg 很常见；只用于趋势，不用于训练评分。
      </div>
    </div>
  )
}
