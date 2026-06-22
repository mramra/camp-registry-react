/**
 * pagePermissions.js — نظام صلاحيات الصفحات الديناميكي
 *
 * منطق الأولوية (الأقوى أولاً):
 *   1. استثناء المستخدم بعينه (scope='user')   — يطغى على كل شيء
 *   2. إعداد الدور العام (scope='role')         — الافتراضي لكل مستخدمي هذا الدور
 *   3. الافتراضي البرمجي (DEFAULT_ROLE_ACCESS)  — يُستخدم فقط إذا لا يوجد أي إعداد مخزّن
 */
import { supabase, ORG_ID } from './supabase'
import { hasPagePermission } from './permissions'

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
    users:true, audit:true, alerts:true, data:false, diagnostics:true,
    devices:true, sms:true, settings:true, subscription:true, help:true, page_permissions:false, pending_requests:true,
  },
  camp_delegate: {
    dashboard:true, families:true, camps:true, movements:true, distributions:true,
    registers:true,
    women:true, children:true,
    analysis:true, needs_report:true, camp_compare:true, export:true,
    users:true, audit:true, alerts:true, data:false, diagnostics:true,
    devices:true, sms:true, settings:true, subscription:true, help:true, page_permissions:false, pending_requests:true,
  },
  assistant: {
    dashboard:true, families:false, camps:false, movements:false, distributions:false,
    registers:false,
    women:false, children:false,
    analysis:false, needs_report:false, camp_compare:false, export:false,
    users:false, audit:false, alerts:false, data:false, diagnostics:false,
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
    console.warn('[pagePermissions] fetch:', e.message)
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
