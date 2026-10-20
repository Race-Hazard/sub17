import { Lightbulb, Sparkles } from 'lucide-react'
import {
  formatPace,
  formatPaceRange,
  formatShortDate,
} from '../domain/format'
import { qualityKindLabel, type QualityEvaluation } from '../domain/quality'

function colorFor(verdict: QualityEvaluation['verdict']): string {
  if (verdict === 'excellent' || verdict === 'onTarget') return 'text-good'
  if (verdict === 'fade') return 'text-warn'
  if (verdict === 'fast') return 'text-accent-2'
  return 'text-bad'
}

function Metric({
  label,
  value,
  unit,
}: {
  label: string
  value: string
  unit?: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-line/60 bg-ink/40 px-2 py-1.5">
      <div className="truncate text-[10px] text-muted">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-0.5 whitespace-nowrap">
        <span className="tabular text-sm font-semibold text-slate-100">{value}</span>
        {unit ? <span className="text-[10px] text-muted">{unit}</span> : null}
      </div>
    </div>
  )
}

export function QualityCard({
  evaluation,
  showAdvice = true,
}: {
  evaluation: QualityEvaluation
  showAdvice?: boolean
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.9)]">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-accent via-accent-2 to-accent" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Sparkles size={13} className="text-accent" />
            <span className="text-[11px] font-semibold tracking-wide text-accent">
              {qualityKindLabel(evaluation.kind)}
            </span>
            <span className="text-[11px] text-muted">
              {formatShortDate(evaluation.date)}
            </span>
          </div>
          <div className={`mt-1 text-2xl font-bold leading-tight ${colorFor(evaluation.verdict)}`}>
            {evaluation.verdictLabel}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            质量课评估 · 自动生成
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <Metric label="组数" value={String(evaluation.reps)} />
        <Metric label="平均" value={formatPace(evaluation.avgPaceSecKm)} unit="/km" />
        <Metric
          label="衰减"
          value={evaluation.reps >= 2 ? `${evaluation.fadePct.toFixed(1)}%` : '—'}
        />
        <Metric label="RPE" value={evaluation.rpe != null ? String(evaluation.rpe) : '—'} />
        <Metric label="完成" value={`${Math.round(evaluation.completionPct)}%`} />
        <Metric
          label="目标"
          value={
            evaluation.targetPace
              ? formatPaceRange(
                  evaluation.targetPace.fastSecKm,
                  evaluation.targetPace.slowSecKm,
                )
              : '—'
          }
        />
      </div>

      {showAdvice ? <AdviceBox text={evaluation.nextAdvice} className="mt-3" /> : null}
    </div>
  )
}

export function AdviceBox({
  text,
  className = '',
}: {
  text: string
  className?: string
}) {
  return (
    <div
      className={`rounded-xl border border-accent/25 bg-accent/5 p-3 ${className}`}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-accent">
        <Lightbulb size={13} /> 下次同类课建议
      </div>
      <div className="mt-1 break-words text-[11px] leading-relaxed text-slate-300">
        {text}
      </div>
    </div>
  )
}
