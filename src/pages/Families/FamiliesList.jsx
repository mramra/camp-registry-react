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
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'
import Modal from '../../components/ui/Modal'

// حقول النواقص
const REQUIRED_FIELDS = ['head_name','head_id','phone1','camp_id']

function isIncomplete(family) {
  return REQUIRED_FIELDS.some(f => !family[f]?.toString().trim())
}

function countMembers(members, family) {
  return members.filter(m => {
    if (m.family_id !== family.id) return false
    const rel   = (m.relation   || '').trim()
    const mName = (m.name       || '').trim().replace(/\s+/g,' ')
    const hName = (family.head_name || '').trim().replace(/\s+/g,' ')
    if (['رب الأسرة','رب أسرة','head'].includes(rel)) return false
    if (family.head_id && m.national_id &&
        m.national_id.trim() === family.head_id.trim()) return false
    if (mName && hName && mName === hName) return false
    return true
  }).length
}

function calcAge(dob) {
  if (!dob) return null
  const b = new Date(dob)
  const t = new Date()
  let age = t.getFullYear() - b.getFullYear()
  if (t.getMonth() < b.getMonth() || (t.getMonth()===b.getMonth() && t.getDate()<b.getDate())) age--
  return age
}

export default function FamiliesList() {
  const [families,     setFamilies]     = useState([])
  const [campMap,      setCampMap]      = useState({})
  const [campsList,    setCampsList]    = useState([])
  const [memberCount,  setMemberCount]  = useState({})
  const [search,       setSearch]       = useState('')
  const [filterCamp,   setFilterCamp]   = useState('all')
  const [filterQuality,setFilterQuality]= useState('')
  const [loading,      setLoading]      = useState(true)
  const [syncing,      setSyncing]      = useState(false)
  const [selected,     setSelected]     = useState(null)
  const [members,      setMembers]      = useState([])

  const { canWrite, canDelete } = useAuth()
  const { showToast } = useApp()
  const navigate = useNavigate()

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      // Dexie أولاً — فوري
      const [lFams, lCamps, lMems] = await Promise.all([
        localDB.families.toArray().catch(() => []),
        localDB.camps.toArray().catch(() => []),
        localDB.family_members.toArray().catch(() => []),
      ])
      applyData(lFams, lCamps, lMems)
      setLoading(false)

      // ثم Supabase في الخلفية
      if (!navigator.onLine) return
      setSyncing(true)
      try {
        const [fRes, cRes] = await Promise.all([
          supabase.from('families').select('*').eq('org_id', ORG_ID)
            .order('updated_at', { ascending: false }).limit(1000),
          supabase.from('camps').select('*').eq('org_id', ORG_ID),
        ])
        const fams  = fRes.error  ? lFams  : (fRes.data  || [])
        const camps = cRes.error  ? lCamps : (cRes.data  || [])
        let mems = lMems
        if (fams.length && !fRes.error) {
          const ids = fams.map(f => f.id)
          const chunks = []
          for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i,i+200))
          const res = await Promise.all(chunks.map(c =>
            supabase.from('family_members')
              .select('id,family_id,name,national_id,relation,dob,gender,health')
              .in('family_id', c)
          ))
          const sm = []
          res.forEach(r => { if (!r.error && r.data) sm.push(...r.data) })
          if (sm.length) mems = sm
        }
        if (fams.length)  try { await localDB.families.bulkPut(fams) }       catch {}
        if (camps.length) try { await localDB.camps.bulkPut(camps) }          catch {}
        if (mems.length)  try { await localDB.family_members.bulkPut(mems) }  catch {}
        applyData(fams, camps, mems)
      } catch (err) { console.warn('[families]:', err.message) }
      finally { setSyncing(false) }
    } catch (err) { console.error(err); setLoading(false) }
  }

  function applyData(fams, camps, mems) {
    const cm = {}
    camps.forEach(c => { cm[c.id] = c.name })
    setCampMap(cm)
    setCampsList(camps)
    const mc = {}
    fams.forEach(f => { mc[f.id] = countMembers(mems, f) })
    setMemberCount(mc)
    setFamilies(fams)
  }

  async function openFamily(family) {
    setSelected(family)
    const local = await localDB.family_members.where('family_id').equals(family.id).toArray().catch(() => [])
    setMembers(local)
    if (navigator.onLine) {
      const { data } = await supabase.from('family_members').select('*').eq('family_id', family.id)
      if (data) { setMembers(data); try { await localDB.family_members.bulkPut(data) } catch {} }
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
      } else { await enqueue('delete_family', { id }) }
      setFamilies(f => f.filter(x => x.id !== id))
      setSelected(null)
      showToast('✅ تم الحذف')
    } catch (err) { showToast('خطأ: ' + err.message, true) }
  }

  // حساب التكرارات
  const dupIds = useMemo(() => {
    const seen = {}; const dups = new Set()
    families.forEach(f => {
      if (!f.head_id) return
      if (seen[f.head_id]) dups.add(f.head_id)
      else seen[f.head_id] = true
    })
    return dups
  }, [families])

  const dupPhones = useMemo(() => {
    const seen = {}; const dups = new Set()
    families.forEach(f => {
      if (!f.phone1) return
      if (seen[f.phone1]) dups.add(f.phone1)
      else seen[f.phone1] = true
    })
    return dups
  }, [families])

  // فلترة
  const filtered = useMemo(() => {
    return families
      .filter(f => {
        if (filterCamp !== 'all' && f.camp_id !== filterCamp) return false
        if (filterQuality === 'incomplete' && !isIncomplete(f)) return false
        if (filterQuality === 'complete'   && isIncomplete(f))  return false
        if (filterQuality === 'dup_id'     && !dupIds.has(f.head_id))   return false
        if (filterQuality === 'dup_phone'  && !dupPhones.has(f.phone1)) return false
        if (!search) return true
        const q = search.toLowerCase()
        return (f.head_name||'').toLowerCase().includes(q) ||
               (f.head_id  ||'').includes(q)               ||
               (f.phone1   ||'').includes(q)
      })
      .sort((a, b) => {
        const d = (memberCount[b.id]||0) - (memberCount[a.id]||0)
        return d !== 0 ? d : new Date(b.updated_at||0) - new Date(a.updated_at||0)
      })
  }, [families, filterCamp, filterQuality, search, memberCount, dupIds, dupPhones])

  const gc = useMemo(() => ({
    all:        families.length,
    incomplete: families.filter(f => isIncomplete(f)).length,
    dup_id:     families.filter(f => dupIds.has(f.head_id)).length,
    dup_phone:  families.filter(f => dupPhones.has(f.phone1)).length,
  }), [families, dupIds, dupPhones])

  const hasFilter = filterCamp !== 'all' || filterQuality !== ''

  function resetFilters() {
    setFilterCamp('all')
    setFilterQuality('')
    setSearch('')
  }

  const QUALITY_FILTERS = [
    { key: 'incomplete', icon: '⚠️', label: 'ناقص',         count: gc.incomplete, color: 'red'    },
    { key: 'dup_id',     icon: '🔁', label: 'هوية مكررة',   count: gc.dup_id,     color: 'accent' },
    { key: 'dup_phone',  icon: '📞', label: 'جوال مكرر',    count: gc.dup_phone,  color: 'blue'   },
  ]

  return (
    <div>
      <PageHeader icon="👨‍👩‍👧‍👦" title="قائمة الأسر"
        subtitle={
          <span className="flex items-center gap-2">
            <span>{filtered.length}/{families.length} أسرة</span>
            {syncing && <span className="text-[10px] text-accent animate-pulse">🔄</span>}
            {!navigator.onLine && <span className="text-[10px] text-red">📴</span>}
          </span>
        }
        action={canWrite && (
          <button onClick={() => navigate('/families/add')}
            className="bg-accent text-bg font-black px-4 py-2 rounded-xl text-sm">＋ إضافة</button>
        )}
      />

      {/* اختيار المخيم */}
      <select
        value={filterCamp}
        onChange={e => setFilterCamp(e.target.value)}
        className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent mb-3">
        <option value="all">🏕️ كل المخيمات ({families.length})</option>
        {campsList.map(c => (
          <option key={c.id} value={c.id}>
            {c.name} ({families.filter(f => f.camp_id === c.id).length})
          </option>
        ))}
      </select>

      {/* أيقونات الفلاتر */}
      <div className="flex gap-2 mb-3">
        {QUALITY_FILTERS.filter(f => f.count > 0).map(f => (
          <button key={f.key}
            onClick={() => setFilterQuality(q => q === f.key ? '' : f.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all
              ${filterQuality === f.key
                ? `bg-${f.color}/25 text-${f.color} border-${f.color}`
                : `bg-${f.color}/10 border-${f.color}/30 text-${f.color}`}`}>
            <span className="text-base">{f.icon}</span>
            <span>{f.count}</span>
          </button>
        ))}
        {hasFilter && (
          <button onClick={resetFilters}
            className="mr-auto px-3 py-2 rounded-xl text-xs font-bold border border-border text-muted bg-surface2">
            ↺ مسح
          </button>
        )}
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="بحث بالاسم أو الهوية أو الجوال..." />

      {hasFilter && (
        <div className="text-muted text-xs text-center mb-2">
          نتائج: <span className="text-white font-bold">{filtered.length}</span> من {families.length}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {[...Array(6)].map((_,i) => (
            <div key={i} className="bg-surface border border-border rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-surface2 rounded w-2/3 mb-2"/>
              <div className="h-3 bg-surface2 rounded w-1/3"/>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="👨‍👩‍👧‍👦"
          title={!navigator.onLine && families.length===0 ? 'لا توجد بيانات محلية' : 'لا توجد نتائج'}
          subtitle={!navigator.onLine && families.length===0
            ? 'افتح التطبيق مع الإنترنت لتخزين البيانات'
            : hasFilter ? 'جرب تغيير الفلاتر' : 'ابدأ بإضافة أسرة'}
          action={hasFilter && (
            <button onClick={resetFilters}
              className="bg-surface2 border border-border text-white px-4 py-2 rounded-xl text-sm mt-2">
              ↺ مسح الفلاتر
            </button>
          )}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(family => {
            const mc         = memberCount[family.id] || 0
            const cn         = campMap[family.camp_id]
            const incomplete = isIncomplete(family)
            const isDupId    = dupIds.has(family.head_id)
            const isDupPhone = dupPhones.has(family.phone1)
            return (
              <div key={family.id} onClick={() => openFamily(family)}
                className={`bg-surface border rounded-xl p-4 active:scale-98 transition-all cursor-pointer
                  ${incomplete||isDupId||isDupPhone ? 'border-red/30' : 'border-border hover:border-accent/40'}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm mb-1.5 truncate">
                      {family.head_name||'—'}
                    </div>
                    <div className="text-white text-xs font-medium" dir="ltr">🪪 {family.head_id||'—'}</div>
                    {cn && <div className="text-blue text-xs mt-1 font-bold">🏕️ {cn}</div>}
                    {family.phone1 && <div className="text-white text-xs mt-0.5 font-medium" dir="ltr">📞 {family.phone1}</div>}
                    {family.tent && <div className="text-muted text-[10px] mt-0.5">⛺ {family.tent}</div>}
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {incomplete && <span className="text-[9px] bg-red/15 text-red border border-red/20 px-1.5 py-0.5 rounded-full font-bold">⚠️ ناقص</span>}
                      {isDupId    && <span className="text-[9px] bg-accent/15 text-accent border border-accent/20 px-1.5 py-0.5 rounded-full font-bold">🔁 هوية مكررة</span>}
                      {isDupPhone && <span className="text-[9px] bg-blue/15 text-blue border border-blue/20 px-1.5 py-0.5 rounded-full font-bold">📞 جوال مكرر</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 mr-2 flex-shrink-0">
                    <span className="bg-accent/15 text-accent border border-accent/30 rounded-full px-2 py-0.5 text-[10px] font-bold">
                      👥 {mc+1} فرد
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={!!selected} onClose={() => { setSelected(null); setMembers([]) }} title="تفاصيل الأسرة" size="lg">
        {selected && (
          <div className="flex flex-col gap-4">
            {(isIncomplete(selected)||dupIds.has(selected.head_id)||dupPhones.has(selected.phone1)) && (
              <div className="bg-red/10 border border-red/30 rounded-xl p-3 flex flex-col gap-1">
                {isIncomplete(selected) && <span className="text-red text-xs">⚠️ بيانات ناقصة: {REQUIRED_FIELDS.filter(f=>!selected[f]?.toString().trim()).join(', ')}</span>}
                {dupIds.has(selected.head_id)   && <span className="text-accent text-xs">🔁 رقم الهوية مكرر في أسرة أخرى</span>}
                {dupPhones.has(selected.phone1) && <span className="text-blue text-xs">📞 رقم الجوال مكرر في أسرة أخرى</span>}
              </div>
            )}

            <div className="bg-surface2 rounded-xl p-4 border border-accent/20">
              <div className="text-accent text-xs font-bold mb-3">👤 رب الأسرة</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['الاسم',selected.head_name], ['رقم الهوية',selected.head_id],
                  ['الجوال',selected.phone1], ['جوال 2',selected.phone2],
                  ['الجنس',selected.head_gender], ['الحالة الاجتماعية',selected.head_marital],
                  ['المخيم',campMap[selected.camp_id]], ['الخيمة',selected.tent],
                  ['المنطقة الأصلية',selected.original_address],
                  ['العنوان التفصيلي',selected.address_details],
                  ['تاريخ الميلاد',selected.head_dob ? formatDate(selected.head_dob) : null],
                  ['العمر', calcAge(selected.head_dob) ? `${calcAge(selected.head_dob)} سنة` : null],
                  ['تاريخ التسجيل',formatDate(selected.created_at)],
                ].filter(([,v])=>v).map(([k,v]) => (
                  <div key={k} className="bg-surface rounded-xl p-2.5">
                    <div className="text-muted text-[9px] mb-0.5">{k}</div>
                    <div className="text-white font-bold text-xs">{v}</div>
                  </div>
                ))}
              </div>
            </div>

            <FamilyMembersView members={members} family={selected} />

            {selected.notes && (
              <div className="bg-surface2 rounded-xl p-3">
                <div className="text-muted text-[10px] mb-1">📝 ملاحظات</div>
                <div className="text-white text-xs">{selected.notes}</div>
              </div>
            )}

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

function FamilyMembersView({ members, family }) {
  const HEALTH_ICONS = { مريض:'🤒', معاق:'♿', مزمن:'💊', مصاب:'🩹' }
  const filtered = members.filter(m => {
    if (m.family_id !== family.id) return false
    const rel   = (m.relation   || '').trim()
    const mName = (m.name       || '').trim().replace(/\s+/g,' ')
    const hName = (family.head_name || '').trim().replace(/\s+/g,' ')
    if (['رب الأسرة','رب أسرة','head'].includes(rel)) return false
    if (family.head_id && m.national_id && m.national_id.trim()===family.head_id.trim()) return false
    if (mName && hName && mName === hName) return false
    return true
  })
  if (!members.length) return <div className="text-muted text-xs text-center py-3">لا يوجد أفراد</div>
  return (
    <div>
      <div className="text-accent text-xs font-bold mb-2">👨‍👩‍👧‍👦 أفراد الأسرة ({filtered.length} + رب الأسرة)</div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-accent/10 border border-accent/20">
          <div>
            <div className="text-white text-xs font-bold">{family.head_name}</div>
            <div className="text-muted text-[10px]">رب الأسرة · {family.head_id}</div>
          </div>
          <span>👑</span>
        </div>
        {filtered.map(m => (
          <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface2">
            <div>
              <div className="text-white text-xs font-bold">{m.name}</div>
              <div className="text-muted text-[10px]">
                {m.relation}{m.national_id?` · ${m.national_id}`:''}{m.dob?` · ${formatDate(m.dob)}`:''}
              </div>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span>{m.gender==='ذكر'||m.gender==='male'?'👦':m.gender==='أنثى'||m.gender==='female'?'👧':'👤'}</span>
              {m.health && m.health!=='سليم' && (
                <span className="text-[10px] text-red">{HEALTH_ICONS[m.health]||'⚠️'} {m.health}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
