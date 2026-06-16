/**
 * User.js — نموذج المستخدم
 */
import { BaseModel } from './BaseModel'
import { supabase, ORG_ID } from '../lib/supabase'

export class User extends BaseModel {
  static table    = 'org_members'
  static hasOrgId = true

  // بحث بـ user_id
  static async findByUserId(userId) {
    const { data } = await supabase.from('org_members')
      .select('*').eq('user_id', userId).eq('org_id', ORG_ID).single()
    return data
  }

  // مستخدمو مخيم معين
  static async byCamp(campId) {
    return this.findAll({ camp_id: campId })
  }

  // تغيير كلمة المرور
  static async resetPassword(userId, newPassword) {
    const { error } = await supabase.auth.admin.updateUserById(userId, { password: newPassword })
    if (error) throw error
    await supabase.from('org_members').update({ must_change_pass: false }).eq('user_id', userId)
    return true
  }
}
