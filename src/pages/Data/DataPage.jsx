import { useState, useEffect } from 'react'
import { supabase, ORG_ID } from '../../lib/supabase'
import { localDB } from '../../lib/db'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'

function calcAge(dob) {
  if (!dob) return null
  const b=new Date(dob),t=new Date()
  let a=t.getFullYear()-b.getFullYear()
  if(t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate()))a--
  return a>=0&&a<120?a:null
}

const COLUMNS = [
  { key:'head_name',   label:'اسم رب الأسرة',    default:true  },
  { key:'head_id',     label:'رقم الهوية',        default:true  },
  { key:'phone1',      label:'الجوال',             default:true  },
  { key:'phone2',      label:'جوال بديل',          default:false },
  { key:'camp_name',   label:'المخيم',             default:true  },
  { key:'tent',        label:'رقم الخيمة',         default:true  },
  { key:'head_gender', label:'الجنس',              default:false },
  { key:'head_marital',label:'الحالة الاجتماعية',  default:false },
  { key:'head_dob',    label:'تاريخ الميلاد',      default:false },
  { key:'head_age',    label:'العمر',              default:false },
  { key:'original_address', label:'العنوان الأصلي',default:false },
  { key:'address_details',  label:'تفاصيل العنوان',default:false },
  { key:'members_count',    label:'عدد الأفراد',   default:true  },
  { key:'notes',       label:'الملاحظات',          default:false },
]

