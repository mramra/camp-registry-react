import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { localDB } from '../../lib/db'
import { supabase, ORG_ID } from '../../lib/supabase'
import { enqueue } from '../../lib/sync'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'

// ══ ثوابت ══
const RELATION_BY_GENDER = {
  'ذكر':  ['زوج','ابن','أب','أخ','جد','حفيد','عم','خال','أخرى'],
  'أنثى': ['زوجة','ابنة','أم','أخت','جدة','حفيدة','عمة','خالة','أخرى'],
}
const ALL_RELATIONS = [...new Set([
  ...RELATION_BY_GENDER['ذكر'],
  ...RELATION_BY_GENDER['أنثى'],
])]

const HEALTH_OPTIONS = [
  { v:'سليم',  label:'✅ سليم'        },
  { v:'مريض',  label:'🤒 مريض'        },
  { v:'معاق',  label:'♿ معاق'         },
  { v:'مزمن',  label:'💊 مرض مزمن'   },
  { v:'مصاب',  label:'🩹 إصابة حرب'   },
]
const MARITAL_BY_GENDER = {
  'ذكر':  ['متزوج','أعزب','مطلق','أرمل'],
  'أنثى': ['متزوجة','عزباء','مطلقة','أرملة'],
}
const TAGS = [
  { id:'food',     label:'🍞 غذاء'      },
  { id:'medicine', label:'💊 دواء'       },
  { id:'clothes',  label:'👕 ملابس'      },
  { id:'shelter',  label:'⛺ مأوى'        },
  { id:'special',  label:'⚠️ احتياج خاص'},
]

const EMPTY_FORM = {
  head_name:'', head_id:'', phone1:'', phone2:'',
  head_gender:'', head_marital:'',
  camp_id:'', tent:'', tent2:'',
  original_address:'', address_details:'',
  notes:'', tags:[],
}
const EMPTY_MEMBER = () => ({
  id: crypto.randomUUID(),
  name:'', gender:'', relation:'',
  national_id:'', dob:'', health:'سليم',
})

