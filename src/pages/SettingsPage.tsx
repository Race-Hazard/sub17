import { useEffect, useRef, useState } from 'react'
import {
  CalendarPlus,
  Download,
  HardDrive,
  RotateCcw,
  Share2,
  Smartphone,
  Upload,
} from 'lucide-react'
import { Button, Card, Pill, SectionTitle } from '../components/ui'
import {
  downloadBackup,
  downloadCsv,
  importBackup,
  sessionsCsv,
  shareBackup,
  sleepCsv,
  validateBackup,
} from '../db/backup'
import { clearTrainingData, getMeta, saveProfile } from '../db/repo'
import {
  clearSyncConfig,
  DEFAULT_SYNC_CONFIG,
  loadSyncConfig,
  maskToken,
  saveSyncConfig,
  testConnection,
  type SyncConfig,
} from '../sync/github'
import { pullAndReplace, syncNow } from '../sync/engine'
import { buildReminderIcs, downloadIcs } from '../domain/notify'
import { formatDuration, parseDuration } from '../domain/format'
import type { Profile, Session, SleepRecord } from '../domain/types'

export function SettingsPage({
  profile,
  sessions,
  sleeps,
  onProfileSaved,
}: {
  profile: Profile
  sessions: Session[]
  sleeps: SleepRecord[]
  onProfileSaved: () => void
}) {
  const [goalText, setGoalText] = useState(formatDuration(profile.goalTimeSec))
  const [goalDate, setGoalDate] = useState(profile.goalDate)
  const [sleepHours, setSleepHours] = useState((profile.sleepTargetMin / 60).toFixed(1))
  const [reminder, setReminder] = useState(profile.reminderTime)
  const [sleepReminder, setSleepReminder] = useState(profile.sleepReminderTime)
  const [manualVdot, setManualVdot] = useState(profile.manualVdot?.toString() ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({})
  const fileRef = useRef<HTMLInputElement>(null)

  const [sync, setSync] = useState<SyncConfig | null>(() => loadSyncConfig())
  const [syncEditing, setSyncEditing] = useState(() => loadSyncConfig() == null)
  const [syncOwner, setSyncOwner] = useState(sync?.owner ?? DEFAULT_SYNC_CONFIG.owner)
  const [syncRepo, setSyncRepo] = useState(sync?.repo ?? DEFAULT_SYNC_CONFIG.repo)
  const [syncPath, setSyncPath] = useState(sync?.path ?? DEFAULT_SYNC_CONFIG.path)
  const [syncBranch, setSyncBranch] = useState(sync?.branch ?? DEFAULT_SYNC_CONFIG.branch)
  const [syncToken, setSyncToken] = useState('')
  const [syncAuto, setSyncAuto] = useState(sync?.auto ?? true)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [lastSyncError, setLastSyncError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const estimate = await navigator.storage?.estimate?.()
        const persisted = await navigator.storage?.persisted?.()
        setStorage({ usage: estimate?.usage, quota: estimate?.quota, persisted })
      } catch {
        setStorage({})
      }
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      setLastSync((await getMeta('lastSyncAt')) ?? null)
      setLastSyncError((await getMeta('lastSyncError')) ?? null)
    })()
  }, [sync, syncMsg])

  const save = async () => {
    const goalSec = parseDuration(goalText) ?? profile.goalTimeSec
    const sleepMin = Math.round((Number(sleepHours) || 7.5) * 60)
    const parsedVdot = manualVdot.trim() ? Number(manualVdot) : undefined
    const safeVdot =
      parsedVdot != null && Number.isFinite(parsedVdot) && parsedVdot > 0
        ? parsedVdot
        : undefined
    await saveProfile({
      ...profile,
      goalTimeSec: goalSec,
      goalDate,
      sleepTargetMin: sleepMin,
      reminderTime: reminder,
      sleepReminderTime: sleepReminder,
      manualVdot: safeVdot,
      updatedAt: new Date().toISOString(),
    })
    setMessage('已保存')
    onProfileSaved()
  }

  const exportIcs = () => {
    const ics = buildReminderIcs({
      trainingTime: profile.reminderTime,
      sleepTime: profile.sleepReminderTime,
    })
    downloadIcs('sub17-reminders.ics', ics)
    setMessage('已导出 .ics；请在日历 App 中导入并允许提醒。')
  }

  const importFile = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = validateBackup(JSON.parse(text))
      if (!parsed.ok) {
        setMessage(`导入失败：${parsed.error}`)
        return
      }
      if (!window.confirm('导入会覆盖本机现有数据，继续？')) return
      await importBackup(parsed.payload)
      setMessage('导入完成，正在刷新…')
      window.setTimeout(() => window.location.reload(), 500)
    } catch {
      setMessage('导入失败：文件不是有效 JSON')
    }
  }

  const clear = async () => {
    const cloudNote = sync
      ? '云同步已开启：这次清空也会同步删除云端训练记录。'
      : ''
    if (
      !window.confirm(
        `清空全部训练、睡眠与计划？此操作不可撤销，建议先导出备份。${cloudNote}`,
      )
    ) {
      return
    }
    if (!window.confirm('再确认一次：训练、睡眠与计划会删除，个人资料与设置保留。')) return
    await clearTrainingData()
    window.location.reload()
  }

  const persist = async () => {
    try {
      const granted = await navigator.storage?.persist?.()
      setStorage((s) => ({ ...s, persisted: granted }))
      setMessage(granted ? '已申请持久化存储' : '浏览器未授予持久化，请定期导出备份')
    } catch {
      setMessage('当前浏览器不支持持久化申请')
    }
  }

  const saveSync = async () => {
    const token = syncToken.trim() || sync?.token || ''
    const config: SyncConfig = {
      owner: syncOwner.trim(),
      repo: syncRepo.trim(),
      path: syncPath.trim() || 'sub17.json',
      branch: syncBranch.trim() || 'main',
      token,
      auto: syncAuto,
    }
    if (!config.owner || !config.repo || !config.token) {
      setSyncMsg('请填写 owner、repo 和 token')
      return
    }
    setSyncBusy(true)
    const test = await testConnection(config)
    if (!test.ok) {
      setSyncMsg(test.message)
      setSyncBusy(false)
      return
    }
    if (test.isPrivate === false) {
      setSyncMsg('这是公开仓库，训练数据会公开可读；请把仓库改成 Private 后再保存')
      setSyncBusy(false)
      return
    }
    saveSyncConfig(config)
    setSync(config)
    setSyncToken('')
    setSyncEditing(false)
    const result = await syncNow(config)
    setSyncMsg(`${test.message}；${result.message}`)
    setSyncBusy(false)
  }

  const runSync = async () => {
    if (!sync) return
    setSyncBusy(true)
    const result = await syncNow(sync)
    setSyncMsg(result.message)
    setSyncBusy(false)
  }

  const overwriteFromCloud = async () => {
    if (!sync) return
    if (!window.confirm('用云端数据覆盖本机？本机未同步的修改会丢失。')) return
    setSyncBusy(true)
    const result = await pullAndReplace()
    setSyncMsg(result.message)
    setSyncBusy(false)
  }

  const disconnectSync = () => {
    if (!window.confirm('断开云同步？本机数据会保留，但不再自动同步。')) return
    clearSyncConfig()
    setSync(null)
    setSyncEditing(true)
    setSyncMsg('已断开云同步')
  }

  const usageMb = storage.usage != null ? (storage.usage / 1024 / 1024).toFixed(1) : null

  return (
    <div className="space-y-4">
      <header>
        <div className="text-xs font-semibold tracking-[0.3em] text-accent">SETTINGS</div>
        <h1 className="mt-0.5 text-2xl font-bold text-slate-50">设置</h1>
      </header>

      {message ? (
        <div className="rounded-xl border border-accent-2/30 bg-accent-2/10 px-3 py-2 text-xs text-accent-2">
          {message}
        </div>
      ) : null}

      <SectionTitle>目标与作息</SectionTitle>
      <Card className="space-y-3">
        <label className="block text-xs text-muted">
          5 km 目标成绩
          <input
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
          />
        </label>
        <label className="block text-xs text-muted">
          目标日期
          <input
            type="date"
            value={goalDate}
            onChange={(e) => setGoalDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-muted">
            睡眠目标（小时）
            <input
              value={sleepHours}
              onChange={(e) => setSleepHours(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
            />
          </label>
          <label className="block text-xs text-muted">
            手动 VDOT（可选）
            <input
              value={manualVdot}
              onChange={(e) => setManualVdot(e.target.value)}
              inputMode="decimal"
              placeholder="自动"
              className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-muted">
            训练提醒
            <input
              type="time"
              value={reminder}
              onChange={(e) => setReminder(e.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
            />
          </label>
          <label className="block text-xs text-muted">
            睡眠提醒
            <input
              type="time"
              value={sleepReminder}
              onChange={(e) => setSleepReminder(e.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-accent"
            />
          </label>
        </div>
        <Button className="w-full" onClick={save}>保存设置</Button>
      </Card>

      <SectionTitle>云同步（可选）</SectionTitle>
      <Card className="space-y-3">
        {!syncEditing && sync ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-200">
                  {sync.owner}/{sync.repo}
                </div>
                <div className="text-[11px] text-muted">
                  {sync.path} · {sync.branch} · token {maskToken(sync.token)}
                </div>
              </div>
              <Pill tone={sync.auto ? 'good' : 'neutral'}>
                {sync.auto ? '自动同步' : '手动同步'}
              </Pill>
            </div>
            <div className="text-[11px] text-muted">
              上次同步：
              {lastSync ? new Date(lastSync).toLocaleString('zh-CN') : '—'}
            </div>
            {lastSyncError ? (
              <div className="rounded-lg border border-bad/25 bg-bad/10 px-2.5 py-1.5 text-[11px] text-bad">
                上次错误：{lastSyncError}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" onClick={() => void runSync()} disabled={syncBusy}>
                {syncBusy ? '同步中…' : '立即同步'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void overwriteFromCloud()} disabled={syncBusy}>
                从云端覆盖
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setSyncEditing(true)}>
                编辑
              </Button>
              <Button size="sm" variant="danger" onClick={disconnectSync}>
                断开
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[11px] leading-relaxed text-muted">
              新建一个 <span className="text-slate-300">Private</span> 仓库（建议 `sub17-data`，不要用公开的代码仓库）。
              创建 fine-grained token，只授权该仓库的 <span className="text-slate-300">Contents: Read and write</span>。
              手机和电脑填同一个仓库与 token。
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-muted">
                Owner
                <input
                  value={syncOwner}
                  onChange={(e) => setSyncOwner(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-accent"
                />
              </label>
              <label className="block text-xs text-muted">
                数据仓库
                <input
                  value={syncRepo}
                  onChange={(e) => setSyncRepo(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-accent"
                />
              </label>
              <label className="block text-xs text-muted">
                文件路径
                <input
                  value={syncPath}
                  onChange={(e) => setSyncPath(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-accent"
                />
              </label>
              <label className="block text-xs text-muted">
                分支
                <input
                  value={syncBranch}
                  onChange={(e) => setSyncBranch(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-accent"
                />
              </label>
            </div>
            <label className="block text-xs text-muted">
              Token（只存本机）
              <input
                type="password"
                value={syncToken}
                onChange={(e) => setSyncToken(e.target.value)}
                placeholder={sync ? '留空则沿用已保存的 token' : 'github_pat_…'}
                className="mt-1 w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-accent"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={syncAuto}
                onChange={(e) => setSyncAuto(e.target.checked)}
                className="accent-[color:var(--color-accent)]"
              />
              打开 App、保存后自动同步
            </label>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void saveSync()} disabled={syncBusy}>
                {syncBusy ? '检查中…' : '保存并测试'}
              </Button>
              {sync ? (
                <Button size="sm" variant="secondary" onClick={() => setSyncEditing(false)}>
                  取消
                </Button>
              ) : null}
            </div>
          </>
        )}
        {syncMsg ? (
          <div className="rounded-lg border border-accent-2/25 bg-accent-2/10 px-2.5 py-1.5 text-[11px] text-accent-2">
            {syncMsg}
          </div>
        ) : null}
        <p className="text-[10px] leading-relaxed text-muted">
          token 存在本机浏览器里；拿到你解锁设备的人可能读取它。请用只授权 `sub17-data` 的 fine-grained token，丢失设备时立即到 GitHub 撤销。
        </p>
      </Card>

      <SectionTitle>备份与数据</SectionTitle>
      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-200">导出备份</div>
            <div className="text-[11px] text-muted">JSON 含全部训练、睡眠、计划与设置</div>
          </div>
          <Button size="sm" onClick={() => void downloadBackup()}>
            <Download size={14} /> 导出
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-200">分享/保存到网盘</div>
            <div className="text-[11px] text-muted">Android 分享面板；没有则下载</div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void shareBackup()}>
            <Share2 size={14} /> 分享
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-200">导入备份</div>
            <div className="text-[11px] text-muted">全量替换本机数据</div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> 导入
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importFile(file)
              e.target.value = ''
            }}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-200">导出 CSV</div>
            <div className="text-[11px] text-muted">训练与睡眠，方便 Excel</div>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="secondary" onClick={() => downloadCsv('sub17-sessions.csv', sessionsCsv(sessions))}>
              训练
            </Button>
            <Button size="sm" variant="secondary" onClick={() => downloadCsv('sub17-sleep.csv', sleepCsv(sleeps))}>
              睡眠
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-line/70 pt-2">
          <div>
            <div className="text-sm font-medium text-bad">清空训练与计划</div>
            <div className="text-[11px] text-muted">
              {sync ? '云同步已开启：会同步删除云端训练记录' : '保留个人资料与设置；先导出备份'}
            </div>
          </div>
          <Button size="sm" variant="danger" onClick={clear}>
            <RotateCcw size={14} /> 清空
          </Button>
        </div>
      </Card>

      <SectionTitle>提醒</SectionTitle>
      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-200">导出 .ics 日历</div>
            <div className="text-[11px] text-muted">每天 {profile.reminderTime} 训练、{profile.sleepReminderTime} 睡眠；导入后由系统日历提醒</div>
          </div>
          <Button size="sm" onClick={exportIcs}>
            <CalendarPlus size={14} /> 导出
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-muted">
          纯离线 PWA 无法保证后台定时通知。日历是唯一可靠的 App 外提醒；它不知道你今天是否已记录，已记录时忽略即可。
        </p>
      </Card>

      <SectionTitle>存储</SectionTitle>
      <Card className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 text-muted"><HardDrive size={14} /> 已用空间</span>
          <span className="tabular text-slate-200">{usageMb ? `${usageMb} MB` : '—'}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">持久化</span>
          <Pill tone={storage.persisted ? 'good' : 'warn'}>{storage.persisted ? '已授予' : '未授予'}</Pill>
        </div>
        <Button size="sm" variant="secondary" onClick={persist}>申请持久化存储</Button>
      </Card>

      <SectionTitle>安装</SectionTitle>
      <Card className="space-y-2 text-xs leading-relaxed text-muted">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <Smartphone size={16} /> Android Chrome
        </div>
        <p>1. 用 Chrome 打开正式 HTTPS 地址，等页面加载完。</p>
        <p>2. 菜单「安装应用」或「添加到主屏幕」。</p>
        <p>3. 联网启动一次，再开飞行模式重开，确认离线可用。</p>
        <p>4. 把 .ics 导入日历，作为每日提醒。</p>
      </Card>

      <div className="pb-2 text-center text-[10px] text-muted">Sub17 · v0.1.0 · 数据只在本机</div>
    </div>
  )
}
