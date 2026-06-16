/**
 * UserController.js
 */
import { User } from '../models'
import { hasPermission, getCreatableRoles } from '../lib/permissions'
import { supabase, ORG_ID } from '../lib/supabase'

export const UserController = {

  async index(profile) {
    if (!hasPermission(profile, 'manage_users')) throw new Error('⛔ غير مصرح')
    const all = await User.findAll({}, { orderBy: 'created_at' })
    // فلترة حسب الدور
    if (profile.role === 'camp_delegate') {
      return all.filter(u => u.created_by === profile.user_id || u.id === profile.id)
    }
    if (profile.role === 'super_admin') {
      return all.filter(u => u.role !== 'platform_owner')
    }
    return all
  },

  async store(data, profile) {
    const allowed = getCreatableRoles(profile)
    if (!allowed.includes(data.role)) throw new Error(`⛔ لا تستطيع إنشاء دور ${data.role}`)

    const { email, password, ...rest } = data
    // إنشاء Auth user أولاً
    const { data: authData, error } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true
    })
    if (error) throw error

    const user = await User.create({
      ...rest,
      user_id: authData.user.id,
      org_id: ORG_ID,
      created_by: profile.user_id,
      must_change_pass: true,
    })
    return user
  },

  async update(id, data, profile) {
    if (!hasPermission(profile, 'manage_users')) throw new Error('⛔ غير مصرح')
    return User.update(id, data)
  },

  async destroy(id, profile) {
    if (!hasPermission(profile, 'admin')) throw new Error('⛔ غير مصرح')
    return User.delete(id)
  },
}
