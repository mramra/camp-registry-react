/**
 * powersync.js — SQLite محلي (PowerSync)
 *
 * ⚠️ كل تعريف عمود هنا مأخوذ حرفياً من schema.js (مصدر الحقيقة الوحيد).
 * عند أي تعارض، schema.js هو الصحيح — يجب تحديث هذا الملف ليطابقه.
 *
 * PowerSync يخزّن كل شيء كـ column.text (نص) حتى الأرقام/المصفوفات/الكائنات؛
 * التحويل (parse) يحدث عند القراءة فقط، عبر parseJsonColumns من schema.js.
 */
import {
  PowerSyncDatabase, column, Schema, Table
} from '@powersync/web'

const families = new Table({
  org_id:column.text, camp_id:column.text, head_name:column.text, head_id:column.text,
  head_dob:column.text, head_gender:column.text, phone1:column.text, phone2:column.text,
  notes:column.text, version:column.integer, head_marital:column.text, tent:column.text,
  original_address:column.text, address_details:column.text, head_photo_url:column.text,
  address:column.text, tags:column.text, entry_date:column.text, exit_date:column.text,
  exit_reason:column.text, transferred_to_camp_id:column.text, client_id:column.text,
  created_by:column.text, updated_by:column.text, tent2:column.text,
  category_tags:column.text, category_details:column.text, economic_level:column.text,
  head_orphan_status:column.text, head_orphan_cause:column.text,
  head_disabilities:column.text, head_injuries:column.text,
  head_chronic_diseases:column.text, head_female_status:column.text,
  created_at:column.text, updated_at:column.text,
}, {
  indexes: { idx_org: ['org_id'], idx_camp: ['camp_id'], idx_updated: ['updated_at'] },
})

const family_members = new Table({
  family_id:column.text, name:column.text, relation:column.text, national_id:column.text,
  dob:column.text, gender:column.text, health:column.text,
  orphan_status:column.text, orphan_cause:column.text,
  disabilities:column.text, injuries:column.text, chronic_diseases:column.text,
  female_status:column.text, created_at:column.text, updated_at:column.text,
}, {
  indexes: { idx_family: ['family_id'] },
})

const camps = new Table({
  org_id:column.text, name:column.text, status:column.text, address:column.text,
  latitude:column.real, longitude:column.real, capacity:column.integer,
  manager_id:column.text, facilities:column.text, portal_open:column.integer,
  parent_camp_id:column.text, camp_type:column.text,
  created_at:column.text, updated_at:column.text,
}, {
  indexes: { idx_org: ['org_id'] },
})

const org_members = new Table({
  org_id:column.text, user_id:column.text, camp_id:column.text, role:column.text,
  full_name:column.text, phone:column.text, is_active:column.integer,
  national_id:column.text, must_change_pass:column.integer,
  can_add:column.integer, can_edit:column.integer, can_delete:column.integer,
  last_sync:column.text, can_export:column.integer, can_import:column.integer,
  created_by:column.text, page_permissions:column.text, delegate_camps:column.text,
  supervisor_id:column.text, allowed_pages:column.text,
  created_at:column.text, updated_at:column.text,
}, {
  indexes: { idx_org: ['org_id'], idx_user: ['user_id'], idx_role: ['role'] },
})

const family_movements = new Table({
  family_id:column.text, org_id:column.text, type:column.text,
  from_camp:column.text, to_camp:column.text, date:column.text,
  reason:column.text, notes:column.text, created_by:column.text,
  created_at:column.text, updated_at:column.text,
}, {
  indexes: { idx_org: ['org_id'], idx_family: ['family_id'] },
})

const dist_rounds = new Table({
  org_id:column.text, camp_id:column.text, name:column.text, type:column.text,
  status:column.text, tags:column.text, seq:column.integer, prev_round_id:column.text,
  created_at:column.text, updated_at:column.text,
}, {
  indexes: { idx_org: ['org_id'], idx_camp: ['camp_id'] },
})

const camp_distributions = new Table({
  org_id:column.text, camp_id:column.text, description:column.text,
  quantity:column.integer, type:column.text, status:column.text,
  distributed_at:column.text, round_id:column.text,
  created_at:column.text, updated_at:column.text,
}, {
  indexes: { idx_org: ['org_id'], idx_round: ['round_id'], idx_camp: ['camp_id'] },
})

const camp_dist_families = new Table({
  distribution_id:column.text, family_id:column.text, received_at:column.text,
  notes:column.text, round_id:column.text, org_id:column.text,
  updated_at:column.text,
}, {
  indexes: { idx_distribution: ['distribution_id'], idx_family: ['family_id'] },
})

// صلاحيات الصفحات الديناميكية (دور/مستخدم) — تُحرّر فقط من PermissionsAdmin
const page_permissions = new Table({
  org_id:column.text, scope:column.text, scope_value:column.text,
  page_key:column.text, allowed:column.integer,
  updated_by:column.text, updated_at:column.text,
}, {
  indexes: { idx_org: ['org_id'], idx_scope: ['scope', 'scope_value'] },
})

// جدول محلي بحت لتخزين العمليات المعلّقة وقت العمل بدون نت
// لا يُزامن مع Supabase أبداً — فقط تخزين مؤقت محلي
const sync_queue = new Table({
  op:column.text, table_name:column.text, data:column.text, record_id:column.text,
  status:column.text, retries:column.integer, last_error:column.text, created_at:column.text,
}, {
  indexes: { idx_status: ['status'] },
})

const AppSchema = new Schema({
  families, family_members, camps, org_members,
  family_movements, dist_rounds, camp_distributions, camp_dist_families,
  page_permissions, sync_queue,
})

export const psDb = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: 'camp_registry.db' },
  flags: { enableMultiTabs: false },
})

export function getPowerSync() { return psDb }

// ── حالة الاتصال ──────────────────────────────────────────
let _connected = false
let _connecting = false

export function isPowerSyncConnected() { return _connected }

/**
 * ربط PowerSync بـ Supabase — يُستدعى بعد تسجيل الدخول فقط
 * آمن: لا يُعطّل أي شيء إذا فشل، فقط يبقى local-only
 */
export async function connectPowerSync() {
  if (_connected || _connecting) return _connected
  _connecting = true
  try {
    const { supabase } = await import('./supabase')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      console.warn('[PowerSync] لا توجد جلسة — يبقى local-only')
      _connecting = false
      return false
    }

    const { SupabaseConnector } = await import('./SupabaseConnector')
    const connector = new SupabaseConnector()

    await psDb.connect(connector)
    _connected = true
    console.log('[PowerSync] ✅ متصل — مزامنة فورية نشطة')
    return true
  } catch(e) {
    console.warn('[PowerSync] فشل الاتصال — يبقى local-only:', e.message)
    _connected = false
    return false
  } finally {
    _connecting = false
  }
}

/**
 * قطع الاتصال — عند تسجيل الخروج
 */
export async function disconnectPowerSync() {
  if (!_connected) return
  try {
    await psDb.disconnect()
    _connected = false
    console.log('[PowerSync] انقطع الاتصال')
  } catch(e) {
    console.warn('[PowerSync] disconnect:', e.message)
  }
}
