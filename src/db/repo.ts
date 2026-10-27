import { addDaysIso, mondayOf, nowIso, todayIso, uid } from '../domain/format'
import { generatePlanWeek, getWeekIndex } from '../domain/plan'
import { applyTestDaysToPlan } from '../domain/testDay'
import type { NextQualityWorkout, QualityKind } from '../domain/quality'
import type {
  BodyMetric,
  Checkin,
  IsoDate,
  MetaRow,
  Plan,
  Profile,
  Session,
  SleepRecord,
  TestDay,
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

export async function listBody(): Promise<BodyMetric[]> {
  return db.body.orderBy('date').toArray()
}

export async function saveBody(metric: BodyMetric): Promise<void> {
  await db.transaction('rw', [db.body, db.tombstones], async () => {
    await db.tombstones.delete(`body:${metric.date}`)
    await db.body.put({ ...metric, updatedAt: nowIso() })
  })
  markDirty()
}

export async function deleteBody(date: IsoDate): Promise<void> {
  await db.transaction('rw', [db.body, db.tombstones], async () => {
    await db.tombstones.put({
      key: `body:${date}`,
      kind: 'body',
      at: nowIso(),
    })
    await db.body.delete(date)
  })
  markDirty()
}

export async function listTestDays(): Promise<TestDay[]> {
  return db.testDays.orderBy('date').toArray()
}

export async function getTestDay(date: IsoDate): Promise<TestDay | undefined> {
  return db.testDays.get(date)
}

export async function saveTestDay(testDay: TestDay): Promise<void> {
  await db.transaction('rw', [db.testDays, db.tombstones], async () => {
    await db.tombstones.delete(`testDay:${testDay.date}`)
    await db.testDays.put({ ...testDay, updatedAt: nowIso() })
  })
  markDirty()
}

export async function deleteTestDay(date: IsoDate): Promise<void> {
  await db.transaction('rw', [db.testDays, db.tombstones], async () => {
    await db.tombstones.put({
      key: `testDay:${date}`,
      kind: 'testDay',
      at: nowIso(),
    })
    await db.testDays.delete(date)
  })
  markDirty()
}

/** Re-apply all stored test days to the plans they can affect. */
export async function applyStoredTestDays(
  vdot: number,
  today: IsoDate,
): Promise<{ updated: number; reasons: string[] }> {
  const testDays = await listTestDays()
  if (testDays.length === 0) return { updated: 0, reasons: [] }
  const plans = await listPlans()
  let updated = 0
  const reasons: string[] = []
  for (const plan of plans) {
    const result = applyTestDaysToPlan(plan, testDays, vdot, today)
    if (!result.changed) continue
    await db.plans.put(result.plan)
    updated += 1
    reasons.push(...result.reasons)
  }
  if (updated > 0) markDirty()
  return { updated, reasons }
}

async function applyStoredTestDaysToPlan(plan: Plan, vdot: number): Promise<Plan> {
  const testDays = await listTestDays()
  if (testDays.length === 0) return plan
  const result = applyTestDaysToPlan(plan, testDays, vdot, todayIso())
  return result.changed ? result.plan : plan
}

/** Put a manual test day on the calendar and create/adjust the affected weeks. */
export async function scheduleTestDay(input: {
  date: IsoDate
  distanceM: number
  targetTimeSec?: number
  note?: string
  vdot: number
  profile: Profile
  today: IsoDate
}): Promise<{ plan: Plan | undefined; updated: number; reasons: string[] }> {
  if (input.date < input.today) {
    throw new Error('不能安排已经过去的测试日')
  }
  if (input.date < input.profile.startDate) {
    throw new Error('测试日不能早于计划开始日期')
  }
  const lastPlanDate = addDaysIso(input.profile.startDate, 26 * 7 - 1)
  if (input.date > lastPlanDate) {
    throw new Error('测试日超出 26 周计划周期')
  }
  const existing = await getTestDay(input.date)
  const at = nowIso()
  await saveTestDay({
    date: input.date,
    distanceM: input.distanceM,
    targetTimeSec: input.targetTimeSec,
    note: input.note,
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
  })

  const weekStart = mondayOf(input.date)
  const weekIndex = getWeekIndex(input.profile.startDate, input.date)
  const isCurrentWeek = mondayOf(input.today) === weekStart
  const targetPlan = await ensurePlanForWeek(
    weekIndex,
    weekStart,
    input.vdot,
    input.profile,
    `第 ${weekIndex} 周：含临时测试日 ${input.date}`,
    isCurrentWeek,
  )

  // Existing neighbouring weeks also need their quality/long days reduced.
  const result = await applyStoredTestDays(input.vdot, input.today)
  return { plan: targetPlan, updated: result.updated, reasons: result.reasons }
}

/** Remove a test day and rebuild the weeks it had modified. */
export async function unscheduleTestDay(input: {
  date: IsoDate
  vdot: number
  profile: Profile
  today: IsoDate
}): Promise<{ restored: number }> {
  await deleteTestDay(input.date)
  const weekStart = mondayOf(input.date)
  const planStarts = [addDaysIso(weekStart, -7), weekStart, addDaysIso(weekStart, 7)]
  let restored = 0
  for (const start of planStarts) {
    const plan = await getPlanForWeek(start)
    if (!plan) continue
    if (addDaysIso(start, 6) < input.today) continue
    const affected =
      plan.adjustments.some((adjustment) => adjustment.action === 'schedule-test') ||
      plan.plannedSessions.some((session) => session.locked)
    if (!affected) continue
    await regeneratePlanWeek(plan, input.vdot, input.profile)
    restored += 1
  }
  return { restored }
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
  qualityAdvice?: Partial<Record<QualityKind, NextQualityWorkout>>,
): Promise<Plan> {
  const existing = await getPlanForWeek(weekStart)
  if (existing) {
    const withTestDays = await applyStoredTestDaysToPlan(existing, vdot)
    if (withTestDays !== existing) {
      await db.plans.put(withTestDays)
      markDirty()
    }
    if (activate) await activatePlan(withTestDays)
    return withTestDays
  }
  const base = generatePlanWeek({
    weekIndex,
    weekStart,
    vdot,
    profile,
    rationale,
    qualityAdvice,
  })
  const plan = await applyStoredTestDaysToPlan(base, vdot)
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
      const withTestDays = await applyStoredTestDaysToPlan(raced, vdot)
      if (withTestDays !== raced) {
        await db.plans.put(withTestDays)
        markDirty()
      }
      if (activate) await activatePlan(withTestDays)
      return withTestDays
    }
    throw error
  }
}

