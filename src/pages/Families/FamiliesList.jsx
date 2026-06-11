import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, ORG_ID } from '../../lib/supabase'
import { localDB } from '../../lib/db'
import { enqueue } from '../../lib/sync'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { formatDate } from '../../lib/utils'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import Modal from '../../components/ui/Modal'

const REQUIRED_FIELDS = ['head_name','head_id','phone1','camp_id']

function isIncomplete(f) {
  return REQUIRED_FIELDS.some(k => !f[k]?.toString().trim())
}

function countMembers(members, family) {
  return members.filter(m => {
    if (m.family_id !== family.id) return false
    const rel   = (m.relation || '').trim()
    const mName = (m.name || '').trim().replace(/\s+/g,' ')
    const hName = (family.head_name || '').trim().replace(/\s+/g,' ')
    if (['رب الأسرة','رب أسرة','head'].includes(rel)) return false
    if (family.head_id && m.national_id && m.national_id.trim() === family.head_id.trim()) return false
    if (mName && hName && mName === hName) return false
    return true
  }).length
}

function calcAge(dob) {
  if (!dob) return null
  const b = new Date(dob), t = new Date()
  let age = t.getFullYear() - b.getFullYear()
  if (t.getMonth() < b.getMonth() || (t.getMonth()===b.getMonth() && t.getDate()<b.getDate())) age--
  return age
}

const SEL = "bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-accent"

