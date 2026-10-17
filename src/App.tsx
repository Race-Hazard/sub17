import { useEffect, useRef, useState } from 'react'
import { Settings as SettingsIcon } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BottomNav, type TabKey } from './components/BottomNav'
import { Onboarding } from './pages/Onboarding'
import { Today } from './pages/Today'
import { Log } from './pages/Log'
import { PlanPage } from './pages/PlanPage'
import { StatusPage } from './pages/StatusPage'
import { SleepPage } from './pages/SleepPage'
import { SettingsPage } from './pages/SettingsPage'
import { db } from './db/schema'
import { ensureSeed } from './db/seed'
import { activateCurrentWeekPlan, ensurePlanForWeek } from './db/repo'
import { addDaysIso, todayIso, mondayOf, weekdayIndex } from './domain/format'
import { getWeekIndex, weeklyTargetKm } from './domain/plan'
import { adjustNextWeek, latestCheckpointVerdict } from './domain/coach'
import { initSync, setupSyncListeners } from './sync/engine'
import { bestCurrentVdot } from './domain/projection'
import { computeStatus } from './domain/status'
import type { Checkin, Plan, Profile, Session, SleepRecord } from './domain/types'
import { vdotFromPerformance } from './domain/vdot'

const EMPTY_SESSIONS: Session[] = []
const EMPTY_SLEEPS: SleepRecord[] = []
const EMPTY_CHECKINS: Checkin[] = []
const EMPTY_PLANS: Plan[] = []

function vdotNow(sessions: Session[], profile: Profile, today: string): number {
  const tests = sessions
    .filter((s) => s.isTest && (s.testDistanceM ?? s.distanceM ?? 0) >= 1500)
    .map((s) => {
      const distanceM = s.testDistanceM ?? s.distanceM ?? 0
      const timeSec = s.durationSec ?? 0
      return {
        date: s.date,
        distanceM,
        timeSec,
        vdot: timeSec > 0 ? vdotFromPerformance(distanceM, timeSec) : 0,
      }
    })
    .filter((t) => t.vdot > 0)
  const manual = profile.manualVdot
  const safeManual =
    manual != null && Number.isFinite(manual) && manual > 0 ? manual : undefined
  const seedVdot =
    Number.isFinite(profile.seedVdot) && profile.seedVdot > 0 ? profile.seedVdot : 50
  return bestCurrentVdot(tests, today)?.vdot ?? safeManual ?? seedVdot
}

