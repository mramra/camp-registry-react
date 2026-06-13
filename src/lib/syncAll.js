/**
 * syncAll.js — سحب البيانات من Supabase إلى Dexie
 * ─────────────────────────────────────────────────
 * المبدأ: updated_at checkpoint
 * - أول مرة: يسحب كل شيء
 * - بعدها: يسحب فقط ما تغيّر منذ آخر sync
 * - لا يُعيد الكتابة إذا لم يتغير شيء
 */
import { supabase, ORG_ID } from './supabase'
import { localDB } from './db'

const SYNC_KEY = 'camp_last_sync'
const PAGE     = 500   // عدد السجلات في كل طلب

// الجداول وترتيب السحب (camps أولاً لأن families تعتمد عليها)
const TABLES = [
  { table: 'camps',              dexie: 'camps',              orgFilter: true  },
  { table: 'org_members',        dexie: 'org_members',        orgFilter: true  },
  { table: 'families',           dexie: 'families',           orgFilter: true  },
  { table: 'family_members',     dexie: 'family_members',     orgFilter: false },
  { table: 'family_movements',   dexie: 'family_movements',   orgFilter: true  },
  { table: 'dist_rounds',        dexie: 'dist_rounds',        orgFilter: true  },
  { table: 'camp_dist_families', dexie: 'camp_dist_families', orgFilter: false },
]

export function getLastSyncTime() {
  return Promise.resolve(localStorage.getItem(SYNC_KEY))
}

export function setLastSyncTime(t) {
  localStorage.setItem(SYNC_KEY, t || new Date().toISOString())
  return Promise.resolve()
}

/**
 * syncAllData — سحب كامل أو تدريجي
 * @param {Function} onProgress (pct 0-100, label)
 */
export async function syncAllData(onProgress) {
  const since = localStorage.getItem(SYNC_KEY)
  const results = { pulled: 0, errors: [] }
  const syncStart = new Date().toISOString()

  for (let i = 0; i < TABLES.length; i++) {
    const { table, dexie, orgFilter } = TABLES[i]
    const pct   = Math.round((i / TABLES.length) * 90)
    const label = `جلب ${table}...`
    onProgress?.(pct, label)

    try {
      let page = 0
      while (true) {
        let q = supabase
          .from(table)
          .select('*')
          .order('updated_at', { ascending: true })
          .range(page * PAGE, (page + 1) * PAGE - 1)

        if (orgFilter) q = q.eq('org_id', ORG_ID)
        if (since)     q = q.gte('updated_at', since)

        const { data, error } = await q
        if (error) { results.errors.push(`${table}: ${error.message}`); break }
        if (!data?.length) break

        // حفظ في Dexie
        await localDB[dexie].bulkPut(data).catch(async () => {
          // fallback: سجل سجل
          for (const row of data) {
            await localDB[dexie].put(row).catch(() => {})
          }
        })

        results.pulled += data.length
        if (data.length < PAGE) break
        page++
      }
    } catch (e) {
      results.errors.push(`${table}: ${e.message}`)
    }
  }

  // حفظ وقت السحب
  localStorage.setItem(SYNC_KEY, syncStart)
  onProgress?.(100, 'اكتملت المزامنة')
  return results
}

/**
 * quickSync — سحب سريع في الخلفية بدون progress
 * يُستدعى عند عودة الاتصال
 */
export async function quickSync() {
  if (!navigator.onLine) return
  try {
    const results = await syncAllData()
    if (results.pulled > 0) {
      console.log(`[sync] ✅ سُحب ${results.pulled} سجل`)
    }
    if (results.errors.length) {
      console.warn('[sync] أخطاء:', results.errors)
    }
  } catch (e) {
    console.warn('[quickSync]', e.message)
  }
}
