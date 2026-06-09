import { supabase, ORG_ID } from './supabase'
import { localDB } from './db'

/** معالجة طابور المزامنة */
export async function processSyncQueue() {
  const queue = await localDB.sync_queue.where('status').equals('pending').toArray()
  if (!queue.length) return { synced: 0, failed: 0 }

  let synced = 0, failed = 0

  for (const item of queue) {
    try {
      await handleSyncItem(item)
      await localDB.sync_queue.update(item.id, { status: 'done' })
      synced++
    } catch (err) {
      await localDB.sync_queue.update(item.id, {
        status: 'failed',
        error: err.message,
        attempts: (item.attempts || 0) + 1,
      })
      failed++
    }
  }
  return { synced, failed }
}

async function handleSyncItem(item) {
  const { action, payload } = item

  switch (action) {
    case 'insert_family':
    case 'update_family': {
      const { error } = await supabase.from('families').upsert({ ...payload, org_id: ORG_ID })
      if (error) throw error
      break
    }
    case 'delete_family': {
      const { error } = await supabase.from('families').delete().eq('id', payload.id)
      if (error) throw error
      break
    }
    case 'insert_camp':
    case 'update_camp': {
      const { error } = await supabase.from('camps').upsert({ ...payload, org_id: ORG_ID })
      if (error) throw error
      break
    }
    case 'delete_camp': {
      const { error } = await supabase.from('camps').delete().eq('id', payload.id)
      if (error) throw error
      break
    }
    case 'insert_movement': {
      const { error } = await supabase.from('family_movements').insert({ ...payload, org_id: ORG_ID })
      if (error) throw error
      break
    }
    default:
      throw new Error(`Unknown sync action: ${action}`)
  }
}

/** إضافة عنصر لطابور المزامنة */
export async function enqueue(action, payload) {
  await localDB.sync_queue.add({
    action,
    payload,
    status: 'pending',
    created_at: new Date().toISOString(),
    attempts: 0,
  })
}
