import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { getPowerSync, SupabaseConnector } from '../lib/powersync'
import { useAuth } from './AuthContext'

const SyncStatusContext = createContext({
  syncing:   false,
  lastSync:  null,
  error:     null,
  psReady:   false,
  psSynced:  false,   // true بعد اكتمال أول sync فعلي
  psStatus:  'idle',
})

export function PowerSyncProvider({ children }) {
  const { user } = useAuth()
  const [syncing,  setSyncing]  = useState(false)
  const [lastSync, setLastSync] = useState(null)
  const [error,    setError]    = useState(null)
  const [psReady,  setPsReady]  = useState(false)
  const [psSynced, setPsSynced] = useState(false)
  const [psStatus, setPsStatus] = useState('idle')
  const syncedRef = useRef(false)

  useEffect(() => {
    if (!user) {
      setPsStatus('idle')
      setPsReady(false)
      setPsSynced(false)
      syncedRef.current = false
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

          // lastSyncedAt يُضبط بعد اكتمال أول sync
          if (status.lastSyncedAt && !syncedRef.current) {
            syncedRef.current = true
            setPsSynced(true)
            setLastSync(status.lastSyncedAt.toISOString())
            console.log('[PowerSync] ✅ أول sync اكتمل:', status.lastSyncedAt)
          } else if (status.lastSyncedAt) {
            setLastSync(status.lastSyncedAt.toISOString())
          }
        })
      } catch(e) {
        if (cancelled) return
        console.warn('[PowerSync] تعذّر الاتصال:', e.message)
        setError(e.message)
        setPsStatus('error')
      }
    }

    connect()
    return () => {
      cancelled = true
      try { getPowerSync().disconnect() } catch {}
    }
  }, [user])

  return (
    <SyncStatusContext.Provider value={{ syncing, lastSync, error, psReady, psSynced, psStatus }}>
      {children}
    </SyncStatusContext.Provider>
  )
}

export function useSyncStatus() {
  return useContext(SyncStatusContext)
}
