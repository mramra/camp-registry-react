/**
 * useLocalDB.js — Unified Data Hook
 * ════════════════════════════════════════════════════════
 * SQLite (PowerSync) = المصدر المحلي الوحيد للقراءة والكتابة
 * Supabase           = المصدر السحابي (يُجلب منه عند أول تحميل أو فشل SQLite)
 * لا يوجد أي مخزن محلي آخر — هذا الـhook هو الواجهة الموحّدة الوحيدة
 * لكل صفحات التطبيق للتعامل مع البيانات المحلية عبر SQLite/PowerSync فقط.
 * ════════════════════════════════════════════════════════
 */
import { useCallback, useRef, useEffect } from 'react'
import { useSyncStatus }   from '../context/PowerSyncContext'
import { supabase, ORG_ID } from './supabase'
import { TABLES, cleanForTable } from './schema'

const SUPABASE_TABLES = {
  families:          () => supabase.from('families').select('*').eq('org_id',ORG_ID),
  family_members:    () => supabase.from('family_members').select('*'),
  camps:             () => supabase.from('camps').select('*').eq('org_id',ORG_ID),
  org_members:       () => supabase.from('org_members').select('*').eq('org_id',ORG_ID),
  family_movements:  () => supabase.from('family_movements').select('*').eq('org_id',ORG_ID),
  dist_rounds:       () => supabase.from('dist_rounds').select('*').eq('org_id',ORG_ID),
  camp_distributions:() => supabase.from('camp_distributions').select('*').eq('org_id',ORG_ID),
  camp_dist_families:() => supabase.from('camp_dist_families').select('*'),
  page_permissions:  () => supabase.from('page_permissions').select('*').eq('org_id',ORG_ID),
}

function parseRow(row) {
  return {
    ...row,
    category_tags: row.category_tags
      ? (() => { try { return JSON.parse(row.category_tags) } catch { return [] } })()
      : (row.category_tags === undefined ? undefined : []),
  }
}

// أعمدة كل جدول: مصدرها الوحيد الآن schema.js (TABLES) — لا تكرار هنا

function prepareForSQLite(data, table) {
  let doc = { ...data }
  // أعمدة مخزّنة كنص JSON في كل من Postgres وSQLite (arrays/objects تُحوَّل لنص)
  const def = TABLES[table]
  const textifyKeys = [...(def?.jsonTextColumns || []), ...(def?.arrayColumns || [])]
  for (const k of textifyKeys) {
    if (Array.isArray(doc[k]) || (doc[k] && typeof doc[k] === 'object')) {
      doc[k] = JSON.stringify(doc[k])
    }
  }
  // فلترة الحقول التي لا تخص هذا الجدول (تمنع "no such column")
  return cleanForTable(table, doc)
}

