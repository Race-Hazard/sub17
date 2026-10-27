import { describe, expect, it } from 'vitest'
import { generatePlanWeek } from './plan'
import { replanRemainingWeek } from './replan'
import { applyTestDayToPlan, applyTestDaysToPlan } from './testDay'
import type { Profile, TestDay } from './types'

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
  createdDate: '2026-10-19',
  createdAt: '2026-10-17T00:00:00.000Z',
  updatedAt: '2026-10-17T00:00:00.000Z',
}

const week1 = generatePlanWeek({
  weekIndex: 1,
  weekStart: '2026-10-19',
  vdot: 50,
  profile,
})

function testDay(
  date: string,
  distanceM = 5000,
  targetTimeSec?: number,
): TestDay {
  return {
    date,
    distanceM,
    targetTimeSec,
    createdAt: '2026-10-18T00:00:00.000Z',
    updatedAt: '2026-10-18T00:00:00.000Z',
  }
}

function sessionOn(plan: ReturnType<typeof applyTestDayToPlan>['plan'], date: string) {
  return plan.plannedSessions.find((session) => session.date === date)
}

describe('manual test days', () => {
  it('replaces the chosen day and protects it with a lock', () => {
    const tuesdayId = sessionOn(week1, '2026-10-20')!.id
    const result = applyTestDayToPlan({
      plan: week1,
      testDay: testDay('2026-10-20', 5000, 19 * 60),
      vdot: 50,
      today: '2026-10-19',
    })
    const target = sessionOn(result.plan, '2026-10-20')
    expect(result.changed).toBe(true)
    expect(target?.type).toBe('time_trial')
    expect(target?.testDistanceM).toBe(5000)
    expect(target?.targetTimeSec).toBe(1140)
    expect(target?.locked).toBe(true)
    // Keep the original planned-session id so logged sessions stay linked.
    expect(target?.id).toBe(tuesdayId)
    // Thursday quality is within 48 h and becomes easy.
    expect(sessionOn(result.plan, '2026-10-22')?.type).toBe('easy')
    // Saturday long is four days out and survives.
    expect(sessionOn(result.plan, '2026-10-24')?.type).toBe('long')
    expect(result.plan.version).toBe(week1.version + 1)
    expect(result.plan.rationale).toContain('临时测试日')
  })

  it('turns a weekend test into the session and shortens the long run', () => {
    const result = applyTestDayToPlan({
      plan: week1,
      testDay: testDay('2026-10-25', 5000),
      vdot: 50,
      today: '2026-10-19',
    })
    expect(sessionOn(result.plan, '2026-10-25')?.type).toBe('time_trial')
    expect(sessionOn(result.plan, '2026-10-25')?.locked).toBe(true)
    const saturday = sessionOn(result.plan, '2026-10-24')
    expect(saturday?.type).toBe('easy')
    expect(saturday?.distanceM).toBe(5000)
    expect(sessionOn(result.plan, '2026-10-22')?.type).toBe('threshold')
  })

  it('does not touch days that already happened', () => {
    const result = applyTestDayToPlan({
      plan: week1,
      testDay: testDay('2026-10-22', 3000),
      vdot: 50,
      today: '2026-10-22',
    })
    expect(sessionOn(result.plan, '2026-10-20')?.type).not.toBe('easy')
    expect(sessionOn(result.plan, '2026-10-22')?.type).toBe('time_trial')
    const saturday = sessionOn(result.plan, '2026-10-24')
    expect(saturday?.type).toBe('easy')
    expect(saturday?.distanceM).toBe(8000)
  })

  it('is idempotent when applied twice', () => {
    const first = applyTestDayToPlan({
      plan: week1,
      testDay: testDay('2026-10-20'),
      vdot: 50,
      today: '2026-10-19',
    })
    const second = applyTestDayToPlan({
      plan: first.plan,
      testDay: testDay('2026-10-20'),
      vdot: 50,
      today: '2026-10-19',
    })
    expect(second.changed).toBe(false)
    expect(second.plan.version).toBe(first.plan.version)
  })

  it('keeps two manually scheduled tests instead of downgrading one', () => {
    const result = applyTestDaysToPlan(
      week1,
      [testDay('2026-10-20'), testDay('2026-10-22')],
      50,
      '2026-10-19',
    )
    expect(sessionOn(result.plan, '2026-10-20')?.type).toBe('time_trial')
    expect(sessionOn(result.plan, '2026-10-22')?.type).toBe('time_trial')
    expect(sessionOn(result.plan, '2026-10-20')?.locked).toBe(true)
    expect(sessionOn(result.plan, '2026-10-22')?.locked).toBe(true)
  })

  it('survives automatic replanning, including a red readiness day', () => {
    const scheduled = applyTestDayToPlan({
      plan: week1,
      testDay: testDay('2026-10-22', 5000, 19 * 60 + 30),
      vdot: 50,
      today: '2026-10-19',
    }).plan
    const replanned = replanRemainingWeek({
      plan: scheduled,
      sessions: [],
      checkins: [],
      today: '2026-10-19',
      vdot: 50,
      readiness: 'red',
    })
    expect(replanned).not.toBeNull()
    const thursday = replanned?.plannedSessions.find(
      (session) => session.date === '2026-10-22',
    )
    expect(thursday?.type).toBe('time_trial')
    expect(thursday?.locked).toBe(true)
    expect(thursday?.targetTimeSec).toBe(1170)
  })
})
