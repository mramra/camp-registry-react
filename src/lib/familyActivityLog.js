/**
 * familyActivityLog.js — تسجيل نشاط الأسر (إضافة / تعديل / حذف)
 * يُستخدم من FamilyForm (إضافة/تعديل) و FamiliesList (حذف)
 * ويُقرأ من Dashboard لعرض "آخر تعديلات الأسر"
 */
import { supabase, ORG_ID } from './supabase'

// الحقول القابلة للتتبع عند التعديل + تسمياتها بالعربية للعرض
export const TRACKED_FIELDS = {
  head_name:        'اسم رب الأسرة',
  head_id:           'رقم الهوية',
  head_gender:       'الجنس',
  head_dob:          'تاريخ الميلاد',
  head_marital:      'الحالة الاجتماعية',
  phone1:            'الهاتف 1',
  phone2:            'الهاتف 2',
  camp_id:           'المخيم',
  tent:              'الخيمة',
  original_address:  'العنوان الأصلي',
  address_details:   'تفاصيل العنوان',
  notes:             'ملاحظات',
  economic_level:    'المستوى الاقتصادي',
  status:            'الحالة',
}

/**
 * يحسب الفرق بين بيانات الأسرة القديمة والجديدة
 * يُرجع كائناً بالشكل: { field: { old, new } } لكل حقل تغيّر فعلياً فقط
 * valueResolvers: دالة اختيارية لكل حقل لتحويل القيمة الخام (مثل camp_id) لنص مقروء قبل التخزين
 */
export function diffFamilyFields(oldData, newData, valueResolvers = {}) {
  const changes = {}
  for (const field of Object.keys(TRACKED_FIELDS)) {
    const oldRaw = oldData?.[field] ?? null
    const newRaw = newData?.[field] ?? null
    const oldStr = oldRaw === null || oldRaw === '' ? null : String(oldRaw)
    const newStr = newRaw === null || newRaw === '' ? null : String(newRaw)
    if (oldStr !== newStr) {
      const resolve = valueResolvers[field]
      changes[field] = {
        old: resolve && oldStr ? resolve(oldStr) : oldStr,
        new: resolve && newStr ? resolve(newStr) : newStr,
      }
    }
  }
  return changes
}

/**
 * يسجّل عملية على أسرة في جدول family_activity_log
 * لا يرمي استثناء أبداً — التسجيل لا يجب أن يفشل عملية الحفظ/الحذف الأساسية
 */
export async function logFamilyActivity({ familyId, familyName, membersCount, action, actorId, actorName, changes }) {
  try {
    if (!navigator.onLine) return // أوف لاين: لا تسجيل فوري (انظر _activity للحذف الأوف لاين)
    await supabase.from('family_activity_log').insert({
      org_id:        ORG_ID,
      family_id:     familyId || null,
      family_name:   familyName || '—',
      members_count: membersCount || 0,
      action,                         // 'insert' | 'update' | 'delete'
      actor_id:      actorId || null,
      actor_name:    actorName || '—',
      changes:       changes && Object.keys(changes).length ? changes : null,
    })
  } catch (e) {
    console.warn('[family_activity_log]', e.message)
  }
}

/**
 * يجلب آخر N عملية من سجل النشاط (للوحة التحكم)
 */
export async function fetchRecentFamilyActivity(limit = 5) {
  try {
    const { data, error } = await supabase
      .from('family_activity_log')
      .select('*')
      .eq('org_id', ORG_ID)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[fetchRecentFamilyActivity]', e.message)
    return []
  }
}
