/**
 * useRxDB.js — Unified Data Hook
 * الأولوية: SQLite (PowerSync) → Dexie → Supabase
 * الكتابة: SQLite أولاً + Dexie كـ mirror
 */
import { useCallback, useRef, useEffect } from 'react'
import { localDB }         from './db'
import { useSyncStatus }   from '../context/PowerSyncContext'
import { supabase, ORG_ID } from './supabase'

const SUPABASE_TABLES = {
  families:          () => supabase.from('families').select('*').eq('org_id',ORG_ID),
  family_members:    () => supabase.from('family_members').select('*'),
  camps:             () => supabase.from('camps').select('*').eq('org_id',ORG_ID),
  org_members:       () => supabase.from('org_members').select('*').eq('org_id',ORG_ID),
  family_movements:  () => supabase.from('family_movements').select('*').eq('org_id',ORG_ID),
  dist_rounds:       () => supabase.from('dist_rounds').select('*').eq('org_id',ORG_ID),
  camp_distributions:() => supabase.from('camp_distributions').select('*').eq('org_id',ORG_ID),
  camp_dist_families:() => supabase.from('camp_dist_families').select('*'),
}

function parseRow(row) {
  return {
    ...row,
    category_tags: row.category_tags
      ? (() => { try { return JSON.parse(row.category_tags) } catch { return [] } })()
      : (row.category_tags === undefined ? undefined : []),
  }
}

function prepareForSQLite(data) {
  const doc = { ...data }
  if (Array.isArray(doc.category_tags))
    doc.category_tags = JSON.stringify(doc.category_tags)
  return doc
}

export function useRxDB() {
  const { psReady } = useSyncStatus()
  const psRef = useRef(psReady)
  useEffect(() => { psRef.current = psReady }, [psReady])

  // ── قراءة: SQLite → Dexie → Supabase ─────────────────────
  const query = useCallback(async (table, filters = {}) => {
    const keys = Object.keys(filters)

    // 1. SQLite (PowerSync)
    if (psRef.current) {
      try {
        const { getPowerSync } = await import('./powersync')
        const db = getPowerSync()
        if (db) {
          let sql = `SELECT * FROM ${table}`
          const params = []
          if (keys.length) {
            sql += ' WHERE ' + keys.map(k => `${k} = ?`).join(' AND ')
            keys.forEach(k => params.push(filters[k]))
          }
          const rows = await db.getAll(sql, params)
          if (rows?.length) return rows.map(parseRow)
        }
      } catch(e) { console.warn('[useRxDB] SQLite:', table, e.message) }
    }

    // 2. Dexie (fallback)
    try {
      let all = await localDB[table]?.toArray?.() || []
      if (keys.length) all = all.filter(r => keys.every(k => r[k] === filters[k]))
      if (all.length) return all.map(parseRow)
    } catch {}

    // 3. Supabase (فارغ محلي + اتصال)
    if (navigator.onLine && SUPABASE_TABLES[table]) {
      try {
        let q = SUPABASE_TABLES[table]()
        if (keys.length) keys.forEach(k => { q = q.eq(k, filters[k]) })
        const { data } = await q
        if (data?.length) {
          // احفظ في SQLite + Dexie
          await bulkUpsertLocal(table, data)
          return data.map(parseRow)
        }
      } catch(e) { console.warn('[useRxDB] Supabase:', table, e.message) }
    }

    return []
  }, [])

  // ── كتابة محلية: SQLite + Dexie ──────────────────────────
  async function bulkUpsertLocal(table, docs) {
    if (!docs?.length) return
    const now = new Date().toISOString()
    const prepared = docs.map(d => ({
      ...d, org_id: d.org_id || ORG_ID, updated_at: d.updated_at || now
    }))

    // SQLite
    if (psRef.current) {
      try {
        const { getPowerSync } = await import('./powersync')
        const db = getPowerSync()
        if (db) {
          await db.writeTransaction(async tx => {
            for (const doc of prepared) {
              const d = prepareForSQLite(doc)
              const cols = Object.keys(d)
              await tx.execute(
                `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`,
                Object.values(d)
              )
            }
          })
        }
      } catch(e) { console.warn('[useRxDB] SQLite write:', table, e.message) }
    }

    // Dexie (mirror)
    try {
      await localDB[table]?.bulkPut?.(prepared).catch(() => {})
    } catch {}
  }

  const bulkUpsert = useCallback(bulkUpsertLocal, [])

  const upsert = useCallback(async (table, data) => {
    await bulkUpsertLocal(table, [data])
    return data
  }, [])

  const remove = useCallback(async (table, id) => {
    // SQLite
    if (psRef.current) {
      try {
        const { getPowerSync } = await import('./powersync')
        const db = getPowerSync()
        if (db) await db.execute(`DELETE FROM ${table} WHERE id = ?`, [id])
      } catch {}
    }
    // Dexie
    try { await localDB[table]?.delete?.(id) } catch {}
  }, [])

  return { ready: psRef.current, query, upsert, bulkUpsert, remove }
}
