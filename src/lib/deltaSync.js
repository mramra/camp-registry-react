/**
 * deltaSync.js — مزامنة ذكية
 * كل 2.5 دقيقة:
 *   1. تجلب فقط ما updated_at > آخر_مزامنة (تغييرات فقط)
 *   2. تكتشف الحذف بمقارنة العدد
 *   3. إذا حُذفت أسرة → تحذف أسرة + أفرادها من SQLite
 *   4. تُطلق event "delta-sync" لإعادة تحميل الصفحة
 */
import { supabase, ORG_ID } from './supabase'

const LAST_KEY   = 'ds_last_sync'
const COUNTS_KEY = 'ds_counts'

// الجداول المتتبَّعة
const TABLES = [
  { name:'families',        orgId:true,  memberTable:false },
  { name:'family_members',  orgId:false, memberTable:true  },
  { name:'camps',           orgId:true,  memberTable:false },
  { name:'org_members',     orgId:true,  memberTable:false },
  { name:'family_movements',orgId:true,  memberTable:false },
]

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
}

async function getDb() {
  try {
    const { getPowerSync } = await import('./powersync')
    return getPowerSync()
  } catch { return null }
}

async function sqliteUpsert(db, table, docs) {
  if (!db || !docs?.length) return
  const allowed = TABLE_COLUMNS[table]
  for (const doc of docs) {
    try {
      const d = { ...doc }
      if (Array.isArray(d.category_tags)) d.category_tags = JSON.stringify(d.category_tags)
      if (allowed) Object.keys(d).forEach(k => { if (!allowed.includes(k)) delete d[k] })
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
    } catch(e) { console.warn(`[δSync] SQLite row ${table}:`, e.message) }
  }
}

async function sqliteGetAll(db, table) {
  if (!db) return []
  try { return await db.getAll(`SELECT * FROM ${table}`) } catch { return [] }
}

async function sqliteDeleteMany(db, table, ids) {
  if (!db || !ids?.length) return
  for (const id of ids) {
    try { await db.execute(`DELETE FROM ${table} WHERE id = ?`, [id]) } catch {}
  }
}

function baseQuery(table, orgId) {
  let q = supabase.from(table).select('*')
  if (orgId) q = q.eq('org_id', ORG_ID)
  return q
}

export async function deltaSync() {
  if (!navigator.onLine) return 0
  const db = await getDb()
  if (!db) return 0

  const lastSync = localStorage.getItem(LAST_KEY) || '2000-01-01T00:00:00Z'
  const now      = new Date().toISOString()
  const stored   = JSON.parse(localStorage.getItem(COUNTS_KEY) || '{}')

  let totalChanges = 0
  const deletedFamilyIds = [] // لتتبع الأسر المحذوفة

  for (const { name, orgId, memberTable } of TABLES) {
    try {
      // ── 1. جلب التغييرات الجديدة/المعدّلة ──────────────
      let q = baseQuery(name, orgId).gt('updated_at', lastSync)
      const { data: changed, error } = await q
      if (!error && changed?.length) {
        await sqliteUpsert(db, name, changed)
        totalChanges += changed.length
        console.log(`[δSync] ${name}: +${changed.length} تغيير`)
      }

      // ── 2. كشف الحذف بمقارنة العدد ──────────────────────
      let cntQ = supabase.from(name).select('*', { count:'exact', head:true })
      if (orgId) cntQ = cntQ.eq('org_id', ORG_ID)
      const { count } = await cntQ

      if (count !== null) {
        const prev = stored[name]
        if (prev !== undefined && count < prev) {
          // حُذف شيء — نجلب كل IDs من السيرفر ونقارن بـ SQLite
          let idsQ = supabase.from(name).select('id')
          if (orgId) idsQ = idsQ.eq('org_id', ORG_ID)
          const { data: serverRecs } = await idsQ

          if (serverRecs) {
            const serverIds = new Set(serverRecs.map(r => r.id))
            const localRecs = await sqliteGetAll(db, name)
            const toDelete  = localRecs.filter(r => !serverIds.has(r.id)).map(r => r.id)

            if (toDelete.length) {
              await sqliteDeleteMany(db, name, toDelete)
              totalChanges += toDelete.length
              console.log(`[δSync] ${name}: -${toDelete.length} محذوف`)

              // تتبع الأسر المحذوفة لحذف أفرادها
              if (name === 'families') {
                deletedFamilyIds.push(...toDelete)
              }
            }
          }
        }
        stored[name] = count
      }
    } catch(e) {
      console.warn(`[δSync] ${name}:`, e.message)
    }
  }

  // ── 3. حذف أفراد الأسر المحذوفة ─────────────────────────
  if (deletedFamilyIds.length) {
    try {
      for (const famId of deletedFamilyIds) {
        const mems = await db.getAll(`SELECT id FROM family_members WHERE family_id = ?`, [famId]).catch(() => [])
        if (mems.length) {
          await sqliteDeleteMany(db, 'family_members', mems.map(m => m.id))
          console.log(`[δSync] family_members: -${mems.length} لأسرة ${famId}`)
          totalChanges += mems.length
        }
      }
    } catch(e) {
      console.warn('[δSync] family_members cleanup:', e.message)
    }
  }

  // ── 4. حفظ آخر وقت مزامنة والأعداد ─────────────────────
  localStorage.setItem(LAST_KEY,   now)
  localStorage.setItem(COUNTS_KEY, JSON.stringify(stored))

  // ── 5. أطلق event لتحديث الواجهة ─────────────────────────
  if (totalChanges > 0) {
    window.dispatchEvent(new CustomEvent('delta-sync', { detail: { changes: totalChanges } }))
    console.log(`[δSync] ✅ ${totalChanges} تغيير — UI مُحدَّث`)
  }

  return totalChanges
}

// عند تسجيل الدخول — أعد ضبط التوقيت
export function resetDeltaSync() {
  localStorage.removeItem(LAST_KEY)
  localStorage.removeItem(COUNTS_KEY)
}
