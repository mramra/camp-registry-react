/**
 * CampController.js
 */
import { Camp } from '../models'
import { hasPermission } from '../lib/permissions'

export const CampController = {

  async index() {
    return Camp.hierarchy()
  },

  async show(id) {
    return Camp.findWithChildren(id)
  },

  async store(data, profile) {
    if (!hasPermission(profile, 'admin')) throw new Error('⛔ مدير إيواء فقط')
    return Camp.create(data)
  },

  async update(id, data, profile) {
    if (!hasPermission(profile, 'admin')) throw new Error('⛔ مدير إيواء فقط')
    return Camp.update(id, data)
  },

  async destroy(id, profile) {
    if (!hasPermission(profile, 'owner')) throw new Error('⛔ مالك المنصة فقط')
    return Camp.delete(id)
  },
}
