import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, ORG_ID } from '../../lib/supabase'
import { useLocalDB } from '../../lib/useLocalDB'
import { useAuth } from '../../context/AuthContext'
import { visibleFamilies } from '../../lib/familyApproval'
import { isIncomplete } from '../../lib/familyValidation'
import { useApp } from '../../context/AppContext'
import PageHeader from '../../components/ui/PageHeader'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'

const LEVEL_STYLE = {
  red:    { bg:'rgba(239,68,68,0.08)',    border:'rgba(239,68,68,0.4)',    text:'#ef4444' },
  yellow: { bg:'rgba(245,158,11,0.08)',   border:'rgba(245,158,11,0.4)',   text:'#f59e0b' },
  blue:   { bg:'rgba(59,130,246,0.08)',   border:'rgba(59,130,246,0.4)',   text:'#3b82f6' },
  green:  { bg:'rgba(16,185,129,0.08)',   border:'rgba(16,185,129,0.4)',   text:'#10b981' },
}

export default function Alerts() {
  const [alerts,   setAlerts]  = useState([])
  const [loading,  setLoading] = useState(true)
  const { isOwner, isSuperAdmin, isCampDelegate, profile } = useAuth()
  const { online } = useApp()
  const { query } = useLocalDB()
  const navigate = useNavigate()

  useEffect(() => { loadAlerts() }, [])

  async function loadAlerts() {
    setLoading(true)
    try {
      const [famsRaw, camps, members] = await Promise.all([
        query('families'),
        query('camps'),
        query('family_members'),
      ])
      const fams = visibleFamilies(famsRaw, isOwner)

      const campMap = Object.fromEntries(camps.map(c=>[c.id,c]))
      const mByFam  = {}
      members.forEach(m => { if(!mByFam[m.family_id]) mByFam[m.family_id]=[]; mByFam[m.family_id].push(m) })

      // فلتر حسب الدور
      let myFams = fams
      if (isCampDelegate && profile?.camp_id) {
        const myCamps = new Set([profile.camp_id, ...camps.filter(c=>c.parent_camp_id===profile.camp_id).map(c=>c.id)])
        myFams = fams.filter(f => myCamps.has(f.camp_id))
      }

      const list = []

      // ① بيانات ناقصة
      const incomplete = myFams.filter(f => isIncomplete(f, mByFam[f.id]))
      if (incomplete.length) list.push({
        level:'yellow', icon:'⚠️',
        title:`${incomplete.length} أسرة ببيانات ناقصة`,
        desc:'تحتاج استكمال البيانات',
        action: () => navigate('/families')
      })

      // ② بدون جوال
      const noPhone = myFams.filter(f => !f.phone1?.trim())
      if (noPhone.length) list.push({
        level:'yellow', icon:'📵',
        title:`${noPhone.length} أسرة بدون رقم جوال`,
        desc:'لا يمكن التواصل معهم'
      })

      // ③ هويات مكررة
      const idMap = {}
      myFams.forEach(f => { if(f.head_id) { idMap[f.head_id]=(idMap[f.head_id]||0)+1 } })
      members.forEach(m => { if(m.national_id) { idMap[m.national_id]=(idMap[m.national_id]||0)+1 } })
      const dupIds = myFams.filter(f => f.head_id && (idMap[f.head_id]||0) > 1)
      if (dupIds.length) list.push({
        level:'red', icon:'🔁',
        title:`${dupIds.length} أسرة بهوية مكررة`,
        desc: dupIds.slice(0,3).map(f=>f.head_name).join('، ') + (dupIds.length>3?' وآخرون':''),
        action: () => navigate('/families')
      })

      // ④ جوالات مكررة
      const phMap = {}
      myFams.forEach(f => { if(f.phone1) { const p=(f.phone1||'').replace(/\s/g,''); phMap[p]=(phMap[p]||0)+1 } })
      const dupPh = myFams.filter(f => f.phone1 && (phMap[(f.phone1||'').replace(/\s/g,'')]||0)>1)
      if (dupPh.length) list.push({
        level:'yellow', icon:'📞',
        title:`${dupPh.length} أسرة بجوال مكرر`,
        desc: dupPh.slice(0,3).map(f=>f.head_name).join('، ') + (dupPh.length>3?' وآخرون':''),
        action: () => navigate('/families')
      })

      // ⑤ سعة المخيمات
      const campCount = {}
      myFams.forEach(f => { campCount[f.camp_id]=(campCount[f.camp_id]||0)+1 })
      camps.forEach(c => {
        if (!c.capacity) return
        const n = campCount[c.id]||0
        const pct = Math.round(n/c.capacity*100)
        if (pct >= 100) list.push({
          level:'red', icon:'🏕️',
          title:`مخيم ${c.name} ممتلئ`,
          desc:`${n} أسرة من ${c.capacity} (${pct}%)`,
          action: () => navigate('/families')
        })
        else if (pct >= 90) list.push({
          level:'yellow', icon:'🏕️',
          title:`مخيم ${c.name} شبه ممتلئ (${pct}%)`,
          desc:`${n} من ${c.capacity} أسرة`
        })
      })

      // ⑥ آخر توزيع
      if (online) {
        try {
          const { data:lastDist } = await supabase.from('camp_dist_families')
            .select('received_at').eq('org_id',ORG_ID)
            .order('received_at',{ascending:false}).limit(1)
          if (lastDist?.[0]?.received_at) {
            const days = Math.floor((Date.now()-new Date(lastDist[0].received_at))/86400000)
            if (days > 30) list.push({
              level:'yellow', icon:'📦',
              title:`لم يُسجَّل توزيع منذ ${days} يوم`,
              desc:'قد تحتاج جولة توزيع جديدة',
              action: () => navigate('/distributions')
            })
          }
        } catch(e) { console.warn('[alerts] فشل فحص آخر توزيع:', e.message) }
      }
      if ((isOwner||isSuperAdmin) && online) {
        try {
          const { data:pending } = await supabase.from('org_members')
            .select('full_name').eq('org_id',ORG_ID).eq('must_change_pass',true)
          if (pending?.length) list.push({
            level:'blue', icon:'🔑',
            title:`${pending.length} مستخدم لم يغيّر كلمة المرور`,
            desc: pending.slice(0,3).map(u=>u.full_name).join('، '),
            action: () => navigate('/users')
          })
        } catch(e) { console.warn('[alerts] فشل فحص كلمات المرور المعلّقة:', e.message) }
      }

      if (!list.length) list.push({
        level:'green', icon:'✅',
        title:'كل شيء على ما يرام',
        desc:'لا توجد تنبيهات تحتاج انتباهك'
      })

      setAlerts(list)
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  return (
    <div>
      <PageHeader icon="🔔" title="التنبيهات"
        subtitle={<span className="text-muted text-xs">{alerts.length} تنبيه</span>}
        action={
          <button onClick={loadAlerts}
            className="bg-surface2 border border-border text-white font-bold w-9 h-9 rounded-xl text-sm flex items-center justify-center">
            🔄
          </button>
        }
      />

      {loading ? <div className="flex justify-center py-16"><Spinner /></div>
      : (
        <div className="flex flex-col gap-2">
          {alerts.map((a,i) => {
            const s = LEVEL_STYLE[a.level] || LEVEL_STYLE.blue
            return (
              <div key={i}
                className="rounded-xl p-4 border"
                style={{background:s.bg, borderColor:s.border}}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="font-bold text-sm mb-1" style={{color:s.text}}>
                      {a.icon} {a.title}
                    </div>
                    <div className="text-muted text-xs">{a.desc}</div>
                  </div>
                  {a.action && (
                    <button onClick={a.action}
                      className="text-[11px] font-bold px-3 py-1.5 rounded-lg flex-shrink-0"
                      style={{background:`${s.text}22`,color:s.text,border:`1px solid ${s.border}`}}>
                      عرض
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
