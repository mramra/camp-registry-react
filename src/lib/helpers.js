/**
 * helpers.js — ملف مركزي موحَّد لكل دوال منطق الأسر (تواريخ، تحقق، أفراد، حقول صحية)
 * كل صفحة تستورد ما تحتاجه من هنا بدل تكرار المنطق محلياً.
 *
 * الأقسام:
 *   1. التواريخ والعمر
 *   2. التحقق من بيانات الأسرة
 *   3. أفراد الأسرة
 *   4. الحقول الصحية (jsonb arrays)
 */

// ════════════════════════════════════════════════════════════
// 1. التواريخ والعمر
// ════════════════════════════════════════════════════════════

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

/**
 * فلترة دقيقة بمدى عمري (بالأيام الفعلية، لا بالسنوات المقرَّبة لأسفل).
 * المشكلة التي تحلّها: calcAge يُرجع "1" لأي عمر من 12 إلى 23 شهراً تقريباً
 * (بالتقريب لأسفل لأقرب سنة كاملة) — فطفل عمره سنة و9 أشهر يظهر "1" تماماً
 * كطفل عمره سنة و1 يوم. هذا صحيح للعرض، لكنه مضلِّل في فلتر "من 0 إلى 1"
 * الذي يُفهم منه عادة "أقل من سنة" (رضيع)، فيُدرج خطأً من تجاوز عامه الأول بكثير.
 * هذه الدالة تقارن بالعمر الفعلي بالأيام (سنة = 365.25 يوم) فتُخرج من تجاوز
 * السنة فعلياً، حتى لو كان calcAge يعرضه كـ"1".
 */
export function isAgeInRange(dob, min, max) {
  if (!dob) return false
  const b = new Date(dob)
  if (isNaN(b)) return false
  const ms = Date.now() - b.getTime()
  if (ms < 0) return false
  const years = ms / (365.25 * 24 * 3600 * 1000)
  if (min !== '' && min !== null && min !== undefined && years < parseFloat(min)) return false
  if (max !== '' && max !== null && max !== undefined && years > parseFloat(max)) return false
  return true
}

// ════════════════════════════════════════════════════════════
// 2. التحقق من بيانات الأسرة
// ════════════════════════════════════════════════════════════

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

/** خوارزمية Luhn — للتحقق من صحة رقم الهوية (يكتشف أرقاماً غير صالحة رياضياً) */
export function luhnCheck(num) {
  const n = String(num).replace(/\D/g,'')
  if (!n) return false
  let sum = 0
  for (let i = 0; i < n.length; i++) {
    let d = parseInt(n[n.length-1-i])
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9 }
    sum += d
  }
  return sum % 10 === 0
}

/** تحقق الاسم الرباعي — يرجع رسالة خطأ أو null لو صحيح */
export function validateName(name) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length < 4) return `❌ الاسم يجب أن يكون رباعياً (${words.length}/4 كلمات)`
  return null
}

/** تحقق تاريخ الميلاد (طبقة حماية ثانية بعد قيد DateInput، لمنع أي تاريخ مستقبلي تجاوز الواجهة) */
export function validateDob(dob) {
  if (!dob) return null
  const today = new Date()
  today.setHours(0,0,0,0)
  if (new Date(dob) > today) return '❌ تاريخ الميلاد لا يمكن أن يكون في المستقبل'
  return null
}

// ════════════════════════════════════════════════════════════
// 3. أفراد الأسرة
// ════════════════════════════════════════════════════════════

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

/** ترتيب أفراد الأسرة: الزوج/الزوجة أولاً، ثم الباقي حسب تاريخ الميلاد */
export function sortMembers(mems) {
  return [...mems].sort((a, b) => {
    const ro = { 'زوجة':0, 'زوج':0 }
    const ra = ro[a.relation?.trim()] ?? 1
    const rb = ro[b.relation?.trim()] ?? 1
    if (ra !== rb) return ra - rb
    const da = a.dob ? new Date(a.dob).getTime() : Infinity
    const db = b.dob ? new Date(b.dob).getTime() : Infinity
    return da - db
  })
}

