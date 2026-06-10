import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { localDB } from '../../lib/db'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { supabase, ORG_ID } from '../../lib/supabase'
import Card from '../../components/ui/Card'
import StatCard from '../../components/ui/StatCard'
import { processSyncQueue, getSyncStats } from '../../lib/sync'

export default function Dashboard() {
  const [stats,   setStats]   = useState({ families:0, members:0, camps:0 })
  const [sync,    setSync]    = useState({ pending:0, failed:0, conflicts:0 })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const { profile } = useAuth()
  const { online, showToast } = useApp()
  const navigate = useNavigate()

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    setLoading(true)
    try {
      // من المحلي فوراً
      const [fams, camps] = await Promise.all([
        localDB.families.toArray().catch(() => []),
        localDB.camps.count().catch(() => 0),
      ])
      setStats({ families: fams.length, members: 0, camps })

      // إحصائيات الطابور
      const syncData = await getSyncStats()
      setSync(syncData)

      // من السيرفر في الخلفية
      if (navigator.onLine) {
        const [fRes, cRes] = await Promise.all([
          supabase.from('families').select('id', { count:'exact', head:true }).eq('org_id', ORG_ID),
          supabase.from('camps').select('id', { count:'exact', head:true }).eq('org_id', ORG_ID),
        ])
        setStats(s => ({
          ...s,
          families: fRes.count ?? s.families,
          camps:    cRes.count ?? s.camps,
        }))
      }
    } finally { setLoading(false) }
  }

  async function handleSync() {
    if (!online) return showToast('لا يوجد اتصال', true)
    setSyncing(true)
    try {
      const result = await processSyncQueue()
      const syncData = await getSyncStats()
      setSync(syncData)
      if (result.synced > 0)    showToast(`✅ تمت مزامنة ${result.synced} عنصر`)
      else if (!result.synced)  showToast('لا يوجد شيء للمزامنة')
      if (result.conflicts > 0) showToast(`⚠️ ${result.conflicts} تعارض حُل`, true)
      await loadStats()
    } finally { setSyncing(false) }
  }

  const greet = () => {
    const h = new Date().getHours()
    if (h < 12) return 'صباح الخير'
    if (h < 17) return 'مساء الخير'
    return 'مساء النور'
  }

  return (
    <div>
      {/* ترحيب */}
      <div className="mb-5 pt-2">
        <p className="text-muted text-sm">{greet()}،</p>
        <h1 className="text-white font-black text-xl">{profile?.full_name || 'مرحباً'} 👋</h1>
      </div>

      {/* إحصائيات */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard icon="👨‍👩‍👧‍👦" value={loading ? '...' : stats.families}
          label="إجمالي الأسر" color="accent"
          onClick={() => navigate('/families')} />
        <StatCard icon="🏕️" value={loading ? '...' : stats.camps}
          label="المخيمات" color="blue"
          onClick={() => navigate('/camps')} />
      </div>

      {/* حالة الاتصال والمزامنة */}
      <Card title="المزامنة" icon="🔄">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${online ? 'bg-green' : 'bg-red'}`} />
            <span className="text-white text-sm font-bold">
              {online ? 'متصل بالإنترنت' : 'غير متصل — وضع أوف لاين'}
            </span>
          </div>
          {online && (
            <button onClick={handleSync} disabled={syncing}
              className="bg-accent/15 text-accent border border-accent/30 px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-60">
              {syncing ? '⏳ مزامنة...' : '🔄 مزامنة'}
            </button>
          )}
        </div>

        {/* إحصائيات الطابور */}
        <div className="grid grid-cols-3 gap-2">
          {[
            ['⏳ انتظار', sync.pending,   sync.pending>0   ? 'accent' : 'muted'],
            ['❌ فشل',    sync.failed,    sync.failed>0    ? 'red'    : 'muted'],
            ['⚠️ تعارض', sync.conflicts, sync.conflicts>0 ? 'accent' : 'muted'],
          ].map(([l,v,c]) => (
            <div key={l} className="bg-surface2 rounded-xl p-2 text-center">
              <div className={`text-base font-black text-${c}`}>{v}</div>
              <div className="text-muted text-[9px] mt-0.5">{l}</div>
            </div>
          ))}
        </div>

        {!online && (
          <p className="text-muted text-xs mt-3 text-center">
            تعمل البيانات محلياً · ستُزامَن عند الاتصال
          </p>
        )}
      </Card>

      {/* إجراءات سريعة */}
      <Card title="إجراءات سريعة" icon="⚡">
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon:'➕',  label:'إضافة أسرة',    path:'/families/add' },
            { icon:'🏕️',  label:'المخيمات',       path:'/camps' },
            { icon:'📦',  label:'التوزيعات',       path:'/distributions' },
            { icon:'📈',  label:'التقارير',         path:'/analysis' },
            { icon:'🔄',  label:'حركات الأسر',     path:'/movements' },
            { icon:'🔔',  label:'التنبيهات',        path:'/alerts' },
          ].map(a => (
            <button key={a.path} onClick={() => navigate(a.path)}
              className="flex items-center gap-2.5 bg-surface2 border border-border rounded-xl px-3 py-3 text-sm font-bold text-white hover:border-accent/50 active:scale-98 transition-all">
              <span className="text-xl">{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}
