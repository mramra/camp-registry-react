/**
 * EducationStatus.jsx — الحالة الدراسية وتتبّع التأخر التعليمي
 * كل طفل بعمر الدراسة (4-17) يظهر تلقائياً بمرحلته المتوقعة حسب عمره فقط (بدون أي
 * إدخال يدوي) — الموظف فقط يضع علامة "متأخر دراسياً" على الحالات التي يعرفها فعلاً
 * (استثناءات قليلة بدل إدخال كل طفل يدوياً). education_delayed عمود بسيط (true/false)
 * بـ family_members، لا يُحسَب تلقائياً ولا يُشتق — قرار يدوي صريح من الموظف فقط.
 */
import { useState, useEffect, useMemo } from 'react'
import { useApp }  from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { ORG_ID, supabase, useLocalDB, visibleFamilies } from '../../lib/db'
import { calcAge, getExpectedGrade, isSchoolAge } from '../../lib/helpers'
import { useDataScope } from '../../lib/useDataScope'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import Badge from '../../components/ui/Badge'

export default function EducationStatus() {
  const [families, setFamilies] = useState([])
  const [members,  setMembers]  = useState([])
  const [camps,    setCamps]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [busyId,   setBusyId]   = useState(null)
  const [campFilter, setCampFilter] = useState('')
  const [onlyDelayed, setOnlyDelayed] = useState(false)

  const { showToast }      = useApp()
  const { canWrite, isOwner } = useAuth()
  const { query }           = useLocalDB()
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
    const map = {}; camps.forEach(c => { map[c.id] = c.name }); return map
  }, [camps])
  const famMap = useMemo(() => {
    const map = {}; families.forEach(f => { map[f.id] = f }); return map
  }, [families])

  // أطفال بعمر الدراسة فقط (رب الأسرة لو بهذا العمر + كل الأفراد)
  const schoolKids = useMemo(() => {
    const list = []
    families.forEach(f => {
      const age = calcAge(f.head_dob)
      if (isSchoolAge(age)) {
        list.push({ id: f.id + '_head', isHead: true, family_id: f.id, name: f.head_name, age, dob: f.head_dob })
      }
    })
    members.forEach(m => {
      const age = calcAge(m.dob)
      if (isSchoolAge(age)) {
        list.push({ id: m.id, isHead: false, family_id: m.family_id, name: m.name, age, dob: m.dob, education_delayed: m.education_delayed })
      }
    })
    return list
  }, [families, members])

  const scoped = useMemo(() => {
    if (!campFilter) return schoolKids
    return schoolKids.filter(k => famMap[k.family_id]?.camp_id === campFilter)
  }, [schoolKids, campFilter, famMap])

  const delayedCount = scoped.filter(k => k.education_delayed).length

  const filtered = useMemo(() => {
    return onlyDelayed ? scoped.filter(k => k.education_delayed) : scoped
  }, [scoped, onlyDelayed])

  async function toggleDelayed(kid) {
    if (!canWrite) return showToast('⛔ لا تملك صلاحية التعديل', true)
    if (kid.isHead) return // رب الأسرة لا يُسجَّل بـ family_members، لا عمود لتعليمه هنا
    setBusyId(kid.id)
    try {
      const next = !kid.education_delayed
      const { error } = await supabase.from('family_members').update({ education_delayed: next }).eq('id', kid.id)
      if (error) throw error
      setMembers(ms => ms.map(m => m.id === kid.id ? { ...m, education_delayed: next } : m))
      showToast(next ? '✅ تم وضع علامة متأخر دراسياً' : '✅ تم إلغاء العلامة')
    } catch (err) {
      showToast('خطأ: ' + err.message, true)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon="🎒"
        title="الحالة الدراسية"
        subtitle={`${scoped.length} طفل بعمر الدراسة${delayedCount ? ` — ⚠️ ${delayedCount} متأخر دراسياً` : ''}`}
      />

      <Card>
        <div className="flex flex-col gap-2">
          <select value={campFilter} onChange={e => setCampFilter(e.target.value)}
            className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-sm text-white font-bold outline-none">
            <option value="">⛺ كل المخيمات</option>
            {camps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={() => setOnlyDelayed(v => !v)}
            className={`w-full font-bold text-sm rounded-xl px-4 py-2.5 border transition-all ${onlyDelayed ? 'bg-red/15 border-red text-red' : 'bg-surface2 border-border text-muted'}`}>
            {onlyDelayed ? '⚠️ عرض المتأخرين فقط (مفعَّل)' : 'عرض الكل'}
          </button>
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-surface2 rounded-xl p-3 text-center">
            <div className="text-xl font-black text-blue">{scoped.length}</div>
            <div className="text-muted text-[10px] mt-0.5">إجمالي بعمر الدراسة</div>
          </div>
          <div className="bg-surface2 rounded-xl p-3 text-center">
            <div className="text-xl font-black text-red">{delayedCount}</div>
            <div className="text-muted text-[10px] mt-0.5">متأخرون دراسياً</div>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="🎒" title={onlyDelayed ? 'لا يوجد متأخرون دراسياً مسجَّلون' : 'لا يوجد أطفال بعمر الدراسة'} />
      ) : (
        <div className="space-y-2">
          {filtered.map(kid => {
            const f = famMap[kid.family_id] || {}
            const expected = getExpectedGrade(kid.age)
            return (
              <Card key={kid.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-white font-black text-sm truncate">{kid.name || '—'}</p>
                    <p className="text-muted text-xs mt-0.5">
                      {kid.age} سنة · {campMap[f.camp_id] || '—'} · 👨‍👩‍👧 {f.head_name || '—'}
                    </p>
                    {expected && (
                      <div className="mt-1.5">
                        <Badge color="blue">🎓 المرحلة المتوقعة: {expected}</Badge>
                      </div>
                    )}
                  </div>
                  {!kid.isHead && (
                    <button onClick={() => toggleDelayed(kid)} disabled={busyId === kid.id}
                      className={`flex-shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg border disabled:opacity-50 ${
                        kid.education_delayed ? 'bg-red/15 border-red text-red' : 'bg-surface2 border-border text-muted'}`}>
                      {kid.education_delayed ? '⚠️ متأخر' : 'وضع علامة تأخر'}
                    </button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