export default function DataPage() {
  const [selCols,   setSelCols]   = useState(COLUMNS.filter(c=>c.default).map(c=>c.key))
  const [exporting, setExporting] = useState(false)
  const [syncing,   setSyncing]   = useState(false)
  const [backing,   setBacking]   = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [pending,   setPending]   = useState([])
  const [dbStats,   setDbStats]   = useState({})
  const [filterCamp, setFilterCamp] = useState('')
  const [camps,     setCamps]     = useState([])

  const { showToast, online } = useApp()
  const { canExport, canImport } = useAuth()

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    const [f,c,m,q] = await Promise.all([
      localDB.families.count().catch(()=>0),
      localDB.camps.count().catch(()=>0),
      localDB.family_members.count().catch(()=>0),
      localDB.sync_queue.where('status').equals('pending').count().catch(()=>0),
    ])
    setDbStats({families:f,camps:c,members:m,pending:q})
    const campsData = await localDB.camps.toArray().catch(()=>[])
    setCamps(campsData)
    const pq = await localDB.sync_queue.where('status').equals('pending').toArray().catch(()=>[])
    setPending(pq)
  }

  async function exportExcel() {
    if (!canExport) return showToast('ليس لديك صلاحية التصدير',true)
    setExporting(true)
    try {
      const [families, camps, members] = await Promise.all([
        localDB.families.toArray().catch(()=>[]),
        localDB.camps.toArray().catch(()=>[]),
        localDB.family_members.toArray().catch(()=>[]),
      ])
      const campMap = Object.fromEntries(camps.map(c=>[c.id,c.name]))
      const memsByFamily = {}
      members.forEach(m=>{ if(!memsByFamily[m.family_id]) memsByFamily[m.family_id]=[]; memsByFamily[m.family_id].push(m) })

      let fams = filterCamp ? families.filter(f=>f.camp_id===filterCamp) : families

      const headers = COLUMNS.filter(c=>selCols.includes(c.key)).map(c=>c.label)
      const rows = fams.map(f=>{
        const mems = memsByFamily[f.id]||[]
        const mc = mems.filter(m=>{
          const mn=(m.name||'').trim(),hn=(f.head_name||'').trim()
          return !['رب الأسرة','head'].includes(m.relation) && !(f.head_id&&m.national_id&&m.national_id.trim()===f.head_id.trim()) && mn!==hn
        }).length
        return COLUMNS.filter(c=>selCols.includes(c.key)).map(c=>{
          switch(c.key){
            case 'camp_name':    return campMap[f.camp_id]||''
            case 'head_age':     return calcAge(f.head_dob)??''
            case 'members_count':return mc+1
            default:             return f[c.key]||''
          }
        })
      })

      const csv = [headers, ...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
      const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href=url; a.download=`families_${new Date().toISOString().slice(0,10)}.csv`
      a.click(); URL.revokeObjectURL(url)
      showToast(`✅ تم تصدير ${fams.length} أسرة`)
    } catch(err) { showToast('خطأ: '+err.message,true) }
    finally { setExporting(false) }
  }

  async function backupJSON() {
    setBacking(true)
    try {
      const [families, camps, members, movements] = await Promise.all([
        localDB.families.toArray().catch(()=>[]),
        localDB.camps.toArray().catch(()=>[]),
        localDB.family_members.toArray().catch(()=>[]),
        localDB.family_movements.toArray().catch(()=>[]),
      ])
      const backup = { version:1, date:new Date().toISOString(), families, camps, members, movements }
      const blob = new Blob([JSON.stringify(backup,null,2)],{type:'application/json'})
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href=url; a.download=`backup_${new Date().toISOString().slice(0,10)}.json`
      a.click(); URL.revokeObjectURL(url)
      showToast(`✅ تم تصدير النسخة الاحتياطية (${families.length} أسرة)`)
    } catch(err) { showToast('خطأ: '+err.message,true) }
    finally { setBacking(false) }
  }

  async function restoreJSON(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!window.confirm('استيراد النسخة الاحتياطية سيُضاف للبيانات الحالية. هل أنت متأكد؟')) return
    setRestoring(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      let count = 0
      if (data.families?.length) { await localDB.families.bulkPut(data.families); count+=data.families.length }
      if (data.camps?.length)    { await localDB.camps.bulkPut(data.camps) }
      if (data.members?.length)  { await localDB.family_members.bulkPut(data.members) }
      await loadStats()
      showToast(`✅ تم استيراد ${count} أسرة`)
    } catch(err) { showToast('خطأ في الملف: '+err.message,true) }
    finally { setRestoring(false); e.target.value='' }
  }

  async function syncFromServer() {
    if (!online) return showToast('يتطلب اتصالاً',true)
    setSyncing(true)
    try {
      const [fRes,cRes,mRes] = await Promise.all([
        supabase.from('families').select('*').eq('org_id',ORG_ID),
        supabase.from('camps').select('*').eq('org_id',ORG_ID),
        supabase.from('org_members').select('*').eq('org_id',ORG_ID),
      ])
      if (fRes.data) await localDB.families.bulkPut(fRes.data)
      if (cRes.data) await localDB.camps.bulkPut(cRes.data)
      if (mRes.data) await localDB.org_members.bulkPut(mRes.data)
      await loadStats()
      showToast(`✅ تمت المزامنة: ${fRes.data?.length||0} أسرة، ${cRes.data?.length||0} مخيم`)
    } catch(err) { showToast('خطأ: '+err.message,true) }
    finally { setSyncing(false) }
  }

  return (
    <div>
      <PageHeader icon="💾" title="استيراد / تصدير البيانات"/>

      {/* إحصائيات محلية */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[['👨‍👩‍👧‍👦','أسرة',dbStats.families||0,'accent'],['👤','فرد',dbStats.members||0,'blue'],['🏕️','مخيم',dbStats.camps||0,'green'],['⏳','معلق',dbStats.pending||0,dbStats.pending>0?'red':'muted']].map(([i,l,v,c])=>(
          <div key={l} className="bg-surface border border-border rounded-xl p-2 text-center">
            <div className={`text-lg font-black text-${c}`}>{v}</div>
            <div className="text-muted text-[9px] mt-0.5">{l}</div>
          </div>
        ))}
      </div>

      {/* تصدير CSV */}
      <Card title="تصدير CSV / Excel" icon="📤">
        <div className="mb-3">
          <label className="text-xs font-bold text-muted block mb-1.5">المخيم</label>
          <select value={filterCamp} onChange={e=>setFilterCamp(e.target.value)}
            className="w-full bg-surface2 border border-border rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-accent">
            <option value="">كل المخيمات</option>
            {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="mb-3">
          <label className="text-xs font-bold text-muted block mb-2">الأعمدة</label>
          <div className="grid grid-cols-2 gap-1.5">
            {COLUMNS.map(col=>(
              <label key={col.key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={selCols.includes(col.key)}
                  onChange={e=>setSelCols(s=>e.target.checked?[...s,col.key]:s.filter(k=>k!==col.key))}
                  className="w-3.5 h-3.5 accent-amber-500"/>
                <span className="text-xs text-white">{col.label}</span>
              </label>
            ))}
          </div>
        </div>
        <button onClick={exportExcel} disabled={exporting||!selCols.length}
          className="w-full bg-green/15 border border-green/30 text-green font-bold py-2.5 rounded-xl text-sm disabled:opacity-60">
          {exporting?'جاري التصدير...':'📥 تصدير CSV'}
        </button>
      </Card>

      {/* نسخة احتياطية */}
      <Card title="النسخة الاحتياطية" icon="💾">
        <p className="text-muted text-xs mb-3">تصدير كامل البيانات بصيغة JSON للحفظ أو النقل</p>
        <div className="flex gap-2">
          <button onClick={backupJSON} disabled={backing}
            className="flex-1 bg-blue/15 border border-blue/30 text-blue font-bold py-2.5 rounded-xl text-sm disabled:opacity-60">
            {backing?'جاري التصدير...':'⬇️ تصدير JSON'}
          </button>
          <label className="flex-1">
            <input type="file" accept=".json" onChange={restoreJSON} className="hidden"/>
            <div className={`text-center bg-accent/15 border border-accent/30 text-accent font-bold py-2.5 rounded-xl text-sm cursor-pointer ${restoring?'opacity-60':''}`}>
              {restoring?'جاري الاستيراد...':'⬆️ استيراد JSON'}
            </div>
          </label>
        </div>
      </Card>

      {/* مزامنة السيرفر */}
      <Card title="مزامنة البيانات" icon="🔄">
        <p className="text-muted text-xs mb-3">جلب أحدث البيانات من السيرفر وتخزينها محلياً</p>
        <button onClick={syncFromServer} disabled={syncing||!online}
          className="w-full bg-accent/15 border border-accent/30 text-accent font-bold py-2.5 rounded-xl text-sm disabled:opacity-60">
          {syncing?'جاري المزامنة...':online?'⬇️ جلب من السيرفر':'لا يوجد اتصال'}
        </button>
      </Card>

      {/* التعديلات المعلقة */}
      {pending.length>0 && (
        <Card title={`التعديلات المعلقة (${pending.length})`} icon="⏳">
          <div className="flex flex-col gap-2">
            {pending.slice(0,10).map(item=>{
              const payload = typeof item.payload==='string'?JSON.parse(item.payload||'{}'):item.payload||{}
              return (
                <div key={item.id} className="bg-surface2 rounded-xl px-3 py-2">
                  <div className="text-white text-xs font-bold">{item.action}</div>
                  <div className="text-muted text-[10px]">{payload.head_name||payload.name||'—'} · {new Date(item.created_at).toLocaleDateString('ar')}</div>
                  {item.error && <div className="text-red text-[10px] mt-0.5">❌ {item.error}</div>}
                </div>
              )
            })}
            {pending.length>10 && <div className="text-muted text-xs text-center">و {pending.length-10} أخرى...</div>}
          </div>
        </Card>
      )}
    </div>
  )
}
