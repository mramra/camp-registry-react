import { useState, useEffect, useRef } from 'react'
import { localDB } from '../../lib/db'
import { useApp } from '../../context/AppContext'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'

function calcAge(dob) {
  if (!dob) return null
  const b = new Date(dob), t = new Date()
  let age = t.getFullYear()-b.getFullYear()
  if (t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate())) age--
  return age>=0&&age<120 ? age : null
}

const AGE_GROUPS = [
  { label:'رضيع 0-2',   min:0,  max:2  },
  { label:'طفل 3-12',   min:3,  max:12 },
  { label:'مراهق 13-17',min:13, max:17 },
  { label:'شاب 18-35',  min:18, max:35 },
  { label:'كهل 36-59',  min:36, max:59 },
  { label:'مسن 60+',    min:60, max:200 },
]

export default function Analysis() {
  const [tab,      setTab]      = useState('overview')
  const [stats,    setStats]    = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [filterCamp, setFilterCamp] = useState('all')
  const { showToast } = useApp()

  useEffect(() => { loadStats() }, [filterCamp])

  async function loadStats() {
    setLoading(true)
    try {
      const [families, camps, members] = await Promise.all([
        localDB.families.toArray().catch(()=>[]),
        localDB.camps.toArray().catch(()=>[]),
        localDB.family_members.toArray().catch(()=>[]),
      ])
      const campMap = Object.fromEntries(camps.map(c=>[c.id,c.name]))

      // فلتر مخيم
      const fams = filterCamp==='all' ? families : families.filter(f=>f.camp_id===filterCamp)
      const famIds = new Set(fams.map(f=>f.id))
      const mems = members.filter(m=>famIds.has(m.family_id))

      // كل الأفراد بما فيهم رب الأسرة
      const allPersons = [
        ...fams.map(f=>({ id:f.id, dob:f.head_dob, gender:f.head_gender, health:'سليم', isHead:true })),
        ...mems.map(m=>({ id:m.id, dob:m.dob, gender:m.gender, health:m.health, isHead:false }))
      ]

      // إحصائيات عامة
      const byStatus = fams.reduce((acc,f)=>{ const s=['active','ok','need','urgent'].includes(f.status)?'active':['departed','inactive'].includes(f.status)?'departed':'pending'; acc[s]=(acc[s]||0)+1; return acc },{})
      const byCamp = camps.map(c=>({ name:c.name, count:fams.filter(f=>f.camp_id===c.id).length })).filter(c=>c.count>0).sort((a,b)=>b.count-a.count)

      // الفئات العمرية
      const ageData = AGE_GROUPS.map(g=>{
        const count = allPersons.filter(p=>{ const age=calcAge(p.dob); return age!==null&&age>=g.min&&age<=g.max }).length
        return { label:g.label, count }
      })

      // الجنس
      const males   = allPersons.filter(p=>p.gender==='ذكر'||p.gender==='male').length
      const females = allPersons.filter(p=>p.gender==='أنثى'||p.gender==='female').length
      const noGender= allPersons.length-males-females

      // الحالات الصحية
      const healthData = {
        سليم:  mems.filter(m=>!m.health||m.health==='سليم').length,
        مريض:  mems.filter(m=>m.health==='مريض').length,
        معاق:  mems.filter(m=>m.health==='معاق').length,
        مزمن:  mems.filter(m=>m.health==='مزمن').length,
        مصاب:  mems.filter(m=>m.health==='مصاب').length,
      }

      // النساء
      const women = allPersons.filter(p=>p.gender==='أنثى'||p.gender==='female')
      const womenAgeGroups = AGE_GROUPS.map(g=>({
        label:g.label,
        count: women.filter(w=>{ const age=calcAge(w.dob); return age!==null&&age>=g.min&&age<=g.max }).length
      }))

      // الأطفال (أقل من 18)
      const children = allPersons.filter(p=>{ const age=calcAge(p.dob); return age!==null&&age<18 })
      const orphans  = mems.filter(m=>m.orphan_status)

      // بيانات ناقصة
      const REQUIRED = ['head_name','head_id','phone1','camp_id']
      const incomplete = fams.filter(f=>REQUIRED.some(k=>!f[k]?.toString().trim()))

      setStats({
        total: fams.length, totalPersons: fams.length+mems.length,
        byStatus, byCamp, ageData, males, females, noGender,
        healthData, women: women.length, womenAgeGroups,
        children: children.length, orphans: orphans.length,
        incomplete: incomplete.length,
        camps, campMap,
      })
    } catch(err) { showToast('خطأ: '+err.message,true) }
    finally { setLoading(false) }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner/></div>
  if (!stats) return null

  const TABS = [
    { key:'overview', label:'📊 عام'     },
    { key:'age',      label:'🎂 الأعمار' },
    { key:'health',   label:'🏥 الصحة'   },
    { key:'women',    label:'👩 نساء'    },
    { key:'children', label:'🧒 أطفال'   },
    { key:'camps',    label:'🏕️ مخيمات'  },
  ]

  return (
    <div>
      <PageHeader icon="📈" title="التقارير والتحليلات"/>

      {/* فلتر المخيم */}
      <select value={filterCamp} onChange={e=>setFilterCamp(e.target.value)}
        className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent mb-4">
        <option value="all">🏕️ كل المخيمات ({stats.total})</option>
        {stats.byCamp.map(c=>{
          const camp = stats.camps.find(x=>x.name===c.name)
          return camp ? <option key={camp.id} value={camp.id}>{c.name} ({c.count})</option> : null
        })}
      </select>

      {/* تبويبات */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-[11px] font-bold border transition-all
              ${tab===t.key?'bg-accent text-bg border-accent':'bg-surface2 border-border text-muted'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* نظرة عامة */}
      {tab==='overview' && (
        <div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[['👨‍👩‍👧‍👦','الأسر',stats.total,'accent'],['👤','الأفراد',stats.totalPersons,'blue'],
              ['👩','نساء',stats.women,'purple'],['🧒','أطفال',stats.children,'green'],
              ['⚠️','ناقصة',stats.incomplete,'red'],['🏕️','مخيمات',stats.byCamp.length,'accent']].map(([i,l,v,c])=>(
              <div key={l} className="bg-surface border border-border rounded-xl p-3 text-center">
                <div className="text-2xl mb-1">{i}</div>
                <div className={`text-2xl font-black text-${c}`}>{v}</div>
                <div className="text-muted text-xs mt-1">{l}</div>
              </div>
            ))}
          </div>
          <Card title="توزيع الجنس" icon="🚻">
            <BarChart data={[{label:'👨 ذكور',value:stats.males},{label:'👩 إناث',value:stats.females},{label:'غير محدد',value:stats.noGender}]} total={stats.males+stats.females+stats.noGender}/>
          </Card>
          <Card title="الحالة" icon="📊">
            <BarChart data={[{label:'🟢 نشط',value:stats.byStatus.active||0},{label:'🟡 معلق',value:stats.byStatus.pending||0},{label:'🔴 مغادر',value:stats.byStatus.departed||0}]} total={stats.total}/>
          </Card>
        </div>
      )}

      {/* الأعمار */}
      {tab==='age' && (
        <Card title="توزيع الفئات العمرية" icon="🎂">
          <div className="text-muted text-xs mb-3">يشمل رب الأسرة وجميع الأفراد</div>
          <BarChart data={stats.ageData.map(a=>({label:a.label,value:a.count}))} total={stats.totalPersons}/>
        </Card>
      )}

      {/* الصحة */}
      {tab==='health' && (
        <div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {Object.entries(stats.healthData).map(([k,v])=>{
              const icons = {سليم:'✅',مريض:'🤒',معاق:'♿',مزمن:'💊',مصاب:'🩹'}
              const colors = {سليم:'green',مريض:'accent',معاق:'purple',مزمن:'red',مصاب:'red'}
              return (
                <div key={k} className="bg-surface border border-border rounded-xl p-3 text-center">
                  <div className="text-2xl mb-1">{icons[k]}</div>
                  <div className={`text-xl font-black text-${colors[k]}`}>{v}</div>
                  <div className="text-muted text-xs mt-1">{k}</div>
                </div>
              )
            })}
          </div>
          <Card title="توزيع الحالات الصحية" icon="🏥">
            <BarChart data={Object.entries(stats.healthData).map(([l,v])=>({label:l,value:v}))} total={Object.values(stats.healthData).reduce((a,b)=>a+b,0)}/>
          </Card>
        </div>
      )}

      {/* النساء */}
      {tab==='women' && (
        <div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-surface border border-border rounded-xl p-3 text-center col-span-2">
              <div className="text-3xl font-black text-purple-400">{stats.women}</div>
              <div className="text-muted text-xs mt-1">إجمالي النساء والفتيات</div>
            </div>
          </div>
          <Card title="الفئات العمرية للنساء" icon="👩">
            <BarChart data={stats.womenAgeGroups.map(g=>({label:g.label,value:g.count}))} total={stats.women}/>
          </Card>
        </div>
      )}

      {/* الأطفال */}
      {tab==='children' && (
        <div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-surface border border-border rounded-xl p-3 text-center">
              <div className="text-3xl font-black text-green">{stats.children}</div>
              <div className="text-muted text-xs mt-1">أطفال (أقل من 18)</div>
            </div>
            <div className="bg-surface border border-border rounded-xl p-3 text-center">
              <div className="text-3xl font-black text-red">{stats.orphans}</div>
              <div className="text-muted text-xs mt-1">أيتام مسجلون</div>
            </div>
          </div>
          <Card title="الفئات العمرية للأطفال" icon="🧒">
            <BarChart data={stats.ageData.slice(0,3).map(a=>({label:a.label,value:a.count}))} total={stats.children}/>
          </Card>
        </div>
      )}

      {/* المخيمات */}
      {tab==='camps' && (
        <Card title="الأسر حسب المخيم" icon="🏕️">
          <BarChart data={stats.byCamp.map(c=>({label:c.name,value:c.count}))} total={stats.total}/>
        </Card>
      )}
    </div>
  )
}

// مكوّن Bar Chart بسيط
function BarChart({ data, total }) {
  const max = Math.max(...data.map(d=>d.value), 1)
  return (
    <div className="flex flex-col gap-2.5">
      {data.map(item=>{
        const pct = total>0 ? Math.round(item.value/total*100) : 0
        const width = Math.round(item.value/max*100)
        return (
          <div key={item.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-white font-medium truncate max-w-40">{item.label}</span>
              <span className="text-muted">{item.value} ({pct}%)</span>
            </div>
            <div className="h-2 bg-surface2 rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all" style={{width:`${width}%`}}/>
            </div>
          </div>
        )
      })}
    </div>
  )
}
