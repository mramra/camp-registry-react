import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { localDB } from '../../lib/db'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { supabase, ORG_ID } from '../../lib/supabase'
import Card from '../../components/ui/Card'
import StatCard from '../../components/ui/StatCard'
import { processSyncQueue } from '../../lib/sync'

export default function Dashboard() {
  const [stats, setStats]     = useState({ families: 0, members: 0, camps: 0, users: 0 })
  const [pending, setPending] = useState(0)
  const [loading, setLoading] = useState(true)
  const { profile, role }     = useAuth()
  const { online, showToast } = useApp()
  const navigate = useNavigate()

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    setLoading(true)
    try {
      // من الـ local DB أولاً
      const [families, members, camps] = await Promise.all([
        localDB.families.count(),
        localDB.family_members.count(),
        localDB.camps.count(),
      ])
      const pCount = await localDB.sync_queue.where('status').equals('pending').count()
      setPending(pCount)
      setStats(s => ({ ...s, families, members, camps }))

      // إذا متصل، نحدث من السيرفر
      if (online) {
        const [fRes, cRes] = await Promise.all([
          supabase.from('families').select('id', { count: 'exact', head: true }).eq('org_id', ORG_ID),
          supabase.from('camps').select('id', { count: 'exact', head: true }).eq('org_id', ORG_ID),
        ])
        setStats(s => ({
          ...s,
          families: fRes.count ?? s.families,
          camps: cRes.count ?? s.camps,
        }))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function syncNow() {
    if (!online) return showToast('لا يوجد اتصال بالإنترنت', true)
    const result = await processSyncQueue()
    showToast(result.synced > 0 ? `✅ تمت مزامنة ${result.synced} عنصر` : 'لا توجد بيانات للمزامنة')
    loadStats()
  }

  const greet = () => {
    const h = new Date().getHours()
    if (h < 12) return 'صباح الخير'
    if (h < 17) return 'مساء الخير'
    return 'مساء النور'
  }

  return (
    <div>
      {/* Greeting */}
      <div className="mb-5 pt-2">
        <p className="text-muted text-sm">{greet()}،</p>
        <h1 className="text-white font-black text-xl">{profile?.name || 'مرحباً'} 👋</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard icon="👨‍👩‍👧‍👦" value={loading ? '...' : stats.families} label="إجمالي الأسر"   color="accent" onClick={() => navigate('/families')} />
        <StatCard icon="👤"         value={loading ? '...' : stats.members}  label="إجمالي الأفراد" color="green"  onClick={() => navigate('/families')} />
        <StatCard icon="🏕️"         value={loading ? '...' : stats.camps}    label="المخيمات"       color="blue"   onClick={() => navigate('/camps')} />
        <StatCard icon="⏳"         value={loading ? '...' : pending}        label="انتظار مزامنة"  color={pending > 0 ? 'red' : 'muted'} />
      </div>

      {/* حالة الاتصال */}
      <Card title="الحالة" icon="📡">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${online ? 'bg-green' : 'bg-red'}`} />
            <span className="text-sm font-bold text-white">{online ? 'متصل بالإنترنت' : 'غير متصل'}</span>
          </div>
          {online && pending > 0 && (
            <button onClick={syncNow} className="bg-accent/15 text-accent border border-accent/30 px-3 py-1.5 rounded-xl text-xs font-bold">
              مزامنة ({pending})
            </button>
          )}
        </div>
        {!online && (
          <p className="text-muted text-xs mt-2">الوضع الأوف لاين — يمكنك العمل والبيانات ستُزامَن عند الاتصال</p>
        )}
      </Card>

      {/* Quick Actions */}
      <Card title="إجراءات سريعة" icon="⚡">
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: '➕', label: 'إضافة أسرة',   path: '/families/add' },
            { icon: '🏕️', label: 'المخيمات',      path: '/camps' },
            { icon: '📦', label: 'التوزيعات',      path: '/distributions' },
            { icon: '📈', label: 'التقارير',        path: '/analysis' },
            { icon: '🔄', label: 'حركات الأسر',    path: '/movements' },
            { icon: '🔔', label: 'التنبيهات',       path: '/alerts' },
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
