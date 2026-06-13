import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { getPowerSync, SupabaseConnector } from '../lib/powersync'
import { supabase } from '../lib/supabase'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [online,    setOnline]    = useState(navigator.onLine)
  const [toast,     setToast]     = useState(null)
  const [psReady,   setPsReady]   = useState(false)  // PowerSync جاهز
  const [psSyncing, setPsSyncing] = useState(false)
  const connectedRef = useRef(false)

  // ── تهيئة PowerSync ──
  useEffect(() => {
    const initPS = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return  // لا مزامنة بدون session

        const db = getPowerSync()
        if (connectedRef.current) return
        connectedRef.current = true

        const connector = new SupabaseConnector()
        await db.connect(connector)

        // انتظر أول sync مع timeout
        setPsSyncing(true)
        const timeout = setTimeout(() => {
          setPsReady(true)  // استمر حتى لو لم يكتمل
          setPsSyncing(false)
        }, 8000)

        await db.waitForFirstSync().catch(() => {})
        clearTimeout(timeout)
        setPsReady(true)
        setPsSyncing(false)
        console.log('[PowerSync] ✅ جاهز')
      } catch(e) {
        console.warn('[PowerSync init]', e.message)
        setPsReady(true)   // استمر بدون PowerSync
        setPsSyncing(false)
      }
    }

    initPS()
  }, [])

  // ── مراقبة الاتصال ──
  useEffect(() => {
    const onOnline  = () => { setOnline(true) }
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
    <AppContext.Provider value={{ online, toast, showToast, psReady, psSyncing }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
