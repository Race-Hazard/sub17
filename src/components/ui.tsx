import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-line bg-surface/90 p-4 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.9)] ${
        onClick ? 'cursor-pointer active:scale-[0.995]' : ''
      } ${className}`}
    >
      {children}
    </div>
  )
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}) {
  const variants = {
    primary: 'bg-accent text-ink hover:brightness-105',
    secondary: 'bg-surface-2 text-slate-100 border border-line hover:bg-surface-2/80',
    ghost: 'bg-transparent text-muted hover:text-slate-100',
    danger: 'bg-bad/15 text-bad border border-bad/30',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-sm rounded-lg',
    md: 'px-4 py-2.5 text-sm rounded-xl',
    lg: 'px-5 py-3.5 text-base rounded-2xl',
  }
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Pill({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' | 'sky'
  className?: string
}) {
  const tones = {
    neutral: 'bg-surface-2 text-muted border-line',
    good: 'bg-good/10 text-good border-good/25',
    warn: 'bg-warn/10 text-warn border-warn/25',
    bad: 'bg-bad/10 text-bad border-bad/25',
    accent: 'bg-accent/10 text-accent border-accent/25',
    sky: 'bg-accent-2/10 text-accent-2 border-accent-2/25',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'accent'
}) {
  const colors = {
    default: 'text-slate-100',
    good: 'text-good',
    warn: 'text-warn',
    bad: 'text-bad',
    accent: 'text-accent',
  }
  return (
    <div className="rounded-xl border border-line/70 bg-surface-2/50 px-3 py-2.5">
      <div className="text-[11px] tracking-wide text-muted">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular ${colors[tone]}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted">{hint}</div> : null}
    </div>
  )
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mb-2 flex items-center justify-between px-0.5">
      <h2 className="text-sm font-semibold tracking-wide text-slate-200">{children}</h2>
      {action}
    </div>
  )
}

export function ProgressBar({
  value,
  max,
  tone = 'accent',
}: {
  value: number
  max: number
  tone?: 'accent' | 'good' | 'warn' | 'bad'
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const colors = {
    accent: 'bg-accent',
    good: 'bg-good',
    warn: 'bg-warn',
    bad: 'bg-bad',
  }
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line/70">
      <div className={`h-full rounded-full ${colors[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/40 px-4 py-8 text-center">
      <div className="text-sm font-medium text-slate-300">{title}</div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  )
}
