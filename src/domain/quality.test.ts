import { describe, expect, it } from 'vitest'
import { evaluateQualitySession, qualitySummary, type QualityKind } from './quality'
import type { PaceRange, Plan, PlannedSession, Session } from './types'

const targetI: PaceRange = { fastSecKm: 230, slowSecKm: 236 }
const targetT: PaceRange = { fastSecKm: 251, slowSecKm: 255 }

function planned(
  id: string,
  type: PlannedSession['type'],
  zone: PlannedSession['zone'],
  distanceM: number,
  targetPace: PaceRange,
): PlannedSession {
  return {
    id,
    date: '2026-10-20',
    type,
    title: '',
    zone,
    distanceM,
    targetPace,
    purpose: '',
    details: '',
    downgrade: '',
    countsTowardCompliance: true,
    status: 'pending',
  }
}

function qualitySession(
  paces: number[],
  distanceM = 9000,
  rpe = 8,
  type: Session['type'] = 'interval',
  segments?: Session['segments'],
): Session {
  const work = paces.map((pace) => ({
    kind: 'work' as const,
    distanceM: 1000,
    durationSec: pace,
  }))
  return {
    id: 's1',
    date: '2026-10-20',
    type,
    distanceM,
    durationSec: paces.reduce((a, b) => a + b, 0),
    rpe,
    source: 'manual',
    plannedSessionId: 'p1',
    segments:
      segments ??
      [
        { kind: 'warmup' as const, distanceM: 2000, durationSec: 600 },
        ...work,
        { kind: 'cooldown' as const, distanceM: 2000, durationSec: 600 },
      ],
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
  }
}

function planWith(plannedSession: PlannedSession, id = 'plan'): Plan {
  return {
    id,
    version: 1,
    weekStart: '2026-10-19',
    weekIndex: 1,
    phase: 1,
    targetKm: 40,
    rationale: '',
    status: 'active',
    plannedSessions: [plannedSession],
    adjustments: [],
    createdAt: '2026-10-19T00:00:00.000Z',
  }
}

describe('quality session evaluation', () => {
  it('marks even, on-target intervals as excellent and suggests one more rep', () => {
    const evaluation = evaluateQualitySession(
      qualitySession([232, 233, 234, 233, 232]),
      planned('p1', 'interval', 'I', 9000, targetI),
      50,
    )
    expect(evaluation?.verdict).toBe('excellent')
    expect(evaluation?.verdictLabel).toBe('优秀')
    expect(evaluation?.nextAdvice).toContain('6×')
  })

  it('detects fade and tells the runner to start conservatively', () => {
    const evaluation = evaluateQualitySession(
      qualitySession([225, 232, 238, 245]),
      planned('p1', 'interval', 'I', 9000, targetI),
      50,
    )
    expect(evaluation?.verdict).toBe('fade')
    expect(evaluation?.verdictLabel).toBe('前快后慢')
    expect(evaluation?.nextAdvice).toContain('先稳后快')
  })

  it('flags an over-fast, high-RPE session as overload', () => {
    const evaluation = evaluateQualitySession(
      qualitySession([220, 221, 220, 222], 9000, 9),
      planned('p1', 'interval', 'I', 9000, targetI),
      50,
    )
    expect(evaluation?.verdict).toBe('overload')
    expect(evaluation?.nextAdvice).toContain('减量')
  })

  it('marks a slow threshold session as slow', () => {
    const evaluation = evaluateQualitySession(
      qualitySession([265, 266, 267], 9000, 7, 'threshold'),
      planned('p1', 'threshold', 'T', 9000, targetT),
      50,
    )
    expect(evaluation?.verdict).toBe('slow')
    expect(evaluation?.verdictLabel).toBe('慢于目标')
    expect(evaluation?.nextAdvice).toContain('重测 VDOT')
  })

  it('marks a short attempt as incomplete', () => {
    const evaluation = evaluateQualitySession(
      qualitySession([232, 233], 5000, 6),
      planned('p1', 'interval', 'I', 9000, targetI),
      50,
    )
    expect(evaluation?.verdict).toBe('incomplete')
  })

  it('handles a continuous threshold run without segments', () => {
    const session = qualitySession([250], 8000, 7, 'threshold', [])
    session.distanceM = 8000
    session.durationSec = 2000
    const evaluation = evaluateQualitySession(
      session,
      planned('p1', 'threshold', 'T', 8000, targetT),
      50,
    )
    expect(evaluation?.reps).toBe(1)
    expect(evaluation?.nextAdvice).toContain('35 min')
  })

  it('summarizes the latest evaluation and latest per kind', () => {
    const interval = qualitySession([232, 233, 234], 9000, 8)
    const plannedThreshold = {
      ...planned('p2', 'threshold', 'T', 8000, targetT),
      date: '2026-10-22',
    }
    const threshold = {
      ...qualitySession([252, 253], 8000, 7, 'threshold'),
      id: 's2',
      date: '2026-10-22',
      plannedSessionId: 'p2',
    }
    const summary = qualitySummary(
      [interval, threshold],
      [
        planWith(planned('p1', 'interval', 'I', 9000, targetI)),
        planWith(plannedThreshold, 'plan2'),
      ],
      50,
    )
    expect(summary.last?.date).toBe('2026-10-22')
    expect(summary.lastByKind.I).toBeTruthy()
    expect(summary.lastByKind.T).toBeTruthy()
    const kinds: QualityKind[] = ['I', 'T']
    expect(kinds.every((k) => summary.lastByKind[k])).toBe(true)
  })
})
