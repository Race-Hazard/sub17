import { describe, expect, it } from 'vitest'
import { generatePlanWeek, WEEK_BLUEPRINTS, weeklyTargetKm } from './plan'
import type { Profile } from './types'

const profile: Profile = {
  id: 'me',
  goalTimeSec: 17 * 60,
  goalDate: '2027-04-18',
  startDate: '2026-10-19',
  daysPerWeek: 6,
  qualityDays: [2, 5],
  longRunDay: 7,
  sleepTargetMin: 450,
  reminderTime: '20:30',
  sleepReminderTime: '07:30',
  seedVdot: 50,
  timezone: 'Asia/Shanghai',
  createdAt: '2026-10-17T00:00:00.000Z',
  updatedAt: '2026-10-17T00:00:00.000Z',
}

function plannedKm(plan: ReturnType<typeof generatePlanWeek>): number {
  return plan.plannedSessions.reduce((sum, s) => sum + (s.distanceM ?? 0), 0) / 1000
}

describe('26-week plan generation', () => {
  it('has 26 weekly blueprints with valid targets', () => {
    expect(WEEK_BLUEPRINTS).toHaveLength(26)
    expect(WEEK_BLUEPRINTS[0].week).toBe(1)
    expect(WEEK_BLUEPRINTS[25].week).toBe(26)
    expect(weeklyTargetKm(1)).toBe(36)
    expect(weeklyTargetKm(26)).toBe(30)
  })

  it('builds a Monday-rest, Tuesday/Friday-quality, Sunday-long week', () => {
    const plan = generatePlanWeek({
      weekIndex: 1,
      weekStart: '2026-10-19',
      vdot: 50,
      profile,
    })
    expect(plan.plannedSessions).toHaveLength(7)
    expect(plan.plannedSessions[0].type).toBe('rest')
    expect(plan.plannedSessions[1].type).not.toBe('easy')
    expect(plan.plannedSessions[4].type).not.toBe('easy')
    expect(plan.plannedSessions[6].type).toBe('long')
    expect(plannedKm(plan)).toBeGreaterThan(33)
    expect(plannedKm(plan)).toBeLessThan(40)
  })

  it('derives pace from the supplied VDOT, not a hardcoded table', () => {
    const slower = generatePlanWeek({
      weekIndex: 1,
      weekStart: '2026-10-19',
      vdot: 46,
      profile,
    })
    const faster = generatePlanWeek({
      weekIndex: 1,
      weekStart: '2026-10-19',
      vdot: 54,
      profile,
    })
    const slowTuesday = slower.plannedSessions[1].targetPace
    const fastTuesday = faster.plannedSessions[1].targetPace
    expect(slowTuesday).not.toBeNull()
    expect(fastTuesday).not.toBeNull()
    expect(fastTuesday!.fastSecKm).toBeLessThan(slowTuesday!.fastSecKm)
  })

  it('replaces Friday with a time trial on checkpoint weeks', () => {
    const plan = generatePlanWeek({
      weekIndex: 4,
      weekStart: '2026-11-09',
      vdot: 50,
      profile,
    })
    expect(plan.plannedSessions[1].type).toBe('easy')
    expect(plan.plannedSessions[4].type).toBe('time_trial')
    expect(plan.plannedSessions[4].targetTimeSec).toBe(19 * 60 + 30)
  })

  it('puts the final 5k test on Sunday in week 26', () => {
    const plan = generatePlanWeek({
      weekIndex: 26,
      weekStart: '2027-04-12',
      vdot: 57,
      profile,
    })
    expect(plan.plannedSessions[6].type).toBe('time_trial')
    expect(plan.plannedSessions[6].testDistanceM).toBe(5000)
    expect(plan.plannedSessions[0].type).toBe('rest')
  })

  it('keeps every week within a sane distance of its target', () => {
    for (const bp of WEEK_BLUEPRINTS) {
      const plan = generatePlanWeek({
        weekIndex: bp.week,
        weekStart: '2026-10-19',
        vdot: 50,
        profile,
      })
      const km = plannedKm(plan)
      const tolerance = bp.raceWeek ? 5 : 3
      expect(km, `week ${bp.week}`).toBeGreaterThan(bp.targetKm - tolerance)
      expect(km, `week ${bp.week}`).toBeLessThan(bp.targetKm + tolerance)
    }
  })
})
