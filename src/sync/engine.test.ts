import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/schema'
import { syncNow } from './engine'
import type { SyncConfig } from './github'

const config: SyncConfig = {
  owner: 'Race-Hazard',
  repo: 'sub17-data',
  path: 'sub17.json',
  branch: 'main',
  token: 'test-token',
  auto: true,
}

function response(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sync engine', () => {
  it('creates the remote file on first sync and records lastSyncAt', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      if (init?.method === 'PUT') {
        return response(200, { content: { sha: 'sha-1' } })
      }
      return response(404, { message: 'Not Found' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await syncNow(config)
    expect(result.status).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const put = calls.find((c) => c.init?.method === 'PUT')
    expect(put).toBeTruthy()
    expect((put?.init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-token',
    )
    expect((await db.meta.get('lastSyncAt'))?.value).toBeTruthy()
  })
})
