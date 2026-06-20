import { useState, useEffect, useCallback } from 'react'
import { useLocalDB } from '../../lib/useLocalDB'
import { ORG_ID } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { useDataScope } from '../../lib/useDataScope'
import PageHeader from '../../components/ui/PageHeader'
import Spinner from '../../components/ui/Spinner'
import XLSX from 'xlsx-js-style'

// ─── أدوات مشتركة ─────────────────────────────────────────
function calcAge(dob) {
  if (!dob) return null
  const b=new Date(dob),t=new Date()
  let a=t.getFullYear()-b.getFullYear()
  if(t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate()))a--
  return a>=0&&a<120?a:null
}

function exportXlsx(rows, sheetName, fileName) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const keys = Object.keys(rows[0]||{})
  ws['!cols'] = keys.map(()=>({wch:20}))
  // تنسيق رواسي
  keys.forEach((_,col)=>{
    const addr = XLSX.utils.encode_cell({r:0,c:col})
    if(ws[addr]) ws[addr].s = {
      fill:{patternType:'solid',fgColor:{rgb:'1E3A5F'},bgColor:{rgb:'1E3A5F'}},
      font:{bold:true,color:{rgb:'FFFFFF'},sz:10},
      alignment:{horizontal:'center',vertical:'center'}
    }
  })
  // صفوف متبادلة
  for(let row=1;row<rows.length+1;row++){
    const bg=(row-1)%2===0?'FFFFFF':'EEF2F7'
    keys.forEach((_,col)=>{
      const addr=XLSX.utils.encode_cell({r:row,c:col})
      if(ws[addr]) ws[addr].s={
        fill:{patternType:'solid',fgColor:{rgb:bg}},
        font:{sz:10},alignment:{horizontal:'center',vertical:'center'}
      }
    })
  }
  const wb=XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb,ws,sheetName)
  XLSX.writeFile(wb,`${fileName}_${new Date().toLocaleDateString('ar-EG').replace(/\//g,'-')}.xlsx`)
}

const SEL="w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
const INP=SEL

// ─── تبويب الأطفال ────────────────────────────────────────
const AGE_GROUPS=[{l:'رضيع',min:0,max:2},{l:'صغير',min:3,max:6},{l:'طفل',min:7,max:12},{l:'مراهق',min:13,max:17}]

function ChildrenTab({camps,onlineData,showToast}) {
  const [kids,setKids]=useState([])
  const [filterCamp,setFilterCamp]=useState('')
  const [filterAge,setFilterAge]=useState('')
  const [search,setSearch]=useState('')
  const [loading,setLoading]=useState(false)

  useEffect(()=>{
    if(!onlineData) return
    const {families,members,campMap}=onlineData
    const famMap=Object.fromEntries(families.map(f=>[f.id,f]))
    const list=members
      .filter(m=>{ const a=calcAge(m.dob); return a!==null&&a<18 })
      .map(m=>{
        const f=famMap[m.family_id]||{}
        return {...m,age:calcAge(m.dob),fam_name:f.head_name||'—',
          head_id:f.head_id||'—',phone:f.phone1||'—',
          camp_id:f.camp_id||'',camp:campMap[f.camp_id]||'—',tent:f.tent||'—'}
      })
      .sort((a,b)=>(a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true}))
    setKids(list)
  },[onlineData])

  const filtered=kids.filter(c=>{
    if(filterCamp&&c.camp_id!==filterCamp) return false
    if(filterAge){const g=AGE_GROUPS.find(g=>g.l===filterAge);if(g&&(c.age<g.min||c.age>g.max)) return false}
    if(search&&!c.name?.includes(search)&&!c.national_id?.includes(search)) return false
    return true
  })
  const byGroup=AGE_GROUPS.map(g=>({...g,count:kids.filter(c=>c.age>=g.min&&c.age<=g.max&&(!filterCamp||c.camp_id===filterCamp)).length}))

  return (<div>
    <div className="grid grid-cols-4 gap-1 mb-3">
      {byGroup.map(g=><div key={g.l} className="bg-surface border border-border rounded-xl p-2 text-center">
        <div className="text-accent font-black text-lg">{g.count}</div>
        <div className="text-muted text-[10px]">{g.l}</div>
      </div>)}
    </div>
    <div className="flex flex-col gap-2 mb-3">
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث..." className={INP}/>
      <select value={filterCamp} onChange={e=>setFilterCamp(e.target.value)} className={SEL}>
        <option value="">🏕️ كل المخيمات</option>
        {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select value={filterAge} onChange={e=>setFilterAge(e.target.value)} className={SEL}>
        <option value="">🎂 كل الأعمار</option>
        {AGE_GROUPS.map(g=><option key={g.l} value={g.l}>{g.l} ({g.min}-{g.max})</option>)}
      </select>
    </div>
    <button onClick={()=>{ const rows=filtered.map((c,i)=>({'#':i+1,'الخيمة':c.tent,'الاسم':c.name,'رقم الهوية':c.national_id||'','العمر':c.age??'','الصلة':c.relation||'','الجنس':c.gender||'','يتيم':c.orphan_status?'نعم':'','اسم رب الأسرة':c.fam_name,'الجوال':c.phone,'المخيم':c.camp})); exportXlsx(rows,'الأطفال',`سجل_الأطفال`); showToast(`✅ ${rows.length} طفل`)}}
      className="w-full mb-3 py-2.5 rounded-xl text-sm font-black text-bg bg-accent">
      📥 تصدير Excel ({filtered.length})
    </button>
    <div className="flex flex-col gap-1.5">
      {filtered.slice(0,50).map((c,i)=><div key={c.id||i} className="bg-surface border border-border rounded-xl p-3">
        <div className="flex justify-between">
          <div>
            <div className="font-bold text-white text-sm">{c.name}</div>
            <div className="text-muted text-xs">{c.age} سنة • {c.relation} • {c.gender} {c.orphan_status?'• 🔸 يتيم':''}</div>
            <div className="text-muted text-xs">⛺{c.tent} • 🏕️{c.camp}</div>
          </div>
          <span className="text-accent font-black text-xl">{c.age}</span>
        </div>
      </div>)}
      {filtered.length>50&&<p className="text-muted text-xs text-center py-2">عرض 50 من {filtered.length} — صدّر Excel للكل</p>}
    </div>
  </div>)
}

