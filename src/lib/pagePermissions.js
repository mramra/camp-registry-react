/**
 * pagePermissions.js — نظام صلاحيات الصفحات الديناميكي
 *
 * منطق الأولوية (الأقوى أولاً):
 *   1. استثناء المستخدم بعينه (scope='user')   — يطغى على كل شيء
 *   2. إعداد الدور العام (scope='role')         — الافتراضي لكل مستخدمي هذا الدور
 *   3. الافتراضي البرمجي (DEFAULT_ROLE_ACCESS)  — يُستخدم فقط إذا لا يوجد أي إعداد مخزّن بعد
 *
 * هذا يسمح لـ platform_owner بالتحكم الكامل من صفحة إدارية، مع إبقاء سلوك
 * آمن ومطابق للوضع الحالي إلى أن يُغيَّر أي إعداد فعلياً.
 */
import { supabase, ORG_ID } from './supabase'
import { hasPagePermission } from './permissions'

// ── سجل الصفحات الكامل (page_key → معلومات العرض) ──────────────
export const PAGE_REGISTRY = {
  dashboard:     { label: '🏠 الرئيسية',            path: '/' },
  families:      { label: '👨‍👩‍👧 قائمة الأسر',      path: '/families' },
  camps:         { label: '🏕️ المخيمات',            path: '/camps' },
  movements:     { label: '🔄 حركات الأسر',          path: '/movements' },
  distributions: { label: '📦 التوزيعات',            path: '/distributions' },
  registers:     { label: '📋 السجلات',              path: '/registers' },
  registries:    { label: '📚 قوائم البيانات',        path: '/registries' },
  analysis:      { label: '📊 التحليل',              path: '/analysis' },
  needs_report:  { label: '📋 تقارير الاحتياجات',     path: '/needs-report' },
  camp_compare:  { label: '🏕️ مقارنة المخيمات',      path: '/camp-compare' },
  women:         { label: '👩 النساء',                path: '/women' },
  children:      { label: '🧒 سجل الأطفال',           path: '/children' },
  health_report: { label: '⚕️ الحالات الصحية',        path: '/health-report' },
  export:        { label: '📤 الاستيراد والتصدير',    path: '/export' },
  users:         { label: '👥 المستخدمون',           path: '/users' },
  audit:         { label: '📝 سجل التغييرات',         path: '/audit' },
  alerts:        { label: '🔔 التنبيهات',             path: '/alerts' },
  data:          { label: '🛠️ إدارة البيانات',        path: '/data' },
  diagnostics:   { label: '🩺 تشخيص النظام',          path: '/diagnostics' },
  devices:       { label: '📱 الأجهزة',               path: '/devices' },
  sms:           { label: '✉️ الرسائل',                path: '/sms' },
  settings:      { label: '⚙️ الإعدادات',             path: '/settings' },
  subscription:  { label: '💳 الاشتراكات',            path: '/subscription' },
  help:          { label: '❓ المساعدة',              path: '/help' },
  page_permissions: { label: '🔐 إدارة الصلاحيات',    path: '/permissions-admin' },
}

// ربط page_key الجديد بمفتاح allowed_pages القديم (نظام صلاحيات المساعد الموجود مسبقاً في قاعدة البيانات)
const LEGACY_PAGE_KEY_MAP = {
  families:      'page-families',
  movements:     'page-movements',
  distributions: 'page-dist',
  registers:     'page-children',
}

// ── الافتراضي البرمجي: نفس القواعد المعمول بها حالياً قبل تفعيل الإدارة الديناميكية ──
// true = مسموح بشكل أساسي، false = ممنوع بشكل أساسي
const DEFAULT_ROLE_ACCESS = {
  platform_owner: () => true, // كل شيء دائماً
  super_admin: {
    dashboard:true, families:true, camps:true, movements:true, distributions:true,
    registers:true, registries:true, analysis:true, needs_report:true, camp_compare:true,
    women:true, children:true, health_report:true,
    export:true, users:true, audit:true, alerts:true, data:false, diagnostics:true,
    devices:true, sms:true, settings:true, subscription:true, help:true, page_permissions:false,
  },
  camp_delegate: {
    dashboard:true, families:true, camps:true, movements:true, distributions:true,
    registers:true, registries:true, analysis:true, needs_report:true, camp_compare:true,
    women:true, children:true, health_report:true,
    women:true, children:true, health_report:true,
    export:true, users:true, audit:true, alerts:true, data:false, diagnostics:true,
    devices:true, sms:true, settings:true, subscription:true, help:true, page_permissions:false,
  },
  // المساعد: الصفحات المرتبطة بـ allowed_pages القديم (families/movements/distributions/registers)
  // تتبع نظام allowed_pages الموجود فعلياً بقاعدة البيانات لكل مساعد. الباقي مغلق افتراضياً
  // إلى أن يُفعَّل صريحاً من صفحة إدارة الصلاحيات الجديدة.
  assistant: {
    dashboard:true, camps:false, registries:false,
    analysis:false, needs_report:false, camp_compare:false,
    women:false, children:false, health_report:false,
    export:false, users:false, audit:false, alerts:false, data:false, diagnostics:false,
    devices:false, sms:false, settings:true, subscription:false, help:true, page_permissions:false,
  },
}

