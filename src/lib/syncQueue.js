/**
 * syncQueue.js — قائمة انتظار التزامن أوف لاين
 * يُخزَّن الطابور في جدول sync_queue المحلي بـ SQLite (PowerSync) — لا يُزامن سحابياً أبداً
 *
 * عند حفظ أوف لاين:
 *   addToQueue('upsert', 'family_members', data)
 *
 * عند عودة الإنترنت:
 *   processQueue() → يرفع كل العمليات لـ Supabase
 */
import { supabase } from './supabase'

async function getDb() {
  try {
    const { getPowerSync } = await import('./powersync')
    return getPowerSync()
  } catch { return null }
}

function genId() {
  return (crypto?.randomUUID?.() || `q_${Date.now()}_${Math.random().toString(36).slice(2)}`)
}

// أضف عملية للقائمة
export async function addToQueue(op, table, data, id = null) {
  try {
    const db = await getDb()
    if (!db) return
    await db.execute(
      `INSERT INTO sync_queue (id, op, table_name, data, record_id, status, retries, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)`,
      [genId(), op, table, JSON.stringify(data), id || data?.id || null, new Date().toISOString()]
    )
    console.log(`[queue] +${op} ${table}:`, data?.id || id)
  } catch(e) {
    console.warn('[queue] addToQueue:', e.message)
  }
}

// عدد العمليات المعلقة
export async function getPendingCount() {
  try {
    const db = await getDb()
    if (!db) return 0
    const rows = await db.getAll(`SELECT COUNT(*) as c FROM sync_queue WHERE status = 'pending'`)
    return rows?.[0]?.c || 0
  } catch { return 0 }
}

// معالجة كل القائمة
export async function processQueue() {
  if (!navigator.onLine) return { processed: 0, failed: 0 }

  let processed = 0, failed = 0
  const db = await getDb()
  if (!db) return { processed, failed }

  try {
    const pending = await db.getAll(
      `SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC`
    )

    console.log(`[queue] معالجة ${pending.length} عملية معلقة...`)

    for (const item of pending) {
      try {
        const data = JSON.parse(item.data || '{}')

        if (item.op === 'upsert') {
          const clean = { ...data }
          delete clean._local
          delete clean._pending

          const { error } = await supabase
            .from(item.table_name)
            .upsert(clean, { onConflict: 'id' })

          if (error) throw error
        }

        if (item.op === 'delete') {
          const { error } = await supabase
            .from(item.table_name)
            .delete()
            .eq('id', item.record_id || data.id)

          if (error) throw error
        }

        // نجحت → احذفها من القائمة
        await db.execute(`DELETE FROM sync_queue WHERE id = ?`, [item.id])
        processed++
        console.log(`[queue] ✅ ${item.op} ${item.table_name}`)

      } catch(e) {
        console.warn(`[queue] ❌ ${item.op} ${item.table_name}:`, e.message)
        const newRetries = (item.retries || 0) + 1
        await db.execute(
          `UPDATE sync_queue SET retries = ?, last_error = ?, status = ? WHERE id = ?`,
          [newRetries, e.message, newRetries >= 3 ? 'failed' : 'pending', item.id]
        )
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
  try {
    const db = await getDb()
    if (!db) return
    await db.execute(`DELETE FROM sync_queue WHERE status = 'failed'`)
  } catch(e) { console.warn('[queue] clearFailed:', e.message) }
}

