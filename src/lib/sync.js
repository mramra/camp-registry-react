import { supabase, ORG_ID } from './supabase'
import { logFamilyActivity } from './familyActivityLog'

async function getDb() {
  try {
    const { getPowerSync } = await import('./powersync')
    return getPowerSync()
  } catch { return null }
}

function genId() {
  return (crypto?.randomUUID?.() || `q_${Date.now()}_${Math.random().toString(36).slice(2)}`)
}

// ─── معالجة طابور المزامنة ───────────────────────────────
// جدول sync_queue الموحّد (مشترك مع syncQueue.js) — أعمدة: id, op, table_name, data, record_id, status, retries, last_error, created_at
// هنا op يقابل ما كان يُسمّى action (مثل 'insert_family', 'delete_member'...) و data يقابل payload
export async function processSyncQueue() {
  const db = await getDb()
  if (!db) return { synced: 0, failed: 0, conflicts: 0 }

  const queue = await db.getAll(
    `SELECT * FROM sync_queue WHERE status = 'pending' AND retries < 5 ORDER BY created_at ASC`
  )

  if (!queue.length) return { synced: 0, failed: 0, conflicts: 0 }

  let synced = 0, failed = 0, conflicts = 0

  for (const item of queue) {
    try {
      const result = await handleSyncItem({ action: item.op, payload: item.data })
      if (result === 'conflict') {
        await db.execute(`UPDATE sync_queue SET status = 'conflict' WHERE id = ?`, [item.id])
        conflicts++
      } else {
        // تمت المعالجة بنجاح — احذف العنصر من الطابور (مطابق لسلوك "تم")
        await db.execute(`DELETE FROM sync_queue WHERE id = ?`, [item.id])
        synced++
      }
    } catch (err) {
      const attempts = (item.retries || 0) + 1
      await db.execute(
        `UPDATE sync_queue SET status = ?, last_error = ?, retries = ? WHERE id = ?`,
        [attempts >= 5 ? 'failed' : 'pending', err.message, attempts, item.id]
      )
      failed++
    }
  }

  return { synced, failed, conflicts }
}

async function handleSyncItem({ action, payload }) {
  const data = typeof payload === 'string' ? JSON.parse(payload) : payload

  switch (action) {
    // ── الأسر ──────────────────────────────────────────────
    case 'insert_family':
    case 'update_family': {
      // إزالة الحقول غير المدعومة
      const ALLOWED = ['id','org_id','camp_id','head_name','head_id','head_gender','head_dob',
        'head_marital','phone1','phone2','tent','original_address','address_details',
        'notes','category_tags','economic_level','version','created_at','updated_at','created_by','updated_by']
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
      // سجّل عملية الحذف المتأخرة (كانت أوف لاين وقت الحذف الفعلي)
      if (data._activity) {
        await logFamilyActivity({
          familyId:     data.id,
          familyName:   data._activity.familyName,
          membersCount: data._activity.membersCount,
          action:       'delete',
          actorId:      data._activity.actorId,
          actorName:    data._activity.actorName,
        })
      }
      break
    }

    // ── المخيمات ───────────────────────────────────────────
    case 'insert_camp':
    case 'update_camp': {
      const CAMP_FIELDS = ['id','org_id','name','camp_type','parent_camp_id',
        'address','capacity','status','manager_id','latitude','longitude',
        'facilities','portal_open','created_at']
      const cleanCamp = { org_id: ORG_ID }
      CAMP_FIELDS.forEach(k => { if (data[k] !== undefined) cleanCamp[k] = data[k] })
      const { error } = await supabase.from('camps').upsert(cleanCamp)
      if (error) throw error
      break
    }
    case 'delete_member':
    case 'insert_member':
    case 'update_member': {
      const MEMBER_FIELDS = ['id','org_id','full_name','national_id','phone','role',
        'camp_id','is_active','must_change_pass','created_by','supervisor_id',
        'can_add','can_edit','can_delete','can_export','can_import',
        'delegate_camps','created_at']
      const cleanMember = { org_id: ORG_ID }
      MEMBER_FIELDS.forEach(k => { if (data[k] !== undefined) cleanMember[k] = data[k] })
      if (action === 'delete_member') {
        const { error } = await supabase.from('org_members').delete().eq('id', data.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('org_members').upsert(cleanMember)
        if (error) throw error
      }
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
  const db = await getDb()
  if (!db) return
  const dataStr = typeof payload === 'string' ? payload : JSON.stringify(payload)
  let recordId = null
  try { recordId = (typeof payload === 'string' ? JSON.parse(payload) : payload)?.id || null } catch {}
  await db.execute(
    `INSERT INTO sync_queue (id, op, table_name, data, record_id, status, retries, created_at)
     VALUES (?, ?, '', ?, ?, 'pending', 0, ?)`,
    [genId(), action, dataStr, recordId, new Date().toISOString()]
  )
}

// ─── إحصائيات الطابور ──────────────────────────────────────
export async function getSyncStats() {
  const db = await getDb()
  if (!db) return { pending: 0, failed: 0, conflicts: 0, total: 0 }
  const [pendingRows, failedRows, conflictRows] = await Promise.all([
    db.getAll(`SELECT COUNT(*) as c FROM sync_queue WHERE status = 'pending'`),
    db.getAll(`SELECT COUNT(*) as c FROM sync_queue WHERE status = 'failed'`),
    db.getAll(`SELECT COUNT(*) as c FROM sync_queue WHERE status = 'conflict'`),
  ])
  const pending   = pendingRows?.[0]?.c || 0
  const failed    = failedRows?.[0]?.c || 0
  const conflicts = conflictRows?.[0]?.c || 0
  return { pending, failed, conflicts, total: pending + failed + conflicts }
}

// ─── إعادة المحاولة للعناصر الفاشلة ──────────────────────
export async function retryFailed() {
  const db = await getDb()
  if (!db) return
  await db.execute(`UPDATE sync_queue SET status = 'pending', retries = 0 WHERE status = 'failed'`)
}
