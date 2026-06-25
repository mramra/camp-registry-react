/**
 * EducationStatus.jsx — الحالة الدراسية: تصنيف موحَّد بأيقونات لكل المراحل
 * (روضة/ابتدائي/اعدادي/ثانوي للأطفال 4-17 حسب العمر تلقائياً، ودبلوم/بكالوريوس/
 * ماجستير/دكتوراه للبالغين 18+ من المؤهل المُسجَّل فعلياً بنموذج الأسرة).
 * الضغط على أيقونة يفلتر القائمة لتلك الفئة فقط، مع بحث بالاسم أو رقم الهوية.
 *
 * التأخر الدراسي: يُحسَب تلقائياً بمقارنة الصف الفعلي المُسجَّل (actual_grade، يُدخَل
 * من نموذج إضافة/تعديل الأسرة فقط، معبّأ تلقائياً بالمتوقع حسب العمر) بالصف المتوقع
 * لعمره الآن — لا تعديل مباشر هنا، هذه الصفحة للعرض والبحث والتصدير فقط.
 *
 * تصديران Excel: قائمة الطلاب التفصيلية، وبانر المخيمات (مندوب/جوال/إحداثيات).
 * كلا التصديرين يحترمان فلتر المخيم + الفئة المختارة حالياً (الكل لو لا شيء محدَّد).
 */
import { useState, useEffect, useMemo } from 'react'
import { useApp }  from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { useLocalDB, visibleFamilies } from '../../lib/db'
import { calcAge, getStageGroup, getGradeDelay, getExpectedGrade, STAGE_ICONS, getCampDelegateInfo } from '../../lib/helpers'
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
  const [campFilter,  setCampFilter]  = useState('')
  const [stageFilter, setStageFilter] = useState('') // مفتاح من STAGE_ICONS أو '' = الكل
  const [search,      setSearch]      = useState('')

  const { showToast }    = useApp()
  const { canExport, isOwner } = useAuth()
  const { query }         = useLocalDB()
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

  // قائمة موحَّدة: أطفال بمرحلتهم حسب العمر تلقائياً (+ صفهم الفعلي المحدَّد + مقدار
  // تأخرهم الدراسي المحسوب من actual_grade) + بالغون بمؤهلهم المُسجَّل فعلياً فقط
  const people = useMemo(() => {
    const list = []
    families.forEach(f => {
      const age = calcAge(f.head_dob)
      const stage = age != null && age >= 18 ? (f.head_qualification || null) : getStageGroup(age)
      if (stage) list.push({
        id: f.id + '_head', isHead: true, family_id: f.id,
        name: f.head_name, national_id: f.head_id, age, dob: f.head_dob,
        stage, specificGrade: null, delay: 0,
      })
    })
    members.forEach(m => {
      const age = calcAge(m.dob)
      const isAdult = age != null && age >= 18
      const stage = isAdult ? (m.qualification || null) : getStageGroup(age)
      if (stage) list.push({
        id: m.id, isHead: false, family_id: m.family_id,
        name: m.name, national_id: m.national_id, age, dob: m.dob,
        stage, specificGrade: isAdult ? null : (m.actual_grade || getExpectedGrade(age)),
        delay: getGradeDelay(age, m.actual_grade),
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

  const delayedCount = useMemo(() => scoped.filter(p => p.delay > 0).length, [scoped])

  const byStage = useMemo(() => {
    return stageFilter ? scoped.filter(p => p.stage === stageFilter) : scoped
  }, [scoped, stageFilter])

  const filtered = useMemo(() => {
    if (!search.trim()) return byStage
    const q = search.trim().toLowerCase()
    return byStage.filter(p => (p.name || '').toLowerCase().includes(q) || (p.national_id || '').includes(q))
  }, [byStage, search])

  function exportStudents() {
    if (!canExport) return showToast('⛔ لا تملك صلاحية التصدير', true)
    if (!filtered.length) return showToast('لا توجد بيانات للتصدير', true)
    // من الأصغر للأكبر = تاريخ الميلاد الأحدث أولاً (تنازلياً)
    const sorted = [...filtered].sort((a, b) => (b.dob || '').localeCompare(a.dob || ''))
    const rows = sorted.map(p => {
      const f = famMap[p.family_id] || {}
      return {
        'اسم الطالب':        p.name || '',
        'رقم الهوية':        p.national_id || '',
        'تاريخ الميلاد':     p.dob || '',
        'العمر':             p.age ?? '',
        'اسم رب الأسرة':     f.head_name || '',
        'رقم هوية رب الأسرة': f.head_id || '',
        'رقم التواصل':       f.phone1 || '',
        'المرحلة / المؤهل':  p.specificGrade || p.stage || '',
        'متأخر دراسياً':     p.delay > 0 ? `نعم (${p.delay} صف)` : 'لا',
      }
    })

    // بانر المخيم — فقط لو اختير مخيم محدد، نفس تنسيق صفحتي النساء والأطفال
    let campInfo = null
    if (campFilter) {
      const camp = camps.find(c => c.id === campFilter)
      if (camp) {
        const delegate = getCampDelegateInfo(camp, orgMembers)
        campInfo = {
          campName: camp.name,
          delegateName: delegate?.name,
          delegatePhone: delegate?.phone,
          latitude: camp.latitude,
          longitude: camp.longitude,
        }
      }
    }

    exportXLSX(rows, 'الحالة الدراسية', stageFilter ? `طلاب_${stageFilter}` : 'طلاب_الكل', campInfo)
  }

  return (
    <div className="space-y-4">
      <PageHeader icon="🎓" title="الحالة الدراسية"
        subtitle={`${filtered.length} نتيجة${delayedCount ? ` — ⚠️ ${delayedCount} متأخر دراسياً` : ''}`} />

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
        <button onClick={exportStudents}
          className="w-full bg-green/10 border border-green/30 text-green font-bold text-sm rounded-xl px-3 py-2.5">
          📥 تصدير الطلاب
        </button>
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
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      <Badge color={isAdult ? 'green' : 'blue'}>{stageMeta?.icon} {p.specificGrade || p.stage}</Badge>
                      {p.delay > 0 && <Badge color="red">⚠️ متأخر {p.delay} صف</Badge>}
                    </div>
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
