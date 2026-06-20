/**
 * familyApproval.js — نظام موافقة platform_owner على عمليات الأسر
 * ════════════════════════════════════════════════════════════
 * كل من ليس platform_owner (ولا له bypass_approval=true) يحتاج موافقة
 * على إضافة/تعديل/حذف أي أسرة. العملية تُنفَّذ فوراً، لكن تُعلَّم
 * "قيد المراجعة" حتى يوافق/يرفض platform_owner.
 *
 * يُستخدم سجل family_history الموجود (بدل جدول جديد) — أضيفت له أعمدة
 * status/reviewed_by/reviewed_at/review_note (انظر 04_approval_system_using_family_history.sql)
 */
import { supabase, ORG_ID } from './supabase'

/** هل هذا المستخدم معفى من نظام الموافقة (تنفيذ فوري بدون مراجعة)؟ */
export function isExemptFromApproval(profile) {
  if (!profile) return false
  return profile.role === 'platform_owner' || profile.bypass_approval === true
}

/**
 * يسجّل طلب مراجعة لعملية على أسرة (insert/update/delete) في family_history
 * ويُحدّث review_status/pending_delete على families حسب الحالة.
 * لا يرمي استثناء أبداً — فشل تسجيل المراجعة لا يجب أن يفشل العملية الأساسية.
 */
export async function recordApprovalRequest({ familyId, action, oldData, newData, changes, actorId, actorName, actorRole }) {
  try {
    await supabase.from('family_history').insert({
      org_id:      ORG_ID,
      family_id:   familyId || null,
      action,                      // 'insert' | 'update' | 'delete'
      changed_by:  actorId || null,
      user_name:   actorName || '—',
      user_role:   actorRole || null,
      old_data:    oldData || null,
      new_data:    newData || null,
      changes:     changes && Object.keys(changes).length ? changes : null,
      status:      'pending',
    })

    // علّم الأسرة نفسها بحالة المراجعة (إلا في حالة الحذف، حيث نستخدم pending_delete)
    if (familyId && action !== 'delete') {
      await supabase.from('families').update({ review_status: 'pending' }).eq('id', familyId)
    } else if (familyId && action === 'delete') {
      await supabase.from('families').update({ pending_delete: true }).eq('id', familyId)
    }
  } catch (e) {
    console.warn('[familyApproval] فشل تسجيل طلب المراجعة:', e.message)
  }
}

/** يجلب كل الطلبات المعلّقة (status='pending') لعرضها في صفحة المراجعة */
export async function fetchPendingRequests() {
  try {
    const { data, error } = await supabase
      .from('family_history')
      .select('*')
      .eq('org_id', ORG_ID)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('[familyApproval] فشل جلب الطلبات المعلّقة:', e.message)
    return []
  }
}

/** عدد الطلبات المعلّقة فقط (لمربع الداشبورد) */
export async function countPendingRequests() {
  try {
    const { count, error } = await supabase
      .from('family_history')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', ORG_ID)
      .eq('status', 'pending')
    if (error) throw error
    return count || 0
  } catch (e) {
    console.warn('[familyApproval] فشل عد الطلبات المعلّقة:', e.message)
    return 0
  }
}

/**
 * موافقة platform_owner على طلب:
 * - insert/update: review_status='approved' على الأسرة، الطلب status='approved'
 * - delete: حذف فعلي نهائي للأسرة وأفرادها، الطلب status='approved'
 */
export async function approveRequest(request, reviewer) {
  const { id, family_id, action } = request
  try {
    if (action === 'delete') {
      // حذف فعلي نهائي — يتطلب صلاحية platform_owner على families (RLS تتحقق فعلياً)
      await supabase.from('family_members').delete().eq('family_id', family_id)
      await supabase.from('families').delete().eq('id', family_id)
    } else if (family_id) {
      await supabase.from('families').update({ review_status: 'approved' }).eq('id', family_id)
    }
    await supabase.from('family_history').update({
      status: 'approved',
      reviewed_by: reviewer?.user_id || reviewer?.id || null,
      reviewed_by_name: reviewer?.full_name || '—',
      reviewed_at: new Date().toISOString(),
    }).eq('id', id)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/**
 * رفض platform_owner لطلب:
 * - insert جديد بالكامل: السجل يبقى موجوداً معلَّماً review_status='rejected' (سجل تاريخي، لا حذف)
 * - update: rollback تلقائي لبيانات old_data
 * - delete: إلغاء علم pending_delete، الأسرة تعود تظهر طبيعية
 */
export async function rejectRequest(request, reviewer, note) {
  const { id, family_id, action, old_data } = request
  try {
    if (action === 'insert') {
      if (family_id) {
        await supabase.from('families').update({ review_status: 'rejected' }).eq('id', family_id)
      }
    } else if (action === 'update') {
      if (family_id && old_data) {
        // rollback: استرجاع البيانات القديمة كاملة + إلغاء حالة المراجعة
        const restoreData = { ...old_data, review_status: 'approved' }
        delete restoreData.id // لا نسمح بتغيير id عن طريق الخطأ
        await supabase.from('families').update(restoreData).eq('id', family_id)
      }
    } else if (action === 'delete') {
      if (family_id) {
        await supabase.from('families').update({ pending_delete: false }).eq('id', family_id)
      }
    }
    await supabase.from('family_history').update({
      status: 'rejected',
      reviewed_by: reviewer?.user_id || reviewer?.id || null,
      reviewed_by_name: reviewer?.full_name || '—',
      reviewed_at: new Date().toISOString(),
      review_note: note || null,
    }).eq('id', id)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
