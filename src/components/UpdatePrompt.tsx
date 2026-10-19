import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'

/**
 * Shows a banner when a new service worker is waiting. Tapping "重启更新"
 * activates it and reloads; IndexedDB (training data) is untouched.
 */
export function UpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let cancelled = false
    let refreshing = false

    const onControllerChange = () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    navigator.serviceWorker.ready
      .then((reg) => {
        if (cancelled) return
        setRegistration(reg)
        if (reg.waiting && navigator.serviceWorker.controller) setNeedRefresh(true)
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing
          if (!worker) return
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              setNeedRefresh(true)
            }
          })
        })
      })
      .catch(() => undefined)

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      navigator.serviceWorker.getRegistration().then((reg) => {
        void reg?.update().catch(() => undefined)
      })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  const apply = () => {
    if (applying) return
    setApplying(true)
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' })
    // Fallback if controllerchange does not fire (e.g. no waiting worker).
    window.setTimeout(() => window.location.reload(), 1200)
  }

  if (!needRefresh) return null

  return (
    <div
      className="fixed inset-x-0 z-40 mx-auto max-w-md px-4"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.25rem)' }}
    >
      <div className="flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-surface p-3 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.9)]">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-100">新版本已下载</div>
          <div className="text-[11px] text-muted">重启更新，训练数据不会丢失</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => setNeedRefresh(false)}
            className="rounded-lg p-1.5 text-muted hover:text-slate-200"
            aria-label="稍后更新"
          >
            <X size={15} />
          </button>
          <button
            onClick={apply}
            disabled={applying}
            className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-semibold text-ink disabled:opacity-60"
          >
            <RefreshCw size={13} /> {applying ? '更新中…' : '重启更新'}
          </button>
        </div>
      </div>
    </div>
  )
}
