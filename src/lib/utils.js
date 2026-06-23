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

// ════════════════════════════════════════════════════════════
// بصمة الجهاز — مشتركة بين فحص الدخول (AuthContext) وصفحة الأجهزة (Devices.jsx)
// ════════════════════════════════════════════════════════════

/** بصمة ثابتة لهذا المتصفح/الجهاز — تُولَّد مرة واحدة وتبقى مخزَّنة محلياً */
export function getDeviceFingerprint() {
  const KEY = 'device_fingerprint'
  let fp = localStorage.getItem(KEY)
  if (!fp) {
    fp = generateId()
    localStorage.setItem(KEY, fp)
  }
  return fp
}

/** اسم وصفي لنظام الجهاز من user agent */
export function getDeviceName(ua = navigator.userAgent) {
  if (/Android/i.test(ua)) return '🤖 Android'
  if (/iPhone|iPad|iPod/i.test(ua)) return '🍎 iOS'
  if (/Windows/i.test(ua)) return '🖥️ Windows'
  if (/Macintosh/i.test(ua)) return '💻 Mac'
  return '🌐 جهاز غير معروف'
}

/** نوع الجهاز: mobile أو desktop */
export function getDeviceType(ua = navigator.userAgent) {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ? 'mobile' : 'desktop'
}
