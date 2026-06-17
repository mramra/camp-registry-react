/**
 * syncAll.js — Supabase → SQLite
 */
import { supabase, ORG_ID } from './supabase'

const TABLES = [
  { name:'families',           orgId:true  },
  { name:'camps',              orgId:true  },
  { name:'org_members',        orgId:true  },
  { name:'family_movements',   orgId:true  },
  { name:'dist_rounds',        orgId:true  },
  { name:'camp_distributions', orgId:true  },
  { name:'family_members',     orgId:false },
  { name:'camp_dist_families', orgId:false },
]

async function getDb() {
  try {
    const { getPowerSync } = await import('./powersync')
    return getPowerSync()
  } catch { return null }
}

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

async function writeToSQLite(db, table, docs) {
  if (!db || !docs?.length) return
  const allowed = TABLE_COLUMNS[table]
  let ok = 0, fail = 0
  const failReasons = {}

  // كل صف في معاملة مستقلة — فشل صف لا يُسقط الباقي
  for (const doc of docs) {
    try {
      const d = { ...doc }
      if (Array.isArray(d.category_tags)) d.category_tags = JSON.stringify(d.category_tags)
      // حوّل القيم غير المدعومة (objects/arrays) لنصوص
      Object.keys(d).forEach(k => {
        if (d[k] !== null && typeof d[k] === 'object') d[k] = JSON.stringify(d[k])
        if (d[k] === undefined) d[k] = null
      })
      // فلترة الحقول غير المعروفة
      if (allowed) Object.keys(d).forEach(k => { if (!allowed.includes(k)) delete d[k] })
      const cols = Object.keys(d)
      if (!cols.length) { fail++; continue }

      await db.execute(
        `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`,
        Object.values(d)
      )
      ok++
    } catch(e) {
      fail++
      const reason = e.message?.slice(0, 60) || 'unknown'
      failReasons[reason] = (failReasons[reason] || 0) + 1
    }
  }

  if (fail > 0) {
    console.warn(`[syncAll] ${table}: ✅${ok} ❌${fail} — الأسباب:`, JSON.stringify(failReasons))
  } else {
    console.log(`[syncAll] ${table}: كتب ${ok} صف في SQLite`)
  }
}

export async function quickSync() {
  if (!navigator.onLine) return
  console.log('[sync] بدء المزامنة الكاملة...')
  const db = await getDb()

  for (const { name, orgId } of TABLES) {
    try {
      let q = supabase.from(name).select('*')
      if (orgId) q = q.eq('org_id', ORG_ID)
      const { data } = await q
      if (!data?.length) continue

      await writeToSQLite(db, name, data)
      console.log(`[sync] ${name}: ${data.length}`)
    } catch(e) { console.warn('[sync]', name, e.message) }
  }

  // أفراد الأسر
  let famIds = []
  try { famIds = (await db?.getAll?.(`SELECT id FROM families`) || []).map(f=>f.id) } catch {}
  if (famIds.length) {
    const BATCH = 500
    let allMems = []
    for (let i=0; i<famIds.length; i+=BATCH) {
      const { data } = await supabase.from('family_members').select('*').in('family_id', famIds.slice(i,i+BATCH))
      if (data) allMems = allMems.concat(data)
    }
    if (allMems.length) {
      await writeToSQLite(db, 'family_members', allMems)
      console.log(`[sync] family_members: ${allMems.length}`)
    }
  }

  console.log('[sync] ✅ اكتملت')
}
