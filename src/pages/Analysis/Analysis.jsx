import { useState, useEffect } from 'react'
import { localDB } from '../../lib/db'
import { supabase, ORG_ID } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { useDataScope } from '../../lib/useDataScope'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'

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

export default function Analysis() {
  const [tab,        setTab]        = useState('overview')
  const [stats,      setStats]      = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [filterCamp, setFilterCamp] = useState('all')
  const { showToast, online } = useApp()
  const { getAllowedCampIds, applyScope, filterLocal } = useDataScope()

  useEffect(() => { loadStats() }, [filterCamp])

  async function loadStats() {
    setLoading(true)
    try {
      // جلب كل البيانات من Dexie أولاً
      const [allFamiliesLocal, camps, members, rounds, distFams] = await Promise.all([
        localDB.families.toArray().catch(() => []),
        localDB.camps.toArray().catch(() => []),
        localDB.family_members.toArray().catch(() => []),
        localDB.dist_rounds.toArray().catch(() => []),
        localDB.camp_dist_families.toArray().catch(() => []),
      ])

      // مزامنة في الخلفية إذا متصل
      if (online) {
        Promise.all([
  supabase.from('camps').select('*').eq('org_id', ORG_ID).then(async ({data: ac}) => {
            const cIds = getAllowedCampIds(ac||[])
            let q = supabase.from('families').select('*').eq('org_id', ORG_ID)
            q = applyScope(q, cIds)
            const {data} = await q
            if (data) await localDB.families.bulkPut(data).catch(()=>{})
          }),
          supabase.from('family_members').select('*')
            .then(({ data }) => data && localDB.family_members.bulkPut(data).catch(() => {})),
        ]).catch(() => {})
      }

      const campIds = getAllowedCampIds(camps)
      const families = filterLocal(allFamiliesLocal, campIds)
      const campMap = Object.fromEntries(camps.map(c => [c.id, c.name]))

      // فلتر مخيم
      const fams = filterCamp === 'all' ? families : families.filter(f => f.camp_id === filterCamp)
      const famIds = new Set(fams.map(f => f.id))
      const mems = members.filter(m => famIds.has(m.family_id))

      // كل الأفراد (رب الأسرة + الأفراد)
      const allPersons = [
        ...fams.map(f => ({ dob: f.head_dob, gender: f.head_gender, isHead: true })),
        ...mems.map(m => ({ dob: m.dob, gender: m.gender, health: m.health, orphan: m.orphan_status }))
      ]

      // الحالة
      const byStatus = {
        active:   fams.filter(f => f.status === 'active').length,
        pending:  fams.filter(f => f.status === 'pending').length,
        departed: fams.filter(f => f.status === 'departed').length,
      }

      // حسب المخيم
      const byCamp = camps
        .map(c => ({ id: c.id, name: c.name, count: fams.filter(f => f.camp_id === c.id).length }))
        .filter(c => c.count > 0)
        .sort((a, b) => b.count - a.count)

      // الفئات العمرية
      const ageData = AGE_GROUPS.map(g => ({
        label: g.label,
        count: allPersons.filter(p => { const a = calcAge(p.dob); return a !== null && a >= g.min && a <= g.max }).length
      }))

      // الجنس
      const males   = allPersons.filter(p => p.gender === 'ذكر'   || p.gender === 'male').length
      const females = allPersons.filter(p => p.gender === 'أنثى' || p.gender === 'female').length
      const noGender = allPersons.length - males - females

      // الصحة (الأفراد فقط)
      const healthData = {
        'سليم': mems.filter(m => !m.health || m.health === 'سليم').length,
        'مريض': mems.filter(m => m.health === 'مريض').length,
        'معاق': mems.filter(m => m.health === 'معاق').length,
        'مزمن': mems.filter(m => m.health === 'مزمن').length,
        'مصاب': mems.filter(m => m.health === 'مصاب').length,
      }

      // النساء
      const women = allPersons.filter(p => p.gender === 'أنثى' || p.gender === 'female')
      const womenGroups = AGE_GROUPS.map(g => ({
        label: g.label,
        count: women.filter(w => { const a = calcAge(w.dob); return a !== null && a >= g.min && a <= g.max }).length
      }))

      // الأطفال
      const children = allPersons.filter(p => { const a = calcAge(p.dob); return a !== null && a < 18 })
      const orphans  = mems.filter(m => m.orphan_status).length

      // البيانات الناقصة
      const REQUIRED = ['head_name', 'head_id', 'phone1', 'camp_id']
      const incomplete = fams.filter(f => REQUIRED.some(k => !f[k]?.toString().trim())).length

      // إحصائيات التوزيع
      const activeRounds = rounds.filter(r => r.status === 'active').length
      const distFamIds   = new Set(distFams.map(d => d.family_id))
      const receivedCount = fams.filter(f => distFamIds.has(f.id)).length
      const notReceived   = fams.filter(f => f.status === 'active' && !distFamIds.has(f.id)).length

      setStats({
        total: fams.length,
        totalPersons: fams.length + mems.length,
        byStatus, byCamp, ageData,
        males, females, noGender,
        healthData,
        women: women.length, womenGroups,
        children: children.length, orphans,
        incomplete,
        camps, campMap,
        rounds: rounds.length, activeRounds, receivedCount, notReceived,
      })
    } catch(err) { showToast('خطأ في التحميل: ' + err.message, true) }
    finally { setLoading(false) }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>
  if (!stats)  return <EmptyState icon="📊" title="لا توجد بيانات" />

  return (
    <div>
      <PageHeader icon="📈" title="التقارير والتحليلات" />

      {/* فلتر المخيم */}
      <select value={filterCamp} onChange={e => setFilterCamp(e.target.value)}
        className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent mb-4">
        <option value="all">🏕️ كل المخيمات ({stats.total} أسرة)</option>
        {stats.byCamp.map(c => (
          <option key={c.id} value={c.id}>{c.name} ({c.count})</option>
        ))}
      </select>

      {/* التبويبات */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 no-scrollbar">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-[11px] font-bold border transition-all
              ${tab === t.key
                ? 'bg-accent text-bg border-accent'
                : 'bg-surface2 border-border text-muted'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ نظرة عامة ══════════════════════════════════════ */}
      {tab === 'overview' && (
        <div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              ['👨‍👩‍👧‍👦', 'الأسر',     stats.total,         'accent'],
              ['👤',       'الأفراد',   stats.totalPersons,  'blue'],
              ['👩',       'نساء',      stats.women,         'purple'],
              ['🧒',       'أطفال',     stats.children,      'green'],
              ['⚠️',       'ناقصة',    stats.incomplete,    'red'],
              ['🏕️',      'مخيمات',   stats.byCamp.length, 'accent'],
            ].map(([icon, label, value, color]) => (
              <div key={label} className="bg-surface border border-border rounded-xl p-3 text-center">
                <div className="text-2xl mb-1">{icon}</div>
                <div className={`text-2xl font-black text-${color}`}>{value}</div>
                <div className="text-muted text-xs mt-1">{label}</div>
              </div>
            ))}
          </div>

          <Card title="توزيع الجنس" icon="🚻">
            <BarChart data={[
              { label: '👨 ذكور',    value: stats.males    },
              { label: '👩 إناث',    value: stats.females  },
              { label: '⬜ غير محدد', value: stats.noGender },
            ]} total={stats.males + stats.females + stats.noGender} />
          </Card>

          <Card title="حالة الأسر" icon="📊">
            <BarChart data={[
              { label: '🟢 نشط',    value: stats.byStatus.active   || 0 },
              { label: '🟡 معلق',   value: stats.byStatus.pending  || 0 },
              { label: '🔴 مغادر',  value: stats.byStatus.departed || 0 },
            ]} total={stats.total} />
          </Card>
        </div>
      )}

      {/* ══ الأعمار ════════════════════════════════════════ */}
      {tab === 'age' && (
        <Card title="توزيع الفئات العمرية" icon="🎂">
          <div className="text-muted text-xs mb-3">يشمل رب الأسرة وجميع الأفراد ({stats.totalPersons} شخص)</div>
          <BarChart data={stats.ageData.map(a => ({ label: a.label, value: a.count }))} total={stats.totalPersons} />
        </Card>
      )}

      {/* ══ الصحة ══════════════════════════════════════════ */}
      {tab === 'health' && (
        <div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {Object.entries(stats.healthData).map(([k, v]) => {
              const icons  = { سليم: '✅', مريض: '🤒', معاق: '♿', مزمن: '💊', مصاب: '🩹' }
              const colors = { سليم: 'green', مريض: 'accent', معاق: 'purple', مزمن: 'red', مصاب: 'red' }
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
            <BarChart
              data={Object.entries(stats.healthData).map(([l, v]) => ({ label: l, value: v }))}
              total={Object.values(stats.healthData).reduce((a, b) => a + b, 0)} />
          </Card>
        </div>
      )}

      {/* ══ النساء ═════════════════════════════════════════ */}
      {tab === 'women' && (
        <div>
          <div className="bg-surface border border-border rounded-xl p-4 text-center mb-4">
            <div className="text-4xl font-black text-purple-400">{stats.women}</div>
            <div className="text-muted text-sm mt-1">إجمالي النساء والفتيات</div>
            <div className="text-muted text-xs mt-0.5">
              {stats.total > 0 ? Math.round(stats.women / stats.totalPersons * 100) : 0}% من إجمالي الأفراد
            </div>
          </div>
          <Card title="الفئات العمرية للنساء" icon="👩">
            <BarChart data={stats.womenGroups.map(g => ({ label: g.label, value: g.count }))} total={stats.women} />
          </Card>
        </div>
      )}

      {/* ══ الأطفال ════════════════════════════════════════ */}
      {tab === 'children' && (
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
            <BarChart data={stats.ageData.slice(0, 3).map(a => ({ label: a.label, value: a.count }))} total={stats.children} />
          </Card>
        </div>
      )}

      {/* ══ المخيمات ═══════════════════════════════════════ */}
      {tab === 'camps' && (
        <div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-surface border border-border rounded-xl p-3 text-center">
              <div className="text-3xl font-black text-accent">{stats.byCamp.length}</div>
              <div className="text-muted text-xs mt-1">مخيم نشط</div>
            </div>
            <div className="bg-surface border border-border rounded-xl p-3 text-center">
              <div className="text-3xl font-black text-blue">
                {stats.byCamp.length > 0 ? Math.round(stats.total / stats.byCamp.length) : 0}
              </div>
              <div className="text-muted text-xs mt-1">متوسط أسر/مخيم</div>
            </div>
          </div>
          <Card title="الأسر حسب المخيم" icon="🏕️">
            <BarChart data={stats.byCamp.map(c => ({ label: c.name, value: c.count }))} total={stats.total} />
          </Card>
        </div>
      )}

      {/* ══ التوزيعات ══════════════════════════════════════ */}
      {tab === 'dists' && (
        <div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              ['📦', 'جولات التوزيع',   stats.rounds,        'accent'],
              ['▶️', 'جولات نشطة',      stats.activeRounds,  'green'],
              ['✅', 'أسر استلمت',       stats.receivedCount, 'blue'],
              ['⏳', 'لم تستلم بعد',    stats.notReceived,   'red'],
            ].map(([icon, label, value, color]) => (
              <div key={label} className="bg-surface border border-border rounded-xl p-3 text-center">
                <div className="text-2xl mb-1">{icon}</div>
                <div className={`text-2xl font-black text-${color}`}>{value}</div>
                <div className="text-muted text-xs mt-1">{label}</div>
              </div>
            ))}
          </div>
          {stats.total > 0 && (
            <Card title="نسبة التوزيع" icon="📊">
              <div className="text-center mb-3">
                <div className="text-4xl font-black text-accent">
                  {Math.round(stats.receivedCount / stats.total * 100)}%
                </div>
                <div className="text-muted text-sm">من الأسر النشطة استلمت</div>
              </div>
              <BarChart data={[
                { label: '✅ استلمت',     value: stats.receivedCount },
                { label: '⏳ لم تستلم',  value: stats.notReceived   },
              ]} total={stats.total} />
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Bar Chart بسيط وسريع ─────────────────────────────
function BarChart({ data, total }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="flex flex-col gap-2.5">
      {data.map(item => {
        const pct   = total > 0 ? Math.round(item.value / total * 100) : 0
        const width = Math.round(item.value / max * 100)
        return (
          <div key={item.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-white font-medium truncate max-w-[140px]">{item.label}</span>
              <span className="text-muted">{item.value} ({pct}%)</span>
            </div>
            <div className="h-2 bg-surface2 rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${width}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
