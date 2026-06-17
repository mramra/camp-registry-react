/**
 * pushLocalChanges.js — رفع البيانات المحلية غير المرفوعة
 *
 * آمن 100%:
 *   - يرفع فقط، لا يحذف شيئاً محلياً
 *   - يقارن SQLite بـ Supabase
 *   - أي سجل محلي غير موجود في السيرفر → يرفعه (upsert)
 *   - يُرجع تقريراً مفصلاً بما رُفع
 */
import { supabase, ORG_ID } from './supabase'

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

// الحقول المقبولة في Supabase لكل جدول
const ALLOWED = {
  families: ['id','org_id','camp_id','head_name','head_id','head_gender','head_dob',
    'head_marital','phone1','phone2','tent','original_address','address_details',
    'status','notes','category_tags','economic_level','version','created_at','updated_at','created_by','updated_by'],
  family_members: ['id','family_id','name','national_id','relation','dob','gender',
    'health','chronic_diseases','disabilities','injuries','orphan_status','notes','created_at','updated_at'],
}

function clean(table, rec) {
  const allowed = ALLOWED[table]
  const out = {}
  for (const k of Object.keys(rec)) {
    if (!allowed || allowed.includes(k)) out[k] = rec[k]
  }
  // category_tags: حوّل لـ JSON string إذا array
  if (Array.isArray(out.category_tags)) out.category_tags = JSON.stringify(out.category_tags)
  return out
}

/**
 * يرفع الأسر والأفراد غير الموجودين في السيرفر
 * onProgress: callback(msg) لعرض التقدم
 */
export async function pushLocalChanges(onProgress = () => {}) {
  const report = {
    families:       { uploaded: 0, total: 0, ids: [] },
    family_members: { uploaded: 0, total: 0, ids: [] },
    errors: [],
  }

  if (!navigator.onLine) {
    report.errors.push('لا يوجد اتصال بالإنترنت')
    return report
  }

  // ═══ 1. الأسر ═══════════════════════════════════════════
  onProgress('📋 فحص الأسر...')
  const db = await getDb()
  const localFams = await sqliteGetAll(db, 'families')
  report.families.total = localFams.length

  // جلب IDs الموجودة في السيرفر
  const { data: serverFams } = await supabase
    .from('families').select('id').eq('org_id', ORG_ID)
  const serverFamIds = new Set((serverFams || []).map(f => f.id))

  // الأسر المحلية غير الموجودة في السيرفر
  const missingFams = localFams.filter(f => !serverFamIds.has(f.id))
  onProgress(`📤 رفع ${missingFams.length} أسرة جديدة...`)

  for (const fam of missingFams) {
    try {
      const { error } = await supabase.from('families').upsert(clean('families', fam))
      if (error) throw error
      report.families.uploaded++
      report.families.ids.push(fam.id)
      onProgress(`✅ رُفعت: ${fam.head_name}`)
    } catch(e) {
      report.errors.push(`أسرة ${fam.head_name}: ${e.message}`)
    }
  }

  // ═══ 2. الأفراد ═════════════════════════════════════════
  onProgress('👤 فحص الأفراد...')
  const localMems = await sqliteGetAll(db, 'family_members')
  report.family_members.total = localMems.length

  const { data: serverMems } = await supabase.from('family_members').select('id')
  const serverMemIds = new Set((serverMems || []).map(m => m.id))

  const missingMems = localMems.filter(m => !serverMemIds.has(m.id))
  onProgress(`📤 رفع ${missingMems.length} فرد جديد...`)

  // رفع بدفعات من 50
  const BATCH = 50
  for (let i = 0; i < missingMems.length; i += BATCH) {
    const batch = missingMems.slice(i, i + BATCH).map(m => clean('family_members', m))
    try {
      const { error } = await supabase.from('family_members').upsert(batch)
      if (error) throw error
      report.family_members.uploaded += batch.length
      onProgress(`✅ رُفع ${report.family_members.uploaded}/${missingMems.length} فرد`)
    } catch(e) {
      report.errors.push(`دفعة أفراد: ${e.message}`)
    }
  }

  onProgress('✅ اكتمل الرفع')
  return report
}
