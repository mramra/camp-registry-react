import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLocalDB } from '../../lib/useLocalDB'
import { supabase, ORG_ID } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { useDataScope } from '../../lib/useDataScope'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { formatDate } from '../../lib/utils'

function calcAge(dob) {
  if (!dob) return null
  const b = new Date(dob), t = new Date()
  let age = t.getFullYear() - b.getFullYear()
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--
  return age >= 0 && age < 120 ? age : null
}

const AGE_GROUPS = [
  { label: 'رضيع 0-2',    min: 0,  max: 2   },
  { label: 'طفل 3-12',    min: 3,  max: 12  },
  { label: 'مراهق 13-17', min: 13, max: 17  },
  { label: 'شاب 18-35',   min: 18, max: 35  },
  { label: 'كهل 36-59',   min: 36, max: 59  },
  { label: 'مسن 60+',     min: 60, max: 200 },
]

const TABS = [
  { key: 'overview',  label: '📊 عام'      },
  { key: 'age',       label: '🎂 الأعمار'  },
  { key: 'health',    label: '🏥 الصحة'    },
  { key: 'women',     label: '👩 نساء'     },
  { key: 'children',  label: '🧒 أطفال'    },
  { key: 'camps',     label: '🏕️ مخيمات'   },
  { key: 'dists',     label: '📦 توزيعات'  },
]

// ── DrillDown Modal ─────────────────────────────────────────
// items: قائمة أفراد { personName, personId, personGender, personDob, famId, famName, famHeadId, campName }
// أو أسر عادية { head_name, head_id, phone1, camp_id, id }
function DrillDownModal({ title, items, campMap, onClose, onOpenFamily }) {
  const [search, setSearch] = useState('')

  const filtered = items.filter(item => {
    if (!search) return true
    const q = search.toLowerCase()
    const name = item.personName || item.head_name || ''
    const id   = item.personId   || item.head_id   || ''
    return name.toLowerCase().includes(q) || id.includes(q)
  })

  function getIcon(item) {
    const g = item.personGender || item.head_gender || ''
    const age = item.personDob ? calcAge(item.personDob) : null
    if (age !== null && age < 3)  return '👶'
    if (age !== null && age < 13) return '🧒'
    if (age !== null && age < 18) return '🧑'
    if (g==='ذكر'||g==='male')   return '👨'
    if (g==='أنثى'||g==='female') return '👩'
    return '👤'
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'0'}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'#111827',borderRadius:'20px 20px 0 0',width:'100%',maxWidth:'500px',maxHeight:'85vh',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {/* رأس */}
        <div style={{padding:'16px',borderBottom:'1px solid #374151',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
          <div>
            <div style={{color:'#f59e0b',fontWeight:'900',fontSize:'14px'}}>{title}</div>
            <div style={{color:'#9ca3af',fontSize:'11px',marginTop:'2px'}}>{items.length} فرد/أسرة</div>
          </div>
          <button onClick={onClose}
            style={{background:'#1f2937',border:'1px solid #374151',color:'#9ca3af',borderRadius:'10px',padding:'6px 14px',fontSize:'12px',cursor:'pointer',fontFamily:'Cairo,sans-serif'}}>
            ✕ إغلاق
          </button>
        </div>
        {/* بحث */}
        <div style={{padding:'10px 16px',flexShrink:0}}>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="🔍 بحث بالاسم أو الهوية..."
            style={{width:'100%',background:'#1f2937',border:'1px solid #374151',borderRadius:'10px',padding:'8px 12px',color:'white',fontSize:'12px',fontFamily:'Cairo,sans-serif',outline:'none',boxSizing:'border-box'}}
          />
        </div>
        {/* القائمة */}
        <div style={{overflowY:'auto',flex:1,padding:'0 16px 16px'}}>
          {filtered.length === 0
            ? <div style={{color:'#9ca3af',textAlign:'center',padding:'20px',fontSize:'12px'}}>لا توجد نتائج</div>
            : filtered.map((item, i) => {
              const isPerson = !!item.personName
              const name     = item.personName || item.head_name
              const subId    = item.personId   || item.head_id
              const famName  = item.famName
              const camp     = item.campName   || (item.camp_id && campMap[item.camp_id])
              const icon     = getIcon(item)
              const age      = calcAge(item.personDob || item.head_dob)
              const relation = item.relation
              return (
                <div key={i} onClick={()=>{ onClose(); onOpenFamily(item.famId || item.id, item) }}
                  style={{background:'#1f2937',border:'1px solid #374151',borderRadius:'12px',padding:'10px 14px',marginBottom:'8px',cursor:'pointer',display:'flex',gap:'10px',alignItems:'center'}}>
                  <span style={{fontSize:'24px',flexShrink:0}}>{icon}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:'white',fontWeight:'bold',fontSize:'13px'}}>{i+1}. {name}</div>
                    {isPerson && famName && (
                      <div style={{color:'#f59e0b',fontSize:'10px',marginTop:'1px'}}>
                        👨‍👩‍👧‍👦 أسرة: {famName}
                      </div>
                    )}
                    <div style={{color:'#9ca3af',fontSize:'10px',marginTop:'1px',direction:'ltr',textAlign:'right'}}>
                      {subId}{age !== null ? ` · ${age} سنة` : ''}{relation ? ` · ${relation}` : ''}
                    </div>
                    {camp && <div style={{color:'#3b82f6',fontSize:'10px',marginTop:'1px'}}>🏕️ {camp}</div>}
                  </div>
                  <span style={{color:'#f59e0b',fontSize:'18px',flexShrink:0}}>←</span>
                </div>
              )
            })
          }
        </div>
      </div>
    </div>
  )
}

