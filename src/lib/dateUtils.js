/**
 * dateUtils.js — دوال مركزية لحساب العمر والتعامل مع التواريخ
 * تُستخدم في كل صفحة تحتاج عرض/حساب عمر من تاريخ ميلاد (dob)،
 * بدل تكرار نفس المنطق محلياً في كل ملف.
 */

/**
 * يحسب العمر بالسنوات الكاملة من تاريخ الميلاد.
 * يرجع null لو التاريخ فاضي، أو غير صالح، أو خارج نطاق معقول (0-120).
 * (منذ إضافة قيد منع التاريخ المستقبلي في DateInput، يندر تجاوز هذا النطاق،
 * لكنه يبقى حماية ضرورية لبيانات قديمة قد تكون أُدخلت قبل هذا القيد).
 */
export function calcAge(dob) {
  if (!dob) return null
  const b = new Date(dob)
  if (isNaN(b)) return null
  const t = new Date()
  let age = t.getFullYear() - b.getFullYear()
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--
  return age >= 0 && age < 120 ? age : null
}
