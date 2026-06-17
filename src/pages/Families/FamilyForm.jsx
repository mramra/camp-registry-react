import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRxDB } from '../../lib/useRxDB'
import { supabase, ORG_ID } from '../../lib/supabase'
import { logFamilyActivity } from '../../lib/familyActivityLog'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'

// ══ ثوابت خارج الـ component ══
const RELATION_BY_GENDER = {
  'ذكر':  ['زوج','ابن','أب','أخ','جد','حفيد','عم','خال','أخرى'],
  'أنثى': ['زوجة','ابنة','أم','أخت','جدة','حفيدة','عمة','خالة','أخرى'],
}
const ALL_RELATIONS = [...new Set([
  ...RELATION_BY_GENDER['ذكر'], ...RELATION_BY_GENDER['أنثى']
])]
const HEALTH_OPTIONS = [
  { v:'سليم',  label:'✅ سليم'       },
  { v:'مريض',  label:'🤒 مريض'       },
  { v:'معاق',  label:'♿ معاق'        },
  { v:'مزمن',  label:'💊 مرض مزمن'  },
  { v:'مصاب',  label:'🩹 إصابة حرب' },
]
const MARITAL_BY_GENDER = {
  'ذكر':  ['متزوج','أعزب','مطلق','أرمل'],
  'أنثى': ['متزوجة','عزباء','مطلقة','أرملة'],
}


const FAMILY_CATEGORIES = [
  { key:'martyr',  label:'🕊️ أسرة شهيد' },
  { key:'captive', label:'⛓️ أسرة أسير'  },
]
const ECONOMIC_LEVELS = [
  { key:'extreme_poverty', label:'🔴 فقر مدقع'       },
  { key:'poor',            label:'🟠 فقير'           },
  { key:'worker',          label:'🟡 عامل / متوسط'   },
  { key:'employee',        label:'🟢 موظف / متوسط'   },
  { key:'well_off',        label:'🔵 ميسور'          },
]
const EMPTY_FORM = {
  head_name:'', head_id:'', phone1:'', phone2:'',
  head_gender:'', head_marital:'', head_dob:'',
  camp_id:'', tent:'', tent2:'',
  original_address:'', address_details:'', notes:'',
  categories:[], economic_level:'', num_orphans:0,
}
const newMember = () => ({
  id: crypto.randomUUID(),
  name:'', gender:'', relation:'',
  national_id:'', dob:'', health:'سليم',
})

// ══ Luhn check لرقم الهوية ══
function luhnCheck(num) {
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

// ══ تحقق الاسم الرباعي ══
function validateName(name) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length < 4) return `❌ الاسم يجب أن يكون رباعياً (${words.length}/4 كلمات)`
  return null
}

// ══ تحقق تاريخ الميلاد (لا مستقبل) ══
function validateDob(dob) {
  if (!dob) return null
  const today = new Date()
  today.setHours(0,0,0,0)
  if (new Date(dob) > today) return '❌ تاريخ الميلاد لا يمكن أن يكون في المستقبل'
  return null
}

