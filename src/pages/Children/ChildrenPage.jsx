import { useState, useEffect, useMemo } from 'react'
import { useLocalDB }   from '../../lib/useLocalDB'
import { useApp }       from '../../context/AppContext'
import { useAuth }      from '../../context/AuthContext'
import { visibleFamilies } from '../../lib/familyApproval'
import { parseArr } from '../../lib/healthFields'
import { calcAge } from '../../lib/dateUtils'
import { useDataScope } from '../../lib/useDataScope'
import PageHeader       from '../../components/ui/PageHeader'
import Card             from '../../components/ui/Card'
import Spinner          from '../../components/ui/Spinner'
import EmptyState       from '../../components/ui/EmptyState'

function AgeBar({ value, max, color }) {
  const pct = max > 0 ? Math.round(value / max * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-surface2 rounded-full h-2 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-black min-w-[28px] text-right" style={{ color }}>{value}</span>
    </div>
  )
}

const AGE_GROUPS = [
  { label: 'رضيع (0–2)',       min: 0,  max: 2,  icon: '👶', color: '#f59e0b' },
  { label: 'طفل صغير (3–5)',   min: 3,  max: 5,  icon: '🧒', color: '#10b981' },
  { label: 'مدرسي (6–12)',     min: 6,  max: 12, icon: '📚', color: '#3b82f6' },
  { label: 'مراهق (13–17)',    min: 13, max: 17, icon: '🧑', color: '#8b5cf6' },
]

