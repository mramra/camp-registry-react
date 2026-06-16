/**
 * Movement.js — نموذج حركات الأسر
 */
import { BaseModel } from './BaseModel'

export class Movement extends BaseModel {
  static table    = 'family_movements'
  static hasOrgId = true

  static async byFamily(familyId) {
    return this.findAll({ family_id: familyId }, { orderBy: 'moved_at' })
  }
}