// ════════════════════════════════════════════════════════════
// 4. الحقول الصحية (jsonb arrays: disabilities/injuries/chronic_diseases)
// ════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════
// 5. كشف الحمل والرضاعة التلقائي (مشترك بين WomenPage وHealthReport)
// ════════════════════════════════════════════════════════════

/** صلات تُعتبر "زوجة/أم" لحساب المرضعة تلقائياً */
export const VALID_MOTHER_RELATIONS = ['زوجة','زوجة ثانية','زوجة ثالثة','زوجة رابعة','زوجه','أم','wife','mother']

/** الأسر التي فيها زوجة/أم مسجّلة بصلة محددة (Set من family_id) */
export function buildFamHasNamedWife(members) {
  const s = new Set()
  ;(members || []).forEach(m => {
    const rel = (m.relation || '').trim()
    if (VALID_MOTHER_RELATIONS.includes(rel)) s.add(m.family_id)
  })
  return s
}

/** الأسر التي فيها رضيع (عمر أقل من سنتين) من الأفراد أو رب الأسرة (Set من family_id) */
export function buildFamWithInfant(members, families) {
  const s = new Set()
  ;(members || []).forEach(m => {
    const a = calcAge(m.dob)
    if (a !== null && a < 2) s.add(m.family_id)
  })
  ;(families || []).forEach(f => {
    const a = calcAge(f.head_dob)
    if (a !== null && a < 2) s.add(f.id)
  })
  return s
}

/**
 * هل هذا الشخص مرضعة تلقائياً (بدون تسجيل صريح بحقل female_status)؟
 * مطابق لـ isNursingMother في النسخة القديمة: عمر 15-50 + صلة زوجة/أم
 * (أو امرأة بلا صلة مسجّلة في أسرة بلا زوجة معروفة) + وجود رضيع بالأسرة.
 * person: { relation, age, family_id, isHead }
 */
export function isAutoNursing(person, famHasNamedWife, famWithInfant) {
  const relation = (person.relation || '').trim()
  const age = person.age
  const famId = person.family_id
  const inAgeRange = age === null || (age >= 15 && age <= 50)
  let relationOk = false
  if (relation) {
    relationOk = VALID_MOTHER_RELATIONS.includes(relation)
  } else if (!person.isHead) {
    relationOk = !famHasNamedWife.has(famId)
  } else {
    relationOk = true // رب أسرة أنثى بلا relation = أم الأسرة
  }
  return inAgeRange && relationOk && famWithInfant.has(famId)
}

// ════════════════════════════════════════════════════════════
// 6. فئات الأسرة (تقارير الاحتياجات)
// ════════════════════════════════════════════════════════════

/**
 * فئات الأسرة الكاملة: وسوم مُخزَّنة يدوياً (شهيد/أسير من family.category_tags)
 * + فئات تلقائية تُحسَب دائماً عند كل استدعاء (لا تُخزَّن، لا تُعدَّل يدوياً):
 *   - فاقد معيل: رب الأسرة أنثى + لا يوجد زوج/ابن بالغ (18+) مسجَّل بالأسرة
 *   - أسرة كبيرة: أكثر من 7 أفراد (رب الأسرة + الأفراد)
 *   - أسرة عادية: افتراضية لو لم تنطبق أي فئة أخرى
 * family: صف من جدول families. members: أفراد هذه الأسرة فقط (بدون رب الأسرة).
 */
export function getFamilyCategories(family, members) {
  const stored = parseArr(family?.category_tags) // شهيد/أسير فقط، كما اختارها المستخدم
  const auto = []
  const mems = members || []

  const headIsFemale = family?.head_gender === 'أنثى' || family?.head_gender === 'female'
  if (headIsFemale) {
    const hasAdultMale = mems.some(m => {
      if (!['زوج', 'ابن'].includes((m.relation || '').trim())) return false
      const age = calcAge(m.dob)
      return age === null || age >= 18 // بلا تاريخ ميلاد = نفترض بالغاً احتياطاً
    })
    if (!hasAdultMale) auto.push('no_provider')
  }

  if (1 + mems.length > 7) auto.push('large')

  const all = [...stored, ...auto]
  return all.length ? all : ['normal']
}
