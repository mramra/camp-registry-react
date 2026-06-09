import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { v4 as uuid } from 'https://esm.sh/uuid'
import { localDB } from '../../lib/db'
import { supabase, ORG_ID } from '../../lib/supabase'
import { enqueue } from '../../lib/sync'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'

const EMPTY = {
  family_name: '', national_id: '', phone: '', camp_id: '',
  members_count: 1, status: 'active', address: '', notes: '',
}

export default function FamilyForm() {
  const { id } = useParams()
  const isEdit  = !!id
  const [form, setForm]   = useState(EMPTY)
  const [camps, setCamps] = useState([])
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const { profile }         = useAuth()
  const { showToast, online } = useApp()
  const navigate = useNavigate()

  useEffect(() => {
    localDB.camps.toArray().then(setCamps)
    if (isEdit) {
      localDB.families.get(id).then(f => { if (f) setForm(f) })
    }
  }, [id])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: null }))
  }

  function validate() {
    const errs = {}
    if (!form.family_name.trim()) errs.family_name = 'الاسم مطلوب'
    if (!form.national_id.trim()) errs.national_id = 'رقم الهوية مطلوب'
    if (form.national_id.length !== 10) errs.national_id = 'رقم الهوية 10 أرقام'
    if (!form.camp_id) errs.camp_id = 'اختر المخيم'
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
        created_by: profile?.user_id,
        updated_at: now,
        created_at: isEdit ? form.created_at : now,
        members_count: parseInt(form.members_count) || 1,
      }

      // حفظ محلي أولاً
      await localDB.families.put(data)
      // إضافة لطابور المزامنة
      await enqueue(isEdit ? 'update_family' : 'insert_family', data)
      // إذا متصل، مزامنة فورية
      if (online) {
        const { error } = await supabase.from('families').upsert(data)
        if (!error) await localDB.sync_queue.where('action').anyOf(['insert_family','update_family']).delete()
      }

      showToast(isEdit ? 'تم تحديث الأسرة ✅' : 'تمت إضافة الأسرة ✅')
      navigate('/families')
    } catch (err) {
      showToast('حدث خطأ: ' + err.message, true)
    } finally {
      setSaving(false)
    }
  }

  const Field = ({ label, field, type='text', ...props }) => (
    <div>
      <label className="text-xs font-bold text-muted block mb-1.5">{label}</label>
      <input type={type} value={form[field] || ''} onChange={e => set(field, e.target.value)}
        className={`w-full bg-surface2 border ${errors[field] ? 'border-red' : 'border-border'} rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent`}
        {...props} />
      {errors[field] && <p className="text-red text-[11px] mt-1">{errors[field]}</p>}
    </div>
  )

  return (
    <div>
      <PageHeader icon={isEdit ? '✏️' : '➕'} title={isEdit ? 'تعديل أسرة' : 'إضافة أسرة جديدة'} back />

      <form onSubmit={handleSubmit}>
        <Card title="المعلومات الأساسية" icon="👨‍👩‍👧‍👦">
          <div className="flex flex-col gap-4">
            <Field label="اسم الأسرة *" field="family_name" placeholder="عائلة محمد أحمد" />
            <Field label="رقم هوية رب الأسرة *" field="national_id" type="tel" inputMode="numeric" maxLength={10} />
            <Field label="رقم الجوال" field="phone" type="tel" inputMode="tel" />
            <Field label="عدد الأفراد" field="members_count" type="number" min="1" max="50" />

            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">المخيم *</label>
              <select value={form.camp_id} onChange={e => set('camp_id', e.target.value)}
                className={`w-full bg-surface2 border ${errors.camp_id ? 'border-red' : 'border-border'} rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent`}>
                <option value="">-- اختر المخيم --</option>
                {camps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.camp_id && <p className="text-red text-[11px] mt-1">{errors.camp_id}</p>}
            </div>

            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">الحالة</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                <option value="active">نشط</option>
                <option value="inactive">غير نشط</option>
                <option value="pending">معلق</option>
                <option value="departed">مغادر</option>
              </select>
            </div>
          </div>
        </Card>

        <Card title="معلومات إضافية" icon="📝">
          <div className="flex flex-col gap-4">
            <Field label="العنوان" field="address" placeholder="حي / منطقة" />
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">ملاحظات</label>
              <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={3}
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
