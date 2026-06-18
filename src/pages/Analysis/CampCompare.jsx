import { useState, useEffect, useMemo } from 'react'
import { useLocalDB } from '../../lib/useLocalDB'
import { useApp } from '../../context/AppContext'
import { useDataScope } from '../../lib/useDataScope'
import PageHeader from '../../components/ui/PageHeader'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'

export default function CampCompare() {
  const [data,    setData]    = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy,  setSortBy]  = useState('families')
  const [typeFilter, setType] = useState('all')
  const { showToast } = useApp()
  const { query } = useLocalDB()
  const { getAllowedCampIds, filterLocal } = useDataScope()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [famRaw, camps, membersRaw] = await Promise.all([
        query('families'),
        query('camps'),
        query('family_members'),
      ])
      // عزل المخيم: كل شخص يرى فقط البيانات المسموحة لدوره
      const campIds = getAllowedCampIds(camps)
      const families = filterLocal(famRaw, campIds)
      const famIdSet = new Set(families.map(f => f.id))
      const members = campIds === null ? membersRaw : membersRaw.filter(m => famIdSet.has(m.family_id))
      const campFams = {}
      const campMems = {}
      families.forEach(f => {
        campFams[f.camp_id] = (campFams[f.camp_id]||0)+1
      })
      members.forEach(m => {
        const fam = families.find(f=>f.id===m.family_id)
        if (fam?.camp_id) campMems[fam.camp_id] = (campMems[fam.camp_id]||0)+1
      })
      const REQUIRED = ['head_name','head_id','phone1','camp_id']
      const campIncomplete = {}
      families.forEach(f=>{
        if (REQUIRED.some(k=>!f[k]?.toString().trim()))
          campIncomplete[f.camp_id]=(campIncomplete[f.camp_id]||0)+1
      })

      const rows = camps.map(c=>{
        const fCount = campFams[c.id]||0
        const mCount = campMems[c.id]||0
        const cap    = c.capacity||0
        const pct    = cap>0 ? Math.min(100,Math.round(fCount/cap*100)) : null
        return {
          id: c.id, name: c.name, type: c.camp_type||'main',
          parentId: c.parent_camp_id,
          families: fCount, members: fCount+mCount,
          capacity: cap, pct,
          incomplete: campIncomplete[c.id]||0,
          status: c.status||'active',
        }
      })
      setData(rows)
    } catch(err) { showToast('خطأ: '+err.message,true) }
    finally { setLoading(false) }
  }

  const campMap = useMemo(()=>Object.fromEntries(data.map(c=>[c.id,c.name])),[data])

  const filtered = useMemo(()=>{
    let rows = data
    if (typeFilter!=='all') rows=rows.filter(c=>c.type===typeFilter)
    return [...rows].sort((a,b)=>{
      if (sortBy==='families') return b.families-a.families
      if (sortBy==='members')  return b.members-a.members
      if (sortBy==='pct')      return (b.pct??-1)-(a.pct??-1)
      if (sortBy==='name')     return a.name.localeCompare(b.name)
      return 0
    })
  },[data,sortBy,typeFilter])

  const totals = useMemo(()=>({
    families: filtered.reduce((s,c)=>s+c.families,0),
    members:  filtered.reduce((s,c)=>s+c.members,0),
    incomplete:filtered.reduce((s,c)=>s+c.incomplete,0),
  }),[filtered])

  const SEL = "bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-accent"

  return (
    <div>
      <PageHeader icon="🏕️" title="مقارنة المخيمات" subtitle={`${data.length} مخيم`}
        action={<button onClick={loadData} className="bg-surface2 border border-border text-muted px-3 py-1.5 rounded-xl text-xs font-bold">🔄</button>}/>

      {/* إجماليات */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[['👨‍👩‍👧‍👦','الأسر',totals.families,'accent'],['👤','الأفراد',totals.members,'blue'],['⚠️','ناقصة',totals.incomplete,'red']].map(([i,l,v,c])=>(
          <div key={l} className="bg-surface border border-border rounded-xl p-2 text-center">
            <div className={`text-lg font-black text-${c}`}>{v}</div>
            <div className="text-muted text-[9px] mt-0.5">{i} {l}</div>
          </div>
        ))}
      </div>

      {/* فلاتر */}
      <div className="flex gap-2 mb-4">
        <select value={typeFilter} onChange={e=>setType(e.target.value)} className={SEL}>
          <option value="all">الكل</option>
          <option value="main">⛺ رئيسية</option>
          <option value="branch">🏕️ فروع</option>
        </select>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} className={SEL}>
          <option value="families">ترتيب: الأسر</option>
          <option value="members">ترتيب: الأفراد</option>
          <option value="pct">ترتيب: الإشغال</option>
          <option value="name">ترتيب: الاسم</option>
        </select>
      </div>

      {loading ? <div className="flex justify-center py-16"><Spinner/></div>
      : filtered.length===0 ? <EmptyState icon="🏕️" title="لا توجد مخيمات"/>
      : (
        <div className="flex flex-col gap-2">
          {filtered.map((c,idx)=>{
            const barColor = c.pct!=null ? (c.pct>=90?'bg-red':c.pct>=70?'bg-accent':'bg-green') : 'bg-muted'
            return (
              <div key={c.id} className="bg-surface border border-border rounded-xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted text-xs font-bold">#{idx+1}</span>
                      <span className="text-base">{c.type==='branch'?'🏕️':'⛺'}</span>
                      <span className="font-bold text-white text-sm">{c.name}</span>
                    </div>
                    {c.type==='branch' && c.parentId && (
                      <div className="text-muted text-[10px] mt-0.5 mr-9">↳ {campMap[c.parentId]||'—'}</div>
                    )}
                  </div>
                  <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full border
                    ${c.status==='active'?'text-green border-green/30 bg-green/10':'text-muted border-border bg-surface2'}`}>
                    {c.status==='active'?'نشط':'غير نشط'}
                  </div>
                </div>

                {/* إحصائيات */}
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[['👨‍👩‍👧‍👦','أسرة',c.families,'accent'],['👤','فرد',c.members,'blue'],
                    ['📊','سعة',c.capacity||'—','muted'],['⚠️','ناقص',c.incomplete,c.incomplete>0?'red':'muted']].map(([i,l,v,cl])=>(
                    <div key={l} className="bg-surface2 rounded-lg p-2 text-center">
                      <div className={`text-sm font-black text-${cl}`}>{v}</div>
                      <div className="text-muted text-[9px]">{i}{l}</div>
                    </div>
                  ))}
                </div>

                {/* شريط الإشغال */}
                {c.capacity>0 && (
                  <div>
                    <div className="flex justify-between text-[10px] text-muted mb-1">
                      <span>الإشغال</span>
                      <span className={c.pct>=90?'text-red font-bold':c.pct>=70?'text-accent font-bold':'text-green'}>{c.pct}%</span>
                    </div>
                    <div className="h-2 bg-surface2 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{width:`${c.pct}%`}}/>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
