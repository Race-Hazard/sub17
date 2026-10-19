import { describe, expect, it } from 'vitest'
import { computeStatus } from './status'
import type { Profile, Session } from './types'

const profile: Profile = {
  id: 'me',
  goalTimeSec: 17 * 60,
  goalDate: '2027-04-18',
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
  createdDate: '2026-10-17',
  createdAt: '2026-10-17T00:00:00.000Z',
  updatedAt: '2026-10-17T00:00:00.000Z',
}

const testSession: Session = {
  id: 'tt',
  date: '2026-10-20',
  type: 'time_trial',
  distanceM: 5000,
  durationSec: 19 * 60 + 30,
  isTest: true,
  testDistanceM: 5000,
  rpe: 9,
  source: 'manual',
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z',
}

describe('training status', () => {
  it('updates the 5k equivalent after a valid time trial', () => {
    const status = computeStatus({
      sessions: [testSession],
      sleeps: [],
      checkins: [],
      profile,
      activePlan: null,
      today: '2026-10-20',
    })
    expect(status.currentVdot).toBeGreaterThan(50)
    expect(status.current5kSec).toBeGreaterThan(19 * 60)
    expect(status.current5kSec).toBeLessThan(20 * 60)
    expect(status.tests).toHaveLength(1)
  })

  it('falls back to the seed VDOT when there is no valid test', () => {
    const interval: Session = {
      ...testSession,
      id: 'interval',
      type: 'interval',
      isTest: false,
      testDistanceM: undefined,
    }
    const status = computeStatus({
      sessions: [interval],
      sleeps: [],
      checkins: [],
      profile,
      activePlan: null,
      today: '2026-10-20',
    })
    expect(status.currentVdot).toBe(50)
    expect(status.tests).toHaveLength(0)
  })
})
