import { useState, useEffect, useMemo } from 'react'
import { useLocalDB }   from '../../lib/useLocalDB'
import { useApp }       from '../../context/AppContext'
import { useAuth }      from '../../context/AuthContext'
import { useDataScope } from '../../lib/useDataScope'
import PageHeader       from '../../components/ui/PageHeader'
import Card             from '../../components/ui/Card'
import Spinner          from '../../components/ui/Spinner'
import EmptyState       from '../../components/ui/EmptyState'

function calcAge(dob) {
  if (!dob) return null
  const d = new Date(dob)
  if (isNaN(d)) return null
  const today = new Date()
  let age = today.getFullYear() - d.getFullYear()
  const m = today.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--
  return age < 0 ? 0 : age
}

// تحليل JSON string أو array — يُعيد array دائماً
function parseArr(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  if (typeof val === 'string') {
    const s = val.trim().replace(/^"+|"+$/g, '') // إزالة "" المضاعفة
    if (!s || s === '[]' || s === 'null') return []
    try { const p = JSON.parse(s); return Array.isArray(p) ? p : [] }
    catch { return [] }
  }
  return []
}

// هل يوجد قيمة فعلية
function hasData(val) {
  return parseArr(val).length > 0
}

// نص العرض للمصفوفة
function arrLabel(val) {
  const arr = parseArr(val)
  if (!arr.length) return ''
  return arr.map(v => {
    if (typeof v === 'string') return v
    if (typeof v === 'object') return v.type || v.label || JSON.stringify(v)
    return String(v)
  }).join('، ')
}

const HEALTH_CATS = [
  { key: 'disabled', label: 'إعاقة',      icon: '🦽', color: 'text-purple-400', bg: 'bg-purple-500/15' },
  { key: 'injured',  label: 'إصابة حرب',  icon: '🩹', color: 'text-amber-400',  bg: 'bg-amber-500/15'  },
  { key: 'chronic',  label: 'مرض مزمن',   icon: '💊', color: 'text-blue-400',   bg: 'bg-blue-500/15'   },
  { key: 'pregnant', label: 'حمل',         icon: '🤰', color: 'text-pink-400',   bg: 'bg-pink-500/15'   },
  { key: 'nursing',  label: 'رضاعة',       icon: '🤱', color: 'text-green-400',  bg: 'bg-green-500/15'  },
]

