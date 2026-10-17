import { describe, expect, it } from 'vitest'
import { buildReminderIcs } from './notify'

describe('reminder .ics', () => {
  it('creates two daily events with alarms', () => {
    const ics = buildReminderIcs({
      trainingTime: '20:30',
      sleepTime: '07:30',
      startDate: '2026-10-28',
    })
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('RRULE:FREQ=DAILY')
    expect(ics).toContain('BEGIN:VALARM')
    expect(ics).toContain('T203000')
    expect(ics).toContain('T073000')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics.match(/TRIGGER:-PT0M/g)).toHaveLength(2)
  })

  it('uses CRLF and folds long lines', () => {
    const ics = buildReminderIcs({ startDate: '2026-10-28' })
    expect(ics.includes('\r\n')).toBe(true)
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
  })
})
