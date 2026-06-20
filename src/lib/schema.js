/**
 * schema.js — مصدر الحقيقة الوحيد لبنية قاعدة البيانات
 *
 * كل عمود هنا تم تأكيده فعلياً من Supabase (فحص مباشر، لا تخمين).
 * تاريخ آخر تأكيد: 2026-06-20
 *
 * عند أي تعديل على قاعدة البيانات الحقيقية، يجب تحديث هذا الملف فوراً
 * ليبقى هو المصدر الوحيد المستخدم في كل الكود (PowerSync + pushLocalChanges + الصفحات).
 *
 * ⚠️ ملاحظة مهمة: الحقول family_members.disabilities / injuries /
 * chronic_diseases / female_status هي مصفوفات (array) حقيقية في Postgres،
 * وليست نصاً JSON. عند القراءة من PowerSync/SQLite تأتي كنص (PowerSync
 * يخزّن كل شيء كـ TEXT)، فتحتاج JSON.parse عند القراءة فقط — وليس عند
 * الكتابة المباشرة لـ Supabase عبر REST (حيث تُرسل كمصفوفة JS عادية).
 */

export const TABLES = {
  families: {
    columns: [
      'id', 'org_id', 'camp_id', 'head_name', 'head_id', 'head_dob', 'head_gender',
      'phone1', 'phone2', 'notes', 'version', 'created_at', 'updated_at',
      'head_marital', 'tent', 'original_address', 'address_details',
      'head_photo_url', 'address', 'tags', 'entry_date', 'exit_date', 'exit_reason',
      'transferred_to_camp_id', 'client_id', 'created_by', 'updated_by', 'tent2',
      'category_tags', 'category_details', 'economic_level',
      'head_orphan_status', 'head_orphan_cause', 'head_disabilities',
      'head_injuries', 'head_chronic_diseases', 'head_female_status', '_deleted',
    ],
    // أعمدة مخزّنة كـ JSON-string في Postgres (text) — تحتاج JSON.parse عند القراءة
    jsonTextColumns: ['tags', 'category_tags', 'category_details',
      'head_disabilities', 'head_injuries', 'head_chronic_diseases', 'head_female_status'],
    requiredOnInsert: ['org_id', 'head_name'],
  },

  family_members: {
    columns: [
      'id', 'family_id', 'name', 'relation', 'national_id', 'dob', 'gender',
      'created_at', 'health', 'orphan_status', 'orphan_cause',
      'disabilities', 'injuries', 'chronic_diseases', 'female_status',
      'updated_at', '_deleted',
    ],
    // هذه أعمدة array حقيقية في Postgres (ليست text) — لا تحتاج JSON.parse
    // عند الكتابة المباشرة عبر REST، لكن PowerSync المحلي يخزّنها كنص
    arrayColumns: ['disabilities', 'injuries', 'chronic_diseases', 'female_status'],
    requiredOnInsert: ['family_id', 'name'],
  },

  camps: {
    columns: [
      'id', 'org_id', 'name', 'status', 'address', 'latitude', 'longitude',
      'capacity', 'manager_id', 'created_at', 'facilities', 'portal_open',
      'parent_camp_id', 'camp_type', 'updated_at', '_deleted',
    ],
    requiredOnInsert: ['org_id', 'name'],
  },

  org_members: {
    columns: [
      'id', 'org_id', 'user_id', 'camp_id', 'role', 'full_name', 'phone',
      'is_active', 'created_at', 'national_id', 'must_change_pass',
      'can_add', 'can_edit', 'can_delete', 'last_sync', 'can_export', 'can_import',
      'created_by', 'page_permissions', 'delegate_camps', 'supervisor_id',
      'allowed_pages', '_deleted', 'updated_at',
    ],
    jsonTextColumns: ['allowed_pages'],
    requiredOnInsert: ['org_id', 'role', 'full_name'],
  },

  family_movements: {
    columns: [
      'id', 'family_id', 'org_id', 'type', 'from_camp', 'to_camp', 'date',
      'reason', 'notes', 'created_by', 'created_at', 'updated_at', '_deleted',
    ],
    requiredOnInsert: ['family_id', 'org_id', 'type'],
  },

  dist_rounds: {
    columns: [
      'id', 'org_id', 'camp_id', 'name', 'type', 'status', 'created_at',
      'tags', 'seq', 'prev_round_id', 'updated_at', '_deleted',
    ],
    requiredOnInsert: ['org_id', 'name'],
  },

  camp_distributions: {
    columns: [
      'id', 'org_id', 'camp_id', 'description', 'quantity', 'type', 'status',
      'distributed_at', 'created_at', 'round_id', 'updated_at', '_deleted',
    ],
    requiredOnInsert: ['org_id', 'camp_id', 'description'],
  },

  camp_dist_families: {
    columns: [
      'id', 'distribution_id', 'family_id', 'received_at', 'notes',
      'round_id', 'org_id', 'updated_at', '_deleted',
    ],
    requiredOnInsert: ['distribution_id', 'family_id'],
  },
}

/** يُبقي فقط الأعمدة الموجودة فعلياً في الجدول المطلوب */
export function cleanForTable(table, record) {
  const def = TABLES[table]
  if (!def) return record
  const out = {}
  for (const key of Object.keys(record)) {
    if (def.columns.includes(key)) out[key] = record[key]
  }
  return out
}

/** يحوّل أعمدة JSON-text من نص إلى مصفوفة/كائن عند القراءة من SQLite */
export function parseJsonColumns(table, record) {
  const def = TABLES[table]
  if (!def?.jsonTextColumns) return record
  const out = { ...record }
  for (const col of def.jsonTextColumns) {
    if (typeof out[col] === 'string') {
      try { out[col] = JSON.parse(out[col]) } catch { /* يبقى كما هو */ }
    }
  }
  return out
}

/** فحص سريع: هل كل الأعمدة المطلوبة موجودة في السجل؟ */
export function validateRequired(table, record) {
  const def = TABLES[table]
  if (!def) return { valid: true }
  const missing = def.requiredOnInsert.filter(k => record[k] === undefined || record[k] === null || record[k] === '')
  return { valid: missing.length === 0, missing }
}