export default function ChildrenPage() {
  const [families, setFamilies] = useState([])
  const [members,  setMembers]  = useState([])
  const [camps,    setCamps]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [campFilter,  setCampFilter]  = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [genderFilter,setGenderFilter]= useState('')

  const { showToast } = useApp()
  const { canExport, isOwner }  = useAuth()
  const { query }      = useLocalDB()
  const { getAllowedCampIds, filterLocal } = useDataScope()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [fRaw, c, m] = await Promise.all([
        query('families'),
        query('camps'),
        query('family_members'),
      ])
      const f = visibleFamilies(fRaw, isOwner)
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
    const m = {}
    camps.forEach(c => { m[c.id] = c.name })
    return m
  }, [camps])

  // جمع كل الأطفال (دون 18)
  const allChildren = useMemo(() => {
    const list = []
    const famSet = new Set(families.map(f => f.id))

    // رب الأسرة إذا كان طفلاً (حالة نادرة)
    families.filter(f => calcAge(f.head_dob) !== null && calcAge(f.head_dob) < 18).forEach(f => {
      list.push({
        id:         f.id + '_head',
        name:       f.head_name,
        national_id:f.head_id,
        dob:        f.head_dob,
        age:        calcAge(f.head_dob),
        gender:     f.head_gender,
        relation:   'رب الأسرة',
        camp:       campMap[f.camp_id] || '—',
        camp_id:    f.camp_id,
        head_name:  f.head_name,
        disabilities: f.head_disabilities,
        chronic:    f.head_chronic_diseases,
        orphan:     f.head_orphan_status,
      })
    })

    // أفراد الأسرة الأطفال
    members.filter(m => {
      if (!famSet.has(m.family_id)) return false
      const age = calcAge(m.dob)
      return age !== null && age < 18
    }).forEach(m => {
      const f = families.find(x => x.id === m.family_id)
      if (!f) return
      list.push({
        id:         m.id,
        name:       m.name,
        national_id:m.national_id,
        dob:        m.dob,
        age:        calcAge(m.dob),
        gender:     m.gender,
        relation:   m.relation,
        camp:       campMap[f.camp_id] || '—',
        camp_id:    f.camp_id,
        head_name:  f.head_name,
        disabilities: m.disabilities,
        chronic:    m.chronic_diseases,
        orphan:     m.orphan_status,
      })
    })

    return list.sort((a, b) => a.age - b.age)
  }, [families, members, campMap])

  const filtered = useMemo(() => {
    return allChildren.filter(c => {
      if (campFilter   && c.camp_id !== campFilter) return false
      if (genderFilter && c.gender  !== genderFilter) return false
      if (groupFilter) {
        const g = AGE_GROUPS.find(x => x.label === groupFilter)
        if (g && (c.age < g.min || c.age > g.max)) return false
      }
      return true
    })
  }, [allChildren, campFilter, groupFilter, genderFilter])

  // إحصاءات الفئات العمرية
  const groupStats = useMemo(() => {
    const base = campFilter ? allChildren.filter(c => c.camp_id === campFilter) : allChildren
    return AGE_GROUPS.map(g => ({
      ...g,
      count: base.filter(c => c.age >= g.min && c.age <= g.max).length,
    }))
  }, [allChildren, campFilter])

  const maxGroupCount = Math.max(...groupStats.map(g => g.count), 1)

  const stats = useMemo(() => {
    const base = campFilter ? allChildren.filter(c => c.camp_id === campFilter) : allChildren
    return {
      total:   base.length,
      male:    base.filter(c => c.gender === 'ذكر').length,
      female:  base.filter(c => c.gender === 'أنثى').length,
      orphan:  base.filter(c => parseArr(c.orphan).length > 0 || c.orphan === true).length,
      disabled:base.filter(c => parseArr(c.disabilities).length > 0).length,
    }
  }, [allChildren, campFilter])

  function exportExcel() {
    try {
      const rows = filtered.map(c => ({
        'الاسم': c.name,
        'رقم الهوية': c.national_id || '',
        'العمر': c.age ?? '',
        'الجنس': c.gender || '',
        'الصلة': c.relation,
        'المخيم': c.camp,
        'اسم رب الأسرة': c.head_name,
        'يتيم': c.orphan ? 'نعم' : '',
        'إعاقة': c.disabilities && (Array.isArray(c.disabilities) ? c.disabilities.length : c.disabilities) ? 'نعم' : '',
      }))
      const headers = Object.keys(rows[0])
      const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${r[h]}"`).join(','))].join('\n')
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = 'سجل_الأطفال.csv'; a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      showToast('خطأ في التصدير: ' + err.message, true)
    }
  }

  function getAgeColor(age) {
    if (age < 3)  return '#f59e0b'
    if (age < 6)  return '#10b981'
    if (age < 13) return '#3b82f6'
    return '#8b5cf6'
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="سجل الأطفال"
        icon="🧒"
        subtitle={`${filtered.length} طفل من أصل ${allChildren.length}`}
        action={canExport && filtered.length > 0 && (
          <button onClick={exportExcel}
            className="bg-accent text-bg font-black px-4 py-2 rounded-xl text-sm">
            📤 تصدير
          </button>
        )}
      />

      {/* إحصاءات */}
      <Card>
        <div className="flex flex-wrap gap-2 justify-center mb-3">
          {[
            { v: stats.total,    l: 'إجمالي',     color: 'text-accent' },
            { v: stats.male,     l: '👦 ذكور',    color: 'text-blue-400' },
            { v: stats.female,   l: '👧 إناث',    color: 'text-pink-400' },
            { v: stats.orphan,   l: '🕊️ أيتام',  color: 'text-purple-400' },
            { v: stats.disabled, l: '🦽 إعاقة',   color: 'text-red-400' },
          ].map(s => (
            <div key={s.l} className="flex flex-col items-center bg-surface2 rounded-xl p-2 min-w-[60px]">
              <span className={`text-xl font-black ${s.color}`}>{s.v}</span>
              <span className="text-[10px] text-muted mt-0.5">{s.l}</span>
            </div>
          ))}
        </div>

        {/* أشرطة الفئات العمرية */}
        <div className="space-y-2">
          {groupStats.map(g => (
            <div key={g.label}>
              <div className="flex justify-between text-xs text-muted mb-0.5">
                <span>{g.icon} {g.label}</span>
              </div>
              <AgeBar value={g.count} max={maxGroupCount} color={g.color} />
            </div>
          ))}
        </div>
      </Card>

      {/* فلاتر */}
      <Card>
        <div className="flex flex-col gap-2">
          <select
            value={campFilter} onChange={e => setCampFilter(e.target.value)}
            className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-sm text-white font-bold outline-none"
          >
            <option value="">⛺ كل المخيمات</option>
            {camps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <div className="flex gap-2">
            <select
              value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
              className="flex-1 bg-surface2 border border-border rounded-xl px-3 py-2.5 text-sm text-white font-bold outline-none"
            >
              <option value="">كل الأعمار</option>
              {AGE_GROUPS.map(g => <option key={g.label} value={g.label}>{g.icon} {g.label}</option>)}
            </select>

            <select
              value={genderFilter} onChange={e => setGenderFilter(e.target.value)}
              className="flex-1 bg-surface2 border border-border rounded-xl px-3 py-2.5 text-sm text-white font-bold outline-none"
            >
              <option value="">الجنسان</option>
              <option value="ذكر">👦 ذكور</option>
              <option value="أنثى">👧 إناث</option>
            </select>
          </div>
        </div>
      </Card>

      {/* القائمة */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="🧒" message="لا توجد نتائج" />
      ) : (
        <div className="space-y-2">
          {filtered.map(child => {
            const hasDisab = parseArr(child.disabilities).length > 0
            const hasOrphan = parseArr(child.orphan).length > 0 || child.orphan === true
            return (
              <Card key={child.id} className="p-3">
                <div className="flex items-start gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-base font-black flex-shrink-0"
                    style={{ background: getAgeColor(child.age) + '25', color: getAgeColor(child.age) }}
                  >
                    {child.age}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-black text-sm truncate">{child.name}</p>
                    <p className="text-muted text-xs mt-0.5">
                      {child.gender} · {child.relation} · {child.camp}
                    </p>
                    <p className="text-muted text-xs">👨‍👩‍👧 {child.head_name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {hasOrphan && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">🕊️ يتيم</span>
                      )}
                      {hasDisab && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">🦽 إعاقة</span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
