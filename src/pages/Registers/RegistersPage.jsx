import { useState, useEffect, useCallback } from 'react'
import { supabase, ORG_ID } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { getPowerSync } from '../../lib/powersync'
import PageHeader from '../../components/ui/PageHeader'
import Spinner from '../../components/ui/Spinner'
import XLSX from 'xlsx-js-style'

// ── حساب العمر ─────────────────────────────────────────────
function calcAge(dob) {
  if (!dob) return null
  const b=new Date(dob),t=new Date()
  let a=t.getFullYear()-b.getFullYear()
  if(t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate()))a--
  return a>=0&&a<120?a:null
}

// ── جلب البيانات (Supabase أو PowerSync) ─────────────────────
async function fetchData() {
  if (navigator.onLine) {
    const [fRes,mRes,cRes] = await Promise.all([
      supabase.from('families').select('*').eq('org_id',ORG_ID),
      supabase.from('family_members').select('*'),
      supabase.from('camps').select('id,name').eq('org_id',ORG_ID),
    ])
    return { families:fRes.data||[], members:mRes.data||[], camps:cRes.data||[] }
  }
  const db = getPowerSync()
  const [families,members,camps] = await Promise.all([
    db.getAll('SELECT * FROM families WHERE org_id=?',[ORG_ID]),
    db.getAll('SELECT * FROM family_members'),
    db.getAll('SELECT id,name FROM camps WHERE org_id=?',[ORG_ID]),
  ])
  return { families, members, camps }
}

