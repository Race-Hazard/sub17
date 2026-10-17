import { useMemo, useRef, useState } from 'react'
import { ChevronDown, Pencil, Plus, Save, Trash2, Upload, X } from 'lucide-react'
import { Button, Card, EmptyState, Pill, SectionTitle } from '../components/ui'
import { deleteCheckin, deleteSession, saveCheckin, saveSession } from '../db/repo'
import {
  formatDuration,
  formatKm,
  formatPace,
  formatShortDate,
  nowIso,
  parseDuration,
  secondsPerKm,
  uid,
} from '../domain/format'
import { parseGpx } from '../domain/gpx'
import type { IsoDate, Session, SessionType } from '../domain/types'

const TYPES: { key: SessionType; label: string }[] = [
  { key: 'easy', label: '轻松跑' },
  { key: 'long', label: '长距离' },
  { key: 'interval', label: '间歇' },
  { key: 'threshold', label: '阈值' },
  { key: 'repetition', label: '重复' },
  { key: 'time_trial', label: '计时赛' },
  { key: 'strength', label: '力量' },
  { key: 'rest', label: '休息' },
]

const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.key, t.label])) as Record<SessionType, string>

interface RepDraft {
  distanceM: number
  time: string
  recoverySec: number
}

const DEFAULT_REPS: RepDraft[] = [
  { distanceM: 1000, time: '3:45', recoverySec: 90 },
  { distanceM: 1000, time: '3:45', recoverySec: 90 },
  { distanceM: 1000, time: '3:45', recoverySec: 90 },
  { distanceM: 1000, time: '3:45', recoverySec: 90 },
]

