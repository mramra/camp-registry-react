import { supabase, ORG_ID } from './supabase'
import { localDB } from './db'

// ─── معالجة طابور المزامنة ───────────────────────────────
export async function processSyncQueue() {
  const queue = await localDB.sync_queue
    .where('status').equals('pending')
    .and(item => (item.attempts || 0) < 5)
    .toArray()

  if (!queue.length) return { synced: 0, failed: 0, conflicts: 0 }

  let synced = 0, failed = 0, conflicts = 0

  for (const item of queue) {
    try {
      const result = await handleSyncItem(item)
      if (result === 'conflict') {
        await localDB.sync_queue.update(item.id, { status: 'conflict' })
        conflicts++
      } else {
        await localDB.sync_queue.update(item.id, { status: 'done' })
        synced++
      }
    } catch (err) {
      const attempts = (item.attempts || 0) + 1
      await localDB.sync_queue.update(item.id, {
        status: attempts >= 5 ? 'failed' : 'pending',
        error: err.message,
        attempts,
        last_attempt: new Date().toISOString(),
      })
      failed++
    }
  }

  return { synced, failed, conflicts }
}

async function handleSyncItem(item) {
  const { action, payload } = item
  const data = typeof payload === 'string' ? JSON.parse(payload) : payload

  switch (action) {
    // ── الأسر ──────────────────────────────────────────────
    case 'insert_family':
      return await upsertWithConflict('families', data)

    case 'update_family':
      return await upsertWithConflict('families', data)

    case 'delete_family': {
      const { error } = await supabase.from('families').delete().eq('id', data.id)
      if (error) throw error
      break
    }

    // ── المخيمات ───────────────────────────────────────────
    case 'insert_camp':
    case 'update_camp':
      return await upsertWithConflict('camps', data)

    case 'delete_camp': {
      const { error } = await supabase.from('camps').delete().eq('id', data.id)
      if (error) throw error
      break
    }

    // ── التوزيعات ──────────────────────────────────────────
    case 'insert_dist_round':
    case 'update_dist_round': {
      const { error } = await supabase.from('dist_rounds').upsert({ ...data, org_id: ORG_ID })
      if (error) throw error
      break
    }

    // ── الحركات ───────────────────────────────────────────
    case 'insert_movement': {
      const { error } = await supabase.from('family_movements').insert({ ...data, org_id: ORG_ID })
      if (error) throw error
      break
    }

    default:
      throw new Error(`Unknown sync action: ${action}`)
  }
}

// ─── Conflict Resolution ──────────────────────────────────
/**
 * upsertWithConflict — Last-Write-Wins بناءً على version
 * إذا السيرفر أحدث من النسخة المحلية → conflict
 * إذا النسخة المحلية أحدث → رفع للسيرفر
 */
async function upsertWithConflict(table, localData) {
  const id = localData.id

  // جلب النسخة الحالية من السيرفر
  const { data: serverData } = await supabase
    .from(table).select('id, version, updated_at').eq('id', id).single()

  if (serverData) {
    const serverVersion  = serverData.version  || 0
    const localVersion   = localData.version   || 0
    const serverUpdated  = new Date(serverData.updated_at  || 0).getTime()
    const localUpdated   = new Date(localData.updated_at   || 0).getTime()

    // السيرفر أحدث → تعارض
    if (serverVersion > localVersion || serverUpdated > localUpdated + 5000) {
      console.warn(`[sync] conflict detected for ${table}/${id}`)
      // الحل: نحتفظ بالسيرفر ونحدّث المحلي
      await localDB[table === 'families' ? 'families' : 'camps'].put(serverData)
      return 'conflict'
    }
  }

  // النسخة المحلية أحدث أو جديدة → رفع للسيرفر
  const { error } = await supabase.from(table).upsert({
    ...localData,
    org_id: ORG_ID,
    version: (localData.version || 0) + 1,
  })
  if (error) throw error
  return 'ok'
}

// ─── إضافة لطابور المزامنة ─────────────────────────────────
export async function enqueue(action, payload) {
  await localDB.sync_queue.add({
    action,
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
    status: 'pending',
    created_at: new Date().toISOString(),
    attempts: 0,
  })
}

// ─── جلب إحصائيات الطابور ─────────────────────────────────
export async function getSyncStats() {
  const [pending, failed, conflicts] = await Promise.all([
    localDB.sync_queue.where('status').equals('pending').count(),
    localDB.sync_queue.where('status').equals('failed').count(),
    localDB.sync_queue.where('status').equals('conflict').count(),
  ])
  return { pending, failed, conflicts, total: pending + failed + conflicts }
}

// ─── إعادة المحاولة للعناصر الفاشلة ──────────────────────
export async function retryFailed() {
  await localDB.sync_queue
    .where('status').equals('failed')
    .modify({ status: 'pending', attempts: 0 })
}
