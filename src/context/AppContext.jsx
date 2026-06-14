import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { processSyncQueue } from '../lib/sync'
import { quickSync } from '../lib/syncAll'
import { useSyncStatus } from './PowerSyncContext'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [online, setOnline] = useState(navigator.onLine)
  const [toast,  setToast]  = useState(null)
  const { psReady, psSynced, psStatus } = useSyncStatus()
  const syncedOnceRef = useRef(false)

  // مزامنة Dexie عند أول اتصال بعد تسجيل الدخول (مرة واحدة لكل جلسة)
  useEffect(() => {
    if (psReady && online && !syncedOnceRef.current) {
      syncedOnceRef.current = true
      // PowerSync يتولى المزامنة — لكن نجلب Dexie أيضاً للـ fallback أوف لاين
      quickSync().catch(e => console.warn('[AppContext] quickSync:', e.message))
    }
  }, [psReady, online])

  // مراقبة الإنترنت
  useEffect(() => {
    const onOnline  = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const showToast = useCallback((msg, isError = false) => {
    setToast({ msg, isError })
    setTimeout(() => setToast(null), 3500)
  }, [])

  return (
    <AppContext.Provider value={{ online, toast, showToast, psReady, psSynced, psStatus }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
