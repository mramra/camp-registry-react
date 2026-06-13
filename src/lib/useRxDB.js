import { useState, useEffect, useRef, useCallback } from 'react'
import { getDB, pushToPostgres } from './rxdb'
import { ORG_ID } from './supabase'

export function useRxDB() {
  const dbRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    getDB().then(db => {
      dbRef.current = db
      setReady(true)
    }).catch(e => console.warn('[useRxDB init]', e))
  }, [])

  // قراءة كل سجلات collection
  const query = useCallback(async (collection, filters = {}) => {
    const db = dbRef.current
    if (!db?.[collection]) return []
    try {
      const selector = {}
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null) selector[k] = { $eq: v }
      })
      const q = Object.keys(selector).length
        ? db[collection].find({ selector })
        : db[collection].find()
      const docs = await q.exec()
      return docs.map(d => d.toJSON())
    } catch(e) {
      console.warn('[useRxDB query]', collection, e.message)
      return []
    }
  }, [])

  // إضافة/تحديث سجل — محلياً + PostgreSQL
  const upsert = useCallback(async (collection, data) => {
    const db = dbRef.current
    if (!db?.[collection]) return null
    const now = new Date().toISOString()
    const doc = {
      ...data,
      _deleted: false,
      updated_at: now,
      org_id: data.org_id || ORG_ID,
    }
    // 1. حفظ محلي فوراً
    try { await db[collection].upsert(doc) } catch(e) { console.warn('[upsert local]', e.message) }
    // 2. رفع لـ PostgreSQL في الخلفية
    const table = collection.replace(/_/g, '_') // نفس الاسم
    pushToPostgres(table, 'upsert', doc).catch(()=>{})
    return doc
  }, [])

  // إضافة/تحديث عدة سجلات
  const bulkUpsert = useCallback(async (collection, docs) => {
    const db = dbRef.current
    if (!db?.[collection] || !docs?.length) return
    const now = new Date().toISOString()
    const prepared = docs.map(d => ({
      ...d, _deleted: false,
      updated_at: d.updated_at || now,
      org_id: d.org_id || ORG_ID,
    }))
    // 1. محلي
    try {
      await db[collection].bulkUpsert(prepared)
    } catch(e) {
      await Promise.allSettled(prepared.map(d => db[collection].upsert(d).catch(()=>{})))
    }
    // 2. PostgreSQL في الخلفية
    const table = collection
    pushToPostgres(table, 'upsert', prepared).catch(()=>{})
  }, [])

  // حذف سجل
  const remove = useCallback(async (collection, id) => {
    const db = dbRef.current
    if (!db?.[collection]) return
    try {
      const doc = await db[collection].findOne(id).exec()
      if (doc) await doc.remove()
    } catch(e) { console.warn('[remove]', e.message) }
    pushToPostgres(collection, 'delete', { id }).catch(()=>{})
  }, [])

  // اشتراك reactif في تغييرات
  const subscribe = useCallback((collection, callback, filters = {}) => {
    const db = dbRef.current
    if (!db?.[collection]) return () => {}
    const selector = {}
    Object.entries(filters).forEach(([k,v]) => {
      if (v !== undefined) selector[k] = { $eq: v }
    })
    const q = Object.keys(selector).length
      ? db[collection].find({ selector })
      : db[collection].find()
    const sub = q.$.subscribe(docs => callback(docs.map(d => d.toJSON())))
    return () => sub.unsubscribe()
  }, [])

  return { db: dbRef.current, ready, query, upsert, bulkUpsert, remove, subscribe }
}
