/**
 * Distribution.js — نموذج التوزيعات
 */
import { BaseModel } from './BaseModel'
import { supabase, ORG_ID } from '../lib/supabase'

export class DistRound extends BaseModel {
  static table    = 'dist_rounds'
  static hasOrgId = true

  static async active() {
    return this.findAll({ status: 'active' })
  }
}

export class CampDistribution extends BaseModel {
  static table    = 'camp_distributions'
  static hasOrgId = true
}

export class DistFamily extends BaseModel {
  static table    = 'camp_dist_families'
  static hasOrgId = false

  // تسجيل استلام
  static async markReceived(distributionId, familyId, receivedBy) {
    const doc = {
      distribution_id: distributionId,
      family_id: familyId,
      received: true,
      received_at: new Date().toISOString(),
      received_by: receivedBy,
    }
    const { data, error } = await supabase.from('camp_dist_families')
      .upsert(doc, { onConflict: 'distribution_id,family_id' }).select().single()
    if (error) throw error
    return data
  }
}
