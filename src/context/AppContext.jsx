import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { processSyncQueue } from '../lib/sync'
import { quickSync } from '../lib/syncAll'
import { useSyncStatus } from './PowerSyncContext'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [online, setOnline] = useState(navigator.onLine)
  const [toast,  setToast]  = useState(null)
  const { psReady, psSynced, psStatus } = useSyncStatus()

  useEffect(() => {
    const onOnline = async () => {
      setOnline(true)
      if (!psReady) {
        // PowerSync غير جاهز — استخدم الطريقة القديمة
        try { await processSyncQueue(); await quickSync() } catch {}
      }
      // إذا psReady — PowerSync يتولى المزامنة تلقائياً
    }
    const onOffline = () => setOnline(false)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [psReady])

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
