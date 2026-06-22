/**
 * familyHelpers.js — دوال مساعدة عامة متعلقة بأفراد الأسرة
 * (استبعاد رب الأسرة من قائمة الأفراد، أيقونة العضو حسب صلته/جنسه)
 */

/**
 * يرجع أفراد أسرة معيّنة من قائمة كل الأفراد، باستبعاد رب الأسرة نفسه
 * (يُستبعَد بصلته "رب الأسرة"، أو تطابق رقم هويته، أو تطابق اسمه بالضبط).
 */
export function getMembers(allMems, family) {
  return allMems.filter(m => {
    if (m.family_id !== family.id) return false
    const rel   = (m.relation||'').trim()
    const mName = (m.name||'').trim().replace(/\s+/g,' ')
    const hName = (family.head_name||'').trim().replace(/\s+/g,' ')
    if (['رب الأسرة','رب أسرة','head'].includes(rel)) return false
    if (family.head_id && m.national_id && m.national_id.trim()===family.head_id.trim()) return false
    if (mName && hName && mName===hName) return false
    return true
  })
}

/** أيقونة تمثيلية للفرد حسب صلته بالأسرة وجنسه */
export function getMemberIcon(relation, gender) {
  const rel = (relation || '').trim()
  const g   = (gender   || '').trim()
  const isFemale = g === 'أنثى' || g === 'female'
  const isMale   = g === 'ذكر'  || g === 'male'
  if (rel === 'زوجة' || rel === 'زوج')            return '💑'
  if (rel === 'ابن'  || rel === 'ولد')             return '👦'
  if (rel === 'ابنة' || rel === 'بنت')             return '👧'
  if (rel === 'أب'   || rel === 'أم')              return isFemale ? '👩' : '👨'
  if (rel === 'أخ'   || rel === 'أخت')             return isFemale ? '👩' : '👦'
  if (rel === 'جد'   || rel === 'جدة')             return isFemale ? '👵' : '👴'
  if (isFemale) return '👩'
  if (isMale)   return '👨'
  return '👤'
}
