/**
 * EducationStatus.jsx — الحالة الدراسية: تصنيف موحَّد بأيقونات لكل المراحل
 * (روضة/ابتدائي/اعدادي/ثانوي للأطفال 4-17 حسب العمر تلقائياً، ودبلوم/بكالوريوس/
 * ماجستير/دكتوراه للبالغين 18+ من المؤهل المُسجَّل فعلياً بنموذج الأسرة).
 * الضغط على أيقونة يفلتر القائمة لتلك الفئة فقط، مع بحث بالاسم أو رقم الهوية.
 * تصديران Excel: قائمة الطلاب التفصيلية، وبانر المخيمات (مندوب/جوال/إحداثيات).
 * كلا التصديرين يحترمان فلتر المخيم + الفئة المختارة حالياً (الكل لو لا شيء محدَّد).
 */
import { useState, useEffect, useMemo } from 'react'
import { useApp }  from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { ORG_ID, supabase, useLocalDB, visibleFamilies } from '../../lib/db'
import { calcAge, getStageGroup, STAGE_ICONS, QUALIFICATION_OPTIONS } from '../../lib/helpers'
import { useDataScope } from '../../lib/useDataScope'
import { exportXLSX } from '../../lib/excelExport'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import Badge from '../../components/ui/Badge'

const CHILD_STAGES = ['روضة', 'ابتدائي', 'اعدادي', 'ثانوي']
const ADULT_STAGES = ['دبلوم', 'بكالوريوس', 'ماجستير', 'دكتوراه']

