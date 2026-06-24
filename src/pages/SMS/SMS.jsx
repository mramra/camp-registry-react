/**
 * SMS.jsx — إرسال رسائل SMS (منقولة من النسخة القديمة page-sms)
 * قائمة مستلمين بالاسم مع checkbox لكل أسرة (محدَّدة تلقائياً لو فيها رقم جوال)،
 * فلتر بالمخيم + بحث بالاسم/الجوال، تحديد الكل/إلغاء الكل/تحديد الناقصين،
 * استبدال {اسم} تلقائياً باسم رب الأسرة، وفتح تطبيق الرسائل (sms:) بالأرقام المحددة.
 */
import { useState, useEffect, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { useLocalDB, visibleFamilies } from '../../lib/db'
import { useDataScope } from '../../lib/useDataScope'
import { checkFamilyIssues, isIncomplete } from '../../lib/helpers'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'

// توقيع الرسالة حسب مخيم الأسرة
function getSig(campId, campMap) {
  const name = campMap[campId]
  return name ? `إدارة مخيم ${name}` : 'إدارة المخيم'
}

// اسم مختصر للرسالة (٣ كلمات كحد أقصى)
function shortName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 3) return parts.join(' ')
  return [parts[0], parts[1], parts[parts.length - 1]].join(' ')
}

