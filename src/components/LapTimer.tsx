import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, Square, TimerReset, Undo2 } from 'lucide-react'
import {
  createTimer,
  elapsedMs,
  formatTimer,
  formatTimerTenths,
  reducer,
  totalDistanceM,
  type Lap,
  type LapTimerState,
} from '../domain/lapTimer'
import { Button, Card, Pill } from './ui'

export interface LapTimerResult {
  mode: 'tt' | 'free'
  durationSec: number
  distanceM: number
  laps: Lap[]
}

const STORAGE_KEY = 'sub17.timer.v1'

interface Snapshot {
  state: LapTimerState
  elapsedAtSaveMs: number
}

function saveSnapshot(state: LapTimerState, now: number) {
  try {
    const snapshot: Snapshot = { state, elapsedAtSaveMs: elapsedMs(state, now) }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Storage can be unavailable in private mode; the timer still works.
  }
}

function loadSnapshot(now: number): LapTimerState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const snapshot = JSON.parse(raw) as Snapshot
    if (snapshot.state.status !== 'running' && snapshot.state.status !== 'paused') return null
    const elapsed = snapshot.elapsedAtSaveMs
    const lastCumulative = snapshot.state.laps.at(-1)?.cumulativeMs ?? 0
    const startedAt = now - elapsed
    return {
      ...snapshot.state,
      status: 'paused',
      startedAt,
      pausedAt: now,
      pausedTotalMs: 0,
      lastLapAt: startedAt + lastCumulative,
      finishedAt: null,
    }
  } catch {
    return null
  }
}