export default function Analysis() {
  const [tab,        setTab]        = useState('overview')
  const [stats,      setStats]      = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [filterCamp, setFilterCamp] = useState('all')
  const [drillDown,  setDrillDown]  = useState(null) // { title, families }
  const [selFamily,  setSelFamily]  = useState(null)
  const [selMembers, setSelMembers] = useState([])

  const { showToast, online, psReady, psSynced} = useApp()
  const { getAllowedCampIds, applyScope, filterLocal } = useDataScope()
  const navigate = useNavigate()

  // حفظ الأسر الكاملة للـ drill-down
  const [allFamilies, setAllFamilies] = useState([])
  const [allMembers,  setAllMembers]  = useState([])

  const { query } = useLocalDB()
  useEffect(() => { loadStats() }, [filterCamp])
  useEffect(() => { loadData() }, [])
  useEffect(() => { if (psReady)  loadStats() }, [psReady])
  useEffect(() => { if (psSynced) loadStats() }, [psSynced])

  async function loadStats() {
    setLoading(true)
    try {
      const [famRaw, camps, members, rounds, distFams] = await Promise.all([
        query('families'),
        query('camps'),
        query('family_members'),
        query('dist_rounds').catch(()=>[]),
        query('camp_dist_families').catch(()=>[]),
      ])

      if (online) {
        Promise.all([
          supabase.from('camps').select('*').eq('org_id', ORG_ID).then(async ({data: ac}) => {
            const cIds = getAllowedCampIds(ac||[])
            let q = supabase.from('families').select('*').eq('org_id', ORG_ID)
            q = applyScope(q, cIds)
            const {data} = await q
            if (data) await bulkUpsert('families', data)
          }),
          supabase.from('family_members').select('*')
            .then(({ data }) => data && bulkUpsert('family_members', data).catch(() => {})),
        ]).catch(() => {})
      }

      const campIds = getAllowedCampIds(camps)
      const families = filterLocal(famRaw, campIds)
      const campMap = Object.fromEntries(camps.map(c => [c.id, c.name]))

      setAllFamilies(families)
      setAllMembers(members)

      const fams = filterCamp === 'all' ? families : families.filter(f => f.camp_id === filterCamp)
      const famIds = new Set(fams.map(f => f.id))
      const mems = members.filter(m => famIds.has(m.family_id))

      const famNameMap = Object.fromEntries(fams.map(f=>[f.id, f.head_name]))
      const allPersons = [
        // رب الأسرة
        ...fams.map(f => ({
          personName: f.head_name, personId: f.head_id,
          personGender: f.head_gender, personDob: f.head_dob,
          famId: f.id, famName: f.head_name,
          campName: campMap[f.camp_id],
          relation: 'رب الأسرة', isHead: true,
          dob: f.head_dob, gender: f.head_gender, health: null,
        })),
        // الأفراد
        ...mems.map(m => ({
          personName: m.name, personId: m.national_id,
          personGender: m.gender, personDob: m.dob,
          famId: m.family_id, famName: famNameMap[m.family_id]||'—',
          campName: campMap[fams.find(f=>f.id===m.family_id)?.camp_id],
          relation: m.relation, isHead: false,
          dob: m.dob, gender: m.gender, health: m.health,
        }))
      ]



      const byCamp = camps
        .map(c => ({ id: c.id, name: c.name, count: fams.filter(f => f.camp_id === c.id).length }))
        .filter(c => c.count > 0).sort((a, b) => b.count - a.count)

      const ageData = AGE_GROUPS.map(g => ({
        label: g.label,
        count: allPersons.filter(p => { const a = calcAge(p.dob); return a !== null && a >= g.min && a <= g.max }).length,
        persons: allPersons.filter(p => { const a = calcAge(p.dob); return a !== null && a >= g.min && a <= g.max }),
      }))

      const males    = allPersons.filter(p => p.personGender === 'ذكر'   || p.personGender === 'male')
      const females  = allPersons.filter(p => p.personGender === 'أنثى' || p.personGender === 'female')
      const noGenderP = allPersons.filter(p => p.personGender!=='ذكر'&&p.personGender!=='male'&&p.personGender!=='أنثى'&&p.personGender!=='female')
      const noGender  = noGenderP.length

      const healthData = {
        'سليم': mems.filter(m => !m.health || m.health === 'سليم').length,
        'مريض': mems.filter(m => m.health === 'مريض').length,
        'معاق': mems.filter(m => m.health === 'معاق').length,
        'مزمن': mems.filter(m => m.health === 'مزمن').length,
        'مصاب': mems.filter(m => m.health === 'مصاب').length,
      }

      const women = allPersons.filter(p => p.personGender === 'أنثى' || p.personGender === 'female')
      const womenGroups = AGE_GROUPS.map(g => ({
        label: g.label,
        count:   women.filter(w => { const a = calcAge(w.dob); return a !== null && a >= g.min && a <= g.max }).length,
        persons: women.filter(w => { const a = calcAge(w.dob); return a !== null && a >= g.min && a <= g.max }),
      }))

      const children = allPersons.filter(p => { const a = calcAge(p.dob); return a !== null && a < 18 })
      const childPersons = children
      const orphans  = mems.filter(m => m.orphan_status).length

      const REQUIRED = ['head_name', 'head_id', 'phone1', 'camp_id']
      const incomplete = fams.filter(f => REQUIRED.some(k => !f[k]?.toString().trim())).length

      // فلترة التوزيع بنطاق الأسر المسموحة فقط (اتساق كامل مع عزل المخيم)
      const distFamIds    = new Set(distFams.filter(d => famIds.has(d.family_id)).map(d => d.family_id))
      const receivedCount = fams.filter(f => distFamIds.has(f.id)).length
      const notReceived   = fams.filter(f => f.status === 'active' && !distFamIds.has(f.id)).length
      // عدد الجولات: فقط الجولات التي لها دفعات استفادت منها أسر المخيم المرئية
      const visibleRoundIds = new Set(distFams.filter(d => famIds.has(d.family_id)).map(d => d.distribution_id))
      const scopedRounds    = campIds === null ? rounds : rounds.filter(r => visibleRoundIds.has(r.id))
      const activeRounds    = scopedRounds.filter(r => r.status === 'active').length

      setStats({
        total: fams.length, totalPersons: fams.length + mems.length,
        byCamp, ageData,
        males: males.length, females: females.length, noGender,
        healthData, women: women.length, womenGroups,
        children: children.length, orphans, incomplete,
        camps, campMap, allFams: fams,
        rounds: scopedRounds.length, activeRounds, receivedCount, notReceived,
        // famIds للـ drill-down
        malePersons:    males,
        femalePersons:  females,
        noGenderPersons:noGenderP,
        childPersons:   childPersons,
        childFamIds:  [...new Set(children.map(p=>p.famId))],
        healthFamIds: Object.fromEntries(
          ['مريض','معاق','مزمن','مصاب'].map(h => [
            h, [...new Set(mems.filter(m=>m.health===h).map(m=>m.family_id))]
          ])
        ),
      })
    } catch(err) { showToast('خطأ في التحميل: ' + err.message, true) }
    finally { setLoading(false) }
  }

  // openDrillDown للأسر (famIds)
  function openDrillDown(title, famIds) {
    if (!famIds || famIds.length === 0) return
    const idSet = new Set(famIds)
    const famMap2 = Object.fromEntries(allFamilies.map(f=>[f.id,f]))
    const campMap2 = stats ? stats.campMap : {}
    const items = allFamilies
      .filter(f => idSet.has(f.id))
      .map(f => ({ ...f }))
    setDrillDown({ title, items })
  }

  // openDrillDownPersons للأفراد (مع بيانات الفرد نفسه)
  function openDrillDownPersons(title, persons) {
    if (!persons || persons.length === 0) return
    setDrillDown({ title, items: persons })
  }

  async function openFamily(famIdOrId, item) {
    // famIdOrId: إما family.id مباشرة أو من item.famId
    const famId = famIdOrId
    const fam = allFamilies.find(f => f.id === famId)
    if (!fam) return
    setSelFamily(fam)
    const mems = await query('family_members', {family_id: famId})
    setSelMembers(mems)
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>
  if (!stats)  return <EmptyState icon="📊" title="لا توجد بيانات" />

  const campMap = stats.campMap

  return (
    <div>
      <PageHeader icon="📈" title="التقارير والتحليلات" />

      <select value={filterCamp} onChange={e => setFilterCamp(e.target.value)}
        className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent mb-4">
        <option value="all">🏕️ كل المخيمات ({stats.total} أسرة)</option>
        {stats.byCamp.map(c => (
          <option key={c.id} value={c.id}>{c.name} ({c.count})</option>
        ))}
      </select>

      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 no-scrollbar">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-[11px] font-bold border transition-all
              ${tab === t.key ? 'bg-accent text-bg border-accent' : 'bg-surface2 border-border text-muted'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ نظرة عامة ══ */}
      {tab === 'overview' && (
        <div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { icon:'👨‍👩‍👧‍👦', label:'الأسر',    value:stats.total,        color:'accent', famIds: stats.allFams.map(f=>f.id) },
              { icon:'👤',       label:'الأفراد', value:stats.totalPersons, color:'blue',   famIds: stats.allFams.map(f=>f.id) },
              { icon:'👩',       label:'نساء',    value:stats.females,      color:'purple', persons: stats.femalePersons },
              { icon:'🧒',       label:'أطفال',   value:stats.children,     color:'green',  persons: stats.childPersons  },
            ].map(s => (
              <div key={s.label} onClick={() => s.persons ? openDrillDownPersons(s.icon+' '+s.label, s.persons) : openDrillDown(s.icon+' '+s.label, s.famIds)}
                className="bg-surface border border-border rounded-xl p-3 text-center cursor-pointer active:scale-95 transition-all hover:border-accent/40">
                <div className="text-2xl mb-1">{s.icon}</div>
                <div className={`text-2xl font-black text-${s.color}`}>{s.value}</div>
                <div className="text-muted text-xs mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          <Card title="توزيع الجنس" icon="🚻">
            <BarChart data={[
              { label:'👨 ذكور',    value:stats.males,    persons:stats.malePersons   },
              { label:'👩 إناث',    value:stats.females,  persons:stats.femalePersons },
              { label:'⬜ غير محدد', value:stats.noGender, persons:stats.noGenderPersons },
            ]} total={stats.males+stats.females+stats.noGender} onDrill={openDrillDown} />
          </Card>


        </div>
      )}

      {/* ══ الأعمار ══ */}
      {tab === 'age' && (
        <Card title="توزيع الفئات العمرية" icon="🎂">
          <BarChart data={stats.ageData.map(a=>({ label:a.label, value:a.count, persons:a.persons }))}
            total={stats.totalPersons} onDrill={(t,_,p)=>openDrillDownPersons(t,p)} />
        </Card>
      )}

      {/* ══ الصحة ══ */}
      {tab === 'health' && (
        <div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {Object.entries(stats.healthData).map(([k,v]) => {
              const icons  = { سليم:'✅', مريض:'🤒', معاق:'♿', مزمن:'💊', مصاب:'🩹' }
              const colors = { سليم:'green', مريض:'accent', معاق:'purple', مزمن:'red', مصاب:'red' }
              return (
                <div key={k} onClick={() => k!=='سليم' && openDrillDown(icons[k]+' '+k, stats.healthFamIds[k]||[])}
                  className={`bg-surface border border-border rounded-xl p-3 text-center ${k!=='سليم'?'cursor-pointer active:scale-95':''}`}>
                  <div className="text-2xl mb-1">{icons[k]}</div>
                  <div className={`text-xl font-black text-${colors[k]}`}>{v}</div>
                  <div className="text-muted text-xs mt-1">{k}</div>
                </div>
              )
            })}
          </div>
          <Card title="توزيع الحالات الصحية" icon="🏥">
            <BarChart data={Object.entries(stats.healthData).map(([l,v])=>({
              label:l, value:v, famIds: stats.healthFamIds[l]||[]
            }))} total={Object.values(stats.healthData).reduce((a,b)=>a+b,0)} onDrill={openDrillDown} />
          </Card>
        </div>
      )}

      {/* ══ النساء ══ */}
      {tab === 'women' && (
        <div>
          <div onClick={() => openDrillDownPersons('👩 النساء', stats.femalePersons)}
            className="bg-surface border border-border rounded-xl p-4 text-center mb-4 cursor-pointer active:scale-95">
            <div className="text-4xl font-black text-purple-400">{stats.women}</div>
            <div className="text-muted text-sm mt-1">إجمالي النساء والفتيات</div>
          </div>
          <Card title="الفئات العمرية للنساء" icon="👩">
            <BarChart data={stats.womenGroups.map(g=>({ label:g.label, value:g.count, persons:g.persons }))}
              total={stats.women} onDrill={(t,_,p)=>openDrillDownPersons(t,p)} />
          </Card>
        </div>
      )}

      {/* ══ الأطفال ══ */}
      {tab === 'children' && (
        <div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div onClick={() => openDrillDownPersons('🧒 الأطفال', stats.childPersons)}
              className="bg-surface border border-border rounded-xl p-3 text-center cursor-pointer active:scale-95">
              <div className="text-3xl font-black text-green">{stats.children}</div>
              <div className="text-muted text-xs mt-1">أطفال (أقل من 18)</div>
            </div>
            <div className="bg-surface border border-border rounded-xl p-3 text-center">
              <div className="text-3xl font-black text-red">{stats.orphans}</div>
              <div className="text-muted text-xs mt-1">أيتام مسجلون</div>
            </div>
          </div>
          <Card title="الفئات العمرية للأطفال" icon="🧒">
            <BarChart data={stats.ageData.slice(0,3).map(a=>({ label:a.label, value:a.count, persons:a.persons }))}
              total={stats.children} onDrill={(t,_,p)=>openDrillDownPersons(t,p)} />
          </Card>
        </div>
      )}

      {/* ══ المخيمات ══ */}
      {tab === 'camps' && (
        <div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-surface border border-border rounded-xl p-3 text-center">
              <div className="text-3xl font-black text-accent">{stats.byCamp.length}</div>
              <div className="text-muted text-xs mt-1">مخيم نشط</div>
            </div>
            <div className="bg-surface border border-border rounded-xl p-3 text-center">
              <div className="text-3xl font-black text-blue">
                {stats.byCamp.length > 0 ? Math.round(stats.total/stats.byCamp.length) : 0}
              </div>
              <div className="text-muted text-xs mt-1">متوسط أسر/مخيم</div>
            </div>
          </div>
          <Card title="الأسر حسب المخيم" icon="🏕️">
            <BarChart data={stats.byCamp.map(c=>({
              label:c.name, value:c.count,
              famIds: stats.allFams.filter(f=>f.camp_id===c.id).map(f=>f.id)
            }))} total={stats.total} onDrill={openDrillDown} />
          </Card>
        </div>
      )}

      {/* ══ التوزيعات ══ */}
      {tab === 'dists' && (
        <div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { icon:'📦', label:'جولات التوزيع', value:stats.rounds,        color:'accent', famIds:[] },
              { icon:'▶️', label:'جولات نشطة',    value:stats.activeRounds,  color:'green',  famIds:[] },
              { icon:'✅', label:'أسر استلمت',    value:stats.receivedCount,  color:'blue',
                famIds: stats.allFams.filter(f=>{
                  const s=new Set(stats.allFams.filter(x=>x.id).map(x=>x.id)); return s.has(f.id)
                }).map(f=>f.id) },
              { icon:'⏳', label:'لم تستلم بعد', value:stats.notReceived,   color:'red',   famIds:[] },
            ].map(s => (
              <div key={s.label} onClick={() => s.famIds?.length && openDrillDown(s.icon+' '+s.label, s.famIds)}
                className={`bg-surface border border-border rounded-xl p-3 text-center ${s.famIds?.length?'cursor-pointer active:scale-95':''}`}>
                <div className="text-2xl mb-1">{s.icon}</div>
                <div className={`text-2xl font-black text-${s.color}`}>{s.value}</div>
                <div className="text-muted text-xs mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ DrillDown Modal ══ */}
      {drillDown && (
        <DrillDownModal
          title={drillDown.title}
          items={drillDown.items}
          campMap={campMap}
          onClose={() => setDrillDown(null)}
          onOpenFamily={openFamily}
        />
      )}

      {/* ══ تفاصيل الأسرة ══ */}
      {selFamily && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:1100,display:'flex',alignItems:'flex-end',justifyContent:'center'}}
          onClick={e=>e.target===e.currentTarget&&setSelFamily(null)}>
          <div style={{background:'#111827',borderRadius:'20px 20px 0 0',width:'100%',maxWidth:'500px',maxHeight:'90vh',overflow:'auto',padding:'20px'}}>
            <div className="flex justify-between items-center mb-4">
              <div className="text-accent font-black">👨‍👩‍👧‍👦 تفاصيل الأسرة</div>
              <button onClick={()=>setSelFamily(null)}
                className="bg-surface2 border border-border text-muted px-3 py-1.5 rounded-xl text-xs">✕</button>
            </div>

            <div className="bg-surface2 rounded-xl p-4 mb-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['الاسم',         selFamily.head_name],
                  ['رقم الهوية',    selFamily.head_id],
                  ['الجوال',        selFamily.phone1],
                  ['المخيم',        campMap[selFamily.camp_id]],
                  ['الجنس',         selFamily.head_gender],
                  ['الحالة الاجتماعية', selFamily.head_marital],
                  ['الخيمة',        selFamily.tent],
                ].filter(([,v])=>v).map(([k,v])=>(
                  <div key={k} className="bg-surface rounded-xl p-2.5">
                    <div className="text-muted text-[9px]">{k}</div>
                    <div className="text-white font-bold text-xs">{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {selMembers.length > 0 && (
              <div className="bg-surface2 rounded-xl p-3 mb-3">
                <div className="text-accent text-xs font-bold mb-2">👥 الأفراد ({selMembers.length+1})</div>
                <div className="flex flex-col gap-1.5">
                  <div className="bg-accent/10 rounded-xl px-3 py-2 flex justify-between">
                    <span className="text-white text-xs font-bold">{selFamily.head_name}</span>
                    <span className="text-accent text-xs">👑 رب الأسرة</span>
                  </div>
                  {selMembers.map(m=>(
                    <div key={m.id} className="bg-surface rounded-xl px-3 py-2 flex justify-between">
                      <div>
                        <div className="text-white text-xs font-bold">{m.name}</div>
                        <div className="text-muted text-[10px]">{m.relation}</div>
                      </div>
                      <span className="text-muted text-xs">
                        {m.gender==='ذكر'||m.gender==='male'?'👦':m.gender==='أنثى'||m.gender==='female'?'👧':'👤'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={() => { setSelFamily(null); navigate('/families', { state: { openFamily: selFamily.id } }) }}
              className="w-full bg-accent text-bg font-black py-3 rounded-xl text-sm">
              📋 فتح الملف الكامل
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function BarChart({ data, total, onDrill }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="flex flex-col gap-2.5">
      {data.map(item => {
        const pct      = total > 0 ? Math.round(item.value / total * 100) : 0
        const width    = Math.round(item.value / max * 100)
        const hasPersons = item.persons?.length > 0
        const hasFams    = item.famIds?.length > 0
        const clickable  = hasPersons || hasFams
        return (
          <div key={item.label}
            onClick={() => {
              if (!clickable) return
              if (hasPersons) onDrill?.(item.label, item.famIds, item.persons)
              else            onDrill?.(item.label, item.famIds)
            }}
            className={clickable ? 'cursor-pointer active:opacity-80' : ''}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-white font-medium truncate max-w-[160px]">{item.label}</span>
              <span className="text-muted">{item.value} ({pct}%)</span>
            </div>
            <div className="h-2.5 bg-surface2 rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${width}%` }} />
            </div>
            {clickable && <div className="text-[9px] text-accent mt-0.5">← اضغط لعرض القائمة</div>}
          </div>
        )
      })}
    </div>
  )
}
