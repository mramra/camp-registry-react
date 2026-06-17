/**
 * familyActivityLog.js — تسجيل نشاط الأسر (إضافة / تعديل / حذف)
 * يُستخدم من FamilyForm (إضافة/تعديل) و FamiliesList (حذف)
 * ويُقرأ من Dashboard لعرض "آخر تعديلات الأسر"
 */
import { supabase, ORG_ID } from './supabase'

/**
 * يسجّل عملية على أسرة في جدول family_activity_log
 * لا يرمي استثناء أبداً — التسجيل لا يجب أن يفشل عملية الحفظ/الحذف الأساسية
 */
export async function logFamilyActivity({ familyId, familyName, membersCount, action, actorId, actorName }) {
  try {
    if (!navigator.onLine) return // أوف لاين: لا تسجيل فوري (انظر queueFamilyActivityLog للحذف الأوف لاين)
    await supabase.from('family_activity_log').insert({
      org_id:        ORG_ID,
      family_id:     familyId || null,
      family_name:   familyName || '—',
      members_count: membersCount || 0,
      action,                         // 'insert' | 'update' | 'delete'
      actor_id:      actorId || null,
      actor_name:    actorName || '—',
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