// ─── تبويب النساء ─────────────────────────────────────────
function WomenTab({camps,onlineData,showToast}) {
  const [women,setWomen]=useState([])
  const [filterCamp,setFilterCamp]=useState('')
  const [filterType,setFilterType]=useState('')
  const [search,setSearch]=useState('')

  useEffect(()=>{
    if(!onlineData) return
    const {families,members,campMap}=onlineData
    const famMap=Object.fromEntries(families.map(f=>[f.id,f]))
    const list=[]
    families.filter(f=>f.head_gender==='أنثى').forEach(f=>{
      list.push({id:'f'+f.id,name:f.head_name,national_id:f.head_id,dob:f.head_dob,
        age:calcAge(f.head_dob),type:'رأس الأسرة',marital:f.head_marital||'—',
        female_status:f.head_female_status||'',chronic:f.head_chronic_diseases||'',
        camp:campMap[f.camp_id]||'—',camp_id:f.camp_id||'',tent:f.tent||'—',phone:f.phone1||'—'})
    })
    members.filter(m=>m.gender==='أنثى'||['زوجة','أم','ابنة','أخت'].includes(m.relation||'')).forEach(m=>{
      const f=famMap[m.family_id]||{}
      list.push({id:'m'+m.id,name:m.name,national_id:m.national_id||'',dob:m.dob,
        age:calcAge(m.dob),type:m.relation||'أنثى',marital:'—',
        female_status:'',chronic:m.chronic_diseases||'',
        camp:campMap[f.camp_id]||'—',camp_id:f.camp_id||'',tent:f.tent||'—',
        phone:f.phone1||'—',fam_name:f.head_name||'—'})
    })
    list.sort((a,b)=>(a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true}))
    setWomen(list)
  },[onlineData])

  const types=[...new Set(women.map(w=>w.type))]
  const filtered=women.filter(w=>{
    if(filterCamp&&w.camp_id!==filterCamp) return false
    if(filterType&&w.type!==filterType) return false
    if(search&&!w.name?.includes(search)) return false
    return true
  })
  const stats={total:filtered.length,heads:filtered.filter(w=>w.type==='رأس الأسرة').length,pregnant:filtered.filter(w=>w.female_status==='حامل').length}

  return (<div>
    <div className="grid grid-cols-3 gap-2 mb-3">
      {[['الإجمالي',stats.total,'text-accent'],['ربات البيوت',stats.heads,'text-blue'],['حوامل',stats.pregnant,'text-green']].map(([l,v,cls])=>
        <div key={l} className="bg-surface border border-border rounded-xl p-2 text-center">
          <div className={`font-black text-lg ${cls}`}>{v}</div>
          <div className="text-muted text-[10px]">{l}</div>
        </div>)}
    </div>
    <div className="flex flex-col gap-2 mb-3">
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث..." className={INP}/>
      <select value={filterCamp} onChange={e=>setFilterCamp(e.target.value)} className={SEL}>
        <option value="">🏕️ كل المخيمات</option>
        {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select value={filterType} onChange={e=>setFilterType(e.target.value)} className={SEL}>
        <option value="">📋 كل الصلات</option>
        {types.map(t=><option key={t} value={t}>{t}</option>)}
      </select>
    </div>
    <button onClick={()=>{const rows=filtered.map((w,i)=>({'#':i+1,'الخيمة':w.tent,'الاسم':w.name,'رقم الهوية':w.national_id,'العمر':w.age??'','الصلة':w.type,'الحالة':w.marital,'الوضع':w.female_status,'أمراض':w.chronic,'الجوال':w.phone,'المخيم':w.camp}));exportXlsx(rows,'النساء','سجل_النساء');showToast(`✅ ${rows.length} سجل`)}}
      className="w-full mb-3 py-2.5 rounded-xl text-sm font-black text-bg bg-accent">
      📥 تصدير Excel ({filtered.length})
    </button>
    <div className="flex flex-col gap-1.5">
      {filtered.slice(0,50).map((w,i)=><div key={w.id} className="bg-surface border border-border rounded-xl p-3">
        <div className="flex justify-between">
          <div>
            <div className="font-bold text-white text-sm">{w.name}</div>
            <div className="text-muted text-xs">{w.type} • {w.age??'—'} سنة {w.female_status?`• 🔸${w.female_status}`:''}</div>
            <div className="text-muted text-xs">⛺{w.tent} • 🏕️{w.camp}</div>
          </div>
          <span className="text-accent text-xs font-bold">{w.type}</span>
        </div>
      </div>)}
      {filtered.length>50&&<p className="text-muted text-xs text-center py-2">عرض 50 من {filtered.length}</p>}
    </div>
  </div>)
}

