import { createContext, useContext, useEffect, useState } from 'react'
import { getPowerSync, SupabaseConnector } from '../lib/powersync'
import { useAuth } from './AuthContext'

const SyncStatusContext = createContext({ syncing: false, lastSync: null })

export function PowerSyncProvider({ children }) {
  const { user } = useAuth()
  const [syncing, setSyncing]   = useState(false)
  const [lastSync, setLastSync] = useState(null)
  const [error, setError]       = useState(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    const connect = async () => {
      try {
        const db = getPowerSync()
        const connector = new SupabaseConnector()
        await db.connect(connector)
        console.log('[PowerSync] ✅ متصل')

        // مراقبة حالة المزامنة
        db.currentStatus.subscribe(status => {
          if (cancelled) return
          setSyncing(status.connecting)
          if (status.lastSyncedAt) setLastSync(status.lastSyncedAt.toISOString())
        })
      } catch(e) {
        console.warn('[PowerSync] خطأ:', e.message)
        setError(e.message)
      }
    }

    connect()
    return () => {
      cancelled = true
      getPowerSync().disconnect().catch(() => {})
    }
  }, [user])

  // لا نُظهر خطأ PowerSync للمستخدم — التطبيق يعمل بـ Dexie
  return (
    <SyncStatusContext.Provider value={{ syncing, lastSync, error }}>
      {children}
    </SyncStatusContext.Provider>
  )
}

export function useSyncStatus() {
  return useContext(SyncStatusContext)
}
