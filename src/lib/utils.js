/** حماية XSS */
export function esc(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;')
}

/** تحويل اسم الدور إلى عربي */
export function roleLabel(role) {
  const map = {
    platform_owner: 'مالك المنصة',
    super_admin: 'مشرف عام',
    camp_delegate: 'مندوب مخيم',
    assistant: 'مساعد',
  }
  return map[role] || role
}

/** تنسيق التاريخ */
export function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('ar-SA', {
      year: 'numeric', month: 'short', day: 'numeric'
    })
  } catch { return iso }
}

/** كلمة مرور عشوائية */
export function randomPassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#'
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

/** نسخ للـ clipboard */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch { return false }
}

/** فحص الاتصال */
export function isOnline() { return navigator.onLine }
