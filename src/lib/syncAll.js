/**
 * syncAll.js — مزامنة ذكية: Supabase → Dexie
 * تشتغل مرة واحدة عند تسجيل الدخول
 * لا streaming — لا اتصال دائم
 */
import { supabase, ORG_ID } from './supabase'
import { localDB }          from './db'

const TABLES = [
  { name: 'families',          query: () => supabase.from('families').select('*').eq('org_id', ORG_ID) },
  { name: 'camps',             query: () => supabase.from('camps').select('*').eq('org_id', ORG_ID) },
  { name: 'org_members',       query: () => supabase.from('org_members').select('*').eq('org_id', ORG_ID) },
  { name: 'family_movements',  query: () => supabase.from('family_movements').select('*').eq('org_id', ORG_ID) },
  { name: 'dist_rounds',       query: () => supabase.from('dist_rounds').select('*').eq('org_id', ORG_ID) },
  { name: 'camp_distributions',query: () => supabase.from('camp_distributions').select('*').eq('org_id', ORG_ID) },
  // جداول بدون org_id — نجلبها عبر family_ids لتوفير الموارد
  { name: 'family_members',    query: null },
  { name: 'camp_dist_families',query: null },
]

export async function quickSync() {
  if (!navigator.onLine) return
  console.log('[sync] بدء المزامنة من Supabase → Dexie')

  try {
    // 1. جلب الجداول الرئيسية بـ Promise.all
    const results = await Promise.allSettled(
      TABLES.filter(t => t.query).map(async t => {
        const { data, error } = await t.query()
        if (error) throw error
        if (data?.length) {
          await localDB[t.name]?.bulkPut?.(data).catch(() => {})
          console.log(`[sync] ${t.name}: ${data.length} سجل`)
        }
        return { table: t.name, count: data?.length || 0 }
      })
    )

    // 2. family_members: اجلب بناءً على family_ids المحلية
    const famIds = (await localDB.families?.toArray?.() || []).map(f => f.id).filter(Boolean)
    if (famIds.length > 0) {
      // اجلب على دفعات (حد Supabase IN = 1000)
      const BATCH = 500
      let allMems = []
      for (let i = 0; i < famIds.length; i += BATCH) {
        const batch = famIds.slice(i, i + BATCH)
        const { data } = await supabase.from('family_members').select('*').in('family_id', batch)
        if (data) allMems = allMems.concat(data)
      }
      if (allMems.length) {
        await localDB.family_members?.bulkPut?.(allMems).catch(() => {})
        console.log(`[sync] family_members: ${allMems.length} سجل`)
      }
    }

    // 3. camp_dist_families
    const distIds = (await localDB.camp_dist_families?.toArray?.() || [])
    const { data: distFams } = await supabase.from('camp_dist_families').select('*')
    if (distFams?.length) {
      await localDB.camp_dist_families?.bulkPut?.(distFams).catch(() => {})
    }

    console.log('[sync] ✅ اكتملت المزامنة')
    return { success: true }
  } catch(e) {
    console.warn('[sync] خطأ:', e.message)
    return { success: false, error: e.message }
  }
}

// مزامنة جدول واحد فقط (للتحديث السريع)
export async function syncTable(tableName) {
  if (!navigator.onLine) return
  const t = TABLES.find(t => t.name === tableName)
  if (!t?.query) return
  const { data } = await t.query()
  if (data?.length) await localDB[tableName]?.bulkPut?.(data).catch(() => {})
}
