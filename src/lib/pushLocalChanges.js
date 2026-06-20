/**
 * pushLocalChanges.js — رفع البيانات المحلية غير المرفوعة
 *
 * آمن 100%:
 *   - يرفع فقط، لا يحذف شيئاً محلياً
 *   - يقارن SQLite بـ Supabase
 *   - أي سجل محلي غير موجود في السيرفر → يرفعه (upsert)
 *   - يُرجع تقريراً مفصلاً بما رُفع، وأي فشل سببه RLS يُشرح بوضوح
 */
import { supabase, ORG_ID } from './supabase'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ojclpkenecicujkqhhlu.supabase.co'

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

// الحقول المقبولة في Supabase لكل جدول (مؤكدة فعلياً من الـ schema الحقيقي)
const ALLOWED = {
  families: ['id','org_id','camp_id','head_name','head_id','head_gender','head_dob',
    'head_marital','phone1','phone2','tent','tent2','original_address','address_details',
    'address','notes','category_tags','category_details','economic_level','tags',
    'entry_date','exit_date','exit_reason','transferred_to_camp_id',
    'head_orphan_status','head_orphan_cause','head_disabilities','head_injuries',
    'head_chronic_diseases','head_female_status','head_photo_url','client_id',
    'version','created_at','updated_at','created_by','updated_by'],
  family_members: ['id','family_id','name','national_id','relation','dob','gender',
    'health','chronic_diseases','disabilities','injuries','orphan_status','created_at','updated_at'],
  dist_rounds: ['id','org_id','name','description','status','start_date','end_date',
    'created_by','created_at','updated_at'],
  camp_distributions: ['id','org_id','round_id','camp_id','status','quantity','description',
    'created_at','updated_at'],
  camp_dist_families: ['id','distribution_id','family_id','received_at','notes'],
}

function clean(table, rec) {
  const allowed = ALLOWED[table]
  const out = {}
  for (const k of Object.keys(rec)) {
    if (!allowed || allowed.includes(k)) out[k] = rec[k]
  }
  if (Array.isArray(out.category_tags)) out.category_tags = JSON.stringify(out.category_tags)
  if (table === 'camp_distributions' && !out.description) out.description = out.notes || '-'
  return out
}

// رسالة واضحة لو السبب RLS — تعرض الخطأ الحقيقي ولا تُخفيه
function explainError(msg, usingAdminKey) {
  if (/row-level security|RLS/i.test(msg)) {
    if (usingAdminKey) {
      return `${msg} — حتى مع المفتاح الإداري! تأكد أن المفتاح المُلصق هو "service_role" كاملاً بدون مسافات (وليس anon).`
    }
    return `${msg} — يحتاج مفتاح إداري (service_role) في الحقل أعلاه.`
  }
  return msg
}

/**
 * يرفع كل الجداول المحلية غير الموجودة في السيرفر بالترتيب الصحيح
 * (يحترم العلاقات: المخيمات/الأسر أولاً، ثم الأفراد، ثم الدفعات، ثم الاستلام)
 */
