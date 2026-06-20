import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useDataScope } from '../../lib/useDataScope'
import { useApp } from '../../context/AppContext'
import { fetchRecentFamilyActivity, TRACKED_FIELDS as FIELD_LABELS } from '../../lib/familyActivityLog'
import { useLocalDB } from '../../lib/useLocalDB'
import { supabase, ORG_ID } from '../../lib/supabase'

const REQUIRED = ['head_name','head_id','phone1','camp_id']
function checkIssues(f, mems) {
  const issues = []
  if (!f.head_name?.trim()) issues.push(1)
  if (!f.head_id?.trim())   issues.push(1)
  if (!f.phone1?.trim())    issues.push(1)
  if (!f.camp_id)           issues.push(1)
  const marital = (f.head_marital||'').trim()
  if (marital==='متزوج'||marital==='متزوجة') {
    if (!(mems||[]).some(m=>m.relation==='زوجة'||m.relation==='زوج')) issues.push(1)
  }
  return issues
}
function calcAge(dob) {
  if (!dob) return null
  const b=new Date(dob),t=new Date()
  let a=t.getFullYear()-b.getFullYear()
  if(t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate()))a--
  return a>=0&&a<120?a:null
}

export default function Dashboard() {
  const [stats,    setStats]    = useState(null)
  const [recent,     setRecent]     = useState([])
  const [activity,   setActivity]   = useState([])
  const [activityDetail, setActivityDetail] = useState(null) // عنصر النشاط المختار لعرض تفاصيله
  const [loading,  setLoading]  = useState(true)

  const { profile, isSuperAdmin, isOwner, isCampDelegate } = useAuth()
  const { getAllowedCampIds, applyScope, filterLocal } = useDataScope()
  const { showToast, online } = useApp()
  const navigate = useNavigate()

  const { query, bulkUpsert } = useLocalDB()
  // تحميل فوري عند فتح الصفحة
  useEffect(() => { loadStats() }, [])
  useEffect(() => { loadActivity() }, [])
  // Delta Sync — يحدّث الصفحة عند وصول تغييرات من مستخدمين آخرين
  useEffect(() => {
    const handler = () => { loadStats(); loadActivity() }
    window.addEventListener('delta-sync', handler)
    return () => window.removeEventListener('delta-sync', handler)
  }, [])

  async function loadActivity() {
    if (!navigator.onLine) return
    const rows = await fetchRecentFamilyActivity(8)
    setActivity(rows)
  }


  async function loadStats() {
    try {
      const [fams, camps, members] = await Promise.all([
        query('families'),
        query('camps'),
        query('family_members'),
      ])
      const campIds = getAllowedCampIds(camps)
      const filteredFams = filterLocal(fams, campIds)
      applyStats(filteredFams, camps, members)
      setLoading(false)
      // مزامنة في الخلفية
      if (navigator.onLine) {
        const { data: allCampsD } = await supabase.from('camps').select('*').eq('org_id', ORG_ID)
      const campIds = getAllowedCampIds(allCampsD || [])
      let famQ = supabase.from('families').select('*').eq('org_id', ORG_ID).limit(1000)
      famQ = applyScope(famQ, campIds)
      const [fRes, cRes] = await Promise.all([
        famQ,
        Promise.resolve({ data: allCampsD, error: null }),
      ])
        const f2 = !fRes.error ? (fRes.data || []) : fams
        const c2 = !cRes.error && cRes.data?.length ? cRes.data : camps
        await bulkUpsert('families', f2)
        await bulkUpsert('camps', c2)
        applyStats(f2, c2, members)
      }
    } catch(e) { console.error(e); setLoading(false) }
  }

  function applyStats(fams, camps, members) {
    const mByFam = {}
    members.forEach(m => { if(!mByFam[m.family_id]) mByFam[m.family_id]=[]; mByFam[m.family_id].push(m) })
    const incomplete = fams.filter(f => checkIssues(f, mByFam[f.id]).length > 0).length
    // فئات عمرية
    const allPersons = [
      ...fams.map(f=>({dob:f.head_dob})),
      ...members.map(m=>({dob:m.dob}))
    ]
    let children=0, adults=0, elderly=0, noAge=0
    allPersons.forEach(p => {
      const age = calcAge(p.dob)
      if (age===null) { noAge++; return }
      if (age<18) children++
      else if (age<60) adults++
      else elderly++
    })
    const total = Math.max(fams.length + members.length, 1)
    // توزيع المخيمات
    const campCount = {}
    fams.forEach(f => { campCount[f.camp_id] = (campCount[f.camp_id]||0)+1 })
    const campBars = camps
      .filter(c => campCount[c.id] > 0)
      .sort((a,b) => (campCount[b.id]||0) - (campCount[a.id]||0))
      .map(c => ({ name:c.name, count:campCount[c.id]||0, pct:Math.round((campCount[c.id]||0)/Math.max(fams.length,1)*100) }))
    setStats({ families:fams.length, members:fams.length+members.length, camps:camps.length, incomplete, children, adults, elderly, noAge, total, campBars })
    // آخر 5 أسر
    const campMap2 = Object.fromEntries(camps.map(c=>[c.id,c.name]))
    const sorted = [...fams].sort((a,b)=>new Date(b.updated_at||0)-new Date(a.updated_at||0)).slice(0,5)
    setRecent(sorted.map(f=>({...f, campName:campMap2[f.camp_id]||'—'})))
  }

  const hour = new Date().getHours()
  const greet = hour<12 ? 'صباح الخير' : hour<17 ? 'مساء الخير' : 'مساء النور'

  return (
    <div className="pb-4">
      {/* ترحيب */}
      <div className="mb-4">
        <p className="text-muted text-sm">{greet}،</p>
        <h1 className="text-white font-black text-xl">{profile?.full_name||'مرحباً'} 👋</h1>
      </div>

      {/* إحصائيات رئيسية */}
      <div className="grid grid-cols-2 gap-2 mb-4" style={{gridTemplateColumns:'repeat(2,1fr)'}}>
        {[
          { icon:'👨‍👩‍👧‍👦', label:'الأسر',        value: stats?.families,  color:'#f59e0b', path:'/families',              state: null },
          { icon:'👤',       label:'الأفراد',      value: stats?.members,   color:'#3b82f6', path:'/families',              state: null },
          { icon:'⛺',       label:'المخيمات',     value: stats?.camps,     color:'#10b981', path:'/camps',                 state: null },
          { icon:'⚠️',       label:'بيانات ناقصة', value: stats?.incomplete,color: stats?.incomplete > 0 ? '#ef4444' : '#6b7280', path:'/families', state: { filterMiss:'incomplete' } },
        ].map(s => (
          <div key={s.label}
            className="bg-surface border border-border rounded-xl p-3 text-center cursor-pointer active:scale-95 transition-all"
            onClick={() => navigate(s.path, s.state ? { state: s.state } : undefined)}>
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="text-2xl font-black" style={{color:s.color}}>
              {loading ? '—' : (s.value ?? 0)}
            </div>
            <div className="text-muted text-[10px] mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* توزيع المخيمات + الفئات العمرية */}
      {stats && stats.families > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-4" style={{gridTemplateColumns:'1fr 1fr'}}>
          {/* توزيع المخيمات */}
          <div className="bg-surface border border-border rounded-xl p-3">
            <div className="text-accent text-xs font-bold mb-3">📊 توزيع المخيمات</div>
            {stats.campBars.slice(0,5).map(c => (
              <div key={c.name} className="mb-2">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-white truncate max-w-[70px]">{c.name}</span>
                  <span className="text-accent font-bold">{c.count}</span>
                </div>
                <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{width:`${c.pct}%`}}/>
                </div>
              </div>
            ))}
            {stats.campBars.length === 0 && <div className="text-muted text-[10px]">لا بيانات</div>}
          </div>

          {/* الفئات العمرية */}
          <div className="bg-surface border border-border rounded-xl p-3">
            <div className="text-blue text-xs font-bold mb-3">👶 الفئات العمرية</div>
            {[
              { label:'أطفال 0-17',    value:stats.children, color:'#10b981' },
              { label:'بالغون 18-59',  value:stats.adults,   color:'#3b82f6' },
              { label:'كبار 60+',      value:stats.elderly,  color:'#f59e0b' },
            ].map(b => (
              <div key={b.label} className="mb-2">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-white">{b.label}</span>
                  <span className="font-bold" style={{color:b.color}}>{b.value}</span>
                </div>
                <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{width:`${Math.round(b.value/stats.total*100)||0}%`, background:b.color}}/>
                </div>
              </div>
            ))}
            {stats.noAge > 0 && (
              <div className="text-muted text-[9px] mt-1">⚠️ {stats.noAge} بدون تاريخ ميلاد</div>
            )}
          </div>
        </div>
      )}

      {/* حالة الاتصال */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{background: online ? '#10b981' : '#ef4444'}}/>
            <span className="text-white text-sm font-bold">{online ? 'متصل' : 'غير متصل'}</span>
          </div>
          <span className="text-muted text-xs">
            {online ? '🟢 البيانات محدّثة من الخادم' : '🔴 تعمل بالبيانات المحلية المخزّنة'}
          </span>
        </div>
        {!online && (
          <p className="text-muted text-[10px] text-center mt-2">سيُعاد تحميل أحدث البيانات تلقائياً عند رجوع الاتصال</p>
        )}
      </div>

      {/* آخر تعديلات الأسر — إضافة / تعديل / حذف مع اسم المستخدم */}
      {activity.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4 mb-4">
          <div className="text-accent text-sm font-bold mb-3">📋 آخر تعديلات الأسر</div>
          <div className="flex flex-col gap-2">
            {activity.map(a => {
              const ACTION_STYLE = {
                insert: { label: 'أضاف',         color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
                update: { label: 'تم التعديل',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
                delete: { label: 'حذف الأسرة',   color: '#ef4444', bg: 'rgba(239,68,68,0.1)'  },
              }
              const st = ACTION_STYLE[a.action] || ACTION_STYLE.update
              const hasChanges = a.action === 'update' && a.changes && Object.keys(a.changes).length > 0
              return (
                <div key={a.id}
                  onClick={() => {
                    if (hasChanges) setActivityDetail(a)
                    else if (a.action !== 'delete') navigate('/families', { state: { openFamily: a.family_id, autoOpen: true } })
                  }}
                  className="flex items-center justify-between bg-surface2 rounded-xl px-3 py-2.5"
                  style={{ cursor: (hasChanges || a.action !== 'delete') ? 'pointer' : 'default' }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-xs font-bold truncate">{a.family_name || '—'}</div>
                    <div className="text-[10px] mt-0.5">
                      <span className="font-bold" style={{color:st.color}}>{a.actor_name || '—'}</span>
                      {' · '}
                      <span style={{color:st.color}}>{st.label}</span>
                      {hasChanges && <span className="text-muted"> · اضغط للتفاصيل</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-accent font-black text-sm">{a.members_count ?? 0}</span>
                    <span className="text-blue text-sm">👥</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal تفاصيل التعديل — القيمة القديمة والجديدة لكل حقل */}
      {activityDetail && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'16px'}}
          onClick={e => e.target===e.currentTarget && setActivityDetail(null)}>
          <div style={{background:'#1a1a2e',border:'1px solid #374151',borderRadius:'20px 20px 0 0',width:'100%',maxWidth:'500px',padding:'20px',maxHeight:'80vh',overflow:'auto'}}>
            <div className="flex items-center justify-between mb-4">
              <div className="text-white font-black text-sm">✏️ تفاصيل التعديل — {activityDetail.family_name}</div>
              <button onClick={() => setActivityDetail(null)}
                className="text-muted text-xs px-3 py-1.5 rounded-xl bg-surface2 border border-border">✕ إغلاق</button>
            </div>
            <div className="text-muted text-[10px] mb-3">
              عدّل <span className="font-bold text-accent">{activityDetail.actor_name}</span>
            </div>
            <div className="flex flex-col gap-2">
              {Object.entries(activityDetail.changes || {}).map(([field, val]) => (
                <div key={field} className="bg-surface2 border border-border rounded-xl p-3">
                  <div className="text-white text-xs font-bold mb-1.5">{FIELD_LABELS[field] || field}</div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="px-2 py-1 rounded-lg flex-1 truncate" style={{background:'rgba(239,68,68,0.1)', color:'#ef4444'}}>
                      {val.old || '(فاضي)'}
                    </span>
                    <span className="text-muted">←</span>
                    <span className="px-2 py-1 rounded-lg flex-1 truncate" style={{background:'rgba(16,185,129,0.1)', color:'#10b981'}}>
                      {val.new || '(فاضي)'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}


      {/* إجراءات سريعة */}
      <div className="bg-surface border border-border rounded-xl p-3 mb-4">
        <div className="text-white text-xs font-bold mb-3">⚡ إجراءات سريعة</div>
        <div className="grid grid-cols-2 gap-2" style={{gridTemplateColumns:'1fr 1fr'}}>
          {[
            { icon:'➕', label:'إضافة أسرة',  path:'/families/add' },
            { icon:'🏕️', label:'المخيمات',    path:'/camps' },
            { icon:'📦', label:'التوزيعات',   path:'/distributions' },
            { icon:'📈', label:'التقارير',    path:'/analysis' },
            { icon:'🔄', label:'حركات الأسر', path:'/movements' },
            { icon:'🔔', label:'التنبيهات',   path:'/alerts' },
          ].map(a => (
            <button key={a.path} onClick={() => navigate(a.path)}
              className="flex items-center gap-2 bg-surface2 border border-border rounded-xl px-3 py-2.5 text-xs font-bold text-white active:scale-95 transition-all">
              <span className="text-lg">{a.icon}</span>{a.label}
            </button>
          ))}
        </div>
      </div>

      {/* إذا لا بيانات */}
      {!loading && stats?.families === 0 && (
        <div className="text-center py-8">
          <div className="text-4xl mb-3">📥</div>
          <div className="text-white font-bold mb-1">لا توجد بيانات</div>
          <div className="text-muted text-xs mb-4">{online ? 'لم يتم العثور على أسر مسجّلة بعد' : 'لا يوجد اتصال — تحقق من الشبكة وأعد المحاولة'}</div>
          <button onClick={loadStats}
            className="font-black px-5 py-2.5 rounded-xl text-sm"
            style={{background:'#f59e0b', color:'#000'}}>
            🔄 إعادة التحميل
          </button>
        </div>
      )}
    </div>
  )
}