export default function SMS() {
  const [families, setFamilies] = useState([])
  const [members,  setMembers]  = useState([])
  const [camps,    setCamps]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [filterCamp, setFilterCamp] = useState('')
  const [search,     setSearch]     = useState('')
  const [selected,    setSelected]   = useState(new Set())
  const [message,    setMessage]    = useState('')

  const { showToast } = useApp()
  const { isOwner, isSuperAdmin } = useAuth()
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope()
  const { query } = useLocalDB()

  useEffect(() => {
    setLoading(true)
    Promise.all([query('families'), query('camps'), query('family_members')])
      .then(([fams, c, m]) => {
        const vis = visibleFamilies(fams, isOwner)
        const campIds = getAllowedCampIds(c)
        const scoped = filterLocal(vis, campIds)
        setFamilies(scoped)
        setCamps(getVisibleCamps(c))
        setMembers(m)
        // تحديد افتراضي: كل من معه رقم جوال
        setSelected(new Set(scoped.filter(f => f.phone1).map(f => f.id)))
      })
      .finally(() => setLoading(false))
  }, [])

  const campMap = useMemo(() => {
    const map = {}
    camps.forEach(c => { map[c.id] = c.name })
    return map
  }, [camps])

  const memsByFam = useMemo(() => {
    const map = {}
    members.forEach(m => {
      if (!map[m.family_id]) map[m.family_id] = []
      map[m.family_id].push(m)
    })
    return map
  }, [members])

  const filtered = useMemo(() => {
    let list = families
    if (filterCamp) list = list.filter(f => f.camp_id === filterCamp)
    const q = search.trim().toLowerCase()
    if (q) list = list.filter(f =>
      (f.head_name || '').toLowerCase().includes(q) || (f.phone1 || '').includes(q)
    )
    return [...list].sort((a, b) => (a.head_name || '').localeCompare(b.head_name || '', 'ar'))
  }, [families, filterCamp, search])

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function selectAll()   { setSelected(new Set(filtered.filter(f => f.phone1).map(f => f.id))) }
  function deselectAll() { setSelected(new Set()) }
  function selectIncomplete() {
    setSelected(new Set(filtered.filter(f => f.phone1 && isIncomplete(f, memsByFam[f.id])).map(f => f.id)))
  }

  const selectedFamilies = useMemo(
    () => families.filter(f => selected.has(f.id) && f.phone1),
    [families, selected]
  )

  function sendSMS() {
    const sel  = selectedFamilies
    const text = message.trim()
    if (!sel.length) return showToast('⚠️ لم تختر أي مستلم', true)
    if (!text)       return showToast('⚠️ يرجى كتابة نص الرسالة', true)

    if (sel.length === 1) {
      const f   = sel[0]
      const msg = text.replace(/\{اسم\}/g, shortName(f.head_name)) + '\n' + getSig(f.camp_id, campMap)
      window.location.href = 'sms:' + f.phone1 + '?body=' + encodeURIComponent(msg)
      showToast('📨 جارٍ فتح تطبيق الرسائل...')
      return
    }

    const sig  = getSig(sel[0].camp_id, campMap)
    const tmpl = text.replace(/\{اسم\}/g, 'المستفيد') + '\n' + sig
    const nums = sel.map(f => f.phone1).filter(Boolean).join(';')
    if (!nums) return showToast('⚠️ لا توجد أرقام صحيحة', true)
    window.location.href = 'sms:' + nums + '?body=' + encodeURIComponent(tmpl)
    showToast(`📨 إرسال لـ ${sel.length} مستلم...`)
  }

  function copyNums() {
    const nums = selectedFamilies.map(f => f.phone1).filter(Boolean).join('\n')
    if (!nums) return showToast('⚠️ لم تختر أي مستلم', true)
    navigator.clipboard.writeText(nums).then(() => showToast(`📋 تم نسخ ${selectedFamilies.length} رقم`))
  }

  // ملاحظة: لا حاجة لفحص دور صلب هنا — ProtectedRoute بمستوى المسار (pageKey="sms")
  // هو المخوَّل الوحيد للوصول، ويحترم استثناءات الصلاحيات الفردية لكل مستخدم. فحص
  // صلب هنا كان يتناقض مع ذلك ويحجب أي مساعد/مندوب مُنح صلاحية صريحة لهذه الصفحة.

  return (
    <div className="space-y-4">
      <PageHeader icon="💬" title="إرسال رسائل SMS" subtitle={`${selected.size} محدَّد`} />

      {/* الفلاتر والبحث */}
      <Card title="المستلمون" icon="🎯">
        <div className="flex flex-col gap-2 mb-3">
          <select value={filterCamp} onChange={e => setFilterCamp(e.target.value)}
            className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-sm font-bold outline-none">
            <option value="">⛺ كل المخيمات</option>
            {camps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الجوال..."
            className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent" />
        </div>

        <div className="flex gap-2 flex-wrap mb-3">
          <button onClick={selectAll} className="bg-surface2 border border-border text-white text-xs font-bold px-3 py-1.5 rounded-lg">تحديد الكل</button>
          <button onClick={deselectAll} className="bg-surface2 border border-border text-white text-xs font-bold px-3 py-1.5 rounded-lg">إلغاء الكل</button>
          <button onClick={selectIncomplete} className="bg-red/10 border border-red text-red-400 text-xs font-bold px-3 py-1.5 rounded-lg">⚠️ الناقصين</button>
        </div>

        {/* قائمة الأسماء */}
        <div className="max-h-72 overflow-y-auto border border-border rounded-xl">
          {loading ? (
            <div className="py-8 text-center text-muted text-xs">جارٍ التحميل...</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-muted text-xs">لا توجد أسر</div>
          ) : filtered.map(f => {
            const hasPhone = !!f.phone1
            const issues   = checkFamilyIssues(f, memsByFam[f.id])
            return (
              <label key={f.id}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border last:border-b-0 ${hasPhone ? 'cursor-pointer' : 'opacity-50'}`}>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <input type="checkbox" disabled={!hasPhone}
                    checked={selected.has(f.id)} onChange={() => toggle(f.id)}
                    className="w-4 h-4 accent-accent flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="text-white text-sm font-bold truncate">{f.head_name}</span>
                    <span className="text-muted text-[10px] mr-1.5">— {campMap[f.camp_id] || '—'}</span>
                    {issues.length > 0 && (
                      <span className="text-[10px] text-red-400 font-bold mr-1.5">⚠️ {issues.length} ناقص</span>
                    )}
                    {!hasPhone && <span className="text-[10px] text-red-400 font-bold mr-1.5">📵 لا جوال</span>}
                  </div>
                </div>
                <span dir="ltr" className="text-accent text-[11px] flex-shrink-0">{f.phone1 || '—'}</span>
              </label>
            )
          })}
        </div>
      </Card>

      {/* نص الرسالة */}
      <Card title="نص الرسالة" icon="✍️">
        <p className="text-[11px] text-muted mb-2">
          💡 <code className="bg-surface2 px-1.5 py-0.5 rounded">{'{اسم}'}</code> يُستبدل باسم رب الأسرة تلقائياً
        </p>
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4}
          placeholder="مثال: السيد/ة {اسم}، يرجى مراجعتنا لاستكمال بياناتكم."
          className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent resize-none mb-2" />
        <div className="flex justify-between text-xs text-muted mb-3">
          <span>{message.length} حرف</span>
          <span>{Math.ceil(message.length / 160) || 0} رسالة</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={sendSMS} disabled={!selected.size}
            className="flex-1 bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
            📨 إرسال لـ {selectedFamilies.length} مستلم
          </button>
          <button onClick={copyNums}
            className="bg-surface2 border border-border text-white font-bold px-4 py-3 rounded-xl text-sm">
            📋 نسخ الأرقام
          </button>
        </div>
        <p className="text-[10px] text-muted mt-2 leading-relaxed">
          📱 يفتح تطبيق الرسائل بالأرقام المحددة — اضغط إرسال وسيُرسل للكل.
        </p>
      </Card>
    </div>
  )
}