export default function EducationStatus() {
  const [families,   setFamilies]   = useState([])
  const [members,     setMembers]     = useState([])
  const [camps,       setCamps]       = useState([])
  const [orgMembers,  setOrgMembers]  = useState([]) // لمندوبي المخيمات (تصدير البانر)
  const [loading,     setLoading]     = useState(true)
  const [busyId,      setBusyId]      = useState(null)
  const [campFilter,  setCampFilter]  = useState('')
  const [stageFilter, setStageFilter] = useState('') // مفتاح من STAGE_ICONS أو '' = الكل
  const [search,      setSearch]      = useState('')

  const { showToast }       = useApp()
  const { canWrite, canExport, isOwner } = useAuth()
  const { query }            = useLocalDB()
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [fRaw, c, m, om] = await Promise.all([
        query('families'), query('camps'), query('family_members'), query('org_members'),
      ])
      const f = visibleFamilies(fRaw, isOwner)
      const campIds   = getAllowedCampIds(c)
      const scoped    = filterLocal(f, campIds)
      const scopedIds = new Set(scoped.map(x => x.id))
      const scopedMem = campIds === null ? m : m.filter(x => scopedIds.has(x.family_id))
      setFamilies(scoped); setCamps(getVisibleCamps(c)); setMembers(scopedMem); setOrgMembers(om)
    } catch (err) {
      showToast('خطأ في تحميل البيانات: ' + err.message, true)
    } finally {
      setLoading(false)
    }
  }

  const campMap = useMemo(() => Object.fromEntries(camps.map(c => [c.id, c.name])), [camps])
  const famMap  = useMemo(() => Object.fromEntries(families.map(f => [f.id, f])), [families])

  // قائمة موحَّدة: أطفال بمرحلتهم حسب العمر تلقائياً + بالغون بمؤهلهم المُسجَّل فعلياً فقط
  const people = useMemo(() => {
    const list = []
    families.forEach(f => {
      const age = calcAge(f.head_dob)
      const stage = age != null && age >= 18 ? (f.head_qualification || null) : getStageGroup(age)
      if (stage) list.push({
        id: f.id + '_head', isHead: true, family_id: f.id,
        name: f.head_name, national_id: f.head_id, age, stage,
      })
    })
    members.forEach(m => {
      const age = calcAge(m.dob)
      const stage = age != null && age >= 18 ? (m.qualification || null) : getStageGroup(age)
      if (stage) list.push({
        id: m.id, isHead: false, family_id: m.family_id,
        name: m.name, national_id: m.national_id, age, stage,
        education_delayed: m.education_delayed,
      })
    })
    return list
  }, [families, members])

  const scoped = useMemo(() => {
    if (!campFilter) return people
    return people.filter(p => famMap[p.family_id]?.camp_id === campFilter)
  }, [people, campFilter, famMap])

  const stageCounts = useMemo(() => {
    const c = {}
    STAGE_ICONS.forEach(s => { c[s.key] = scoped.filter(p => p.stage === s.key).length })
    return c
  }, [scoped])

  const byStage = useMemo(() => {
    return stageFilter ? scoped.filter(p => p.stage === stageFilter) : scoped
  }, [scoped, stageFilter])

  const filtered = useMemo(() => {
    if (!search.trim()) return byStage
    const q = search.trim().toLowerCase()
    return byStage.filter(p => (p.name || '').toLowerCase().includes(q) || (p.national_id || '').includes(q))
  }, [byStage, search])

  async function toggleDelayed(p) {
    if (!canWrite) return showToast('⛔ لا تملك صلاحية التعديل', true)
    if (p.isHead) return
    setBusyId(p.id)
    try {
      const next = !p.education_delayed
      const { error } = await supabase.from('family_members').update({ education_delayed: next }).eq('id', p.id)
      if (error) throw error
      setMembers(ms => ms.map(m => m.id === p.id ? { ...m, education_delayed: next } : m))
      showToast(next ? '✅ تم وضع علامة متأخر دراسياً' : '✅ تم إلغاء العلامة')
    } catch (err) {
      showToast('خطأ: ' + err.message, true)
    } finally {
      setBusyId(null)
    }
  }

  async function setQualification(p, value) {
    if (!canWrite) return showToast('⛔ لا تملك صلاحية التعديل', true)
    setBusyId(p.id)
    try {
      if (p.isHead) {
        const { error } = await supabase.from('families').update({ head_qualification: value || null }).eq('id', p.family_id)
        if (error) throw error
        setFamilies(fs => fs.map(f => f.id === p.family_id ? { ...f, head_qualification: value || null } : f))
      } else {
        const { error } = await supabase.from('family_members').update({ qualification: value || null }).eq('id', p.id)
        if (error) throw error
        setMembers(ms => ms.map(m => m.id === p.id ? { ...m, qualification: value || null } : m))
      }
      showToast('✅ تم الحفظ')
    } catch (err) {
      showToast('خطأ: ' + err.message, true)
    } finally {
      setBusyId(null)
    }
  }

  function exportStudents() {
    if (!canExport) return showToast('⛔ لا تملك صلاحية التصدير', true)
    if (!filtered.length) return showToast('لا توجد بيانات للتصدير', true)
    const rows = filtered.map(p => {
      const f = famMap[p.family_id] || {}
      return {
        'اسم الطالب':        p.name || '',
        'رقم الهوية':        p.national_id || '',
        'اسم رب الأسرة':     f.head_name || '',
        'رقم هوية رب الأسرة': f.head_id || '',
        'رقم التواصل':       f.phone1 || '',
        'المرحلة / المؤهل':  p.stage || '',
      }
    })
    exportXLSX(rows, 'الحالة الدراسية', stageFilter ? `طلاب_${stageFilter}` : 'طلاب_الكل')
  }

  function exportBanner() {
    if (!canExport) return showToast('⛔ لا تملك صلاحية التصدير', true)
    const byMemberId = Object.fromEntries(orgMembers.map(m => [m.id, m]))
    const visibleCampList = campFilter ? camps.filter(c => c.id === campFilter) : camps
    if (!visibleCampList.length) return showToast('لا توجد مخيمات للتصدير', true)
    const rows = visibleCampList.map(c => {
      const mgr = byMemberId[c.manager_id]
      const count = byStage.filter(p => famMap[p.family_id]?.camp_id === c.id).length
      return {
        'المخيم':         c.name || '',
        'المندوب':        mgr?.full_name || '',
        'جوال المندوب':   mgr?.phone || '',
        'خط العرض':       c.latitude ?? '',
        'خط الطول':       c.longitude ?? '',
        'عدد المطابقين':  count,
      }
    })
    exportXLSX(rows, 'بانر المخيمات', stageFilter ? `بانر_${stageFilter}` : 'بانر_الكل')
  }

  return (
    <div className="space-y-4">
      <PageHeader icon="🎓" title="الحالة الدراسية" subtitle={`${filtered.length} نتيجة`} />

      <Card>
        <select value={campFilter} onChange={e => setCampFilter(e.target.value)}
          className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-sm text-white font-bold outline-none">
          <option value="">⛺ كل المخيمات</option>
          {camps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Card>

      <Card>
        <div className="grid grid-cols-4 gap-2">
          {STAGE_ICONS.map(s => (
            <button key={s.key} onClick={() => setStageFilter(f => f === s.key ? '' : s.key)}
              className={`rounded-xl p-2 text-center border transition-all ${stageFilter === s.key ? 'bg-accent/20 border-accent' : 'bg-surface border-border'}`}>
              <div className="text-xl mb-0.5">{s.icon}</div>
              <div className="text-sm font-black text-white">{stageCounts[s.key] || 0}</div>
              <div className="text-muted text-[9px]">{s.label}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 بحث بالاسم أو رقم الهوية..."
          className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-sm text-white outline-none" />
      </Card>

      {canExport && (
        <div className="flex gap-2">
          <button onClick={exportStudents}
            className="flex-1 bg-green/10 border border-green/30 text-green font-bold text-sm rounded-xl px-3 py-2.5">
            📥 تصدير الطلاب
          </button>
          <button onClick={exportBanner}
            className="flex-1 bg-blue/10 border border-blue/30 text-blue font-bold text-sm rounded-xl px-3 py-2.5">
            📍 تصدير بانر المخيمات
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="🎓" title="لا توجد نتائج" />
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 100).map(p => {
            const f = famMap[p.family_id] || {}
            const stageMeta = STAGE_ICONS.find(s => s.key === p.stage)
            const isChild = CHILD_STAGES.includes(p.stage)
            const isAdult = ADULT_STAGES.includes(p.stage)
            return (
              <Card key={p.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-black text-sm truncate">{p.name || '—'}</p>
                    <p className="text-muted text-xs mt-0.5">
                      {p.age} سنة · {campMap[f.camp_id] || '—'} · 👨‍👩‍👧 {f.head_name || '—'}
                    </p>
                    {p.national_id && <p className="text-muted text-[10px] mt-0.5" dir="ltr">🪪 {p.national_id}</p>}
                    <div className="mt-1.5">
                      <Badge color={isAdult ? 'green' : 'blue'}>{stageMeta?.icon} {p.stage}</Badge>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {isChild && !p.isHead && (
                      <button onClick={() => toggleDelayed(p)} disabled={busyId === p.id}
                        className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border disabled:opacity-50 ${
                          p.education_delayed ? 'bg-red/15 border-red text-red' : 'bg-surface2 border-border text-muted'}`}>
                        {p.education_delayed ? '⚠️ متأخر' : 'وضع علامة تأخر'}
                      </button>
                    )}
                    {isAdult && (
                      <select value={p.stage || ''} disabled={busyId === p.id}
                        onChange={e => setQualification(p, e.target.value)}
                        className="bg-surface2 border border-border rounded-lg px-2 py-1.5 text-white text-xs outline-none disabled:opacity-50">
                        <option value="">غير مُسجَّل</option>
                        {QUALIFICATION_OPTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
          {filtered.length > 100 && (
            <div className="text-muted text-xs text-center py-2">عرض 100 من {filtered.length} — استخدم البحث لتضييق النتائج</div>
          )}
        </div>
      )}
    </div>
  )
}
