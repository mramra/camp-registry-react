/**
 * PowerSyncContext — الآن "ConnectionContext" فعلياً
 * يتتبّع فقط حالة الاتصال بالإنترنت. لا SQLite، لا PowerSync.
 *
 * الاسم بقي كما هو فقط لأن صفحات كثيرة تستورد useSyncStatus من هنا —
 * تغييره يتطلب تعديل كل تلك الصفحات بلا فائدة عملية.
 */
import { createContext, useContext, useEffect, useState } from 'react'

const PowerSyncContext = createContext({ psReady: true, isOnline: true })

export function PowerSyncProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const goOnline  = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return (
    <PowerSyncContext.Provider value={{ psReady: isOnline, isOnline, psStatus: isOnline ? 'online' : 'offline' }}>
      {children}
    </PowerSyncContext.Provider>
  )
}

export function useSyncStatus() { return useContext(PowerSyncContext) }
