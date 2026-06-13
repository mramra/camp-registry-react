/**
 * rxdb.js — قاعدة البيانات المحلية + مزامنة Supabase
 * يستبدل db.js + sync.js بالكامل
 */
import { createRxDatabase, addRxPlugin } from 'rxdb/plugins/core'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { replicateSupabase } from 'rxdb-supabase'
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode'
import { supabase, ORG_ID } from './supabase'

// تفعيل dev mode في التطوير فقط
if (import.meta.env.DEV) {
  addRxPlugin(RxDBDevModePlugin)
}

// ── Schemas ──────────────────────────────────────────────
const familySchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:               { type: 'string', maxLength: 36 },
    org_id:           { type: 'string' },
    camp_id:          { type: ['string', 'null'] },
    head_name:        { type: 'string' },
    head_id:          { type: ['string', 'null'] },
    head_gender:      { type: ['string', 'null'] },
    head_dob:         { type: ['string', 'null'] },
    head_marital:     { type: ['string', 'null'] },
    phone1:           { type: ['string', 'null'] },
    phone2:           { type: ['string', 'null'] },
    tent:             { type: ['string', 'null'] },
    original_address: { type: ['string', 'null'] },
    address_details:  { type: ['string', 'null'] },
    notes:            { type: ['string', 'null'] },
    category_tags:    { type: 'array',   items: { type: 'string' } },
    economic_level:   { type: ['string', 'null'] },
    version:          { type: ['number', 'null'] },
    created_at:       { type: 'string' },
    updated_at:       { type: 'string' },
    created_by:       { type: ['string', 'null'] },
    _deleted:         { type: 'boolean', default: false },
  },
  required: ['id', 'head_name'],
  indexes: ['camp_id', 'org_id', 'updated_at'],
}

const memberSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:          { type: 'string', maxLength: 36 },
    family_id:   { type: 'string' },
    name:        { type: 'string' },
    gender:      { type: ['string', 'null'] },
    relation:    { type: ['string', 'null'] },
    national_id: { type: ['string', 'null'] },
    dob:         { type: ['string', 'null'] },
    health:      { type: ['string', 'null'] },
    org_id:      { type: ['string', 'null'] },
    updated_at:  { type: 'string' },
    _deleted:    { type: 'boolean', default: false },
  },
  required: ['id', 'family_id', 'name'],
  indexes: ['family_id', 'national_id'],
}

const campSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:             { type: 'string', maxLength: 36 },
    org_id:         { type: 'string' },
    name:           { type: 'string' },
    camp_type:      { type: ['string', 'null'] },
    parent_camp_id: { type: ['string', 'null'] },
    address:        { type: ['string', 'null'] },
    capacity:       { type: ['number', 'null'] },
    status:         { type: ['string', 'null'] },
    manager_id:     { type: ['string', 'null'] },
    latitude:       { type: ['number', 'null'] },
    longitude:      { type: ['number', 'null'] },
    facilities:     { type: ['number', 'null'] },
    portal_open:    { type: ['boolean', 'null'] },
    created_at:     { type: 'string' },
    updated_at:     { type: 'string' },
    _deleted:       { type: 'boolean', default: false },
  },
  required: ['id', 'name'],
  indexes: ['org_id'],
}

const orgMemberSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:               { type: 'string', maxLength: 36 },
    org_id:           { type: 'string' },
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
    created_at:       { type: 'string' },
    updated_at:       { type: 'string' },
    _deleted:         { type: 'boolean', default: false },
  },
  required: ['id', 'full_name', 'role'],
  indexes: ['org_id', 'role', 'camp_id', 'supervisor_id'],
}

const movementSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id:        { type: 'string', maxLength: 36 },
    org_id:    { type: 'string' },
    family_id: { type: 'string' },
    type:      { type: 'string' },
    from_camp: { type: ['string', 'null'] },
    to_camp:   { type: ['string', 'null'] },
    date:      { type: ['string', 'null'] },
    reason:    { type: ['string', 'null'] },
    notes:     { type: ['string', 'null'] },
    created_at:{ type: 'string' },
    updated_at:{ type: 'string' },
    _deleted:  { type: 'boolean', default: false },
  },
  required: ['id', 'family_id', 'type'],
  indexes: ['family_id', 'org_id', 'type'],
}

// ── إنشاء قاعدة البيانات ──────────────────────────────────
let _db = null
let _replications = []

export async function getDB() {
  if (_db) return _db

  _db = await createRxDatabase({
    name: 'CampRegistryRx',
    storage: getRxStorageDexie(),
    ignoreDuplicate: true,
  })

  await _db.addCollections({
    families:       { schema: familySchema },
    family_members: { schema: memberSchema },
    camps:          { schema: campSchema },
    org_members:    { schema: orgMemberSchema },
    family_movements: { schema: movementSchema },
  })

  return _db
}

// ── بدء المزامنة مع Supabase ─────────────────────────────
export async function startSync(db) {
  if (!navigator.onLine) return
  if (_replications.length > 0) return // مزامنة تعمل بالفعل

  const TABLES = [
    { collection: 'families',         table: 'families',         filter: `org_id=eq.${ORG_ID}` },
    { collection: 'family_members',   table: 'family_members',   filter: null },
    { collection: 'camps',            table: 'camps',            filter: `org_id=eq.${ORG_ID}` },
    { collection: 'org_members',      table: 'org_members',      filter: `org_id=eq.${ORG_ID}` },
    { collection: 'family_movements', table: 'family_movements', filter: `org_id=eq.${ORG_ID}` },
  ]

  for (const { collection, table, filter } of TABLES) {
    try {
      const replication = replicateSupabase({
        replicationIdentifier: `camp-${collection}-sync`,
        collection: db[collection],
        supabaseClient: supabase,
        table,
        pull: {
          queryBuilder: (checkpoint) => {
            let query = supabase
              .from(table)
              .select('*')
              .order('updated_at', { ascending: true })
              .order('id', { ascending: true })
              .limit(100)

            if (checkpoint?.updated_at) {
              query = query.gt('updated_at', checkpoint.updated_at)
            }
            if (filter) {
              const [col, op, val] = filter.split('=')
              if (op === 'eq.') query = query.eq(col, val.replace('eq.',''))
            }
            return query
          },
          modifier: (doc) => ({
            ...doc,
            _deleted: doc._deleted ?? false,
          }),
        },
        push: {
          queryBuilder: (rows) => {
            const upserts = rows
              .filter(r => !r.assumedMasterState || r._deleted)
              .map(r => r.newDocumentState)
            if (!upserts.length) return null
            return supabase
              .from(table)
              .upsert(upserts.map(d => ({ ...d, org_id: d.org_id || ORG_ID })))
          },
        },
        live: true,
        retryTime: 5000,
      })

      _replications.push(replication)

      replication.error$.subscribe(err => {
        console.warn(`[RxDB sync ${collection}]`, err)
      })
    } catch(e) {
      console.warn(`[RxDB startSync ${collection}]`, e)
    }
  }

  console.log('[RxDB] ✅ مزامنة بدأت لـ', TABLES.length, 'جداول')
}

export function stopSync() {
  _replications.forEach(r => r.cancel())
  _replications = []
}

// ── دوال مساعدة ──────────────────────────────────────────
export async function getSyncStats() {
  // RxDB يتولى المزامنة تلقائياً — لا طابور يدوي
  return { pending: 0, failed: 0, conflicts: 0 }
}

// للتوافق مع الكود القديم
export async function processSyncQueue() {
  return { synced: 0, failed: 0, conflicts: 0 }
}

export async function enqueue() {
  // لا حاجة — RxDB يتولى
}
