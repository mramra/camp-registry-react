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
    case 'update_family': {
      // إزالة الحقول غير المدعومة
      const ALLOWED = ['id','org_id','camp_id','head_name','head_id','head_gender','head_dob',
        'head_marital','phone1','phone2','tent','original_address','address_details',
        'status','notes','category_tags','economic_level','version','created_at','updated_at','created_by']
      const cleanFam = {}
      ALLOWED.forEach(k => { if (data[k] !== undefined) cleanFam[k] = data[k] })
      // تصحيح categories → category_tags
      if (data.categories && !cleanFam.category_tags) cleanFam.category_tags = data.categories
      cleanFam.org_id = ORG_ID
      const { error } = await supabase.from('families').upsert(cleanFam)
      if (error) throw error
      break
    }

    case 'delete_family': {
      const { error } = await supabase.from('families').delete().eq('id', data.id)
      if (error) throw error
      break
    }

    // ── المخيمات ───────────────────────────────────────────
    case 'insert_camp':
    case 'update_camp': {
      // المخيمات لا تحتاج conflict resolution — المستخدم قصد التعديل
      const cleanCamp = Object.fromEntries(
        Object.entries(data).filter(([,v]) => v !== undefined)
      )
      const { error } = await supabase.from('camps').upsert({
        ...cleanCamp,
        org_id: ORG_ID,
      })
      if (error) throw error
      break
    }

    case 'delete_camp': {
      const { error } = await supabase.from('camps').delete().eq('id', data.id)
      if (error) throw error
      break
    }

    // ── جولات التوزيع ─────────────────────────────────────
    case 'insert_round':
    case 'update_round': {
      const { error } = await supabase
        .from('dist_rounds')
        .upsert({ ...data, org_id: ORG_ID })
      if (error) throw error
      break
    }

    // ── دفعات التوزيع ─────────────────────────────────────
    case 'insert_batch':
    case 'update_batch': {
      const { error } = await supabase
        .from('camp_distributions')
        .upsert({ ...data, org_id: ORG_ID })
      if (error) throw error
      break
    }

    // ── سجل استلام الأسر ──────────────────────────────────
    case 'insert_dist': {
      const { error } = await supabase
        .from('camp_dist_families')
        .upsert({ ...data, org_id: ORG_ID })
      if (error) throw error
      break
    }

    // ── الحركات ───────────────────────────────────────────
    case 'insert_movement': {
      const { error } = await supabase
        .from('family_movements')
        .insert({ ...data, org_id: ORG_ID })
      if (error) throw error
      break
    }

    // ── القديمة — للتوافق ─────────────────────────────────
    case 'insert_dist_round':
    case 'update_dist_round': {
      const { error } = await supabase
        .from('dist_rounds')
        .upsert({ ...data, org_id: ORG_ID })
      if (error) throw error
      break
    }

    default:
      console.warn(`[sync] unknown action: ${action} — skipping`)
      break
  }
}

// ─── Conflict Resolution ──────────────────────────────────
async function upsertWithConflict(table, localData) {
  const id = localData.id

  const { data: serverData } = await supabase
    .from(table).select('id, version, updated_at').eq('id', id).single()

  // لا نتحقق من version — المستخدم قصد التعديل دائماً

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

// ─── إحصائيات الطابور ──────────────────────────────────────
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
