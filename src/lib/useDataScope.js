import { useAuth } from '../context/AuthContext'
import { ORG_ID } from './supabase'
import { localDB } from './db'

/**
 * hook يُحدد نطاق البيانات المسموح بها حسب دور المستخدم
 * المندوب والمساعد → مخيمهم فقط
 * مدير الإيواء → مخيماته
 * مالك المنصة → كل شيء
 */
export function useDataScope() {
  const { effectiveProfile, isOwner, isSuperAdmin, isCampDelegate, isAssistant } = useAuth()

  // معرّفات المخيمات المسموح بها (null = كل شيء)
  function getAllowedCampIds(allCamps) {
    if (!effectiveProfile) return []
    if (isOwner) return null // كل شيء

    const campId = effectiveProfile.camp_id

    if (isSuperAdmin && !isCampDelegate) {
      // مدير إيواء — يرى مخيماته (حيث manager_id = هو)
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
   * فلترة البيانات المحلية (Dexie)
   */
  function filterLocal(items, campIds, campField = 'camp_id') {
    if (campIds === null) return items
    if (campIds.length === 0) return []
    const set = new Set(campIds)
    return items.filter(item => set.has(item[campField]))
  }

  return { getAllowedCampIds, applyScope, filterLocal, effectiveProfile }
}
