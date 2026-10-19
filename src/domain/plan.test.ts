import { describe, expect, it } from 'vitest'
import { generatePlanWeek, WEEK_BLUEPRINTS, weeklyTargetKm } from './plan'
import type { Profile } from './types'

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

function plannedKm(plan: ReturnType<typeof generatePlanWeek>): number {
  return plan.plannedSessions.reduce((sum, s) => sum + (s.distanceM ?? 0), 0) / 1000
}

describe('26-week plan generation', () => {
  it('has 26 weekly blueprints with valid targets', () => {
    expect(WEEK_BLUEPRINTS).toHaveLength(26)
    expect(WEEK_BLUEPRINTS[0].week).toBe(1)
    expect(WEEK_BLUEPRINTS[25].week).toBe(26)
    expect(weeklyTargetKm(1)).toBe(40)
    expect(weeklyTargetKm(26)).toBe(36)
  })

  it('builds a Sunday-rest, Tuesday/Thursday-quality, Saturday-long week', () => {
    const plan = generatePlanWeek({
      weekIndex: 1,
      weekStart: '2026-10-19',
      vdot: 50,
      profile,
    })
    expect(plan.plannedSessions).toHaveLength(7)
    expect(plan.plannedSessions[0].type).toBe('easy')
    expect(plan.plannedSessions[1].type).not.toBe('easy')
    expect(plan.plannedSessions[3].type).not.toBe('easy')
    expect(plan.plannedSessions[5].type).toBe('long')
    expect(plan.plannedSessions[6].type).toBe('rest')
    expect(plannedKm(plan)).toBeGreaterThan(37)
    expect(plannedKm(plan)).toBeLessThan(43)
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
    expect(plan.plannedSessions[3].type).toBe('time_trial')
    expect(plan.plannedSessions[3].targetTimeSec).toBe(19 * 60 + 15)
  })

  it('puts the final 5k test on Saturday and rests Sunday in week 26', () => {
    const plan = generatePlanWeek({
      weekIndex: 26,
      weekStart: '2027-04-12',
      vdot: 57,
      profile,
    })
    expect(plan.plannedSessions[5].type).toBe('time_trial')
    expect(plan.plannedSessions[5].testDistanceM).toBe(5000)
    expect(plan.plannedSessions[6].type).toBe('rest')
  })

  it('applies the last quality advice to the next same-kind blueprint', () => {
    const plan = generatePlanWeek({
      weekIndex: 1,
      weekStart: '2026-10-19',
      vdot: 50,
      profile,
      qualityAdvice: {
        I: {
          kind: 'I',
          mode: 'interval',
          repsDelta: 1,
          sourceSessionId: 'last-i',
        },
      },
    })
    const tuesday = plan.plannedSessions.find((s) => s.date === '2026-10-20')
    expect(tuesday?.title).toContain('6 × 600 m')
    expect(tuesday?.workout?.adviceFromSessionId).toBe('last-i')
    const thursday = plan.plannedSessions.find((s) => s.date === '2026-10-22')
    expect(thursday?.title).not.toContain('6 × 600 m')
  })

  it('keeps Sunday rest, Saturday long, and Tue/Thu quality every week', () => {
    for (const bp of WEEK_BLUEPRINTS) {
      const plan = generatePlanWeek({
        weekIndex: bp.week,
        weekStart: '2026-10-19',
        vdot: 50,
        profile,
      })
      const byDate = new Map(plan.plannedSessions.map((s) => [s.date, s]))
      // 2026-10-19 is Monday; Sunday is 2026-10-25, Saturday 2026-10-24.
      expect(byDate.get('2026-10-25')?.type, `week ${bp.week} Sunday`).toBe('rest')
      const saturday = byDate.get('2026-10-24')
      expect(saturday, `week ${bp.week} Saturday`).toBeTruthy()
      expect(
        saturday?.type === 'long' || saturday?.type === 'time_trial',
        `week ${bp.week} Saturday type`,
      ).toBe(true)
      expect(byDate.get('2026-10-20')?.type, `week ${bp.week} Tuesday`).not.toBe('rest')
      expect(byDate.get('2026-10-22')?.type, `week ${bp.week} Thursday`).not.toBe('rest')
      expect(plan.plannedSessions).toHaveLength(7)
      expect(new Set(plan.plannedSessions.map((s) => s.date)).size).toBe(7)
    }
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
