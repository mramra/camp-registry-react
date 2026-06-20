import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { useSyncStatus } from './PowerSyncContext'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [online, setOnline] = useState(navigator.onLine)
  const [toast,  setToast]  = useState(null)
  const { psReady, psSynced, psStatus } = useSyncStatus()

  // مراقبة الإنترنت — Supabase مباشر لا يحتاج معالجة قائمة انتظار
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

  // Supabase مباشر: لا حاجة لـ Delta Sync polling — كل query يقرأ مباشرة من السيرفر

  const showToast = useCallback((msg, isError = false) => {
    setToast({ msg, isError })
    setTimeout(() => setToast(null), 3500)
  }, [])

  // Supabase مباشر: لا قائمة انتظار محلية، لا حاجة لـ pendingSync

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
