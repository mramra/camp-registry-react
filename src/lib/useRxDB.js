import { useState, useEffect, useRef, useCallback } from 'react'
import { getDB } from './rxdb'
import { ORG_ID } from './supabase'

/**
 * useRxDB — hook يوفر واجهة مشابهة لـ localDB لكن باستخدام RxDB
 * يستبدل: localDB.families.toArray() → db.families.find().exec()
 */
export function useRxDB() {
  const dbRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    getDB().then(db => {
      dbRef.current = db
      setReady(true)
    }).catch(e => console.warn('[useRxDB]', e))
  }, [])

  /**
   * قراءة جميع سجلات collection مع فلتر اختياري
   * مثال: await query('families', { org_id: ORG_ID })
   */
  const query = useCallback(async (collection, filters = {}) => {
    const db = dbRef.current
    if (!db?.[collection]) return []
    try {
      let q = db[collection].find()
      // تطبيق الفلاتر
      const selector = {}
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null) selector[k] = { $eq: v }
      })
      if (Object.keys(selector).length) q = db[collection].find({ selector })
      const docs = await q.exec()
      return docs.map(d => d.toJSON())
    } catch(e) {
      console.warn('[useRxDB query]', collection, e)
      return []
    }
  }, [])

  /**
   * إضافة أو تحديث سجل
   */
  const upsert = useCallback(async (collection, data) => {
    const db = dbRef.current
    if (!db?.[collection]) return null
    try {
      const doc = await db[collection].upsert({
        ...data,
        _deleted: false,
        updated_at: data.updated_at || new Date().toISOString(),
      })
      return doc.toJSON()
    } catch(e) {
      console.warn('[useRxDB upsert]', collection, e)
      return null
    }
  }, [])

  /**
   * إضافة أو تحديث عدة سجلات
   */
  const bulkUpsert = useCallback(async (collection, docs) => {
    const db = dbRef.current
    if (!db?.[collection] || !docs.length) return
    try {
      const now = new Date().toISOString()
      await db[collection].bulkUpsert(
        docs.map(d => ({ ...d, _deleted: false, updated_at: d.updated_at || now }))
      )
    } catch(e) {
      console.warn('[useRxDB bulkUpsert]', collection, e)
    }
  }, [])

  /**
   * حذف سجل (soft delete)
   */
  const remove = useCallback(async (collection, id) => {
    const db = dbRef.current
    if (!db?.[collection]) return
    try {
      const doc = await db[collection].findOne(id).exec()
      if (doc) await doc.remove()
    } catch(e) {
      console.warn('[useRxDB remove]', collection, e)
    }
  }, [])

  /**
   * الاشتراك في تغييرات collection (reactive)
   */
  const subscribe = useCallback((collection, callback, filters = {}) => {
    const db = dbRef.current
    if (!db?.[collection]) return () => {}
    const selector = {}
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined) selector[k] = { $eq: v }
    })
    let q = db[collection].find()
    if (Object.keys(selector).length) q = db[collection].find({ selector })
    const sub = q.$.subscribe(docs => {
      callback(docs.map(d => d.toJSON()))
    })
    return () => sub.unsubscribe()
  }, [])

  return { db: dbRef.current, ready, query, upsert, bulkUpsert, remove, subscribe }
}
