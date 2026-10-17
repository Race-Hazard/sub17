export type IsoDate = string // YYYY-MM-DD (local calendar date)

export type SessionType =
  | 'easy'
  | 'long'
  | 'threshold'
  | 'interval'
  | 'repetition'
  | 'time_trial'
  | 'race'
  | 'strength'
  | 'rest'

export type RunType =
  | 'easy'
  | 'long'
  | 'threshold'
  | 'interval'
  | 'repetition'
  | 'time_trial'
  | 'race'

export type SessionSource = 'manual' | 'gpx' | 'fit' | 'ocr' | 'seed'

export type SegmentKind = 'warmup' | 'work' | 'recovery' | 'cooldown'

export interface Segment {
  kind: SegmentKind
  distanceM?: number
  durationSec?: number
  paceSecKm?: number
  hr?: number
  label?: string
}

export interface StrengthSet {
  exercise: string
  sets?: number
  reps?: number
  loadKg?: number
  rpe?: number
}

export interface Session {
  id: string
  date: IsoDate
  type: SessionType
  distanceM?: number
  durationSec?: number
  rpe?: number
  avgHr?: number
  maxHr?: number
  notes?: string
  source: SessionSource
  plannedSessionId?: string
  isSeed?: boolean
  isTest?: boolean
  testDistanceM?: number
  painSite?: string
  painScore?: number
  segments?: Segment[]
  strengthSets?: StrengthSet[]
  createdAt: string
  updatedAt: string
}

export type CheckinStatus = 'done' | 'rest' | 'notYet' | 'sleepOnly'
export type ReadinessLevel = 'green' | 'yellow' | 'red'

export interface Checkin {
  date: IsoDate
  status: CheckinStatus
  fatigue?: number // 1-5
  painSite?: string
  painScore?: number // 0-10
  readinessOverride?: ReadinessLevel
  overrideReason?: string
  notes?: string
  updatedAt: string
}

export interface SleepRecord {
  date: IsoDate // the morning you woke up
  bedtime?: string // HH:mm
  wakeTime?: string // HH:mm
  durationMin: number
  quality?: number // 1-5
  notes?: string
  updatedAt: string
}

export type TrainingZone = 'E' | 'M' | 'T' | 'I' | 'R' | '5K'

export interface PaceRange {
  /** Faster bound, seconds per km */
  fastSecKm: number
  /** Slower bound, seconds per km */
  slowSecKm: number
}

export interface PlannedSession {
  id: string
  date: IsoDate
  type: SessionType
  title: string
  zone?: TrainingZone
  distanceM?: number
  /** For time trials: the timed distance, excluding warm-up/cool-down. */
  testDistanceM?: number
  durationMin?: number
  targetPace?: PaceRange | null
  targetTimeSec?: number
  purpose: string
  details: string
  downgrade: string
  countsTowardCompliance: boolean
  status: 'pending' | 'done' | 'skipped' | 'adjusted'
}

export interface PlanAdjustment {
  plannedSessionId: string
  action: 'downgrade-easy' | 'downgrade-rest' | 'reduce-volume'
  reason: string
  at: string
}

export interface Plan {
  id: string
  version: number
  weekStart: IsoDate
  weekIndex: number
  phase: number
  targetKm: number
  rationale: string
  status: 'active' | 'superseded'
  plannedSessions: PlannedSession[]
  adjustments: PlanAdjustment[]
  createdAt: string
}

export interface Profile {
  id: 'me'
  goalTimeSec: number
  goalDate: IsoDate
  startDate: IsoDate // first plan Monday
  daysPerWeek: number
  qualityDays: number[] // 2 = Tuesday, 5 = Friday (1=Mon)
  longRunDay: number // 7 = Sunday
  sleepTargetMin: number
  reminderTime: string // HH:mm
  sleepReminderTime: string // HH:mm
  seedVdot: number
  manualVdot?: number
  timezone: string
  /** Local onboarding date; planned days before this are not counted. */
  createdDate?: IsoDate
  createdAt: string
  updatedAt: string
}

export interface MetaRow {
  key: string
  value: string
}

/** Soft-delete marker so a deletion propagates instead of being resurrected. */
export interface Tombstone {
  key: string
  kind: 'session' | 'sleep' | 'checkin'
  at: string
}

export interface VdotResult {
  vdot: number
  equivalent5kSec: number
  equivalent3kSec: number
}

export interface LoadSummary {
  acute: number | null
  chronic: number | null
  acwr: number | null
  status: 'insufficient' | 'low' | 'optimal' | 'elevated' | 'high'
  monotony: number | null
  strain: number | null
  daysOfData: number
}

export interface Readiness {
  level: ReadinessLevel
  reasons: string[]
  overridden: boolean
}

export interface SleepSummary {
  averageMin: number | null
  debtMin: number | null
  midpointStdMin: number | null
  nights: number
}

export interface Milestone {
  week: number
  distanceM: number
  targetSec: number
  label: string
  note: string
}