export default function FamiliesList() {
  const [families,    setFamilies]    = useState([])
  const [campMap,     setCampMap]     = useState({})
  const [campsList,   setCampsList]   = useState([])
  const [memberCount, setMemberCount] = useState({})
  const [search,      setSearch]      = useState('')
  const [filterCamp,  setFilterCamp]  = useState('')
  const [filterMiss,  setFilterMiss]  = useState('')
  const [filterGender,setFilterGender]= useState('')
  const [ageMin,      setAgeMin]      = useState('')
  const [ageMax,      setAgeMax]      = useState('')
  const [loading,     setLoading]     = useState(true)
  const [syncing,     setSyncing]     = useState(false)
  const [selected,    setSelected]    = useState(null)
  const [members,     setMembers]     = useState([])

  const { canWrite, canDelete } = useAuth()
  const { showToast } = useApp()
  const navigate = useNavigate()

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    // Dexie فقط — فوري بدون شبكة
    try {
      const [lFams, lCamps, lMems] = await Promise.all([
        localDB.families.toArray().catch(() => []),
        localDB.camps.toArray().catch(() => []),
        localDB.family_members.toArray().catch(() => []),
      ])
      applyData(lFams, lCamps, lMems)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  // مزامنة يدوية — عند الضغط على زر التحديث
  async function syncFromServer() {
    if (!navigator.onLine) return showToast('لا يوجد اتصال', true)
    setSyncing(true)
    try {
      const [fRes, cRes] = await Promise.all([
        supabase.from('families').select('*').eq('org_id', ORG_ID)
          .order('updated_at', { ascending: false }).limit(1000),
        supabase.from('camps').select('*').eq('org_id', ORG_ID),
      ])
      const fams  = !fRes.error  && fRes.data  ? fRes.data  : []
      const camps = !cRes.error  && cRes.data  ? cRes.data  : []
      let mems = []
      if (fams.length) {
        const ids = fams.map(f => f.id)
        const chunks = []
        for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i,i+200))
        const res = await Promise.all(chunks.map(c =>
          supabase.from('family_members')
            .select('id,family_id,name,national_id,relation,dob,gender,health')
            .in('family_id', c)
        ))
        res.forEach(r => { if (!r.error && r.data) mems.push(...r.data) })
      }
      if (fams.length)  try { await localDB.families.bulkPut(fams) }       catch {}
      if (camps.length) try { await localDB.camps.bulkPut(camps) }          catch {}
      if (mems.length)  try { await localDB.family_members.bulkPut(mems) }  catch {}
      applyData(fams, camps, mems)
      showToast(`✅ تم التحديث — ${fams.length} أسرة`)
    } catch (err) { showToast('خطأ: ' + err.message, true) }
    finally { setSyncing(false) }
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

  const dupIds = useMemo(() => {
    const seen = {}; const dups = new Set()
    families.forEach(f => { if (!f.head_id) return; if (seen[f.head_id]) dups.add(f.head_id); else seen[f.head_id] = true })
    return dups
  }, [families])

  const dupPhones = useMemo(() => {
    const seen = {}; const dups = new Set()
    families.forEach(f => { if (!f.phone1) return; if (seen[f.phone1]) dups.add(f.phone1); else seen[f.phone1] = true })
    return dups
  }, [families])

  const filtered = useMemo(() => {
    return families.filter(f => {
      if (filterCamp   && f.camp_id !== filterCamp) return false
      if (filterGender && f.head_gender !== filterGender) return false
      if (filterMiss === 'incomplete' && !isIncomplete(f)) return false
      if (filterMiss === 'complete'   &&  isIncomplete(f)) return false
      if (filterMiss === 'dup_id'     && !dupIds.has(f.head_id))   return false
      if (filterMiss === 'dup_phone'  && !dupPhones.has(f.phone1)) return false
      if (ageMin || ageMax) {
        const age = calcAge(f.head_dob)
        if (age === null) return false
        if (ageMin && age < parseInt(ageMin)) return false
        if (ageMax && age > parseInt(ageMax)) return false
      }
      if (!search) return true
      const q = search.toLowerCase()
      return (f.head_name||'').toLowerCase().includes(q) ||
             (f.head_id  ||'').includes(q) ||
             (f.phone1   ||'').includes(q)
    }).sort((a,b) => new Date(b.updated_at||0) - new Date(a.updated_at||0))
  }, [families, filterCamp, filterGender, filterMiss, ageMin, ageMax, search, dupIds, dupPhones])

  function resetFilters() {
    setFilterCamp(''); setFilterMiss(''); setFilterGender('')
    setAgeMin(''); setAgeMax(''); setSearch('')
  }

  const hasFilter = filterCamp || filterMiss || filterGender || ageMin || ageMax || search

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
        action={
          <div className="flex gap-2">
            <button onClick={syncFromServer} disabled={syncing}
              className="bg-surface2 border border-border text-white font-bold px-3 py-2 rounded-xl text-sm disabled:opacity-50">
              {syncing ? '⏳' : '🔄'}
            </button>
            {canWrite && (
              <button onClick={() => navigate('/families/add')}
                className="bg-accent text-bg font-black px-4 py-2 rounded-xl text-sm">➕ إضافة</button>
            )}
          </div>
        }
      />

      {/* شريط البحث */}
      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="بحث باسم رب الأسرة أو رقم الهوية أو الجوال..."
        className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent mb-3"
      />

      {/* الفلاتر */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <select value={filterMiss} onChange={e => setFilterMiss(e.target.value)} className={SEL}>
          <option value="">كل الأسر</option>
          <option value="incomplete">⚠️ ناقص</option>
          <option value="complete">✅ مكتمل</option>
          <option value="dup_id">🔁 هوية مكررة</option>
          <option value="dup_phone">📞 جوال مكرر</option>
        </select>

        <select value={filterCamp} onChange={e => setFilterCamp(e.target.value)} className={SEL}>
          <option value="">كل المخيمات</option>
          {campsList.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select value={filterGender} onChange={e => setFilterGender(e.target.value)} className={SEL}>
          <option value="">كل الجنس</option>
          <option value="ذكر">👨 ذكر</option>
          <option value="أنثى">👩 أنثى</option>
        </select>

        {hasFilter && (
          <button onClick={resetFilters}
            className="bg-transparent border border-border text-muted rounded-xl px-3 py-2 text-xs font-bold">
            ↺ إعادة
          </button>
        )}
      </div>

      {/* فلتر العمر */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-muted text-xs">🎂 العمر من</span>
        <input type="number" value={ageMin} onChange={e => setAgeMin(e.target.value)}
          min="0" max="120" placeholder="—" dir="ltr"
          className="w-14 bg-surface2 border border-border rounded-xl px-2 py-1.5 text-white text-xs text-center focus:outline-none focus:border-accent"/>
        <span className="text-muted text-xs">إلى</span>
        <input type="number" value={ageMax} onChange={e => setAgeMax(e.target.value)}
          min="0" max="120" placeholder="—" dir="ltr"
          className="w-14 bg-surface2 border border-border rounded-xl px-2 py-1.5 text-white text-xs text-center focus:outline-none focus:border-accent"/>
        <span className="text-muted text-xs">سنة</span>
        {hasFilter && (
          <span className="text-muted text-xs mr-auto">{filtered.length} نتيجة</span>
        )}
      </div>

      {/* الجدول */}
      {loading ? (
        <div className="flex flex-col gap-1">
          {[...Array(8)].map((_,i) => (
            <div key={i} className="h-10 bg-surface border border-border rounded-xl animate-pulse"/>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="🔍" title="لا توجد نتائج"
          subtitle={hasFilter ? 'جرب تغيير الفلاتر' : 'ابدأ بإضافة أسرة'}
          action={hasFilter && (
            <button onClick={resetFilters}
              className="bg-surface2 border border-border text-white px-4 py-2 rounded-xl text-sm mt-2">
              ↺ مسح الفلاتر
            </button>
          )}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface2 text-muted text-xs">
                <th className="px-3 py-2.5 text-right font-bold">#</th>
                <th className="px-3 py-2.5 text-right font-bold">رب الأسرة</th>
                <th className="px-3 py-2.5 text-right font-bold">المخيم</th>
                <th className="px-3 py-2.5 text-center font-bold">الأفراد</th>
                <th className="px-3 py-2.5 text-right font-bold">الجوال</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f, i) => {
                const incomplete = isIncomplete(f)
                const isDupId    = dupIds.has(f.head_id)
                const isDupPhone = dupPhones.has(f.phone1)
                const hasWarn    = incomplete || isDupId || isDupPhone
                const mc         = (memberCount[f.id] || 0) + 1
                return (
                  <tr key={f.id} onClick={() => openFamily(f)}
                    className={`border-t border-border cursor-pointer active:bg-accent/10 transition-colors
                      ${hasWarn ? 'bg-red/5' : 'hover:bg-surface2'}`}>
                    <td className="px-3 py-2.5 text-muted text-xs">{i+1}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-white text-xs">{f.head_name||'—'}</div>
                      {f.head_id && <div className="text-muted text-[10px]" dir="ltr">{f.head_id}</div>}
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {incomplete && <span className="text-[9px] text-red font-bold">⚠️ ناقص</span>}
                        {isDupId    && <span className="text-[9px] text-accent font-bold">🔁 هوية مكررة</span>}
                        {isDupPhone && <span className="text-[9px] text-blue font-bold">📞 جوال مكرر</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-white text-xs">{campMap[f.camp_id]||'—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="bg-accent/15 text-accent text-[10px] font-bold px-1.5 py-0.5 rounded-full">{mc}</span>
                    </td>
                    <td className="px-3 py-2.5 text-white text-xs" dir="ltr">{f.phone1||'—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* مودال التفاصيل */}
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
                  ['الاسم',             selected.head_name],
                  ['رقم الهوية',        selected.head_id],
                  ['الجوال',            selected.phone1],
                  ['جوال 2',            selected.phone2],
                  ['الجنس',             selected.head_gender],
                  ['الحالة الاجتماعية', selected.head_marital],
                  ['المخيم',            campMap[selected.camp_id]],
                  ['الخيمة',            selected.tent],
                  ['المنطقة الأصلية',   selected.original_address],
                  ['العنوان التفصيلي',  selected.address_details],
                  ['تاريخ الميلاد',     selected.head_dob ? formatDate(selected.head_dob) : null],
                  ['العمر',             calcAge(selected.head_dob) ? `${calcAge(selected.head_dob)} سنة` : null],
                  ['تاريخ التسجيل',     formatDate(selected.created_at)],
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
    const rel   = (m.relation || '').trim()
    const mName = (m.name || '').trim().replace(/\s+/g,' ')
    const hName = (family.head_name || '').trim().replace(/\s+/g,' ')
    if (['رب الأسرة','رب أسرة','head'].includes(rel)) return false
    if (family.head_id && m.national_id && m.national_id.trim()===family.head_id.trim()) return false
    if (mName && hName && mName === hName) return false
    return true
  })
  if (!members.length) return <div className="text-muted text-xs text-center py-3">لا يوجد أفراد</div>
  return (
    <div>
      <div className="text-accent text-xs font-bold mb-2">👨‍👩‍👧‍👦 أفراد الأسرة ({filtered.length + 1} فرد)</div>
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
