import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { exportBackup, importBackup, validateBackup } from './backup'
import {
  activateCurrentWeekPlan,
  clearTrainingData,
  ensurePlanForWeek,
  getActivePlan,
  getPlanForWeek,
  getProfile,
  listSessions,
} from './repo'
import { db } from './schema'
import { defaultProfile, ensureSeed, seedEndFor, SEED_VERSION } from './seed'
import { totalKm } from '../domain/load'

const TODAY = '2026-10-17'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterAll(async () => {
  await db.delete()
})

describe('seed and repository', () => {
  it('anchors the seed week to Saturday and starts the plan on Monday', () => {
    expect(seedEndFor('2026-10-17')).toBe('2026-10-17')
    expect(seedEndFor('2026-10-18')).toBe('2026-10-17')
    expect(seedEndFor('2026-10-21')).toBe('2026-10-17')
    const profile = defaultProfile('2026-10-17')
    expect(profile.startDate).toBe('2026-10-19')
    expect(profile.goalDate).toBe('2027-04-18')
    expect(profile.qualityDays).toEqual([2, 4])
    expect(profile.longRunDay).toBe(6)
    expect(profile.restDay).toBe(7)
    // Monday/Tuesday onboarding joins the current week; Wednesday waits.
    expect(defaultProfile('2026-10-17', '2026-10-20').startDate).toBe('2026-10-19')
    expect(defaultProfile('2026-10-17', '2026-10-21').startDate).toBe('2026-10-26')
  })

  it('seeds a 35-40 km week and is idempotent', async () => {
    const first = await ensureSeed(TODAY)
    expect(first.seeded).toBe(true)
    const sessions = await listSessions()
    expect(sessions).toHaveLength(10)
    const weekKm = totalKm(sessions, '2026-10-11', '2026-10-17')
    expect(weekKm).toBeGreaterThan(34)
    expect(weekKm).toBeLessThan(41)

    const second = await ensureSeed(TODAY)
    expect(second.seeded).toBe(false)
    expect(await listSessions()).toHaveLength(10)
    expect((await db.meta.get('seedVersion'))?.value).toBe(SEED_VERSION)
  })

  it('stays idempotent when two effects race', async () => {
    await Promise.all([ensureSeed(TODAY), ensureSeed(TODAY)])
    const sessions = await listSessions()
    expect(sessions).toHaveLength(10)
    expect(new Set(sessions.map((s) => s.id)).size).toBe(10)
  })

  it('creates future plans in the archive and activates the current week', async () => {
    const { profile } = await ensureSeed(TODAY)
    const week1 = await ensurePlanForWeek(1, '2026-10-19', 50, profile)
    expect((await getActivePlan())?.id).toBeUndefined()
    expect((await getPlanForWeek('2026-10-19'))?.status).toBe('superseded')

    const activated = await activateCurrentWeekPlan('2026-10-19')
    expect(activated?.id).toBe(week1.id)
    expect((await getActivePlan())?.status).toBe('active')
  })

  it('round-trips a backup with full replacement', async () => {
    await ensureSeed(TODAY)
    const payload = await exportBackup()
    expect(payload.counts.sessions).toBe(10)
    expect(validateBackup(payload).ok).toBe(true)

    await db.sessions.clear()
    expect(await listSessions()).toHaveLength(0)
    await importBackup(payload)
    expect(await listSessions()).toHaveLength(10)
  })

  it('clears training data without deleting the profile or reseeding', async () => {
    await ensureSeed(TODAY)
    await clearTrainingData()
    expect(await listSessions()).toHaveLength(0)
    expect(await getProfile()).toBeDefined()
    await ensureSeed(TODAY)
    expect(await listSessions()).toHaveLength(0)
  })

  it('rejects a foreign or future backup', () => {
    expect(validateBackup({ app: 'other' }).ok).toBe(false)
    expect(
      validateBackup({
        app: 'sub17',
        schemaVersion: 99,
        profile: [],
        sessions: [],
        checkins: [],
        sleep: [],
        plans: [],
        meta: [],
      }).ok,
    ).toBe(false)
  })
})
