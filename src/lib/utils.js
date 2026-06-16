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

export function calcAge(dob) {
  if (!dob) return null
  const b = new Date(dob), t = new Date()
  let age = t.getFullYear() - b.getFullYear()
  if (t.getMonth() < b.getMonth() ||
     (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--
  return age >= 0 && age < 120 ? age : null
}

export function truncate(str, len = 30) {
  return str && str.length > len ? str.slice(0, len) + '…' : str
}

export function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)
}
