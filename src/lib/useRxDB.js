/**
 * useRxDB.js — Unified Data Hook
 * الأولوية: PowerSync SQLite → Dexie → Supabase (عند الفراغ + اتصال)
 */
import { useCallback, useRef, useEffect } from 'react'
import { localDB } from './db'
import { getPowerSync } from './powersync'
import { useSyncStatus } from '../context/PowerSyncContext'
import { supabase, ORG_ID } from './supabase'

// الجداول التي يمكن الرجوع لـ Supabase لها
const SUPABASE_TABLES = {
  families:         () => supabase.from('families').select('*').eq('org_id', ORG_ID),
  family_members:   () => supabase.from('family_members').select('*'),
  camps:            () => supabase.from('camps').select('*').eq('org_id', ORG_ID),
  org_members:      () => supabase.from('org_members').select('*').eq('org_id', ORG_ID),
  family_movements: () => supabase.from('family_movements').select('*').eq('org_id', ORG_ID),
  dist_rounds:      () => supabase.from('dist_rounds').select('*').eq('org_id', ORG_ID),
  camp_distributions:  () => supabase.from('camp_distributions').select('*').eq('org_id', ORG_ID),
  camp_dist_families:  () => supabase.from('camp_dist_families').select('*'),
}

function parseRow(row) {
  return {
    ...row,
    category_tags: row.category_tags
      ? (() => { try { return JSON.parse(row.category_tags) } catch { return [] } })()
      : (row.category_tags === undefined ? undefined : []),
  }
}

function prepareDoc(data, now) {
  const doc = { ...data, org_id: data.org_id || ORG_ID, updated_at: now }
  if (data.category_tags !== undefined) {
    doc.category_tags = Array.isArray(data.category_tags)
      ? JSON.stringify(data.category_tags) : data.category_tags
  }
  return doc
}

export function useRxDB() {
  const { psReady } = useSyncStatus()
  const psRef = useRef(psReady)
  useEffect(() => { psRef.current = psReady }, [psReady])

  // ── قراءة: PowerSync → Dexie → Supabase ──────────────────
  const query = useCallback(async (table, filters = {}) => {
    const keys   = Object.keys(filters)
    const applyFilter = (rows) => {
      const parsed = rows.map(parseRow)
      return keys.length ? parsed.filter(r => keys.every(k => r[k] === filters[k])) : parsed
    }

    // 1. PowerSync SQLite
    if (psRef.current) {
      try {
        const db = getPowerSync()
        let sql = `SELECT * FROM ${table}`
        const params = []
        if (keys.length) {
          sql += ' WHERE ' + keys.map(k => `${k} = ?`).join(' AND ')
          keys.forEach(k => params.push(filters[k]))
        }
        const rows = await db.getAll(sql, params)
        if (rows && rows.length > 0) return rows.map(parseRow)
      } catch(e) { console.warn('[useRxDB] PS:', table, e.message) }
    }

    // 2. Dexie
    try {
      const all = await localDB[table]?.toArray?.() || []
      if (all.length > 0) return applyFilter(all)
    } catch {}

    // 3. Supabase مباشرة (عند فراغ المحلي + اتصال)
    if (navigator.onLine && SUPABASE_TABLES[table]) {
      try {
        let q = SUPABASE_TABLES[table]()
        if (keys.length) keys.forEach(k => { q = q.eq(k, filters[k]) })
        const { data } = await q
        if (data?.length) {
          // احفظ في Dexie للمرة القادمة
          localDB[table]?.bulkPut?.(data).catch(() => {})
          return data.map(parseRow)
        }
      } catch(e) { console.warn('[useRxDB] Supabase fallback:', table, e.message) }
    }

    return []
  }, [])

  // ── كتابة ────────────────────────────────────────────────
  const upsert = useCallback(async (table, data) => {
    const now = new Date().toISOString()
    const doc = prepareDoc(data, now)

    if (psRef.current) {
      try {
        const db = getPowerSync()
        const cols = Object.keys(doc)
        await db.execute(
          `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
          Object.values(doc)
        )
        return { ...data, org_id: doc.org_id, updated_at: now }
      } catch(e) { console.warn('[useRxDB] PS upsert:', table, e.message) }
    }

    try { await localDB[table]?.put?.(doc) } catch {}

    // كتابة Supabase مباشرة إذا أوف لاين fallback
    if (navigator.onLine) {
      supabase.from(table).upsert(doc).then(({ error }) => {
        if (error) console.warn('[useRxDB] Supabase upsert:', error.message)
      })
    }
    return doc
  }, [])

  // ── كتابة مجمّعة ─────────────────────────────────────────
  const bulkUpsert = useCallback(async (table, docs) => {
    if (!docs?.length) return
    const now = new Date().toISOString()

    if (psRef.current) {
      try {
        const db = getPowerSync()
        await db.writeTransaction(async tx => {
          for (const data of docs) {
            const doc = prepareDoc(data, data.updated_at || now)
            const cols = Object.keys(doc)
            await tx.execute(
              `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
              Object.values(doc)
            )
          }
        })
        return
      } catch(e) { console.warn('[useRxDB] PS bulkUpsert:', table, e.message) }
    }

    try {
      await localDB[table]?.bulkPut?.(
        docs.map(d => ({ ...d, org_id: d.org_id || ORG_ID, updated_at: d.updated_at || now }))
      )
    } catch {}
  }, [])

  // ── حذف ──────────────────────────────────────────────────
  const remove = useCallback(async (table, id) => {
    if (psRef.current) {
      try {
        await getPowerSync().execute(`DELETE FROM ${table} WHERE id = ?`, [id])
        return
      } catch(e) { console.warn('[useRxDB] PS remove:', table, e.message) }
    }
    try { await localDB[table]?.delete?.(id) } catch {}
  }, [])

  return { ready: true, query, upsert, bulkUpsert, remove }
}
