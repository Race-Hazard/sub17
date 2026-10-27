import { nowIso } from '../domain/format'
import { db } from '../db/schema'
import { mergeSyncData, type SyncData } from './merge'
import {
  loadSyncConfig,
  pullRemote,
  pushRemote,
  SyncConflictError,
  type SyncConfig,
} from './github'

let syncing = false
let dirty = false
let pending = false
let timer: number | null = null
let listenersReady = false

export interface SyncResult {
  status: 'ok' | 'disabled' | 'busy' | 'error'
  message: string
  at?: string
}

export async function collectSyncData(): Promise<SyncData> {
  const [profile, sessions, checkins, sleep, body, plans, testDays, meta, tombstones] =
    await Promise.all([
      db.profile.toArray(),
      db.sessions.toArray(),
      db.checkins.toArray(),
      db.sleep.toArray(),
      db.body.toArray(),
      db.plans.toArray(),
      db.testDays.toArray(),
      db.meta.toArray(),
      db.tombstones.toArray(),
    ])
  return { profile, sessions, checkins, sleep, body, plans, testDays, meta, tombstones }
}

export async function applySyncData(data: SyncData): Promise<void> {
  await db.transaction(
    'rw',
    [db.profile, db.sessions, db.checkins, db.sleep, db.body, db.plans, db.testDays, db.meta, db.tombstones],
    async () => {
      await Promise.all([
        db.profile.clear(),
        db.sessions.clear(),
        db.checkins.clear(),
        db.sleep.clear(),
        db.body.clear(),
        db.plans.clear(),
        db.testDays.clear(),
        db.meta.clear(),
        db.tombstones.clear(),
      ])
      await db.profile.bulkPut(data.profile)
      await db.sessions.bulkPut(data.sessions)
      await db.checkins.bulkPut(data.checkins)
      await db.sleep.bulkPut(data.sleep)
      await db.body.bulkPut(data.body)
      await db.plans.bulkPut(data.plans)
      await db.testDays.bulkPut(data.testDays ?? [])
      await db.meta.bulkPut(data.meta)
      await db.tombstones.bulkPut(data.tombstones)
    },
  )
}

function latestUpdate(data: SyncData): string {
  const times = [
    ...data.sessions.map((s) => s.updatedAt),
    ...data.sleep.map((s) => s.updatedAt),
    ...data.body.map((b) => b.updatedAt),
    ...data.checkins.map((s) => s.updatedAt),
    ...data.profile.map((p) => p.updatedAt),
    ...data.plans.map((p) => p.createdAt),
    ...(data.testDays ?? []).map((t) => t.updatedAt),
    ...data.tombstones.map((t) => t.at),
  ]
  return times.reduce((max, t) => (t > max ? t : max), '')
}

function hasRealData(data: SyncData): boolean {
  return (
    data.sessions.some((s) => !s.isSeed) ||
    data.sleep.length > 0 ||
    data.checkins.some((c) => c.status !== 'rest')
  )
}

async function markError(message: string) {
  await db.meta.put({ key: 'lastSyncError', value: message })
}

export async function syncNow(configOverride?: SyncConfig): Promise<SyncResult> {
  const config = configOverride ?? loadSyncConfig()
  if (!config) return { status: 'disabled', message: '未配置云同步' }
  if (syncing) {
    pending = true
    return { status: 'busy', message: '正在同步' }
  }
  if (!navigator.onLine) {
    pending = true
    await markError('离线，联网后会重试')
    return { status: 'error', message: '当前离线，已排队等待联网' }
  }

  syncing = true
  try {
    const local = await collectSyncData()
    const remote = await pullRemote(config)
    let merged = local
    if (remote.data) {
      merged = mergeSyncData(local, remote.data)
      await applySyncData(merged)
    }

    const pristineSeedDevice = Boolean(remote.data) && !hasRealData(local)
    const needsPush = !remote.data || (dirty && !pristineSeedDevice)
    if (needsPush) {
      try {
        await pushRemote(config, merged, remote.sha)
      } catch (error) {
        if (!(error instanceof SyncConflictError)) throw error
        const latest = await pullRemote(config)
        if (latest.data) {
          merged = mergeSyncData(merged, latest.data)
          await applySyncData(merged)
        }
        await pushRemote(config, merged, latest.sha)
      }
    }

    const at = nowIso()
    await db.meta.put({ key: 'lastSyncAt', value: at })
    await db.meta.put({ key: 'lastSyncError', value: '' })
    await db.meta.put({ key: 'lastSyncedLocalAt', value: latestUpdate(merged) })
    dirty = false
    pending = false
    return {
      status: 'ok',
      message: needsPush ? '同步完成，已上传合并结果' : '同步完成，云端没有新变化',
      at,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '同步失败'
    await markError(message)
    pending = navigator.onLine
    return { status: 'error', message }
  } finally {
    syncing = false
    if (pending) scheduleSync(5000)
  }
}

export function scheduleSync(delay = 3000): void {
  const config = loadSyncConfig()
  if (!config || !config.auto) return
  if (timer != null) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    timer = null
    void syncNow(config)
  }, delay)
}

export async function initSync(): Promise<void> {
  const config = loadSyncConfig()
  if (!config || !config.auto) return
  if (!navigator.onLine) {
    pending = true
    return
  }
  const local = await collectSyncData()
  const lastSynced = (await db.meta.get('lastSyncedLocalAt'))?.value ?? ''
  dirty = hasRealData(local) && latestUpdate(local) > (lastSynced || '')
  await syncNow(config)
}

/** Call after a local write so the next sync uploads it. */
export function markDirty(): void {
  dirty = true
  scheduleSync()
}

export function setupSyncListeners(): void {
  if (listenersReady) return
  listenersReady = true
  window.addEventListener('online', () => {
    if (pending || dirty) scheduleSync(1000)
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const config = loadSyncConfig()
      if (config?.auto) scheduleSync(1000)
    }
  })
}

export async function pullAndReplace(): Promise<SyncResult> {
  const config = loadSyncConfig()
  if (!config) return { status: 'disabled', message: '未配置云同步' }
  try {
    const remote = await pullRemote(config)
    if (!remote.data) return { status: 'error', message: '云端还没有数据文件' }
    await applySyncData(remote.data)
    const at = nowIso()
    await db.meta.put({ key: 'lastSyncAt', value: at })
    await db.meta.put({ key: 'lastSyncedLocalAt', value: latestUpdate(remote.data) })
    dirty = false
    return { status: 'ok', message: '已用云端数据覆盖本机', at }
  } catch (error) {
    const message = error instanceof Error ? error.message : '拉取失败'
    await markError(message)
    return { status: 'error', message }
  }
}
