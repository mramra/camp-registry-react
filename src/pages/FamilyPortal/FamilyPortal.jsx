import { useState } from 'react'
import { supabase, ORG_ID } from '../../lib/supabase'

const STATUS_LABELS = { active:'نشط ✅', ok:'نشط ✅', pending:'معلق ⏳', departed:'مغادر 📤', inactive:'مغادر 📤' }
const CAT_LABELS = { martyr:'🕊️ أسرة شهيد', captive:'⛓️ أسرة أسير', no_provider:'💔 فاقد معيل', destroyed:'🏗️ بيت مهدم', large:'👨‍👩‍👧‍👦 أسرة كبيرة' }
const ECON_LABELS = { extreme_poverty:'فقر مدقع', poor:'فقير', worker:'عامل/متوسط', employee:'موظف/متوسط', well_off:'ميسور' }

export default function FamilyPortal() {
  const [nationalId, setNationalId] = useState('')
  const [dob,        setDob]        = useState('')
  const [family,     setFamily]     = useState(null)
  const [members,    setMembers]    = useState([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')

  async function handleSearch(e) {
    e.preventDefault()
    if (!nationalId.trim()) return setError('أدخل رقم الهوية')
    setLoading(true); setError(''); setFamily(null); setMembers([])
    try {
      const { data, error: err } = await supabase
        .from('families')
        .select('*, camps(name)')
        .eq('org_id', ORG_ID)
        .eq('head_id', nationalId.trim())
        .single()

      if (err || !data) return setError('لم يتم العثور على أي سجل بهذا الرقم')

      // التحقق من تاريخ الميلاد إذا أُدخل
      if (dob && data.head_dob) {
        const entered = new Date(dob).toISOString().slice(0,10)
        const stored  = new Date(data.head_dob).toISOString().slice(0,10)
        if (entered !== stored) return setError('رقم الهوية وتاريخ الميلاد غير متطابقين')
      }

      setFamily(data)
      // جلب الأفراد
      const { data: mems } = await supabase.from('family_members').select('*').eq('family_id', data.id)
      setMembers(mems||[])
    } catch { setError('حدث خطأ في البحث') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3">🏕️</div>
          <h1 className="text-white font-black text-xl">بوابة الأسرة</h1>
          <p className="text-muted text-sm mt-1">استعلم عن بياناتك ومستجدات أسرتك</p>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleSearch} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">رقم هوية رب الأسرة *</label>
              <input type="tel" value={nationalId} onChange={e=>setNationalId(e.target.value)}
                inputMode="numeric" placeholder="1xxxxxxxxx" dir="ltr"
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent"/>
            </div>
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">تاريخ الميلاد (للتحقق — اختياري)</label>
              <input type="date" value={dob} onChange={e=>setDob(e.target.value)} dir="ltr"
                max={new Date().toISOString().slice(0,10)}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent"/>
            </div>

            {error && <p className="text-red text-xs bg-red/10 border border-red/20 rounded-lg px-3 py-2">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
              {loading ? 'جاري البحث...' : '🔍 استعلام'}
            </button>
          </form>

          {family && (
            <div className="mt-5 space-y-3">
              <div className="bg-green/10 border border-green/30 rounded-xl p-3 text-center">
                <span className="text-green font-bold text-sm">✅ تم العثور على السجل</span>
              </div>

              {/* البيانات الأساسية */}
              <div className="bg-surface2 border border-border rounded-xl p-4">
                <div className="text-accent text-xs font-bold mb-3">👤 بيانات الأسرة</div>
                <div className="flex flex-col gap-2">
                  {[
                    ['اسم رب الأسرة', family.head_name],
                    ['رقم الهوية',    family.head_id],
                    ['المخيم',        family.camps?.name||'—'],
                    ['الخيمة',        family.tent||'—'],
                    ['الحالة',        STATUS_LABELS[family.status]||family.status||'—'],
                  ].map(([k,v])=>(
                    <div key={k} className="flex justify-between border-b border-border/50 pb-1.5 last:border-0 last:pb-0">
                      <span className="text-muted text-xs">{k}</span>
                      <span className="text-white text-xs font-bold">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* الفئات الاجتماعية */}
              {(family.categories?.length>0 || family.economic_level) && (
                <div className="bg-surface2 border border-border rounded-xl p-4">
                  <div className="text-accent text-xs font-bold mb-2">🏷️ الفئات</div>
                  {family.categories?.map(c=>(
                    <span key={c} className="inline-block text-[10px] bg-accent/15 text-accent border border-accent/20 rounded-full px-2 py-0.5 mr-1 mb-1">
                      {CAT_LABELS[c]||c}
                    </span>
                  ))}
                  {family.economic_level && (
                    <div className="text-muted text-xs mt-1">
                      💰 {ECON_LABELS[family.economic_level]||family.economic_level}
                    </div>
                  )}
                </div>
              )}

              {/* أفراد الأسرة */}
              {members.length>0 && (
                <div className="bg-surface2 border border-border rounded-xl p-4">
                  <div className="text-accent text-xs font-bold mb-2">👨‍👩‍👧‍👦 أفراد الأسرة ({members.length})</div>
                  {members.slice(0,5).map(m=>(
                    <div key={m.id} className="flex justify-between py-1 border-b border-border/30 last:border-0">
                      <span className="text-white text-xs">{m.name}</span>
                      <span className="text-muted text-[10px]">{m.relation}</span>
                    </div>
                  ))}
                  {members.length>5 && <div className="text-muted text-[10px] mt-1">+{members.length-5} أخرى</div>}
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-muted text-xs text-center mt-4">للاستفسار تواصل مع إدارة المخيم</p>
      </div>
    </div>
  )
}