function defaultAccess(profile, pageKey) {
  const role = profile?.role
  if (role === 'platform_owner') return true

  // المساعد: إن كان لهذه الصفحة مفتاح قديم في allowed_pages، استخدمه كمصدر الحقيقة
  if (role === 'assistant' && LEGACY_PAGE_KEY_MAP[pageKey]) {
    return hasPagePermission(profile, LEGACY_PAGE_KEY_MAP[pageKey], 'view')
  }

  const table = DEFAULT_ROLE_ACCESS[role]
  if (!table) return false
  return table[pageKey] === true
}

let _cache = null // { rows, fetchedAt }
const CACHE_MS = 60_000

/**
 * يجلب كل صفوف page_permissions للمنظمة (مع كاش بسيط بالذاكرة لتقليل الطلبات)
 */
async function fetchAllPermissions(force = false) {
  if (!force && _cache && (Date.now() - _cache.fetchedAt < CACHE_MS)) return _cache.rows
  try {
    const { data, error } = await supabase
      .from('page_permissions')
      .select('*')
      .eq('org_id', ORG_ID)
    if (error) throw error
    _cache = { rows: data || [], fetchedAt: Date.now() }
    return _cache.rows
  } catch (e) {
    console.warn('[pagePermissions] fetchAll:', e.message)
    return _cache?.rows || []
  }
}

/** يفرغ الكاش — يُستخدم بعد أي تعديل في صفحة الإدارة */
export function invalidatePagePermissionsCache() {
  _cache = null
}

/**
 * يحسب إن كان profile مسموح له بدخول pageKey، حسب منطق الأولوية الثلاثي.
 * تستخدم البيانات المخزّنة في الكاش (يجب استدعاء loadPagePermissions مسبقاً عند بدء الجلسة).
 */
export function canAccessPageSync(profile, pageKey, rows) {
  if (!profile) return false
  if (profile.role === 'platform_owner') return true // المالك دائماً كل شيء

  const userId = profile.user_id || profile.id
  // ① استثناء المستخدم بعينه
  const userRow = rows.find(r => r.scope === 'user' && r.scope_value === userId && r.page_key === pageKey)
  if (userRow) return userRow.allowed === true

  // ② إعداد الدور العام
  const roleRow = rows.find(r => r.scope === 'role' && r.scope_value === profile.role && r.page_key === pageKey)
  if (roleRow) return roleRow.allowed === true

  // ③ الافتراضي البرمجي
  return defaultAccess(profile, pageKey)
}

/**
 * نسخة async مريحة — تجلب البيانات (مع كاش) ثم تحسب النتيجة
 */
export async function canAccessPage(profile, pageKey) {
  if (!profile) return false
  if (profile.role === 'platform_owner') return true
  const rows = await fetchAllPermissions()
  return canAccessPageSync(profile, pageKey, rows)
}

/** تحميل مسبق لكل الصلاحيات — يُستحسن استدعاؤه عند تسجيل الدخول/بدء الجلسة */
export async function loadPagePermissions() {
  return fetchAllPermissions(true)
}

/** يرجع كل الصفوف الحالية (للاستخدام في صفحة الإدارة) */
export async function getAllPagePermissions() {
  return fetchAllPermissions(true)
}

/**
 * يحفظ/يحدّث صلاحية واحدة (دور أو مستخدم) لصفحة معينة
 */
export async function setPagePermission({ scope, scopeValue, pageKey, allowed, updatedBy }) {
  const { error } = await supabase.from('page_permissions').upsert({
    org_id: ORG_ID,
    scope,
    scope_value: scopeValue,
    page_key: pageKey,
    allowed,
    updated_by: updatedBy || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'org_id,scope,scope_value,page_key' })
  if (error) throw error
  invalidatePagePermissionsCache()
}

/**
 * يحذف إعداد صلاحية (يرجع للوضع الافتراضي البرمجي أو لإعداد الدور)
 */
export async function clearPagePermission({ scope, scopeValue, pageKey }) {
  const { error } = await supabase.from('page_permissions')
    .delete()
    .eq('org_id', ORG_ID).eq('scope', scope).eq('scope_value', scopeValue).eq('page_key', pageKey)
  if (error) throw error
  invalidatePagePermissionsCache()
}
