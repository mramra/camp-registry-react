import { useCallback } from 'react'
import { localDB } from './db'
import { ORG_ID } from './supabase'

/**
 * useRxDB — نفس الـ API لكن يستخدم Dexie مباشرة
 * استبدال RxDB الذي كان يسبب "Illegal constructor" على Android
 */
export function useRxDB() {
  // Dexie جاهز دائماً — لا حاجة لـ ready state
  const ready = true

  const query = useCallback(async (collection, filters = {}) => {
    try {
      const table = localDB[collection]
      if (!table) return []
      let results = await table.toArray()
      // تطبيق الفلاتر
      const keys = Object.keys(filters)
      if (keys.length) {
        results = results.filter(item =>
          keys.every(k => item[k] === filters[k])
        )
      }
      return results
    } catch(e) {
      console.warn('[useRxDB/Dexie query]', collection, e.message)
      return []
    }
  }, [])

  const upsert = useCallback(async (collection, data) => {
    try {
      const table = localDB[collection]
      if (!table) return data
      const doc = {
        ...data,
        updated_at: data.updated_at || new Date().toISOString(),
        org_id: data.org_id || ORG_ID,
      }
      await table.put(doc)
      return doc
    } catch(e) {
      console.warn('[useRxDB/Dexie upsert]', collection, e.message)
      return data
    }
  }, [])

  const bulkUpsert = useCallback(async (collection, docs) => {
    try {
      const table = localDB[collection]
      if (!table || !docs?.length) return
      const now = new Date().toISOString()
      await table.bulkPut(docs.map(d => ({
        ...d,
        updated_at: d.updated_at || now,
        org_id: d.org_id || ORG_ID,
      })))
    } catch(e) {
      console.warn('[useRxDB/Dexie bulkUpsert]', collection, e.message)
    }
  }, [])

  const remove = useCallback(async (collection, id) => {
    try {
      const table = localDB[collection]
      if (!table) return
      await table.delete(id)
    } catch(e) {
      console.warn('[useRxDB/Dexie remove]', collection, e.message)
    }
  }, [])

  const subscribe = useCallback(() => () => {}, [])

  return { ready, query, upsert, bulkUpsert, remove, subscribe }
}
