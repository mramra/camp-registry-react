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

const EMPTY_FORM = {
  head_name:'', head_id:'', phone1:'', phone2:'',
  head_gender:'', head_marital:'', head_dob:'',
  camp_id:'', tent:'', tent2:'',
  original_address:'', address_details:'', notes:'',
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
            <input value={member.dob || ''}
              onChange={e => onUpdate(member.id,'dob',e.target.value)}
              type="date" dir="ltr" max={new Date().toISOString().slice(0,10)}
              className="w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" />
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
      localDB.families.get(id).catch(()=>null).then(f => {
        if (f) setForm({ ...EMPTY_FORM, ...f })
      })
      localDB.family_members.where('family_id').equals(id).toArray()
        .catch(()=>[]).then(setMembers)
      if (navigator.onLine) {
        supabase.from('family_members').select('*').eq('family_id', id)
          .then(({ data }) => { if (data?.length) setMembers(data) })
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
      const now = new Date().toISOString()
      const familyId = isEdit ? id : crypto.randomUUID()
      const data = {
        ...form,
        id: familyId, org_id: ORG_ID,
        created_by: profile?.user_id || profile?.id,
        updated_at: now,
        created_at: isEdit ? (form.created_at || now) : now,
        version: (form.version || 0) + 1,
      }
      await localDB.families.put(data)
      await enqueue(isEdit ? 'update_family' : 'insert_family', data)

      const memberDocs = members.map(m => ({
        ...m,
        id: m.id || crypto.randomUUID(),
        family_id: familyId, org_id: ORG_ID,
        updated_at: now,
      }))
      await localDB.family_members.where('family_id').equals(familyId).delete()
      if (memberDocs.length) await localDB.family_members.bulkPut(memberDocs)

      if (navigator.onLine) {
        await supabase.from('families').upsert(data)
        if (memberDocs.length) {
          await supabase.from('family_members').delete().eq('family_id', familyId)
          await supabase.from('family_members').insert(memberDocs)
        }
      }
      showToast(isEdit ? '✅ تم تحديث الأسرة' : '✅ تمت إضافة الأسرة')
      navigate('/families')
    } catch (err) { showToast('خطأ: ' + err.message, true) }
    finally { setSaving(false) }
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
