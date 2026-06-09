
import { useState, useEffect } from 'react'
import { localDB } from '../../lib/db'
import { useApp } from '../../context/AppContext'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'

export default function Analysis() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const { showToast } = useApp()

  useEffect(() => {
    loadStats()
    // تحديث في الخلفية إذا متصل
    if (navigator.onLine) {
      import('../../lib/supabase').then(({ supabase, ORG_ID }) => {
        supabase.from('families').select('id,status,camp_id').eq('org_id',ORG_ID)
          .then(({data}) => { if(data?.length) { import('../../lib/db').then(({localDB})=>{ try{localDB.families.bulkPut(data)}catch{} loadStats() }) } })
          .catch(()=>{})
      })
    }
  }, [])

  async function loadStats() {
    setLoading(true)
    try {
      const [families, camps] = await Promise.all([
        localDB.families.toArray().catch(() => []),
        localDB.camps.toArray().catch(() => [])
      ])
      const total = families.length
      const byStatus = families.reduce((acc, f) => { acc[f.status] = (acc[f.status]||0)+1; return acc }, {})
      const campMap = Object.fromEntries(camps.map(c => [c.id, c.name]))
      const byCamp = families.reduce((acc, f) => { const n = campMap[f.camp_id]||'—'; acc[n] = (acc[n]||0)+1; return acc }, {})
      const sorted = Object.entries(byCamp).sort((a,b) => b[1]-a[1]).slice(0,10)
      setStats({ total, byStatus, byCamp: sorted, campsCount: camps.length })
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setLoading(false) }
  }

  const STATUS_LABELS = { active:'نشط', inactive:'غير نشط', pending:'معلق', departed:'مغادر' }
  const STATUS_COLORS = { active:'bg-green', inactive:'bg-muted', pending:'bg-accent', departed:'bg-red' }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>

  return (
    <div>
      <PageHeader icon="📈" title="التقارير والتحليلات" />

      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          ['👨‍👩‍👧‍👦', 'الأسر', stats?.total, 'accent'],
          ['🏕️', 'المخيمات', stats?.campsCount, 'blue'],
          ['✅', 'نشط', stats?.byStatus?.active||0, 'green'],
          ['📤', 'مغادر', stats?.byStatus?.departed||0, 'red'],
        ].map(([icon, label, val, color]) => (
          <div key={label} className="bg-surface border border-border rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">{icon}</div>
            <div className={`text-2xl font-black text-${color}`}>{val}</div>
            <div className="text-muted text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>

      <Card title="حالة الأسر" icon="📊">
        {Object.entries(stats?.byStatus||{}).map(([status, count]) => {
          const total = stats?.total || 1
          const pct = Math.round(count/total*100)
          const label = STATUS_LABELS[status] || status
          const barColor = STATUS_COLORS[status] || 'bg-muted'
          return (
            <div key={status} className="mb-3 last:mb-0">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-white font-bold">{label}</span>
                <span className="text-muted">{count} ({pct}%)</span>
              </div>
              <div className="h-2 bg-surface2 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${barColor} transition-all`} style={{width: `${pct}%`}} />
              </div>
            </div>
          )
        })}
      </Card>

      <Card title="الأسر حسب المخيم" icon="🏕️">
        {(stats?.byCamp||[]).map(([camp, count]) => {
          const pct = Math.round(count/(stats?.total||1)*100)
          return (
            <div key={camp} className="mb-3 last:mb-0">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-white font-bold truncate max-w-40">{camp}</span>
                <span className="text-accent font-bold">{count}</span>
              </div>
              <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-accent transition-all" style={{width: `${pct}%`}} />
              </div>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