// ── تصدير Excel عام ──────────────────────────────────────────
function exportXLSX(rows, sheetName, fileName) {
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = Object.keys(rows[0]||{}).map(()=>({wch:18}))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${fileName}_${new Date().toLocaleDateString('ar-EG').replace(/\//g,'-')}.xlsx`)
}

// ════════════════════════════════════════════════════════════
// تبويب الأطفال
// ════════════════════════════════════════════════════════════
function ChildrenTab({ families, members, camps, filterCamp }) {
  const campMap = Object.fromEntries(camps.map(c=>[c.id,c.name]))
  const famMap  = Object.fromEntries(families.map(f=>[f.id,f]))
  const [search, setSearch] = useState('')
  const [ageFilter, setAgeFilter] = useState('')

  const kids = members
    .filter(m => { const a=calcAge(m.dob); return a!==null && a<18 })
    .map(m => {
      const f = famMap[m.family_id]||{}
      return { ...m, age:calcAge(m.dob), fam:f.head_name||'—', phone:f.phone1||'—', camp:campMap[f.camp_id]||'—', camp_id:f.camp_id||'', tent:f.tent||'—' }
    })
    .filter(k => {
      if (filterCamp && k.camp_id !== filterCamp) return false
      if (ageFilter==='0-2' && (k.age>2)) return false
      if (ageFilter==='3-6' && (k.age<3||k.age>6)) return false
      if (ageFilter==='7-12' && (k.age<7||k.age>12)) return false
      if (ageFilter==='13-17' && (k.age<13)) return false
      if (search && !k.name?.includes(search) && !k.fam?.includes(search)) return false
      return true
    })
    .sort((a,b)=>(a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true}))

  const grps = [['0-2',kids.filter(k=>k.age<=2).length],['3-6',kids.filter(k=>k.age>=3&&k.age<=6).length],['7-12',kids.filter(k=>k.age>=7&&k.age<=12).length],['13-17',kids.filter(k=>k.age>=13).length]]
  const SEL = "w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none mb-2"

  return (
    <div>
      <div className="grid grid-cols-4 gap-1 mb-3">
        {grps.map(([l,v])=>(
          <button key={l} onClick={()=>setAgeFilter(ageFilter===l?'':l)}
            className={`rounded-xl p-2 text-center border ${ageFilter===l?'bg-accent/20 border-accent text-accent':'bg-surface border-border text-muted'}`}>
            <div className="font-black text-sm">{v}</div>
            <div className="text-[10px]">{l}</div>
          </button>
        ))}
      </div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث..." className={SEL}/>
      <div className="flex justify-between items-center mb-2">
        <span className="text-muted text-xs">{kids.length} طفل</span>
        <button onClick={()=>exportXLSX(kids.map((k,i)=>({'#':i+1,'الخيمة':k.tent,'الاسم':k.name,'العمر':k.age,'الصلة':k.relation,'الجنس':k.gender||'','رب الأسرة':k.fam,'الجوال':k.phone,'المخيم':k.camp})),'سجل الأطفال','سجل_الأطفال')} className="text-xs text-accent font-bold">📥 Excel</button>
      </div>
      <div className="flex flex-col gap-1.5">
        {kids.map((k,i)=>(
          <div key={k.id||i} className="bg-surface border border-border rounded-xl p-3">
            <div className="flex justify-between">
              <div>
                <div className="font-bold text-white text-sm">{k.name} <span className="text-accent font-black">({k.age})</span></div>
                <div className="text-muted text-xs">{k.relation} • {k.gender||''} {k.orphan_status?'• 🔸يتيم':''}</div>
                <div className="text-muted text-[10px]">⛺{k.tent} 🏕️{k.camp} 👨‍👩‍👧{k.fam}</div>
              </div>
            </div>
          </div>
        ))}
        {kids.length===0&&<p className="text-muted text-center py-6">لا توجد نتائج</p>}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// تبويب النساء
// ════════════════════════════════════════════════════════════
function WomenTab({ families, members, camps, filterCamp }) {
  const campMap = Object.fromEntries(camps.map(c=>[c.id,c.name]))
  const famMap  = Object.fromEntries(families.map(f=>[f.id,f]))
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const women = [
    ...families.filter(f=>f.head_gender==='أنثى').map(f=>({
      id:'f-'+f.id, name:f.head_name, national_id:f.head_id, dob:f.head_dob,
      age:calcAge(f.head_dob), type:'رأس الأسرة', marital:f.head_marital||'—',
      status:f.head_female_status||'', camp:campMap[f.camp_id]||'—', camp_id:f.camp_id||'', tent:f.tent||'—', phone:f.phone1||'—', fam:f.head_name
    })),
    ...members.filter(m=>m.gender==='أنثى'||['زوجة','أم','ابنة','أخت'].includes(m.relation||'')).map(m=>{
      const f=famMap[m.family_id]||{}
      return { id:'m-'+m.id, name:m.name||'—', national_id:m.national_id||'', dob:m.dob, age:calcAge(m.dob), type:m.relation||'أنثى', marital:'—', status:'', camp:campMap[f.camp_id]||'—', camp_id:f.camp_id||'', tent:f.tent||'—', phone:f.phone1||'—', fam:f.head_name||'—' }
    })
  ]
    .filter(w=>{
      if(filterCamp&&w.camp_id!==filterCamp) return false
      if(typeFilter&&w.type!==typeFilter) return false
      if(search&&!w.name?.includes(search)) return false
      return true
    })
    .sort((a,b)=>(a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true}))

  const types = [...new Set(women.map(w=>w.type))]
  const stats = {total:women.length, heads:women.filter(w=>w.type==='رأس الأسرة').length, pregnant:women.filter(w=>w.status==='حامل').length}
  const SEL = "w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none mb-2"

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[['الإجمالي',stats.total],['ربات البيوت',stats.heads],['حوامل',stats.pregnant]].map(([l,v])=>(
          <div key={l} className="bg-surface border border-border rounded-xl p-2 text-center">
            <div className="font-black text-accent">{v}</div><div className="text-muted text-[10px]">{l}</div>
          </div>
        ))}
      </div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث..." className={SEL}/>
      <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} className={SEL}>
        <option value="">كل الصلات</option>
        {types.map(t=><option key={t} value={t}>{t}</option>)}
      </select>
      <div className="flex justify-between items-center mb-2">
        <span className="text-muted text-xs">{women.length} امرأة</span>
        <button onClick={()=>exportXLSX(women.map((w,i)=>({'#':i+1,'الخيمة':w.tent,'الاسم':w.name,'العمر':w.age??'','الصلة':w.type,'الحالة':w.marital,'الوضع':w.status,'المخيم':w.camp,'رب الأسرة':w.fam})),'سجل النساء','سجل_النساء')} className="text-xs text-accent font-bold">📥 Excel</button>
      </div>
      <div className="flex flex-col gap-1.5">
        {women.map(w=>(
          <div key={w.id} className="bg-surface border border-border rounded-xl p-3">
            <div className="font-bold text-white text-sm">{w.name} <span className="text-muted text-xs font-normal">({w.type})</span></div>
            <div className="text-muted text-xs">{w.age??'—'} سنة • {w.marital} {w.status?`• 🔸${w.status}`:''}</div>
            <div className="text-muted text-[10px]">⛺{w.tent} 🏕️{w.camp}</div>
          </div>
        ))}
        {women.length===0&&<p className="text-muted text-center py-6">لا توجد نتائج</p>}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// تبويب الصحة
// ════════════════════════════════════════════════════════════
function HealthTab({ families, members, camps, filterCamp }) {
  const campMap = Object.fromEntries(camps.map(c=>[c.id,c.name]))
  const famMap  = Object.fromEntries(families.map(f=>[f.id,f]))
  const [type, setType] = useState('chronic')
  const [search, setSearch] = useState('')

  const TYPES = [
    {key:'chronic',label:'أمراض مزمنة',fField:'head_chronic_diseases',mField:'chronic_diseases'},
    {key:'disability',label:'إعاقات',fField:'head_disabilities',mField:'disabilities'},
    {key:'injury',label:'إصابات',fField:'head_injuries',mField:'injuries'},
  ]

  const records = [
    ...families.map(f=>{
      const t=TYPES.find(t=>t.key===type); const val=f[t?.fField]
      if(!val?.trim()) return null
      return {id:'f-'+f.id,name:f.head_name,val,role:'رب الأسرة',camp:campMap[f.camp_id]||'—',camp_id:f.camp_id||'',tent:f.tent||'—',fam:f.head_name}
    }).filter(Boolean),
    ...members.map(m=>{
      const t=TYPES.find(t=>t.key===type); const val=m[t?.mField]
      if(!val?.trim()) return null
      const f=famMap[m.family_id]||{}
      return {id:'m-'+m.id,name:m.name||'—',val,role:m.relation||'فرد',camp:campMap[f.camp_id]||'—',camp_id:f.camp_id||'',tent:f.tent||'—',fam:f.head_name||'—'}
    }).filter(Boolean),
  ]
    .filter(r=>{
      if(filterCamp&&r.camp_id!==filterCamp) return false
      if(search&&!r.name?.includes(search)&&!r.val?.includes(search)) return false
      return true
    })
    .sort((a,b)=>(a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true}))

  const typeInfo = TYPES.find(t=>t.key===type)
  const SEL = "w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none mb-2"

  return (
    <div>
      <div className="grid grid-cols-3 gap-1 mb-3">
        {TYPES.map(t=>(
          <button key={t.key} onClick={()=>setType(t.key)}
            className={`rounded-xl p-2 text-center border text-xs ${type===t.key?'bg-accent/20 border-accent text-accent':'bg-surface border-border text-muted'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث..." className={SEL}/>
      <div className="flex justify-between items-center mb-2">
        <span className="text-muted text-xs">{records.length} سجل</span>
        <button onClick={()=>exportXLSX(records.map((r,i)=>({'#':i+1,'الخيمة':r.tent,'الاسم':r.name,'الصلة':r.role,[typeInfo?.label||'الحالة']:r.val,'المخيم':r.camp,'رب الأسرة':r.fam})),typeInfo?.label||'الصحة',`سجل_${typeInfo?.label||'الصحة'}`)} className="text-xs text-accent font-bold">📥 Excel</button>
      </div>
      <div className="flex flex-col gap-1.5">
        {records.map(r=>(
          <div key={r.id} className="bg-surface border border-border rounded-xl p-3">
            <div className="font-bold text-white text-sm">{r.name} <span className="text-muted text-xs">({r.role})</span></div>
            <div className="text-accent text-xs mt-0.5">{r.val}</div>
            <div className="text-muted text-[10px]">⛺{r.tent} 🏕️{r.camp}</div>
          </div>
        ))}
        {records.length===0&&<p className="text-muted text-center py-6">لا توجد سجلات</p>}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// تبويب التوزيعات
// ════════════════════════════════════════════════════════════
function DistTab({ families, camps, psReady }) {
  const [rounds, setRounds] = useState([])
  const [selected, setSelected] = useState(null)
  const [details, setDetails] = useState([])
  const [loading, setLoading] = useState(true)
  const campMap = Object.fromEntries(camps.map(c=>[c.id,c.name]))

  useEffect(()=>{
    async function load() {
      setLoading(true)
      try {
        let rounds2
        if (navigator.onLine) {
          const {data} = await supabase.from('dist_rounds').select('*').eq('org_id',ORG_ID).order('created_at',{ascending:false})
          rounds2 = data||[]
        } else {
          const db=getPowerSync()
          rounds2 = await db.getAll('SELECT * FROM dist_rounds WHERE org_id=? ORDER BY created_at DESC',[ORG_ID])
        }
        setRounds(rounds2)
      } catch{}
      finally{setLoading(false)}
    }
    load()
  },[psReady])

  async function loadDetails(round) {
    setSelected(round); setLoading(true)
    try {
      let received
      if (navigator.onLine) {
        const {data} = await supabase.from('camp_dist_families').select('*')
        received = data||[]
      } else {
        const db=getPowerSync()
        received = await db.getAll('SELECT * FROM camp_dist_families')
      }
      const recIds = new Set(received.map(r=>r.family_id))
      const rows = families.map(f=>({
        ...f, camp:campMap[f.camp_id]||'—', received:recIds.has(f.id),
        receivedAt:received.find(r=>r.family_id===f.id)?.received_at||''
      })).sort((a,b)=>(a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true}))
      setDetails(rows)
    } catch{}
    finally{setLoading(false)}
  }

  const recv=details.filter(d=>d.received).length
  const pct=details.length?Math.round(recv/details.length*100):0

  return (
    <div>
      {!selected ? (
        <div className="flex flex-col gap-2">
          {loading&&<div className="flex justify-center py-6"><Spinner/></div>}
          {rounds.map(r=>(
            <div key={r.id} onClick={()=>loadDetails(r)} className="bg-surface border border-border rounded-xl p-4 cursor-pointer">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-white">{r.name}</div>
                  <div className="text-muted text-xs mt-1">{r.start_date||''}</div>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${r.status==='active'?'bg-green/20 text-green':'bg-surface2 text-muted'}`}>
                  {r.status==='active'?'نشط':'مكتمل'}
                </span>
              </div>
            </div>
          ))}
          {!loading&&rounds.length===0&&<p className="text-muted text-center py-8">لا توجد جولات</p>}
        </div>
      ):(
        <div>
          <button onClick={()=>setSelected(null)} className="text-accent text-sm mb-3">← رجوع</button>
          <h3 className="font-black text-white mb-3">{selected.name}</h3>
          <div className="bg-surface border border-border rounded-xl p-4 mb-3">
            <div className="flex justify-between mb-2">
              <span className="text-muted text-sm">نسبة الاستلام</span>
              <span className="text-accent font-black">{pct}%</span>
            </div>
            <div className="w-full bg-surface2 rounded-full h-2.5">
              <div className="bg-accent h-2.5 rounded-full" style={{width:`${pct}%`}}/>
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted">
              <span>✅ {recv}</span><span>❌ {details.length-recv}</span><span>الكل: {details.length}</span>
            </div>
          </div>
          <button onClick={()=>exportXLSX(details.map((f,i)=>({'#':i+1,'الخيمة':f.tent,'الاسم':f.head_name,'الهوية':f.head_id,'المخيم':f.camp,'استلم':f.received?'✅':'❌'})),'التوزيع',`توزيع_${selected.name}`)} className="w-full mb-3 py-2 rounded-xl text-xs text-accent border border-accent/30 font-bold">📥 Excel</button>
          {loading?<div className="flex justify-center py-4"><Spinner/></div>:(
            <div className="flex flex-col gap-1">
              {details.map(f=>(
                <div key={f.id} className="flex items-center gap-3 bg-surface border border-border rounded-xl px-3 py-2">
                  <span className={f.received?'text-green text-lg':'text-red text-lg'}>{f.received?'✅':'❌'}</span>
                  <div>
                    <div className="font-bold text-white text-sm">{f.head_name}</div>
                    <div className="text-muted text-xs">⛺{f.tent} • {f.camp}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// الصفحة الرئيسية
// ════════════════════════════════════════════════════════════
const TABS = [
  {id:'children', label:'👶 الأطفال'},
  {id:'women',    label:'👩 النساء'},
  {id:'health',   label:'🏥 الصحة'},
  {id:'dist',     label:'📦 التوزيعات'},
]

export default function RegistersPage() {
  const { showToast, psReady, psSynced } = useApp()
  const [tab,        setTab]        = useState('children')
  const [loading,    setLoading]    = useState(true)
  const [families,   setFamilies]   = useState([])
  const [members,    setMembers]    = useState([])
  const [camps,      setCamps]      = useState([])
  const [filterCamp, setFilterCamp] = useState('')

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const { families: f, members: m, camps: c } = await fetchData()
      setFamilies(f); setMembers(m); setCamps(c)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false) }
  }, [])

  useEffect(()=>{ loadAll() },[])
  useEffect(()=>{ if(psReady)  loadAll() },[psReady])
  useEffect(()=>{ if(psSynced) loadAll() },[psSynced])

  const SEL = "w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none mb-3"

  return (
    <div>
      <PageHeader icon="📋" title="السجلات"/>

      {/* فلتر المخيم */}
      <select value={filterCamp} onChange={e=>setFilterCamp(e.target.value)} className={SEL}>
        <option value="">🏕️ كل المخيمات</option>
        {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {/* تبويبات */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              tab===t.id?'bg-accent text-bg':'bg-surface2 text-muted border border-border'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner/></div>
      ) : (
        <>
          {tab==='children'  && <ChildrenTab families={families} members={members} camps={camps} filterCamp={filterCamp}/>}
          {tab==='women'     && <WomenTab    families={families} members={members} camps={camps} filterCamp={filterCamp}/>}
          {tab==='health'    && <HealthTab   families={families} members={members} camps={camps} filterCamp={filterCamp}/>}
          {tab==='dist'      && <DistTab     families={families} camps={camps} psReady={psReady}/>}
        </>
      )}
    </div>
  )
}
