/**
 * rxdb.js — RxDB + PostgreSQL (Supabase)
 * التخزين المحلي: RxDB/Dexie (دائم)
 * المزامنة: Supabase PostgreSQL مباشرة
 */
import { createRxDatabase, addRxPlugin } from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { supabase, ORG_ID } from './supabase'

// ── Schemas ──────────────────────────────────────────────
const mk = (extra = {}) => ({
  id:         { type: 'string', maxLength: 36 },
  org_id:     { type: ['string', 'null'] },
  created_at: { type: ['string', 'null'] },
  updated_at: { type: ['string', 'null'] },
  _deleted:   { type: 'boolean', default: false },
  ...extra,
})

const SCHEMAS = {
  families: {
    version: 0, primaryKey: 'id', type: 'object',
    properties: mk({
      camp_id: { type: ['string', 'null'] },
      head_name: { type: 'string' },
      head_id: { type: ['string', 'null'] },
      head_gender: { type: ['string', 'null'] },
      head_dob: { type: ['string', 'null'] },
      head_marital: { type: ['string', 'null'] },
      head_chronic_diseases: { type: ['string', 'null'] },
      head_disabilities: { type: ['string', 'null'] },
      head_injuries: { type: ['string', 'null'] },
      head_female_status: { type: ['string', 'null'] },
      head_orphan_status: { type: ['boolean', 'null'] },
      head_orphan_cause: { type: ['string', 'null'] },
      head_photo_url: { type: ['string', 'null'] },
      phone1: { type: ['string', 'null'] },
      phone2: { type: ['string', 'null'] },
      tent: { type: ['string', 'null'] },
      tent2: { type: ['string', 'null'] },
      address: { type: ['string', 'null'] },
      address_details: { type: ['string', 'null'] },
      original_address: { type: ['string', 'null'] },
      notes: { type: ['string', 'null'] },
      category_tags: { type: 'array', items: { type: 'string' }, default: [] },
      category_details: { type: ['string', 'null'] },
      economic_level: { type: ['string', 'null'] },
      entry_date: { type: ['string', 'null'] },
      exit_date: { type: ['string', 'null'] },
      exit_reason: { type: ['string', 'null'] },
      transferred_to_camp_id: { type: ['string', 'null'] },
      tags: { type: ['string', 'null'] },
      version: { type: ['number', 'null'] },
      client_id: { type: ['string', 'null'] },
      created_by: { type: ['string', 'null'] },
      updated_by: { type: ['string', 'null'] },
    }),
    required: ['id', 'head_name'],
    indexes: ['camp_id', 'org_id', 'updated_at'],
  },

  family_members: {
    version: 0, primaryKey: 'id', type: 'object',
    properties: mk({
      family_id:        { type: 'string' },
      name:             { type: 'string' },
      gender:           { type: ['string', 'null'] },
      relation:         { type: ['string', 'null'] },
      national_id:      { type: ['string', 'null'] },
      dob:              { type: ['string', 'null'] },
      health:           { type: ['string', 'null'] },
      orphan_status:    { type: ['boolean', 'null'] },
      orphan_cause:     { type: ['string', 'null'] },
      chronic_diseases: { type: ['string', 'null'] },
      disabilities:     { type: ['string', 'null'] },
      injuries:         { type: ['string', 'null'] },
    }),
    required: ['id', 'family_id', 'name'],
    indexes: ['family_id', 'national_id'],
  },

  camps: {
    version: 0, primaryKey: 'id', type: 'object',
    properties: mk({
      name:           { type: 'string' },
      camp_type:      { type: ['string', 'null'] },
      parent_camp_id: { type: ['string', 'null'] },
      address:        { type: ['string', 'null'] },
      capacity:       { type: ['number', 'null'] },
      status:         { type: ['string', 'null'] },
      manager_id:     { type: ['string', 'null'] },
      latitude:       { type: ['number', 'null'] },
      longitude:      { type: ['number', 'null'] },
      portal_open:    { type: ['boolean', 'null'] },
    }),
    required: ['id', 'name'],
    indexes: ['org_id', 'parent_camp_id'],
  },

  org_members: {
    version: 0, primaryKey: 'id', type: 'object',
    properties: mk({
      user_id:          { type: ['string', 'null'] },
      full_name:        { type: 'string' },
      national_id:      { type: ['string', 'null'] },
      phone:            { type: ['string', 'null'] },
      role:             { type: 'string' },
      camp_id:          { type: ['string', 'null'] },
      supervisor_id:    { type: ['string', 'null'] },
      is_active:        { type: ['boolean', 'null'] },
      must_change_pass: { type: ['boolean', 'null'] },
      can_add:          { type: ['boolean', 'null'] },
      can_edit:         { type: ['boolean', 'null'] },
      can_delete:       { type: ['boolean', 'null'] },
      can_export:       { type: ['boolean', 'null'] },
      can_import:       { type: ['boolean', 'null'] },
      allowed_pages:    { type: ['string', 'null'] },
      delegate_camps:   { type: ['string', 'null'] },
    }),
    required: ['id', 'full_name', 'role'],
    indexes: ['org_id', 'role', 'camp_id', 'supervisor_id', 'user_id'],
  },

  family_movements: {
    version: 0, primaryKey: 'id', type: 'object',
    properties: mk({
      family_id:  { type: 'string' },
      type:       { type: 'string' },
      from_camp:  { type: ['string', 'null'] },
      to_camp:    { type: ['string', 'null'] },
      date:       { type: ['string', 'null'] },
      reason:     { type: ['string', 'null'] },
      notes:      { type: ['string', 'null'] },
      created_by: { type: ['string', 'null'] },
    }),
    required: ['id', 'family_id', 'type'],
    indexes: ['family_id', 'org_id', 'type'],
  },

  dist_rounds: {
    version: 0, primaryKey: 'id', type: 'object',
    properties: mk({
      camp_id:     { type: ['string', 'null'] },
      name:        { type: ['string', 'null'] },
      status:      { type: ['string', 'null'] },
      description: { type: ['string', 'null'] },
      start_date:  { type: ['string', 'null'] },
      end_date:    { type: ['string', 'null'] },
      created_by:  { type: ['string', 'null'] },
    }),
    required: ['id'],
    indexes: ['camp_id', 'org_id', 'status'],
  },

  camp_dist_families: {
    version: 0, primaryKey: 'id', type: 'object',
    properties: mk({
      distribution_id: { type: ['string', 'null'] },
      family_id:       { type: ['string', 'null'] },
      received_at:     { type: ['string', 'null'] },
      notes:           { type: ['string', 'null'] },
    }),
    required: ['id'],
    indexes: ['distribution_id', 'family_id'],
  },
}

