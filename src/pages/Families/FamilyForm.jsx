import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { localDB } from '../../lib/db'
import { supabase, ORG_ID } from '../../lib/supabase'
import { enqueue } from '../../lib/sync'
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

        <div className="grid grid-cols-2 gap-2">
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
          <div>
            <label className="text-[10px] font-bold text-muted block mb-1">تاريخ الميلاد</label>
            <DateInput
              value={member.dob || ''}
              onChange={v => onUpdate(member.id,'dob',v)}
            />
            {dobErr && <p className="text-red text-[10px] mt-0.5">{dobErr}</p>}
          </div>
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
function DateInput({ value, onChange, maxYear, minYear }) {
  const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
  const parts  = value ? value.split('-') : ['','','']
  const yr = parts[0] || '', mo = parts[1] || '', dy = parts[2] || ''

  const curYear  = new Date().getFullYear()
  const maxYr    = maxYear || curYear
  const minYr    = minYear || 1900
  const daysInMonth = mo && yr ? new Date(parseInt(yr), parseInt(mo), 0).getDate() : 31

  function update(newYr, newMo, newDy) {
    if (!newYr && !newMo && !newDy) { onChange(''); return }
    const y = newYr.padStart(4,'0').slice(-4)
    const m = newMo.padStart(2,'0')
    const d = newDy.padStart(2,'0')
    if (newYr && newMo && newDy) onChange(`${y}-${m}-${d}`)
    else if (newYr && newMo) onChange(`${y}-${m}-`)
    else onChange('')
  }

  const INP = "bg-surface2 border border-border rounded-xl text-white text-sm focus:outline-none focus:border-accent text-center"

  return (
    <div className="flex gap-1.5 items-center" dir="rtl">
      {/* يوم */}
      <select value={dy} onChange={e=>update(yr,mo,e.target.value)}
        className={`${INP} flex-1 py-2 px-1`}>
        <option value="">يوم</option>
        {Array.from({length:daysInMonth},(_,i)=>i+1).map(d=>(
          <option key={d} value={String(d).padStart(2,'0')}>{d}</option>
        ))}
      </select>
      {/* شهر */}
      <select value={mo} onChange={e=>update(yr,e.target.value,dy)}
        className={`${INP} flex-[1.5] py-2 px-1`}>
        <option value="">شهر</option>
        {MONTHS.map((m,i)=>(
          <option key={i} value={String(i+1).padStart(2,'0')}>{m}</option>
        ))}
      </select>
      {/* سنة */}
      <select value={yr} onChange={e=>update(e.target.value,mo,dy)}
        className={`${INP} flex-[1.5] py-2 px-1`}>
        <option value="">سنة</option>
        {Array.from({length:maxYr-minYr+1},(_,i)=>maxYr-i).map(y=>(
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
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
  const { profile } = useAuth()
  const { showToast } = useApp()
  const navigate = useNavigate()

  useEffect(() => {
    localDB.camps.toArray().catch(()=>[]).then(setCamps)

    if (isEdit) {
      // ① جلب من localDB فوراً
      localDB.families.get(id).catch(()=>null).then(f => {
        if (f) setForm({ ...EMPTY_FORM, ...f,
          categories:    f.categories    || [],
          economic_level:f.economic_level || '',
          num_orphans:   f.num_orphans   || 0,
        })
      })
      localDB.family_members.where('family_id').equals(id)
        .toArray().catch(()=>[]).then(d => setMembers(sortMembers(d)))

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
              localDB.families.put(data).catch(()=>{})
            }
          })
        supabase.from('family_members').select('*').eq('family_id', id)
          .then(({ data }) => {
            if (data?.length) {
              setMembers(sortMembers(data))
              localDB.family_members.bulkPut(data).catch(()=>{})
            }
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
    const all = await localDB.families.toArray().catch(() => [])
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
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
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
        'created_at','updated_at','created_by',
      ]
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
        created_by:     profile?.user_id || profile?.id || null,
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
      await localDB.families.put(familyData)
      // upsert كل فرد بـ id — لا نحذف الأفراد القديمة إلا من removedIds
      const currentMemberIds = new Set(memberDocs.map(m => m.id))
      const existingMems = await localDB.family_members.where('family_id').equals(familyId).toArray().catch(()=>[])
      const removedIds   = existingMems.filter(m => !currentMemberIds.has(m.id)).map(m => m.id)
      // احذف المحذوفين فقط
      if (removedIds.length) await localDB.family_members.bulkDelete(removedIds)
      // أضف/حدّث الموجودين
      if (memberDocs.length) {
        const withOrgId = memberDocs.map(m => ({ ...m, org_id: ORG_ID }))
        await localDB.family_members.bulkPut(withOrgId)
      }

      // إضافة لطابور المزامنة
      await enqueue(isEdit ? 'update_family' : 'insert_family', familyData)

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
          await localDB.families.put({ ...familyData, ...savedFamily })
        } else if (fErr) {
          console.warn('[save family]', fErr.message)
          showToast('⚠️ حُفظ محلياً — سيُزامَن لاحقاً')
        }

        // رفع الأفراد — upsert كل فرد + حذف المحذوفين فقط
        try {
          // حذف الأفراد المحذوفة من الفورم
          if (removedIds.length) {
            await supabase.from('family_members').delete().in('id', removedIds)
          }
          // upsert الأفراد الحالية
          if (memberDocs.length) {
            const { data: savedMembers, error: mErr } = await supabase
              .from('family_members').upsert(memberDocs).select()
            if (!mErr && savedMembers?.length) {
              const withOrgId = savedMembers.map(m => ({ ...m, org_id: ORG_ID }))
              await localDB.family_members.bulkPut(withOrgId)
            } else if (mErr) {
              console.warn('[save members]', mErr.message)
              showToast('⚠️ الأسرة حُفظت — الأفراد سيُزامَنون لاحقاً')
            }
          }
        } catch(mEx) {
          console.warn('[members upload]', mEx.message)
        }
      }

      showToast(isEdit ? '✅ تم تحديث الأسرة' : '✅ تمت إضافة الأسرة')
      navigate('/families')
    } catch (err) {
      console.error('[handleSubmit]', err)
      showToast('خطأ: ' + err.message, true)
    } finally {
      setSaving(false)
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
              <input
                value={form.head_dob || ''}
                onChange={e => setF('head_dob', e.target.value)}
                type="date" dir="ltr" max={new Date().toISOString().slice(0,10)}
                className={`w-full bg-surface2 border ${errors.head_dob?'border-red':'border-border'} rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent`}
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
