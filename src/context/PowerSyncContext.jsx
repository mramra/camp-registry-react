/**
 * PowerSyncContext — وضع الإيقاف المؤقت
 * PowerSync معطّل لتخفيف الحمل على Supabase (Unhealthy/NANO)
 * البيانات تُقرأ مباشرة من Supabase عبر useRxDB
 */
import { createContext, useContext } from 'react'

const PowerSyncContext = createContext({
  psReady: false, psSynced: false, psStatus: 'off'
})

export function PowerSyncProvider({ children }) {
  // لا نفتح أي اتصال streaming بـ Supabase
  return (
    <PowerSyncContext.Provider value={{ psReady: false, psSynced: false, psStatus: 'off' }}>
      {children}
    </PowerSyncContext.Provider>
  )
}

export function useSyncStatus() {
  return useContext(PowerSyncContext)
}