export function Log({
  prefill,
  today,
  sessions,
  onSaved,
}: {
  prefill?: Partial<Session> | null
  today: IsoDate
  sessions: Session[]
  onSaved: () => void
}) {
  const [date, setDate] = useState(prefill?.date ?? today)
  const [type, setType] = useState<SessionType>(prefill?.type ?? 'easy')
  const [distanceKm, setDistanceKm] = useState(
    prefill?.distanceM ? (prefill.distanceM / 1000).toFixed(2) : '',
  )
  const [durationText, setDurationText] = useState(
    prefill?.durationSec ? formatDuration(prefill.durationSec) : '',
  )
  const [rpe, setRpe] = useState(prefill?.rpe ?? 4)
  const [notes, setNotes] = useState(prefill?.notes ?? '')
  const [reps, setReps] = useState<RepDraft[]>(DEFAULT_REPS)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingSession, setEditingSession] = useState<Session | null>(null)
  const [gpxError, setGpxError] = useState<string | null>(null)
  const gpxRef = useRef<HTMLInputElement>(null)

  const isInterval = type === 'interval' || type === 'repetition'
  const isStrength = type === 'strength'
  const isRest = type === 'rest'
  const isTest = type === 'time_trial'

  const intervalTotals = useMemo(() => {
    const workM = reps.reduce((sum, r) => sum + r.distanceM, 0)
    const workSec = reps.reduce((sum, r) => sum + (parseDuration(r.time) ?? 0), 0)
    const recoverySec = reps.reduce((sum, r) => sum + r.recoverySec, 0)
    return {
      workM,
      workSec,
      totalM: workM + 4000,
      totalSec: workSec + recoverySec + 1200,
    }
  }, [reps])

  const effectiveDistanceM = isInterval
    ? intervalTotals.totalM
    : isRest || isStrength
      ? 0
      : Math.round((Number(distanceKm) || 0) * 1000)
  const effectiveDurationSec = isInterval
    ? intervalTotals.totalSec
    : isRest
      ? 0
      : parseDuration(durationText) ?? 0
  const pace =
    effectiveDistanceM > 0 && effectiveDurationSec > 0
      ? secondsPerKm(effectiveDistanceM, effectiveDurationSec)
      : null

  const updateRep = (index: number, patch: Partial<RepDraft>) => {
    setReps((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const loadForEdit = (session: Session) => {
    setEditingSession(session)
    setDate(session.date)
    setType(session.type)
    setDistanceKm(session.distanceM ? (session.distanceM / 1000).toFixed(2) : '')
    setDurationText(session.durationSec ? formatDuration(session.durationSec) : '')
    setRpe(session.rpe ?? 4)
    setNotes(session.notes ?? '')
    if (session.type === 'interval' || session.type === 'repetition') {
      const segments = session.segments ?? []
      const work = segments
        .map((seg, idx) => ({ seg, idx }))
        .filter(({ seg }) => seg.kind === 'work')
      if (work.length > 0) {
        setReps(
          work.map(({ seg, idx }) => {
            const after = segments[idx + 1]
            return {
              distanceM: seg.distanceM ?? 400,
              time: formatDuration(seg.durationSec ?? 0),
              recoverySec:
                after?.kind === 'recovery' ? (after.durationSec ?? 90) : 90,
            }
          }),
        )
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const save = async () => {
    setSaving(true)
    const segments =
      isInterval
        ? [
            { kind: 'warmup' as const, distanceM: 2000, durationSec: 600 },
            ...reps.flatMap((r) => {
              const workSec = parseDuration(r.time) ?? 0
              return [
                {
                  kind: 'work' as const,
                  distanceM: r.distanceM,
                  durationSec: workSec,
                  label: `${formatKm(r.distanceM)} @ ${formatPace(workSec / (r.distanceM / 1000))}/km`,
                },
                {
                  kind: 'recovery' as const,
                  durationSec: r.recoverySec,
                },
              ]
            }),
            { kind: 'cooldown' as const, distanceM: 2000, durationSec: 600 },
          ]
        : prefill?.segments

    await saveSession({
      id: editingSession?.id ?? prefill?.id ?? uid(),
      date,
      type,
      distanceM: effectiveDistanceM || undefined,
      durationSec: effectiveDurationSec || undefined,
      rpe: isRest ? undefined : rpe,
      notes: notes.trim() || undefined,
      source: 'manual',
      plannedSessionId: editingSession?.plannedSessionId ?? prefill?.plannedSessionId,
      isTest: isTest && effectiveDistanceM >= 1500,
      testDistanceM: isTest && effectiveDistanceM >= 1500 ? effectiveDistanceM : undefined,
      segments: isInterval ? segments : (editingSession?.segments ?? prefill?.segments),
      strengthSets: isStrength ? editingSession?.strengthSets : undefined,
      createdAt: editingSession?.createdAt ?? prefill?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    })
    if (type === 'rest') {
      await saveCheckin({
        date,
        status: 'rest',
        notes: notes.trim() || undefined,
        updatedAt: nowIso(),
      })
    }
    setSaving(false)
    onSaved()
  }

  const importGpx = async (file: File) => {
    try {
      const summary = parseGpx(await file.text())
      if (summary.startDate) setDate(summary.startDate)
      setDistanceKm((summary.distanceM / 1000).toFixed(2))
      if (summary.durationSec > 0) setDurationText(formatDuration(summary.durationSec))
      setType(summary.distanceM >= 15000 ? 'long' : 'easy')
      setNotes((prev) => prev || `GPX 导入：${summary.pointCount} 个轨迹点`)
      setGpxError(null)
    } catch (error) {
      setGpxError(error instanceof Error ? error.message : 'GPX 导入失败')
    }
  }

  const cancelEdit = () => {
    setEditingSession(null)
    setDate(today)
    setType('easy')
    setDistanceKm('')
    setDurationText('')
    setRpe(4)
    setNotes('')
  }

  const remove = async (id: string) => {
    if (!window.confirm('删除这条记录？派生状态会立即回滚。')) return
    const session = sessions.find((s) => s.id === id)
    await deleteSession(id)
    if (session?.type === 'rest') await deleteCheckin(session.date)
  }

  const recent = [...sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12)

  return (
    <div className="space-y-4">
      <header>
        <div className="text-xs font-semibold tracking-[0.3em] text-accent">LOG</div>
        <h1 className="mt-0.5 text-2xl font-bold text-slate-50">记录训练</h1>
      </header>

      {editingSession ? (
        <div className="flex items-center justify-between rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
          <span>正在编辑 {formatShortDate(editingSession.date)} 的记录</span>
          <button onClick={cancelEdit} className="flex items-center gap-1 underline underline-offset-2">
            <X size={12} /> 取消
          </button>
        </div>
      ) : null}

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">手动记录，或从 GPX 导入</span>
          <Button variant="secondary" size="sm" onClick={() => gpxRef.current?.click()}>
            <Upload size={14} /> 导入 GPX
          </Button>
          <input
            ref={gpxRef}
            type="file"
            accept=".gpx,application/gpx+xml,application/xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importGpx(file)
              e.target.value = ''
            }}
          />
        </div>
        {gpxError ? (
          <div className="rounded-lg border border-bad/25 bg-bad/10 px-2.5 py-1.5 text-[11px] text-bad">
            {gpxError}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                type === t.key
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-line bg-surface-2/50 text-muted hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label className="block text-xs text-muted">
          日期
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
          />
        </label>

        {!isRest && !isStrength && !isInterval ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-muted">
              距离（km）
              <input
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
                inputMode="decimal"
                placeholder="8.0"
                className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
              />
            </label>
            <label className="block text-xs text-muted">
              用时（分:秒）
              <input
                value={durationText}
                onChange={(e) => setDurationText(e.target.value)}
                inputMode="numeric"
                placeholder="40:00"
                className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
              />
            </label>
          </div>
        ) : null}

        {isStrength ? (
          <label className="block text-xs text-muted">
            时长（分:秒）
            <input
              value={durationText}
              onChange={(e) => setDurationText(e.target.value)}
              inputMode="numeric"
              placeholder="30:00"
              className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
            />
          </label>
        ) : null}

        {isInterval ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">间歇结构</span>
              <span className="text-[11px] text-muted">总 {formatKm(intervalTotals.totalM)} · {formatDuration(intervalTotals.totalSec)}</span>
            </div>
            {reps.map((rep, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-1.5">
                <label className="block text-[10px] text-muted">
                  距离 m
                  <input
                    value={rep.distanceM}
                    onChange={(e) => updateRep(i, { distanceM: Number(e.target.value) || 0 })}
                    inputMode="numeric"
                    className="mt-0.5 w-full rounded-lg border border-line bg-ink/60 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-accent"
                  />
                </label>
                <label className="block text-[10px] text-muted">
                  用时
                  <input
                    value={rep.time}
                    onChange={(e) => updateRep(i, { time: e.target.value })}
                    inputMode="numeric"
                    className="mt-0.5 w-full rounded-lg border border-line bg-ink/60 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-accent"
                  />
                </label>
                <label className="block text-[10px] text-muted">
                  恢复 s
                  <input
                    value={rep.recoverySec}
                    onChange={(e) => updateRep(i, { recoverySec: Number(e.target.value) || 0 })}
                    inputMode="numeric"
                    className="mt-0.5 w-full rounded-lg border border-line bg-ink/60 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-accent"
                  />
                </label>
                <button
                  onClick={() => setReps((prev) => prev.filter((_, idx) => idx !== i))}
                  className="mb-1 rounded-lg p-1.5 text-muted hover:text-bad"
                  aria-label="删除这一组"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setReps((prev) => [...prev, { distanceM: prev.at(-1)?.distanceM ?? 400, time: prev.at(-1)?.time ?? '1:30', recoverySec: prev.at(-1)?.recoverySec ?? 90 }])}
            >
              <Plus size={14} /> 加一组
            </Button>
          </div>
        ) : null}

        {!isRest ? (
          <label className="block text-xs text-muted">
            主观强度 RPE <span className="text-slate-300">{rpe}</span>
            <input
              type="range"
              min={1}
              max={10}
              value={rpe}
              onChange={(e) => setRpe(Number(e.target.value))}
              className="mt-2 w-full accent-[color:var(--color-accent)]"
            />
          </label>
        ) : null}

        <label className="block text-xs text-muted">
          备注
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="体感、天气、场地、疼痛…"
            className="mt-1 w-full resize-none rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-accent"
          />
        </label>

        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between text-xs text-muted"
        >
          <span>配速预览</span>
          <span className="flex items-center gap-1">
            {pace ? `${formatPace(pace)}/km` : '—'} <ChevronDown size={14} className={showAdvanced ? 'rotate-180' : ''} />
          </span>
        </button>
        {showAdvanced ? (
          <div className="rounded-xl border border-line/70 bg-surface-2/40 p-3 text-[11px] leading-relaxed text-muted">
            距离 {formatKm(effectiveDistanceM)}，用时 {formatDuration(effectiveDurationSec)}，平均配速 {pace ? formatPace(pace) : '—'}/km。
            间歇总距离/总时长默认包含 2 km 热身 + 2 km 放松；如不一致，请直接记录主课或修改备注。
          </div>
        ) : null}

        <Button className="w-full" size="lg" onClick={save} disabled={saving || (isRest ? false : effectiveDurationSec <= 0)}>
          <Save size={18} /> {saving ? '保存中…' : editingSession ? '保存修改' : '保存记录'}
        </Button>
      </Card>

      <SectionTitle>最近记录</SectionTitle>
      {recent.length === 0 ? (
        <EmptyState title="还没有记录" hint="先用上面的表单记一条，或从今日页开始 400 m 计时。" />
      ) : (
        <div className="space-y-2">
          {recent.map((s) => {
            const p = s.distanceM && s.durationSec ? secondsPerKm(s.distanceM, s.durationSec) : null
            return (
              <Card key={s.id} className="flex items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-200">{TYPE_LABEL[s.type] ?? s.type}</span>
                    {s.isTest ? <Pill tone="accent">测试</Pill> : null}
                    {s.isSeed ? <Pill tone="neutral">种子</Pill> : null}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {formatShortDate(s.date)}
                    {s.distanceM ? ` · ${formatKm(s.distanceM)}` : ''}
                    {s.durationSec ? ` · ${formatDuration(s.durationSec)}` : ''}
                    {p ? ` · ${formatPace(p)}/km` : ''}
                    {s.rpe ? ` · RPE ${s.rpe}` : ''}
                  </div>
                </div>
                <div className="flex shrink-0">
                  <button
                    onClick={() => loadForEdit(s)}
                    className="rounded-lg p-2 text-muted hover:text-accent"
                    aria-label="编辑"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => remove(s.id)}
                    className="rounded-lg p-2 text-muted hover:text-bad"
                    aria-label="删除"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