// ── إنشاء قاعدة البيانات ──────────────────────────────────
let _db = null
let _syncActive = false
const SYNC_KEY = 'rxdb_last_sync'

export async function getDB() {
  if (_db) return _db
  _db = await createRxDatabase({
    name: 'CampRegistryRx_v2',
    storage: getRxStorageDexie(),
    ignoreDuplicate: true,
  })
  const collections = {}
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    collections[name] = { schema }
  }
  await _db.addCollections(collections)
  return _db
}

// ── Pull من PostgreSQL (Supabase) ─────────────────────────
// يجلب فقط ما تغيّر منذ آخر مزامنة (updated_at)
const TABLE_CONFIG = [
  { collection: 'families',         table: 'families',         filter: { org_id: ORG_ID } },
  { collection: 'family_members',   table: 'family_members',   filter: null },
  { collection: 'camps',            table: 'camps',            filter: { org_id: ORG_ID } },
  { collection: 'org_members',      table: 'org_members',      filter: { org_id: ORG_ID } },
  { collection: 'family_movements', table: 'family_movements', filter: { org_id: ORG_ID } },
  { collection: 'dist_rounds',      table: 'dist_rounds',      filter: { org_id: ORG_ID } },
  { collection: 'camp_dist_families', table: 'camp_dist_families', filter: null },
]

async function pullFromPostgres(db, since = null) {
  let totalPulled = 0
  for (const { collection, table, filter } of TABLE_CONFIG) {
    if (!db[collection]) continue
    try {
      let q = supabase.from(table).select('*').order('updated_at', { ascending: true }).limit(500)
      if (since) q = q.gt('updated_at', since)
      if (filter) {
        for (const [k, v] of Object.entries(filter)) q = q.eq(k, v)
      }
      const { data, error } = await q
      if (error) { console.warn(`[pull ${table}]`, error.message); continue }
      if (!data?.length) continue

      // upsert في RxDB
      const docs = data.map(d => ({ ...d, _deleted: d._deleted ?? false }))
      await db[collection].bulkUpsert(docs).catch(e => {
        // محاولة ثانية سجل سجل
        return Promise.allSettled(docs.map(d => db[collection].upsert(d).catch(()=>{})))
      })
      totalPulled += data.length
    } catch(e) { console.warn(`[pull ${table}]`, e.message) }
  }
  return totalPulled
}

// ── Push لـ PostgreSQL (Supabase) ─────────────────────────
// كل عملية كتابة تذهب مباشرة لـ Supabase + RxDB معاً
export async function pushToPostgres(table, operation, data) {
  try {
    if (operation === 'upsert') {
      const { error } = await supabase.from(table).upsert(data)
      if (error) throw error
    } else if (operation === 'delete') {
      const { error } = await supabase.from(table).delete().eq('id', data.id)
      if (error) throw error
    }
    return true
  } catch(e) {
    console.warn(`[push ${table}]`, e.message)
    return false
  }
}

// ── بدء المزامنة الكاملة ──────────────────────────────────
export async function startSync(db) {
  if (!navigator.onLine || _syncActive) return
  _syncActive = true

  try {
    const since = localStorage.getItem(SYNC_KEY)
    const pulled = await pullFromPostgres(db, since)
    const now = new Date().toISOString()
    localStorage.setItem(SYNC_KEY, now)
    console.log(`[RxDB] ✅ سحب ${pulled} سجل منذ ${since || 'البداية'}`)
  } catch(e) {
    console.warn('[RxDB startSync]', e)
  } finally {
    _syncActive = false
  }

  // استمع لإشارة إعادة الاتصال
  window.addEventListener('online', async () => {
    const db2 = await getDB()
    await startSync(db2)
  }, { once: true })
}

export function stopSync() { _syncActive = false }

// ── للتوافق مع الكود القديم ───────────────────────────────
export async function getSyncStats() { return { pending: 0, failed: 0, conflicts: 0 } }
export async function processSyncQueue() { return { synced: 0, failed: 0, conflicts: 0 } }
export async function enqueue() {}
