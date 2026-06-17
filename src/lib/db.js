/**
 * db.js — تعريف Dexie (معطّل بالكامل من الاستخدام الفعلي)
 *
 * ⚠️ المشروع لا يعتمد على Dexie كمصدر بيانات بعد الآن.
 * المصدر المحلي الوحيد هو SQLite عبر PowerSync (انظر src/lib/powersync.js).
 * هذا الملف باقٍ فقط لتجنّب كسر أي استيراد قديم لم يُكتشف، ولا يُستدعى من
 * أي ملف آخر بالكود فعليًا. يمكن حذفه بأمان بعد فترة تجربة كافية.
 */
import Dexie from 'dexie'

export const localDB = new Dexie('CampRegistry')

// الإصدارات القديمة — لا تُحذف
localDB.version(1).stores({ families: 'id', camps: 'id', meta: 'key' })
localDB.version(2).stores({ families: 'id, camp_id', camps: 'id', meta: 'key', sync_queue: '++id, status' })
localDB.version(3).stores({ families: 'id, camp_id, org_id', family_members: 'id, family_id', camps: 'id, org_id', meta: 'key', sync_queue: '++id, status', org_members: 'id, org_id, role' })
localDB.version(4).stores({ families: 'id, camp_id, org_id, status', family_members: 'id, family_id, national_id', camps: 'id, org_id', meta: 'key', sync_queue: '++id, status', org_members: 'id, org_id, role, camp_id', dist_rounds: 'id, camp_id', camp_distributions: 'id, camp_id', camp_dist_families: 'id, distribution_id, family_id' })
localDB.version(5).stores({ families: 'id, camp_id, org_id, status, updated_at', family_members: 'id, family_id, national_id', camps: 'id, org_id', meta: 'key', sync_queue: '++id, status', org_members: 'id, org_id, role, camp_id, created_by, user_id', dist_rounds: 'id, camp_id, org_id, status', camp_distributions: 'id, camp_id, org_id, status, round_id', camp_dist_families: 'id, distribution_id, family_id', family_movements: 'id, family_id, org_id, type, date', devices: 'id' })
localDB.version(6).stores({ families: 'id, camp_id, org_id, status, updated_at', family_members: 'id, family_id, national_id', camps: 'id, org_id', meta: 'key', sync_queue: '++id, status', org_members: 'id, org_id, role, camp_id, created_by, user_id', dist_rounds: 'id, camp_id, org_id, status', camp_distributions: 'id, camp_id, org_id, status, round_id', camp_dist_families: 'id, distribution_id, family_id', family_movements: 'id, family_id, org_id, type, date', family_history: 'id, family_id, org_id, created_at', devices: 'id' })
localDB.version(7).stores({ families: 'id, camp_id, org_id, status, updated_at', family_members: 'id, family_id, national_id', camps: 'id, org_id', meta: 'key', sync_queue: '++id, status', dist_rounds: 'id, camp_id, org_id, status', camp_distributions: 'id, camp_id, org_id, status, round_id', camp_dist_families: 'id, distribution_id, family_id', org_members: 'id, org_id, role, camp_id, created_by, user_id', family_movements: 'id, family_id, org_id, type, date', family_history: 'id, family_id, org_id, created_at' })
// version 150
localDB.version(150).stores({
  families:          'id, camp_id, org_id, updated_at',
  family_members:    'id, family_id, national_id',
  camps:             'id, org_id',
  meta:              'key',
  sync_queue:        '++id, status',
  dist_rounds:       'id, camp_id, org_id, status',
  camp_distributions:'id, camp_id, org_id, status, round_id',
  camp_dist_families:'id, distribution_id, family_id',
  org_members:       'id, org_id, role, camp_id, user_id',
  family_movements:  'id, family_id, org_id, type, date',
  family_history:    'id, family_id, org_id, created_at',
})

// version 151 — إضافة supervisor_id لـ org_members
localDB.version(151).stores({
  families:          'id, camp_id, org_id, updated_at',
  family_members:    'id, family_id, national_id',
  camps:             'id, org_id',
  meta:              'key',
  sync_queue:        '++id, status',
  dist_rounds:       'id, camp_id, org_id, status',
  camp_distributions:'id, camp_id, org_id, status, round_id',
  camp_dist_families:'id, distribution_id, family_id',
  org_members:       'id, org_id, role, camp_id, user_id, supervisor_id',
  family_movements:  'id, family_id, org_id, type, date',
  family_history:    'id, family_id, org_id, created_at',
})
