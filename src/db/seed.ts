import { addDaysIso, daysBetween, isoFromDate, nowIso, todayIso, weekdayIndex } from '../domain/format'
import type { Checkin, IsoDate, Profile, Session } from '../domain/types'
import { db } from './schema'

export const SEED_VERSION = '1'

/** The seed week is anchored to the most recent Saturday. */
export function seedEndFor(today: IsoDate): IsoDate {
  const wd = weekdayIndex(today) // 1 = Monday ... 7 = Sunday
  const diff = (wd - 6 + 7) % 7 // Saturday = 6
  return addDaysIso(today, -diff)
}

export function defaultProfile(seedEnd: IsoDate, today: IsoDate = seedEnd): Profile {
  // Start the current week on Mon/Tue; from Wednesday onward wait for the next
  // Monday instead of starting a half-finished week.
  let startDate = addDaysIso(seedEnd, 2)
  if (daysBetween(startDate, today) >= 2) startDate = addDaysIso(startDate, 7)
  const goalDate = addDaysIso(startDate, 26 * 7 - 1)
  const now = nowIso()
  return {
    id: 'me',
    goalTimeSec: 17 * 60,
    goalDate,
    startDate,
    daysPerWeek: 6,
    qualityDays: [2, 4],
    longRunDay: 6,
    restDay: 7,
    sleepTargetMin: 8 * 60,
    reminderTime: '20:30',
    sleepReminderTime: '07:30',
    seedVdot: 50,
    timezone: 'Asia/Shanghai',
    createdDate: today,
    createdAt: now,
    updatedAt: now,
  }
}

export function buildSeedSessions(seedEnd: IsoDate): Session[] {
  const at = (daysAgo: number) => addDaysIso(seedEnd, -daysAgo)
  // Deterministic IDs make seeding idempotent even if two effects race.
  const sid = (key: string) => `seed-${seedEnd}-${key}`
  const base = {
    source: 'seed' as const,
    isSeed: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }

  const sessions: Session[] = [
    {
      ...base,
      id: sid('long'),
      date: at(6),
      type: 'long',
      distanceM: 12000,
      durationSec: 12 * 320,
      rpe: 4,
      notes: '长距离，5:20/km',
    },
    {
      ...base,
      id: sid('rest'),
      date: at(5),
      type: 'rest',
      distanceM: 0,
      durationSec: 0,
      notes: '完全休息',
    },
    {
      ...base,
      id: sid('intervals-current'),
      date: at(4),
      type: 'interval',
      distanceM: 7000,
      durationSec: 2025,
      rpe: 7,
      notes: '1 km 3:25 + 4×400 m @ 80 s；含热身/放松',
      segments: [
        { kind: 'warmup', distanceM: 2000, durationSec: 600 },
        { kind: 'work', distanceM: 1000, durationSec: 205, label: '1 km 3:25' },
        { kind: 'recovery', distanceM: 200, durationSec: 60 },
        { kind: 'work', distanceM: 400, durationSec: 80, label: '400 m 1' },
        { kind: 'recovery', distanceM: 200, durationSec: 90 },
        { kind: 'work', distanceM: 400, durationSec: 80, label: '400 m 2' },
        { kind: 'recovery', distanceM: 200, durationSec: 90 },
        { kind: 'work', distanceM: 400, durationSec: 80, label: '400 m 3' },
        { kind: 'recovery', distanceM: 200, durationSec: 90 },
        { kind: 'work', distanceM: 400, durationSec: 80, label: '400 m 4' },
        { kind: 'cooldown', distanceM: 1600, durationSec: 480 },
      ],
    },
    {
      ...base,
      id: sid('easy-8.8'),
      date: at(3),
      type: 'easy',
      distanceM: 8800,
      durationSec: 2552,
      rpe: 4,
      notes: '4:50/km，偏高强度',
    },
    {
      ...base,
      id: sid('easy-6'),
      date: at(2),
      type: 'easy',
      distanceM: 6000,
      durationSec: 1584,
      rpe: 5,
      notes: '4:24/km，稳态偏快',
    },
    {
      ...base,
      id: sid('threshold-3k'),
      date: at(1),
      type: 'threshold',
      distanceM: 3000,
      durationSec: 668,
      rpe: 8,
      notes: '2 km 3:44 + 1 km 3:40',
      segments: [
        { kind: 'work', distanceM: 2000, durationSec: 448, label: '2 km 3:44' },
        { kind: 'work', distanceM: 1000, durationSec: 220, label: '1 km 3:40' },
      ],
    },
    {
      ...base,
      id: sid('strength'),
      date: at(0),
      type: 'strength',
      distanceM: 0,
      durationSec: 1800,
      rpe: 5,
      notes: '自重/核心 30 min',
      strengthSets: [
        { exercise: '高脚杯深蹲', sets: 3, reps: 8 },
        { exercise: '罗马尼亚硬拉', sets: 3, reps: 8 },
        { exercise: '保加利亚分腿蹲', sets: 2, reps: 10 },
        { exercise: '提踵', sets: 3, reps: 12 },
        { exercise: '平板支撑', sets: 3, reps: 1 },
      ],
    },
  ]

  // Historical references. Only the 2 km is a valid VDOT anchor.
  sessions.push(
    {
      ...base,
      id: sid('test-2k'),
      date: at(28),
      type: 'time_trial',
      distanceM: 2000,
      durationSec: 448,
      rpe: 9,
      isTest: true,
      testDistanceM: 2000,
      notes: '2 km 7:28（推断的计时赛日期）',
      segments: [
        { kind: 'warmup', distanceM: 2000, durationSec: 700 },
        { kind: 'work', distanceM: 2000, durationSec: 448, label: '2 km 7:28' },
      ],
    },
    {
      ...base,
      id: sid('intervals-3x1k'),
      date: at(21),
      type: 'interval',
      distanceM: 6200,
      durationSec: 1900,
      rpe: 8,
      notes: '3×1 km 3:33 / 3:43 / 3:45；仅参考，不计 VDOT',
      segments: [
        { kind: 'warmup', distanceM: 2000, durationSec: 650 },
        { kind: 'work', distanceM: 1000, durationSec: 213 },
        { kind: 'recovery', distanceM: 200, durationSec: 120 },
        { kind: 'work', distanceM: 1000, durationSec: 223 },
        { kind: 'recovery', distanceM: 200, durationSec: 120 },
        { kind: 'work', distanceM: 1000, durationSec: 225 },
        { kind: 'cooldown', distanceM: 1800, durationSec: 540 },
      ],
    },
    {
      ...base,
      id: sid('rep-400'),
      date: at(35),
      type: 'repetition',
      distanceM: 400,
      durationSec: 58,
      rpe: 9,
      isTest: false,
      notes: '400 m 58 s；速度参考，不计 VDOT',
    },
  )

  return sessions
}

