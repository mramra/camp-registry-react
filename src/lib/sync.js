/**
 * sync.js — متوافق مع الواجهة القديمة فقط (no-op)
 *
 * بعد التحول لـ Supabase المباشر، لا حاجة لطابور مزامنة محلي —
 * كل كتابة تذهب فوراً لـ Supabase أو تفشل بوضوح إن لم يوجد اتصال.
 * هذا الملف يبقى فقط لأن صفحات قديمة تستورد enqueue/processSyncQueue/getSyncStats.
 */

export async function enqueue() {
  console.warn('[sync] enqueue() لم تُعد تُستخدم — الكتابة تذهب مباشرة لـ Supabase الآن')
}

export async function processSyncQueue() {
  return { synced: 0, failed: 0, conflicts: 0 }
}

export async function getSyncStats() {
  return { pending: 0, failed: 0, conflicts: 0, total: 0 }
}

export async function retryFailed() {}
