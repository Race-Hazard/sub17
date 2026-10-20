import type {
  BodyMetric,
  Checkin,
  MetaRow,
  Plan,
  Profile,
  Session,
  SleepRecord,
  Tombstone,
} from '../domain/types'
import type { SyncData } from './merge'

export interface SyncConfig {
  owner: string
  repo: string
  path: string
  branch: string
  token: string
  auto: boolean
}

const STORAGE_KEY = 'sub17.sync.v1'

export const DEFAULT_SYNC_CONFIG: Omit<SyncConfig, 'token'> = {
  owner: 'Race-Hazard',
  repo: 'sub17-data',
  path: 'sub17.json',
  branch: 'main',
  auto: true,
}

export class SyncError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'SyncError'
    this.status = status
  }
}

export class SyncConflictError extends SyncError {
  constructor(message = '云端文件已被另一端更新') {
    super(message, 409)
    this.name = 'SyncConflictError'
  }
}

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SyncConfig>
    const token = parsed.token
    if (!parsed.owner || !parsed.repo || !token) return null
    return {
      ...DEFAULT_SYNC_CONFIG,
      ...parsed,
      owner: parsed.owner,
      repo: parsed.repo,
      token,
      auto: parsed.auto !== false,
    }
  } catch {
    return null
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function clearSyncConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function maskToken(token: string): string {
  if (!token) return ''
  if (token.length <= 8) return '••••'
  return `${token.slice(0, 4)}…${token.slice(-4)}`
}

function encodePath(path: string): string {
  return path
    .replace(/^\/+/, '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

function fileUrl(config: SyncConfig): string {
  return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodePath(config.path)}?ref=${encodeURIComponent(config.branch)}`
}

function repoUrl(config: SyncConfig): string {
  return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`
}

function headers(config: SyncConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function decodeBase64(encoded: string): string {
  const binary = atob(encoded.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function parseSyncPayload(value: unknown): SyncData {
  if (typeof value !== 'object' || value == null) {
    throw new SyncError('云端文件不是有效的 JSON 对象')
  }
  const raw = value as Record<string, unknown>
  if (raw.app !== 'sub17') throw new SyncError('云端文件不是 Sub17 数据')
  const readArray = <T>(key: string): T[] => {
    const arr = raw[key]
    if (!Array.isArray(arr)) throw new SyncError(`云端文件缺少 ${key}`)
    return arr as T[]
  }
  return {
    profile: readArray<Profile>('profile'),
    sessions: readArray<Session>('sessions'),
    checkins: readArray<Checkin>('checkins'),
    sleep: readArray<SleepRecord>('sleep'),
    body: Array.isArray(raw.body) ? (raw.body as BodyMetric[]) : [],
    plans: readArray<Plan>('plans'),
    meta: readArray<MetaRow>('meta'),
    tombstones: Array.isArray(raw.tombstones) ? (raw.tombstones as Tombstone[]) : [],
  }
}

export interface RemoteFile {
  data: SyncData | null
  sha?: string
}

export async function pullRemote(config: SyncConfig): Promise<RemoteFile> {
  const response = await fetch(fileUrl(config), {
    headers: headers(config),
    cache: 'no-store',
  })
  if (response.status === 404) {
    return { data: null }
  }
  if (!response.ok) {
    throw new SyncError(await errorMessage(response), response.status)
  }
  const payload = (await response.json()) as {
    content?: string
    encoding?: string
    sha?: string
  }
  if (!payload.content || payload.encoding === 'none') {
    throw new SyncError('云端文件太大或没有内容，无法读取')
  }
  const text = decodeBase64(payload.content)
  return { data: parseSyncPayload(JSON.parse(text)), sha: payload.sha }
}

export async function pushRemote(
  config: SyncConfig,
  data: SyncData,
  sha?: string,
): Promise<string | undefined> {
  const body = {
    message: `sub17 sync ${new Date().toISOString()}`,
    content: encodeBase64(JSON.stringify({ app: 'sub17', ...data }, null, 2)),
    branch: config.branch,
    ...(sha ? { sha } : {}),
  }
  const response = await fetch(fileUrl(config), {
    method: 'PUT',
    headers: { ...headers(config), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (response.status === 409 || response.status === 422) {
    throw new SyncConflictError()
  }
  if (!response.ok) {
    throw new SyncError(await errorMessage(response), response.status)
  }
  const result = (await response.json()) as { content?: { sha?: string } }
  return result.content?.sha
}

export interface TestResult {
  ok: boolean
  message: string
  isPrivate?: boolean
}

export async function testConnection(config: SyncConfig): Promise<TestResult> {
  try {
    const response = await fetch(repoUrl(config), {
      headers: headers(config),
      cache: 'no-store',
    })
    if (response.status === 404) {
      return {
        ok: false,
        message: '仓库不存在，或 token 没有该私有仓库的访问权限',
      }
    }
    if (!response.ok) {
      return { ok: false, message: await errorMessage(response) }
    }
    const repo = (await response.json()) as { private?: boolean; full_name?: string }
    const isPrivate = repo.private !== false
    return {
      ok: true,
      isPrivate,
      message: isPrivate
        ? `连接成功：${repo.full_name ?? `${config.owner}/${config.repo}`}（私有）`
        : '连接成功，但这是一个公开仓库；训练数据会公开可读，建议改成 Private',
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : '网络错误，无法连接 GitHub',
    }
  }
}

async function errorMessage(response: Response): Promise<string> {
  let detail = ''
  try {
    const body = (await response.json()) as { message?: string }
    detail = body.message ?? ''
  } catch {
    // ignore
  }
  if (response.status === 401) return 'token 无效或已过期'
  if (response.status === 403) return 'token 权限不足，或触发了 GitHub 速率限制'
  if (response.status === 404) return '仓库/文件不存在，或 token 没有权限'
  return `GitHub 返回 ${response.status}${detail ? `：${detail}` : ''}`
}
