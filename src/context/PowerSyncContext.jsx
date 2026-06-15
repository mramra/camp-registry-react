import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { PowerSyncDatabase } from '@powersync/web'
import { supabase } from '../lib/supabase'

const PowerSyncContext = createContext({ psReady: false, psSynced: false, psStatus: 'init' })

let _db = null
export function getPowerSync() { return _db }

export function PowerSyncProvider({ children }) {
  const [psReady,  setPsReady]  = useState(false)
  const [psSynced, setPsSynced] = useState(false)
  const [psStatus, setPsStatus] = useState('init')
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    initPS()
  }, [])

  async function initPS() {
    try {
      const { psDb } = await import('../lib/powersync')
      _db = psDb

      psDb.registerListener({
        statusChanged(status) {
          const s = status.connected ? 'connected'
            : status.connecting ? 'connecting' : 'disconnected'
          setPsStatus(s)
          if (status.connected && !psReady) setPsReady(true)
          if (status.hasSynced)            setPsSynced(true)
        }
      })

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { SupabaseConnector } = await import('../lib/supabase-connector')
      const connector = new SupabaseConnector()
      await psDb.connect(connector)
      setPsReady(true)
    } catch(e) {
      console.warn('[PowerSync] init failed:', e.message)
      setPsStatus('error')
    }
  }

  return (
    <PowerSyncContext.Provider value={{ psReady, psSynced, psStatus }}>
      {children}
    </PowerSyncContext.Provider>
  )
}

export function useSyncStatus() {
  return useContext(PowerSyncContext)
}
