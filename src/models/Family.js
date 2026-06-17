/**
 * Family.js — نموذج الأسرة
 * مثل: App\Models\Family في Laravel
 */
import { BaseModel } from './BaseModel'
import { supabase, ORG_ID } from '../lib/supabase'

export class Family extends BaseModel {
  static table    = 'families'
  static hasOrgId = true

  // جلب أسرة مع أفرادها (مثل with('members'))
  static async findWithMembers(id) {
    const [family, members] = await Promise.all([
      this.find(id),
      FamilyMember.findAll({ family_id: id }),
    ])
    return family ? { ...family, members: members || [] } : null
  }

  // أسر مخيم معين
  static async byCamp(campId) {
    return this.findAll({ camp_id: campId }, { orderBy: 'tent' })
  }

  // بحث
  static async search(term, campFilter = null) {
    let q = supabase.from('families').select('*').eq('org_id', ORG_ID)
    if (campFilter) q = q.eq('camp_id', campFilter)
    if (term) q = q.or(`head_name.ilike.%${term}%,head_id.ilike.%${term}%,tent.ilike.%${term}%`)
    const { data } = await q.order('tent').limit(200)
    return data || []
  }

  // حذف أسرة مع أفرادها
  static async deleteWithMembers(id) {
    await supabase.from('family_members').delete().eq('family_id', id)
    await this.delete(id) // يحذف الأسرة من Supabase + SQLite (عبر BaseModel._deleteLocal)
    // حذف أفراد الأسرة من SQLite محلياً أيضاً
    try {
      const { getPowerSync } = await import('../lib/powersync')
      const db = getPowerSync()
      if (db) await db.execute(`DELETE FROM family_members WHERE family_id = ?`, [id])
    } catch {}
    return true
  }
}

export class FamilyMember extends BaseModel {
  static table    = 'family_members'
  static hasOrgId = false

  // حفظ ذكي: insert/update/delete حسب الـ diff
  static async syncMembers(familyId, newMembers) {
    const existing = await this.findAll({ family_id: familyId })
    const existMap = Object.fromEntries(existing.map(m => [m.id, m]))
    const newMap   = Object.fromEntries(newMembers.filter(m=>m.id).map(m => [m.id, m]))

    const toInsert = newMembers.filter(m => !m.id || !existMap[m.id])
    const toUpdate = newMembers.filter(m => m.id && existMap[m.id])
    const toDelete = existing.filter(m => !newMap[m.id])

    await Promise.all([
      ...toInsert.map(m => supabase.from('family_members').insert({ ...m, family_id: familyId })),
      ...toUpdate.map(m => supabase.from('family_members').update(m).eq('id', m.id)),
      ...toDelete.map(m => supabase.from('family_members').delete().eq('id', m.id)),
    ])
  }
}
