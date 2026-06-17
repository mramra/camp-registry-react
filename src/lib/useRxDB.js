/**
 * useRxDB.js — Unified Data Hook
 * ════════════════════════════════════════════════════════
 * SQLite (PowerSync) = المصدر المحلي الوحيد للقراءة والكتابة
 * Supabase           = المصدر السحابي (يُجلب منه عند أول تحميل أو فشل SQLite)
 * Dexie تم إلغاؤها بالكامل من الاستخدام (لا تُستدعى من هنا أبداً)
 * ════════════════════════════════════════════════════════
 */
import { useCallback, useRef, useEffect } from 'react'
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

// أعمدة كل جدول في SQLite — لمنع "no such column" عند الإدراج
const TABLE_COLUMNS = {
  families: ['id','org_id','camp_id','head_name','head_id','head_gender','head_dob',
    'head_marital','head_chronic_diseases','head_disabilities','head_injuries',
    'head_female_status','head_orphan_status','head_orphan_cause','phone1','phone2',
    'tent','original_address','address_details','notes','status','economic_level',
    'version','created_by','updated_by','category_tags','registration_date','created_at','updated_at'],
  family_members: ['id','family_id','name','national_id','relation','dob','gender',
    'health','chronic_diseases','disabilities','injuries','orphan_status','notes',
    'created_at','updated_at'],
  camps: ['id','org_id','name','camp_type','parent_camp_id','manager_id','latitude',
    'longitude','address','capacity','status','notes','created_at','updated_at'],
  org_members: ['id','org_id','user_id','full_name','role','phone','camp_id',
    'can_add','can_edit','can_delete','can_export','can_import','is_active',
    'created_at','updated_at'],
  family_movements: ['id','org_id','family_id','movement_type','from_camp_id',
    'to_camp_id','reason','moved_by','moved_at','notes','created_at'],
  dist_rounds: ['id','org_id','name','description','status','start_date','end_date',
    'created_by','created_at','updated_at'],
  camp_distributions: ['id','org_id','round_id','camp_id','assigned_to','status',
    'notes','created_at','updated_at'],
  camp_dist_families: ['id','distribution_id','family_id','received','received_at',
    'received_by','notes'],
}

function prepareForSQLite(data, table) {
  const doc = { ...data }
  if (Array.isArray(doc.category_tags))
    doc.category_tags = JSON.stringify(doc.category_tags)
  // فلترة الحقول التي لا تخص هذا الجدول (تمنع SQL error)
  const allowed = TABLE_COLUMNS[table]
  if (allowed) {
    Object.keys(doc).forEach(k => { if (!allowed.includes(k)) delete doc[k] })
  }
  return doc
}

export function useRxDB() {
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
      } catch(e) { console.warn('[useRxDB] SQLite:', table, e.message) }
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
      } catch(e) { console.warn('[useRxDB] Supabase:', table, e.message) }
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

      const allowed = TABLE_COLUMNS[table]
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
          } catch(e) { console.warn(`[useRxDB] SQLite row ${table}:`, e.message) }
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
        console.warn(`[useRxDB] executeBatch ${table} فشلت، رجوع لصفاً-صفاً:`, e.message)
        // رجوع آمن: نفّذ صفاً صفاً لتحديد أي صف بالضبط يفشل بدل فقدان كل الدفعة
        for (let i = 0; i < valueSets.length; i++) {
          try { await db.execute(sql, valueSets[i]) }
          catch(rowErr) { console.warn(`[useRxDB] SQLite row ${table}[${i}]:`, rowErr.message) }
        }
      }
    } catch(e) { console.warn('[useRxDB] SQLite write:', table, e.message) }
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