export default function App() {
  const [seeded, setSeeded] = useState(false)
  const [today, setToday] = useState(todayIso())
  const [minuteTick, setMinuteTick] = useState(0)
  const [tab, setTab] = useState<TabKey | 'settings'>('today')
  const [localOnboarded, setLocalOnboarded] = useState(false)
  const [logPrefill, setLogPrefill] = useState<Partial<Session> | null>(null)
  const [logKey, setLogKey] = useState(0)
  const ensuredRef = useRef('')
  const autoNextRef = useRef('')

  const profile = useLiveQuery(() => db.profile.get('me'), [])
  const sessions = useLiveQuery(() => db.sessions.toArray(), []) ?? EMPTY_SESSIONS
  const sleeps = useLiveQuery(() => db.sleep.toArray(), []) ?? EMPTY_SLEEPS
  const checkins = useLiveQuery(() => db.checkins.toArray(), []) ?? EMPTY_CHECKINS
  const plans = useLiveQuery(() => db.plans.toArray(), []) ?? EMPTY_PLANS
  const onboardedMeta = useLiveQuery(() => db.meta.get('onboarded'), [])

  useEffect(() => {
    let cancelled = false
    ensureSeed()
      .catch((err) => console.error('seed failed', err))
      .finally(() => {
        if (!cancelled) setSeeded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      setToday(todayIso())
      setMinuteTick((t) => t + 1)
    }, 60_000)
    return () => window.clearInterval(id)
  }, [])

  const onboarded = localOnboarded || onboardedMeta?.value === '1'
  const activePlan = plans.find((p) => p.status === 'active') ?? null

  useEffect(() => {
    setupSyncListeners()
  }, [])

  useEffect(() => {
    if (seeded && onboarded) void initSync()
  }, [seeded, onboarded])

  useEffect(() => {
    if (!seeded || !profile || !onboarded) return
    if (today < profile.startDate) return
    const weekStart = mondayOf(today)
    if (ensuredRef.current === weekStart) return
    ensuredRef.current = weekStart
    const existing = plans.find((p) => p.weekStart === weekStart)
    if (existing) {
      void activateCurrentWeekPlan(today)
      return
    }
    const weekIndex = getWeekIndex(profile.startDate, today)
    void ensurePlanForWeek(
      weekIndex,
      weekStart,
      vdotNow(sessions, profile, today),
      profile,
      undefined,
      true,
    )
  }, [seeded, profile, onboarded, today, plans, sessions])

  // Sunday evening: prepare next week automatically, but leave it archived
  // until its Monday arrives.
  useEffect(() => {
    if (!seeded || !profile || !onboarded) return
    if (weekdayIndex(today) !== 7) return
    if (new Date().getHours() < 18) return
    const active = plans.find((p) => p.status === 'active')
    if (!active || active.weekIndex >= 26) return
    const nextStart = addDaysIso(active.weekStart, 7)
    if (plans.some((p) => p.weekStart === nextStart)) return
    const key = `auto-${nextStart}`
    if (autoNextRef.current === key) return
    autoNextRef.current = key
    const snapshot = computeStatus({
      sessions,
      sleeps,
      checkins,
      profile,
      activePlan: active,
      today,
    })
    const adjustment = adjustNextWeek({
      completionRate: snapshot.compliance?.rate ?? 0.8,
      qualityCompletionRate: snapshot.compliance?.qualityRate ?? 0.8,
      greenDays: snapshot.readiness.level === 'green' ? 5 : snapshot.readiness.level === 'yellow' ? 3 : 1,
      redDays: snapshot.readiness.level === 'red' ? 2 : 0,
      acwr: snapshot.load.acwr,
      sleepDebtMin: snapshot.sleep.debtMin,
      painScore: checkins.find((c) => c.date === today)?.painScore ?? null,
      previousTargetKm: active.targetKm,
      baseTargetKm: weeklyTargetKm(active.weekIndex + 1),
      checkpointVerdict: latestCheckpointVerdict(
        snapshot.tests,
        snapshot.currentWeekIndex,
      ),
    })
    void ensurePlanForWeek(
      active.weekIndex + 1,
      nextStart,
      snapshot.currentVdot,
      profile,
      `自动生成：${adjustment.rationale}`,
      false,
    )
  }, [seeded, profile, onboarded, today, plans, sessions, sleeps, checkins, minuteTick])

  if (!seeded || !profile) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-center">
          <div className="text-xs font-semibold tracking-[0.4em] text-accent">SUB17</div>
          <div className="mt-2 text-sm text-muted">正在准备本地数据…</div>
        </div>
      </div>
    )
  }

  if (!onboarded) {
    return (
      <Onboarding
        profile={profile}
        sessions={sessions}
        onDone={() => {
          setLocalOnboarded(true)
          setTab('today')
        }}
      />
    )
  }

  const status = computeStatus({
    sessions,
    sleeps,
    checkins,
    profile,
    activePlan,
    today,
  })
  const plannedToday = activePlan?.plannedSessions.find((s) => s.date === today) ?? null
  const todaySleep = sleeps.find((s) => s.date === today)
  const todayCheckin = checkins.find((c) => c.date === today)

  const openLog = (prefill?: Partial<Session>) => {
    setLogPrefill(prefill ?? null)
    setLogKey((k) => k + 1)
    setTab('log')
  }

  const page = (() => {
    switch (tab) {
      case 'today':
        return (
          <Today
            profile={profile}
            status={status}
            today={today}
            activePlan={activePlan}
            planned={plannedToday}
            sessions={sessions}
            sleep={todaySleep}
            checkin={todayCheckin}
            onLog={openLog}
            onSleep={() => setTab('sleep')}
            onPlan={() => setTab('plan')}
            onStatus={() => setTab('status')}
          />
        )
      case 'log':
        return (
          <Log
            key={logKey}
            prefill={logPrefill}
            today={today}
            sessions={sessions}
            onSaved={() => {
              setLogPrefill(null)
              setTab('today')
            }}
          />
        )
      case 'plan':
        return (
          <PlanPage
            profile={profile}
            plans={plans}
            activePlan={activePlan}
            status={status}
            sessions={sessions}
            checkins={checkins}
            today={today}
          />
        )
      case 'status':
        return <StatusPage status={status} profile={profile} activePlan={activePlan} />
      case 'sleep':
        return (
          <SleepPage
            sleeps={sleeps}
            profile={profile}
            today={today}
            onSaved={() => setTab('today')}
          />
        )
      case 'settings':
        return (
          <SettingsPage
            profile={profile}
            sessions={sessions}
            sleeps={sleeps}
            onProfileSaved={() => undefined}
          />
        )
      default:
        return null
    }
  })()

  return (
    <div className="min-h-dvh">
      <main
        className="mx-auto max-w-md px-4 pb-24"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      >
        {tab !== 'settings' ? (
          <div className="mb-1 flex justify-end">
            <button
              onClick={() => setTab('settings')}
              className="rounded-full border border-line bg-surface/70 p-2 text-muted transition hover:text-slate-100"
              aria-label="设置"
            >
              <SettingsIcon size={18} />
            </button>
          </div>
        ) : null}
        {page}
      </main>
      <BottomNav
        active={tab}
        onChange={(next) => {
          setLogPrefill(null)
          setTab(next)
        }}
      />
    </div>
  )
}
