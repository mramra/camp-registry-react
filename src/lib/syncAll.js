/**
 * syncAll.js — Supabase → SQLite + Dexie
 */
import { supabase, ORG_ID } from './supabase'
import { localDB }           from './db'

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

async function writeToSQLite(db, table, docs) {
  if (!db || !docs?.length) return
  try {
    await db.writeTransaction(async tx => {
      for (const doc of docs) {
        const d = { ...doc }
        if (Array.isArray(d.category_tags)) d.category_tags = JSON.stringify(d.category_tags)
        const cols = Object.keys(d)
        await tx.execute(
          `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`,
          Object.values(d)
        ).catch(() => {})
      }
    })
  } catch(e) { console.warn('[syncAll] SQLite write:', table, e.message) }
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
      await localDB[name]?.bulkPut?.(data).catch(() => {})
      console.log(`[sync] ${name}: ${data.length}`)
    } catch(e) { console.warn('[sync]', name, e.message) }
  }

  // أفراد الأسر
  const famIds = (await localDB.families?.toArray?.() || []).map(f=>f.id)
  if (famIds.length) {
    const BATCH = 500
    let allMems = []
    for (let i=0; i<famIds.length; i+=BATCH) {
      const { data } = await supabase.from('family_members').select('*').in('family_id', famIds.slice(i,i+BATCH))
      if (data) allMems = allMems.concat(data)
    }
    if (allMems.length) {
      await writeToSQLite(db, 'family_members', allMems)
      await localDB.family_members?.bulkPut?.(allMems).catch(() => {})
      console.log(`[sync] family_members: ${allMems.length}`)
    }
  }

  console.log('[sync] ✅ اكتملت')
}
