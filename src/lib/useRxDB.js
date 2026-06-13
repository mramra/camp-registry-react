import { useCallback } from 'react'
import { localDB } from './db'
import { ORG_ID } from './supabase'

export function useRxDB() {
  const query = useCallback(async (table, filters = {}) => {
    try {
      const all = await localDB[table].toArray()
      const keys = Object.keys(filters)
      if (!keys.length) return all
      return all.filter(item => keys.every(k => item[k] === filters[k]))
    } catch(e) { console.warn('[query]', table, e.message); return [] }
  }, [])

  const upsert = useCallback(async (table, data) => {
    try {
      const doc = { ...data, org_id: data.org_id||ORG_ID, updated_at: new Date().toISOString() }
      await localDB[table]?.put(doc)
      return doc
    } catch(e) { console.warn('[upsert]', table, e.message); return data }
  }, [])

  const bulkUpsert = useCallback(async (table, docs) => {
    if (!docs?.length) return
    try {
      const now = new Date().toISOString()
      await localDB[table]?.bulkPut(docs.map(d => ({
        ...d, org_id: d.org_id||ORG_ID, updated_at: d.updated_at||now
      })))
    } catch(e) { console.warn('[bulkUpsert]', table, e.message) }
  }, [])

  const remove = useCallback(async (table, id) => {
    try { await localDB[table]?.delete(id) }
    catch(e) { console.warn('[remove]', table, e.message) }
  }, [])

  return { ready: true, query, upsert, bulkUpsert, remove }
}
