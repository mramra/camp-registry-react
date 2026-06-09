
import { useState } from 'react'
import { supabase, ORG_ID } from '../../lib/supabase'

export default function FamilyPortal() {
  const [nationalId, setNationalId] = useState('')
  const [family, setFamily] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSearch(e) {
    e.preventDefault()
    if (!nationalId.trim()) return setError('أدخل رقم الهوية')
    setLoading(true); setError(''); setFamily(null)
    try {
      const { data, error: err } = await supabase
        .from('families')
        .select('family_name, national_id, status, camp_id, camps(name)')
        .eq('org_id', ORG_ID)
        .eq('national_id', nationalId.trim())
        .single()
      if (err || !data) return setError('لم يتم العثور على أي سجل بهذا الرقم')
      setFamily(data)
    } catch { setError('حدث خطأ في البحث') }
    finally { setLoading(false) }
  }

  const STATUS = { active:'نشط ✅', inactive:'غير نشط ⏸️', pending:'قيد المراجعة ⏳', departed:'مغادر 📤' }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3">🏕️</div>
          <h1 className="text-white font-black text-xl">بوابة الأسرة</h1>
          <p className="text-muted text-sm mt-1">استعلم عن حالة تسجيل أسرتك</p>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleSearch} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">رقم هوية رب الأسرة</label>
              <input type="tel" value={nationalId} onChange={e => setNationalId(e.target.value)}
                inputMode="numeric" placeholder="1xxxxxxxxx"
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-3 text-white text-sm placeholder-muted focus:outline-none focus:border-accent" />
            </div>
            {error && <p className="text-red text-xs bg-red/10 border border-red/20 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
              {loading ? 'جاري البحث...' : '🔍 استعلام'}
            </button>
          </form>

          {family && (
            <div className="mt-5 bg-surface2 border border-accent/30 rounded-xl p-4">
              <div className="text-accent font-black text-sm mb-3">✅ تم العثور على السجل</div>
              <div className="flex flex-col gap-2">
                {[['اسم الأسرة', family.family_name], ['رقم الهوية', family.national_id], ['المخيم', family.camps?.name||'—'], ['الحالة', STATUS[family.status]||family.status]].map(([k,v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-muted text-xs">{k}</span>
                    <span className="text-white text-xs font-bold">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-muted text-xs text-center mt-4">للاستفسار تواصل مع إدارة المخيم</p>
      </div>
    </div>
  )
}
