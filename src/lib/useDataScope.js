import { useAuth } from '../context/AuthContext'
import { ORG_ID } from './db'

/**
 * hook يُحدد نطاق البيانات المسموح بها حسب دور المستخدم
 * المندوب والمساعد → مخيمهم فقط
 * مدير الإيواء → مخيماته
 * مالك المنصة → كل شيء
 */
export function useDataScope() {
  const { effectiveProfile, isOwner, isSuperAdmin } = useAuth()

  // معرّفات المخيمات المسموح بها (null = كل شيء)
  function getAllowedCampIds(allCamps) {
    if (!effectiveProfile) return []
    if (isOwner) return null // كل شيء

    const campId = effectiveProfile.camp_id
    const role = effectiveProfile.role

    // مدير إيواء (super_admin) — يرى مخيماته (حيث manager_id = هو) + فروعها،
    // بصرف النظر عن camp_id الخاص به (عادة فاضي لمدير الإيواء).
    if (isSuperAdmin && role === 'super_admin') {
      const managed = allCamps.filter(c => c.manager_id === effectiveProfile.id)
      if (!managed.length) return null // لم يُعيَّن بعد → يرى الكل
      const ids = new Set(managed.map(c => c.id))
      // أضف الفروع
      allCamps.forEach(c => { if (ids.has(c.parent_camp_id)) ids.add(c.id) })
      return [...ids]
    }

    if (campId) {
      // مندوب أو مساعد — مخيمه + فروعه
      const ids = new Set([campId])
      allCamps.forEach(c => { if (c.parent_camp_id === campId) ids.add(c.id) })
      return [...ids]
    }

    return [] // لا مخيم → لا بيانات
  }

  /**
   * تطبيق فلتر المخيم على Supabase query
   * q: supabase query builder
   * campIds: نتيجة getAllowedCampIds()
   */
  function applyScope(q, campIds) {
    if (campIds === null) return q // كل شيء
    if (campIds.length === 0) return q.eq('camp_id', 'NONE') // لا شيء
    if (campIds.length === 1) return q.eq('camp_id', campIds[0])
    return q.in('camp_id', campIds)
  }

  /**
   * فلترة قائمة بيانات (مصفوفة JS عادية) حسب المخيمات المسموحة
   */
  function filterLocal(items, campIds, campField = 'camp_id') {
    if (campIds === null) return items
    if (campIds.length === 0) return []
    const set = new Set(campIds)
    return items.filter(item => set.has(item[campField]))
  }

  /**
   * يُرجع فقط المخيمات المسموح للمستخدم رؤيتها من قائمة كل المخيمات.
   * دالة مركزية واحدة — تُستخدم في كل قائمة/فلتر اختيار مخيم بالتطبيق
   * بدل تكرار نفس منطق "campIds === null ? all : all.filter(...)" بكل صفحة.
   * allCamps: يجب أن تكون كل المخيمات (لا المفلترة مسبقاً) لأن getAllowedCampIds
   * تحتاج كل المخيمات لحساب الفروع (parent_camp_id) وفروع مدير الإيواء (manager_id).
   */
  function getVisibleCamps(allCamps) {
    const campIds = getAllowedCampIds(allCamps)
    return filterLocal(allCamps, campIds, 'id')
  }

  return { getAllowedCampIds, applyScope, filterLocal, getVisibleCamps, effectiveProfile }
}
