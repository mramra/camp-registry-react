import { createContext, useContext, useEffect, useState } from 'react'
import { processSyncQueue } from '../lib/sync'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [online, setOnline]       = useState(navigator.onLine)
  const [syncing, setSyncing]     = useState(false)
  const [pendingCount, setPending]= useState(0)
  const [toast, setToast]         = useState(null)

  // مراقبة الاتصال
  useEffect(() => {
    const on  = () => { setOnline(true);  triggerSync() }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  async function triggerSync() {
    if (syncing) return
    setSyncing(true)
    try {
      const result = await processSyncQueue()
      if (result.synced > 0) showToast(`✅ تمت مزامنة ${result.synced} عنصر`)
    } catch {}
    setSyncing(false)
  }

  function showToast(msg, isError = false) {
    setToast({ msg, isError })
    setTimeout(() => setToast(null), 3500)
  }

  return (
    <AppContext.Provider value={{ online, syncing, pendingCount, toast, showToast, triggerSync }}>
      {children}
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 left-4 z-50 px-4 py-3 rounded-xl text-sm font-bold text-white shadow-2xl transition-all
          ${toast.isError ? 'bg-red/90' : 'bg-green/90'}`}>
          {toast.msg}
        </div>
      )}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
