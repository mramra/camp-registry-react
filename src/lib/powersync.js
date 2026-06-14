/**
 * powersync.js — إعداد PowerSync مع Supabase
 * ─────────────────────────────────────────────
 * المزامنة: تلقائية ثنائية الاتجاه مع Supabase
 * التخزين: SQLite محلي (WASM)
 * enableMultiTabs: false  → يعمل بدون SharedArrayBuffer (GitHub Pages safe)
 */
import {
  PowerSyncDatabase,
  column,
  Schema,
  Table,
} from '@powersync/web'
import { supabase } from './supabase'

// ── تعريف الـ Schema ──────────────────────────────────────
const families = new Table({
  org_id:                column.text,
  camp_id:               column.text,
  head_name:             column.text,
  head_id:               column.text,
  head_gender:           column.text,
  head_dob:              column.text,
  head_marital:          column.text,
  head_chronic_diseases: column.text,
  head_disabilities:     column.text,
  head_injuries:         column.text,
  head_female_status:    column.text,
  head_orphan_status:    column.integer,
  head_orphan_cause:     column.text,
  head_photo_url:        column.text,
  phone1:                column.text,
  phone2:                column.text,
  tent:                  column.text,
  tent2:                 column.text,
  address:               column.text,
  address_details:       column.text,
  original_address:      column.text,
  notes:                 column.text,
  category_tags:         column.text,   // JSON string
  category_details:      column.text,
  economic_level:        column.text,
  entry_date:            column.text,
  exit_date:             column.text,
  exit_reason:           column.text,
  transferred_to_camp_id: column.text,
  tags:                  column.text,
  version:               column.integer,
  created_at:            column.text,
  updated_at:            column.text,
  created_by:            column.text,
  updated_by:            column.text,
  client_id:             column.text,
})

const family_members = new Table({
  family_id:        column.text,
  name:             column.text,
  gender:           column.text,
  relation:         column.text,
  national_id:      column.text,
  dob:              column.text,
  health:           column.text,
  orphan_status:    column.integer,
  orphan_cause:     column.text,
  chronic_diseases: column.text,
  disabilities:     column.text,
  injuries:         column.text,
  org_id:           column.text,
  created_at:       column.text,
  updated_at:       column.text,
})

const camps = new Table({
  org_id:         column.text,
  name:           column.text,
  camp_type:      column.text,
  parent_camp_id: column.text,
  address:        column.text,
  capacity:       column.integer,
  status:         column.text,
  manager_id:     column.text,
  latitude:       column.real,
  longitude:      column.real,
  portal_open:    column.integer,
  created_at:     column.text,
  updated_at:     column.text,
})

const org_members = new Table({
  org_id:           column.text,
  user_id:          column.text,
  full_name:        column.text,
  national_id:      column.text,
  phone:            column.text,
  role:             column.text,
  camp_id:          column.text,
  supervisor_id:    column.text,
  is_active:        column.integer,
  must_change_pass: column.integer,
  can_add:          column.integer,
  can_edit:         column.integer,
  can_delete:       column.integer,
  can_export:       column.integer,
  can_import:       column.integer,
  allowed_pages:    column.text,
  delegate_camps:   column.text,
  created_at:       column.text,
  updated_at:       column.text,
})

const family_movements = new Table({
  org_id:     column.text,
  family_id:  column.text,
  type:       column.text,
  from_camp:  column.text,
  to_camp:    column.text,
  date:       column.text,
  reason:     column.text,
  notes:      column.text,
  created_by: column.text,
  created_at: column.text,
  updated_at: column.text,
})

const dist_rounds = new Table({
  org_id:      column.text,
  camp_id:     column.text,
  name:        column.text,
  status:      column.text,
  description: column.text,
  start_date:  column.text,
  end_date:    column.text,
  created_by:  column.text,
  created_at:  column.text,
  updated_at:  column.text,
})

const camp_dist_families = new Table({
  org_id:          column.text,
  distribution_id: column.text,
  family_id:       column.text,
  received_at:     column.text,
  notes:           column.text,
  created_at:      column.text,
  updated_at:      column.text,
})

export const AppSchema = new Schema({
  families,
  family_members,
  camps,
  org_members,
  family_movements,
  dist_rounds,
  camp_dist_families,
})

// ── PowerSync Instance ─────────────────────────────────────
let _db = null

export function getPowerSync() {
  if (!_db) {
    _db = new PowerSyncDatabase({
      schema: AppSchema,
      database: { dbFilename: 'camp_registry.db' },
      flags: {
        // ✅ enableMultiTabs: false → يعمل بدون SharedArrayBuffer
        // هذا ضروري لـ GitHub Pages التي لا تدعم COOP/COEP headers
        enableMultiTabs: false,
      },
    })
  }
  return _db
}

// ── Supabase Connector ─────────────────────────────────────
// يربط PowerSync بـ Supabase للقراءة والكتابة
export class SupabaseConnector {
  constructor() {
    this.client = supabase
  }

  // PowerSync يستدعيه لجلب token الجلسة + endpoint
  async fetchCredentials() {
    const { data: { session }, error } = await this.client.auth.getSession()
    if (error || !session) throw new Error('No session — يجب تسجيل الدخول أولاً')

    const psUrl = import.meta.env.VITE_POWERSYNC_URL
      || 'https://6a2d74dd0ef84ed671a15a84.powersync.journeyapps.com'

    return {
      endpoint:  psUrl,
      token:     session.access_token,
      expiresAt: session.expires_at
        ? new Date(session.expires_at * 1000)
        : undefined,
    }
  }

  // PowerSync يستدعيه لرفع التعديلات المحلية لـ Supabase
  async uploadData(database) {
    const transaction = await database.getNextCrudTransaction()
    if (!transaction) return

    try {
      for (const op of transaction.crud) {
        const { op: operation, table, opData, id } = op

        if (operation === 'PUT') {
          const { error } = await this.client
            .from(table)
            .upsert({ ...opData, id })
          if (error) throw error
        } else if (operation === 'PATCH') {
          const { error } = await this.client
            .from(table)
            .update(opData)
            .eq('id', id)
          if (error) throw error
        } else if (operation === 'DELETE') {
          const { error } = await this.client
            .from(table)
            .delete()
            .eq('id', id)
          if (error) throw error
        }
      }
      await transaction.complete()
    } catch (e) {
      console.error('[PowerSync uploadData]', e)
      throw e
    }
  }
}
