import type {
  BodyMetric,
  Checkin,
  MetaRow,
  Plan,
  Profile,
  Session,
  SleepRecord,
  Tombstone,
} from '../domain/types'

export interface SyncData {
  profile: Profile[]
  sessions: Session[]
  checkins: Checkin[]
  sleep: SleepRecord[]
  body: BodyMetric[]
  plans: Plan[]
  meta: MetaRow[]
  tombstones: Tombstone[]
}

export function emptySyncData(): SyncData {
  return {
    profile: [],
    sessions: [],
    checkins: [],
    sleep: [],
    body: [],
    plans: [],
    meta: [],
    tombstones: [],
  }
}

function newer<T>(a: T, b: T, time: (x: T) => string): T {
  return time(b) > time(a) ? b : a
}

function mergeByKey<T>(
  local: T[],
  remote: T[],
  key: (x: T) => string,
  time: (x: T) => string,
): T[] {
  const map = new Map<string, T>()
  for (const item of local) map.set(key(item), item)
  for (const item of remote) {
    const existing = map.get(key(item))
    map.set(key(item), existing ? newer(existing, item, time) : item)
  }
  return [...map.values()]
}

function mergePlans(local: Plan[], remote: Plan[]): Plan[] {
  const byWeek = new Map<string, Plan>()
  for (const plan of [...local, ...remote]) {
    const existing = byWeek.get(plan.weekStart)
    if (!existing) {
      byWeek.set(plan.weekStart, plan)
      continue
    }
    // An active plan is more valuable than a superseded duplicate.
    if (existing.status !== 'active' && plan.status === 'active') {
      byWeek.set(plan.weekStart, plan)
      continue
    }
    if (existing.status === 'active' && plan.status !== 'active') continue
    byWeek.set(plan.weekStart, newer(existing, plan, (p) => p.createdAt))
  }
  const plans = [...byWeek.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart))
  let activeSeen = false
  // Keep only the most recent active plan; older ones become superseded.
  for (let i = plans.length - 1; i >= 0; i -= 1) {
    if (plans[i].status === 'active') {
      if (activeSeen) plans[i] = { ...plans[i], status: 'superseded' }
      else activeSeen = true
    }
  }
  return plans
}

function mergeMeta(local: MetaRow[], remote: MetaRow[]): MetaRow[] {
  const map = new Map<string, MetaRow>()
  for (const row of local) map.set(row.key, row)
  for (const row of remote) {
    const existing = map.get(row.key)
    if (!existing) {
      map.set(row.key, row)
      continue
    }
    if (row.key === 'onboarded') {
      map.set(row.key, { key: row.key, value: existing.value === '1' || row.value === '1' ? '1' : row.value })
    } else if (row.key === 'schemaVersion') {
      map.set(row.key, {
        key: row.key,
        value: String(Math.max(Number(existing.value) || 0, Number(row.value) || 0)),
      })
    } else if (row.key === 'lastBackupAt' || row.key === 'lastSyncAt' || row.key === 'lastClearedAt') {
      map.set(row.key, { key: row.key, value: existing.value > row.value ? existing.value : row.value })
    } else {
      // Local settings win for everything else (seed marker, etc.).
      map.set(row.key, existing)
    }
  }
  return [...map.values()]
}

/**
 * Record-level merge. Deletions travel as tombstones so a record deleted on
 * one device is not resurrected by the other; a newer edit wins over an older
 * deletion.
 */
export function mergeSyncData(local: SyncData, remote: SyncData): SyncData {
  const tombstones = mergeByKey(
    local.tombstones,
    remote.tombstones,
    (t) => t.key,
    (t) => t.at,
  )
  const tombstoneAt = new Map(tombstones.map((t) => [t.key, t.at]))

  const sessions = mergeByKey(
    local.sessions,
    remote.sessions,
    (s) => s.id,
    (s) => s.updatedAt,
  ).filter((s) => {
    const deletedAt = tombstoneAt.get(s.id)
    return !deletedAt || deletedAt < s.updatedAt
  })

  const sleep = mergeByKey(
    local.sleep,
    remote.sleep,
    (s) => s.date,
    (s) => s.updatedAt,
  ).filter((s) => {
    const deletedAt = tombstoneAt.get(`sleep:${s.date}`)
    return !deletedAt || deletedAt < s.updatedAt
  })

  const checkins = mergeByKey(
    local.checkins,
    remote.checkins,
    (c) => c.date,
    (c) => c.updatedAt,
  ).filter((c) => {
    const deletedAt = tombstoneAt.get(`checkin:${c.date}`)
    return !deletedAt || deletedAt < c.updatedAt
  })

  const body = mergeByKey(
    local.body,
    remote.body,
    (b) => b.date,
    (b) => b.updatedAt,
  ).filter((b) => {
    const deletedAt = tombstoneAt.get(`body:${b.date}`)
    return !deletedAt || deletedAt < b.updatedAt
  })

  return {
    profile: mergeByKey(
      local.profile,
      remote.profile,
      (p) => p.id,
      (p) => p.updatedAt,
    ),
    sessions,
    checkins,
    sleep,
    body,
    plans: mergePlans(local.plans, remote.plans),
    meta: mergeMeta(local.meta, remote.meta),
    tombstones,
  }
}