// ─── تبويب الصحة ──────────────────────────────────────────
const HEALTH_TYPES=[{key:'chronic',label:'أمراض مزمنة',icon:'🩺'},{key:'disability',label:'إعاقات',icon:'♿'},{key:'injury',label:'إصابات',icon:'🤕'}]

function HealthTab({camps,onlineData,showToast}) {
  const [records,setRecords]=useState([])
  const [filterType,setFilterType]=useState('chronic')
  const [filterCamp,setFilterCamp]=useState('')
  const [search,setSearch]=useState('')

  useEffect(()=>{
    if(!onlineData) return
    const {families,members,campMap}=onlineData
    const famMap=Object.fromEntries(families.map(f=>[f.id,f]))
    const list=[]
    const fields={chronic:'chronic_diseases',disability:'disabilities',injury:'injuries'}
    families.forEach(f=>{
      HEALTH_TYPES.forEach(({key})=>{
        const val=f[`head_${fields[key]}`]||f[fields[key]]
        if(val?.trim()) list.push({id:`f${f.id}${key}`,name:f.head_name,national_id:f.head_id,
          type:key,value:val,role:'رب الأسرة',
          camp:campMap[f.camp_id]||'—',camp_id:f.camp_id||'',tent:f.tent||'—'})
      })
    })
    members.forEach(m=>{
      const f=famMap[m.family_id]||{}
      HEALTH_TYPES.forEach(({key})=>{
        const val=m[fields[key]]
        if(val?.trim()) list.push({id:`m${m.id}${key}`,name:m.name||'—',national_id:m.national_id||'',
          type:key,value:val,role:m.relation||'فرد',
          camp:campMap[f.camp_id]||'—',camp_id:f.camp_id||'',tent:f.tent||'—',fam_name:f.head_name||'—'})
      })
    })
    list.sort((a,b)=>(a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true}))
    setRecords(list)
  },[onlineData])

  const stats=HEALTH_TYPES.map(t=>({...t,count:records.filter(r=>r.type===t.key&&(!filterCamp||r.camp_id===filterCamp)).length}))
  const filtered=records.filter(r=>{
    if(r.type!==filterType) return false
    if(filterCamp&&r.camp_id!==filterCamp) return false
    if(search&&!r.name?.includes(search)&&!r.value?.includes(search)) return false
    return true
  })

  return (<div>
    <div className="grid grid-cols-3 gap-1 mb-3">
      {stats.map(s=><button key={s.key} onClick={()=>setFilterType(s.key)}
        className={`rounded-xl p-2 text-center border transition-all ${filterType===s.key?'bg-accent/20 border-accent text-accent':'bg-surface border-border text-muted'}`}>
        <div className="font-black text-lg">{s.count}</div>
        <div className="text-[10px]">{s.icon} {s.label}</div>
      </button>)}
    </div>
    <div className="flex flex-col gap-2 mb-3">
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث..." className={INP}/>
      <select value={filterCamp} onChange={e=>setFilterCamp(e.target.value)} className={SEL}>
        <option value="">🏕️ كل المخيمات</option>
        {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
    <button onClick={()=>{const type=HEALTH_TYPES.find(t=>t.key===filterType);const rows=filtered.map((r,i)=>({'#':i+1,'الخيمة':r.tent,'الاسم':r.name,'رقم الهوية':r.national_id,'الصلة':r.role,[type?.label||'الحالة']:r.value,'اسم رب الأسرة':r.fam_name||r.name,'المخيم':r.camp}));exportXlsx(rows,type?.label||'الصحة',`سجل_${type?.label||'الصحة'}`);showToast(`✅ ${rows.length} سجل`)}}
      className="w-full mb-3 py-2.5 rounded-xl text-sm font-black text-bg bg-accent">
      📥 تصدير — {HEALTH_TYPES.find(t=>t.key===filterType)?.label} ({filtered.length})
    </button>
    <div className="flex flex-col gap-1.5">
      {filtered.slice(0,50).map(r=><div key={r.id} className="bg-surface border border-border rounded-xl p-3">
        <div className="font-bold text-white text-sm">{r.name} <span className="text-muted text-xs font-normal">({r.role})</span></div>
        <div className="text-accent text-xs mt-0.5">{r.value}</div>
        <div className="text-muted text-[10px]">⛺{r.tent} • 🏕️{r.camp} {r.fam_name?`• 👨‍👩‍👧${r.fam_name}`:''}</div>
      </div>)}
      {filtered.length>50&&<p className="text-muted text-xs text-center py-2">عرض 50 من {filtered.length}</p>}
    </div>
  </div>)
}

