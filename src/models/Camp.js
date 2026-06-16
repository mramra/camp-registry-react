/**
 * Camp.js — نموذج المخيم
 */
import { BaseModel } from './BaseModel'
import { supabase, ORG_ID } from '../lib/supabase'

export class Camp extends BaseModel {
  static table    = 'camps'
  static hasOrgId = true

  // مخيمات رئيسية فقط
  static async mainCamps() {
    return this.findAll({}, { orderBy: 'name' }).then(
      camps => camps.filter(c => !c.parent_camp_id)
    )
  }

  // مخيم مع فروعه
  static async findWithChildren(id) {
    const [camp, children] = await Promise.all([
      this.find(id),
      this.findAll({ parent_camp_id: id }),
    ])
    return { ...camp, children }
  }

  // كل المخيمات هرمياً
  static async hierarchy() {
    const all = await this.findAll({}, { orderBy: 'name' })
    const mains = all.filter(c => !c.parent_camp_id)
    return mains.map(m => ({
      ...m,
      children: all.filter(c => c.parent_camp_id === m.id)
    }))
  }
}
