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

function calcAge(dob) {
  if (!dob) return null
  const b=new Date(dob),t=new Date()
  let a=t.getFullYear()-b.getFullYear()
  if(t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate()))a--
  return a>=0&&a<120?a:null
}

export default function WomenPage() {
  const { showToast, psReady, psSynced } = useApp()
  const [loading,    setLoading]    = useState(true)
  const [women,      setWomen]      = useState([])
  const [camps,      setCamps]      = useState([])
  const [filterCamp, setFilterCamp] = useState('')
  const [filterType, setFilterType] = useState('')
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
      const campMap  = Object.fromEntries(campsData.map(c=>[c.id,c.name]))
      const famMap   = Object.fromEntries(families.map(f=>[f.id,f]))
      const list = []

      // ربات البيوت (رأس الأسرة أنثى)
      families.filter(f=>f.head_gender==='أنثى').forEach(f=>{
        list.push({
          id:'fam-'+f.id, name:f.head_name, national_id:f.head_id,
          dob:f.head_dob, age:calcAge(f.head_dob),
          camp:campMap[f.camp_id]||'—', camp_id:f.camp_id, tent:f.tent||'—',
          phone:f.phone1||'—', type:'رأس الأسرة',
          marital:f.head_marital||'—',
          female_status:f.head_female_status||'',
          chronic:f.head_chronic_diseases||'',
        })
      })

      // الزوجات والأمهات من الأفراد
      members.filter(m=>m.gender==='أنثى'||['زوجة','أم','ابنة','أخت'].includes(m.relation||'')).forEach(m=>{
        const fam=famMap[m.family_id]||{}
        list.push({
          id:'mem-'+m.id, name:m.name, national_id:m.national_id||'',
          dob:m.dob, age:calcAge(m.dob),
          camp:campMap[fam.camp_id]||'—', camp_id:fam.camp_id||'', tent:fam.tent||'—',
          phone:fam.phone1||'—', type:m.relation||'أنثى',
          marital:'—', female_status:'',
          chronic:m.chronic_diseases||'',
          fam_name:fam.head_name||'—',
        })
      })

      list.sort((a,b)=>(a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true}))
      setWomen(list)
    } catch(e){ showToast('خطأ: '+e.message,true) }
    finally{ setLoading(false) }
  },[])

  useEffect(()=>{ loadData() },[])
  useEffect(()=>{ if(psReady)  loadData() },[psReady])
  useEffect(()=>{ if(psSynced) loadData() },[psSynced])

  const filtered = women.filter(w=>{
    if(filterCamp && w.camp_id!==filterCamp) return false
    if(filterType && w.type!==filterType) return false
    if(search && !w.name?.includes(search)&&!w.national_id?.includes(search)) return false
    return true
  })

  const types = [...new Set(women.map(w=>w.type))]

  // إحصائيات
  const stats = {
    total:    filtered.length,
    heads:    filtered.filter(w=>w.type==='رأس الأسرة').length,
    wives:    filtered.filter(w=>w.type==='زوجة').length,
    pregnant: filtered.filter(w=>w.female_status==='حامل').length,
    nursing:  filtered.filter(w=>w.female_status==='مرضعة').length,
  }

  async function exportExcel() {
    const XLSX = await getXLSX()
    const rows = filtered.map((w,i)=>({
      '#': i+1, 'الخيمة':w.tent, 'الاسم':w.name,
      'رقم الهوية':w.national_id, 'العمر':w.age??'',
      'الصلة':w.type, 'الحالة الاجتماعية':w.marital,
      'الوضع':w.female_status||'', 'أمراض مزمنة':w.chronic,
      'اسم رب الأسرة':w.fam_name||w.name, 'الجوال':w.phone, 'المخيم':w.camp,
    }))
    const ws=XLSX.utils.json_to_sheet(rows)
    ws['!cols']=Object.keys(rows[0]||{}).map(()=>({wch:18}))
    const wb=XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb,ws,'سجل النساء')
    XLSX.writeFile(wb,`سجل_النساء_${new Date().toLocaleDateString('ar-EG').replace(/\//g,'-')}.xlsx`)
    showToast(`✅ ${rows.length} سجل`)
  }

  const SEL="w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none"

  return (
    <div>
      <PageHeader icon="👩" title="سجل النساء" subtitle={`${filtered.length} امرأة`}/>

      <div className="grid grid-cols-2 gap-2 mb-4">
        {[['الإجمالي',stats.total],['ربات البيوت',stats.heads],['الزوجات',stats.wives],
          ['حوامل',stats.pregnant],].map(([l,v])=>(
          <div key={l} className="bg-surface border border-border rounded-xl p-3 text-center">
            <div className="text-2xl font-black text-accent">{v}</div>
            <div className="text-muted text-xs">{l}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 mb-4">
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 ابحث بالاسم أو الهوية..." className={SEL}/>
        <select value={filterCamp} onChange={e=>setFilterCamp(e.target.value)} className={SEL}>
          <option value="">🏕️ كل المخيمات</option>
          {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterType} onChange={e=>setFilterType(e.target.value)} className={SEL}>
          <option value="">📋 كل الصلات</option>
          {types.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <button onClick={exportExcel} className="w-full mb-4 py-2.5 rounded-xl text-sm font-black text-bg bg-accent">
        📥 تصدير Excel
      </button>

      {loading ? <div className="flex justify-center py-8"><Spinner/></div>
      : filtered.length===0 ? <p className="text-muted text-center py-8">لا توجد نتائج</p>
      : (
        <div className="flex flex-col gap-2">
          {filtered.map((w,i)=>(
            <div key={w.id} className="bg-surface border border-border rounded-xl p-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-white text-sm">{w.name}</div>
                  <div className="text-muted text-xs mt-0.5">
                    {w.type} • {w.age??'—'} سنة • {w.marital}
                    {w.female_status ? ` • 🔸${w.female_status}` : ''}
                  </div>
                  <div className="text-muted text-xs">🏕️ {w.camp} • ⛺ {w.tent}</div>
                  {w.chronic && <div className="text-red text-[10px]">🏥 {w.chronic}</div>}
                </div>
                <span className="text-accent text-xs font-bold">{w.type}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
