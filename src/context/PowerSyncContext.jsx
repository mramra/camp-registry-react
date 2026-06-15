/**
 * PowerSyncContext — معطّل نهائياً
 * PowerSync streaming يثقل Supabase NANO
 * البديل: Supabase → Dexie (local cache) عند تسجيل الدخول
 */
import { createContext, useContext } from 'react'

const ctx = { psReady: false, psSynced: false, psStatus: 'off' }
const PowerSyncContext = createContext(ctx)

export function PowerSyncProvider({ children }) {
  return <PowerSyncContext.Provider value={ctx}>{children}</PowerSyncContext.Provider>
}

export function useSyncStatus() { return ctx }
export function getPowerSync()  { return null }
