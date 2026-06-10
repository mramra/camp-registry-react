import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { processSyncQueue, getSyncStats, retryFailed } from '../lib/sync'
import { syncAllData, getLastSyncTime, setLastSyncTime } from '../lib/syncAll'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [online, setOnline]           = useState(navigator.onLine)
  const [syncing, setSyncing]         = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncLabel, setSyncLabel]     = useState('')
  const [pendingCount, setPending]    = useState(0)
  const [toast, setToast]             = useState(null)
  const [lastSync, setLastSync]       = useState(null)
  const [fullSyncing, setFullSyncing] = useState(false)

  // تحميل وقت آخر مزامنة
  useEffect(() => {
    getLastSyncTime().then(t => setLastSync(t))
  }, [])

  // مراقبة الاتصال
  useEffect(() => {
    const on  = () => { setOnline(true);  triggerSync() }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // مزامنة الطابور عند الاتصال
  const triggerSync = useCallback(async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const result = await processSyncQueue()
      if (result.synced > 0) showToast(`✅ تمت مزامنة ${result.synced} عنصر`)
    } catch {}
    setSyncing(false)
  }, [syncing])

  // جلب كل البيانات (Full Sync)
  const fullSync = useCallback(async () => {
    if (!navigator.onLine) return showToast('لا يوجد اتصال', true)
    if (fullSyncing) return
    setFullSyncing(true)
    setSyncProgress(0)
    try {
      const results = await syncAllData((pct, label) => {
        setSyncProgress(pct)
        setSyncLabel(label)
      })
      await setLastSyncTime()
      const now = new Date().toISOString()
      setLastSync(now)
      const total = Object.values(results).reduce((a,b) => a+b, 0)
      showToast(`✅ تمت المزامنة الكاملة — ${total} سجل`)
    } catch (err) {
      showToast('خطأ في المزامنة: ' + err.message, true)
    } finally {
      setFullSyncing(false)
      setSyncProgress(0)
      setSyncLabel('')
    }
  }, [fullSyncing])

  function showToast(msg, isError = false) {
    setToast({ msg, isError })
    setTimeout(() => setToast(null), 3500)
  }

  return (
    <AppContext.Provider value={{
      online, syncing, pendingCount, toast, showToast,
      triggerSync, fullSync, fullSyncing, syncProgress, syncLabel, lastSync
    }}>
      {children}

      {/* شريط التقدم أثناء Full Sync */}
      {fullSyncing && (
        <div className="fixed top-0 left-0 right-0 z-[600] bg-surface border-b border-border px-4 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-accent">⬇️ جلب البيانات... {syncLabel}</span>
            <span className="text-xs text-muted">{syncProgress}%</span>
          </div>
          <div className="h-1 bg-surface2 rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${syncProgress}%` }} />
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 left-4 z-[500] px-4 py-3 rounded-xl text-sm font-bold text-white shadow-2xl
          ${toast.isError ? 'bg-red/90' : 'bg-green/90'}`}>
          {toast.msg}
        </div>
      )}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
