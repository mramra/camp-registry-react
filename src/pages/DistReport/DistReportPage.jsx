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

export default function DistReportPage() {
  const { showToast, psReady, psSynced } = useApp()
  const [loading,  setLoading]  = useState(true)
  const [rounds,   setRounds]   = useState([])
  const [selected, setSelected] = useState(null)
  const [details,  setDetails]  = useState([])
  const [camps,    setCamps]    = useState([])
  const [filterCamp, setFilterCamp] = useState('')

  const loadRounds = useCallback(async () => {
    setLoading(true)
    try {
      let rounds2, camps2
      if (navigator.onLine) {
        const [rRes,cRes] = await Promise.all([
          supabase.from('dist_rounds').select('*').eq('org_id',ORG_ID).order('created_at',{ascending:false}),
          supabase.from('camps').select('id,name').eq('org_id',ORG_ID),
        ])
        rounds2=rRes.data||[]; camps2=cRes.data||[]
      } else {
        const db=getPowerSync()
        rounds2 = await db.getAll('SELECT * FROM dist_rounds WHERE org_id=? ORDER BY created_at DESC',[ORG_ID])
        camps2  = await db.getAll('SELECT id,name FROM camps WHERE org_id=?',[ORG_ID])
      }
      setRounds(rounds2); setCamps(camps2)
    } catch(e){ showToast('خطأ: '+e.message,true) }
    finally{ setLoading(false) }
  },[])

  useEffect(()=>{ loadRounds() },[])
  useEffect(()=>{ if(psReady)  loadRounds() },[psReady])
  useEffect(()=>{ if(psSynced) loadRounds() },[psSynced])

  async function loadDetails(round) {
    setSelected(round); setLoading(true)
    try {
      let dists, received, families, members
      if (navigator.onLine) {
        const [dRes,rRes,fRes,mRes] = await Promise.all([
          supabase.from('camp_distributions').select('*').eq('round_id',round.id),
          supabase.from('camp_dist_families').select('*'),
          supabase.from('families').select('id,head_name,head_id,phone1,camp_id,tent').eq('org_id',ORG_ID),
          supabase.from('family_members').select('family_id').select('family_id,id'),
        ])
        dists=dRes.data||[]; received=rRes.data||[]
        families=fRes.data||[]; members=mRes.data||[]
      } else {
        const db=getPowerSync()
        dists    = await db.getAll('SELECT * FROM camp_distributions WHERE round_id=?',[round.id])
        received = await db.getAll('SELECT * FROM camp_dist_families')
        families = await db.getAll('SELECT id,head_name,head_id,phone1,camp_id,tent FROM families WHERE org_id=?',[ORG_ID])
        members  = await db.getAll('SELECT family_id,id FROM family_members')
      }
      const campMap  = Object.fromEntries(camps.map(c=>[c.id,c.name]))
      const famMap   = Object.fromEntries(families.map(f=>[f.id,f]))
      const memCount = {}
      members.forEach(m=>{ memCount[m.family_id]=(memCount[m.family_id]||0)+1 })
      const receivedIds = new Set(received.map(r=>r.family_id))

      let famsToShow = families
      if (filterCamp) famsToShow = families.filter(f=>f.camp_id===filterCamp)

      const rows = famsToShow.map(f=>({
        ...f,
        camp: campMap[f.camp_id]||'—',
        members: (memCount[f.id]||0)+1,
        received: receivedIds.has(f.id),
        receivedAt: received.find(r=>r.family_id===f.id)?.received_at||'',
      })).sort((a,b)=>(a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true}))

      setDetails(rows)
    } catch(e){ showToast('خطأ: '+e.message,true) }
    finally{ setLoading(false) }
  }

  async function exportExcel() {
    if (!details.length) return
    const XLSX = await getXLSX()
    const campLabel = filterCamp ? camps.find(c=>c.id===filterCamp)?.name||'' : 'كل_المخيمات'
    const rows = details.map((f,i)=>({
      '#':i+1, 'الخيمة':f.tent||'—', 'اسم رب الأسرة':f.head_name,
      'رقم الهوية':f.head_id, 'الجوال':f.phone1,
      'المخيم':f.camp, 'عدد الأفراد':f.members,
      'استلم':f.received?'✅':'❌',
      'تاريخ الاستلام':f.receivedAt?new Date(f.receivedAt).toLocaleDateString('ar-EG'):'',
    }))
    const ws=XLSX.utils.json_to_sheet(rows)
    ws['!cols']=Object.keys(rows[0]||{}).map(()=>({wch:18}))
    const wb=XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb,ws,'التوزيع')
    XLSX.writeFile(wb,`توزيع_${selected?.name||''}_${campLabel}.xlsx`)
    showToast(`✅ ${rows.length} أسرة`)
  }

  const recv  = details.filter(d=>d.received).length
  const total = details.length
  const pct   = total ? Math.round(recv/total*100) : 0

  const SEL="w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none mb-2"

  return (
    <div>
      <PageHeader icon="📦" title="تقرير التوزيعات"/>

      {!selected ? (
        <div className="flex flex-col gap-2">
          {loading && <div className="flex justify-center py-8"><Spinner/></div>}
          {rounds.map(r=>(
            <div key={r.id} onClick={()=>loadDetails(r)}
              className="bg-surface border border-border rounded-xl p-4 cursor-pointer active:scale-[0.98]">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-white">{r.name}</div>
                  <div className="text-muted text-xs mt-1">{r.description||''}</div>
                  <div className="text-muted text-xs">{r.start_date||''}</div>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                  r.status==='active'?'bg-green/20 text-green':
                  r.status==='completed'?'bg-blue/20 text-blue':'bg-surface2 text-muted'
                }`}>{r.status==='active'?'نشط':r.status==='completed'?'مكتمل':r.status}</span>
              </div>
            </div>
          ))}
          {!loading&&rounds.length===0&&<p className="text-muted text-center py-8">لا توجد جولات توزيع</p>}
        </div>
      ) : (
        <div>
          <button onClick={()=>setSelected(null)} className="text-accent text-sm mb-3">← رجوع</button>
          <h2 className="font-black text-white text-base mb-3">{selected.name}</h2>

          {/* إحصائيات التوزيع */}
          <div className="bg-surface border border-border rounded-xl p-4 mb-4">
            <div className="flex justify-between mb-2">
              <span className="text-muted text-sm">نسبة الاستلام</span>
              <span className="text-accent font-black">{pct}%</span>
            </div>
            <div className="w-full bg-surface2 rounded-full h-3">
              <div className="bg-accent h-3 rounded-full transition-all" style={{width:`${pct}%`}}/>
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted">
              <span>✅ استلم: {recv}</span>
              <span>❌ لم يستلم: {total-recv}</span>
              <span>الإجمالي: {total}</span>
            </div>
          </div>

          <select value={filterCamp} onChange={e=>{setFilterCamp(e.target.value);loadDetails(selected)}} className={SEL}>
            <option value="">🏕️ كل المخيمات</option>
            {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <button onClick={exportExcel} className="w-full mb-4 py-2.5 rounded-xl text-sm font-black text-bg bg-accent">
            📥 تصدير Excel
          </button>

          {loading ? <div className="flex justify-center py-4"><Spinner/></div>
          : (
            <div className="flex flex-col gap-1.5">
              {details.map((f,i)=>(
                <div key={f.id} className="flex items-center gap-3 bg-surface border border-border rounded-xl px-3 py-2">
                  <span className={`text-lg ${f.received?'text-green':'text-red'}`}>{f.received?'✅':'❌'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm truncate">{f.head_name}</div>
                    <div className="text-muted text-xs">⛺ {f.tent} • 👥 {f.members} أفراد • {f.camp}</div>
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
