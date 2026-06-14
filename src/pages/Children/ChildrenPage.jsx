import { useState, useEffect, useCallback } from 'react'
import { supabase, ORG_ID } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { getPowerSync } from '../../lib/powersync'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'

async function getXLSX() {
  if (window.XLSX) return window.XLSX
  await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s)})
  return window.XLSX
}

function calcAge(dob) {
  if (!dob) return null
  const b=new Date(dob),t=new Date()
  let a=t.getFullYear()-b.getFullYear()
  if(t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate()))a--
  return a>=0&&a<18?a:null
}

const AGE_GROUPS = [
  { label:'رضيع',  min:0,  max:2  },
  { label:'صغير',  min:3,  max:6  },
  { label:'طفل',   min:7,  max:12 },
  { label:'مراهق', min:13, max:17 },
]

export default function ChildrenPage() {
  const { showToast, psReady, psSynced } = useApp()
  const [loading,    setLoading]    = useState(true)
  const [children,   setChildren]   = useState([])
  const [camps,      setCamps]      = useState([])
  const [filterCamp, setFilterCamp] = useState('')
  const [filterAge,  setFilterAge]  = useState('')
  const [search,     setSearch]     = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      let members, families, campsData
      if (navigator.onLine) {
        const [mRes, fRes, cRes] = await Promise.all([
          supabase.from('family_members').select('*'),
          supabase.from('families').select('id,head_name,head_id,phone1,camp_id,tent').eq('org_id',ORG_ID),
          supabase.from('camps').select('id,name').eq('org_id',ORG_ID),
        ])
        members = mRes.data||[]; families = fRes.data||[]; campsData = cRes.data||[]
      } else {
        const db = getPowerSync()
        members   = await db.getAll('SELECT * FROM family_members')
        families  = await db.getAll('SELECT id,head_name,head_id,phone1,camp_id,tent FROM families WHERE org_id=?',[ORG_ID])
        campsData = await db.getAll('SELECT id,name FROM camps WHERE org_id=?',[ORG_ID])
      }
      setCamps(campsData)
      const famMap = Object.fromEntries(families.map(f=>[f.id,f]))
      const campMap = Object.fromEntries(campsData.map(c=>[c.id,c.name]))
      const kids = members
        .filter(m => { const a=calcAge(m.dob); return a !== null })
        .map(m => {
          const fam = famMap[m.family_id]||{}
          const age = calcAge(m.dob)
          return {
            ...m, age,
            fam_name: fam.head_name||'—',
            head_id:  fam.head_id||'—',
            phone:    fam.phone1||'—',
            camp_id:  fam.camp_id||'',
            camp:     campMap[fam.camp_id]||'—',
            tent:     fam.tent||'—',
          }
        })
        .sort((a,b) => (a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true}))
      setChildren(kids)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false) }
  }, [])

  useEffect(()=>{ loadData() },[])
  useEffect(()=>{ if(psReady)  loadData() },[psReady])
  useEffect(()=>{ if(psSynced) loadData() },[psSynced])

  const filtered = children.filter(c => {
    if (filterCamp && c.camp_id !== filterCamp) return false
    if (filterAge) {
      const g = AGE_GROUPS.find(g=>g.label===filterAge)
      if (g && (c.age < g.min || c.age > g.max)) return false
    }
    if (search) {
      const s = search.toLowerCase()
      return c.name?.includes(search)||c.national_id?.includes(search)||c.fam_name?.includes(search)
    }
    return true
  })

  const byGroup = AGE_GROUPS.map(g=>({
    ...g, count: children.filter(c=>c.camp_id===(filterCamp||c.camp_id)&&c.age>=g.min&&c.age<=g.max).length
  }))

  async function exportExcel() {
    const XLSX = await getXLSX()
    const rows = filtered.map((c,i)=>({
      '#': i+1,
      'الخيمة': c.tent,
      'اسم الطفل': c.name,
      'رقم هويته': c.national_id||'',
      'العمر (سنة)': c.age??'',
      'صلة القرابة': c.relation||'',
      'الجنس': c.gender||'',
      'يتيم': c.orphan_status?'نعم':'',
      'الصحة': c.health||'',
      'الأمراض': c.chronic_diseases||'',
      'اسم رب الأسرة': c.fam_name,
      'هوية رب الأسرة': c.head_id,
      'الجوال': c.phone,
      'المخيم': c.camp,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = Object.keys(rows[0]||{}).map(()=>({wch:18}))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb,ws,'سجل الأطفال')
    XLSX.writeFile(wb,`سجل_الأطفال_${new Date().toLocaleDateString('ar-EG').replace(/\//g,'-')}.xlsx`)
    showToast(`✅ تم تصدير ${rows.length} طفل`)
  }

  const SEL = "w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
  const INP = SEL

  return (
    <div>
      <PageHeader icon="👶" title="سجل الأطفال" subtitle={`${filtered.length} طفل`} />

      {/* إحصائيات سريعة */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {byGroup.map(g=>(
          <div key={g.label} className="bg-surface border border-border rounded-xl p-3 text-center">
            <div className="text-2xl font-black text-accent">{g.count}</div>
            <div className="text-muted text-xs">{g.label} ({g.min}-{g.max})</div>
          </div>
        ))}
      </div>

      {/* فلاتر */}
      <div className="flex flex-col gap-2 mb-4">
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 ابحث باسم الطفل أو الهوية..."
          className={INP}/>
        <select value={filterCamp} onChange={e=>setFilterCamp(e.target.value)} className={SEL}>
          <option value="">🏕️ كل المخيمات</option>
          {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterAge} onChange={e=>setFilterAge(e.target.value)} className={SEL}>
          <option value="">🎂 كل الأعمار</option>
          {AGE_GROUPS.map(g=><option key={g.label} value={g.label}>{g.label} ({g.min}-{g.max})</option>)}
        </select>
      </div>

      <button onClick={exportExcel} className="w-full mb-4 py-2.5 rounded-xl text-sm font-black text-bg bg-accent">
        📥 تصدير Excel
      </button>

      {loading ? <div className="flex justify-center py-8"><Spinner/></div>
      : filtered.length===0 ? <p className="text-muted text-center py-8">لا توجد نتائج</p>
      : (
        <div className="flex flex-col gap-2">
          {filtered.map((child,i)=>(
            <div key={child.id||i} className="bg-surface border border-border rounded-xl p-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-white text-sm">{child.name}</div>
                  <div className="text-muted text-xs mt-0.5">
                    {child.age} سنة • {child.relation||''} • {child.gender||''}
                    {child.orphan_status ? ' • 🔸 يتيم' : ''}
                  </div>
                  <div className="text-muted text-xs mt-0.5">
                    👨‍👩‍👧 {child.fam_name} | 🏕️ {child.camp} | ⛺ {child.tent}
                  </div>
                  {child.health && <div className="text-muted text-[10px] mt-0.5">🏥 {child.health}</div>}
                </div>
                <div className="text-accent font-black text-lg">{child.age}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
