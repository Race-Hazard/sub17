import { describe, expect, it } from 'vitest'
import { createTimer, elapsedMs, reducer, totalDistanceM } from './lapTimer'

describe('lap timer reducer', () => {
  it('records splits and excludes paused time', () => {
    let state = createTimer('tt', 5000)
    state = reducer(state, { type: 'start', now: 0 })
    state = reducer(state, { type: 'lap', now: 90_000 })
    state = reducer(state, { type: 'lap', now: 180_000 })
    state = reducer(state, { type: 'pause', now: 200_000 })
    state = reducer(state, { type: 'resume', now: 230_000 })
    state = reducer(state, { type: 'finish', now: 260_000 })

    expect(state.laps.map((l) => l.splitMs)).toEqual([90_000, 90_000])
    expect(elapsedMs(state, 300_000)).toBe(230_000)
  })

  it('undoes the last lap and restarts the split from the previous lap', () => {
    let state = createTimer()
    state = reducer(state, { type: 'start', now: 0 })
    state = reducer(state, { type: 'lap', now: 90_000 })
    state = reducer(state, { type: 'lap', now: 190_000 })
    state = reducer(state, { type: 'undo' })
    expect(state.laps).toHaveLength(1)
    state = reducer(state, { type: 'lap', now: 200_000 })
    expect(state.laps[1].splitMs).toBe(110_000)
  })

  it('supports 12 full laps plus a final 200 m', () => {
    let state = createTimer('tt', 5000)
    state = reducer(state, { type: 'start', now: 0 })
    for (let i = 1; i <= 12; i += 1) {
      state = reducer(state, { type: 'lap', now: i * 90_000 })
    }
    state = reducer(state, { type: 'lap', now: 12 * 90_000 + 45_000, distanceM: 200 })
    expect(state.laps).toHaveLength(13)
    expect(totalDistanceM(state)).toBe(5000)
  })

  it('excludes a pause from the current lap split', () => {
    let state = createTimer()
    state = reducer(state, { type: 'start', now: 0 })
    state = reducer(state, { type: 'lap', now: 90_000 })
    state = reducer(state, { type: 'pause', now: 100_000 })
    state = reducer(state, { type: 'resume', now: 130_000 })
    state = reducer(state, { type: 'lap', now: 200_000 })
    // 200 s wall clock minus 30 s paused = 170 s elapsed; 170 - 90 = 80 s.
    expect(state.laps[1].splitMs).toBe(80_000)
    expect(state.laps[1].cumulativeMs).toBe(170_000)
  })

  it('ignores laps while paused', () => {
    let state = createTimer()
    state = reducer(state, { type: 'start', now: 0 })
    state = reducer(state, { type: 'pause', now: 30_000 })
    const before = state
    state = reducer(state, { type: 'lap', now: 40_000 })
    expect(state).toBe(before)
  })
})