/** Manually rebuild the current week with the latest schedule/volume settings. */
export async function regeneratePlanWeek(
  plan: Plan,
  vdot: number,
  profile: Profile,
  qualityAdvice?: Partial<Record<QualityKind, NextQualityWorkout>>,
): Promise<Plan> {
  const base = generatePlanWeek({
    weekIndex: plan.weekIndex,
    weekStart: plan.weekStart,
    vdot,
    profile,
    version: plan.version + 1,
    rationale: '按最新训练设置重新生成本周课表。',
    qualityAdvice,
  })
  const next = await applyStoredTestDaysToPlan(base, vdot)
  const updated: Plan = {
    ...plan,
    version: next.version,
    phase: next.phase,
    targetKm: next.targetKm,
    rationale: next.rationale,
    plannedSessions: next.plannedSessions,
    adjustments: next.adjustments,
    createdAt: nowIso(),
    status: plan.status,
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
  const [sessions, sleeps, checkins, testDays] = await Promise.all([
    db.sessions.toArray(),
    db.sleep.toArray(),
    db.checkins.toArray(),
    db.testDays.toArray(),
  ])
  await db.transaction(
    'rw',
    [db.sessions, db.checkins, db.sleep, db.plans, db.testDays, db.tombstones, db.meta],
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
        ...testDays.map((t) => ({
          key: `testDay:${t.date}`,
          kind: 'testDay' as const,
          at,
        })),
      ])
      await Promise.all([
        db.sessions.clear(),
        db.checkins.clear(),
        db.sleep.clear(),
        db.plans.clear(),
        db.testDays.clear(),
      ])
      await db.meta.put({ key: 'lastClearedAt', value: at })
    },
  )
  markDirty()
}

export async function recentSessions(days: number, today: IsoDate): Promise<Session[]> {
  return sessionsBetween(addDaysIso(today, -(days - 1)), today)
}
