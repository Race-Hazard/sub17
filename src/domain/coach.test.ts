import { describe, expect, it } from 'vitest'
import { adjustNextWeek, checkpointVerdict, complianceForPlan } from './coach'
import { generatePlanWeek } from './plan'
import type { Checkin, Profile, Session } from './types'

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
  createdAt: '2026-10-17T00:00:00.000Z',
  updatedAt: '2026-10-17T00:00:00.000Z',
}

const baseFeedback = {
  completionRate: 0.9,
  qualityCompletionRate: 1,
  greenDays: 6,
  redDays: 0,
  acwr: 1,
  sleepDebtMin: 0,
  painScore: 0,
  previousTargetKm: 36,
  baseTargetKm: 38,
}

describe('weekly coaching rules', () => {
  it('progresses when compliance, recovery, and load agree', () => {
    const result = adjustNextWeek(baseFeedback)
    expect(result.level).toBe('progress')
    expect(result.targetKm).toBeGreaterThan(38)
  })

  it('holds when completion drops below 70%', () => {
    const result = adjustNextWeek({ ...baseFeedback, completionRate: 0.5 })
    expect(result.level).toBe('hold')
    expect(result.targetKm).toBeLessThan(36)
  })

  it('cuts volume when ACWR is above 1.5', () => {
    const result = adjustNextWeek({ ...baseFeedback, acwr: 1.8 })
    expect(result.level).toBe('reduce')
    expect(result.targetKm).toBeLessThan(38)
  })

  it('prioritises pain over everything else', () => {
    const result = adjustNextWeek({ ...baseFeedback, painScore: 5, completionRate: 1 })
    expect(result.level).toBe('reduce')
    expect(result.rationale).toContain('疼痛')
  })

  it('holds after a slightly slow checkpoint and cuts after a slow one', () => {
    expect(
      adjustNextWeek({ ...baseFeedback, checkpointVerdict: 'slightlySlow' }).level,
    ).toBe('hold')
    expect(adjustNextWeek({ ...baseFeedback, checkpointVerdict: 'slow' }).level).toBe(
      'reduce',
    )
  })

  it('classifies checkpoint results', () => {
    expect(checkpointVerdict(1140, 1170)).toBe('ahead')
    expect(checkpointVerdict(1170, 1170)).toBe('onTrack')
    expect(checkpointVerdict(1200, 1170)).toBe('slightlySlow')
    expect(checkpointVerdict(1230, 1170)).toBe('slow')
  })
})

describe('compliance', () => {
  it('counts six runs plus one rest day and ignores strength', () => {
    const plan = generatePlanWeek({
      weekIndex: 1,
      weekStart: '2026-10-19',
      vdot: 50,
      profile,
    })
    const sessions: Session[] = []
    const checkins: Checkin[] = []
    for (const planned of plan.plannedSessions) {
      if (planned.type === 'rest') {
        checkins.push({
          date: planned.date,
          status: 'rest',
          updatedAt: '2026-10-19T00:00:00.000Z',
        })
        continue
      }
      sessions.push({
        id: `actual-${planned.id}`,
        date: planned.date,
        type: planned.type,
        distanceM: planned.distanceM,
        durationSec: (planned.durationMin ?? 45) * 60,
        plannedSessionId: planned.id,
        source: 'manual',
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      })
    }
    const result = complianceForPlan(plan, sessions, checkins)
    expect(result.planned).toBe(7)
    expect(result.completed).toBe(7)
    expect(result.rate).toBe(1)
  })
})