export function buildSeedCheckins(seedEnd: IsoDate): Checkin[] {
  const at = (daysAgo: number) => addDaysIso(seedEnd, -daysAgo)
  return [
    {
      date: at(5),
      status: 'rest',
      notes: '种子数据：周一休息',
      updatedAt: nowIso(),
    },
  ]
}

export async function ensureSeed(today = todayIso()): Promise<{ seeded: boolean; profile: Profile }> {
  const existingProfile = await db.profile.get('me')
  const meta = await db.meta.get('seedVersion')
  if (existingProfile) {
    // One-time schedule migration: Sunday rest, Tue/Thu quality, Saturday long.
    if (existingProfile.restDay == null) {
      const migrated: Profile = {
        ...existingProfile,
        qualityDays: [2, 4],
        longRunDay: 6,
        restDay: 7,
        sleepTargetMin: 8 * 60,
        updatedAt: nowIso(),
      }
      await db.profile.put(migrated)
      return { seeded: false, profile: migrated }
    }
    if (meta?.value === SEED_VERSION) {
      return { seeded: false, profile: existingProfile }
    }
  }

  const seedEnd = seedEndFor(today)
  const profile = existingProfile ?? defaultProfile(seedEnd, today)
  const sessions = buildSeedSessions(seedEnd)
  const checkins = buildSeedCheckins(seedEnd)

  await db.transaction('rw', [db.profile, db.sessions, db.checkins, db.meta], async () => {
    await db.profile.put(profile)
    if (!existingProfile) {
      await db.sessions.bulkPut(sessions)
      await db.checkins.bulkPut(checkins)
    }
    await db.meta.put({ key: 'seedVersion', value: SEED_VERSION })
    await db.meta.put({ key: 'schemaVersion', value: String(1) })
    await db.meta.put({ key: 'seededAt', value: isoFromDate(new Date()) })
  })

  return { seeded: !existingProfile, profile }
}
