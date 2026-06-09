import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { localDB } from '../../lib/db'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import Card from '../../components/ui/Card'
import StatCard from '../../components/ui/StatCard'

export default function Dashboard() {
  const [stats, setStats]   = useState({ families:0, members:0, camps:0, users:0 })
  const [pending, setPending] = useState(0)
  const [loading, setLoading] = useState(true)
  const { profile }         = useAuth()
  const { online, showToast, fullSync, fullSyncing, lastSync } = useApp()
  const navigate = useNavigate()

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    setLoading(true)
    try {
      const [families, members, camps, users, pCount] = await Promise.all([
        localDB.families.count().catch(()=>0),
        localDB.family_members.count().catch(()=>0),
        localDB.camps.count().catch(()=>0),
        localDB.org_members.count().catch(()=>0),
        localDB.sync_queue.where('status').equals('pending').count().catch(()=>0),
      ])
      setStats({ families, members, camps, users })
      setPending(pCount)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  // إعادة تحميل الإحصائيات بعد كل مزامنة
  useEffect(() => { if (!fullSyncing) loadStats() }, [fullSyncing])

  const greet = () => {
    const h = new Date().getHours()
    if (h < 12) return 'صباح الخير'
    if (h < 17) return 'مساء الخير'
    return 'مساء النور'
  }

  const lastSyncText = lastSync
    ? new Date(lastSync).toLocaleString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div>
      {/* ترحيب */}
      <div className="mb-5 pt-2">
        <p className="text-muted text-sm">{greet()}،</p>
        <h1 className="text-white font-black text-xl">{profile?.full_name || profile?.name || 'مرحباً'} 👋</h1>
      </div>

      {/* تنبيه: لا توجد بيانات محلية */}
      {!loading && stats.families === 0 && stats.camps === 0 && (
        <div className="bg-accent/10 border border-accent/30 rounded-2xl p-4 mb-4">
          <div className="text-accent font-black text-sm mb-1">📭 لا توجد بيانات محلية</div>
          <p className="text-muted text-xs mb-3">اضغط زر الجلب ⬇️ في الأعلى لتحميل البيانات من السيرفر</p>
          {online && (
            <button onClick={fullSync} disabled={fullSyncing}
              className="w-full bg-accent text-bg font-black py-2.5 rounded-xl text-sm disabled:opacity-60">
              {fullSyncing ? 'جاري الجلب...' : '⬇️ جلب البيانات الآن'}
            </button>
          )}
        </div>
      )}

      {/* إحصائيات */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard icon="👨‍👩‍👧‍👦" value={loading ? '...' : stats.families} label="إجمالي الأسر"   color="accent" onClick={() => navigate('/families')} />
        <StatCard icon="👤"         value={loading ? '...' : stats.members}  label="إجمالي الأفراد" color="green"  onClick={() => navigate('/families')} />
        <StatCard icon="🏕️"         value={loading ? '...' : stats.camps}    label="المخيمات"       color="blue"   onClick={() => navigate('/camps')} />
        <StatCard icon="👥"         value={loading ? '...' : stats.users}    label="المستخدمون"     color="purple" onClick={() => navigate('/users')} />
      </div>

      {/* حالة الاتصال */}
      <Card title="الحالة" icon="📡">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${online ? 'bg-green' : 'bg-red'}`} />
            <span className="text-sm font-bold text-white">{online ? 'متصل بالإنترنت' : 'وضع أوف لاين'}</span>
          </div>
          {pending > 0 && (
            <span className="text-[10px] bg-accent/15 text-accent border border-accent/30 px-2 py-0.5 rounded-full font-bold">
              {pending} في الانتظار
            </span>
          )}
        </div>
        {lastSyncText && (
          <div className="text-muted text-[10px]">آخر مزامنة: {lastSyncText}</div>
        )}
        {!online && (
          <p className="text-muted text-xs mt-2">تعمل من البيانات المحلية — ستُزامن عند الاتصال</p>
        )}
      </Card>

      {/* إجراءات سريعة */}
      <Card title="إجراءات سريعة" icon="⚡">
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon:'➕', label:'إضافة أسرة',   path:'/families/add' },
            { icon:'🏕️', label:'المخيمات',      path:'/camps' },
            { icon:'📦', label:'التوزيعات',      path:'/distributions' },
            { icon:'📈', label:'التقارير',        path:'/analysis' },
            { icon:'🔄', label:'حركات الأسر',    path:'/movements' },
            { icon:'🔔', label:'التنبيهات',       path:'/alerts' },
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
