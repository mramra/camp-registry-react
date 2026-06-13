import { useState, useEffect, useRef, useCallback } from 'react'
import { getDB, pushToPostgres } from './rxdb'
import { ORG_ID } from './supabase'

// singleton — db مشترك بين كل الـ hooks
let _globalDB = null
const _listeners = new Set()

function notifyReady(db) {
  _globalDB = db
  _listeners.forEach(fn => fn(db))
}

getDB().then(db => {
  notifyReady(db)
}).catch(e => console.warn('[useRxDB global init]', e))

export function useRxDB() {
  const [db, setDb] = useState(_globalDB)

  useEffect(() => {
    if (_globalDB) { setDb(_globalDB); return }
    const fn = (db) => setDb(db)
    _listeners.add(fn)
    return () => _listeners.delete(fn)
  }, [])

  // قراءة كل سجلات collection
  const query = useCallback(async (collection, filters = {}) => {
    const d = _globalDB || db
    if (!d?.[collection]) return []
    try {
      const selector = {}
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null) selector[k] = { $eq: v }
      })
      const q = Object.keys(selector).length
        ? d[collection].find({ selector })
        : d[collection].find()
      const docs = await q.exec()
      return docs.map(doc => doc.toJSON())
    } catch(e) {
      console.warn('[query]', collection, e.message)
      return []
    }
  }, [db])

  // إضافة/تحديث — محلي أولاً + PostgreSQL في الخلفية
  const upsert = useCallback(async (collection, data) => {
    const d = _globalDB || db
    if (!d?.[collection]) return data
    const now = new Date().toISOString()
    const doc = { ...data, _deleted: false,
      updated_at: data.updated_at || now,
      org_id: data.org_id || ORG_ID }
    try { await d[collection].upsert(doc) }
    catch(e) { console.warn('[upsert]', collection, e.message) }
    pushToPostgres(collection, 'upsert', doc).catch(() => {})
    return doc
  }, [db])

  // إضافة/تحديث عدة سجلات
  const bulkUpsert = useCallback(async (collection, docs) => {
    const d = _globalDB || db
    if (!d?.[collection] || !docs?.length) return
    const now = new Date().toISOString()
    const prepared = docs.map(doc => ({
      ...doc, _deleted: false,
      updated_at: doc.updated_at || now,
      org_id: doc.org_id || ORG_ID,
    }))
    try { await d[collection].bulkUpsert(prepared) }
    catch {
      await Promise.allSettled(
        prepared.map(doc => d[collection].upsert(doc).catch(() => {}))
      )
    }
    // لا نرفع لـ PostgreSQL هنا — هذا للبيانات المحلية القادمة من Supabase
  }, [db])

  // حذف سجل
  const remove = useCallback(async (collection, id) => {
    const d = _globalDB || db
    if (!d?.[collection]) return
    try {
      const doc = await d[collection].findOne(id).exec()
      if (doc) await doc.remove()
    } catch(e) { console.warn('[remove]', e.message) }
    pushToPostgres(collection, 'delete', { id }).catch(() => {})
  }, [db])

  // اشتراك reactive في التغييرات
  const subscribe = useCallback((collection, callback, filters = {}) => {
    const d = _globalDB || db
    if (!d?.[collection]) return () => {}
    const selector = {}
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined) selector[k] = { $eq: v }
    })
    const q = Object.keys(selector).length
      ? d[collection].find({ selector })
      : d[collection].find()
    const sub = q.$.subscribe(docs => callback(docs.map(doc => doc.toJSON())))
    return () => sub.unsubscribe()
  }, [db])

  return { db, ready: !!db, query, upsert, bulkUpsert, remove, subscribe }
}
