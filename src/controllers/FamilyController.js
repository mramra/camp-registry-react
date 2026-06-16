/**
 * FamilyController.js
 * مثل App\Http\Controllers\FamilyController في Laravel
 * يحتوي المنطق التجاري — الـ View (صفحة React) تستدعيه فقط
 */
import { Family, FamilyMember } from '../models'
import { hasPermission } from '../lib/permissions'
import { deltaSync }     from '../lib/deltaSync'

export const FamilyController = {

  // GET /families
  async index(profile, { campFilter, search, page = 1 } = {}) {
    if (!hasPermission(profile, 'view')) throw new Error('غير مصرح')
    if (search) return Family.search(search, campFilter)
    if (campFilter) return Family.byCamp(campFilter)
    return Family.findAll({}, { orderBy: 'created_at' })
  },

  // GET /families/:id
  async show(id, profile) {
    const family = await Family.findWithMembers(id)
    if (!family) throw new Error('الأسرة غير موجودة')
    return family
  },

  // POST /families
  async store(data, members = [], profile) {
    if (!hasPermission(profile, 'write')) throw new Error('⛔ غير مصرح بالإضافة')
    const family = await Family.create(data)
    if (members.length) {
      await Promise.all(members.map(m =>
        FamilyMember.create({ ...m, family_id: family.id })
      ))
    }
    return family
  },

  // PUT /families/:id
  async update(id, data, members = [], profile) {
    if (!hasPermission(profile, 'edit')) throw new Error('⛔ غير مصرح بالتعديل')
    const family = await Family.update(id, data)
    // مزامنة ذكية للأفراد (diff فقط)
    await FamilyMember.syncMembers(id, members)
    return family
  },

  // DELETE /families/:id
  async destroy(id, profile) {
    if (!hasPermission(profile, 'delete')) throw new Error('⛔ غير مصرح بالحذف')
    await Family.deleteWithMembers(id)
    return { deleted: id }
  },

  // إحصائيات
  async stats(campFilter = null) {
    const filters = campFilter ? { camp_id: campFilter } : {}
    const [families, members] = await Promise.all([
      Family.count(filters),
      FamilyMember.count(),
    ])
    return { families, members }
  },
}