// ══ مكوّن حقل النص (خارج الـ component الرئيسي — حل مشكلة الكيبورد) ══
function FormField({ label, value, onChange, type='text', error, placeholder, required, ...rest }) {
  return (
    <div>
      <label className="text-xs font-bold text-muted block mb-1.5">
        {label}{required ? ' *' : ''}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full bg-surface2 border ${error ? 'border-red' : 'border-border'} rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent`}
        {...rest}
      />
      {error && <p className="text-red text-[11px] mt-1">{error}</p>}
    </div>
  )
}

// ══ مكوّن صف الفرد (خارج الـ component الرئيسي — حل مشكلة الكيبورد) ══
function MemberRow({ member, index, onUpdate, onRemove, errors }) {
  const relations = member.gender
    ? (RELATION_BY_GENDER[member.gender] || ALL_RELATIONS)
    : ALL_RELATIONS

  const dobErr = validateDob(member.dob)

  return (
    <div className="bg-bg border border-border rounded-xl p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-accent text-xs font-bold">فرد {index + 1}</span>
        <button type="button" onClick={() => onRemove(member.id)}
          className="text-red text-xs border border-red/30 bg-red/10 px-2.5 py-1 rounded-lg font-bold">
          حذف
        </button>
      </div>
      <div className="flex flex-col gap-2.5">
        {/* الاسم */}
        <div>
          <label className="text-[10px] font-bold text-muted block mb-1">الاسم *</label>
          <input
            value={member.name}
            onChange={e => onUpdate(member.id, 'name', e.target.value)}
            placeholder="الاسم الرباعي"
            className={`w-full bg-surface2 border ${errors[`m_name_${index}`] ? 'border-red':'border-border'} rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent`}
          />
          {errors[`m_name_${index}`] && (
            <p className="text-red text-[10px] mt-0.5">{errors[`m_name_${index}`]}</p>
          )}
          {!errors[`m_name_${index}`] && member.name && (() => {
            const e = validateName(member.name)
            return e ? <p className="text-accent text-[10px] mt-0.5">{e}</p> : <p className="text-green text-[10px] mt-0.5">✅ اسم صحيح</p>
          })()}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold text-muted block mb-1">الجنس</label>
            <select value={member.gender}
              onChange={e => onUpdate(member.id, 'gender', e.target.value)}
              className="w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent">
              <option value="">اختر</option>
              <option value="ذكر">ذكر</option>
              <option value="أنثى">أنثى</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted block mb-1">صلة القرابة</label>
            <select value={member.relation}
              onChange={e => onUpdate(member.id, 'relation', e.target.value)}
              className="w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent">
              <option value="">اختر</option>
              {relations.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {/* رقم الهوية */}
        <div>
          <label className="text-[10px] font-bold text-muted block mb-1">رقم الهوية</label>
          <input value={member.national_id}
            onChange={e => onUpdate(member.id,'national_id',e.target.value)}
            type="tel" inputMode="numeric" placeholder="9 أرقام" maxLength={9} dir="ltr"
            className="w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" />
          {member.national_id?.length >= 9 && (
            <p className={`text-[10px] mt-0.5 ${luhnCheck(member.national_id)?'text-green':'text-red'}`}>
              {luhnCheck(member.national_id) ? '✅ هوية صحيحة' : '❌ هوية غير صحيحة'}
            </p>
          )}
        </div>

        {/* تاريخ الميلاد — full width */}
        <div>
          <label className="text-[10px] font-bold text-muted block mb-1">تاريخ الميلاد</label>
          <DateInput
            value={member.dob || ''}
            onChange={v => onUpdate(member.id,'dob',v)}
          />
          {dobErr && <p className="text-red text-[10px] mt-0.5">{dobErr}</p>}
        </div>

        <div>
          <label className="text-[10px] font-bold text-muted block mb-1">الحالة الصحية</label>
          <select value={member.health || 'سليم'}
            onChange={e => onUpdate(member.id,'health',e.target.value)}
            className="w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent">
            {HEALTH_OPTIONS.map(h => <option key={h.v} value={h.v}>{h.label}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════
// المكوّن الرئيسي
// ══════════════════════════════════════
function sortMembers(mems) {
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


// ── مدخل التاريخ: يوم / شهر / سنة ─────────────────────
function calcAgeFromDob(dob) {
  if (!dob) return null
  const b = new Date(dob), t = new Date()
  let a = t.getFullYear() - b.getFullYear()
  if (t.getMonth() < b.getMonth() || (t.getMonth()===b.getMonth() && t.getDate()<b.getDate())) a--
  return a >= 0 && a < 120 ? a : null
}

function DateInput({ value, onChange, maxYear, minYear }) {
  const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

  // useRef للاحتفاظ بالاختيارات الجزئية بدون فقدانها عند re-render
  const parts    = (value || '').split('-')
  const initYr   = parts[0] || ''
  const initMo   = parts[1] || ''
  const initDy   = parts[2] || ''

  const partial  = useRef({ yr: initYr, mo: initMo, dy: initDy })
  const [tick, setTick] = useState(0)   // لإجبار الـ re-render عند التغيير

  // مزامنة مع value الخارجية فقط إذا تغيّرت لقيمة كاملة
  const prevValue = useRef(value)
  if (value !== prevValue.current) {
    prevValue.current = value
    if (value) {
      const p = value.split('-')
      partial.current = { yr: p[0]||'', mo: p[1]||'', dy: p[2]||'' }
    }
  }

  const { yr, mo, dy } = partial.current
  const curYear     = new Date().getFullYear()
  const maxYr       = maxYear || curYear
  const minYr       = minYear || 1900
  const daysInMonth = mo && yr ? new Date(parseInt(yr), parseInt(mo), 0).getDate() : 31
  const age         = calcAgeFromDob(value)

  function select(field, val) {
    partial.current = { ...partial.current, [field]: val }
    setTick(t => t + 1)   // أعد الرسم لإظهار الاختيار
    const { yr: y, mo: m, dy: d } = partial.current
    if (y && m && d) {
      // اكتمل التاريخ — أخبر الـ parent
      onChange(`${String(y).padStart(4,'0').slice(-4)}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`)
    }
  }

  const SEL = "bg-surface2 border border-border rounded-xl text-white text-sm focus:outline-none focus:border-accent py-2.5 px-1 text-center w-full"

  return (
    <div>
      <div className="grid gap-1.5" style={{gridTemplateColumns:'1fr 2fr 2fr'}}>
        {/* يوم */}
        <select value={dy} onChange={e => select('dy', e.target.value)} className={SEL}>
          <option value="">يوم</option>
          {Array.from({length: daysInMonth}, (_, i) => i + 1).map(d => (
            <option key={d} value={String(d).padStart(2,'0')}>{d}</option>
          ))}
        </select>
        {/* شهر */}
        <select value={mo} onChange={e => select('mo', e.target.value)} className={SEL}>
          <option value="">الشهر</option>
          {MONTHS.map((m, i) => (
            <option key={i} value={String(i+1).padStart(2,'0')}>{m}</option>
          ))}
        </select>
        {/* سنة */}
        <select value={yr} onChange={e => select('yr', e.target.value)} className={SEL}>
          <option value="">السنة</option>
          {Array.from({length: maxYr - minYr + 1}, (_, i) => maxYr - i).map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      {age !== null && (
        <p className="text-accent text-[11px] mt-1 text-right">العمر: {age} سنة</p>
      )}
    </div>
  )
}

export default function FamilyForm() {
  const { id } = useParams()
  const isEdit = !!id
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [members,   setMembers]   = useState([])
  const [camps,     setCamps]     = useState([])
  const [errors,    setErrors]    = useState({})
  const [dupAlert,  setDupAlert]  = useState('')
  const [saving,    setSaving]    = useState(false)
  const submittingRef = useRef(false)  // حارس فوري — يمنع الضغط المزدوج قبل re-render
  const { profile } = useAuth()
  const { showToast } = useApp()
  const { query, upsert, bulkUpsert, remove } = useRxDB()
  const navigate = useNavigate()

  useEffect(() => {
    query('camps').then(setCamps)

    if (isEdit) {
      // ① جلب من localDB فوراً
      query('families').then(fs => fs.find(f=>f.id===id) || null).then(f => {
        if (f) setForm({ ...EMPTY_FORM, ...f,
          categories:    f.categories    || [],
          economic_level:f.economic_level || '',
          num_orphans:   f.num_orphans   || 0,
        })
      })
      query('family_members', {family_id: id}).then(d => setMembers(sortMembers(d)))

      // ② جلب من Supabase للتأكد من البيانات الكاملة
      if (navigator.onLine) {
        supabase.from('families').select('*').eq('id', id).single()
          .then(({ data }) => {
            if (data) {
              setForm({ ...EMPTY_FORM, ...data,
                categories:    data.categories    || [],
                economic_level:data.economic_level || '',
                num_orphans:   data.num_orphans   || 0,
              })
              // حفظ محلي محدّث
              upsert('families', data)
            }
          })
        supabase.from('family_members').select('*').eq('family_id', id)
          .then(({ data }) => {
            if (data?.length) {
              // دمج Supabase مع Dexie — خذ الأكثر
              setMembers(prev => {
                // إذا Supabase أرجع أفراد أكثر → استخدمه
                // إذا Dexie أكثر → ابقَ على Dexie
                const merged = data.length >= prev.length ? data : prev
                return sortMembers(merged)
              })
              bulkUpsert('family_members', data)
            }
            // إذا data فارغة → لا تمسح ما في Dexie
          })
      }
    }
  }, [id])

  // useCallback لمنع إعادة إنشاء الدوال
  const setF = useCallback((field, value) => {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => ({ ...e, [field]: null }))
  }, [])

  // فحص التكرار عند الكتابة
  const checkDuplicate = useCallback(async (field, value) => {
    if (!value || value.length < 3) { setDupAlert(''); return }
    const all = await query("families")
    const dup = all.find(f => {
      if (isEdit && f.id === id) return false
      if (field === 'head_id') return f.head_id === value
      if (field === 'head_name') return (f.head_name||'').trim() === value.trim()
      return false
    })
    if (dup) setDupAlert(`⚠️ تكرار: "${field==='head_id'?'رقم الهوية':'الاسم'}" موجود مسبقاً`)
    else setDupAlert('')
  }, [id, isEdit])

  const updateMember = useCallback((memberId, field, value) => {
    setMembers(m => m.map(x => {
      if (x.id !== memberId) return x
      const updated = { ...x, [field]: value }
      if (field === 'gender') updated.relation = ''
      return updated
    }))
  }, [])

  const removeMember = useCallback((memberId) => {
    setMembers(m => m.filter(x => x.id !== memberId))
  }, [])

  const addMember = useCallback(() => {
    setMembers(m => [...m, newMember()])
  }, [])

  function validate() {
    const errs = {}
    // اسم رباعي
    if (!form.head_name.trim()) {
      errs.head_name = 'الاسم مطلوب'
    } else {
      const nameErr = validateName(form.head_name)
      if (nameErr) errs.head_name = nameErr
    }
    // رقم الهوية
    if (!form.head_id.trim()) {
      errs.head_id = 'رقم الهوية مطلوب'
    } else if (form.head_id.trim().length < 9) {
      errs.head_id = '❌ رقم الهوية أقل من 9 أرقام'
    } else if (!luhnCheck(form.head_id.trim())) {
      errs.head_id = '❌ رقم الهوية غير صحيح'
    }
    // تاريخ الميلاد
    const dobErr = validateDob(form.head_dob)
    if (dobErr) errs.head_dob = dobErr
    // المخيم
    if (!form.camp_id) errs.camp_id = 'اختر المخيم'
    // أفراد
    members.forEach((m, i) => {
      if (!m.name.trim()) errs[`m_name_${i}`] = 'الاسم مطلوب'
      else {
        const e = validateName(m.name)
        if (e) errs[`m_name_${i}`] = e
      }
    })
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    // حارس فوري — يمنع نقرات متعددة سريعة قبل أن يُحدّث React الزر
    if (submittingRef.current) return
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    submittingRef.current = true
    setSaving(true)
    try {
      const now       = new Date().toISOString()
      const familyId  = isEdit ? id : crypto.randomUUID()
      const newVersion = (form.version || 0) + 1

      // ═══ بيانات الأسرة الكاملة ═══
      // الحقول المقبولة في Supabase فقط
      const ALLOWED_FIELDS = [
        'id','org_id','camp_id','head_name','head_id','head_gender','head_dob',
        'head_marital','phone1','phone2','tent','original_address','address_details',
        'status','notes','category_tags','economic_level','version',
        'created_at','updated_at','created_by','updated_by',
      ]
      const actorId   = profile?.user_id || profile?.id || null
      const actorName = profile?.full_name || profile?.name || '—'
      const familyData = {
        id:             familyId,
        org_id:         ORG_ID,
        camp_id:        form.camp_id        || null,
        head_name:      form.head_name      || '',
        head_id:        form.head_id        || null,
        head_gender:    form.head_gender    || null,
        head_dob:       form.head_dob       || null,
        head_marital:   form.head_marital   || null,
        phone1:         form.phone1         || null,
        phone2:         form.phone2         || null,
        tent:           form.tent           || null,
        original_address:  form.original_address  || null,
        address_details:   form.address_details   || null,
        notes:          form.notes          || null,
        category_tags:  form.categories     || form.category_tags || [],
        economic_level: form.economic_level || null,
        version:        newVersion,
        created_at:     isEdit ? (form.created_at || now) : now,
        updated_at:     now,
        // عند الإضافة: created_by = المستخدم الحالي، updated_by فاضي
        // عند التعديل: created_by يبقى كما هو (لا يُكتب فوقه)، updated_by = المستخدم الحالي
        created_by:     isEdit ? (form.created_by || null) : actorId,
        updated_by:     isEdit ? actorId : null,
      }

      // ═══ بيانات الأفراد ═══
      const memberDocs = members.map(m => ({
        id:          m.id || crypto.randomUUID(),
        family_id:   familyId,
        name:        m.name        || '',
        gender:      m.gender      || '',
        relation:    m.relation    || '',
        national_id: m.national_id || null,
        dob:         m.dob         || null,
        health:      m.health      || 'سليم',
        updated_at:  now,
      }))

      // ══════════════════════════════════════════
      // ① حفظ محلي فوري (قبل أي شيء)
      // ══════════════════════════════════════════
      await upsert('families', familyData)
      // upsert كل فرد بـ id — لا نحذف الأفراد القديمة إلا من removedIds
      const currentMemberIds = new Set(memberDocs.map(m => m.id))
      const existingMems = await query('family_members', {family_id: familyId})
      const removedIds   = existingMems.filter(m => !currentMemberIds.has(m.id)).map(m => m.id)
      // احذف المحذوفين فقط
      if (removedIds.length) await Promise.all(removedIds.map(id => remove('family_members', id)))
      // أضف/حدّث الموجودين
      if (memberDocs.length) {
        const withOrgId = memberDocs.map(m => ({ ...m, org_id: ORG_ID }))
        await bulkUpsert("family_members", memberDocs)
      }

      // إضافة لطابور المزامنة
      // RxDB يتولى المزامنة تلقائياً

      // ══════════════════════════════════════════
      // ② رفع للسيرفر (إذا متصل)
      // ══════════════════════════════════════════
      if (navigator.onLine) {
        // رفع الأسرة
        // إزالة undefined قبل الإرسال
        const cleanData = Object.fromEntries(
          Object.entries(familyData).filter(([,v]) => v !== undefined)
        )
        const { data: savedFamily, error: fErr } = await supabase
          .from('families').upsert(cleanData).select().single()

        if (!fErr && savedFamily) {
          await upsert('families', { ...familyData, ...savedFamily })
          // سجّل العملية في سجل النشاط (لا يعيق الحفظ، لا يرمي خطأ)
          logFamilyActivity({
            familyId:     familyId,
            familyName:   familyData.head_name,
            membersCount: memberDocs.length,
            action:       isEdit ? 'update' : 'insert',
            actorId,
            actorName,
          })
        } else if (fErr) {
          console.warn('[save family]', fErr.message)
          showToast('⚠️ حُفظ محلياً — سيُزامَن لاحقاً')
        }

        // ── رفع الأفراد — حفظ محلي أولاً ثم مزامنة في الخلفية ──
        // حفظ Dexie فوراً
        if (removedIds.length)
          await Promise.all(removedIds.map(id => remove('family_members', id))).catch(()=>{})
        if (memberDocs.length)
          await bulkUpsert('family_members', memberDocs)

        // مزامنة Supabase في الخلفية (لا تنتظر)
        if (memberDocs.length || removedIds.length) {
          const syncMembers = async () => {
            try {
              const { data: serverMems } = await supabase
                .from('family_members').select('id').eq('family_id', familyId)
              const serverIds = new Set((serverMems||[]).map(m=>m.id))
              const localIds  = new Set(memberDocs.map(m=>m.id))

              // حذف
              const toDelete = (serverMems||[]).filter(m=>!localIds.has(m.id)).map(m=>m.id)
              if (toDelete.length)
                await supabase.from('family_members').delete().in('id', toDelete)

              // إضافة الجدد
              const toInsert = memberDocs.filter(m=>!serverIds.has(m.id))
              if (toInsert.length)
                await supabase.from('family_members').insert(toInsert)

              // تحديث الموجودين
              const toUpdate = memberDocs.filter(m=>serverIds.has(m.id))
              for (const m of toUpdate)
                await supabase.from('family_members').update({
                  name:m.name, national_id:m.national_id, dob:m.dob,
                  gender:m.gender, relation:m.relation, health:m.health,
                  updated_at:now,
                }).eq('id', m.id)

              console.log(`[sync] ✓ أفراد: +${toInsert.length} ~${toUpdate.length} -${toDelete.length}`)
            } catch(e) {
              console.warn('[sync members bg]', e.message)
              // أضف للطابور إذا فشل
              for (const m of memberDocs)
                await enqueue('insert_member', { ...m, org_id: ORG_ID }).catch(()=>{})
            }
          }
          syncMembers() // بدون await — لا تعيق الحفظ
        }
        showToast(isEdit ? '✅ تم تحديث الأسرة وستتم مزامنتها' : '✅ تمت إضافة الأسرة وستتم مزامنتها')
      } else {
        // ══ أوف لاين: أضف للقائمة لرفعها لاحقاً ════════════
        await addToQueue('upsert', 'families', familyData)
        for (const m of memberDocs)
          await addToQueue('upsert', 'family_members', m)
        for (const id of removedIds)
          await addToQueue('delete', 'family_members', { id }, id)
        showToast(isEdit
          ? '💾 تم تحديث الأسرة محلياً — سيُرفع عند الاتصال'
          : '💾 تمت إضافة الأسرة محلياً — ستُرفع عند الاتصال')
      }

      // تأخير بسيط ليرى المستخدم رسالة التأكيد قبل مغادرة الصفحة
      await new Promise(r => setTimeout(r, 700))
      navigate('/families')
    } catch (err) {
      console.error('[handleSubmit]', err)
      showToast('خطأ: ' + err.message, true)
    } finally {
      setSaving(false)
      submittingRef.current = false
    }
  }

  // فحص التكرار لرقم الهوية والاسم
  const nameErr   = form.head_name && !errors.head_name ? validateName(form.head_name) : null
  const idStatus  = form.head_id?.length >= 9
    ? (luhnCheck(form.head_id) ? '✅ هوية صحيحة' : '❌ هوية غير صحيحة')
    : form.head_id?.length > 0 ? `أدخل ${9-form.head_id.length} أرقام أخرى` : null
  const idOk      = form.head_id?.length >= 9 && luhnCheck(form.head_id)

  return (
    <div>
      <PageHeader icon={isEdit?'✏️':'➕'}
        title={isEdit?'تعديل أسرة':'إضافة أسرة جديدة'} back />

      {/* تنبيه التكرار */}
      {dupAlert && (
        <div className="bg-red/10 border border-red/30 text-red text-xs rounded-xl px-4 py-3 mb-3 font-bold">
          {dupAlert}
        </div>
      )}

      <form onSubmit={handleSubmit} autoComplete="off">

        {/* ══ رب الأسرة ══ */}
        <Card title="بيانات رب الأسرة" icon="👤">
          <div className="flex flex-col gap-3">

            {/* الاسم */}
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">اسم رب الأسرة *</label>
              <input
                value={form.head_name}
                onChange={e => { setF('head_name', e.target.value); checkDuplicate('head_name', e.target.value) }}
                placeholder="محمد أحمد علي محمد"
                className={`w-full bg-surface2 border ${errors.head_name?'border-red':'border-border'} rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent`}
              />
              {errors.head_name && <p className="text-red text-[11px] mt-1">{errors.head_name}</p>}
              {!errors.head_name && nameErr && <p className="text-accent text-[11px] mt-1">{nameErr}</p>}
              {!errors.head_name && !nameErr && form.head_name.trim().split(/\s+/).length >= 4 && (
                <p className="text-green text-[11px] mt-1">✅ اسم رباعي صحيح</p>
              )}
            </div>

            {/* رقم الهوية */}
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">رقم الهوية *</label>
              <input
                value={form.head_id}
                onChange={e => { setF('head_id', e.target.value); checkDuplicate('head_id', e.target.value) }}
                type="tel" inputMode="numeric" placeholder="1xxxxxxxxx" maxLength={10} dir="ltr"
                className={`w-full bg-surface2 border ${errors.head_id?'border-red':idOk?'border-green':'border-border'} rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent`}
              />
              {errors.head_id && <p className="text-red text-[11px] mt-1">{errors.head_id}</p>}
              {!errors.head_id && idStatus && (
                <p className={`text-[11px] mt-1 ${idOk?'text-green':'text-accent'}`}>{idStatus}</p>
              )}
            </div>

            {/* الجوال */}
            <div className="grid grid-cols-2 gap-3">
              <FormField label="رقم الجوال" value={form.phone1}
                onChange={e => setF('phone1', e.target.value)}
                type="tel" placeholder="05xxxxxxxx" />
              <FormField label="رقم بديل" value={form.phone2}
                onChange={e => setF('phone2', e.target.value)}
                type="tel" placeholder="05xxxxxxxx" />
            </div>

            {/* الجنس والحالة الاجتماعية */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-muted block mb-1.5">الجنس</label>
                <select value={form.head_gender}
                  onChange={e => { setF('head_gender', e.target.value); setF('head_marital','') }}
                  className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                  <option value="">اختر</option>
                  <option value="ذكر">ذكر</option>
                  <option value="أنثى">أنثى</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-muted block mb-1.5">الحالة الاجتماعية</label>
                <select value={form.head_marital}
                  onChange={e => setF('head_marital', e.target.value)}
                  className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                  <option value="">اختر</option>
                  {(MARITAL_BY_GENDER[form.head_gender] || [...MARITAL_BY_GENDER['ذكر'], ...MARITAL_BY_GENDER['أنثى']]).map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* تاريخ الميلاد */}
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">تاريخ الميلاد</label>
              <DateInput
                value={form.head_dob || ''}
                onChange={v => setF('head_dob', v)}
              />
              {errors.head_dob && <p className="text-red text-[11px] mt-1">{errors.head_dob}</p>}
            </div>
          </div>
        </Card>

        {/* ══ بيانات السكن ══ */}
        <Card title="بيانات السكن" icon="🏕️">
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">المخيم *</label>
              <select value={form.camp_id} onChange={e => setF('camp_id', e.target.value)}
                className={`w-full bg-surface2 border ${errors.camp_id?'border-red':'border-border'} rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent`}>
                <option value="">— اختر المخيم —</option>
                {camps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.camp_id && <p className="text-red text-[11px] mt-1">{errors.camp_id}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="رقم الخيمة" value={form.tent}
                onChange={e => setF('tent', e.target.value)} placeholder="A-12" />
              <FormField label="خيمة ثانية" value={form.tent2}
                onChange={e => setF('tent2', e.target.value)} placeholder="اختياري" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">العنوان الأصلي</label>
              <select value={form.original_address} onChange={e => setF('original_address', e.target.value)}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                <option value="">اختر المنطقة</option>
                {['شمال غزة','غزة','الوسطى','جنوب غزة','رفح'].map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <FormField label="تفاصيل العنوان" value={form.address_details}
              onChange={e => setF('address_details', e.target.value)}
              placeholder="حي الشجاعية - شارع صلاح الدين" />
          </div>
        </Card>

        {/* ══ أفراد الأسرة ══ */}
        <Card title={`أفراد الأسرة (${members.length})`} icon="👨‍👩‍👧">
          <div className="flex flex-col gap-3">
            {members.length === 0 ? (
              <div className="text-muted text-xs text-center py-4 border border-dashed border-border rounded-xl">
                لا يوجد أفراد مضافون بعد
              </div>
            ) : (
              members.map((m, i) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  index={i}
                  onUpdate={updateMember}
                  onRemove={removeMember}
                  errors={errors}
                />
              ))
            )}
            <button type="button" onClick={addMember}
              className="w-full py-2.5 border border-dashed border-green rounded-xl text-green text-sm font-bold bg-green/5">
              ➕ إضافة فرد
            </button>
          </div>
        </Card>


        {/* ══ الفئات الاجتماعية ══ */}
        <Card title="الفئات الاجتماعية" icon="🏷️">
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-bold text-muted block mb-2">فئة الأسرة</label>
              <div className="flex flex-wrap gap-2">
                {FAMILY_CATEGORIES.map(cat => (
                  <button key={cat.key} type="button"
                    onClick={() => setF('categories', (form.categories||[]).includes(cat.key)
                      ? (form.categories||[]).filter(c=>c!==cat.key)
                      : [...(form.categories||[]), cat.key])}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all
                      ${(form.categories||[]).includes(cat.key)
                        ? 'bg-accent/20 text-accent border-accent'
                        : 'bg-surface2 border-border text-muted'}`}>
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">المستوى الاقتصادي</label>
              <select value={form.economic_level||''}
                onChange={e=>setF('economic_level',e.target.value)}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                <option value="">— غير محدد —</option>
                {ECONOMIC_LEVELS.map(l=><option key={l.key} value={l.key}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">عدد الأيتام في الأسرة</label>
              <input type="number" min="0" max="20" dir="ltr"
                value={form.num_orphans||0}
                onChange={e=>setF('num_orphans',parseInt(e.target.value)||0)}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent"/>
            </div>
          </div>
        </Card>

        {/* ══ ملاحظات ══ */}
        <Card title="ملاحظات" icon="📝">
          <textarea value={form.notes || ''} onChange={e => setF('notes', e.target.value)}
            rows={3} placeholder="أي ملاحظات..."
            className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent resize-none" />
        </Card>

        <div className="flex gap-3 pb-8">
          <button type="submit" disabled={saving}
            className="flex-1 bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
            {saving ? 'جاري الحفظ...' : isEdit ? '💾 حفظ التعديلات' : '✅ إضافة الأسرة'}
          </button>
          <button type="button" onClick={() => navigate(-1)}
            className="flex-1 bg-surface2 border border-border text-white font-bold py-3 rounded-xl text-sm">
            إلغاء
          </button>
        </div>
      </form>
    </div>
  )
}
