import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { Sub17DB } from './schema'
import type { Session, TestDay } from '../domain/types'

const names: string[] = []

function uniqueName(): string {
  const name = `sub17-migration-${Math.random().toString(36).slice(2)}`
  names.push(name)
  return name
}

afterEach(async () => {
  for (const name of names.splice(0)) {
    await Dexie.delete(name)
  }
})

const session: Session = {
  id: 'legacy-session',
  date: '2026-10-17',
  type: 'easy',
  distanceM: 6000,
  durationSec: 2100,
  rpe: 3,
  source: 'manual',
  createdAt: '2026-10-17T08:00:00.000Z',
  updatedAt: '2026-10-17T08:00:00.000Z',
}

const testDay: TestDay = {
  date: '2026-10-24',
  distanceM: 5000,
  createdAt: '2026-10-18T00:00:00.000Z',
  updatedAt: '2026-10-18T00:00:00.000Z',
}

describe('database migration', () => {
  it('upgrades a v3 database to v4 without losing records', async () => {
    const name = uniqueName()
    const legacy = new Dexie(name)
    legacy.version(3).stores({
      sessions: 'id, date, type, plannedSessionId, isTest',
      checkins: 'date, status',
      sleep: 'date',
      plans: 'id, &weekStart, weekIndex, status',
      profile: 'id',
      meta: 'key',
      tombstones: 'key, kind, at',
      body: 'date, updatedAt',
    })
    await legacy.open()
    await legacy.table('sessions').put(session)
    legacy.close()

    const upgraded = new Sub17DB(name)
    await upgraded.open()
    expect(upgraded.verno).toBe(4)
    expect(await upgraded.sessions.get(session.id)).toMatchObject({
      date: session.date,
      distanceM: session.distanceM,
    })
    await upgraded.testDays.put(testDay)
    expect((await upgraded.testDays.get(testDay.date))?.distanceM).toBe(5000)
    upgraded.close()
  })
})
