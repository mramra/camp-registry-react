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
  active:   { label:'نشط',   color:'green',  dot:'🟢' },
  pending:  { label:'معلق',  color:'accent', dot:'🟡' },
  departed: { label:'مغادر', color:'red',    dot:'🔴' },
  ok:       { label:'نشط',   color:'green',  dot:'🟢' },
  need:     { label:'نشط',   color:'green',  dot:'🟢' },
  urgent:   { label:'نشط',   color:'green',  dot:'🟢' },
  inactive: { label:'مغادر', color:'red',    dot:'🔴' },
}
const STATUS_GROUPS = {
  active:   ['active','ok','need','urgent'],
  pending:  ['pending'],
  departed: ['departed','inactive'],
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

export default function FamiliesList() {
  const [families,     setFamilies]     = useState([])
  const [campMap,      setCampMap]      = useState({})
  const [memberCount,  setMemberCount]  = useState({})
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCamp,   setFilterCamp]   = useState('all')
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
      // ① محلي فوراً
      const [lFams, lCamps, lMems] = await Promise.all([
        localDB.families.toArray().catch(() => []),
        localDB.camps.toArray().catch(() => []),
        localDB.family_members.toArray().catch(() => []),
      ])
      applyData(lFams, lCamps, lMems)
      setLoading(false)

      // ② سيرفر في الخلفية
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
        if (fams.length)  try { await localDB.families.bulkPut(fams) }        catch {}
        if (camps.length) try { await localDB.camps.bulkPut(camps) }          catch {}
        if (mems.length)  try { await localDB.family_members.bulkPut(mems) }  catch {}
        applyData(fams, camps, mems)
      } catch (err) { console.warn('[families]:', err.message) }
      finally { setSyncing(false) }
    } catch (err) { console.error('[families]:', err); setLoading(false) }
  }

  function applyData(fams, camps, mems) {
    const cm = {}
    camps.forEach(c => { cm[c.id] = c.name })
    setCampMap(cm)
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

  const allCampIds = useMemo(() => [...new Set(families.map(f=>f.camp_id).filter(Boolean))], [families])

  const filtered = useMemo(() => families
    .filter(f => {
      if (filterStatus !== 'all' && !STATUS_GROUPS[filterStatus]?.includes(f.status)) return false
      if (filterCamp   !== 'all' && f.camp_id !== filterCamp) return false
      if (!search) return true
      const q = search.toLowerCase()
      return (f.head_name||'').toLowerCase().includes(q) || (f.head_id||'').includes(q) || (f.phone1||'').includes(q)
    })
    .sort((a,b) => {
      const d = (memberCount[b.id]||0) - (memberCount[a.id]||0)
      return d !== 0 ? d : new Date(b.updated_at||0) - new Date(a.updated_at||0)
    }), [families, filterStatus, filterCamp, search, memberCount])

  const gc = useMemo(() => ({
    all:      families.length,
    active:   families.filter(f => STATUS_GROUPS.active.includes(f.status)).length,
    pending:  families.filter(f => STATUS_GROUPS.pending.includes(f.status)).length,
    departed: families.filter(f => STATUS_GROUPS.departed.includes(f.status)).length,
  }), [families])

  return (
    <div>
      <PageHeader icon="👨‍👩‍👧‍👦" title="قائمة الأسر"
        subtitle={<span className="flex items-center gap-2">
          <span>{families.length} أسرة</span>
          {syncing && <span className="text-[10px] text-accent animate-pulse">🔄 تحديث...</span>}
          {!navigator.onLine && <span className="text-[10px] text-red">📴 أوف لاين</span>}
        </span>}
        action={canWrite && (
          <button onClick={() => navigate('/families/add')}
            className="bg-accent text-bg font-black px-4 py-2 rounded-xl text-sm">＋ إضافة</button>
        )}
      />

      <div className="grid grid-cols-3 gap-2 mb-4">
        {[['الكل',gc.all,'accent'],['نشط',gc.active,'green'],['مغادر',gc.departed,'red']].map(([l,v,c]) => (
          <div key={l} className="bg-surface border border-border rounded-xl p-2 text-center">
            <div className={`text-lg font-black text-${c}`}>{v}</div>
            <div className="text-muted text-[9px] mt-0.5">{l}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-2">
        {[{key:'all',label:'الكل',count:gc.all},{key:'active',label:'🟢 نشط',count:gc.active},
          {key:'pending',label:'🟡 معلق',count:gc.pending},{key:'departed',label:'🔴 مغادر',count:gc.departed}].map(f => (
          <button key={f.key} onClick={() => setFilterStatus(f.key)}
            className={`flex-1 px-2 py-2 rounded-xl text-[11px] font-bold border transition-all
              ${filterStatus===f.key?'bg-accent text-bg border-accent':'bg-surface2 border-border text-muted'}`}>
            {f.label}<br/><span className="text-[10px]">{f.count}</span>
          </button>
        ))}
      </div>

      {allCampIds.length > 0 && (
        <div className="mb-3">
          <select value={filterCamp} onChange={e => setFilterCamp(e.target.value)}
            className="w-full bg-surface2 border border-border rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-accent">
            <option value="all">🏕️ كل المخيمات ({families.length})</option>
            {allCampIds.map(cid => (
              <option key={cid} value={cid}>{campMap[cid]||'—'} ({families.filter(f=>f.camp_id===cid).length})</option>
            ))}
          </select>
        </div>
      )}

      <SearchBar value={search} onChange={setSearch} placeholder="بحث بالاسم أو الهوية أو الجوال..." />

      {!navigator.onLine && families.length > 0 && (
        <div className="bg-surface2 border border-border rounded-xl px-3 py-2 mb-3 text-center text-xs text-muted">
          📱 بيانات محلية — ستُحدَّث عند الاتصال
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="👨‍👩‍👧‍👦"
          title={!navigator.onLine && families.length===0 ? 'لا توجد بيانات محلية' : 'لا توجد أسر'}
          subtitle={!navigator.onLine && families.length===0
            ? 'افتح التطبيق مرة واحدة مع الإنترنت لتخزين البيانات'
            : search ? 'لا نتائج للبحث' : 'ابدأ بإضافة أسرة'}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(family => {
            const sm = STATUS_MAP[family.status] || STATUS_MAP.active
            const mc = memberCount[family.id] || 0
            const cn = campMap[family.camp_id]
            return (
              <div key={family.id} onClick={() => openFamily(family)}
                className="bg-surface border border-border rounded-xl p-4 active:scale-98 transition-all cursor-pointer hover:border-accent/40">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm mb-1.5 truncate">{sm.dot} {family.head_name||'—'}</div>
                    <div className="text-white text-xs font-medium" dir="ltr">🪪 {family.head_id}</div>
                    {cn && <div className="text-blue text-xs mt-1 font-bold">🏕️ {cn}</div>}
                    {family.phone1 && <div className="text-white text-xs mt-0.5 font-medium" dir="ltr">📞 {family.phone1}</div>}
                    {family.tent && <div className="text-muted text-[10px] mt-0.5">⛺ {family.tent}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 mr-2 flex-shrink-0">
                    <Badge color={sm.color}>{sm.label}</Badge>
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
            <div className="bg-surface2 rounded-xl p-4 border border-accent/20">
              <div className="text-accent text-xs font-bold mb-3">👤 رب الأسرة</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['الاسم', selected.head_name], ['رقم الهوية', selected.head_id],
                  ['الجوال', selected.phone1],   ['جوال 2', selected.phone2],
                  ['الجنس', selected.head_gender], ['الحالة الاجتماعية', selected.head_marital],
                  ['المخيم', campMap[selected.camp_id]], ['الخيمة', selected.tent],
                  ['المنطقة الأصلية', selected.original_address],
                  ['العنوان التفصيلي', selected.address_details],
                  ['تاريخ التسجيل', formatDate(selected.created_at)],
                ].filter(([,v]) => v).map(([k,v]) => (
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
  const filtered = useMemo(() => members.filter(m => {
    if (m.family_id !== family.id) return false
    const rel   = (m.relation   || '').trim()
    const mName = (m.name       || '').trim().replace(/\s+/g,' ')
    const hName = (family.head_name || '').trim().replace(/\s+/g,' ')
    if (['رب الأسرة','رب أسرة','head'].includes(rel)) return false
    if (family.head_id && m.national_id && m.national_id.trim()===family.head_id.trim()) return false
    if (mName && hName && mName === hName) return false
    return true
  }), [members, family])

  if (!members.length) return (
    <div className="text-muted text-xs text-center py-3">لا يوجد أفراد مسجلون</div>
  )
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
                {m.relation}{m.national_id ? ` · ${m.national_id}` : ''}{m.dob ? ` · ${formatDate(m.dob)}` : ''}
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
