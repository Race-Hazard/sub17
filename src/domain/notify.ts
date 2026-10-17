import { addDaysIso, todayIso } from './format'
import type { IsoDate } from './types'

export interface ReminderIcsOptions {
  trainingTime?: string // HH:mm
  sleepTime?: string // HH:mm
  startDate?: IsoDate
  timezone?: string // reserved for future VTIMEZONE support
}

function escapeIcs(text: string): string {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll('\n', '\\n')
}

/** Fold a content line to <=75 UTF-8 octets, continuation lines start with a space. */
function foldLine(line: string): string {
  const encoder = new TextEncoder()
  const out: string[] = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    if (bytes + size > 73) {
      out.push(current)
      current = ` ${char}`
      bytes = 1 + size
    } else {
      current += char
      bytes += size
    }
  }
  out.push(current)
  return out.join('\r\n')
}

function compactDate(iso: IsoDate): string {
  return iso.replaceAll('-', '')
}

function compactTime(hhmm: string): string {
  return hhmm.replace(':', '') + '00'
}

function event(opts: {
  uid: string
  date: IsoDate
  time: string
  summary: string
  description: string
}): string {
  return [
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`,
    `DTSTART:${compactDate(opts.date)}T${compactTime(opts.time)}`,
    `DTEND:${compactDate(opts.date)}T${compactTime(opts.time)}`,
    `SUMMARY:${escapeIcs(opts.summary)}`,
    `DESCRIPTION:${escapeIcs(opts.description)}`,
    'TRANSP:TRANSPARENT',
    'RRULE:FREQ=DAILY',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-PT0M',
    `DESCRIPTION:${escapeIcs(opts.summary)}`,
    'END:VALARM',
    'END:VEVENT',
  ]
    .map(foldLine)
    .join('\r\n')
}

export function buildReminderIcs(options: ReminderIcsOptions = {}): string {
  const trainingTime = options.trainingTime ?? '20:30'
  const sleepTime = options.sleepTime ?? '07:30'
  const start = options.startDate ?? addDaysIso(todayIso(), 1)

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sub17//Training Log//ZH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    event({
      uid: 'daily-training@sub17.local',
      date: start,
      time: trainingTime,
      summary: '记录今天训练/休息 + 看明天计划',
      description: '打开 Sub17：记录今天的训练或休息，并确认明天课表。',
    }),
    event({
      uid: 'daily-sleep@sub17.local',
      date: start,
      time: sleepTime,
      summary: '记录昨晚睡眠',
      description: '打开 Sub17：记录昨晚睡眠（上床/起床时间或总时长）。',
    }),
    'END:VCALENDAR',
  ]
  return `${lines.join('\r\n')}\r\n`
}

export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
