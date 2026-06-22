/**
 * familyValidation.js — دوال مركزية للتحقق من اكتمال/صحة بيانات الأسرة
 * تُستخدم في FamiliesList (شارة "نقص") وأي صفحة أخرى تحتاج نفس الفحص.
 */

/** يرجع قائمة نصية بكل النواقص في بيانات أسرة معيّنة (فاضية = بيانات كاملة) */
export function checkFamilyIssues(f, members) {
  const issues = []
  const mems   = members || []

  // ── رب الأسرة ──
  if (!f.head_name?.trim())
    issues.push('اسم رب الأسرة ناقص')
  else if ((f.head_name||'').trim().split(/\s+/).filter(Boolean).length < 4)
    issues.push('الاسم غير رباعي')

  if (!f.head_id?.trim())
    issues.push('رقم الهوية ناقص')

  if (!f.phone1?.trim())
    issues.push('رقم الجوال ناقص')

  if (!f.camp_id)
    issues.push('المخيم غير محدد')

  if (!f.head_dob)
    issues.push('تاريخ الميلاد ناقص')

  if (!f.head_marital?.trim())
    issues.push('الحالة الاجتماعية ناقصة')

  // ── النواقص الذكية — زوجة مفقودة ──
  const marital = (f.head_marital || '').trim()
  if (marital === 'متزوج' || marital === 'متزوجة') {
    const hasSpouse = mems.some(m => m.relation === 'زوجة' || m.relation === 'زوج')
    if (!hasSpouse) issues.push('بيانات الزوجة ناقصة')
  }

  // ── الأفراد — نفحص الاسم فقط كشرط إلزامي ──
  mems.forEach(m => {
    const name = (m.name || '').trim()
    if (!name) {
      issues.push('اسم فرد فارغ')
      return
    }
    if (name.split(/\s+/).filter(Boolean).length < 3)
      issues.push(`اسم "${name}" قصير جداً`)
  })

  return issues
}

/** هل بيانات هذه الأسرة ناقصة (أي نقص واحد على الأقل)؟ */
export function isIncomplete(f, members) {
  return checkFamilyIssues(f, members).length > 0
}
