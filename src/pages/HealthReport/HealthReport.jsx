/**
 * HealthReport.jsx — كشف الحالات الصحية (منقولة من النسخة القديمة page-health-report)
 * فلتر بالمخيم + بنوع الحالة (إعاقة/إصابة/مرض مزمن/حمل/رضاعة)، قائمة تفصيلية بالأفراد،
 * وتصدير Excel بـ 4 كشوف: شامل / إعاقات فقط / إصابات فقط / أمراض مزمنة فقط.
 *
 * ملاحظة: الحمل والرضاعة محسوبتان هنا فقط للعدّ والعرض (تطابقاً مع الكشف القديم)؛
 * الإدارة التفصيلية والتصدير الخاص بهما موجود أصلاً في صفحة "النساء".
 * الحالات الصحية تُحسَب من الحقول التفصيلية الحقيقية فقط (لا من عمود health القديم).
 */
import { useState, useEffect, useMemo } from 'react'
import { useApp }   from '../../context/AppContext'
import { useAuth }  from '../../context/AuthContext'
import { useLocalDB, visibleFamilies } from '../../lib/db'
import {
  parseArr, hasHealthData, arrLabel, calcAge,
  buildFamHasNamedWife, buildFamWithInfant, isAutoNursing,
} from '../../lib/helpers'
import { useDataScope } from '../../lib/useDataScope'
import { exportXLSX }   from '../../lib/excelExport'
import PageHeader  from '../../components/ui/PageHeader'
import Card        from '../../components/ui/Card'
import Spinner     from '../../components/ui/Spinner'
import EmptyState  from '../../components/ui/EmptyState'

