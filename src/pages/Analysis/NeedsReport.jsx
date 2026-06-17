import { useState, useEffect, useMemo } from 'react'
import { useLocalDB } from '../../lib/useLocalDB'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'

const CAT_LABELS = {
  martyr:      { label:'أسر شهداء',  icon:'🕊️', color:'purple' },
  captive:     { label:'أسر أسرى',   icon:'⛓️', color:'blue'   },
  no_provider: { label:'فاقد معيل',  icon:'💔', color:'red'    },
  destroyed:   { label:'بيت مهدم',   icon:'🏗️', color:'accent' },
  large:       { label:'أسرة كبيرة', icon:'👨‍👩‍👧‍👦', color:'green'  },
}
const ECON_LABELS = {
  extreme_poverty:'🔴 فقر مدقع', poor:'🟠 فقير',
  worker:'🟡 عامل', employee:'🟢 موظف', well_off:'🔵 ميسور',
}
const HEALTH_TYPES = {
  معاق:  { label:'معاق',       icon:'🦽' },
  مصاب:  { label:'إصابة حرب', icon:'🩹' },
  مزمن:  { label:'مرض مزمن',  icon:'💊' },
  مريض:  { label:'مريض',       icon:'🤒' },
}

export default function NeedsReport() {
  const [families,   setFamilies]   = useState([])
  const [members,    setMembers]    = useState([])
  const [camps,      setCamps]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [filterCamp, setFilterCamp] = useState('')
  const [filterCat,  setFilterCat]  = useState('')
  const [filterEcon, setFilterEcon] = useState('')
  const [filterHealth,setFilterHealth]= useState('')
  const [exporting,  setExporting]  = useState(false)
  const { showToast } = useApp()
  const { canExport } = useAuth()
  const { query } = useLocalDB()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [f,c,m] = await Promise.all([
        query('families'),
        query('camps'),
        query('family_members'),
      ])
      setFamilies(f); setCamps(c); setMembers(m)
    } catch(err) { showToast('خطأ: '+err.message,true) }
    finally { setLoading(false) }
  }

  const campMap = useMemo(()=>Object.fromEntries(camps.map(c=>[c.id,c.name])),[camps])
  const memsByFamily = useMemo(()=>{
    const m={}; members.forEach(x=>{ if(!m[x.family_id]) m[x.family_id]=[]; m[x.family_id].push(x) }); return m
  },[members])

  const filtered = useMemo(()=>{
    return families.filter(f=>{
      if (filterCamp && f.camp_id!==filterCamp) return false
      if (filterCat  && !(f.categories||[]).includes(filterCat)) return false
      if (filterEcon && f.economic_level!==filterEcon) return false
      if (filterHealth) {
        const mems = memsByFamily[f.id]||[]
        if (!mems.some(m=>m.health===filterHealth)) return false
      }
      return true
    })
  },[families,filterCamp,filterCat,filterEcon,filterHealth,memsByFamily])

  // إحصائيات سريعة
  const quickStats = useMemo(()=>{
    const s={}
    Object.keys(CAT_LABELS).forEach(k=>{ s[k]=families.filter(f=>(f.categories||[]).includes(k)).length })
    s.orphans  = families.filter(f=>(f.num_orphans||0)>0).length
    s.disabled = members.filter(m=>m.health==='معاق').length
    s.injured  = members.filter(m=>m.health==='مصاب').length
    s.chronic  = members.filter(m=>m.health==='مزمن').length
    return s
  },[families,members])

  async function exportCSV() {
    if (!canExport) return showToast('ليس لديك صلاحية',true)
    setExporting(true)
    try {
      const headers = ['اسم الأسرة','رقم الهوية','الجوال','المخيم','عدد الأفراد','الفئات','المستوى الاقتصادي','الأيتام']
      const rows = filtered.map(f=>[
        f.head_name||'', f.head_id||'', f.phone1||'',
        campMap[f.camp_id]||'',
        (memsByFamily[f.id]?.length||0)+1,
        (f.categories||[]).map(c=>CAT_LABELS[c]?.label||c).join(' | '),
        ECON_LABELS[f.economic_level]?.replace(/^../,'')||'',
        f.num_orphans||0,
      ])
      const csv = [headers,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
      const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href=url; a.download=`needs_report_${new Date().toISOString().slice(0,10)}.csv`; a.click()
      URL.revokeObjectURL(url)
      showToast(`✅ تم تصدير ${filtered.length} أسرة`)
    } catch(err) { showToast('خطأ: '+err.message,true) }
    finally { setExporting(false) }
  }

  const SEL = "w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent"

  return (
    <div>
      <PageHeader icon="📋" title="تقارير الاحتياجات" subtitle={`${filtered.length} أسرة`}/>

      {/* إحصائيات سريعة */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {Object.entries(CAT_LABELS).map(([k,v])=>(
          <button key={k} onClick={()=>setFilterCat(f=>f===k?'':k)}
            className={`rounded-xl p-2 text-center border transition-all ${filterCat===k?'bg-accent/20 border-accent':'bg-surface border-border'}`}>
            <div className="text-base mb-0.5">{v.icon}</div>
            <div className={`text-sm font-black text-${v.color}`}>{quickStats[k]}</div>
            <div className="text-muted text-[9px]">{v.label}</div>
          </button>
        ))}
        <div className="bg-surface border border-border rounded-xl p-2 text-center">
          <div className="text-base mb-0.5">🕊️</div>
          <div className="text-sm font-black text-red">{quickStats.orphans}</div>
          <div className="text-muted text-[9px]">أسر يتامى</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-2 text-center">
          <div className="text-base mb-0.5">🦽</div>
          <div className="text-sm font-black text-purple-400">{quickStats.disabled}</div>
          <div className="text-muted text-[9px]">إعاقات</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-2 text-center">
          <div className="text-base mb-0.5">🩹</div>
          <div className="text-sm font-black text-accent">{quickStats.injured}</div>
          <div className="text-muted text-[9px]">إصابات</div>
        </div>
      </div>

      {/* فلاتر */}
      <Card title="الفلاتر" icon="🔍">
        <div className="flex flex-col gap-2">
          <select value={filterCamp} onChange={e=>setFilterCamp(e.target.value)} className={SEL}>
            <option value="">🏕️ كل المخيمات</option>
            {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} className={SEL}>
            <option value="">🏷️ كل الفئات</option>
            {Object.entries(CAT_LABELS).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <select value={filterEcon} onChange={e=>setFilterEcon(e.target.value)} className={SEL}>
            <option value="">💰 كل المستويات الاقتصادية</option>
            {Object.entries(ECON_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterHealth} onChange={e=>setFilterHealth(e.target.value)} className={SEL}>
            <option value="">🏥 كل الحالات الصحية</option>
            {Object.entries(HEALTH_TYPES).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <button onClick={exportCSV} disabled={exporting||!filtered.length}
            className="w-full bg-green/15 border border-green/30 text-green font-bold py-2.5 rounded-xl text-sm disabled:opacity-60">
            {exporting?'جاري التصدير...':'📥 تصدير النتائج CSV'}
          </button>
        </div>
      </Card>

      {/* النتائج */}
      {loading ? <div className="flex justify-center py-8"><Spinner/></div>
      : filtered.length===0 ? <EmptyState icon="📋" title="لا توجد نتائج" subtitle="جرب تغيير الفلاتر"/>
      : (
        <div className="flex flex-col gap-2">
          {filtered.slice(0,50).map(f=>{
            const mems = memsByFamily[f.id]||[]
            const unhealthy = mems.filter(m=>m.health&&m.health!=='سليم')
            return (
              <div key={f.id} className="bg-surface border border-border rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-bold text-white text-sm">{f.head_name}</div>
                    <div className="text-white text-xs" dir="ltr">{f.head_id}</div>
                    {campMap[f.camp_id] && <div className="text-blue text-xs mt-0.5">🏕️ {campMap[f.camp_id]}</div>}
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {(f.categories||[]).map(c=>(
                        <span key={c} className="text-[9px] bg-accent/15 text-accent border border-accent/20 px-1.5 py-0.5 rounded-full font-bold">
                          {CAT_LABELS[c]?.icon} {CAT_LABELS[c]?.label||c}
                        </span>
                      ))}
                      {f.economic_level && <span className="text-[9px] bg-surface2 text-muted border border-border px-1.5 py-0.5 rounded-full">{ECON_LABELS[f.economic_level]?.replace(/^../,'').trim()}</span>}
                      {(f.num_orphans||0)>0 && <span className="text-[9px] bg-red/15 text-red border border-red/20 px-1.5 py-0.5 rounded-full font-bold">🕊️ {f.num_orphans} يتيم</span>}
                    </div>
                    {unhealthy.length>0 && (
                      <div className="text-[10px] text-muted mt-1">
                        {unhealthy.map(m=>`${HEALTH_TYPES[m.health]?.icon||'⚠️'} ${m.name}`).join(' · ')}
                      </div>
                    )}
                  </div>
                  <div className="text-accent text-xs font-bold">👥 {mems.length+1}</div>
                </div>
              </div>
            )
          })}
          {filtered.length>50 && <div className="text-muted text-xs text-center py-2">عرض 50 من {filtered.length} — استخدم تصدير CSV للكل</div>}
        </div>
      )}
    </div>
  )
}
