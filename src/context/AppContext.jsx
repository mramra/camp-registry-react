import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { processSyncQueue } from '../lib/sync'
import { quickSync } from '../lib/syncAll'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [online,  setOnline]  = useState(navigator.onLine)
  const [toast,   setToast]   = useState(null)

  useEffect(() => {
    const onOnline = async () => {
      setOnline(true)
      try { await processSyncQueue(); await quickSync() } catch {}
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
    <AppContext.Provider value={{ online, toast, showToast, psReady: true }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
