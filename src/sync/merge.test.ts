import { describe, expect, it } from 'vitest'
import { mergeSyncData, emptySyncData } from './merge'
import type { Plan, Profile, Session } from '../domain/types'

const profile = (updatedAt: string, goalTimeSec = 1020): Profile => ({
  id: 'me',
  goalTimeSec,
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
  createdDate: '2026-10-17',
  createdAt: '2026-10-17T00:00:00.000Z',
  updatedAt,
})

const session = (id: string, updatedAt: string, distanceM = 5000): Session => ({
  id,
  date: '2026-10-20',
  type: 'easy',
  distanceM,
  durationSec: 1800,
  rpe: 4,
  source: 'manual',
  createdAt: updatedAt,
  updatedAt,
})

const plan = (weekStart: string, status: Plan['status'], createdAt: string): Plan => ({
  id: `plan-${weekStart}-${status}`,
  version: 1,
  weekStart,
  weekIndex: 1,
  phase: 1,
  targetKm: 36,
  rationale: '',
  status,
  plannedSessions: [],
  adjustments: [],
  createdAt,
})

describe('sync merge', () => {
  it('keeps both sides and prefers the newer edit', () => {
    const local = {
      ...emptySyncData(),
      sessions: [session('a', '2026-10-20T10:00:00.000Z', 5000), session('b', '2026-10-20T10:00:00.000Z')],
    }
    const remote = {
      ...emptySyncData(),
      sessions: [session('a', '2026-10-20T11:00:00.000Z', 6000), session('c', '2026-10-20T10:00:00.000Z')],
    }
    const merged = mergeSyncData(local, remote)
    expect(merged.sessions).toHaveLength(3)
    expect(merged.sessions.find((s) => s.id === 'a')?.distanceM).toBe(6000)
  })

  it('propagates deletions but keeps a newer restore', () => {
    const local = {
      ...emptySyncData(),
      sessions: [session('a', '2026-10-20T10:00:00.000Z')],
      tombstones: [{ key: 'a', kind: 'session' as const, at: '2026-10-20T11:00:00.000Z' }],
    }
    const remote = {
      ...emptySyncData(),
      sessions: [session('a', '2026-10-20T10:00:00.000Z')],
    }
    expect(mergeSyncData(local, remote).sessions).toHaveLength(0)

    const restored = { ...remote, sessions: [session('a', '2026-10-20T12:00:00.000Z')] }
    expect(mergeSyncData(local, restored).sessions).toHaveLength(1)
  })

  it('prefers the newer profile and the active plan for a duplicate week', () => {
    const local = {
      ...emptySyncData(),
      profile: [profile('2026-10-20T10:00:00.000Z', 1020)],
      plans: [plan('2026-10-19', 'active', '2026-10-19T10:00:00.000Z')],
    }
    const remote = {
      ...emptySyncData(),
      profile: [profile('2026-10-20T11:00:00.000Z', 1080)],
      plans: [plan('2026-10-19', 'superseded', '2026-10-19T11:00:00.000Z')],
    }
    const merged = mergeSyncData(local, remote)
    expect(merged.profile[0].goalTimeSec).toBe(1080)
    expect(merged.plans).toHaveLength(1)
    expect(merged.plans[0].status).toBe('active')
  })

  it('merges manual test days and propagates their deletion', () => {
    const local = {
      ...emptySyncData(),
      testDays: [
        {
          date: '2026-10-24',
          distanceM: 5000,
          createdAt: '2026-10-18T10:00:00.000Z',
          updatedAt: '2026-10-18T10:00:00.000Z',
        },
      ],
    }
    const remote = {
      ...emptySyncData(),
      testDays: [
        {
          date: '2026-10-24',
          distanceM: 10000,
          createdAt: '2026-10-18T10:00:00.000Z',
          updatedAt: '2026-10-18T11:00:00.000Z',
        },
      ],
    }
    const merged = mergeSyncData(local, remote)
    expect(merged.testDays).toHaveLength(1)
    expect(merged.testDays[0].distanceM).toBe(10000)

    const deleted = {
      ...local,
      tombstones: [
        {
          key: 'testDay:2026-10-24',
          kind: 'testDay' as const,
          at: '2026-10-18T12:00:00.000Z',
        },
      ],
    }
    expect(mergeSyncData(deleted, remote).testDays).toHaveLength(0)
  })

  it('tolerates older cloud files without testDays', () => {
    const local = { ...emptySyncData() }
    const legacyRemote = { ...emptySyncData() } as Record<string, unknown>
    delete legacyRemote.testDays
    const merged = mergeSyncData(local, legacyRemote as never)
    expect(merged.testDays).toEqual([])
  })

  it('merges onboarding and sync metadata sensibly', () => {
    const local = {
      ...emptySyncData(),
      meta: [
        { key: 'onboarded', value: '0' },
        { key: 'lastSyncAt', value: '2026-10-20T10:00:00.000Z' },
      ],
    }
    const remote = {
      ...emptySyncData(),
      meta: [
        { key: 'onboarded', value: '1' },
        { key: 'lastSyncAt', value: '2026-10-20T11:00:00.000Z' },
      ],
    }
    const merged = mergeSyncData(local, remote)
    expect(merged.meta.find((m) => m.key === 'onboarded')?.value).toBe('1')
    expect(merged.meta.find((m) => m.key === 'lastSyncAt')?.value).toBe(
      '2026-10-20T11:00:00.000Z',
    )
  })
})
