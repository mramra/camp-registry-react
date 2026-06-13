/**
 * useRxDB — wrapper بسيط فوق Dexie
 * نفس الـ API الذي تستخدمه الصفحات حالياً
 * Dexie جاهز فوراً — لا async init ولا ready state
 */
import { useCallback } from 'react'
import { localDB } from './db'
import { ORG_ID } from './supabase'

export function useRxDB() {

  const query = useCallback(async (collection, filters = {}) => {
    try {
      const table = localDB[collection]
      if (!table) return []
      const all = await table.toArray()
      const keys = Object.keys(filters)
      if (!keys.length) return all
      return all.filter(item => keys.every(k => item[k] === filters[k]))
    } catch(e) {
      console.warn('[query]', collection, e.message)
      return []
    }
  }, [])

  const upsert = useCallback(async (collection, data) => {
    try {
      const doc = {
        ...data,
        org_id: data.org_id || ORG_ID,
        updated_at: new Date().toISOString(),
      }
      await localDB[collection]?.put(doc)
      return doc
    } catch(e) {
      console.warn('[upsert]', collection, e.message)
      return data
    }
  }, [])

  const bulkUpsert = useCallback(async (collection, docs) => {
    if (!docs?.length) return
    try {
      const now = new Date().toISOString()
      await localDB[collection]?.bulkPut(
        docs.map(d => ({ ...d, org_id: d.org_id || ORG_ID, updated_at: d.updated_at || now }))
      )
    } catch(e) {
      console.warn('[bulkUpsert]', collection, e.message)
    }
  }, [])

  const remove = useCallback(async (collection, id) => {
    try {
      await localDB[collection]?.delete(id)
    } catch(e) {
      console.warn('[remove]', collection, e.message)
    }
  }, [])

  return { ready: true, query, upsert, bulkUpsert, remove }
}
