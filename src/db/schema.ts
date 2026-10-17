import Dexie, { type Table } from 'dexie'
import type {
  Checkin,
  MetaRow,
  Plan,
  Profile,
  Session,
  SleepRecord,
  Tombstone,
} from '../domain/types'

export const SCHEMA_VERSION = 2

export class Sub17DB extends Dexie {
  sessions!: Table<Session, string>
  checkins!: Table<Checkin, string>
  sleep!: Table<SleepRecord, string>
  plans!: Table<Plan, string>
  profile!: Table<Profile, string>
  meta!: Table<MetaRow, string>
  tombstones!: Table<Tombstone, string>

  constructor(name = 'sub17') {
    super(name)
    this.version(1).stores({
      sessions: 'id, date, type, plannedSessionId, isTest',
      checkins: 'date, status',
      sleep: 'date',
      plans: 'id, &weekStart, weekIndex, status',
      profile: 'id',
      meta: 'key',
    })
    this.version(2).stores({
      sessions: 'id, date, type, plannedSessionId, isTest',
      checkins: 'date, status',
      sleep: 'date',
      plans: 'id, &weekStart, weekIndex, status',
      profile: 'id',
      meta: 'key',
      tombstones: 'key, kind, at',
    })
  }
}

export const db = new Sub17DB()
