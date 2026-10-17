import { readinessAdvice, readinessLabel } from '../domain/readiness'
import type { Readiness } from '../domain/types'
import { Pill } from './ui'

export function ReadinessBadge({ readiness, compact = false }: { readiness: Readiness; compact?: boolean }) {
  const tone = readiness.level === 'green' ? 'good' : readiness.level === 'yellow' ? 'warn' : 'bad'
  return (
    <div className="space-y-1">
      <Pill tone={tone}>
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            readiness.level === 'green' ? 'bg-good' : readiness.level === 'yellow' ? 'bg-warn' : 'bg-bad'
          }`}
        />
        准备度 {readinessLabel(readiness.level)}
        {readiness.overridden ? ' · 手动' : ''}
      </Pill>
      {!compact ? (
        <div className="space-y-0.5 text-[11px] leading-relaxed text-muted">
          {readiness.reasons.map((reason) => (
            <div key={reason}>· {reason}</div>
          ))}
          <div className="text-slate-400">{readinessAdvice(readiness.level)}</div>
        </div>
      ) : null}
    </div>
  )
}
