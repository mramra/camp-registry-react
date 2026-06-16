import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { useSyncStatus } from './PowerSyncContext'
import { deltaSync, resetDeltaSync } from '../lib/deltaSync'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [online, setOnline] = useState(navigator.onLine)
  const [toast,  setToast]  = useState(null)
  const { psReady, psSynced, psStatus } = useSyncStatus()

  // مراقبة الإنترنت + معالجة قائمة الانتظار
  useEffect(() => {
    async function onOnline() {
      setOnline(true)
      // معالجة العمليات المعلقة عند عودة الإنترنت
      try {
        const { processQueue } = await import('../lib/syncQueue')
        const result = await processQueue()
        if (result.processed > 0) {
          window.dispatchEvent(new CustomEvent('sync-queue-done', { detail: result }))
          console.log(`[AppContext] queue: ${result.processed} عملية رُفعت`)
        }
      } catch {}
    }
    const onOffline = () => setOnline(false)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Delta Sync polling — كل 2.5 دقيقة
  const pollRef = useRef(null)
  useEffect(() => {
    function startPolling() {
      pollRef.current = setInterval(async () => {
        if (!navigator.onLine) return
        try { await deltaSync() } catch {}
      }, 2.5 * 60 * 1000)  // 2.5 دقيقة
    }

    // ابدأ بعد 30 ثانية من الفتح (ريثما يتحمل كل شيء)
    const startTimer = setTimeout(() => startPolling(), 30000)

    return () => {
      clearTimeout(startTimer)
      clearInterval(pollRef.current)
    }
  }, [])

  const showToast = useCallback((msg, isError = false) => {
    setToast({ msg, isError })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const [pendingSync, setPendingSync] = useState(0)

  // فحص القائمة عند الفتح
  useEffect(() => {
    import('../lib/syncQueue').then(({ getPendingCount }) =>
      getPendingCount().then(n => setPendingSync(n))
    )
    const handler = () => import('../lib/syncQueue').then(({ getPendingCount }) =>
      getPendingCount().then(n => setPendingSync(n))
    )
    window.addEventListener('sync-queue-done', handler)
    return () => window.removeEventListener('sync-queue-done', handler)
  }, [])

  return (
    <AppContext.Provider value={{ online, toast, showToast, psReady, psSynced, psStatus, resetDeltaSync, pendingSync }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
