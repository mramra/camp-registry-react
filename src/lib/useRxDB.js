/**
 * useRxDB.js — Unified Data Hook
 * ────────────────────────────────────────────────────────────
 * الأولوية: PowerSync SQLite (عند الاتصال) → Dexie (احتياطي)
 *
 * يوفر نفس الـ API للصفحات بدون تغيير:
 *   const { query, upsert, bulkUpsert, remove } = useRxDB()
 */
import { useCallback, useRef, useEffect } from 'react'
import { localDB } from './db'
import { getPowerSync } from './powersync'
import { useSyncStatus } from '../context/PowerSyncContext'
import { ORG_ID } from './supabase'

// ── تحويل صف من SQLite → كائن JavaScript ──────────────────
function parseRow(row) {
  return {
    ...row,
    category_tags: row.category_tags
      ? (() => { try { return JSON.parse(row.category_tags) } catch { return [] } })()
      : (row.category_tags === undefined ? undefined : []),
  }
}

// ── تجهيز doc للكتابة (category_tags → JSON string) ────────
function prepareDoc(data, now) {
  const doc = {
    ...data,
    org_id:     data.org_id || ORG_ID,
    updated_at: now,
  }
  if (data.category_tags !== undefined) {
    doc.category_tags = Array.isArray(data.category_tags)
      ? JSON.stringify(data.category_tags)
      : data.category_tags
  }
  return doc
}

export function useRxDB() {
  const { psReady } = useSyncStatus()

  // ref لتجنب re-create الـ callbacks عند كل تغيير psReady
  const psRef = useRef(psReady)
  useEffect(() => { psRef.current = psReady }, [psReady])

  // ── قراءة ──────────────────────────────────────────────
  const query = useCallback(async (table, filters = {}) => {
    // أولاً: PowerSync SQLite
    if (psRef.current) {
      try {
        const db     = getPowerSync()
        const keys   = Object.keys(filters)
        let sql      = `SELECT * FROM ${table}`
        const params = []
        if (keys.length) {
          sql += ' WHERE ' + keys.map(k => `${k} = ?`).join(' AND ')
          keys.forEach(k => params.push(filters[k]))
        }
        const rows = await db.getAll(sql, params)
        // إذا PowerSync أرجع بيانات → استخدمها
        if (rows && rows.length > 0) return rows.map(parseRow)
        // إذا فارغة → قد يكون SQLite غير محفوظ (Android بدون COOP/COEP) → جرب Dexie
        console.warn('[useRxDB] PS empty for', table, '— trying Dexie fallback')
      } catch(e) {
        console.warn('[useRxDB] PS query failed, fallback Dexie:', table, e.message)
      }
    }
    // احتياطي: Dexie
    try {
      const all  = await localDB[table].toArray()
      const keys = Object.keys(filters)
      return keys.length
        ? all.filter(item => keys.every(k => item[k] === filters[k]))
        : all
    } catch(e) {
      console.warn('[useRxDB] Dexie query error:', table, e.message)
      return []
    }
  }, [])

  // ── كتابة / تحديث سجل واحد ─────────────────────────────
  const upsert = useCallback(async (table, data) => {
    const now = new Date().toISOString()
    const doc = prepareDoc(data, now)

    // أولاً: PowerSync (يُعلّم CRUD → uploadData → Supabase تلقائياً)
    if (psRef.current) {
      try {
        const db   = getPowerSync()
        const cols = Object.keys(doc)
        await db.execute(
          `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
          Object.values(doc)
        )
        return { ...data, org_id: doc.org_id, updated_at: now }
      } catch(e) {
        console.warn('[useRxDB] PS upsert failed, fallback Dexie:', table, e.message)
      }
    }
    // احتياطي: Dexie
    try {
      await localDB[table]?.put(doc)
      return doc
    } catch(e) {
      console.warn('[useRxDB] Dexie upsert error:', table, e.message)
      return data
    }
  }, [])

  // ── كتابة / تحديث مجموعة سجلات ────────────────────────
  const bulkUpsert = useCallback(async (table, docs) => {
    if (!docs?.length) return
    const now = new Date().toISOString()

    // أولاً: PowerSync (transaction → أفضل أداء)
    if (psRef.current) {
      try {
        const db = getPowerSync()
        await db.writeTransaction(async tx => {
          for (const data of docs) {
            const doc  = prepareDoc(data, data.updated_at || now)
            const cols = Object.keys(doc)
            await tx.execute(
              `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
              Object.values(doc)
            )
          }
        })
        return
      } catch(e) {
        console.warn('[useRxDB] PS bulkUpsert failed, fallback Dexie:', table, e.message)
      }
    }
    // احتياطي: Dexie
    try {
      await localDB[table]?.bulkPut(docs.map(d => ({
        ...d,
        org_id:     d.org_id || ORG_ID,
        updated_at: d.updated_at || now,
      })))
    } catch(e) {
      console.warn('[useRxDB] Dexie bulkUpsert error:', table, e.message)
    }
  }, [])

  // ── حذف سجل ────────────────────────────────────────────
  const remove = useCallback(async (table, id) => {
    // أولاً: PowerSync
    if (psRef.current) {
      try {
        const db = getPowerSync()
        await db.execute(`DELETE FROM ${table} WHERE id = ?`, [id])
        return
      } catch(e) {
        console.warn('[useRxDB] PS remove failed, fallback Dexie:', table, e.message)
      }
    }
    // احتياطي: Dexie
    try {
      await localDB[table]?.delete(id)
    } catch(e) {
      console.warn('[useRxDB] Dexie remove error:', table, e.message)
    }
  }, [])

  return { ready: true, query, upsert, bulkUpsert, remove }
}
