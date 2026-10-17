import { Activity, CalendarDays, Home, Moon, PlusCircle } from 'lucide-react'

export type TabKey = 'today' | 'log' | 'plan' | 'status' | 'sleep'

const TABS: { key: TabKey; label: string; icon: typeof Home }[] = [
  { key: 'today', label: '今日', icon: Home },
  { key: 'log', label: '记录', icon: PlusCircle },
  { key: 'plan', label: '计划', icon: CalendarDays },
  { key: 'status', label: '状态', icon: Activity },
  { key: 'sleep', label: '睡眠', icon: Moon },
]

export function BottomNav({
  active,
  onChange,
}: {
  active: TabKey | 'settings'
  onChange: (tab: TabKey) => void
}) {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/95 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = active === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              aria-label={`打开${tab.label}`}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] transition ${
                isActive ? 'text-accent' : 'text-muted hover:text-slate-200'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={isActive ? 2.4 : 1.8} />
              {tab.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
