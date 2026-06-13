import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { getPowerSync, SupabaseConnector } from '../lib/powersync'
import { supabase } from '../lib/supabase'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [online,    setOnline]    = useState(navigator.onLine)
  const [toast,     setToast]     = useState(null)
  const [psReady,   setPsReady]   = useState(false)
  const connectedRef = useRef(false)

  // ── تهيئة PowerSync — بدون انتظار ──
  useEffect(() => {
    const initPS = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { setPsReady(true); return }

        const db = getPowerSync()
        if (connectedRef.current) { setPsReady(true); return }
        connectedRef.current = true

        const connector = new SupabaseConnector()
        
        // أعلن جاهز فوراً — لا ننتظر sync
        setPsReady(true)
        
        // اتصل في الخلفية
        db.connect(connector).then(() => {
          console.log('[PowerSync] ✅ متصل ويزامن في الخلفية')
        }).catch(e => {
          console.warn('[PowerSync] خطأ:', e.message)
        })

      } catch(e) {
        console.warn('[PowerSync init]', e.message)
        setPsReady(true)
      }
    }

    initPS()
  }, [])

  // ── مراقبة الاتصال ──
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
    <AppContext.Provider value={{ online, toast, showToast, psReady }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