export function useLocalDB() {
  const { psReady } = useSyncStatus()
  const psRef = useRef(psReady)
  useEffect(() => { psRef.current = psReady }, [psReady])

  // ── قراءة: SQLite → Supabase ──────────────────────────────
  // options: { limit, offset, orderBy } — جميعها اختيارية، التوافق مع الاستخدام القديم محفوظ بالكامل
  const query = useCallback(async (table, filters = {}, options = {}) => {
    const keys = Object.keys(filters)
    const { limit, offset, orderBy } = options

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
          if (orderBy) sql += ` ORDER BY ${orderBy}`
          if (limit)   sql += ` LIMIT ${Number(limit)}`
          if (offset)  sql += ` OFFSET ${Number(offset)}`
          const rows = await db.getAll(sql, params)
          if (rows?.length) return rows.map(parseRow)
          // إن لم يكن هناك pagination، فاضي يعني فعلاً فاضي — لا تسقط لـSupabase دون داعٍ
          if (!limit && !offset) {
            // استمر للتحقق من Supabase فقط في الحالة العادية (بدون صفحات)
          } else {
            return []
          }
        }
      } catch(e) { console.warn('[useLocalDB] SQLite:', table, e.message) }
    }

    // 2. Supabase (SQLite فارغ + اتصال متاح) — لا يُستخدم مع pagination محلية
    if (navigator.onLine && SUPABASE_TABLES[table] && !limit && !offset) {
      try {
        let q = SUPABASE_TABLES[table]()
        if (keys.length) keys.forEach(k => { q = q.eq(k, filters[k]) })
        const { data } = await q
        if (data?.length) {
          // احفظ في SQLite لتكون متاحة محلياً لاحقاً
          await bulkUpsertLocal(table, data)
          return data.map(parseRow)
        }
      } catch(e) { console.warn('[useLocalDB] Supabase:', table, e.message) }
    }

    return []
  }, [])

  // ── عدد السجلات المطابقة للفلتر (لإظهار إجمالي الصفحات) ──
  const count = useCallback(async (table, filters = {}) => {
    if (!psRef.current) return 0
    try {
      const { getPowerSync } = await import('./powersync')
      const db = getPowerSync()
      if (!db) return 0
      const keys = Object.keys(filters)
      let sql = `SELECT COUNT(*) as c FROM ${table}`
      const params = []
      if (keys.length) {
        sql += ' WHERE ' + keys.map(k => `${k} = ?`).join(' AND ')
        keys.forEach(k => params.push(filters[k]))
      }
      const rows = await db.getAll(sql, params)
      return rows?.[0]?.c || 0
    } catch { return 0 }
  }, [])

  // ── كتابة محلية: SQLite فقط — صفقة واحدة (executeBatch) ───
  async function bulkUpsertLocal(table, docs) {
    if (!docs?.length) return
    const now = new Date().toISOString()
    const prepared = docs.map(d => ({
      ...d, org_id: d.org_id || ORG_ID, updated_at: d.updated_at || now
    }))

    if (!psRef.current) return
    try {
      const { getPowerSync } = await import('./powersync')
      const db = getPowerSync()
      if (!db) return

      const allowed = TABLES[table]?.columns
      // إن لم تكن أعمدة الجدول معروفة، رجوع للسلوك القديم الآمن (صفاً صفاً)
      if (!allowed) {
        for (const doc of prepared) {
          try {
            const d = prepareForSQLite(doc, table)
            Object.keys(d).forEach(k => {
              if (d[k] !== null && typeof d[k] === 'object') d[k] = JSON.stringify(d[k])
              if (d[k] === undefined) d[k] = null
            })
            const cols = Object.keys(d)
            if (!cols.length) continue
            await db.execute(
              `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`,
              Object.values(d)
            )
          } catch(e) { console.warn(`[useLocalDB] SQLite row ${table}:`, e.message) }
        }
        return
      }

      // كل الصفوف بنفس ترتيب الأعمدة (allowed كاملة) — يسمح بدفعة واحدة عبر executeBatch
      const valueSets = prepared.map(doc => {
        const d = prepareForSQLite(doc, table)
        return allowed.map(col => {
          let v = d[col]
          if (v !== undefined && v !== null && typeof v === 'object') v = JSON.stringify(v)
          return v === undefined ? null : v
        })
      })

      const sql = `INSERT OR REPLACE INTO ${table} (${allowed.join(',')}) VALUES (${allowed.map(()=>'?').join(',')})`
      try {
        await db.executeBatch(sql, valueSets)
      } catch(e) {
        console.warn(`[useLocalDB] executeBatch ${table} فشلت، رجوع لصفاً-صفاً:`, e.message)
        // رجوع آمن: نفّذ صفاً صفاً لتحديد أي صف بالضبط يفشل بدل فقدان كل الدفعة
        for (let i = 0; i < valueSets.length; i++) {
          try { await db.execute(sql, valueSets[i]) }
          catch(rowErr) { console.warn(`[useLocalDB] SQLite row ${table}[${i}]:`, rowErr.message) }
        }
      }
    } catch(e) { console.warn('[useLocalDB] SQLite write:', table, e.message) }
  }

  const bulkUpsert = useCallback(bulkUpsertLocal, [])

  const upsert = useCallback(async (table, data) => {
    await bulkUpsertLocal(table, [data])
    return data
  }, [])

  const remove = useCallback(async (table, id) => {
    if (psRef.current) {
      try {
        const { getPowerSync } = await import('./powersync')
        const db = getPowerSync()
        if (db) await db.execute(`DELETE FROM ${table} WHERE id = ?`, [id])
      } catch {}
    }
  }, [])

  return { ready: psRef.current, query, count, upsert, bulkUpsert, remove }
}
