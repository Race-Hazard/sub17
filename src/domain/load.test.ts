import { describe, expect, it } from 'vitest'
import { addDaysIso } from './format'
import { rpeDrift, sessionLoad, summarizeLoad, weeklyKm } from './load'
import type { Session } from './types'

const TODAY = '2026-10-17'

function makeSession(overrides: Partial<Session> & Pick<Session, 'date' | 'type'>): Session {
  return {
    id: `${overrides.date}-${overrides.type}-${Math.random()}`,
    source: 'manual',
    createdAt: '2026-10-17T00:00:00.000Z',
    updatedAt: '2026-10-17T00:00:00.000Z',
    ...overrides,
  }
}

describe('training load', () => {
  it('uses session-RPE and excludes strength/rest', () => {
    expect(
      sessionLoad(makeSession({ date: TODAY, type: 'easy', durationSec: 3600, rpe: 3 })),
    ).toBe(180)
    expect(
      sessionLoad(makeSession({ date: TODAY, type: 'strength', durationSec: 3600, rpe: 8 })),
    ).toBe(0)
    expect(
      sessionLoad(makeSession({ date: TODAY, type: 'rest', durationSec: 0 })),
    ).toBe(0)
  })

  it('reports insufficient data during the first two weeks', () => {
    const sessions = [
      makeSession({ date: TODAY, type: 'easy', durationSec: 3600, rpe: 3 }),
    ]
    const summary = summarizeLoad(sessions, TODAY)
    expect(summary.status).toBe('insufficient')
    expect(summary.acwr).toBeNull()
  })

  it('computes a stable ACWR with four weeks of equal load', () => {
    const sessions: Session[] = []
    for (let i = 0; i < 28; i += 1) {
      sessions.push(
        makeSession({
          date: addDaysIso(TODAY, -i),
          type: 'easy',
          durationSec: 3600,
          rpe: 3,
          distanceM: 10000,
        }),
      )
    }
    const summary = summarizeLoad(sessions, TODAY)
    expect(summary.status).toBe('optimal')
    expect(summary.acwr).toBeCloseTo(1, 1)
    expect(summary.daysOfData).toBe(28)
  })

  it('flags an acute spike', () => {
    const sessions: Session[] = []
    for (let i = 0; i < 21; i += 1) {
      sessions.push(
        makeSession({ date: addDaysIso(TODAY, -i - 7), type: 'easy', durationSec: 3600, rpe: 3 }),
      )
    }
    for (let i = 0; i < 7; i += 1) {
      sessions.push(
        makeSession({ date: addDaysIso(TODAY, -i), type: 'interval', durationSec: 7200, rpe: 6 }),
      )
    }
    const summary = summarizeLoad(sessions, TODAY)
    expect(summary.status).toBe('high')
    expect(summary.acwr).toBeGreaterThan(1.5)
  })

  it('sums weekly kilometres for running sessions only', () => {
    const sessions = [
      makeSession({ date: TODAY, type: 'easy', distanceM: 8000 }),
      makeSession({ date: addDaysIso(TODAY, -1), type: 'long', distanceM: 12000 }),
      makeSession({ date: addDaysIso(TODAY, -2), type: 'strength', distanceM: 0 }),
    ]
    expect(weeklyKm(sessions, addDaysIso(TODAY, -6))).toBe(20)
  })

  it('detects RPE drift at a comparable pace', () => {
    const history: Session[] = []
    for (let i = 1; i <= 4; i += 1) {
      history.push(
        makeSession({
          date: addDaysIso(TODAY, -i * 3),
          type: 'easy',
          distanceM: 8000,
          durationSec: 2400,
          rpe: 3,
        }),
      )
    }
    const current = makeSession({
      date: TODAY,
      type: 'easy',
      distanceM: 8000,
      durationSec: 2400,
      rpe: 5,
    })
    expect(rpeDrift(current, [...history, current], TODAY)).toBe(2)
  })
})
