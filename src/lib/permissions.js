/**
 * permissions.js — نظام الصلاحيات المركزي الموحَّد
 * platform_owner > super_admin > camp_delegate > assistant
 *
 * الأقسام:
 *   1. صلاحيات الأفعال (كتابة/تعديل/حذف/تصدير...)
 *   2. صلاحيات الصفحات (من يرى أي صفحة، بمنطق أولوية: مستخدم > دور > افتراضي)
 *   3. الأدوار (من يستطيع إنشاء من، ملصقات وألوان العرض)
 */
import { supabase, ORG_ID } from './db'

// ════════════════════════════════════════════════════════════
// 1. صلاحيات الأفعال
// ════════════════════════════════════════════════════════════

/** فحص صلاحية فعل عام (write/edit/delete/export/import/admin/owner/reports/manage_users) */
export function hasPermission(profile, action) {
  if (!profile) return false
  const role = profile.role

  switch (action) {
    case 'write':
      if (role === 'assistant') return profile.can_add === true
      return ['platform_owner','super_admin','camp_delegate'].includes(role)

    case 'edit':
      if (role === 'assistant') return profile.can_edit === true
      return ['platform_owner','super_admin','camp_delegate'].includes(role)

    case 'delete':
      if (role === 'assistant') return profile.can_delete === true
      return ['platform_owner','super_admin','camp_delegate'].includes(role)

    case 'admin':
      return ['platform_owner','super_admin'].includes(role)

    case 'reports':
      return ['platform_owner','super_admin','camp_delegate'].includes(role)

    case 'import':
      if (role === 'assistant') return profile.can_import === true
      return ['platform_owner','super_admin','camp_delegate'].includes(role)

    case 'export':
      if (role === 'assistant') return profile.can_export === true
      return ['platform_owner','super_admin','camp_delegate'].includes(role)

    case 'owner':
      return role === 'platform_owner'

    case 'manage_users':
      return ['platform_owner','super_admin','camp_delegate'].includes(role)

    default: return false
  }
}

/** فحص صلاحية صفحة معيّنة (نظام قديم خاص بالمساعد عبر allowed_pages — يبقى للتوافق الخلفي) */
export function hasPagePermission(profile, pageKey, op = 'view') {
  if (!profile) return false
  const role = profile.role

  // platform_owner + super_admin + camp_delegate → كل الصفحات
  if (['platform_owner','super_admin','camp_delegate'].includes(role)) return true

  // assistant → يتحقق من allowed_pages
  if (role === 'assistant') {
    try {
      const pages = typeof profile.allowed_pages === 'string'
        ? JSON.parse(profile.allowed_pages)
        : (profile.allowed_pages || {})
      const pagePerm = pages[pageKey]
      if (!pagePerm) return false
      if (op === 'view') return pagePerm.view === true
      return pagePerm[op] === true
    } catch { return false }
  }

  return false
}

// ════════════════════════════════════════════════════════════
// 2. صلاحيات الصفحات (نظام ديناميكي حديث)
// منطق الأولوية (الأقوى أولاً):
//   1. استثناء المستخدم بعينه (scope='user')   — يطغى على كل شيء
//   2. إعداد الدور العام (scope='role')         — الافتراضي لكل مستخدمي هذا الدور
//   3. الافتراضي البرمجي (DEFAULT_ROLE_ACCESS)  — يُستخدم فقط إذا لا يوجد أي إعداد مخزّن
// ════════════════════════════════════════════════════════════

export const PAGE_REGISTRY = {
  dashboard:        { label: '🏠 الرئيسية',              path: '/' },
  families:         { label: '👨‍👩‍👧 قائمة الأسر',        path: '/families' },
  camps:            { label: '🏕️ المخيمات',              path: '/camps' },
  movements:        { label: '🔄 حركات الأسر',            path: '/movements' },
  distributions:    { label: '📦 التوزيعات',              path: '/distributions' },
  registers:        { label: '📋 السجلات',                path: '/registers' },
  women:            { label: '👩 النساء',                  path: '/women' },
  children:         { label: '🧒 سجل الأطفال',             path: '/children' },
  analysis:         { label: '📊 التحليل',                path: '/analysis' },
  needs_report:     { label: '📋 تقارير الاحتياجات',       path: '/needs-report' },
  camp_compare:     { label: '🏕️ مقارنة المخيمات',        path: '/camp-compare' },
  export:           { label: '📤 الاستيراد والتصدير',      path: '/export' },
  users:            { label: '👥 المستخدمون',             path: '/users' },
  audit:            { label: '📝 سجل التغييرات',           path: '/audit' },
  alerts:           { label: '🔔 التنبيهات',               path: '/alerts' },
  data:             { label: '🛠️ إدارة البيانات',          path: '/data' },
  diagnostics:      { label: '🩺 تشخيص النظام',            path: '/diagnostics' },
  security_audit:   { label: '🛡️ الفحص الأمني',            path: '/security-audit' },
  devices:          { label: '📱 الأجهزة',                 path: '/devices' },
  sms:              { label: '✉️ الرسائل',                  path: '/sms' },
  settings:         { label: '⚙️ الإعدادات',               path: '/settings' },
  subscription:     { label: '💳 الاشتراكات',              path: '/subscription' },
  help:             { label: '❓ المساعدة',                path: '/help' },
  page_permissions: { label: '🔐 إدارة الصلاحيات',         path: '/permissions-admin' },
  pending_requests: { label: '📋 الطلبات المعلّقة',         path: '/pending-requests' },
}

