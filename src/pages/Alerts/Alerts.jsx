
import { useState, useEffect } from 'react'
import { supabase, ORG_ID } from '../../lib/supabase'
import { localDB } from '../../lib/db'
import { useApp } from '../../context/AppContext'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'
import Badge from '../../components/ui/Badge'

export default function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const { showToast, online } = useApp()

  useEffect(() => { loadAlerts() }, [])

  async function loadAlerts() {
    setLoading(true)
    try {
      const families = await localDB.families.toArray().catch(() => [])
      const camps = await localDB.camps.toArray().catch(() => [])
      const campMap = Object.fromEntries(camps.map(c => [c.id, c]))
      const newAlerts = []

      // فحص مخيمات ممتلئة
      const campCounts = {}
      families.forEach(f => { campCounts[f.camp_id] = (campCounts[f.camp_id]||0)+1 })
      camps.forEach(camp => {
        if (camp.capacity > 0) {
          const count = campCounts[camp.id] || 0
          const pct = Math.round(count/camp.capacity*100)
          if (pct >= 90) newAlerts.push({ id: camp.id+'_cap', type: 'capacity', level: pct >= 100 ? 'danger' : 'warning', title: `مخيم ${camp.name} ممتلئ ${pct}%`, desc: `${count} أسرة من أصل ${camp.capacity}` })
        }
      })

      // أسر بدون مخيم
      const nocamp = families.filter(f => !f.camp_id).length
      if (nocamp > 0) newAlerts.push({ id: 'nocamp', type: 'nocamp', level: 'warning', title: `${nocamp} أسرة بدون مخيم`, desc: 'يجب تعيين مخيم لهذه الأسر' })

      // أسر مغادرة
      const departed = families.filter(f => f.status === 'departed').length
      if (departed > 0) newAlerts.push({ id: 'departed', type: 'departed', level: 'info', title: `${departed} أسرة مغادرة`, desc: 'مسجلة كمغادرة في النظام' })

      setAlerts(newAlerts)
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setLoading(false) }
  }

  const LEVEL = { danger: { color: 'red', icon: '🔴' }, warning: { color: 'accent', icon: '⚠️' }, info: { color: 'blue', icon: 'ℹ️' } }

  return (
    <div>
      <PageHeader icon="🔔" title="التنبيهات الذكية" subtitle={`${alerts.length} تنبيه`} />

      {loading ? <div className="flex justify-center py-16"><Spinner /></div>
      : alerts.length === 0 ? <EmptyState icon="✅" title="لا توجد تنبيهات" subtitle="كل شيء على ما يرام!" />
      : (
        <div className="flex flex-col gap-3">
          {alerts.map(alert => {
            const l = LEVEL[alert.level] || LEVEL.info
            return (
              <div key={alert.id} className={`bg-surface border border-${l.color}/30 rounded-xl p-4`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">{l.icon}</span>
                  <div>
                    <div className={`font-bold text-${l.color} text-sm`}>{alert.title}</div>
                    <div className="text-muted text-xs mt-0.5">{alert.desc}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
