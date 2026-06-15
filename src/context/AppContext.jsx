import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { useSyncStatus } from './PowerSyncContext'
import { deltaSync, resetDeltaSync } from '../lib/deltaSync'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [online, setOnline] = useState(navigator.onLine)
  const [toast,  setToast]  = useState(null)
  const { psReady, psSynced, psStatus } = useSyncStatus()

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

  return (
    <AppContext.Provider value={{ online, toast, showToast, psReady, psSynced, psStatus, resetDeltaSync }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
