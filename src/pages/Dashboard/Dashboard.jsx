import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { localDB } from '../../lib/db'
import { supabase, ORG_ID } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { processSyncQueue, getSyncStats } from '../../lib/sync'

const REQUIRED = ['head_name','head_id','phone1','camp_id']
function checkIssues(f, mems) {
  const issues = []
  if (!f.head_name?.trim()) issues.push(1)
  if (!f.head_id?.trim())   issues.push(1)
  if (!f.phone1?.trim())    issues.push(1)
  if (!f.camp_id)           issues.push(1)
  const marital = (f.head_marital||'').trim()
  if (marital==='متزوج'||marital==='متزوجة') {
    if (!(mems||[]).some(m=>m.relation==='زوجة'||m.relation==='زوج')) issues.push(1)
  }
  return issues
}
function calcAge(dob) {
  if (!dob) return null
  const b=new Date(dob),t=new Date()
  let a=t.getFullYear()-b.getFullYear()
  if(t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate()))a--
  return a>=0&&a<120?a:null
}

export default function Dashboard() {
  const [stats,    setStats]    = useState(null)
  const [syncInfo, setSyncInfo] = useState({ pending:0, failed:0 })
  const [syncing,  setSyncing]  = useState(false)
  const [loading,  setLoading]  = useState(true)

  const { profile, isSuperAdmin, isOwner, isCampDelegate } = useAuth()
  const { online, showToast } = useApp()
  const navigate = useNavigate()

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    try {
      const [fams, camps, members] = await Promise.all([
        localDB.families.toArray().catch(()=>[]),
        localDB.camps.toArray().catch(()=>[]),
        localDB.family_members.toArray().catch(()=>[]),
      ])
      applyStats(fams, camps, members)
      setLoading(false)
      // مزامنة في الخلفية
      if (navigator.onLine) {
        const [fRes, cRes] = await Promise.all([
          supabase.from('families').select('*').eq('org_id', ORG_ID).limit(1000),
          supabase.from('camps').select('*').eq('org_id', ORG_ID),
        ])
        const f2 = !fRes.error && fRes.data?.length ? fRes.data : fams
        const c2 = !cRes.error && cRes.data?.length ? cRes.data : camps
        if (f2.length) try { await localDB.families.bulkPut(f2) } catch {}
        if (c2.length) try { await localDB.camps.bulkPut(c2) } catch {}
        applyStats(f2, c2, members)
      }
    } catch(e) { console.error(e); setLoading(false) }
  }

  function applyStats(fams, camps, members) {
    const mByFam = {}
    members.forEach(m => { if(!mByFam[m.family_id]) mByFam[m.family_id]=[]; mByFam[m.family_id].push(m) })
    const incomplete = fams.filter(f => checkIssues(f, mByFam[f.id]).length > 0).length
    // فئات عمرية
    const allPersons = [
      ...fams.map(f=>({dob:f.head_dob})),
      ...members.map(m=>({dob:m.dob}))
    ]
    let children=0, adults=0, elderly=0, noAge=0
    allPersons.forEach(p => {
      const age = calcAge(p.dob)
      if (age===null) { noAge++; return }
      if (age<18) children++
      else if (age<60) adults++
      else elderly++
    })
    const total = Math.max(fams.length + members.length, 1)
    // توزيع المخيمات
    const campCount = {}
    fams.forEach(f => { campCount[f.camp_id] = (campCount[f.camp_id]||0)+1 })
    const campBars = camps
      .filter(c => campCount[c.id] > 0)
      .sort((a,b) => (campCount[b.id]||0) - (campCount[a.id]||0))
      .map(c => ({ name:c.name, count:campCount[c.id]||0, pct:Math.round((campCount[c.id]||0)/Math.max(fams.length,1)*100) }))
    setStats({ families:fams.length, members:fams.length+members.length, camps:camps.length, incomplete, children, adults, elderly, noAge, total, campBars })
    getSyncStats().then(setSyncInfo).catch(()=>{})
  }

  async function handleSync() {
    if (!online) return showToast('لا يوجد اتصال', true)
    setSyncing(true)
    try {
      const r = await processSyncQueue()
      if (r.synced > 0)    showToast(`✅ تمت مزامنة ${r.synced} عنصر`)
      if (r.conflicts > 0) showToast(`⚠️ ${r.conflicts} تعارض`, true)
      if (!r.synced && !r.conflicts) showToast('لا يوجد شيء للمزامنة')
      await loadStats()
    } finally { setSyncing(false) }
  }

  const hour = new Date().getHours()
  const greet = hour<12 ? 'صباح الخير' : hour<17 ? 'مساء الخير' : 'مساء النور'

  return (
    <div className="pb-4">
      {/* ترحيب */}
      <div className="mb-4">
        <p className="text-muted text-sm">{greet}،</p>
        <h1 className="text-white font-black text-xl">{profile?.full_name||'مرحباً'} 👋</h1>
      </div>

      {/* إحصائيات رئيسية */}
      <div className="grid grid-cols-2 gap-2 mb-4" style={{gridTemplateColumns:'repeat(2,1fr)'}}>
        {[
          { icon:'👨‍👩‍👧‍👦', label:'الأسر',        value: stats?.families,  color:'#f59e0b', path:'/families' },
          { icon:'👤',       label:'الأفراد',      value: stats?.members,   color:'#3b82f6', path:'/families' },
          { icon:'⛺',       label:'المخيمات',     value: stats?.camps,     color:'#10b981', path:'/camps'    },
          { icon:'⚠️',       label:'بيانات ناقصة', value: stats?.incomplete,color: stats?.incomplete > 0 ? '#ef4444' : '#6b7280', path:'/families' },
        ].map(s => (
          <div key={s.label} onClick={() => navigate(s.path)}
            className="bg-surface border border-border rounded-xl p-3 text-center cursor-pointer active:scale-95 transition-all">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="text-2xl font-black" style={{color:s.color}}>
              {loading ? '—' : (s.value ?? 0)}
            </div>
            <div className="text-muted text-[10px] mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* توزيع المخيمات + الفئات العمرية */}
      {stats && stats.families > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-4" style={{gridTemplateColumns:'1fr 1fr'}}>
          {/* توزيع المخيمات */}
          <div className="bg-surface border border-border rounded-xl p-3">
            <div className="text-accent text-xs font-bold mb-3">📊 توزيع المخيمات</div>
            {stats.campBars.slice(0,5).map(c => (
              <div key={c.name} className="mb-2">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-white truncate max-w-[70px]">{c.name}</span>
                  <span className="text-accent font-bold">{c.count}</span>
                </div>
                <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{width:`${c.pct}%`}}/>
                </div>
              </div>
            ))}
            {stats.campBars.length === 0 && <div className="text-muted text-[10px]">لا بيانات</div>}
          </div>

          {/* الفئات العمرية */}
          <div className="bg-surface border border-border rounded-xl p-3">
            <div className="text-blue text-xs font-bold mb-3">👶 الفئات العمرية</div>
            {[
              { label:'أطفال 0-17',    value:stats.children, color:'#10b981' },
              { label:'بالغون 18-59',  value:stats.adults,   color:'#3b82f6' },
              { label:'كبار 60+',      value:stats.elderly,  color:'#f59e0b' },
            ].map(b => (
              <div key={b.label} className="mb-2">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-white">{b.label}</span>
                  <span className="font-bold" style={{color:b.color}}>{b.value}</span>
                </div>
                <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{width:`${Math.round(b.value/stats.total*100)||0}%`, background:b.color}}/>
                </div>
              </div>
            ))}
            {stats.noAge > 0 && (
              <div className="text-muted text-[9px] mt-1">⚠️ {stats.noAge} بدون تاريخ ميلاد</div>
            )}
          </div>
        </div>
      )}

      {/* المزامنة */}
      <div className="bg-surface border border-border rounded-xl p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{background: online ? '#10b981' : '#ef4444'}}/>
            <span className="text-white text-xs font-bold">{online ? 'متصل' : 'أوف لاين'}</span>
            {(syncInfo.pending > 0 || syncInfo.failed > 0) && (
              <span className="text-[10px] text-accent">• {syncInfo.pending} معلق</span>
            )}
          </div>
          {online && (
            <button onClick={handleSync} disabled={syncing}
              className="text-xs font-bold px-3 py-1.5 rounded-xl border border-accent/40 text-accent disabled:opacity-50"
              style={{background:'rgba(245,158,11,0.1)'}}>
              {syncing ? '⏳ جارٍ...' : '🔄 مزامنة'}
            </button>
          )}
        </div>
        {!online && (
          <p className="text-muted text-[10px]">تعمل البيانات محلياً · ستُزامَن عند الاتصال</p>
        )}
      </div>

      {/* إجراءات سريعة */}
      <div className="bg-surface border border-border rounded-xl p-3 mb-4">
        <div className="text-white text-xs font-bold mb-3">⚡ إجراءات سريعة</div>
        <div className="grid grid-cols-2 gap-2" style={{gridTemplateColumns:'1fr 1fr'}}>
          {[
            { icon:'➕', label:'إضافة أسرة',  path:'/families/add' },
            { icon:'🏕️', label:'المخيمات',    path:'/camps' },
            { icon:'📦', label:'التوزيعات',   path:'/distributions' },
            { icon:'📈', label:'التقارير',    path:'/analysis' },
            { icon:'🔄', label:'حركات الأسر', path:'/movements' },
            { icon:'🔔', label:'التنبيهات',   path:'/alerts' },
          ].map(a => (
            <button key={a.path} onClick={() => navigate(a.path)}
              className="flex items-center gap-2 bg-surface2 border border-border rounded-xl px-3 py-2.5 text-xs font-bold text-white active:scale-95 transition-all">
              <span className="text-lg">{a.icon}</span>{a.label}
            </button>
          ))}
        </div>
      </div>

      {/* إذا لا بيانات */}
      {!loading && stats?.families === 0 && (
        <div className="text-center py-8">
          <div className="text-4xl mb-3">📥</div>
          <div className="text-white font-bold mb-1">لا توجد بيانات محلية</div>
          <div className="text-muted text-xs mb-4">اضغط مزامنة لجلب البيانات من الخادم</div>
          <button onClick={handleSync} disabled={syncing}
            className="font-black px-5 py-2.5 rounded-xl text-sm"
            style={{background:'#f59e0b', color:'#000'}}>
            {syncing ? '⏳ جارٍ الجلب...' : '⬇️ جلب البيانات الآن'}
          </button>
        </div>
      )}
    </div>
  )
}
