import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, ORG_ID } from '../../lib/supabase'
import { localDB } from '../../lib/db'
import { enqueue } from '../../lib/sync'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { formatDate } from '../../lib/utils'
import PageHeader from '../../components/ui/PageHeader'
import SearchBar from '../../components/ui/SearchBar'
import Badge from '../../components/ui/Badge'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'
import Modal from '../../components/ui/Modal'

const STATUS_MAP = {
  active:   { label: 'نشط',    color: 'green',  dot: '🟢' },
  inactive: { label: 'غير نشط', color: 'muted',  dot: '⚪' },
  pending:  { label: 'معلق',   color: 'accent', dot: '🟡' },
  departed: { label: 'مغادر',  color: 'red',    dot: '🔴' },
  urgent:   { label: 'عاجل',   color: 'red',    dot: '🔴' },
  ok:       { label: 'مستقر',  color: 'green',  dot: '🟢' },
  need:     { label: 'يحتاج',  color: 'accent', dot: '🟡' },
}

export default function FamiliesList() {
  const [families,    setFamilies]    = useState([])
  const [campMap,     setCampMap]     = useState({})
  const [memberCount, setMemberCount] = useState({}) // عدد الأفراد per family
  const [search,      setSearch]      = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCamp,   setFilterCamp]   = useState('all')
  const [loading,     setLoading]     = useState(true)
  const [syncing,     setSyncing]     = useState(false)
  const [fromCache,   setFromCache]   = useState(false)
  const [selected,    setSelected]    = useState(null)
  const [members,     setMembers]     = useState([]) // أفراد الأسرة المفتوحة

  const { canWrite, canDelete, profile } = useAuth()
  const { showToast }   = useApp()
  const navigate = useNavigate()

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)

    // ① محلي فوراً
    const [localFams, localCamps, localMembers] = await Promise.all([
      localDB.families.toArray().catch(() => []),
      localDB.camps.toArray().catch(() => []),
      localDB.family_members.toArray().catch(() => []),
    ])

    if (localFams.length) {
      applyData(localFams, localCamps, localMembers)
      setFromCache(true)
      setLoading(false)
    }

    // ② سيرفر في الخلفية
    if (navigator.onLine) {
      setSyncing(true)
      try {
        const [fRes, cRes, mRes] = await Promise.all([
          supabase.from('families').select('*').eq('org_id', ORG_ID).order('updated_at', { ascending: false }).limit(1000),
          supabase.from('camps').select('*').eq('org_id', ORG_ID),
          supabase.from('family_members').select('id, family_id, name, national_id, relation, dob, gender').eq('org_id', ORG_ID),
        ])
        const fams    = fRes.data  || []
        const camps   = cRes.data  || []
        const members = mRes.data  || []

        // تخزين محلي
        if (fams.length)    try { await localDB.families.bulkPut(fams) }          catch {}
        if (camps.length)   try { await localDB.camps.bulkPut(camps) }            catch {}
        if (members.length) try { await localDB.family_members.bulkPut(members) } catch {}

        applyData(fams, camps, members)
        setFromCache(false)

        if (fRes.error) showToast('تحذير: ' + fRes.error.message, true)
      } catch (err) {
        console.warn('server fetch:', err.message)
        if (!families.length) showToast('خطأ في التحميل: ' + err.message, true)
      } finally {
        setSyncing(false)
        setLoading(false)
      }
    } else {
      setLoading(false)
    }
  }

  function applyData(fams, camps, members) {
    // خريطة المخيمات
    const cm = {}
    camps.forEach(c => { cm[c.id] = c.name })
    setCampMap(cm)

    // عدد الأفراد لكل أسرة (بدون رب الأسرة)
    const mc = {}
    members.forEach(m => {
      const fam = fams.find(f => f.id === m.family_id)
      if (!fam) return
      const rel = (m.relation || '').trim()
      // استثناء رب الأسرة
      if (['رب الأسرة','رب أسرة','head'].includes(rel)) return
      if (fam.head_id && m.national_id && m.national_id.trim() === fam.head_id.trim()) return
      const mName = (m.name || '').trim().replace(/\s+/g,' ')
      const hName = (fam.head_name || '').trim().replace(/\s+/g,' ')
      if (mName && hName && mName === hName) return
      mc[m.family_id] = (mc[m.family_id] || 0) + 1
    })
    setMemberCount(mc)
    setFamilies(fams)
  }

  // فتح تفاصيل أسرة وجلب أفرادها
  async function openFamily(family) {
    setSelected(family)
    // جلب الأفراد
    const local = await localDB.family_members.where('family_id').equals(family.id).toArray().catch(() => [])
    setMembers(local)
    if (navigator.onLine) {
      const { data } = await supabase.from('family_members').select('*').eq('family_id', family.id)
      if (data) {
        setMembers(data)
        try { await localDB.family_members.bulkPut(data) } catch {}
      }
    }
  }

  async function deleteFamily(id) {
    if (!window.confirm('حذف هذه الأسرة؟')) return
    try {
      await localDB.families.delete(id)
      await localDB.family_members.where('family_id').equals(id).delete()
      if (navigator.onLine) {
        await supabase.from('family_members').delete().eq('family_id', id)
        await supabase.from('families').delete().eq('id', id)
      } else {
        await enqueue('delete_family', { id })
      }
      setFamilies(f => f.filter(x => x.id !== id))
      setSelected(null)
      showToast('✅ تم الحذف')
    } catch (err) { showToast('خطأ: ' + err.message, true) }
  }

  // فلترة وبحث
  const allCampIds = [...new Set(families.map(f => f.camp_id).filter(Boolean))]
  const statusCounts = families.reduce((acc, f) => { acc[f.status] = (acc[f.status]||0)+1; return acc }, {})

  const filtered = useMemo(() => {
    return families.filter(f => {
      if (filterStatus !== 'all' && f.status !== filterStatus) return false
      if (filterCamp !== 'all' && f.camp_id !== filterCamp) return false
      if (!search) return true
      const q = search.toLowerCase()
      return (f.head_name||'').toLowerCase().includes(q) ||
             (f.head_id||'').includes(q) ||
             (f.phone1||'').includes(q)
    }).sort((a,b) => (memberCount[b.id]||0) - (memberCount[a.id]||0))
  }, [families, filterStatus, filterCamp, search, memberCount])

  const RELATION_LABELS = {
    'زوجة':'زوجة', 'زوج':'زوج', 'ابن':'ابن', 'ابنة':'ابنة',
    'أب':'أب', 'أم':'أم', 'أخ':'أخ', 'أخت':'أخت',
  }

  return (
    <div>
      <PageHeader icon="👨‍👩‍👧‍👦" title="قائمة الأسر"
        subtitle={
          <span className="flex items-center gap-2">
            <span>{families.length} أسرة</span>
            {fromCache && !syncing && <span className="text-[10px] text-muted">📱 محلي</span>}
            {syncing && <span className="text-[10px] text-accent animate-pulse">🔄 تحديث...</span>}
          </span>
        }
        action={canWrite && (
          <button onClick={() => navigate('/families/add')}
            className="bg-accent text-bg font-black px-4 py-2 rounded-xl text-sm">＋ إضافة</button>
        )}
      />

      {/* إحصائيات سريعة */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          ['الكل',    families.length,                'accent'],
          ['نشط',    statusCounts.active||statusCounts.ok||0,  'green'],
          ['عاجل',   statusCounts.urgent||statusCounts.need||0,'red'],
          ['مغادر',  statusCounts.departed||0,        'muted'],
        ].map(([l,v,c]) => (
          <div key={l} className="bg-surface border border-border rounded-xl p-2 text-center">
            <div className={`text-lg font-black text-${c}`}>{v}</div>
            <div className="text-muted text-[9px] mt-0.5">{l}</div>
          </div>
        ))}
      </div>

      {/* فلاتر الحالة */}
      <div className="flex gap-2 mb-2 overflow-x-auto pb-1 scrollbar-hide">
        {[
          { key:'all', label:'الكل' },
          { key:'active', label:'نشط' },
          { key:'ok', label:'مستقر' },
          { key:'urgent', label:'عاجل' },
          { key:'need', label:'يحتاج' },
          { key:'inactive', label:'غير نشط' },
          { key:'departed', label:'مغادر' },
        ].map(f => (
          <button key={f.key} onClick={() => setFilterStatus(f.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all
              ${filterStatus === f.key ? 'bg-accent text-bg border-accent' : 'bg-surface2 border-border text-muted'}`}>
            {f.label}{f.key !== 'all' && statusCounts[f.key] ? ` (${statusCounts[f.key]})` : ''}
          </button>
        ))}
      </div>

      {/* فلتر المخيم */}
      {Object.keys(campMap).length > 0 && (
        <div className="mb-3">
          <select value={filterCamp} onChange={e => setFilterCamp(e.target.value)}
            className="w-full bg-surface2 border border-border rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-accent">
            <option value="all">🏕️ كل المخيمات ({families.length})</option>
            {allCampIds.map(cid => (
              <option key={cid} value={cid}>
                {campMap[cid] || '—'} ({families.filter(f=>f.camp_id===cid).length})
              </option>
            ))}
          </select>
        </div>
      )}

      <SearchBar value={search} onChange={setSearch} placeholder="بحث بالاسم أو الهوية أو الجوال..." />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="👨‍👩‍👧‍👦" title="لا توجد أسر"
          subtitle={search ? 'لا نتائج للبحث' : 'ابدأ بإضافة أسرة'}
          action={canWrite && !search && (
            <button onClick={() => navigate('/families/add')}
              className="bg-accent text-bg font-black px-5 py-2.5 rounded-xl text-sm mt-2">إضافة أسرة</button>
          )}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(family => {
            const sm = STATUS_MAP[family.status] || STATUS_MAP.active
            const mc = memberCount[family.id] || 0
            const totalMembers = mc + 1 // +1 رب الأسرة
            const cn = campMap[family.camp_id]

            return (
              <div key={family.id} onClick={() => openFamily(family)}
                className="bg-surface border border-border rounded-xl p-4 active:scale-98 transition-all cursor-pointer hover:border-accent/40">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {/* الاسم */}
                    <div className="font-bold text-white text-sm mb-1 truncate">
                      {sm.dot} {family.head_name || '—'}
                    </div>
                    {/* الهوية */}
                    <div className="text-muted text-xs" dir="ltr">{family.head_id}</div>
                    {/* المخيم */}
                    {cn && (
                      <div className="text-blue text-xs mt-0.5 font-bold">🏕️ {cn}</div>
                    )}
                    {/* الجوال */}
                    {family.phone1 && (
                      <div className="text-muted text-xs mt-0.5" dir="ltr">📞 {family.phone1}</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 mr-2 flex-shrink-0">
                    <Badge color={sm.color}>{sm.label}</Badge>
                    {/* عدد الأفراد */}
                    <span className="bg-accent/15 text-accent border border-accent/30 rounded-full px-2 py-0.5 text-[10px] font-bold">
                      👥 {totalMembers} فرد
                    </span>
                  </div>
                </div>
                {/* الخيمة إن وجدت */}
                {family.tent && (
                  <div className="text-muted text-[10px] mt-1.5">⛺ خيمة: {family.tent}</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ نافذة تفاصيل الأسرة + الأفراد ═══ */}
      <Modal open={!!selected} onClose={() => { setSelected(null); setMembers([]) }} title="تفاصيل الأسرة" size="lg">
        {selected && (
          <div className="flex flex-col gap-4">
            {/* بيانات رب الأسرة */}
            <div className="bg-surface2 rounded-xl p-4 border border-accent/20">
              <div className="text-accent text-xs font-bold mb-3">👤 رب الأسرة</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['الاسم',            selected.head_name],
                  ['رقم الهوية',       selected.head_id],
                  ['الجوال',           selected.phone1],
                  ['جوال 2',           selected.phone2],
                  ['الجنس',            selected.head_gender==='male'?'ذكر':selected.head_gender==='female'?'أنثى':null],
                  ['الحالة الاجتماعية',selected.head_marital],
                  ['المخيم',           campMap[selected.camp_id]],
                  ['الخيمة',          selected.tent],
                  ['العنوان الأصلي',   selected.original_address],
                  ['الحالة',           STATUS_MAP[selected.status]?.label],
                  ['تاريخ التسجيل',    formatDate(selected.created_at)],
                ].filter(([,v]) => v).map(([k,v]) => (
                  <div key={k} className="bg-surface rounded-xl p-2.5">
                    <div className="text-muted text-[9px] mb-0.5">{k}</div>
                    <div className="text-white font-bold text-xs">{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* أفراد الأسرة */}
            <div>
              <div className="text-accent text-xs font-bold mb-2">
                👨‍👩‍👧‍👦 أفراد الأسرة ({members.filter(m => {
                  const rel = (m.relation||'').trim()
                  if (['رب الأسرة','رب أسرة','head'].includes(rel)) return false
                  if (selected.head_id && m.national_id && m.national_id.trim() === selected.head_id.trim()) return false
                  const mn = (m.name||'').trim().replace(/\s+/g,' ')
                  const hn = (selected.head_name||'').trim().replace(/\s+/g,' ')
                  if (mn && hn && mn === hn) return false
                  return true
                }).length} فرد + رب الأسرة)
              </div>
              {members.length === 0 ? (
                <div className="text-muted text-xs text-center py-4">لا يوجد أفراد مسجلون</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {members.map(m => {
                    const rel = (m.relation||'').trim()
                    const isHead = ['رب الأسرة','رب أسرة','head'].includes(rel) ||
                      (selected.head_id && m.national_id && m.national_id.trim() === selected.head_id.trim())
                    const mn = (m.name||'').trim().replace(/\s+/g,' ')
                    const hn = (selected.head_name||'').trim().replace(/\s+/g,' ')
                    const isHeadByName = mn && hn && mn === hn
                    return (
                      <div key={m.id} className={`flex items-center justify-between px-3 py-2 rounded-xl ${isHead||isHeadByName ? 'bg-accent/10 border border-accent/20' : 'bg-surface2'}`}>
                        <div>
                          <div className="text-white text-xs font-bold">{m.name}</div>
                          <div className="text-muted text-[10px]">{m.relation}{m.national_id ? ` · ${m.national_id}` : ''}</div>
                        </div>
                        <div className="text-muted text-[10px]">
                          {m.gender === 'male' ? '👦' : m.gender === 'female' ? '👧' : ''}
                          {m.dob ? ` ${formatDate(m.dob)}` : ''}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* الملاحظات */}
            {selected.notes && (
              <div className="bg-surface2 rounded-xl p-3">
                <div className="text-muted text-[10px] mb-1">📝 ملاحظات</div>
                <div className="text-white text-xs">{selected.notes}</div>
              </div>
            )}

            {/* أزرار الإجراءات */}
            <div className="flex gap-2 pt-1">
              <button onClick={() => { navigate(`/families/edit/${selected.id}`); setSelected(null) }}
                className="flex-1 bg-accent text-bg font-black py-2.5 rounded-xl text-sm">✏️ تعديل</button>
              {canDelete && (
                <button onClick={() => deleteFamily(selected.id)}
                  className="flex-1 bg-red/15 border border-red/40 text-red font-bold py-2.5 rounded-xl text-sm">🗑️ حذف</button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
