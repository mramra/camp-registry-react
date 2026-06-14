import { useState, useEffect, useCallback } from 'react'
import { supabase, ORG_ID } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { getPowerSync } from '../../lib/powersync'
import PageHeader from '../../components/ui/PageHeader'
import Spinner from '../../components/ui/Spinner'

async function getXLSX() {
  if (window.XLSX) return window.XLSX
  await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s)})
  return window.XLSX
}

const HEALTH_TYPES = [
  { key:'chronic',     label:'أمراض مزمنة',    icon:'🩺', field:'chronic_diseases' },
  { key:'disability',  label:'إعاقات',           icon:'♿', field:'disabilities'     },
  { key:'injury',      label:'إصابات',           icon:'🤕', field:'injuries'         },
]

export default function HealthPage() {
  const { showToast, psReady, psSynced } = useApp()
  const [loading,    setLoading]    = useState(true)
  const [records,    setRecords]    = useState([])
  const [camps,      setCamps]      = useState([])
  const [filterCamp, setFilterCamp] = useState('')
  const [filterType, setFilterType] = useState('chronic')
  const [search,     setSearch]     = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      let families, members, campsData
      if (navigator.onLine) {
        const [fRes,mRes,cRes] = await Promise.all([
          supabase.from('families').select('*').eq('org_id',ORG_ID),
          supabase.from('family_members').select('*'),
          supabase.from('camps').select('id,name').eq('org_id',ORG_ID),
        ])
        families=fRes.data||[]; members=mRes.data||[]; campsData=cRes.data||[]
      } else {
        const db=getPowerSync()
        families  = await db.getAll('SELECT * FROM families WHERE org_id=?',[ORG_ID])
        members   = await db.getAll('SELECT * FROM family_members')
        campsData = await db.getAll('SELECT id,name FROM camps WHERE org_id=?',[ORG_ID])
      }
      setCamps(campsData)
      const campMap = Object.fromEntries(campsData.map(c=>[c.id,c.name]))
      const famMap  = Object.fromEntries(families.map(f=>[f.id,f]))
      const list = []

      // رباب الأسر الذين لديهم مشاكل صحية
      families.forEach(f=>{
        HEALTH_TYPES.forEach(({key,field})=>{
          const val = f[`head_${field}`]||f[field]
          if (val && val.trim()) list.push({
            id:`fam-${f.id}-${key}`, name:f.head_name, national_id:f.head_id,
            type:key, value:val, camp:campMap[f.camp_id]||'—',
            camp_id:f.camp_id||'', tent:f.tent||'—',
            phone:f.phone1||'—', role:'رب الأسرة',
          })
        })
      })

      // الأفراد الذين لديهم مشاكل صحية
      members.forEach(m=>{
        const fam = famMap[m.family_id]||{}
        HEALTH_TYPES.forEach(({key,field})=>{
          const val = m[field]
          if (val && val.trim()) list.push({
            id:`mem-${m.id}-${key}`, name:m.name||'—', national_id:m.national_id||'',
            type:key, value:val, camp:campMap[fam.camp_id]||'—',
            camp_id:fam.camp_id||'', tent:fam.tent||'—',
            phone:fam.phone1||'—', role:m.relation||'فرد',
            fam_name:fam.head_name||'—',
          })
        })
      })

      list.sort((a,b)=>(a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true}))
      setRecords(list)
    } catch(e){ showToast('خطأ: '+e.message,true) }
    finally{ setLoading(false) }
  },[])

  useEffect(()=>{ loadData() },[])
  useEffect(()=>{ if(psReady)  loadData() },[psReady])
  useEffect(()=>{ if(psSynced) loadData() },[psSynced])

  const filtered = records.filter(r=>{
    if (r.type!==filterType) return false
    if (filterCamp && r.camp_id!==filterCamp) return false
    if (search && !r.name?.includes(search)&&!r.value?.includes(search)) return false
    return true
  })

  const stats = HEALTH_TYPES.map(t=>({
    ...t, count: records.filter(r=>r.type===t.key&&(!filterCamp||r.camp_id===filterCamp)).length
  }))

  async function exportExcel() {
    const XLSX = await getXLSX()
    const typeInfo = HEALTH_TYPES.find(t=>t.key===filterType)
    const rows = filtered.map((r,i)=>({
      '#':i+1, 'الخيمة':r.tent, 'الاسم':r.name, 'رقم الهوية':r.national_id,
      'الصلة':r.role, [typeInfo?.label||'الحالة']:r.value,
      'اسم رب الأسرة':r.fam_name||r.name, 'الجوال':r.phone, 'المخيم':r.camp,
    }))
    const ws=XLSX.utils.json_to_sheet(rows)
    ws['!cols']=Object.keys(rows[0]||{}).map(()=>({wch:20}))
    const wb=XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb,ws,typeInfo?.label||'الصحة')
    XLSX.writeFile(wb,`سجل_${typeInfo?.label||'الصحة'}_${new Date().toLocaleDateString('ar-EG').replace(/\//g,'-')}.xlsx`)
    showToast(`✅ ${rows.length} سجل`)
  }

  const SEL="w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none"

  return (
    <div>
      <PageHeader icon="🏥" title="سجل الصحة"/>

      {/* إحصائيات */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {stats.map(s=>(
          <button key={s.key} onClick={()=>setFilterType(s.key)}
            className={`rounded-xl p-3 text-center border transition-all ${
              filterType===s.key?'bg-accent/20 border-accent text-accent':'bg-surface border-border text-muted'
            }`}>
            <div className="text-xl font-black">{s.count}</div>
            <div className="text-xs mt-0.5">{s.icon} {s.label}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 mb-4">
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 ابحث بالاسم أو الحالة..." className={SEL}/>
        <select value={filterCamp} onChange={e=>setFilterCamp(e.target.value)} className={SEL}>
          <option value="">🏕️ كل المخيمات</option>
          {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <button onClick={exportExcel} className="w-full mb-4 py-2.5 rounded-xl text-sm font-black text-bg bg-accent">
        📥 تصدير Excel — {HEALTH_TYPES.find(t=>t.key===filterType)?.label}
      </button>

      {loading ? <div className="flex justify-center py-8"><Spinner/></div>
      : filtered.length===0 ? <p className="text-muted text-center py-8">لا توجد سجلات</p>
      : (
        <div className="flex flex-col gap-1.5">
          {filtered.map(r=>(
            <div key={r.id} className="bg-surface border border-border rounded-xl p-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-white text-sm">{r.name}
                    <span className="text-muted text-xs font-normal mr-1">({r.role})</span>
                  </div>
                  <div className="text-accent text-xs mt-0.5">{r.value}</div>
                  <div className="text-muted text-[10px] mt-0.5">
                    ⛺ {r.tent} • 🏕️ {r.camp}
                    {r.fam_name ? ` • 👨‍👩‍👧 ${r.fam_name}` : ''}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
