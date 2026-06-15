import { createContext, useContext, useEffect, useState, useRef } from 'react'
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

    async function init() {
      try {
        const { psDb } = await import('../lib/powersync')
        _db = psDb

        // مراقبة حالة الاتصال
        psDb.registerListener({
          statusChanged(status) {
            setPsStatus(status.connected ? 'connected' : status.connecting ? 'connecting' : 'disconnected')
            if (status.connected)  setPsReady(true)
            if (status.hasSynced)  setPsSynced(true)
          }
        })

        // اتصل فقط إذا كان هناك session
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        // Supabase connector مدمج مباشرة
        const connector = {
          async fetchCredentials() {
            const { data: { session: s } } = await supabase.auth.getSession()
            if (!s) throw new Error('No session')
            return {
              endpoint:    'https://6a2d74dd0ef84ed671a15a84.powersync.journeyapps.com',
              token:       s.access_token,
              expiresAt:   new Date(s.expires_at * 1000),
            }
          },
          async uploadData(database) {
            const batch = await database.getCrudBatch(200)
            if (!batch) return
            for (const op of batch.crud) {
              const { table, opType, id, opData } = op
              if (opType === 'PUT')    await supabase.from(table).upsert({ id, ...opData })
              if (opType === 'PATCH')  await supabase.from(table).update(opData).eq('id', id)
              if (opType === 'DELETE') await supabase.from(table).delete().eq('id', id)
            }
            await batch.complete()
          }
        }

        await psDb.connect(connector)
        setPsReady(true)
      } catch(e) {
        console.warn('[PowerSync] init:', e.message)
        setPsStatus('error')
      }
    }

    init()
  }, [])

  return (
    <PowerSyncContext.Provider value={{ psReady, psSynced, psStatus }}>
      {children}
    </PowerSyncContext.Provider>
  )
}

export function useSyncStatus() {
  return useContext(PowerSyncContext)
}
