import { describe, expect, it } from 'vitest'
import { durationBetween, sleepDebt, sleepSummary } from './sleep'
import type { SleepRecord } from './types'

describe('sleep', () => {
  it('handles bedtime crossing midnight', () => {
    expect(durationBetween('23:30', '07:00')).toBe(450)
    expect(durationBetween('00:30', '07:00')).toBe(390)
    expect(durationBetween('23:00', '23:30')).toBe(30)
    expect(durationBetween('23:00', '22:00')).toBeNull()
  })

  it('computes average and net debt over recorded nights', () => {
    const records: SleepRecord[] = [
      { date: '2026-10-15', durationMin: 420, updatedAt: '' },
      { date: '2026-10-16', durationMin: 390, updatedAt: '' },
      { date: '2026-10-17', durationMin: 450, updatedAt: '' },
    ]
    const summary = sleepSummary(records, 450, '2026-10-17', 7)
    expect(summary.nights).toBe(3)
    expect(summary.averageMin).toBe(420)
    expect(summary.debtMin).toBe(90)
  })

  it('includes naps in total sleep and debt', () => {
    const records: SleepRecord[] = [
      { date: '2026-10-16', durationMin: 420, napMin: 30, updatedAt: '' },
      { date: '2026-10-17', durationMin: 390, napMin: 20, updatedAt: '' },
    ]
    const summary = sleepSummary(records, 450, '2026-10-17', 7)
    expect(summary.averageMin).toBe(405)
    expect(summary.napAverageMin).toBe(25)
    expect(summary.totalAverageMin).toBe(430)
    expect(summary.debtMin).toBe(40)
  })

  it('returns null instead of inventing missing nights at launch', () => {
    const debt = sleepDebt([], 450, '2026-10-17', 7)
    expect(debt.nights).toBe(0)
    expect(debt.debtMin).toBeNull()
  })
})
