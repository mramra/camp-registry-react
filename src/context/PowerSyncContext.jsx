/**
 * PowerSyncContext — SQLite فقط بدون streaming
 * psReady = true بعد init (بدون انتظار اتصال)
 */
import { createContext, useContext, useEffect, useState, useRef } from 'react'

const PowerSyncContext = createContext({ psReady:false, psSynced:false, psStatus:'init' })

let _db = null
export function getPowerSync() { return _db }

export function PowerSyncProvider({ children }) {
  const [psReady,  setPsReady]  = useState(false)
  const [psSynced, setPsSynced] = useState(false)
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    async function init() {
      try {
        const { psDb } = await import('../lib/powersync')
        _db = psDb
        // init SQLite فقط — بدون connect()
        // psDb.connect() ← لا نستدعيه أبداً
        setPsReady(true)
        console.log('[SQLite] ✅ جاهز للقراءة والكتابة')
      } catch(e) {
        console.warn('[SQLite] init failed:', e.message)
      }
    }
    init()
  }, [])

  return (
    <PowerSyncContext.Provider value={{ psReady, psSynced, psStatus:'local-only' }}>
      {children}
    </PowerSyncContext.Provider>
  )
}

export function useSyncStatus() { return useContext(PowerSyncContext) }
