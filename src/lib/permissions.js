/**
 * permissions.js — نظام الصلاحيات المركزي
 * platform_owner > super_admin > camp_delegate > assistant
 */

// ── فحص صلاحية عامة ─────────────────────────────────────────
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

// ── فحص صلاحية صفحة معينة (للمساعد) ─────────────────────────
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

// ── تصفية البيانات بالمخيم حسب الدور ────────────────────────
// ── من يستطيع إنشاء أي دور ──────────────────────────────────
export function getCreatableRoles(profile) {
  if (!profile) return []
  switch (profile.role) {
    case 'platform_owner': return ['super_admin','camp_delegate','assistant']
    case 'super_admin':    return ['camp_delegate','assistant']
    case 'camp_delegate':  return ['assistant']
    default: return []
  }
}

// ── ملصقات الأدوار ───────────────────────────────────────────
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