// ─── تبويب التوزيعات ──────────────────────────────────────
function DistTab({camps,onlineData,showToast}) {
  const [rounds,setRounds]=useState([])
  const [selected,setSelected]=useState(null)
  const [details,setDetails]=useState([])
  const [filterCamp,setFilterCamp]=useState('')
  const [loading,setLoading]=useState(false)
  const {query}=useLocalDB()

  useEffect(()=>{
    if(!onlineData) return
    const load=async()=>{
      try{
        const r2=await query('dist_rounds',{org_id:ORG_ID})
        setRounds(r2.sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)))
      }catch(e){ showToast('خطأ بتحميل الجولات: '+e.message,true) }
    }
    load()
  },[onlineData])

  const loadDetails=async(round)=>{
    setSelected(round);setLoading(true)
    try{
      const {families,members,campMap}=onlineData||{}
      const received=await query('camp_dist_families',{distribution_id:round.id})
      const memCount={}
      members?.forEach(m=>{memCount[m.family_id]=(memCount[m.family_id]||0)+1})
      const receivedIds=new Set(received.map(r=>r.family_id))
      let fams=families||[]
      if(filterCamp) fams=fams.filter(f=>f.camp_id===filterCamp)
      setDetails(fams.map(f=>({...f,camp:campMap?.[f.camp_id]||'—',members:(memCount[f.id]||0)+1,received:receivedIds.has(f.id),receivedAt:received.find(r=>r.family_id===f.id)?.received_at||''}))
        .sort((a,b)=>(a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true})))
    }catch(e){ showToast('خطأ بتحميل التفاصيل: '+e.message,true) }
    finally{setLoading(false)}
  }

  const recv=details.filter(d=>d.received).length
  const pct=details.length?Math.round(recv/details.length*100):0

  return (<div>
    {!selected?(<div className="flex flex-col gap-2">
      {rounds.map(r=><div key={r.id} onClick={()=>loadDetails(r)}
        className="bg-surface border border-border rounded-xl p-3 cursor-pointer">
        <div className="flex justify-between">
          <div><div className="font-bold text-white">{r.name}</div><div className="text-muted text-xs">{r.created_at ? new Date(r.created_at).toLocaleDateString('ar') : ''}</div></div>
          <span className={`text-xs px-2 py-1 rounded-lg ${r.status==='active'?'bg-green/20 text-green':r.status==='completed'?'bg-blue/20 text-blue':'bg-surface2 text-muted'}`}>
            {r.status==='active'?'نشط':r.status==='completed'?'مكتمل':r.status}
          </span>
        </div>
      </div>)}
      {rounds.length===0&&<p className="text-muted text-center py-6">لا توجد جولات توزيع</p>}
    </div>):(<div>
      <button onClick={()=>setSelected(null)} className="text-accent text-sm mb-3">← رجوع</button>
      <h2 className="font-black text-white mb-3">{selected.name}</h2>
      <div className="bg-surface border border-border rounded-xl p-3 mb-3">
        <div className="flex justify-between mb-1"><span className="text-muted text-sm">نسبة الاستلام</span><span className="text-accent font-black">{pct}%</span></div>
        <div className="w-full bg-surface2 rounded-full h-2"><div className="bg-accent h-2 rounded-full" style={{width:`${pct}%`}}/></div>
        <div className="flex justify-between mt-1 text-xs text-muted"><span>✅ {recv}</span><span>❌ {details.length-recv}</span><span>الإجمالي: {details.length}</span></div>
      </div>
      <select value={filterCamp} onChange={e=>{setFilterCamp(e.target.value);loadDetails(selected)}} className={SEL+' mb-3'}>
        <option value="">🏕️ كل المخيمات</option>
        {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <button onClick={()=>{const rows=details.map((f,i)=>({'#':i+1,'الخيمة':f.tent||'—','اسم رب الأسرة':f.head_name,'رقم الهوية':f.head_id,'الجوال':f.phone1,'عدد الأفراد':f.members,'استلم':f.received?'✅':'❌','المخيم':f.camp}));exportXlsx(rows,'التوزيع',`توزيع_${selected.name||''}`);showToast(`✅ ${rows.length} أسرة`)}}
        className="w-full mb-3 py-2.5 rounded-xl text-sm font-black text-bg bg-accent">📥 تصدير Excel</button>
      {loading?<div className="flex justify-center py-4"><Spinner/></div>:
        <div className="flex flex-col gap-1.5">
          {details.map(f=><div key={f.id} className="flex items-center gap-2 bg-surface border border-border rounded-xl px-3 py-2">
            <span className={`text-lg ${f.received?'text-green':'text-red'}`}>{f.received?'✅':'❌'}</span>
            <div><div className="font-bold text-white text-sm">{f.head_name}</div>
              <div className="text-muted text-xs">⛺{f.tent} • 👥{f.members} • {f.camp}</div></div>
          </div>)}
        </div>}
    </div>)}
  </div>)
}

