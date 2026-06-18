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

const HEALTH_CATS = [
  { key: 'disabled', label: 'إعاقة',       icon: '🦽', color: 'text-purple-400', bg: 'bg-purple-500/15' },
  { key: 'injured',  label: 'إصابة حرب',   icon: '🩹', color: 'text-amber-400',  bg: 'bg-amber-500/15' },
  { key: 'chronic',  label: 'مرض مزمن',    icon: '💊', color: 'text-blue-400',   bg: 'bg-blue-500/15' },
  { key: 'pregnant', label: 'حمل',          icon: '🤰', color: 'text-pink-400',   bg: 'bg-pink-500/15' },
  { key: 'nursing',  label: 'رضاعة',        icon: '🤱', color: 'text-green-400',  bg: 'bg-green-500/15' },
]

function hasProp(val) {
  if (!val) return false
  if (Array.isArray(val)) return val.length > 0
  return true
}

export default function HealthReportPage() {
  const [families, setFamilies] = useState([])
  const [members,  setMembers]  = useState([])
  const [camps,    setCamps]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [campFilter, setCampFilter] = useState('')
  const [catFilter,  setCatFilter]  = useState('')

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
    const m = {}
    camps.forEach(c => { m[c.id] = c.name })
    return m
  }, [camps])

  // بناء قائمة الحالات الصحية (رب الأسرة + أفراد)
  const allCases = useMemo(() => {
    const list = []
    const famSet = new Set(families.map(f => f.id))

    families.forEach(f => {
      const types = []
      if (hasProp(f.head_disabilities))   types.push('disabled')
      if (hasProp(f.head_injuries))       types.push('injured')
      if (hasProp(f.head_chronic_diseases)) types.push('chronic')
      const fs = Array.isArray(f.head_female_status) ? f.head_female_status : []
      if (fs.includes('حامل')) types.push('pregnant')
      if (fs.includes('مرضع')) types.push('nursing')

      if (types.length > 0) {
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
          disabilities: f.head_disabilities,
          injuries:   f.head_injuries,
          chronic:    f.head_chronic_diseases,
        })
      }
    })

    members.filter(m => famSet.has(m.family_id)).forEach(m => {
      const f = families.find(x => x.id === m.family_id)
      if (!f) return
      const types = []
      if (hasProp(m.disabilities)) types.push('disabled')
      if (hasProp(m.injuries))     types.push('injured')
      if (hasProp(m.chronic_diseases)) types.push('chronic')
      const fs = Array.isArray(m.female_status) ? m.female_status : []
      if (fs.includes('حامل')) types.push('pregnant')
      if (fs.includes('مرضع')) types.push('nursing')

      if (types.length > 0) {
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
          disabilities: m.disabilities,
          injuries:   m.injuries,
          chronic:    m.chronic_diseases,
        })
      }
    })

    return list
  }, [families, members, campMap])

  const filtered = useMemo(() => {
    return allCases.filter(c => {
      if (campFilter && c.camp_id !== campFilter) return false
      if (catFilter  && !c.types.includes(catFilter)) return false
      return true
    })
  }, [allCases, campFilter, catFilter])

  // إحصاءات الأقسام
  const catCounts = useMemo(() => {
    const base = campFilter ? allCases.filter(c => c.camp_id === campFilter) : allCases
    return HEALTH_CATS.map(cat => ({
      ...cat,
      count: base.filter(c => c.types.includes(cat.key)).length,
    }))
  }, [allCases, campFilter])

  function exportExcel(subset) {
    try {
      const source = subset
        ? filtered.filter(c => c.types.includes(subset))
        : filtered
      if (!source.length) { showToast('لا توجد بيانات للتصدير', true); return }

      const rows = source.map(c => {
        const cats = c.types.map(t => HEALTH_CATS.find(x => x.key === t)?.label || t).join('،')
        return {
          'الاسم': c.name,
          'رقم الهوية': c.national_id || '',
          'العمر': c.age ?? '',
          'الجنس': c.gender || '',
          'الصلة': c.relation,
          'المخيم': c.camp,
          'الحالة الصحية': cats,
          'اسم رب الأسرة': c.head_name,
        }
      })
      const headers = Object.keys(rows[0])
      const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${r[h]}"`).join(','))].join('\n')
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const fname = subset ? `كشف_${HEALTH_CATS.find(x => x.key === subset)?.label}.csv` : 'كشف_الحالات_الصحية.csv'
      a.href = url; a.download = fname; a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      showToast('خطأ في التصدير: ' + err.message, true)
    }
  }

  function formatDetail(val, label) {
    if (!val) return null
    if (Array.isArray(val)) {
      if (!val.length) return null
      return `${label}: ${val.map(v => typeof v === 'object' ? v.label || JSON.stringify(v) : v).join('، ')}`
    }
    return `${label}: ${val}`
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="كشف الحالات الصحية"
        icon="⚕️"
        subtitle={`${filtered.length} حالة من ${allCases.length}`}
        action={canExport && filtered.length > 0
          ? { label: '📤 كشف شامل', onClick: () => exportExcel(null) }
          : undefined}
      />

      {/* بطاقات الإحصاء */}
      <div className="grid grid-cols-3 gap-2">
        {catCounts.map(cat => (
          <button
            key={cat.key}
            onClick={() => setCatFilter(catFilter === cat.key ? '' : cat.key)}
            className={`flex flex-col items-center p-3 rounded-xl border transition-all ${
              catFilter === cat.key
                ? `${cat.bg} border-current`
                : 'bg-surface2 border-border'
            }`}
          >
            <span className="text-xl">{cat.icon}</span>
            <span className={`text-lg font-black ${cat.color}`}>{cat.count}</span>
            <span className="text-[10px] text-muted text-center">{cat.label}</span>
          </button>
        ))}
      </div>

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

          <select
            value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-sm text-white font-bold outline-none"
          >
            <option value="">كل الحالات الصحية</option>
            {HEALTH_CATS.map(c => (
              <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
            ))}
          </select>

          {/* تصدير سريع */}
          {canExport && (
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => exportExcel('disabled')}
                className="flex-1 text-xs font-bold py-2 px-3 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
                🦽 إعاقات
              </button>
              <button onClick={() => exportExcel('injured')}
                className="flex-1 text-xs font-bold py-2 px-3 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                🩹 مصابون
              </button>
              <button onClick={() => exportExcel('chronic')}
                className="flex-1 text-xs font-bold py-2 px-3 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30">
                💊 مزمن
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* القائمة */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="⚕️" message="لا توجد حالات صحية بهذه المعايير" />
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const details = [
              formatDetail(c.disabilities, 'إعاقة'),
              formatDetail(c.injuries, 'إصابة'),
              formatDetail(c.chronic, 'مرض مزمن'),
            ].filter(Boolean)

            return (
              <Card key={c.id} className="p-3">
                <div className="flex items-start gap-2">
                  <div className="flex flex-col gap-1 mt-0.5">
                    {c.types.map(t => {
                      const cat = HEALTH_CATS.find(x => x.key === t)
                      return cat
                        ? <span key={t} className="text-lg">{cat.icon}</span>
                        : null
                    })}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-black text-sm truncate">{c.name}</p>
                    <p className="text-muted text-xs mt-0.5">
                      {c.gender} · {c.relation} · {c.camp}
                      {c.age !== null ? ` · ${c.age} سنة` : ''}
                    </p>
                    <p className="text-muted text-xs">👨‍👩‍👧 {c.head_name}</p>
                    {details.length > 0 && (
                      <p className="text-muted text-[11px] mt-1 leading-relaxed">{details.join(' | ')}</p>
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
            )
          })}
        </div>
      )}
    </div>
  )
}
