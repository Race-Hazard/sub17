import { describe, expect, it } from 'vitest'
import { generatePlanWeek } from './plan'
import { replanRemainingWeek } from './replan'
import type { Profile, Session } from './types'

const profile: Profile = {
  id: 'me',
  goalTimeSec: 17 * 60,
  goalDate: '2027-04-19',
  startDate: '2026-10-19',
  daysPerWeek: 6,
  qualityDays: [2, 4],
  longRunDay: 6,
  restDay: 7,
  sleepTargetMin: 480,
  reminderTime: '20:30',
  sleepReminderTime: '07:30',
  seedVdot: 50,
  timezone: 'Asia/Shanghai',
  createdDate: '2026-10-19',
  createdAt: '2026-10-19T00:00:00.000Z',
  updatedAt: '2026-10-19T00:00:00.000Z',
}

const plan = generatePlanWeek({
  weekIndex: 1,
  weekStart: '2026-10-19',
  vdot: 50,
  profile,
})

function run(
  id: string,
  date: string,
  type: Session['type'],
  distanceM: number,
  rpe = 7,
): Session {
  return {
    id,
    date,
    type,
    distanceM,
    durationSec: 2400,
    rpe,
    source: 'manual',
    createdAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
  }
}

function futureSession(
  updated: ReturnType<typeof replanRemainingWeek>,
  date: string,
) {
  return updated?.plannedSessions.find((s) => s.date === date)
}

function replan(today: string, sessions: Session[], readiness: 'green' | 'yellow' | 'red' = 'green') {
  return replanRemainingWeek({
    plan,
    sessions,
    checkins: [],
    today,
    vdot: 50,
    readiness,
  })
}

describe('within-week replanning', () => {
  it('keeps Thursday quality when Tuesday quality was done', () => {
    const updated = replan('2026-10-20', [
      run('q1', '2026-10-20', 'interval', 7000),
    ])
    expect(futureSession(updated, '2026-10-22')?.type).not.toBe('easy')
    expect(futureSession(updated, '2026-10-25')?.type).toBe('rest')
  })

  it('does not add a makeup quality when Tuesday quality was missed', () => {
    const updated = replan('2026-10-20', [
      run('easy', '2026-10-20', 'easy', 6000, 3),
    ])
    const thursday = futureSession(updated, '2026-10-22')
    expect(thursday?.type).not.toBe('easy')
    expect(
      updated?.plannedSessions.filter(
        (s) =>
          s.date > '2026-10-20' &&
          ['interval', 'repetition', 'threshold', 'time_trial'].includes(s.type),
      ),
    ).toHaveLength(1)
  })

  it('downgrades a quality session within 48h of an extra hard day', () => {
    const updated = replan('2026-10-21', [
      run('extra', '2026-10-21', 'interval', 8000),
    ])
    expect(futureSession(updated, '2026-10-22')?.type).toBe('easy')
    expect(futureSession(updated, '2026-10-25')?.type).toBe('rest')
  })

  it('downgrades Tuesday but keeps Thursday when Monday was hard', () => {
    const updated = replan('2026-10-19', [
      run('hard', '2026-10-19', 'threshold', 8000),
    ])
    expect(futureSession(updated, '2026-10-20')?.type).toBe('easy')
    expect(futureSession(updated, '2026-10-22')?.type).not.toBe('easy')
  })

  it('turns Saturday long into a medium-long when a long was done early', () => {
    const updated = replan('2026-10-21', [
      run('long', '2026-10-21', 'long', 18000),
    ])
    const saturday = futureSession(updated, '2026-10-24')
    expect(saturday?.type).toBe('easy')
    expect(saturday?.distanceM).toBeLessThanOrEqual(12000)
  })

  it('downgrades all future quality when readiness is red', () => {
    const updated = replan('2026-10-19', [], 'red')
    expect(futureSession(updated, '2026-10-20')?.type).toBe('easy')
    expect(futureSession(updated, '2026-10-22')?.type).toBe('easy')
  })
})
