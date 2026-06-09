import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { localDB } from '../../lib/db'
import { supabase, ORG_ID } from '../../lib/supabase'
import { enqueue } from '../../lib/sync'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'

const EMPTY = {
  head_name: '', head_id: '', phone1: '', phone2: '',
  camp_id: '', members_count: 1, status: 'active',
  head_gender: '', head_marital: '', notes: '',
  tent: '', original_address: '',
}

export default function FamilyForm() {
  const { id } = useParams()
  const isEdit = !!id
  const [form, setForm]     = useState(EMPTY)
  const [camps, setCamps]   = useState([])
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const { profile }         = useAuth()
  const { showToast, online } = useApp()
  const navigate = useNavigate()

  useEffect(() => {
    localDB.camps.toArray().catch(()=>[]).then(setCamps)
    if (isEdit) {
      localDB.families.get(id).catch(()=>null).then(f => { if (f) setForm({ ...EMPTY, ...f }) })
    }
  }, [id])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: null }))
  }

  function validate() {
    const errs = {}
    if (!form.head_name.trim())  errs.head_name = 'الاسم مطلوب'
    if (!form.head_id.trim())    errs.head_id   = 'رقم الهوية مطلوب'
    if (form.head_id.length < 9) errs.head_id   = 'رقم الهوية غير صالح'
    if (!form.camp_id)           errs.camp_id   = 'اختر المخيم'
    return errs
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const data = {
        ...form,
        id: isEdit ? id : crypto.randomUUID(),
        org_id: ORG_ID,
        created_by: profile?.user_id || profile?.id,
        updated_at: now,
        created_at: isEdit ? (form.created_at || now) : now,
        members_count: parseInt(form.members_count) || 1,  // عدد الأفراد (محلي فقط)
        version: (form.version || 0) + 1,
      }

      await localDB.families.put(data)
      await enqueue(isEdit ? 'update_family' : 'insert_family', data)

      if (online) {
        const { error } = await supabase.from('families').upsert(data)
        if (error) console.warn('Supabase upsert:', error.message)
      }

      showToast(isEdit ? '✅ تم تحديث الأسرة' : '✅ تمت إضافة الأسرة')
      navigate('/families')
    } catch (err) {
      showToast('خطأ: ' + err.message, true)
    } finally { setSaving(false) }
  }

  const F = ({ label, field, type='text', required, ...props }) => (
    <div>
      <label className="text-xs font-bold text-muted block mb-1.5">{label}{required ? ' *' : ''}</label>
      <input type={type} value={form[field]||''} onChange={e => set(field, e.target.value)}
        className={`w-full bg-surface2 border ${errors[field]?'border-red':'border-border'} rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent`}
        {...props} />
      {errors[field] && <p className="text-red text-[11px] mt-1">{errors[field]}</p>}
    </div>
  )

  return (
    <div>
      <PageHeader icon={isEdit ? '✏️' : '➕'} title={isEdit ? 'تعديل أسرة' : 'إضافة أسرة جديدة'} back />
      <form onSubmit={handleSubmit}>

        <Card title="بيانات رب الأسرة" icon="👤">
          <div className="flex flex-col gap-4">
            <F label="اسم رب الأسرة" field="head_name" placeholder="محمد أحمد علي" required />
            <F label="رقم الهوية" field="head_id" type="tel" inputMode="numeric" placeholder="1xxxxxxxxx" required />
            <F label="رقم الجوال" field="phone1" type="tel" inputMode="tel" placeholder="05xxxxxxxx" />
            <F label="رقم جوال 2" field="phone2" type="tel" inputMode="tel" placeholder="05xxxxxxxx (اختياري)" />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-muted block mb-1.5">الجنس</label>
                <select value={form.head_gender||''} onChange={e => set('head_gender', e.target.value)}
                  className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                  <option value="">— اختر —</option>
                  <option value="male">ذكر</option>
                  <option value="female">أنثى</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-muted block mb-1.5">الحالة الاجتماعية</label>
                <select value={form.head_marital||''} onChange={e => set('head_marital', e.target.value)}
                  className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                  <option value="">— اختر —</option>
                  <option value="married">متزوج</option>
                  <option value="single">أعزب</option>
                  <option value="widowed">أرمل</option>
                  <option value="divorced">مطلق</option>
                </select>
              </div>
            </div>
          </div>
        </Card>

        <Card title="بيانات الأسرة" icon="👨‍👩‍👧‍👦">
          <div className="flex flex-col gap-4">
            <F label="عدد أفراد الأسرة" field="members_count" type="number" min="1" max="50" />

            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">المخيم *</label>
              <select value={form.camp_id||''} onChange={e => set('camp_id', e.target.value)}
                className={`w-full bg-surface2 border ${errors.camp_id?'border-red':'border-border'} rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent`}>
                <option value="">— اختر المخيم —</option>
                {camps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.camp_id && <p className="text-red text-[11px] mt-1">{errors.camp_id}</p>}
            </div>

            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">الحالة</label>
              <select value={form.status||'active'} onChange={e => set('status', e.target.value)}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                <option value="active">✅ نشط</option>
                <option value="urgent">🔴 عاجل</option>
                <option value="inactive">⏸️ غير نشط</option>
                <option value="pending">⏳ معلق</option>
                <option value="departed">📤 مغادر</option>
              </select>
            </div>

            <F label="رقم الخيمة / الوحدة" field="tent" placeholder="مثال: B-12" />
            <F label="العنوان الأصلي" field="original_address" placeholder="المدينة / المنطقة" />
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">ملاحظات</label>
              <textarea value={form.notes||''} onChange={e => set('notes', e.target.value)} rows={3}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent resize-none" />
            </div>
          </div>
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
