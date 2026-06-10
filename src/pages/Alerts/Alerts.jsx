import { useState, useEffect } from 'react'
import { localDB } from '../../lib/db'
import { useApp } from '../../context/AppContext'
import PageHeader from '../../components/ui/PageHeader'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'

const REQUIRED = ['head_name','head_id','phone1','camp_id']

export default function Alerts() {
  const [alerts,  setAlerts]  = useState([])
  const [loading, setLoading] = useState(true)
  const { showToast } = useApp()

  useEffect(() => { loadAlerts() }, [])

  async function loadAlerts() {
    setLoading(true)
    try {
      const [families, camps, members, dist] = await Promise.all([
        localDB.families.toArray().catch(()=>[]),
        localDB.camps.toArray().catch(()=>[]),
        localDB.family_members.toArray().catch(()=>[]),
        localDB.dist_rounds.toArray().catch(()=>[]),
      ])
      const campMap = Object.fromEntries(camps.map(c=>[c.id,c]))
      const newAlerts = []

      // 1. أسر بيانات ناقصة
      const incomplete = families.filter(f=>REQUIRED.some(k=>!f[k]?.toString().trim()))
      if (incomplete.length>0) newAlerts.push({
        id:'incomplete', type:'data', level:'warning',
        icon:'⚠️', title:`${incomplete.length} أسرة ببيانات ناقصة`,
        desc:`تحتاج إكمال: ${incomplete.slice(0,3).map(f=>f.head_name||'—').join('، ')}${incomplete.length>3?'...':''}`,
        action:'/families', actionLabel:'عرض'
      })

      // 2. مخيمات ممتلئة أو قاربت الامتلاء
      const campCounts = {}
      families.forEach(f=>{ campCounts[f.camp_id]=(campCounts[f.camp_id]||0)+1 })
      camps.forEach(camp=>{
        if (camp.capacity>0) {
          const count = campCounts[camp.id]||0
          const pct = Math.round(count/camp.capacity*100)
          if (pct>=100) newAlerts.push({
            id:'full_'+camp.id, type:'capacity', level:'danger',
            icon:'🔴', title:`مخيم ${camp.name} ممتلئ (${pct}%)`,
            desc:`${count} أسرة من أصل ${camp.capacity}`,
            action:'/camps', actionLabel:'المخيمات'
          })
          else if (pct>=85) newAlerts.push({
            id:'near_'+camp.id, type:'capacity', level:'warning',
            icon:'🟡', title:`مخيم ${camp.name} شبه ممتلئ (${pct}%)`,
            desc:`${count} أسرة من أصل ${camp.capacity}`,
            action:'/camps', actionLabel:'المخيمات'
          })
        }
      })

      // 3. أسر بدون مخيم
      const nocamp = families.filter(f=>!f.camp_id)
      if (nocamp.length>0) newAlerts.push({
        id:'nocamp', type:'data', level:'warning',
        icon:'🏕️', title:`${nocamp.length} أسرة بدون مخيم`,
        desc:'يجب تعيين مخيم لهذه الأسر',
        action:'/families', actionLabel:'عرض'
      })

      // 4. هويات مكررة
      const idCount = {}
      families.forEach(f=>{ if(f.head_id) idCount[f.head_id]=(idCount[f.head_id]||0)+1 })
      const dupIds = Object.entries(idCount).filter(([,v])=>v>1)
      if (dupIds.length>0) newAlerts.push({
        id:'dup_id', type:'duplicate', level:'danger',
        icon:'🔁', title:`${dupIds.length} رقم هوية مكرر`,
        desc:`أرقام مكررة: ${dupIds.slice(0,2).map(([k])=>k).join('، ')}...`,
        action:'/families', actionLabel:'عرض'
      })

      // 5. جوالات مكررة
      const phoneCount = {}
      families.forEach(f=>{ if(f.phone1) phoneCount[f.phone1]=(phoneCount[f.phone1]||0)+1 })
      const dupPhones = Object.entries(phoneCount).filter(([,v])=>v>1)
      if (dupPhones.length>0) newAlerts.push({
        id:'dup_phone', type:'duplicate', level:'warning',
        icon:'📞', title:`${dupPhones.length} رقم جوال مكرر`,
        desc:'قد يكون خطأ في الإدخال',
        action:'/families', actionLabel:'عرض'
      })

      // 6. حالات صحية تحتاج انتباه
      const healthCases = members.filter(m=>['مصاب','معاق','مزمن'].includes(m.health))
      if (healthCases.length>0) newAlerts.push({
        id:'health', type:'health', level:'info',
        icon:'🏥', title:`${healthCases.length} حالة صحية تحتاج متابعة`,
        desc:`معاق: ${healthCases.filter(m=>m.health==='معاق').length} · مصاب: ${healthCases.filter(m=>m.health==='مصاب').length} · مزمن: ${healthCases.filter(m=>m.health==='مزمن').length}`,
        action:'/analysis', actionLabel:'التقارير'
      })

      // 7. توزيعات مفتوحة قديمة
      const openDist = dist.filter(d=>d.status==='active')
      if (openDist.length>0) {
        const old = openDist.filter(d=>{ const days=(Date.now()-new Date(d.created_at))/86400000; return days>7 })
        if (old.length>0) newAlerts.push({
          id:'old_dist', type:'distribution', level:'warning',
          icon:'📦', title:`${old.length} جولة توزيع مفتوحة منذ أكثر من أسبوع`,
          desc:old.map(d=>d.name).join('، '),
          action:'/distributions', actionLabel:'التوزيعات'
        })
      }

      // 8. أسر مغادرة
      const departed = families.filter(f=>['departed','inactive'].includes(f.status))
      if (departed.length>0) newAlerts.push({
        id:'departed', type:'info', level:'info',
        icon:'📤', title:`${departed.length} أسرة مسجلة كمغادرة`,
        desc:'يمكن مراجعتها في قائمة الأسر',
        action:'/families', actionLabel:'عرض'
      })

      setAlerts(newAlerts)
    } catch(err) { showToast('خطأ: '+err.message,true) }
    finally { setLoading(false) }
  }

  const LEVEL_STYLE = {
    danger:  { border:'border-red/30',   bg:'bg-red/5',   icon_bg:'bg-red/15'    },
    warning: { border:'border-accent/30',bg:'bg-accent/5',icon_bg:'bg-accent/15' },
    info:    { border:'border-blue/30',  bg:'bg-blue/5',  icon_bg:'bg-blue/15'   },
  }

  const dangerCount  = alerts.filter(a=>a.level==='danger').length
  const warningCount = alerts.filter(a=>a.level==='warning').length

  return (
    <div>
      <PageHeader icon="🔔" title="التنبيهات الذكية"
        subtitle={`${alerts.length} تنبيه`}
        action={<button onClick={loadAlerts} className="bg-surface2 border border-border text-muted px-3 py-1.5 rounded-xl text-xs font-bold">🔄 تحديث</button>}
      />

      {/* ملخص */}
      {alerts.length>0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[['🔴 حرج',dangerCount,'red'],['🟡 تحذير',warningCount,'accent'],['🔵 معلومة',alerts.length-dangerCount-warningCount,'blue']].map(([l,v,c])=>(
            <div key={l} className="bg-surface border border-border rounded-xl p-2 text-center">
              <div className={`text-lg font-black text-${c}`}>{v}</div>
              <div className="text-muted text-[9px] mt-0.5">{l}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? <div className="flex justify-center py-16"><Spinner/></div>
      : alerts.length===0 ? <EmptyState icon="✅" title="لا توجد تنبيهات" subtitle="كل شيء على ما يرام!"/>
      : (
        <div className="flex flex-col gap-3">
          {alerts.sort((a,b)=>['danger','warning','info'].indexOf(a.level)-['danger','warning','info'].indexOf(b.level)).map(alert=>{
            const s = LEVEL_STYLE[alert.level]||LEVEL_STYLE.info
            return (
              <div key={alert.id} className={`border rounded-xl p-4 ${s.border} ${s.bg}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${s.icon_bg}`}>
                    {alert.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm">{alert.title}</div>
                    <div className="text-muted text-xs mt-0.5 leading-relaxed">{alert.desc}</div>
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