// ─── الصفحة الرئيسية ──────────────────────────────────────
const TABS=[{id:'children',icon:'👶',label:'الأطفال'},{id:'women',icon:'👩',label:'النساء'},{id:'health',icon:'🏥',label:'الصحة'},{id:'dist',icon:'📦',label:'التوزيعات'}]

export default function RegistriesPage() {
  const {showToast,psReady,psSynced}=useApp()
  const {query}=useLocalDB()
  const {getAllowedCampIds,filterLocal}=useDataScope()
  const [tab,setTab]=useState('children')
  const [loading,setLoading]=useState(true)
  const [camps,setCamps]=useState([])
  const [onlineData,setOnlineData]=useState(null)

  const loadAll=useCallback(async()=>{
    setLoading(true)
    try{
      const [famRaw,membersRaw,campsData]=await Promise.all([
        query('families',{org_id:ORG_ID}),
        query('family_members'),
        query('camps',{org_id:ORG_ID}),
      ])
      setCamps(campsData)
      const campMap=Object.fromEntries(campsData.map(c=>[c.id,c.name]))
      // عزل المخيم
      const campIds=getAllowedCampIds(campsData)
      const families=filterLocal(famRaw,campIds)
      const famIdSet=new Set(families.map(f=>f.id))
      const members=campIds===null?membersRaw:membersRaw.filter(m=>famIdSet.has(m.family_id))
      setOnlineData({families,members,campMap})
    }catch(e){showToast('خطأ: '+e.message,true)}
    finally{setLoading(false)}
  },[])

  useEffect(()=>{ loadAll() },[])
  useEffect(()=>{ if(psReady)  loadAll() },[psReady])
  useEffect(()=>{ if(psSynced) loadAll() },[psSynced])

  const props={camps,onlineData,showToast}

  return(<div>
    <PageHeader icon="📋" title="السجلات"/>
    <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
      {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)}
        className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${tab===t.id?'bg-accent text-bg':'bg-surface2 text-muted border border-border'}`}>
        {t.icon} {t.label}
      </button>)}
    </div>
    {loading?<div className="flex flex-col items-center py-10 gap-3"><Spinner size="lg"/><p className="text-muted text-sm">جاري تحميل البيانات...</p></div>
    :<>
      {tab==='children' && <ChildrenTab {...props}/>}
      {tab==='women'    && <WomenTab    {...props}/>}
      {tab==='health'   && <HealthTab   {...props}/>}
      {tab==='dist'     && <DistTab     {...props}/>}
    </>}
  </div>)
}
