/**
 * healthFields.js — دوال مساعدة مركزية لقراءة الحقول الصحية المخزَّنة كـ jsonb array
 * (disabilities/injuries/chronic_diseases/female_status وما شابهها)
 *
 * هذه الحقول قد تصل من Supabase كمصفوفة حقيقية، أو كنص JSON (أحياناً بعلامات
 * تنصيص مضاعفة بسبب تلوّث بيانات قديم) — هذه الدوال تتعامل مع كل الحالات بأمان.
 * تُستخدم في: Analysis.jsx, WomenPage.jsx, ChildrenPage.jsx (وأي صفحة جديدة
 * تحتاج عرض/فحص هذه الحقول، بدل تكرار نفس المنطق محلياً).
 */

/** قراءة آمنة لعمود jsonb مخزَّن كمصفوفة (قد يأتي كنص JSON أو مصفوفة حقيقية) */
export function parseArr(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  if (typeof val === 'string') {
    const s = val.trim().replace(/^"+|"+$/g, '') // إزالة "" المضاعفة (تلوّث بيانات قديم)
    if (!s || s === '[]' || s === 'null') return []
    try { const p = JSON.parse(s); return Array.isArray(p) ? p : [] }
    catch { return [] }
  }
  return []
}

/** هل يوجد قيمة فعلية بهذا الحقل؟ */
export function hasHealthData(val) {
  return parseArr(val).length > 0
}

/** نص العرض المُجمَّع للمصفوفة (يدعم عناصر نصية أو كائنات بها type/label) */
export function arrLabel(val) {
  const arr = parseArr(val)
  if (!arr.length) return ''
  return arr.map(v => {
    if (typeof v === 'string') return v
    if (typeof v === 'object') return v.type || v.label || JSON.stringify(v)
    return String(v)
  }).join('، ')
}
