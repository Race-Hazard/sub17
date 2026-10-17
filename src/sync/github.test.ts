import { describe, expect, it } from 'vitest'
import {
  decodeBase64,
  encodeBase64,
  maskToken,
  parseSyncPayload,
} from './github'

describe('GitHub sync helpers', () => {
  it('round-trips UTF-8 JSON through base64', () => {
    const text = JSON.stringify({ note: '训练日志 10 km 🏃', n: 42 })
    expect(decodeBase64(encodeBase64(text))).toBe(text)
  })

  it('masks tokens without exposing the middle', () => {
    expect(maskToken('github_pat_1234567890')).toBe('gith…7890')
    expect(maskToken('short')).toBe('••••')
    expect(maskToken('')).toBe('')
  })

  it('parses a sync payload and defaults old files to no tombstones', () => {
    const data = parseSyncPayload({
      app: 'sub17',
      profile: [],
      sessions: [],
      checkins: [],
      sleep: [],
      plans: [],
      meta: [],
    })
    expect(data.tombstones).toEqual([])
  })

  it('rejects foreign payloads', () => {
    expect(() => parseSyncPayload({ app: 'other' })).toThrow()
  })
})
