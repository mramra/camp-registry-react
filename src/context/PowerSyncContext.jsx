/**
 * PowerSyncContext — يهيئ PowerSync ويربطه بـ Supabase
 * يُلف التطبيق كله ويتولى المزامنة التلقائية
 */
import { createContext, useContext, useEffect, useState } from 'react'
import { PowerSyncContext as PSContext } from '@powersync/react'
import { getPowerSync, SupabaseConnector } from '../lib/powersync'
import { useAuth } from './AuthContext'

const SyncStatusContext = createContext({ syncing: false, lastSync: null })

export function PowerSyncProvider({ children }) {
  const { user } = useAuth()
  const [db]          = useState(() => getPowerSync())
  const [syncing, setSyncing]   = useState(false)
  const [lastSync, setLastSync] = useState(null)

  useEffect(() => {
    if (!user) return  // لا مزامنة بدون تسجيل دخول

    const connector = new SupabaseConnector()

    db.connect(connector).then(() => {
      console.log('[PowerSync] ✅ متصل ويزامن')
    }).catch(e => {
      console.warn('[PowerSync] خطأ في الاتصال:', e.message)
    })

    // مراقبة حالة المزامنة
    const sub = db.syncStatus.subscribe(status => {
      setSyncing(status.connected && !status.hasSynced)
      if (status.hasSynced) setLastSync(new Date().toISOString())
    })

    return () => {
      sub?.()
      db.disconnect()
    }
  }, [user])

  return (
    <PSContext.Provider value={db}>
      <SyncStatusContext.Provider value={{ syncing, lastSync }}>
        {children}
      </SyncStatusContext.Provider>
    </PSContext.Provider>
  )
}

export function useSyncStatus() {
  return useContext(SyncStatusContext)
}