export default function HealthReportPage() {
  const [families, setFamilies] = useState([])
  const [members,  setMembers]  = useState([])
  const [camps,    setCamps]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [campFilter, setCampFilter] = useState('')
  const [catFilter,  setCatFilter]  = useState('')
  const [showDiagnosis, setShowDiagnosis] = useState(false)

  const { showToast } = useApp()
  const { canExport }  = useAuth()
  const { query }      = useLocalDB()
  const { getAllowedCampIds, filterLocal } = useDataScope()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [f, c, m] = await Promise.all([
        query('families'),
        query('camps'),
        query('family_members'),
      ])
      const campIds   = getAllowedCampIds(c)
      const scoped    = filterLocal(f, campIds)
      const scopedIds = new Set(scoped.map(x => x.id))
      const scopedMem = campIds === null ? m : m.filter(x => scopedIds.has(x.family_id))
      setFamilies(scoped); setCamps(c); setMembers(scopedMem)
    } catch (err) {
      showToast('خطأ: ' + err.message, true)
    } finally {
      setLoading(false)
    }
  }

  const campMap = useMemo(() => {
    const m = {}; camps.forEach(c => { m[c.id] = c.name }); return m
  }, [camps])

  // رصد الأسر التي فيها رضيع (عمر < 2) لحساب المرضعات تلقائياً
  const CHILD_RELATIONS = ['ابن','ابنة','بنت','طفل','طفلة','رضيع','ابنه','بنته','son','daughter']
  // family_id → عدد الزوجات/أمهات المسجّلات بصلة محددة (لاستخدامه في حالة relation الفارغة)
  const famHasNamedWife = useMemo(() => {
    const s = new Set()
    const VALID_MOTHERS = ['زوجة','زوجة ثانية','زوجة ثالثة','زوجة رابعة','زوجه','أم','wife','mother']
    members.forEach(m => {
      const rel = (m.relation || '').trim()
      if (VALID_MOTHERS.includes(rel)) s.add(m.family_id)
    })
    return s
  }, [members])
  // الأسر التي فيها رضيع حقيقي (عمر < 2 + صلته ابن/بنت/طفل... فقط)
  const famWithInfant = useMemo(() => {
    const s = new Set()
    members.forEach(m => {
      const a   = calcAge(m.dob)
      const rel = (m.relation || '').trim()
      if (a !== null && a < 2 && CHILD_RELATIONS.includes(rel)) s.add(m.family_id)
    })
    return s
  }, [members])

  // تحديد أنواع الحالات الصحية لشخص
  function getTypes(person, isFamilyHead = false) {
    const types = []
    const health = (person.health || '').trim()

    // إعاقة
    if (health === 'معاق' || hasData(isFamilyHead ? person.head_disabilities : person.disabilities))
      types.push('disabled')

    // إصابة
    if (health === 'مصاب' || hasData(isFamilyHead ? person.head_injuries : person.injuries))
      types.push('injured')

    // مزمن
    if (health === 'مزمن' || hasData(isFamilyHead ? person.head_chronic_diseases : person.chronic_diseases))
      types.push('chronic')

    // حامل / مرضع
    const gender = (person.head_gender || person.gender || '').trim()
    const isFemale = gender.includes('أنثى') || gender.toLowerCase().includes('female') || gender.toLowerCase() === 'f'
    if (isFemale) {
      const fs = parseArr(isFamilyHead ? person.head_female_status : person.female_status)
      if (health === 'حامل' || fs.includes('حامل')) types.push('pregnant')


  // ── تشخيص: تحليل كل أسرة فيها رضيع — لماذا قُبلت/رُفضت كمرضعة ──
  const nursingDiagnosis = useMemo(() => {
    const VALID_MOTHERS = ['زوجة','زوجة ثانية','زوجة ثالثة','زوجة رابعة','زوجه','أم','wife','mother']
    const rows = []

    families.forEach(f => {
      const famMembers = members.filter(m => m.family_id === f.id)
      const infants = famMembers.filter(m => {
        const a = calcAge(m.dob); const rel = (m.relation || '').trim()
        return a !== null && a < 2 && CHILD_RELATIONS.includes(rel)
      })
      const nearInfants = famMembers.filter(m => {
        const a = calcAge(m.dob); const rel = (m.relation || '').trim()
        return a !== null && a < 2 && !CHILD_RELATIONS.includes(rel)
      })
      const headIsInfant = calcAge(f.head_dob) !== null && calcAge(f.head_dob) < 2

      if (!infants.length && !nearInfants.length && !headIsInfant) return

      const females = []
      if (f.head_gender === 'أنثى') {
        females.push({ name: f.head_name, relation: 'رب الأسرة (بلا صلة)', age: calcAge(f.head_dob), isHead: true })
      }
      famMembers.filter(m => m.gender === 'أنثى').forEach(m => {
        females.push({ name: m.name, relation: m.relation || '(فارغة)', age: calcAge(m.dob), isHead: false })
      })

      rows.push({
        family: f.head_name,
        camp: campMap[f.camp_id] || '—',
        infantsOk: infants.map(m => `${m.name} (${m.relation}, ${calcAge(m.dob)} سنة)`),
        infantsBadRelation: nearInfants.map(m => `${m.name} — صلته \"${m.relation || 'فارغة'}\" غير مطابقة`),
        headIsInfant,
        females: females.map(w => {
          let reason = ''
          if (!infants.length && !headIsInfant) {
            reason = '❌ لا رضيع بصلة معتمدة (ابن/بنت/طفل)'
          } else if (w.age !== null && (w.age < 15 || w.age > 50)) {
            reason = `❌ عمرها ${w.age} خارج 15-50`
          } else if (w.relation && w.relation !== '(فارغة)' && w.relation !== 'رب الأسرة (بلا صلة)' && !VALID_MOTHERS.includes(w.relation)) {
            reason = `❌ صلتها \"${w.relation}\" غير معتمدة`
          } else {
            reason = '✅ تُحسب كمرضعة'
          }
          return { ...w, reason }
        }),
      })
    })
    return rows
  }, [families, members, campMap])

      // ── مرضعة: مطابقة منطق isNursingMother في البرنامج القديم بالضبط ──
      const relation = (person.relation || '').trim()
      const age   = calcAge(isFamilyHead ? person.head_dob : person.dob)
      const famId = isFamilyHead ? person.id : person.family_id

      // 1) صريحة
      const explicitNursing = health === 'مرضع' || fs.includes('مرضع')

      // 2) تلقائية
      let autoNursing = false
      if (!explicitNursing) {
        const VALID_MOTHERS = ['زوجة','زوجة ثانية','زوجة ثالثة','زوجة رابعة','زوجه','أم','wife','mother']
        const inAgeRange = age === null || (age >= 15 && age <= 50)
        let relationOk = false
        if (relation) {
          relationOk = VALID_MOTHERS.includes(relation)
        } else if (!isFamilyHead) {
          relationOk = !famHasNamedWife.has(famId)
        } else {
          relationOk = true // رب أسرة أنثى بلا relation = أم الأسرة
        }
        autoNursing = inAgeRange && relationOk && famWithInfant.has(famId)
      }

      if (explicitNursing || autoNursing) types.push('nursing')
    }

    return types
  }

  // بناء قائمة الحالات الصحية
  const allCases = useMemo(() => {
    const list = []
    const famSet = new Set(families.map(f => f.id))

    // أرباب الأسر
    families.forEach(f => {
      const types = getTypes(f, true)
      if (!types.length) return
      list.push({
        id:         f.id + '_head',
        name:       f.head_name,
        national_id:f.head_id,
        age:        calcAge(f.head_dob),
        gender:     f.head_gender,
        relation:   'رب الأسرة',
        camp:       campMap[f.camp_id] || '—',
        camp_id:    f.camp_id,
        head_name:  f.head_name,
        types,
        _dis: arrLabel(f.head_disabilities),
        _inj: arrLabel(f.head_injuries),
        _chr: arrLabel(f.head_chronic_diseases),
      })
    })

    // الأفراد
    members.filter(m => famSet.has(m.family_id)).forEach(m => {
      const f = families.find(x => x.id === m.family_id)
      if (!f) return
      const types = getTypes(m, false)
      if (!types.length) return
      list.push({
        id:         m.id,
        name:       m.name,
        national_id:m.national_id,
        age:        calcAge(m.dob),
        gender:     m.gender,
        relation:   m.relation,
        camp:       campMap[f.camp_id] || '—',
        camp_id:    f.camp_id,
        head_name:  f.head_name,
        types,
        _dis: arrLabel(m.disabilities),
        _inj: arrLabel(m.injuries),
        _chr: arrLabel(m.chronic_diseases),
      })
    })

    return list
  }, [families, members, campMap, famWithInfant, famHasNamedWife])

  const filtered = useMemo(() => allCases.filter(c => {
    if (campFilter && c.camp_id !== campFilter) return false
    if (catFilter  && !c.types.includes(catFilter)) return false
    return true
  }), [allCases, campFilter, catFilter])

  const catCounts = useMemo(() => {
    const base = campFilter ? allCases.filter(c => c.camp_id === campFilter) : allCases
    return HEALTH_CATS.map(cat => ({
      ...cat,
      count: base.filter(c => c.types.includes(cat.key)).length,
    }))
  }, [allCases, campFilter])

  function exportCsv(subset) {
    const source = subset ? filtered.filter(c => c.types.includes(subset)) : filtered
    if (!source.length) { showToast('لا توجد بيانات للتصدير', true); return }
    const rows = source.map(c => ({
      'الاسم': c.name,
      'رقم الهوية': c.national_id || '',
      'العمر': c.age ?? '',
      'الجنس': c.gender || '',
      'الصلة': c.relation,
      'المخيم': c.camp,
      'الحالة الصحية': c.types.map(t => HEALTH_CATS.find(x => x.key === t)?.label || t).join('،'),
      'إعاقة': c._dis,
      'إصابة': c._inj,
      'مرض مزمن': c._chr,
      'اسم رب الأسرة': c.head_name,
    }))
    const h = Object.keys(rows[0])
    const csv = [h.join(','), ...rows.map(r => h.map(k => `"${r[k]}"`).join(','))].join('\n')
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })),
      download: subset ? `كشف_${HEALTH_CATS.find(x=>x.key===subset)?.label}.csv` : 'كشف_الحالات_الصحية.csv',
    })
    a.click()
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="كشف الحالات الصحية"
        icon="⚕️"
        subtitle={`${filtered.length} حالة من ${allCases.length}`}
        action={canExport && filtered.length > 0 && (
          <button onClick={() => exportCsv(null)}
            className="bg-accent text-bg font-black px-4 py-2 rounded-xl text-sm">
            📤 كشف شامل
          </button>
        )}
      />

      {/* بطاقات إحصاء — كل بطاقة فلتر */}
      <div className="grid grid-cols-3 gap-2">
        {catCounts.map(cat => (
          <button key={cat.key}
            onClick={() => setCatFilter(catFilter === cat.key ? '' : cat.key)}
            className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
              catFilter === cat.key
                ? `${cat.bg} border-current ${cat.color}`
                : 'bg-surface2 border-transparent'
            }`}
          >
            <span className="text-2xl">{cat.icon}</span>
            <span className={`text-xl font-black mt-1 ${cat.color}`}>{cat.count}</span>
            <span className="text-[10px] text-muted text-center leading-tight mt-0.5">{cat.label}</span>
          </button>
        ))}
      </div>

      {/* تشخيص المرضعات */}
      <button
        onClick={() => setShowDiagnosis(s => !s)}
        className="w-full text-xs font-bold py-2 rounded-xl border border-border text-muted hover:text-white hover:bg-surface2"
      >
        🔍 {showDiagnosis ? 'إخفاء' : 'عرض'} تشخيص حالات الرضاعة ({nursingDiagnosis.length} أسرة فيها رضيع)
      </button>

      {showDiagnosis && (
        <div className="space-y-2">
          {nursingDiagnosis.length === 0 ? (
            <Card><p className="text-muted text-xs text-center py-4">لا توجد أسر فيها رضيع</p></Card>
          ) : nursingDiagnosis.map((row, i) => (
            <Card key={i} className="p-3">
              <p className="text-white font-black text-sm">{row.family} <span className="text-muted text-xs">— {row.camp}</span></p>

              {row.infantsOk.length > 0 && (
                <p className="text-green-400 text-[11px] mt-1">👶 رضيع معتمد: {row.infantsOk.join('، ')}</p>
              )}
              {row.headIsInfant && (
                <p className="text-green-400 text-[11px] mt-1">👶 رب الأسرة نفسه رضيع (حالة نادرة)</p>
              )}
              {row.infantsBadRelation.length > 0 && (
                <p className="text-amber-400 text-[11px] mt-1">⚠️ {row.infantsBadRelation.join(' | ')}</p>
              )}

              <div className="mt-2 space-y-1">
                {row.females.map((w, j) => (
                  <div key={j} className="flex items-center justify-between text-[11px] bg-surface2 rounded-lg px-2 py-1.5">
                    <span className="text-white">{w.name} <span className="text-muted">({w.relation}{w.age !== null ? `, ${w.age} سنة` : ''})</span></span>
                    <span className={w.reason.startsWith('✅') ? 'text-green-400' : 'text-red-400'}>{w.reason}</span>
                  </div>
                ))}
                {row.females.length === 0 && (
                  <p className="text-red-400 text-[11px]">❌ لا توجد أي أنثى في هذه الأسرة — لا يمكن وجود مرضعة</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* فلاتر */}
      <Card>
        <div className="flex flex-col gap-2">
          <select value={campFilter} onChange={e => setCampFilter(e.target.value)}
            className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-sm text-white font-bold outline-none">
            <option value="">⛺ كل المخيمات</option>
            {camps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-sm text-white font-bold outline-none">
            <option value="">كل الحالات</option>
            {HEALTH_CATS.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
          </select>
          {canExport && (
            <div className="flex gap-2">
              {['disabled','injured','chronic'].map(k => {
                const cat = HEALTH_CATS.find(x => x.key === k)
                return (
                  <button key={k} onClick={() => exportCsv(k)}
                    className={`flex-1 text-xs font-bold py-2 px-2 rounded-xl border ${cat.bg} ${cat.color} border-current`}>
                    {cat.icon} {cat.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </Card>

      {/* القائمة */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="⚕️" message="لا توجد حالات صحية" />
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <Card key={c.id} className="p-3">
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-0.5 pt-0.5 flex-shrink-0">
                  {c.types.map(t => {
                    const cat = HEALTH_CATS.find(x => x.key === t)
                    return cat ? <span key={t} className="text-lg leading-none">{cat.icon}</span> : null
                  })}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-black text-sm truncate">{c.name}</p>
                  <p className="text-muted text-xs mt-0.5">
                    {c.gender} · {c.relation} · {c.camp}{c.age !== null ? ` · ${c.age} سنة` : ''}
                  </p>
                  <p className="text-muted text-xs">👨‍👩‍👧 {c.head_name}</p>
                  {(c._dis || c._inj || c._chr) && (
                    <div className="mt-1 space-y-0.5">
                      {c._dis && <p className="text-purple-400 text-[11px]">🦽 {c._dis}</p>}
                      {c._inj && <p className="text-amber-400  text-[11px]">🩹 {c._inj}</p>}
                      {c._chr && <p className="text-blue-400   text-[11px]">💊 {c._chr}</p>}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {c.types.map(t => {
                      const cat = HEALTH_CATS.find(x => x.key === t)
                      return cat ? (
                        <span key={t} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cat.bg} ${cat.color}`}>
                          {cat.icon} {cat.label}
                        </span>
                      ) : null
                    })}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
