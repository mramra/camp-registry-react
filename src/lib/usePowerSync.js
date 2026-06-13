/**
 * usePowerSync — hook للقراءة والكتابة عبر PowerSync
 * نفس الـ API الذي تستخدمه الصفحات (query/upsert/bulkUpsert/remove)
 */
import { useCallback } from 'react'
import { getPowerSync } from './powersync'
import { ORG_ID } from './supabase'

export function usePowerSync() {

  // قراءة سجلات من SQLite المحلي
  const query = useCallback(async (table, filters = {}) => {
    const db = getPowerSync()
    try {
      let sql  = `SELECT * FROM ${table}`
      const params = []
      const keys = Object.keys(filters)
      if (keys.length) {
        sql += ' WHERE ' + keys.map(k => `${k} = ?`).join(' AND ')
        keys.forEach(k => params.push(filters[k]))
      }
      const result = await db.getAll(sql, params)
      // category_tags مخزنة كـ JSON string — نحوّلها
      return result.map(row => ({
        ...row,
        category_tags: row.category_tags
          ? (() => { try { return JSON.parse(row.category_tags) } catch { return [] } })()
          : [],
      }))
    } catch(e) {
      console.warn('[PS query]', table, e.message)
      return []
    }
  }, [])

  // إضافة/تحديث سجل
  const upsert = useCallback(async (table, data) => {
    const db = getPowerSync()
    try {
      const doc = {
        ...data,
        org_id:     data.org_id || ORG_ID,
        updated_at: new Date().toISOString(),
        // category_tags → JSON string للتخزين
        ...(data.category_tags !== undefined && {
          category_tags: Array.isArray(data.category_tags)
            ? JSON.stringify(data.category_tags)
            : data.category_tags
        }),
      }
      await db.execute(
        `INSERT OR REPLACE INTO ${table} (${Object.keys(doc).join(',')}) VALUES (${Object.keys(doc).map(()=>'?').join(',')})`,
        Object.values(doc)
      )
      return { ...data, org_id: doc.org_id, updated_at: doc.updated_at }
    } catch(e) {
      console.warn('[PS upsert]', table, e.message)
      return data
    }
  }, [])

  // إضافة/تحديث عدة سجلات
  const bulkUpsert = useCallback(async (table, docs) => {
    if (!docs?.length) return
    const db = getPowerSync()
    const now = new Date().toISOString()
    // SQLite يعمل أفضل مع transactions
    await db.writeTransaction(async tx => {
      for (const data of docs) {
        const doc = {
          ...data,
          org_id:     data.org_id || ORG_ID,
          updated_at: data.updated_at || now,
          ...(data.category_tags !== undefined && {
            category_tags: Array.isArray(data.category_tags)
              ? JSON.stringify(data.category_tags)
              : data.category_tags
          }),
        }
        await tx.execute(
          `INSERT OR REPLACE INTO ${table} (${Object.keys(doc).join(',')}) VALUES (${Object.keys(doc).map(()=>'?').join(',')})`,
          Object.values(doc)
        )
      }
    }).catch(e => console.warn('[PS bulkUpsert]', table, e.message))
  }, [])

  // حذف سجل
  const remove = useCallback(async (table, id) => {
    const db = getPowerSync()
    try {
      await db.execute(`DELETE FROM ${table} WHERE id = ?`, [id])
    } catch(e) {
      console.warn('[PS remove]', table, e.message)
    }
  }, [])

  return { ready: true, query, upsert, bulkUpsert, remove }
}
