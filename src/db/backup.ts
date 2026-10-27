import { formatPace, nowIso, secondsPerKm, todayIso } from '../domain/format'
import type {
  BodyMetric,
  Checkin,
  MetaRow,
  Plan,
  Profile,
  Session,
  SleepRecord,
  TestDay,
  Tombstone,
} from '../domain/types'
import { db, SCHEMA_VERSION } from './schema'
import { markDirty } from '../sync/engine'

export const APP_VERSION = '0.1.0'

export interface BackupPayload {
  app: 'sub17'
  schemaVersion: number
  appVersion: string
  exportedAt: string
  counts: Record<string, number>
  profile: Profile[]
  sessions: Session[]
  checkins: Checkin[]
  sleep: SleepRecord[]
  body: BodyMetric[]
  plans: Plan[]
  testDays?: TestDay[]
  meta: MetaRow[]
  tombstones: Tombstone[]
}

export async function exportBackup(): Promise<BackupPayload> {
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
  return {
    app: 'sub17',
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: nowIso(),
    counts: {
      profile: profile.length,
      sessions: sessions.length,
      checkins: checkins.length,
      sleep: sleep.length,
      body: body.length,
      plans: plans.length,
      testDays: testDays.length,
      meta: meta.length,
      tombstones: tombstones.length,
    },
    profile,
    sessions,
    checkins,
    sleep,
    body,
    plans,
    testDays,
    meta,
    tombstones,
  }
}

export function validateBackup(value: unknown): { ok: true; payload: BackupPayload } | { ok: false; error: string } {
  if (typeof value !== 'object' || value == null) return { ok: false, error: '不是有效的 JSON 对象' }
  const v = value as Partial<BackupPayload>
  if (v.app !== 'sub17') return { ok: false, error: '不是 Sub17 备份文件' }
  if (typeof v.schemaVersion !== 'number') return { ok: false, error: '缺少 schemaVersion' }
  if (v.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: '备份来自更新版本的 App，请先升级 App' }
  }
  const arrays: (keyof BackupPayload)[] = ['profile', 'sessions', 'checkins', 'sleep', 'plans', 'meta']
  for (const key of arrays) {
    if (!Array.isArray(v[key])) return { ok: false, error: `备份缺少 ${String(key)}` }
  }
  if (v.tombstones != null && !Array.isArray(v.tombstones)) {
    return { ok: false, error: '备份里的 tombstones 不是数组' }
  }
  if (v.body != null && !Array.isArray(v.body)) {
    return { ok: false, error: '备份里的 body 不是数组' }
  }
  if (v.testDays != null && !Array.isArray(v.testDays)) {
    return { ok: false, error: '备份里的 testDays 不是数组' }
  }
  return {
    ok: true,
    payload: {
      ...(v as BackupPayload),
      body: v.body ?? [],
      testDays: v.testDays ?? [],
      tombstones: v.tombstones ?? [],
    },
  }
}

/** v1 import semantics: full replace. */
export async function importBackup(payload: BackupPayload): Promise<void> {
  await db.transaction(
    'rw',
    [db.sessions, db.checkins, db.sleep, db.body, db.plans, db.testDays, db.profile, db.meta, db.tombstones],
    async () => {
      await Promise.all([
        db.sessions.clear(),
        db.checkins.clear(),
        db.sleep.clear(),
        db.body.clear(),
        db.plans.clear(),
        db.testDays.clear(),
        db.profile.clear(),
        db.meta.clear(),
        db.tombstones.clear(),
      ])
      await db.profile.bulkPut(payload.profile)
      await db.sessions.bulkPut(payload.sessions)
      await db.checkins.bulkPut(payload.checkins)
      await db.sleep.bulkPut(payload.sleep)
      await db.body.bulkPut(payload.body ?? [])
      await db.plans.bulkPut(payload.plans)
      await db.testDays.bulkPut(payload.testDays ?? [])
      await db.meta.bulkPut(payload.meta)
      await db.tombstones.bulkPut(payload.tombstones ?? [])
    },
  )
  await db.meta.put({ key: 'lastBackupAt', value: nowIso() })
  markDirty()
}

export function backupFilename(date = todayIso()): string {
  return `sub17-backup-${date.replaceAll('-', '')}.json`
}

export function backupToJson(payload: BackupPayload): string {
  return JSON.stringify(payload, null, 2)
}

function downloadBlob(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function downloadBackup(payload?: BackupPayload): Promise<void> {
  const data = payload ?? (await exportBackup())
  const json = backupToJson(data)
  const filename = backupFilename()
  const picker = (window as unknown as {
    showSaveFilePicker?: (opts: unknown) => Promise<{
      createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>
    }>
  }).showSaveFilePicker
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: 'Sub17 备份', accept: { 'application/json': ['.json'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(json)
      await writable.close()
      await db.meta.put({ key: 'lastBackupAt', value: nowIso() })
      return
    } catch {
      // User cancelled or picker unavailable; fall through to download.
    }
  }
  downloadBlob(filename, json, 'application/json')
  await db.meta.put({ key: 'lastBackupAt', value: nowIso() })
}

export async function shareBackup(payload?: BackupPayload): Promise<boolean> {
  const data = payload ?? (await exportBackup())
  const json = backupToJson(data)
  const filename = backupFilename()
  const file = new File([json], filename, { type: 'application/json' })
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Sub17 备份' })
    await db.meta.put({ key: 'lastBackupAt', value: nowIso() })
    return true
  }
  downloadBlob(filename, json, 'application/json')
  await db.meta.put({ key: 'lastBackupAt', value: nowIso() })
  return false
}

export function sessionsCsv(sessions: Session[]): string {
  const header = ['date', 'type', 'distance_km', 'duration_sec', 'pace_sec_km', 'rpe', 'notes']
  const rows = sessions.map((s) => {
    const pace =
      s.distanceM && s.durationSec ? secondsPerKm(s.distanceM, s.durationSec) : null
    return [
      s.date,
      s.type,
      s.distanceM != null ? (s.distanceM / 1000).toFixed(2) : '',
      s.durationSec ?? '',
      pace != null ? formatPace(pace) : '',
      s.rpe ?? '',
      `"${(s.notes ?? '').replaceAll('"', '""')}"`,
    ]
  })
  return [header, ...rows].map((r) => r.join(',')).join('\n')
}

export function sleepCsv(records: SleepRecord[]): string {
  const header = ['date', 'bedtime', 'wake_time', 'duration_min', 'quality', 'notes']
  const rows = records.map((r) => [
    r.date,
    r.bedtime ?? '',
    r.wakeTime ?? '',
    r.durationMin,
    r.quality ?? '',
    `"${(r.notes ?? '').replaceAll('"', '""')}"`,
  ])
  return [header, ...rows].map((r) => r.join(',')).join('\n')
}

export function downloadCsv(filename: string, content: string): void {
  downloadBlob(filename, content, 'text/csv;charset=utf-8')
}
