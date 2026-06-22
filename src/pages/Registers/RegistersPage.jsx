import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLocalDB } from '../../lib/useLocalDB'
import { ORG_ID } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { visibleFamilies } from '../../lib/familyApproval'
import { useDataScope } from '../../lib/useDataScope'
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

// ── تصدير Excel منسّق بالألوان (من قوائم البيانات) ──────────
function exportXLSX(rows, sheetName, fileName) {
  if (!rows.length) return
  const ws = XLSX.utils.json_to_sheet(rows)
  const keys = Object.keys(rows[0]||{})
  ws['!cols'] = keys.map(()=>({wch:20}))
  // تنسيق رؤوس الأعمدة
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

const SEL = "w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none mb-2"

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
      if (search && !k.name?.includes(search) && !k.fam?.includes(search) && !k.national_id?.includes(search)) return false
      return true
    })
    .sort((a,b)=>(a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true}))

  const grps = [['0-2',kids.filter(k=>k.age<=2).length],['3-6',kids.filter(k=>k.age>=3&&k.age<=6).length],['7-12',kids.filter(k=>k.age>=7&&k.age<=12).length],['13-17',kids.filter(k=>k.age>=13).length]]

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
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 ابحث بالاسم أو رقم الهوية..." className={SEL}/>
      <div className="flex justify-between items-center mb-2">
        <span className="text-muted text-xs">{kids.length} طفل</span>
        <button onClick={()=>exportXLSX(kids.map((k,i)=>({'#':i+1,'الخيمة':k.tent,'الاسم':k.name,'رقم الهوية':k.national_id||'','العمر':k.age,'الصلة':k.relation,'الجنس':k.gender||'','يتيم':k.orphan_status?'نعم':'','رب الأسرة':k.fam,'الجوال':k.phone,'المخيم':k.camp})),'الأطفال','سجل_الأطفال')} className="text-xs text-accent font-bold">📥 Excel</button>
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
      status:f.head_female_status||'', chronic:f.head_chronic_diseases||'',
      camp:campMap[f.camp_id]||'—', camp_id:f.camp_id||'', tent:f.tent||'—', phone:f.phone1||'—', fam:f.head_name
    })),
    ...members.filter(m=>m.gender==='أنثى'||['زوجة','أم','ابنة','أخت'].includes(m.relation||'')).map(m=>{
      const f=famMap[m.family_id]||{}
      return { id:'m-'+m.id, name:m.name||'—', national_id:m.national_id||'', dob:m.dob, age:calcAge(m.dob), type:m.relation||'أنثى', marital:'—', status:'', chronic:m.chronic_diseases||'', camp:campMap[f.camp_id]||'—', camp_id:f.camp_id||'', tent:f.tent||'—', phone:f.phone1||'—', fam:f.head_name||'—' }
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
        <button onClick={()=>exportXLSX(women.map((w,i)=>({'#':i+1,'الخيمة':w.tent,'الاسم':w.name,'رقم الهوية':w.national_id||'','العمر':w.age??'','الصلة':w.type,'الحالة':w.marital,'الوضع':w.status,'أمراض مزمنة':w.chronic,'الجوال':w.phone,'المخيم':w.camp,'رب الأسرة':w.fam})),'النساء','سجل_النساء')} className="text-xs text-accent font-bold">📥 Excel</button>
      </div>
      <div className="flex flex-col gap-1.5">
        {women.map(w=>(
          <div key={w.id} className="bg-surface border border-border rounded-xl p-3">
            <div className="font-bold text-white text-sm">{w.name} <span className="text-muted text-xs font-normal">({w.type})</span></div>
            <div className="text-muted text-xs">{w.age??'—'} سنة • {w.marital} {w.status?`• 🔸${w.status}`:''}</div>
            {w.chronic && <div className="text-accent text-[10px] mt-0.5">🩺 {w.chronic}</div>}
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
  const navigate  = useNavigate()
  const campMap   = Object.fromEntries(camps.map(c=>[c.id,c.name]))
  const famMap    = Object.fromEntries(families.map(f=>[f.id,f]))
  const [type,   setType]   = useState('all')
  const [search, setSearch] = useState('')

  const TYPES = [
    {key:'all',        label:'الكل',        icon:'🏥', fField:null,                    mField:null             },
    {key:'chronic',    label:'أمراض مزمنة', icon:'💊', fField:'head_chronic_diseases', mField:'chronic_diseases'},
    {key:'disability', label:'إعاقات',      icon:'♿', fField:'head_disabilities',     mField:'disabilities'   },
    {key:'injury',     label:'إصابات',      icon:'🩹', fField:'head_injuries',         mField:'injuries'       },
  ]

  const records = [
    // رب الأسرة
    ...families.flatMap(f => {
      const rows = []
      const t = TYPES.find(t=>t.key===type)
      if (type === 'all') {
        if (f.head_chronic_diseases?.trim())
          rows.push({key:'chronic',    label:'أمراض مزمنة', val:f.head_chronic_diseases})
        if (f.head_disabilities?.trim())
          rows.push({key:'disability', label:'إعاقة',        val:f.head_disabilities})
        if (f.head_injuries?.trim())
          rows.push({key:'injury',     label:'إصابة',        val:f.head_injuries})
      } else {
        const val = f[t?.fField]
        if (val?.trim()) rows.push({key:type, label:t?.label||'', val})
      }
      return rows.map(r=>({
        uid:       'f-'+f.id+r.key,
        famId:     f.id,
        name:      f.head_name,
        role:      'رب الأسرة',
        national_id: f.head_id||'—',
        phone:     f.phone1||'—',
        healthType:r.label,
        val:       r.val,
        camp:      campMap[f.camp_id]||'—',
        camp_id:   f.camp_id||'',
        tent:      f.tent||'—',
        fam:       f.head_name,
      }))
    }),
    // الأفراد
    ...members.flatMap(m => {
      const fam = famMap[m.family_id] || {}
      const rows = []
      if (type === 'all') {
        if (m.chronic_diseases?.trim())
          rows.push({key:'chronic',    label:'أمراض مزمنة', val:m.chronic_diseases})
        if (m.disabilities?.trim())
          rows.push({key:'disability', label:'إعاقة',        val:m.disabilities})
        if (m.injuries?.trim())
          rows.push({key:'injury',     label:'إصابة',        val:m.injuries})
      } else {
        const t = TYPES.find(t=>t.key===type)
        const val = m[t?.mField]
        if (val?.trim()) rows.push({key:type, label:t?.label||'', val})
      }
      return rows.map(r=>({
        uid:       'm-'+m.id+r.key,
        famId:     fam.id,
        name:      m.name||'—',
        role:      m.relation||'فرد',
        national_id: m.national_id||'—',
        phone:     fam.phone1||'—',
        healthType:r.label,
        val:       r.val,
        camp:      campMap[fam.camp_id]||'—',
        camp_id:   fam.camp_id||'',
        tent:      fam.tent||'—',
        fam:       fam.head_name||'—',
      }))
    }),
  ]
  .filter(r => {
    if (filterCamp && r.camp_id !== filterCamp) return false
    if (search && !r.name?.includes(search) && !r.val?.includes(search) && !r.fam?.includes(search)) return false
    return true
  })
  .sort((a,b) => (a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true}))

  const TYPE_COLORS = {
    chronic:'text-accent bg-accent/10', disability:'text-blue bg-blue/10', injury:'text-red bg-red/10'
  }

  return (
    <div>
      {/* فلاتر النوع */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {TYPES.map(t=>(
          <button key={t.key} onClick={()=>setType(t.key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border transition-all ${
              type===t.key?'bg-accent text-bg border-accent':'bg-surface text-muted border-border'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <input value={search} onChange={e=>setSearch(e.target.value)}
        placeholder="🔍 ابحث باسم أو حالة..."
        className="w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent mb-2"/>

      <div className="flex justify-between items-center mb-2">
        <span className="text-muted text-xs">{records.length} حالة</span>
        <button onClick={()=>exportXLSX(
          records.map((r,i)=>({'#':i+1,'الخيمة':r.tent,'الاسم':r.name,'الصلة':r.role,'الهوية':r.national_id,'الجوال':r.phone,'النوع':r.healthType,'الحالة':r.val,'رب الأسرة':r.fam,'المخيم':r.camp})),
          'الصحة','سجل_الصحة'
        )} className="text-xs text-accent font-bold">📥 Excel</button>
      </div>

      <div className="flex flex-col gap-2">
        {records.map(r=>(
          <div key={r.uid}
            onClick={()=>r.famId&&navigate(`/families/edit/${r.famId}`)}
            className="bg-surface border border-border rounded-xl p-3 cursor-pointer active:scale-[0.99]">

            {/* الاسم والصلة */}
            <div className="flex justify-between items-start mb-1.5">
              <div>
                <span className="font-black text-white text-sm">{r.name}</span>
                <span className="text-muted text-xs mr-1">({r.role})</span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${TYPE_COLORS[r.key]||'text-muted'}`}>
                {r.healthType}
              </span>
            </div>

            {/* الحالة الصحية */}
            <div className="bg-surface2 rounded-lg px-2 py-1.5 text-xs text-white mb-2">
              {r.val}
            </div>

            {/* بيانات الأسرة */}
            <div className="grid grid-cols-2 gap-x-3 text-[10px] text-muted">
              <span>👨‍👩‍👧 {r.fam}</span>
              <span>📞 {r.phone}</span>
              <span>🪪 {r.national_id}</span>
              <span>⛺{r.tent} 🏕️{r.camp}</span>
            </div>

            <div className="text-accent text-[10px] mt-1.5">← اضغط للانتقال للأسرة</div>
          </div>
        ))}
        {records.length===0&&<p className="text-muted text-center py-8">لا توجد حالات صحية مسجّلة</p>}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// تبويب التوزيعات
// ════════════════════════════════════════════════════════════
function DistTab({ families, camps, showToast }) {
  const [rounds, setRounds] = useState([])
  const [selected, setSelected] = useState(null)
  const [details, setDetails] = useState([])
  const [loading, setLoading] = useState(true)
  const campMap = Object.fromEntries(camps.map(c=>[c.id,c.name]))
  const { query } = useLocalDB()

  useEffect(()=>{
    async function load() {
      setLoading(true)
      try {
        const rounds2 = await query('dist_rounds',{org_id:ORG_ID})
        setRounds(rounds2.sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)))
      } catch(e){ showToast('خطأ بتحميل الجولات: '+e.message,true) }
      finally{setLoading(false)}
    }
    load()
  },[])

  async function loadDetails(round) {
    setSelected(round); setLoading(true)
    try {
      const received = await query('camp_dist_families',{distribution_id:round.id})
      const recIds = new Set(received.map(r=>r.family_id))
      const rows = families.map(f=>({
        ...f, camp:campMap[f.camp_id]||'—', received:recIds.has(f.id),
        receivedAt:received.find(r=>r.family_id===f.id)?.received_at||''
      })).sort((a,b)=>(a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true}))
      setDetails(rows)
    } catch(e){ showToast('خطأ بتحميل التفاصيل: '+e.message,true) }
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
                  <div className="text-muted text-xs mt-1">{r.created_at ? new Date(r.created_at).toLocaleDateString('ar') : ''}</div>
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
// تبويب الاحتياجات
// ════════════════════════════════════════════════════════════
const NEEDS_CATS = {
  martyr:      { label:'أسر شهداء',        icon:'🕊️', color:'purple' },
  captive:     { label:'أسر أسرى',         icon:'⛓️', color:'red'    },
  displaced:   { label:'نازحون',           icon:'🏃', color:'orange' },
  orphan:      { label:'أيتام',            icon:'👶', color:'blue'   },
  widow:       { label:'أرامل',            icon:'👩', color:'pink'   },
  special:     { label:'ذوو الاحتياجات',   icon:'♿', color:'green'  },
  chronic:     { label:'أمراض مزمنة',      icon:'💊', color:'yellow' },
  elderly:     { label:'كبار السن',        icon:'👴', color:'gray'   },
}

function NeedsTab({ families, camps, filterCamp }) {
  const campMap = Object.fromEntries(camps.map(c=>[c.id,c.name]))
  const [selCat, setSelCat] = useState('')

  const tagged = families
    .filter(f => filterCamp ? f.camp_id===filterCamp : true)
    .map(f => {
      let tags = []
      try { tags = JSON.parse(f.category_tags||'[]') } catch (e) { console.warn('[needs] تصنيف غير صالح للأسرة', f.id, e.message) }
      if (!Array.isArray(tags)) tags = []
      return { ...f, tags, camp: campMap[f.camp_id]||'—' }
    })
    .filter(f => selCat ? f.tags.includes(selCat) : f.tags.length>0)

  const counts = Object.fromEntries(
    Object.keys(NEEDS_CATS).map(k => [k, families.filter(f=>{
      let t=[]; try{t=JSON.parse(f.category_tags||'[]')}catch(e){console.warn('[needs] تصنيف غير صالح:', e.message)}
      return Array.isArray(t)&&t.includes(k)
    }).length])
  )
  const total = tagged.length

  return (
    <div>
      {/* إحصائيات الفئات */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {Object.entries(NEEDS_CATS).map(([k,v])=>(
          counts[k]>0 && (
            <button key={k} onClick={()=>setSelCat(selCat===k?'':k)}
              className={`flex items-center gap-2 p-2 rounded-xl border text-xs text-right transition-all ${
                selCat===k?'bg-accent/20 border-accent':'bg-surface border-border'
              }`}>
              <span className="text-lg">{v.icon}</span>
              <div>
                <div className="font-black text-white">{counts[k]}</div>
                <div className="text-muted text-[10px]">{v.label}</div>
              </div>
            </button>
          )
        ))}
      </div>

      <div className="flex justify-between items-center mb-2">
        <span className="text-muted text-xs">
          {selCat ? `${NEEDS_CATS[selCat]?.label}: ${total} أسرة` : `الكل: ${total} أسرة`}
        </span>
        {selCat && (
          <button onClick={()=>setSelCat('')} className="text-accent text-xs">✕ إلغاء الفلتر</button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {tagged.map(f=>(
          <div key={f.id} className="bg-surface border border-border rounded-xl p-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-bold text-white text-sm">{f.head_name}</div>
                <div className="text-muted text-xs">⛺{f.tent||'—'} 🏕️{f.camp}</div>
              </div>
              <div className="flex flex-wrap gap-1 justify-end">
                {f.tags.map(t=>(
                  <span key={t} className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-lg">
                    {NEEDS_CATS[t]?.icon} {NEEDS_CATS[t]?.label||t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
        {tagged.length===0&&<p className="text-muted text-center py-8">لا توجد بيانات</p>}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// الصفحة الرئيسية (موحّدة: السجلات + قوائم البيانات)
// ════════════════════════════════════════════════════════════
const TABS = [
  {id:'children', label:'👶 الأطفال'},
  {id:'women',    label:'👩 النساء'},
  {id:'health',   label:'🏥 الصحة'},
  {id:'needs',    label:'📋 الاحتياجات'},
  {id:'dist',     label:'📦 التوزيعات'},
]

export default function RegistersPage() {
  const { showToast } = useApp()
  const { isOwner } = useAuth()
  const { query } = useLocalDB()
  const { getAllowedCampIds, filterLocal } = useDataScope()
  const [tab,        setTab]        = useState('children')
  const [loading,    setLoading]    = useState(true)
  const [families,   setFamilies]   = useState([])
  const [members,    setMembers]    = useState([])
  const [camps,      setCamps]      = useState([])
  const [filterCamp, setFilterCamp] = useState('')

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [famRaw,membersRaw,c] = await Promise.all([
        query('families',{org_id:ORG_ID}),
        query('family_members'),
        query('camps',{org_id:ORG_ID}),
      ])
      const famVisible = visibleFamilies(famRaw, isOwner)
      const campIds = getAllowedCampIds(c)
      const f = filterLocal(famVisible, campIds)
      const famIdSet = new Set(f.map(x => x.id))
      const m = campIds === null ? membersRaw : membersRaw.filter(x => famIdSet.has(x.family_id))
      setFamilies(f); setMembers(m); setCamps(c)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false) }
  }, [])

  useEffect(()=>{ loadAll() },[])

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
          {tab==='needs'     && <NeedsTab    families={families} camps={camps} filterCamp={filterCamp}/>}
          {tab==='dist'      && <DistTab     families={families} camps={camps} showToast={showToast}/>}
        </>
      )}
    </div>
  )
}
