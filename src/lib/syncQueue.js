/**
 * syncQueue.js — قائمة انتظار التزامن أوف لاين
 *
 * عند حفظ أوف لاين:
 *   addToQueue('upsert', 'family_members', data)
 *
 * عند عودة الإنترنت:
 *   processQueue() → يرفع كل العمليات لـ Supabase
 */
import { localDB }          from './db'
import { supabase, ORG_ID } from './supabase'

// أضف عملية للقائمة
export async function addToQueue(op, table, data, id = null) {
  try {
    await localDB.sync_queue.add({
      op,           // 'upsert' | 'delete'
      table,
      data: JSON.stringify(data),
      record_id:   id || data?.id || null,
      status:      'pending',
      created_at:  new Date().toISOString(),
      retries:     0,
    })
    console.log(`[queue] +${op} ${table}:`, data?.id || id)
  } catch(e) {
    console.warn('[queue] addToQueue:', e.message)
  }
}

// عدد العمليات المعلقة
export async function getPendingCount() {
  try {
    return await localDB.sync_queue.where('status').equals('pending').count()
  } catch { return 0 }
}

// معالجة كل القائمة
export async function processQueue() {
  if (!navigator.onLine) return { processed: 0, failed: 0 }

  let processed = 0, failed = 0

  try {
    const pending = await localDB.sync_queue
      .where('status').equals('pending')
      .sortBy('created_at')

    console.log(`[queue] معالجة ${pending.length} عملية معلقة...`)

    for (const item of pending) {
      try {
        const data = JSON.parse(item.data || '{}')

        if (item.op === 'upsert') {
          // حذف حقول لا تقبلها Supabase
          const clean = { ...data }
          delete clean._local
          delete clean._pending

          const { error } = await supabase
            .from(item.table)
            .upsert(clean, { onConflict: 'id' })

          if (error) throw error
        }

        if (item.op === 'delete') {
          const { error } = await supabase
            .from(item.table)
            .delete()
            .eq('id', item.record_id || data.id)

          if (error) throw error
        }

        // نجحت → احذفها من القائمة
        await localDB.sync_queue.delete(item.id)
        processed++
        console.log(`[queue] ✅ ${item.op} ${item.table}`)

      } catch(e) {
        console.warn(`[queue] ❌ ${item.op} ${item.table}:`, e.message)
        // زيادة عداد المحاولات
        await localDB.sync_queue.update(item.id, {
          retries: (item.retries || 0) + 1,
          last_error: e.message,
          status: (item.retries || 0) >= 3 ? 'failed' : 'pending',
        })
        failed++
      }
    }

    console.log(`[queue] اكتمل: ${processed} نجح, ${failed} فشل`)
  } catch(e) {
    console.warn('[queue] processQueue:', e.message)
  }

  return { processed, failed }
}

// حذف العمليات الفاشلة
export async function clearFailed() {
  await localDB.sync_queue.where('status').equals('failed').delete()
}