export function LapTimer({ onSave }: { onSave: (result: LapTimerResult) => void }) {
  const [initial] = useState<LapTimerState>(() => loadSnapshot(performance.now()) ?? createTimer('tt', 5000))
  const [state, dispatch] = useReducer(reducer, initial)
  const [, setTick] = useState(0)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)
  const now = performance.now()

  useEffect(() => {
    if (state.status !== 'running') return
    const id = window.setInterval(() => setTick((t) => t + 1), 100)
    return () => window.clearInterval(id)
  }, [state.status])

  useEffect(() => {
    saveSnapshot(state, performance.now())
  }, [state])

  useEffect(() => {
    async function acquire() {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
      }
      if (!nav.wakeLock) return
      try {
        wakeLock.current = await nav.wakeLock.request('screen')
      } catch {
        wakeLock.current = null
      }
    }
    if (state.status === 'running') void acquire()
    return () => {
      void wakeLock.current?.release().catch(() => undefined)
      wakeLock.current = null
    }
  }, [state.status])

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && state.status === 'running') {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
        }
        void nav.wakeLock?.request('screen').then((lock) => {
          wakeLock.current = lock
        }).catch(() => undefined)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [state.status])

  const distance = totalDistanceM(state)
  const laps = state.laps.length
  const remaining = state.targetDistanceM - distance
  const finalLapM = useMemo(() => {
    if (state.mode !== 'tt') return 400
    const rem = state.targetDistanceM - state.laps.reduce((sum, l) => sum + (l.distanceM ?? 400), 0)
    return rem > 0 && rem <= 400 ? rem : 400
  }, [state.mode, state.targetDistanceM, state.laps])

  const vibrate = () => {
    if ('vibrate' in navigator) navigator.vibrate?.(20)
  }

  const start = () => {
    const t = performance.now()
    dispatch({ type: 'start', now: t })
    vibrate()
  }
  const lap = () => {
    dispatch({ type: 'lap', now: performance.now() })
    vibrate()
  }
  const pause = () => dispatch({ type: 'pause', now: performance.now() })
  const resume = () => dispatch({ type: 'resume', now: performance.now() })
  const finish = () => {
    dispatch({
      type: 'finish',
      now: performance.now(),
      finalLapDistanceM: state.mode === 'tt' && remaining > 0 ? finalLapM : undefined,
    })
    vibrate()
  }
  const undo = () => dispatch({ type: 'undo' })
  const reset = () => {
    localStorage.removeItem(STORAGE_KEY)
    dispatch({ type: 'reset' })
  }

  const save = () => {
    const totalMs = elapsedMs(state, performance.now())
    onSave({
      mode: state.mode,
      durationSec: Math.round(totalMs / 1000),
      distanceM: Math.round(totalDistanceM(state)),
      laps: state.laps,
    })
    localStorage.removeItem(STORAGE_KEY)
  }

  const displayMs = elapsedMs(state, now)

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">400 m 圈计时</div>
        <Pill tone={state.status === 'running' ? 'good' : state.status === 'paused' ? 'warn' : 'neutral'}>
          {state.status === 'running' ? '计时中' : state.status === 'paused' ? '已暂停' : state.status === 'finished' ? '已完成' : '待开始'}
        </Pill>
      </div>

      {state.status === 'idle' ? (
        <div className="flex gap-2">
          <Button
            variant={state.mode === 'tt' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => dispatch({ type: 'restore', state: createTimer('tt', 5000) })}
            className="flex-1"
          >
            5 km 计时赛
          </Button>
          <Button
            variant={state.mode === 'free' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => {
              const next = createTimer('free', 0)
              dispatch({ type: 'restore', state: next })
            }}
            className="flex-1"
          >
            自由计圈
          </Button>
        </div>
      ) : null}

      <div className="text-center">
        <div className="text-6xl font-bold tracking-tight tabular text-slate-50">
          {formatTimerTenths(displayMs)}
        </div>
        <div className="mt-1 text-xs text-muted">
          {state.mode === 'tt'
            ? `${laps} 圈 · ${(distance / 1000).toFixed(1)} / ${(state.targetDistanceM / 1000).toFixed(1)} km`
            : `${laps} 圈 · ${(distance / 1000).toFixed(1)} km`}
          {state.mode === 'tt' && remaining > 0 && state.status !== 'idle'
            ? ` · 还剩 ${remaining} m`
            : ''}
        </div>
      </div>

      {state.laps.length > 0 ? (
        <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-line/60 bg-ink/40 p-2">
          {state.laps
            .slice()
            .reverse()
            .map((l) => (
              <div key={l.index} className="flex items-center justify-between px-1 text-xs">
                <span className="text-muted">
                  第 {l.index} 圈 {l.distanceM && l.distanceM !== 400 ? `(${l.distanceM} m)` : ''}
                </span>
                <span className="tabular text-slate-200">
                  {formatTimer(l.splitMs)} <span className="text-muted">/ {formatTimer(l.cumulativeMs)}</span>
                </span>
              </div>
            ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {state.status === 'idle' ? (
          <>
            <Button size="lg" onClick={start} className="col-span-2">
              <Play size={20} /> 开始
            </Button>
          </>
        ) : null}

        {state.status === 'running' ? (
          <>
            <Button size="lg" onClick={lap}>
              <TimerReset size={20} /> 计圈
            </Button>
            <Button size="lg" variant="secondary" onClick={pause}>
              <Pause size={20} /> 暂停
            </Button>
            <Button variant="secondary" onClick={finish} className="col-span-2">
              <Square size={18} /> 完成（自动记录最后一圈）
            </Button>
          </>
        ) : null}

        {state.status === 'paused' ? (
          <>
            <Button size="lg" onClick={resume}>
              <Play size={20} /> 继续
            </Button>
            <Button size="lg" variant="secondary" onClick={finish}>
              <Square size={20} /> 完成
            </Button>
          </>
        ) : null}

        {state.status === 'finished' ? (
          <>
            <Button size="lg" onClick={save} className="col-span-2">
              保存为训练记录
            </Button>
            <Button variant="secondary" onClick={reset} className="col-span-2">
              <RotateCcw size={16} /> 清零，开始下一组
            </Button>
          </>
        ) : null}
      </div>

      {state.laps.length > 0 && state.status !== 'finished' ? (
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={undo}>
            <Undo2 size={14} /> 撤销上一圈
          </Button>
          <span className="text-[11px] text-muted">
            {state.mode === 'tt' ? `最后一圈按 ${finalLapM} m 记录` : '自由计圈按 400 m/圈'}
          </span>
        </div>
      ) : null}
    </Card>
  )
}
