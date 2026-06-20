/**
 * syncAll.js — Supabase → SQLite
 */
import { supabase, ORG_ID } from './supabase'
import { TABLES as SCHEMA_TABLES, cleanForTable } from './schema'

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

// أعمدة كل جدول: المصدر الوحيد الآن هو schema.js (SCHEMA_TABLES)

async function writeToSQLite(db, table, docs) {
  if (!db || !docs?.length) return
  const allowed = SCHEMA_TABLES[table]?.columns
  if (!allowed) return

  const valueSets = docs.map(doc => {
    const d = cleanForTable(table, doc)
    const def = SCHEMA_TABLES[table]
    const textify = [...(def?.jsonTextColumns || []), ...(def?.arrayColumns || [])]
    for (const k of textify) {
      if (Array.isArray(d[k]) || (d[k] && typeof d[k] === 'object')) d[k] = JSON.stringify(d[k])
    }
    return allowed.map(col => {
      let v = d[col]
      if (v !== undefined && v !== null && typeof v === 'object') v = JSON.stringify(v)
      return v === undefined ? null : v
    })
  })

  const sql = `INSERT OR REPLACE INTO ${table} (${allowed.join(',')}) VALUES (${allowed.map(()=>'?').join(',')})`

  try {
    await db.executeBatch(sql, valueSets)
    console.log(`[syncAll] ${table}: كتب ${valueSets.length} صف في SQLite (batch)`)
  } catch(e) {
    console.warn(`[syncAll] executeBatch ${table} فشلت، رجوع لصفاً-صفاً:`, e.message)
    let ok = 0, fail = 0
    const failReasons = {}
    for (let i = 0; i < valueSets.length; i++) {
      try {
        await db.execute(sql, valueSets[i])
        ok++
      } catch(rowErr) {
        fail++
        const reason = rowErr.message?.slice(0, 60) || 'unknown'
        failReasons[reason] = (failReasons[reason] || 0) + 1
      }
    }
    if (fail > 0) console.warn(`[syncAll] ${table}: ✅${ok} ❌${fail} — الأسباب:`, JSON.stringify(failReasons))
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
