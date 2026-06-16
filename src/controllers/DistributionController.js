/**
 * DistributionController.js
 */
import { DistRound, CampDistribution, DistFamily } from '../models'
import { hasPermission } from '../lib/permissions'

export const DistributionController = {

  async rounds(profile) {
    return DistRound.findAll({}, { orderBy: 'created_at' })
  },

  async createRound(data, profile) {
    if (!hasPermission(profile, 'admin')) throw new Error('⛔ غير مصرح')
    return DistRound.create({ ...data, created_by: profile.user_id })
  },

  async markReceived(distributionId, familyId, profile) {
    if (!hasPermission(profile, 'write')) throw new Error('⛔ غير مصرح')
    return DistFamily.markReceived(distributionId, familyId, profile.user_id)
  },

  async stats(roundId) {
    const [total, received] = await Promise.all([
      DistFamily.count({ distribution_id: roundId }),
      DistFamily.count({ distribution_id: roundId, received: true }),
    ])
    return { total, received, pending: total - received, pct: total ? Math.round(received/total*100) : 0 }
  },
}
