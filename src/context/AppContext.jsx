import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [online,  setOnline]  = useState(navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const [toast,   setToast]   = useState(null)
  const dbRef = useRef(null)

  // ── تهيئة RxDB + سحب من PostgreSQL ──
  useEffect(() => {
    getDB().then(async db => {
      dbRef.current = db
      if (navigator.onLine) {
        setSyncing(true)
        await startSync(db).catch(e => console.warn('[sync]', e))
        setSyncing(false)
      }
    }).catch(e => console.warn('[RxDB init]', e))
  }, [])

  // ── مراقبة الاتصال ──
  useEffect(() => {
    const onOnline = async () => {
      setOnline(true)
      const db = dbRef.current || await getDB()
      setSyncing(true)
      await startSync(db).catch(() => {})
      setSyncing(false)
    }
    const onOffline = () => setOnline(false)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // ── Toast ──
  const showToast = useCallback((msg, isError = false) => {
    setToast({ msg, isError })
    setTimeout(() => setToast(null), 3500)
  }, [])

  return (
    <AppContext.Provider value={{ online, syncing, toast, showToast, db: dbRef.current }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