const CATEGORIES = [
  { key: 'معاق', label: '🦽 إعاقة',     color: 'text-purple-400', bg: 'bg-purple-500/20' },
  { key: 'مصاب', label: '🩹 إصابة',     color: 'text-accent',      bg: 'bg-accent/20' },
  { key: 'مزمن', label: '💊 مرض مزمن', color: 'text-orange-400',  bg: 'bg-orange-500/20' },
  { key: 'حامل', label: '🤰 حمل',      color: 'text-pink-400',    bg: 'bg-pink-500/20' },
  { key: 'مرضع', label: '🤱 رضاعة',    color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
]

function StatBox({ value, label, color, active, onClick }) {
  return (
    <button onClick={onClick} type="button"
      className={`flex flex-col items-center justify-center bg-surface2 rounded-xl p-2.5 border transition-colors ${active ? 'border-accent' : 'border-transparent'}`}>
      <span className={`text-lg font-black ${color}`}>{value}</span>
      <span className="text-[10px] text-muted mt-0.5 text-center leading-tight">{label}</span>
    </button>
  )
}

export default function HealthReport() {
  const [families, setFamilies] = useState([])
  const [members,  setMembers]  = useState([])
  const [camps,    setCamps]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [campFilter, setCampFilter] = useState('')
  const [catFilter,  setCatFilter]  = useState('')

  const { showToast }     = useApp()
  const { canExport, isOwner } = useAuth()
  const { query }          = useLocalDB()
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope()

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
      setFamilies(scoped); setCamps(getVisibleCamps(c)); setMembers(scopedMem)
    } catch (err) {
      showToast('خطأ في تحميل البيانات: ' + err.message, true)
    } finally {
      setLoading(false)
    }
  }

  const campMap = useMemo(() => {
    const map = {}
    camps.forEach(c => { map[c.id] = c.name })
    return map
  }, [camps])

  const famMap = useMemo(() => {
    const map = {}
    families.forEach(f => { map[f.id] = f })
    return map
  }, [families])

  // كل الأفراد (رب الأسرة + بقية أفراد الأسرة) — بصرف النظر عن الجنس
  const allPersons = useMemo(() => {
    const list = []
    const famSet = new Set(families.map(f => f.id))

    families.forEach(f => {
      const fMems = members.filter(m => m.family_id === f.id)
      const headInMems = fMems.some(m =>
        (f.head_id && m.national_id && m.national_id.trim() === f.head_id.trim()) ||
        ['رب الأسرة', 'رب أسرة', 'head'].includes((m.relation || '').trim())
      )
      if (!headInMems) {
        list.push({
          id: f.id + '_head', isHead: true, family_id: f.id,
          name: f.head_name, national_id: f.head_id, dob: f.head_dob,
          age: calcAge(f.head_dob), gender: f.head_gender, relation: 'رب الأسرة',
          disabilities: f.head_disabilities, injuries: f.head_injuries,
          chronic: f.head_chronic_diseases, female_status: f.head_female_status,
        })
      }
    })

    members.filter(m => famSet.has(m.family_id)).forEach(m => {
      list.push({
        id: m.id, isHead: false, family_id: m.family_id,
        name: m.name, national_id: m.national_id, dob: m.dob,
        age: calcAge(m.dob), gender: m.gender, relation: m.relation,
        disabilities: m.disabilities, injuries: m.injuries,
        chronic: m.chronic_diseases, female_status: m.female_status,
      })
    })

    return list
  }, [families, members])

  const famHasNamedWife = useMemo(() => buildFamHasNamedWife(members), [members])
  const famWithInfant    = useMemo(() => buildFamWithInfant(members, families), [members, families])

  function isPregnant(p) {
    if (['ذكر', 'male'].includes(p.gender)) return false
    return parseArr(p.female_status).includes('حامل')
  }
  function isNursing(p) {
    if (['ذكر', 'male'].includes(p.gender)) return false
    if (parseArr(p.female_status).includes('مرضع')) return true
    return isAutoNursing(p, famHasNamedWife, famWithInfant)
  }

  // النطاق المحدَّد بفلتر المخيم
  const scoped = useMemo(() => {
    if (!campFilter) return allPersons
    return allPersons.filter(p => famMap[p.family_id]?.camp_id === campFilter)
  }, [allPersons, campFilter, famMap])

  const groups = useMemo(() => ({
    معاق: scoped.filter(p => hasHealthData(p.disabilities)),
    مصاب: scoped.filter(p => hasHealthData(p.injuries)),
    مزمن: scoped.filter(p => hasHealthData(p.chronic)),
    حامل: scoped.filter(isPregnant),
    مرضع: scoped.filter(isNursing),
  }), [scoped, famHasNamedWife, famWithInfant])

  const filtered = useMemo(() => {
    if (catFilter) return groups[catFilter] || []
    const seen = new Set()
    const out = []
    Object.values(groups).flat().forEach(p => {
      const key = p.family_id + '_' + p.id
      if (!seen.has(key)) { seen.add(key); out.push(p) }
    })
    return out
  }, [groups, catFilter])

  function exportReport(type) {
    const sourceMap = { all: filtered, disabled: groups['معاق'], injured: groups['مصاب'], chronic: groups['مزمن'] }
    const source = sourceMap[type] || []
    if (!source.length) return showToast('لا توجد بيانات للتصدير', true)

    const rows = source.map(p => {
      const f = famMap[p.family_id] || {}
      const row = {
        'الاسم': p.name || '',
        'رقم الهوية': p.national_id || '',
        'الجنس': p.gender || '',
        'تاريخ الميلاد': p.dob || '',
        'العمر': p.age ?? '',
        'صلة القرابة': p.relation || '',
        'اسم رب الأسرة': f.head_name || '',
        'هوية رب الأسرة': f.head_id || '',
        'الجوال': f.phone1 || '',
        'المخيم': campMap[f.camp_id] || '',
        'رقم الخيمة': f.tent || '',
        'العنوان الأصلي': f.original_address || '',
      }
      if (type === 'disabled') row['نوع الإعاقة']      = arrLabel(p.disabilities)
      if (type === 'injured')  row['نوع الإصابة']      = arrLabel(p.injuries)
      if (type === 'chronic')  row['الأمراض المزمنة']  = arrLabel(p.chronic)
      return row
    })

    const sheetNames = { all: 'كشف شامل', disabled: 'إعاقات', injured: 'إصابات', chronic: 'أمراض مزمنة' }
    const fileNames  = { all: 'كشف_صحي_شامل', disabled: 'كشف_الإعاقات', injured: 'كشف_الإصابات', chronic: 'كشف_الأمراض_المزمنة' }
    exportXLSX(rows, sheetNames[type], fileNames[type])
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="كشف الحالات الصحية"
        icon="⚕️"
        subtitle={`${filtered.length} حالة${catFilter ? ' — ' + catFilter : ''}`}
      />

      {canExport && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => exportReport('all')}
            className="flex-1 min-w-[70px] bg-accent text-bg font-black px-3 py-2.5 rounded-xl text-xs">
            📤 كشف شامل
          </button>
          <button onClick={() => exportReport('disabled')}
            className="flex-1 min-w-[70px] bg-purple-500/10 border border-purple-500 text-purple-400 font-bold px-3 py-2.5 rounded-xl text-xs">
            🦽 إعاقات
          </button>
          <button onClick={() => exportReport('injured')}
            className="flex-1 min-w-[70px] bg-accent/10 border border-accent text-accent font-bold px-3 py-2.5 rounded-xl text-xs">
            🩹 إصابات
          </button>
          <button onClick={() => exportReport('chronic')}
            className="flex-1 min-w-[70px] bg-orange-500/10 border border-orange-500 text-orange-400 font-bold px-3 py-2.5 rounded-xl text-xs">
            💊 مزمن
          </button>
        </div>
      )}

      <Card>
        <div className="flex flex-col gap-2">
          <select value={campFilter} onChange={e => setCampFilter(e.target.value)}
            className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-sm text-white font-bold outline-none">
            <option value="">⛺ كل المخيمات</option>
            {camps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-sm text-white font-bold outline-none">
            <option value="">كل الحالات الصحية</option>
            {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-3 gap-2">
          {CATEGORIES.map(c => (
            <StatBox key={c.key} value={groups[c.key]?.length || 0} label={c.label} color={c.color}
              active={catFilter === c.key} onClick={() => setCatFilter(catFilter === c.key ? '' : c.key)} />
          ))}
          <StatBox value={filtered.length} label="👥 الكل" color="text-blue-400"
            active={!catFilter} onClick={() => setCatFilter('')} />
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="✅" title="لا توجد حالات صحية مسجّلة بهذه المعايير" />
      ) : (
        <div className="space-y-2">
          {filtered.map(p => {
            const f = famMap[p.family_id] || {}
            const disStr = arrLabel(p.disabilities)
            const injStr = arrLabel(p.injuries)
            const chrStr = arrLabel(p.chronic)
            const pregnant = isPregnant(p)
            const nursing  = isNursing(p)
            return (
              <Card key={p.id} className="p-3">
                <p className="text-white font-black text-sm truncate">{p.name || '—'}</p>
                <p className="text-muted text-xs mt-0.5">
                  {p.relation || '—'} · {campMap[f.camp_id] || '—'} {p.age != null ? `· ${p.age} سنة` : ''}
                </p>
                {p.national_id && <p className="text-muted text-xs">🪪 {p.national_id}</p>}
                <p className="text-muted text-xs">👨‍👩‍👧 {f.head_name || '—'} · 📞 {f.phone1 || '—'}</p>
                {(disStr || injStr || chrStr || pregnant || nursing) && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {disStr && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">🦽 {disStr}</span>}
                    {injStr && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/20 text-accent">🩹 {injStr}</span>}
                    {chrStr && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">💊 {chrStr}</span>}
                    {pregnant && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-400">🤰 حامل</span>}
                    {nursing  && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">🤱 مرضع</span>}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
