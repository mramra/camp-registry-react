/**
 * deltaSync.js — مزامنة ذكية
 * كل 2.5 دقيقة:
 *   1. تجلب فقط ما updated_at > آخر_مزامنة (تغييرات فقط)
 *   2. تكتشف الحذف بمقارنة العدد
 *   3. إذا حُذفت أسرة → تحذف أسرة + أفرادها من Dexie
 *   4. تُطلق event "delta-sync" لإعادة تحميل الصفحة
 */
import { supabase, ORG_ID } from './supabase'
import { localDB }          from './db'

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

function baseQuery(table, orgId) {
  let q = supabase.from(table).select('*')
  if (orgId) q = q.eq('org_id', ORG_ID)
  return q
}

export async function deltaSync() {
  if (!navigator.onLine) return 0

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
        await localDB[name]?.bulkPut?.(changed).catch(() => {})
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
          // حُذف شيء — نجلب كل IDs من السيرفر ونقارن بـ Dexie
          let idsQ = supabase.from(name).select('id')
          if (orgId) idsQ = idsQ.eq('org_id', ORG_ID)
          const { data: serverRecs } = await idsQ

          if (serverRecs) {
            const serverIds = new Set(serverRecs.map(r => r.id))
            const localRecs = await localDB[name]?.toArray?.().catch(() => []) || []
            const toDelete  = localRecs.filter(r => !serverIds.has(r.id)).map(r => r.id)

            if (toDelete.length) {
              await localDB[name]?.bulkDelete?.(toDelete).catch(() => {})
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
        const mems = await localDB.family_members
          ?.where?.('family_id')?.equals?.(famId)?.toArray?.() || []
        if (mems.length) {
          await localDB.family_members
            ?.bulkDelete?.(mems.map(m => m.id)).catch(() => {})
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