export default function FamilyForm() {
  const { id } = useParams()
  const isEdit = !!id
  const [form,    setForm]    = useState(EMPTY_FORM)
  const [members, setMembers] = useState([])
  const [camps,   setCamps]   = useState([])
  const [errors,  setErrors]  = useState({})
  const [saving,  setSaving]  = useState(false)
  const { profile }           = useAuth()
  const { showToast }         = useApp()
  const navigate = useNavigate()

  useEffect(() => {
    localDB.camps.toArray().catch(()=>[]).then(setCamps)
    if (isEdit) {
      localDB.families.get(id).catch(()=>null).then(f => {
        if (f) setForm({ ...EMPTY_FORM, ...f, tags: f.tags || [] })
      })
      localDB.family_members.where('family_id').equals(id).toArray()
        .catch(()=>[]).then(setMembers)
      if (navigator.onLine) {
        supabase.from('family_members').select('*').eq('family_id', id)
          .then(({ data }) => { if (data?.length) setMembers(data) })
      }
    }
  }, [id])

  function setF(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: null }))
  }

  function toggleTag(tagId) {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(tagId)
        ? f.tags.filter(t => t !== tagId)
        : [...f.tags, tagId],
    }))
  }

  // ══ أفراد الأسرة ══
  function addMember() {
    setMembers(m => [...m, EMPTY_MEMBER()])
  }

  function removeMember(memberId) {
    setMembers(m => m.filter(x => x.id !== memberId))
  }

  function updateMember(memberId, field, value) {
    setMembers(m => m.map(x => {
      if (x.id !== memberId) return x
      const updated = { ...x, [field]: value }
      // عند تغيير الجنس: أعد ضبط العلاقة
      if (field === 'gender') updated.relation = ''
      return updated
    }))
  }

  function validate() {
    const errs = {}
    if (!form.head_name.trim()) errs.head_name = 'الاسم مطلوب'
    if (!form.head_id.trim())   errs.head_id   = 'رقم الهوية مطلوب'
    if (form.head_id.trim().length < 9) errs.head_id = 'رقم هوية غير صالح (9 أرقام على الأقل)'
    if (!form.camp_id)          errs.camp_id   = 'اختر المخيم'
    // تحقق من أفراد
    members.forEach((m, i) => {
      if (!m.name.trim()) errs[`m_name_${i}`] = 'الاسم مطلوب'
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
        id: familyId,
        org_id: ORG_ID,
        created_by: profile?.user_id || profile?.id,
        updated_at: now,
        created_at: isEdit ? (form.created_at || now) : now,
        tags: form.tags || [],
        version: (form.version || 0) + 1,
      }

      // حفظ الأسرة محلياً
      await localDB.families.put(data)
      await enqueue(isEdit ? 'update_family' : 'insert_family', data)

      // حفظ الأفراد محلياً
      const memberDocs = members.map(m => ({
        ...m,
        id: m.id || crypto.randomUUID(),
        family_id: familyId,
        org_id: ORG_ID,
        updated_at: now,
      }))
      // احذف القديم ثم أضف الجديد
      await localDB.family_members.where('family_id').equals(familyId).delete()
      if (memberDocs.length) await localDB.family_members.bulkPut(memberDocs)

      // السيرفر في الخلفية
      if (navigator.onLine) {
        const [fRes] = await Promise.all([
          supabase.from('families').upsert(data),
        ])
        if (!fRes.error && memberDocs.length) {
          await supabase.from('family_members').delete().eq('family_id', familyId)
          await supabase.from('family_members').insert(memberDocs)
        }
      }

      showToast(isEdit ? '✅ تم تحديث الأسرة' : '✅ تمت إضافة الأسرة')
      navigate('/families')
    } catch (err) {
      showToast('خطأ: ' + err.message, true)
    } finally {
      setSaving(false)
    }
  }

  const F = ({ label, field, required, error, children, ...rest }) => (
    <div>
      <label className="text-xs font-bold text-muted block mb-1.5">
        {label}{required ? ' *' : ''}
      </label>
      {children || (
        <input
          className={`w-full bg-surface2 border ${(error || errors[field]) ? 'border-red' : 'border-border'} rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent`}
          value={form[field] || ''}
          onChange={e => setF(field, e.target.value)}
          {...rest}
        />
      )}
      {(error || errors[field]) && (
        <p className="text-red text-[11px] mt-1">{error || errors[field]}</p>
      )}
    </div>
  )

  return (
    <div>
      <PageHeader icon={isEdit ? '✏️' : '➕'}
        title={isEdit ? 'تعديل أسرة' : 'إضافة أسرة جديدة'} back />

      <form onSubmit={handleSubmit}>

        {/* ══ بيانات رب الأسرة ══ */}
        <Card title="بيانات رب الأسرة" icon="👤">
          <div className="flex flex-col gap-3">
            <F label="اسم رب الأسرة" field="head_name" required
               placeholder="محمد أحمد علي" />
            <F label="رقم الهوية" field="head_id" required
               type="tel" inputMode="numeric" placeholder="1xxxxxxxxx" />
            <div className="grid grid-cols-2 gap-3">
              <F label="رقم الجوال" field="phone1" type="tel" placeholder="05xxxxxxxx" />
              <F label="رقم بديل"   field="phone2" type="tel" placeholder="05xxxxxxxx" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* الجنس */}
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
              {/* الحالة الاجتماعية */}
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
          </div>
        </Card>

        {/* ══ بيانات السكن ══ */}
        <Card title="بيانات السكن" icon="🏕️">
          <div className="flex flex-col gap-3">
            {/* المخيم */}
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">المخيم *</label>
              <select value={form.camp_id} onChange={e => setF('camp_id', e.target.value)}
                className={`w-full bg-surface2 border ${errors.camp_id ? 'border-red' : 'border-border'} rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent`}>
                <option value="">— اختر المخيم —</option>
                {camps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.camp_id && <p className="text-red text-[11px] mt-1">{errors.camp_id}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <F label="رقم الخيمة" field="tent"  placeholder="A-12" />
              <F label="خيمة ثانية" field="tent2" placeholder="اختياري" />
            </div>

            {/* العنوان الأصلي */}
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">العنوان الأصلي</label>
              <select value={form.original_address}
                onChange={e => setF('original_address', e.target.value)}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                <option value="">اختر المنطقة</option>
                {['شمال غزة','غزة','الوسطى','جنوب غزة','رفح'].map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <F label="تفاصيل العنوان" field="address_details"
               placeholder="مثال: حي الشجاعية - شارع صلاح الدين" />
          </div>
        </Card>

        {/* ══ الاحتياجات ══ */}
        <Card title="الاحتياجات" icon="🏷️">
          <div className="flex flex-wrap gap-2">
            {TAGS.map(tag => (
              <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all
                  ${form.tags.includes(tag.id)
                    ? 'bg-accent/20 text-accent border-accent'
                    : 'bg-surface2 border-border text-muted'}`}>
                {tag.label}
              </button>
            ))}
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
              className="w-full py-2.5 border border-dashed border-green rounded-xl text-green text-sm font-bold bg-green/5 active:scale-98 transition-all">
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

        {/* ══ أزرار ══ */}
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

// ══ مكوّن صف الفرد ══
function MemberRow({ member, index, onUpdate, onRemove, errors }) {
  const relations = member.gender
    ? RELATION_BY_GENDER[member.gender] || ALL_RELATIONS
    : ALL_RELATIONS

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
          <input value={member.name} onChange={e => onUpdate(member.id,'name',e.target.value)}
            placeholder="الاسم الرباعي"
            className={`w-full bg-surface2 border ${errors[`m_name_${index}`] ? 'border-red':'border-border'} rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent`} />
          {errors[`m_name_${index}`] && <p className="text-red text-[10px] mt-0.5">{errors[`m_name_${index}`]}</p>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* الجنس */}
          <div>
            <label className="text-[10px] font-bold text-muted block mb-1">الجنس</label>
            <select value={member.gender} onChange={e => onUpdate(member.id,'gender',e.target.value)}
              className="w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent">
              <option value="">اختر</option>
              <option value="ذكر">ذكر</option>
              <option value="أنثى">أنثى</option>
            </select>
          </div>
          {/* صلة القرابة */}
          <div>
            <label className="text-[10px] font-bold text-muted block mb-1">صلة القرابة</label>
            <select value={member.relation} onChange={e => onUpdate(member.id,'relation',e.target.value)}
              className="w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent">
              <option value="">اختر</option>
              {relations.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* رقم الهوية */}
          <div>
            <label className="text-[10px] font-bold text-muted block mb-1">رقم الهوية</label>
            <input value={member.national_id} onChange={e => onUpdate(member.id,'national_id',e.target.value)}
              type="tel" inputMode="numeric" placeholder="9 أرقام" maxLength={9} dir="ltr"
              className="w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" />
          </div>
          {/* تاريخ الميلاد */}
          <div>
            <label className="text-[10px] font-bold text-muted block mb-1">تاريخ الميلاد</label>
            <input value={member.dob || ''} onChange={e => onUpdate(member.id,'dob',e.target.value)}
              type="date" dir="ltr"
              className="w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" />
          </div>
        </div>

        {/* الحالة الصحية */}
        <div>
          <label className="text-[10px] font-bold text-muted block mb-1">الحالة الصحية</label>
          <select value={member.health || 'سليم'} onChange={e => onUpdate(member.id,'health',e.target.value)}
            className="w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent">
            {HEALTH_OPTIONS.map(h => <option key={h.v} value={h.v}>{h.label}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}
