import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { processSyncQueue, getSyncStats } from '../lib/sync'
import { quickSync } from '../lib/syncAll'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [online,  setOnline]  = useState(navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const [toast,   setToast]   = useState(null)

  // ── مراقبة الاتصال ──
  useEffect(() => {
    const onOnline = async () => {
      setOnline(true)
      setSyncing(true)
      try {
        // 1. ارفع الكتابات المعلقة
        await processSyncQueue()
        // 2. اسحب التحديثات الجديدة من Supabase
        await quickSync()
      } catch(e) { console.warn('[AppContext online]', e) }
      setSyncing(false)
    }
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
    <AppContext.Provider value={{ online, syncing, toast, showToast }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
