/**
 * BaseModel.js — قاعدة كل الـ Models
 * يوفر: find, findAll, create, update, delete, count
 * مثل Eloquent في Laravel
 */
import { supabase, ORG_ID } from '../lib/supabase'

async function getSQLite() {
  try {
    const { getPowerSync } = await import('../lib/powersync')
    return getPowerSync()
  } catch { return null }
}

export class BaseModel {
  static table    = ''
  static hasOrgId = true

  // ── قراءة ─────────────────────────────────────────────
  static async find(id) {
    const db = await getSQLite()
    if (db) {
      try {
        const rows = await db.getAll(`SELECT * FROM ${this.table} WHERE id = ?`, [id])
        if (rows?.[0]) return rows[0]
      } catch {}
    }
    const { data } = await supabase.from(this.table).select('*').eq('id', id).single()
    return data
  }

  static async findAll(filters = {}, options = {}) {
    const { orderBy = 'created_at', limit } = options
    const db = await getSQLite()

    if (db) {
      try {
        const keys = Object.keys(filters)
        let sql = `SELECT * FROM ${this.table}`
        const params = []
        if (keys.length) {
          sql += ' WHERE ' + keys.map(k => `${k} = ?`).join(' AND ')
          keys.forEach(k => params.push(filters[k]))
        }
        sql += ` ORDER BY ${orderBy}`
        if (limit) sql += ` LIMIT ${limit}`
        const rows = await db.getAll(sql, params)
        if (rows?.length) return rows
      } catch {}
    }

    let q = supabase.from(this.table).select('*').order(orderBy)
    if (this.hasOrgId) q = q.eq('org_id', ORG_ID)
    Object.entries(filters).forEach(([k, v]) => { q = q.eq(k, v) })
    if (limit) q = q.limit(limit)
    const { data } = await q
    return data || []
  }

  static async count(filters = {}) {
    let q = supabase.from(this.table)
      .select('*', { count: 'exact', head: true })
    if (this.hasOrgId) q = q.eq('org_id', ORG_ID)
    Object.entries(filters).forEach(([k, v]) => { q = q.eq(k, v) })
    const { count } = await q
    return count ?? 0
  }

  // ── كتابة ─────────────────────────────────────────────
  static async create(data) {
    const now = new Date().toISOString()
    const doc = {
      ...data,
      ...(this.hasOrgId ? { org_id: ORG_ID } : {}),
      created_at: now,
      updated_at: now,
    }
    const { data: created, error } = await supabase.from(this.table).insert(doc).select().single()
    if (error) throw error
    // حفظ محلي
    await this._saveLocal(created || doc)
    return created || doc
  }

  static async update(id, data) {
    const now = new Date().toISOString()
    const doc = { ...data, updated_at: now }
    const { data: updated, error } = await supabase.from(this.table).update(doc).eq('id', id).select().single()
    if (error) throw error
    await this._saveLocal(updated || { ...doc, id })
    return updated || { ...doc, id }
  }

  static async delete(id) {
    const { error } = await supabase.from(this.table).delete().eq('id', id)
    if (error) throw error
    await this._deleteLocal(id)
    return true
  }

  // ── محلي (internal) ────────────────────────────────────
  static async _saveLocal(doc) {
    const db = await getSQLite()
    if (db) {
      try {
        const d = { ...doc }
        if (Array.isArray(d.category_tags)) d.category_tags = JSON.stringify(d.category_tags)
        const cols = Object.keys(d)
        await db.execute(
          `INSERT OR REPLACE INTO ${this.table} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`,
          Object.values(d)
        )
      } catch {}
    }
  }

  static async _deleteLocal(id) {
    const db = await getSQLite()
    if (db) {
      try { await db.execute(`DELETE FROM ${this.table} WHERE id = ?`, [id]) } catch {}
    }
  }
}
