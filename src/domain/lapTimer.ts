export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished'
export type TimerMode = 'tt' | 'free'

export interface Lap {
  index: number
  splitMs: number
  cumulativeMs: number
  distanceM?: number
}

export interface LapTimerState {
  status: TimerStatus
  mode: TimerMode
  targetDistanceM: number
  startedAt: number | null
  pausedAt: number | null
  pausedTotalMs: number
  lastLapAt: number | null
  finishedAt: number | null
  laps: Lap[]
}

export type LapTimerAction =
  | { type: 'start'; now: number }
  | { type: 'lap'; now: number; distanceM?: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'undo' }
  | { type: 'finish'; now: number; finalLapDistanceM?: number }
  | { type: 'reset' }
  | { type: 'restore'; state: LapTimerState }

export function createTimer(mode: TimerMode = 'tt', targetDistanceM = 5000): LapTimerState {
  return {
    status: 'idle',
    mode,
    targetDistanceM,
    startedAt: null,
    pausedAt: null,
    pausedTotalMs: 0,
    lastLapAt: null,
    finishedAt: null,
    laps: [],
  }
}

export function elapsedMs(state: LapTimerState, now: number): number {
  if (state.startedAt == null) return 0
  const end =
    state.status === 'running'
      ? now
      : state.status === 'paused'
        ? (state.pausedAt ?? now)
        : (state.finishedAt ?? now)
  return Math.max(0, end - state.startedAt - state.pausedTotalMs)
}

export function lapCount(state: LapTimerState): number {
  return state.laps.length
}

export function totalDistanceM(state: LapTimerState, finalLapDistanceM?: number): number {
  return state.laps.reduce((sum, lap, idx) => {
    const isLast = idx === state.laps.length - 1
    const distance = isLast && finalLapDistanceM != null ? finalLapDistanceM : (lap.distanceM ?? 400)
    return sum + distance
  }, 0)
}

export function reducer(state: LapTimerState, action: LapTimerAction): LapTimerState {
  switch (action.type) {
    case 'start':
      if (state.status !== 'idle') return state
      return {
        ...state,
        status: 'running',
        startedAt: action.now,
        lastLapAt: action.now,
        pausedAt: null,
        pausedTotalMs: 0,
        finishedAt: null,
        laps: [],
      }
    case 'lap': {
      if (state.status !== 'running' || state.lastLapAt == null) return state
      const cumulativeMs = elapsedMs(state, action.now)
      const lastCumulative = state.laps.at(-1)?.cumulativeMs ?? 0
      // Use elapsed time, not wall-clock time, so a pause inside the lap does
      // not inflate the split.
      const splitMs = cumulativeMs - lastCumulative
      if (splitMs <= 0) return state
      return {
        ...state,
        lastLapAt: action.now,
        laps: [
          ...state.laps,
          {
            index: state.laps.length + 1,
            splitMs,
            cumulativeMs,
            distanceM: action.distanceM,
          },
        ],
      }
    }
    case 'pause':
      if (state.status !== 'running') return state
      return { ...state, status: 'paused', pausedAt: action.now }
    case 'resume':
      if (state.status !== 'paused' || state.pausedAt == null) return state
      return {
        ...state,
        status: 'running',
        pausedTotalMs: state.pausedTotalMs + (action.now - state.pausedAt),
        pausedAt: null,
      }
    case 'undo': {
      if (state.laps.length === 0) return state
      const laps = state.laps.slice(0, -1)
      const last = laps[laps.length - 1]
      const lastLapAt =
        last != null && state.startedAt != null
          ? state.startedAt + state.pausedTotalMs + last.cumulativeMs
          : state.startedAt
      return { ...state, laps, lastLapAt }
    }
    case 'finish': {
      if (state.status === 'idle') return state
      const end =
        state.status === 'paused' && state.pausedAt != null ? state.pausedAt : action.now
      let laps = state.laps
      if (
        action.finalLapDistanceM != null &&
        state.startedAt != null &&
        state.lastLapAt != null
      ) {
        const splitMs = elapsedMs(state, end) - (state.laps.at(-1)?.cumulativeMs ?? 0)
        if (splitMs > 500) {
          laps = [
            ...state.laps,
            {
              index: state.laps.length + 1,
              splitMs,
              cumulativeMs: elapsedMs(state, end),
              distanceM: action.finalLapDistanceM,
            },
          ]
        }
      }
      return {
        ...state,
        laps,
        status: 'finished',
        finishedAt: end,
      }
    }
    case 'reset':
      return createTimer(state.mode, state.targetDistanceM)
    case 'restore':
      return action.state
    default:
      return state
  }
}

export function formatTimer(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatTimerTenths(ms: number): string {
  const clamped = Math.max(0, ms)
  const m = Math.floor(clamped / 60000)
  const s = Math.floor((clamped % 60000) / 1000)
  const tenth = Math.floor((clamped % 1000) / 100)
  return `${m}:${s.toString().padStart(2, '0')}.${tenth}`
}
