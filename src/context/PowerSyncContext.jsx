import { createContext, useContext, useEffect, useState } from 'react'
import { getPowerSync, SupabaseConnector } from '../lib/powersync'
import { useAuth } from './AuthContext'

const SyncStatusContext = createContext({
  syncing:    false,
  lastSync:   null,
  error:      null,
  psReady:    false,
  psStatus:   'idle',  // idle | connecting | connected | error
})

export function PowerSyncProvider({ children }) {
  const { user } = useAuth()
  const [syncing,  setSyncing]  = useState(false)
  const [lastSync, setLastSync] = useState(null)
  const [error,    setError]    = useState(null)
  const [psReady,  setPsReady]  = useState(false)
  const [psStatus, setPsStatus] = useState('idle')

  useEffect(() => {
    if (!user) {
      setPsStatus('idle')
      setPsReady(false)
      return
    }

    let cancelled = false

    const connect = async () => {
      setPsStatus('connecting')
      try {
        const db        = getPowerSync()
        const connector = new SupabaseConnector()
        await db.connect(connector)

        if (cancelled) return
        console.log('[PowerSync] ✅ متصل')
        setPsReady(true)
        setPsStatus('connected')

        // مراقبة حالة المزامنة لحظياً
        db.currentStatus.subscribe(status => {
          if (cancelled) return
          setSyncing(status.connecting || false)
          if (status.lastSyncedAt) {
            setLastSync(status.lastSyncedAt.toISOString())
          }
        })
      } catch(e) {
        if (cancelled) return
        console.warn('[PowerSync] تعذّر الاتصال:', e.message)
        setError(e.message)
        setPsStatus('error')
        // لا نُظهر الخطأ للمستخدم — التطبيق يعمل بـ Dexie بشكل طبيعي
      }
    }

    connect()

    return () => {
      cancelled = true
      try { getPowerSync().disconnect() } catch {}
    }
  }, [user])

  return (
    <SyncStatusContext.Provider value={{ syncing, lastSync, error, psReady, psStatus }}>
      {children}
    </SyncStatusContext.Provider>
  )
}

export function useSyncStatus() {
  return useContext(SyncStatusContext)
}
