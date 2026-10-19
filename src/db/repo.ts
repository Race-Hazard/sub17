import { addDaysIso, mondayOf, nowIso, uid } from '../domain/format'
import { generatePlanWeek } from '../domain/plan'
import type {
  Checkin,
  IsoDate,
  MetaRow,
  Plan,
  Profile,
  Session,
  SleepRecord,
  Tombstone,
} from '../domain/types'
import { db } from './schema'
import { markDirty } from '../sync/engine'

export async function getProfile(): Promise<Profile | undefined> {
  return db.profile.get('me')
}

export async function saveProfile(profile: Profile): Promise<void> {
  await db.profile.put({ ...profile, updatedAt: nowIso() })
  markDirty()
}

export async function listSessions(): Promise<Session[]> {
  return db.sessions.orderBy('date').toArray()
}

export async function sessionsBetween(from: IsoDate, to: IsoDate): Promise<Session[]> {
  return db.sessions.where('date').between(from, to, true, true).toArray()
}

export async function sessionsForDate(date: IsoDate): Promise<Session[]> {
  return db.sessions.where('date').equals(date).toArray()
}

export async function saveSession(session: Session): Promise<string> {
  const id = session.id || uid()
  await db.transaction('rw', [db.sessions, db.tombstones], async () => {
    await db.tombstones.delete(id)
    await db.sessions.put({ ...session, id, updatedAt: nowIso() })
  })
  markDirty()
  return id
}

export async function deleteSession(id: string): Promise<void> {
  const existing = await db.sessions.get(id)
  if (!existing) return
  await db.transaction('rw', [db.sessions, db.tombstones], async () => {
    await db.tombstones.put({ key: id, kind: 'session', at: nowIso() })
    await db.sessions.delete(id)
  })
  await db.meta.put({ key: 'lastReplanAt', value: '' })
  markDirty()
}

export async function getCheckin(date: IsoDate): Promise<Checkin | undefined> {
  return db.checkins.get(date)
}

export async function saveCheckin(checkin: Checkin): Promise<void> {
  await db.transaction('rw', [db.checkins, db.tombstones], async () => {
    await db.tombstones.delete(`checkin:${checkin.date}`)
    await db.checkins.put({ ...checkin, updatedAt: nowIso() })
  })
  markDirty()
}

export async function deleteCheckin(date: IsoDate): Promise<void> {
  await db.transaction('rw', [db.checkins, db.tombstones], async () => {
    await db.tombstones.put({
      key: `checkin:${date}`,
      kind: 'checkin',
      at: nowIso(),
    })
    await db.checkins.delete(date)
  })
  await db.meta.put({ key: 'lastReplanAt', value: '' })
  markDirty()
}

export async function listCheckins(): Promise<Checkin[]> {
  return db.checkins.orderBy('date').toArray()
}

export async function listTombstones(): Promise<Tombstone[]> {
  return db.tombstones.toArray()
}

export async function getSleep(date: IsoDate): Promise<SleepRecord | undefined> {
  return db.sleep.get(date)
}

export async function saveSleep(record: SleepRecord): Promise<void> {
  await db.transaction('rw', [db.sleep, db.tombstones], async () => {
    await db.tombstones.delete(`sleep:${record.date}`)
    await db.sleep.put({ ...record, updatedAt: nowIso() })
  })
  markDirty()
}

export async function listSleep(): Promise<SleepRecord[]> {
  return db.sleep.orderBy('date').toArray()
}

export async function deleteSleep(date: IsoDate): Promise<void> {
  await db.transaction('rw', [db.sleep, db.tombstones], async () => {
    await db.tombstones.put({
      key: `sleep:${date}`,
      kind: 'sleep',
      at: nowIso(),
    })
    await db.sleep.delete(date)
  })
  markDirty()
}

export async function sleepBetween(from: IsoDate, to: IsoDate): Promise<SleepRecord[]> {
  return db.sleep.where('date').between(from, to, true, true).toArray()
}

export async function listPlans(): Promise<Plan[]> {
  return db.plans.orderBy('weekStart').toArray()
}

export async function getActivePlan(): Promise<Plan | undefined> {
  return db.plans.where('status').equals('active').first()
}

