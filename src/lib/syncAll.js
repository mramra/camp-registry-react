// lib/syncAll.js — جلب كل البيانات وتخزينها محلياً
import { supabase, ORG_ID } from './supabase'
import { localDB } from './db'

export async function syncAllData(onProgress) {
  const steps = [
    { name: 'المخيمات',      table: 'camps',          local: 'camps'          },
    { name: 'الأسر',         table: 'families',       local: 'families'       },
    { name: 'الأعضاء',       table: 'family_members', local: 'family_members' },
    { name: 'المستخدمون',    table: 'org_members',    local: 'org_members'    },
    { name: 'التوزيعات',     table: 'dist_rounds',    local: 'dist_rounds'    },
    { name: 'حركات الأسر',   table: 'family_movements', local: 'family_movements' },
  ]

  const results = {}
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    onProgress?.(Math.round((i / steps.length) * 100), step.name)
    try {
      const { data, error } = await supabase
        .from(step.table)
        .select('*')
        .eq('org_id', ORG_ID)
        .limit(5000)
      if (!error && data) {
        try { await localDB[step.local].bulkPut(data) } catch {}
        results[step.name] = data.length
      }
    } catch (err) {
      console.warn(`syncAll ${step.table}:`, err.message)
    }
  }
  onProgress?.(100, 'مكتمل')
  return results
}

export async function getLastSyncTime() {
  try {
    const meta = await localDB.meta.get('lastSync')
    return meta?.value || null
  } catch { return null }
}

export async function setLastSyncTime() {
  try {
    await localDB.meta.put({ key: 'lastSync', value: new Date().toISOString() })
  } catch {}
}
