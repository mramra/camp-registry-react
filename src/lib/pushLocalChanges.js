/**
 * pushLocalChanges.js — رفع البيانات المحلية غير المرفوعة لـ Supabase
 *
 * آمن 100%: upsert فقط، لا حذف أبداً.
 * يستخدم schema.js كمصدر حقيقة وحيد للأعمدة — لا تعريفات مكررة هنا.
 */
import { supabase, ORG_ID } from './supabase'
import { createClient } from '@supabase/supabase-js'
import { TABLES, cleanForTable } from './schema'

const SUPABASE_URL = 'https://ojclpkenecicujkqhhlu.supabase.co'
const BATCH_SIZE = 50

// ترتيب الرفع يحترم العلاقات الخارجية (FK) — الجداول الأب أولاً
const PUSH_ORDER = [
  { table: 'families',           orgScoped: true },
  { table: 'family_members',     orgScoped: false, fk: { col: 'family_id', parent: 'families' } },
  { table: 'dist_rounds',        orgScoped: true },
  { table: 'camp_distributions', orgScoped: true },
  { table: 'camp_dist_families', orgScoped: false, fk: { col: 'distribution_id', parent: 'camp_distributions' } },
]

async function getDb() {
  try {
    const { getPowerSync } = await import('./powersync')
    return getPowerSync()
  } catch { return null }
}

async function sqliteGetAll(db, table) {
  if (!db) return []
  try { return await db.getAll(`SELECT * FROM ${table}`) } catch { return [] }
}

function explainError(msg, usingAdminKey) {
  if (/row-level security|RLS/i.test(msg)) {
    return usingAdminKey
      ? `${msg} — تأكد أن المفتاح هو "service_role" كاملاً بدون مسافات.`
      : `${msg} — يحتاج مفتاح إداري (service_role).`
  }
  return msg
}

/**
 * يرفع كل الجداول المحلية الناقصة بالترتيب الصحيح.
 * @param {Function} onProgress - دالة تستقبل رسائل تقدّم نصية
 * @param {string|null} adminKey - مفتاح service_role اختياري لتجاوز RLS
 */
export async function pushLocalChanges(onProgress = () => {}, adminKey = null) {
  const cleanedKey = adminKey ? adminKey.replace(/\s+/g, '').trim() : null
  const db_client = cleanedKey
    ? createClient(SUPABASE_URL, cleanedKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : supabase

  const report = { errors: [] }
  for (const { table } of PUSH_ORDER) report[table] = { uploaded: 0, total: 0, skipped: 0 }

  if (!navigator.onLine) {
    report.errors.push('لا يوجد اتصال بالإنترنت')
    return report
  }

  if (cleanedKey) {
    onProgress(`🔑 فحص المفتاح الإداري (${cleanedKey.length} حرف)...`)
    const { error } = await db_client.from('families').select('id').limit(1)
    if (error) {
      report.errors.push(`المفتاح غير صالح: ${error.message}`)
      return report
    }
    onProgress('✅ المفتاح صالح')
  }

  const db = await getDb()
  const validIdsCache = {} // table -> Set of valid ids on server (للـ FK checks)

  async function getValidIds(table) {
    if (validIdsCache[table]) return validIdsCache[table]
    const { data } = await db_client.from(table).select('id')
    validIdsCache[table] = new Set((data || []).map(r => r.id))
    return validIdsCache[table]
  }

  for (const step of PUSH_ORDER) {
    const { table, orgScoped, fk } = step
    onProgress(`📋 فحص ${table}...`)

    let local = await sqliteGetAll(db, table)
    report[table].total = local.length
    if (!local.length) continue

    // فلترة FK: استثنِ سجلات تشير لسجل أب غير موجود فعلياً على السيرفر
    if (fk) {
      const validParentIds = await getValidIds(fk.parent)
      const before = local.length
      local = local.filter(r => validParentIds.has(r[fk.col]))
      report[table].skipped = before - local.length
      if (report[table].skipped > 0) {
        report.errors.push(`${table}: تم تجاهل ${report[table].skipped} سجل يشير إلى ${fk.parent} غير موجود`)
      }
    }
    if (!local.length) continue

    // قائمة الموجود فعلياً على السيرفر لهذا الجدول (لمعرفة الناقص)
    let query = db_client.from(table).select('id')
    if (orgScoped) query = query.eq('org_id', ORG_ID)
    const { data: serverRows, error: selErr } = await query
    if (selErr) {
      report.errors.push(`${table} (قراءة): ${explainError(selErr.message, !!cleanedKey)}`)
      continue
    }
    const serverIds = new Set((serverRows || []).map(r => r.id))
    const missing = local.filter(r => !serverIds.has(r.id))
    if (!missing.length) {
      onProgress(`✅ ${table}: لا يوجد جديد`)
      continue
    }

    onProgress(`📤 رفع ${missing.length} سجل إلى ${table}...`)
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = missing.slice(i, i + BATCH_SIZE).map(r => cleanForTable(table, r))
      const { error } = await db_client.from(table).upsert(batch)
      if (!error) {
        report[table].uploaded += batch.length
        onProgress(`✅ ${table}: ${report[table].uploaded}/${missing.length}`)
        continue
      }
      // فشلت الدفعة — حاول صفاً بصف لإنقاذ ما يمكن إنقاذه
      let rowSuccess = 0
      for (const row of batch) {
        const { error: rowErr } = await db_client.from(table).upsert([row])
        if (!rowErr) rowSuccess++
      }
      report[table].uploaded += rowSuccess
      if (rowSuccess < batch.length) {
        report.errors.push(`${table}: ${explainError(error.message, !!cleanedKey)} — نجح ${rowSuccess}/${batch.length} فردياً`)
      }
    }
  }

  onProgress('✅ اكتمل الرفع')
  return report
}
