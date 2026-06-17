/**
 * powersync.js — SQLite محلي فقط (بدون streaming لـ Supabase)
 * connect() لا يُستدعى أبداً → صفر حمل على Supabase
 * القراءة/الكتابة عبر db.execute() و db.getAll()
 */
import {
  PowerSyncDatabase, column, Schema, Table
} from '@powersync/web'

const families = new Table({
  org_id:column.text, camp_id:column.text,
  head_name:column.text, head_id:column.text,
  head_gender:column.text, head_dob:column.text,
  head_marital:column.text, head_chronic_diseases:column.text,
  head_disabilities:column.text, head_injuries:column.text,
  head_female_status:column.text, head_orphan_status:column.integer,
  head_orphan_cause:column.text, phone1:column.text, phone2:column.text,
  tent:column.text, original_address:column.text, address_details:column.text,
  notes:column.text, status:column.text, economic_level:column.text,
  version:column.integer, created_by:column.text,
  category_tags:column.text, registration_date:column.text,
  created_at:column.text, updated_at:column.text,
})
const family_members = new Table({
  family_id:column.text, name:column.text, national_id:column.text,
  relation:column.text, dob:column.text, gender:column.text,
  health:column.text, chronic_diseases:column.text,
  disabilities:column.text, injuries:column.text,
  orphan_status:column.integer, notes:column.text,
  created_at:column.text, updated_at:column.text,
})
const camps = new Table({
  org_id:column.text, name:column.text, camp_type:column.text,
  parent_camp_id:column.text, manager_id:column.text,
  latitude:column.real, longitude:column.real,
  address:column.text, capacity:column.integer,
  status:column.text, notes:column.text,
  created_at:column.text, updated_at:column.text,
})
const org_members = new Table({
  org_id:column.text, user_id:column.text, full_name:column.text,
  role:column.text, phone:column.text, camp_id:column.text,
  can_add:column.integer, can_edit:column.integer,
  can_delete:column.integer, can_export:column.integer,
  can_import:column.integer, is_active:column.integer,
  created_at:column.text, updated_at:column.text,
})
const family_movements = new Table({
  org_id:column.text, family_id:column.text,
  movement_type:column.text, from_camp_id:column.text,
  to_camp_id:column.text, reason:column.text,
  moved_by:column.text, moved_at:column.text, notes:column.text,
  created_at:column.text,
})
const dist_rounds = new Table({
  org_id:column.text, name:column.text, description:column.text,
  status:column.text, start_date:column.text, end_date:column.text,
  created_by:column.text, created_at:column.text, updated_at:column.text,
})
const camp_distributions = new Table({
  org_id:column.text, round_id:column.text, camp_id:column.text,
  assigned_to:column.text, status:column.text, notes:column.text,
  created_at:column.text, updated_at:column.text,
})
const camp_dist_families = new Table({
  distribution_id:column.text, family_id:column.text,
  received:column.integer, received_at:column.text,
  received_by:column.text, notes:column.text,
})

const AppSchema = new Schema({
  families, family_members, camps, org_members,
  family_movements, dist_rounds, camp_distributions, camp_dist_families,
})

export const psDb = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: 'camp_registry.db' },
  flags: { enableMultiTabs: false },
  // ⛔ لا connect() → صفر اتصال بـ Supabase
})

export function getPowerSync() { return psDb }
