import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { processSyncQueue } from '../lib/sync'
import { quickSync } from '../lib/syncAll'
import { useSyncStatus } from './PowerSyncContext'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [online, setOnline] = useState(navigator.onLine)
  const [toast,  setToast]  = useState(null)

  // psReady و psStatus من PowerSyncProvider (الـ parent)
  const { psReady, psStatus } = useSyncStatus()

  useEffect(() => {
    const onOnline = async () => {
      setOnline(true)
      if (psReady) {
        // PowerSync جاهز — المزامنة تلقائية بالكامل، لا حاجة للـ queue
        console.log('[AppContext] متصل — PowerSync يتولى المزامنة')
      } else {
        // PowerSync غير جاهز — استخدم الطريقة القديمة
        try {
          await processSyncQueue()
          await quickSync()
        } catch(e) {
          console.warn('[AppContext] sync queue error:', e.message)
        }
      }
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
    <AppContext.Provider value={{ online, toast, showToast, psReady, psStatus }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
