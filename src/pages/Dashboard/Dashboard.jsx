import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { localDB } from '../../lib/db'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { supabase, ORG_ID } from '../../lib/supabase'
import { processSyncQueue, getSyncStats } from '../../lib/sync'
import Card from '../../components/ui/Card'
import StatCard from '../../components/ui/StatCard'

const REQUIRED = ['head_name','head_id','phone1','camp_id']

export default function Dashboard() {
  const [stats,   setStats]   = useState({ families:0, members:0, camps:0, incomplete:0 })
  const [sync,    setSync]    = useState({ pending:0, failed:0, conflicts:0 })
  const [campInfo,setCampInfo]= useState(null)
  const [recent,  setRecent]  = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const { profile, isCampDelegate, isOwner, isSuperAdmin } = useAuth()
  const { online, showToast } = useApp()
  const navigate = useNavigate()

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    // عرض Dexie فوراً بدون setLoading(true) أولاً
    try {
      const [families, camps, members] = await Promise.all([
        localDB.families.toArray().catch(()=>[]),
        localDB.camps.toArray().catch(()=>[]),
        localDB.family_members.toArray().catch(()=>[]),
      ])
      applyStats(families, camps, members)
      setLoading(false)

      // ثم تحديث من السيرفر في الخلفية
      if (!navigator.onLine) return
      const [fRes, cRes] = await Promise.all([
        supabase.from('families').select('*').eq('org_id', ORG_ID).limit(1000),
        supabase.from('camps').select('*').eq('org_id', ORG_ID),
      ])
      const fams  = !fRes.error  && fRes.data  ? fRes.data  : families
      const camps2 = !cRes.error && cRes.data  ? cRes.data  : camps
      if (fams.length)   try { await localDB.families.bulkPut(fams)   } catch {}
      if (camps2.length) try { await localDB.camps.bulkPut(camps2)    } catch {}
      applyStats(fams, camps2, members)

    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  function applyStats(families, camps, members) {
    const incomplete = families.filter(f => REQUIRED.some(k => !f[k]?.toString().trim())).length
    setStats({
      families: families.length,
      members:  families.length + members.length,
      camps:    camps.length,
      incomplete,
    })
    const sorted = [...families]
      .sort((a,b) => new Date(b.updated_at||0) - new Date(a.updated_at||0))
      .slice(0, 5)
    const campMap = Object.fromEntries(camps.map(c=>[c.id,c.name]))
    setRecent(sorted.map(f=>({...f, campName: campMap[f.camp_id]||'—'})))
    if (isCampDelegate && profile?.camp_id) {
      const camp = camps.find(c=>c.id===profile.camp_id)
      if (camp) {
        const campFams = families.filter(f=>f.camp_id===camp.id)
        setCampInfo({
          ...camp,
          familiesCount: campFams.length,
          membersCount:  campFams.length + members.filter(m=>campFams.some(f=>f.id===m.family_id)).length
        })
      }
    }
    getSyncStats().then(setSync).catch(()=>{})
  }

  async function handleSync() {
    if (!online) return showToast('لا يوجد اتصال', true)
    setSyncing(true)
    try {
      const r = await processSyncQueue()
      const sd = await getSyncStats()
      setSync(sd)
      if (r.synced > 0)    showToast(`✅ تمت مزامنة ${r.synced} عنصر`)
      if (r.conflicts > 0) showToast(`⚠️ ${r.conflicts} تعارض حُل`, true)
      if (!r.synced && !r.conflicts) showToast('لا يوجد شيء للمزامنة')
      await loadStats()
    } finally { setSyncing(false) }
  }

  const greet = () => {
    const h = new Date().getHours()
    return h < 12 ? 'صباح الخير' : h < 17 ? 'مساء الخير' : 'مساء النور'
  }

  return (
    <div>
      {/* ترحيب */}
      <div className="mb-5 pt-1">
        <p className="text-muted text-sm">{greet()}،</p>
        <h1 className="text-white font-black text-xl">{profile?.full_name||'مرحباً'} 👋</h1>
      </div>

      {/* بطاقة مخيم المندوب */}
      {campInfo && (
        <div className="bg-gradient-to-r from-accent/10 to-transparent border border-accent/30 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center text-xl">⛺</div>
            <div>
              <div className="font-black text-accent text-base">{campInfo.name}</div>
              {campInfo.address && <div className="text-muted text-xs">{campInfo.address}</div>}
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <div className="text-center">
              <div className="font-black text-white text-lg">{campInfo.familiesCount}</div>
              <div className="text-muted text-[10px]">أسرة</div>
            </div>
            <div className="text-center">
              <div className="font-black text-white text-lg">{campInfo.membersCount}</div>
              <div className="text-muted text-[10px]">فرد</div>
            </div>
            {campInfo.capacity > 0 && (
              <div className="text-center">
                <div className={`font-black text-lg ${campInfo.familiesCount/campInfo.capacity>0.9?'text-red':'text-green'}`}>
                  {Math.round(campInfo.familiesCount/campInfo.capacity*100)}%
                </div>
                <div className="text-muted text-[10px]">إشغال</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* إحصائيات — تظهر فوراً من Dexie */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard icon="👨‍👩‍👧‍👦" value={loading ? '—' : stats.families}  label="إجمالي الأسر"    color="accent" onClick={()=>navigate('/families')}/>
        <StatCard icon="👤"         value={loading ? '—' : stats.members}   label="إجمالي الأفراد" color="blue"   onClick={()=>navigate('/families')}/>
        <StatCard icon="🏕️"         value={loading ? '—' : stats.camps}     label="المخيمات"       color="green"  onClick={()=>navigate('/camps')}/>
        <StatCard icon="⚠️"         value={loading ? '—' : stats.incomplete} label="بيانات ناقصة"  color={stats.incomplete>0?'red':'muted'} onClick={()=>navigate('/families')}/>
      </div>

      {/* المزامنة */}
      <Card title="المزامنة" icon="🔄">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${online?'bg-green':'bg-red'}`}/>
            <span className="text-white text-sm font-bold">{online?'متصل':'أوف لاين'}</span>
          </div>
          {online && (
            <button onClick={handleSync} disabled={syncing}
              className="bg-accent/15 text-accent border border-accent/30 px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-60">
              {syncing ? '⏳ مزامنة...' : '🔄 مزامنة'}
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['⏳ انتظار', sync.pending,   sync.pending   > 0 ? 'accent' : 'muted'],
            ['❌ فشل',    sync.failed,    sync.failed    > 0 ? 'red'    : 'muted'],
            ['⚠️ تعارض', sync.conflicts, sync.conflicts > 0 ? 'accent' : 'muted'],
          ].map(([l,v,c]) => (
            <div key={l} className="bg-surface2 rounded-xl p-2 text-center">
              <div className={`text-base font-black text-${c}`}>{v}</div>
              <div className="text-muted text-[9px] mt-0.5">{l}</div>
            </div>
          ))}
        </div>
        {!online && <p className="text-muted text-xs mt-2 text-center">تعمل البيانات محلياً · ستُزامَن عند الاتصال</p>}
      </Card>

      {/* آخر الأسر */}
      {recent.length > 0 && (
        <Card title="آخر الأسر المضافة" icon="📋">
          <div className="flex flex-col gap-2">
            {recent.map(f => (
              <div key={f.id} onClick={() => navigate('/families')}
                className="flex items-center justify-between bg-surface2 rounded-xl px-3 py-2.5 cursor-pointer active:scale-98">
                <div>
                  <div className="text-white text-xs font-bold">{f.head_name}</div>
                  <div className="text-muted text-[10px]">🏕️ {f.campName}</div>
                </div>
                <div className="text-muted text-[10px]">👥 {f.members_count||1}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* إجراءات سريعة */}
      <Card title="إجراءات سريعة" icon="⚡">
        <div className="grid grid-cols-2 gap-2">
          {[
            {icon:'➕', label:'إضافة أسرة',  path:'/families/add'},
            {icon:'🏕️', label:'المخيمات',    path:'/camps'},
            {icon:'📦', label:'التوزيعات',   path:'/distributions'},
            {icon:'📈', label:'التقارير',    path:'/analysis'},
            {icon:'🔄', label:'حركات الأسر', path:'/movements'},
            {icon:'🔔', label:'التنبيهات',   path:'/alerts'},
          ].map(a => (
            <button key={a.path} onClick={() => navigate(a.path)}
              className="flex items-center gap-2.5 bg-surface2 border border-border rounded-xl px-3 py-3 text-sm font-bold text-white hover:border-accent/50 active:scale-98 transition-all">
              <span className="text-xl">{a.icon}</span>{a.label}
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}