const LEGACY_PAGE_KEY_MAP = {
  families:      'page-families',
  movements:     'page-movements',
  distributions: 'page-dist',
  registers:     'page-children',
}

const DEFAULT_ROLE_ACCESS = {
  platform_owner: () => true,
  super_admin: {
    dashboard:true, families:true, camps:true, movements:true, distributions:true,
    registers:true,
    women:true, children:true,
    analysis:true, needs_report:true, camp_compare:true, export:true,
    users:true, audit:true, alerts:true, data:false, diagnostics:true, security_audit:false,
    devices:true, sms:true, settings:true, subscription:true, help:true, page_permissions:false, pending_requests:true,
  },
  camp_delegate: {
    dashboard:true, families:true, camps:true, movements:true, distributions:true,
    registers:true,
    women:true, children:true,
    analysis:true, needs_report:true, camp_compare:true, export:true,
    users:true, audit:true, alerts:true, data:false, diagnostics:true, security_audit:false,
    devices:true, sms:true, settings:true, subscription:true, help:true, page_permissions:false, pending_requests:true,
  },
  assistant: {
    dashboard:true, families:false, camps:false, movements:false, distributions:false,
    registers:false,
    women:false, children:false,
    analysis:false, needs_report:false, camp_compare:false, export:false,
    users:false, audit:false, alerts:false, data:false, diagnostics:false, security_audit:false,
    devices:false, sms:false, settings:true, subscription:false, help:true, page_permissions:false, pending_requests:false,
  },
}

function defaultAccess(profile, pageKey) {
  const role = profile?.role
  if (role === 'platform_owner') return true
  if (role === 'assistant' && LEGACY_PAGE_KEY_MAP[pageKey]) {
    return hasPagePermission(profile, LEGACY_PAGE_KEY_MAP[pageKey], 'view')
  }
  const table = DEFAULT_ROLE_ACCESS[role]
  if (!table) return false
  return table[pageKey] === true
}

let _cache = null
const CACHE_MS = 60_000

// كاش في الذاكرة فقط (يُمحى عند تحديث الصفحة) — لا تخزين محلي دائم
async function fetchAllPermissions(force = false) {
  if (!force && _cache && (Date.now() - _cache.fetchedAt < CACHE_MS)) return _cache.rows
  if (!navigator.onLine) return _cache?.rows || []
  try {
    const { data, error } = await supabase.from('page_permissions').select('*').eq('org_id', ORG_ID)
    if (error) throw error
    const rows = (data || []).map(r => ({ ...r, allowed: !!r.allowed }))
    _cache = { rows, fetchedAt: Date.now() }
    return rows
  } catch (e) {
    console.warn('[permissions] fetch:', e.message)
    return _cache?.rows || []
  }
}

export function invalidatePagePermissionsCache() { _cache = null }

export function canAccessPageSync(profile, pageKey, rows) {
  if (!profile) return false
  if (profile.role === 'platform_owner') return true
  const userId = profile.user_id || profile.id
  const userRow = rows.find(r => r.scope === 'user' && r.scope_value === userId && r.page_key === pageKey)
  if (userRow) return userRow.allowed === true
  const roleRow = rows.find(r => r.scope === 'role' && r.scope_value === profile.role && r.page_key === pageKey)
  if (roleRow) return roleRow.allowed === true
  return defaultAccess(profile, pageKey)
}

export async function canAccessPage(profile, pageKey) {
  if (!profile) return false
  if (profile.role === 'platform_owner') return true
  const rows = await fetchAllPermissions()
  return canAccessPageSync(profile, pageKey, rows)
}

export async function loadPagePermissions() { return fetchAllPermissions(true) }
export async function getAllPagePermissions() { return fetchAllPermissions(true) }

export async function setPagePermission({ scope, scopeValue, pageKey, allowed, updatedBy }) {
  const updated_at = new Date().toISOString()
  const { error } = await supabase.from('page_permissions').upsert({
    org_id: ORG_ID, scope, scope_value: scopeValue, page_key: pageKey,
    allowed, updated_by: updatedBy || null, updated_at,
  }, { onConflict: 'org_id,scope,scope_value,page_key' })
  if (error) throw error
  invalidatePagePermissionsCache()
}

export async function clearPagePermission({ scope, scopeValue, pageKey }) {
  const { error } = await supabase.from('page_permissions').delete()
    .eq('org_id', ORG_ID).eq('scope', scope).eq('scope_value', scopeValue).eq('page_key', pageKey)
  if (error) throw error
  invalidatePagePermissionsCache()
}

// ════════════════════════════════════════════════════════════
// 3. الأدوار — من يستطيع إنشاء من، ملصقات وألوان العرض
// ════════════════════════════════════════════════════════════

export function getCreatableRoles(profile) {
  if (!profile) return []
  switch (profile.role) {
    case 'platform_owner': return ['super_admin','camp_delegate','assistant']
    case 'super_admin':    return ['camp_delegate','assistant']
    case 'camp_delegate':  return ['assistant']
    default: return []
  }
}

export const ROLE_LABELS = {
  platform_owner: '👑 مالك المنصة',
  super_admin:    '🔴 مدير الإيواء',
  camp_delegate:  '🟠 مندوب المخيم',
  assistant:      '🟡 مساعد',
}

export const ROLE_COLORS = {
  platform_owner: 'text-accent',
  super_admin:    'text-red',
  camp_delegate:  'text-orange-400',
  assistant:      'text-yellow-400',
}