export async function pushLocalChanges(onProgress = () => {}, adminKey = null) {
  const cleanedKey = adminKey ? adminKey.replace(/\s+/g, '').trim() : null

  const db_client = cleanedKey
    ? createClient(SUPABASE_URL, cleanedKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : supabase

  const report = {
    families:            { uploaded: 0, total: 0 },
    family_members:      { uploaded: 0, total: 0 },
    dist_rounds:          { uploaded: 0, total: 0 },
    camp_distributions:   { uploaded: 0, total: 0 },
    camp_dist_families:   { uploaded: 0, total: 0 },
    errors: [],
  }

  if (cleanedKey) {
    onProgress(`🔑 استخدام مفتاح إداري (${cleanedKey.length} حرف)...`)
    const { error: testErr } = await db_client.from('families').select('id').limit(1)
    if (testErr) {
      report.errors.push(`المفتاح الإداري غير صالح: ${testErr.message} (تأكد من نسخه كاملاً بدون مسافات أو أسطر زائدة، طول المفتاح الصحيح ~220 حرف)`)
      return report
    }
    onProgress('✅ المفتاح الإداري صالح')
  }

  if (!navigator.onLine) {
    report.errors.push('لا يوجد اتصال بالإنترنت')
    return report
  }

  const db = await getDb()

  // كاش الأسر الصحيحة على السيرفر — يُستخدم لفلترة family_members (يمنع خطأ FK)
  let validFamilyIds = null
  async function getValidFamilyIds() {
    if (validFamilyIds) return validFamilyIds
    const { data } = await db_client.from('families').select('id')
    validFamilyIds = new Set((data || []).map(r => r.id))
    return validFamilyIds
  }

  // دالة عامة: رفع جدول كامل (الفرق فقط) بدفعات — مع تجاوز الدفعة الفاشلة بدل التوقف الكامل
  async function pushTable(table, idKey = 'id', extraFilter = null) {
    onProgress(`📋 فحص ${table}...`)
    let local = await sqliteGetAll(db, table)
    report[table].total = local.length
    if (!local.length) return

    // فلترة FK: family_members يجب أن تشير لأسرة موجودة فعلياً
    if (table === 'family_members') {
      const validIds = await getValidFamilyIds()
      const before = local.length
      local = local.filter(r => validIds.has(r.family_id))
      if (local.length < before) {
        report.errors.push(`family_members: تم تجاهل ${before - local.length} فرد يشير لأسرة غير موجودة على السيرفر`)
      }
    }

    let query = db_client.from(table).select(idKey)
    if (extraFilter) query = query.eq(extraFilter.col, extraFilter.val)
    const { data: serverRows, error: selErr } = await query
    if (selErr) {
      report.errors.push(`${table} (قراءة): ${explainError(selErr.message, !!adminKey)}`)
      return
    }
    const serverIds = new Set((serverRows || []).map(r => r[idKey]))
    const missing = local.filter(r => !serverIds.has(r[idKey]))
    if (!missing.length) {
      onProgress(`✅ ${table}: لا يوجد جديد`)
      return
    }
    onProgress(`📤 رفع ${missing.length} سجل إلى ${table}...`)

    const BATCH = 50
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH).map(r => clean(table, r))
      try {
        const { error } = await db_client.from(table).upsert(batch)
        if (error) throw error
        report[table].uploaded += batch.length
        onProgress(`✅ ${table}: ${report[table].uploaded}/${missing.length}`)
      } catch (e) {
        // لا نتوقف بالكامل — نحاول صفاً بصف لإنقاذ ما يمكن إنقاذه من هذه الدفعة
        let rowSuccess = 0
        for (const row of batch) {
          try {
            const { error: rowErr } = await db_client.from(table).upsert([row])
            if (!rowErr) rowSuccess++
          } catch {}
        }
        report[table].uploaded += rowSuccess
        if (rowSuccess < batch.length) {
          report.errors.push(`${table} (دفعة ${i / BATCH + 1}): ${explainError(e.message, !!adminKey)} — نجح ${rowSuccess}/${batch.length} فردياً`)
        }
      }
    }
  }

  // مثل pushTable لكن تأخذ قائمة جاهزة بدل القراءة من SQLite (للسجلات المُفلترة مسبقاً)
  async function pushTableFromList(table, local, idKey = 'id') {
    report[table].total = local.length
    if (!local.length) return
    const { data: serverRows, error: selErr } = await db_client.from(table).select(idKey)
    if (selErr) {
      report.errors.push(`${table} (قراءة): ${explainError(selErr.message, !!adminKey)}`)
      return
    }
    const serverIds = new Set((serverRows || []).map(r => r[idKey]))
    const missing = local.filter(r => !serverIds.has(r[idKey]))
    if (!missing.length) return
    onProgress(`📤 رفع ${missing.length} سجل إلى ${table}...`)
    const BATCH = 50
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH).map(r => clean(table, r))
      try {
        const { error } = await db_client.from(table).upsert(batch)
        if (error) throw error
        report[table].uploaded += batch.length
        onProgress(`✅ ${table}: ${report[table].uploaded}/${missing.length}`)
      } catch (e) {
        let rowSuccess = 0
        for (const row of batch) {
          try {
            const { error: rowErr } = await db_client.from(table).upsert([row])
            if (!rowErr) rowSuccess++
          } catch {}
        }
        report[table].uploaded += rowSuccess
        if (rowSuccess < batch.length) {
          report.errors.push(`${table} (دفعة): ${explainError(e.message, !!adminKey)} — نجح ${rowSuccess}/${batch.length} فردياً`)
        }
      }
    }
  }

  // الترتيب يحترم العلاقات الخارجية (FK)
  await pushTable('families', 'id', { col: 'org_id', val: ORG_ID })
  await pushTable('family_members')
  await pushTable('dist_rounds', 'id', { col: 'org_id', val: ORG_ID })
  await pushTable('camp_distributions', 'id', { col: 'org_id', val: ORG_ID })

  // camp_dist_families: استثنِ أي سجل يشير لدفعة غير موجودة فعلياً على السيرفر (يمنع خطأ FK)
  onProgress('📋 فحص distribution_id الصحيحة...')
  const { data: validDists } = await db_client.from('camp_distributions').select('id')
  const validDistIds = new Set((validDists || []).map(d => d.id))
  const allLocalDistFam = await sqliteGetAll(db, 'camp_dist_families')
  const validLocalDistFam = allLocalDistFam.filter(r => validDistIds.has(r.distribution_id))
  if (validLocalDistFam.length < allLocalDistFam.length) {
    report.errors.push(`camp_dist_families: تم تجاهل ${allLocalDistFam.length - validLocalDistFam.length} سجل يشير لدفعة غير موجودة على السيرفر`)
  }
  await pushTableFromList('camp_dist_families', validLocalDistFam)

  onProgress('✅ اكتمل الرفع')
  return report
}