export async function getPlanForWeek(weekStart: IsoDate): Promise<Plan | undefined> {
  return db.plans.where('weekStart').equals(weekStart).first()
}

export async function savePlan(plan: Plan): Promise<void> {
  await db.plans.put(plan)
  markDirty()
}

export async function activatePlan(plan: Plan): Promise<void> {
  await db.transaction('rw', db.plans, async () => {
    const active = await db.plans.where('status').equals('active').toArray()
    for (const p of active) {
      if (p.id !== plan.id) await db.plans.put({ ...p, status: 'superseded' })
    }
    await db.plans.put({ ...plan, status: 'active' })
  })
  markDirty()
}

export async function ensurePlanForWeek(
  weekIndex: number,
  weekStart: IsoDate,
  vdot: number,
  profile: Profile,
  rationale?: string,
  activate = false,
): Promise<Plan> {
  const existing = await getPlanForWeek(weekStart)
  if (existing) {
    if (activate) await activatePlan(existing)
    return existing
  }
  const plan = generatePlanWeek({ weekIndex, weekStart, vdot, profile, rationale })
  try {
    if (activate) {
      await activatePlan(plan)
    } else {
      // Future weeks stay in the archive until their Monday arrives.
      await savePlan({ ...plan, status: 'superseded' })
    }
    return plan
  } catch (error) {
    // Another tab may have created the same unique weekStart first.
    const raced = await getPlanForWeek(weekStart)
    if (raced) {
      if (activate) await activatePlan(raced)
      return raced
    }
    throw error
  }
}

/** Manually rebuild the current week with the latest schedule/volume settings. */
export async function regeneratePlanWeek(
  plan: Plan,
  vdot: number,
  profile: Profile,
): Promise<Plan> {
  const next = generatePlanWeek({
    weekIndex: plan.weekIndex,
    weekStart: plan.weekStart,
    vdot,
    profile,
    version: plan.version + 1,
    rationale: '按最新训练设置重新生成本周课表。',
  })
  const updated: Plan = {
    ...plan,
    version: plan.version + 1,
    phase: next.phase,
    targetKm: next.targetKm,
    rationale: next.rationale,
    plannedSessions: next.plannedSessions,
    adjustments: [],
    createdAt: nowIso(),
    status: 'active',
  }
  await db.plans.put(updated)
  markDirty()
  return updated
}

/** Call on app start: make the plan for the current Monday active. */
export async function activateCurrentWeekPlan(today: IsoDate): Promise<Plan | undefined> {
  const weekStart = mondayOf(today)
  const plan = await getPlanForWeek(weekStart)
  if (plan) {
    await activatePlan(plan)
    return plan
  }
  return undefined
}

export async function getMeta(key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value })
}

export async function getAllMeta(): Promise<MetaRow[]> {
  return db.meta.toArray()
}

/** Clear training data and plans, but keep profile/settings and the seed marker. */
export async function clearTrainingData(): Promise<void> {
  const at = nowIso()
  const [sessions, sleeps, checkins] = await Promise.all([
    db.sessions.toArray(),
    db.sleep.toArray(),
    db.checkins.toArray(),
  ])
  await db.transaction(
    'rw',
    [db.sessions, db.checkins, db.sleep, db.plans, db.tombstones, db.meta],
    async () => {
      // Tombstones let an enabled cloud sync delete these records as well.
      await db.tombstones.bulkPut([
        ...sessions.map((s) => ({ key: s.id, kind: 'session' as const, at })),
        ...sleeps.map((s) => ({ key: `sleep:${s.date}`, kind: 'sleep' as const, at })),
        ...checkins.map((c) => ({
          key: `checkin:${c.date}`,
          kind: 'checkin' as const,
          at,
        })),
      ])
      await Promise.all([
        db.sessions.clear(),
        db.checkins.clear(),
        db.sleep.clear(),
        db.plans.clear(),
      ])
      await db.meta.put({ key: 'lastClearedAt', value: at })
    },
  )
  markDirty()
}

export async function recentSessions(days: number, today: IsoDate): Promise<Session[]> {
  return sessionsBetween(addDaysIso(today, -(days - 1)), today)
}
