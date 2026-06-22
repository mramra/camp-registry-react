/**
 * utils.js — دوال مساعدة مشتركة
 */

export function formatDate(dateStr, locale = 'ar-EG') {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString(locale, {
      year: 'numeric', month: 'short', day: 'numeric'
    })
  } catch { return dateStr }
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleString('ar-EG', {
      dateStyle: 'short', timeStyle: 'short'
    })
  } catch { return dateStr }
}

export function truncate(str, len = 30) {
  return str && str.length > len ? str.slice(0, len) + '…' : str
}

export function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)
}

export function randomPassword(length = 10) {
  const chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefghjkmnpqrstwxyz23456789'
  return Array.from({ length }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}
