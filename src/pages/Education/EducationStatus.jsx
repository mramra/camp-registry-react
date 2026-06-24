/**
 * EducationStatus.jsx — الحالة الدراسية (تبويبان)
 * 1) تأخر دراسي (4-17): كل طفل يظهر تلقائياً بمرحلته المتوقعة حسب عمره فقط (بدون أي
 *    إدخال يدوي) — الموظف فقط يضع علامة "متأخر دراسياً" على الاستثناءات التي يعرفها
 *    فعلياً. education_delayed عمود بسيط (true/false)، قرار يدوي صريح فقط.
 * 2) المؤهلات العلمية (18+): تسجيل المؤهل الأعلى (دبلوم/بكالوريوس/ماجستير/دكتوراه)
 *    لكل بالغ — حقل اختياري يُدخَل من نموذج الأسرة، هذا التبويب للعرض والبحث المجمَّع
 *    وتعديل سريع بدون فتح نموذج الأسرة الكامل.
 */
import { useState, useEffect, useMemo } from 'react'
import { useApp }  from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { ORG_ID, supabase, useLocalDB, visibleFamilies } from '../../lib/db'
import { calcAge, getExpectedGrade, isSchoolAge, QUALIFICATION_OPTIONS } from '../../lib/helpers'
import { useDataScope } from '../../lib/useDataScope'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import Badge from '../../components/ui/Badge'

const TABS = [
  { key: 'children', label: '🎒 تأخر دراسي' },
  { key: 'adults',   label: '🎓 المؤهلات العلمية' },
]

export default function EducationStatus() {
  const [tab, setTab] = useState('children')
  const [families, setFamilies] = useState([])
  const [members,  setMembers]  = useState([])
  const [camps,    setCamps]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [busyId,   setBusyId]   = useState(null)
  const [campFilter, setCampFilter] = useState('')
  const [onlyDelayed, setOnlyDelayed] = useState(false)
  const [qualSearch, setQualSearch] = useState('')
  const [qualFilter, setQualFilter] = useState('')

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

  // ══ تبويب 1: أطفال بعمر الدراسة ══
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

  const scopedKids = useMemo(() => {
    if (!campFilter) return schoolKids
    return schoolKids.filter(k => famMap[k.family_id]?.camp_id === campFilter)
  }, [schoolKids, campFilter, famMap])

  const delayedCount = scopedKids.filter(k => k.education_delayed).length

  const filteredKids = useMemo(() => {
    return onlyDelayed ? scopedKids.filter(k => k.education_delayed) : scopedKids
  }, [scopedKids, onlyDelayed])

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

  // ══ تبويب 2: البالغون (18+) والمؤهلات العلمية ══
  const adults = useMemo(() => {
    const list = []
    families.forEach(f => {
      const age = calcAge(f.head_dob)
      if (age != null && age >= 18) {
        list.push({ id: f.id + '_head', isHead: true, family_id: f.id, name: f.head_name, age, qualification: f.head_qualification })
      }
    })
    members.forEach(m => {
      const age = calcAge(m.dob)
      if (age != null && age >= 18) {
        list.push({ id: m.id, isHead: false, family_id: m.family_id, name: m.name, age, qualification: m.qualification })
      }
    })
    return list
  }, [families, members])

  const scopedAdults = useMemo(() => {
    let list = adults
    if (campFilter) list = list.filter(a => famMap[a.family_id]?.camp_id === campFilter)
    return list
  }, [adults, campFilter, famMap])

  const qualStats = useMemo(() => {
    const s = { total: scopedAdults.length }
    QUALIFICATION_OPTIONS.forEach(q => { s[q] = scopedAdults.filter(a => a.qualification === q).length })
    s.registered = scopedAdults.filter(a => a.qualification).length
    return s
  }, [scopedAdults])

  const filteredAdults = useMemo(() => {
    let list = scopedAdults
    if (qualFilter) list = list.filter(a => a.qualification === qualFilter)
    if (qualSearch.trim()) {
      const q = qualSearch.trim().toLowerCase()
      list = list.filter(a => (a.name || '').toLowerCase().includes(q))
    }
    return list
  }, [scopedAdults, qualFilter, qualSearch])

  async function setQualification(adult, value) {
    if (!canWrite) return showToast('⛔ لا تملك صلاحية التعديل', true)
    setBusyId(adult.id)
    try {
      if (adult.isHead) {
        const { error } = await supabase.from('families').update({ head_qualification: value || null }).eq('id', adult.family_id)
        if (error) throw error
        setFamilies(fs => fs.map(f => f.id === adult.family_id ? { ...f, head_qualification: value || null } : f))
      } else {
        const { error } = await supabase.from('family_members').update({ qualification: value || null }).eq('id', adult.id)
        if (error) throw error
        setMembers(ms => ms.map(m => m.id === adult.id ? { ...m, qualification: value || null } : m))
      }
      showToast('✅ تم الحفظ')
    } catch (err) {
      showToast('خطأ: ' + err.message, true)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader icon="🎓" title="الحالة الدراسية" />

      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-[11px] font-bold border transition-all
              ${tab === t.key ? 'bg-accent text-bg border-accent' : 'bg-surface2 border-border text-muted'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        <select value={campFilter} onChange={e => setCampFilter(e.target.value)}
          className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-sm text-white font-bold outline-none">
          <option value="">⛺ كل المخيمات</option>
          {camps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>

      ) : tab === 'children' ? (
        <>
          <Card>
            <button onClick={() => setOnlyDelayed(v => !v)}
              className={`w-full font-bold text-sm rounded-xl px-4 py-2.5 border transition-all ${onlyDelayed ? 'bg-red/15 border-red text-red' : 'bg-surface2 border-border text-muted'}`}>
              {onlyDelayed ? '⚠️ عرض المتأخرين فقط (مفعَّل)' : 'عرض الكل'}
            </button>
          </Card>
          <Card>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-surface2 rounded-xl p-3 text-center">
                <div className="text-xl font-black text-blue">{scopedKids.length}</div>
                <div className="text-muted text-[10px] mt-0.5">إجمالي بعمر الدراسة</div>
              </div>
              <div className="bg-surface2 rounded-xl p-3 text-center">
                <div className="text-xl font-black text-red">{delayedCount}</div>
                <div className="text-muted text-[10px] mt-0.5">متأخرون دراسياً</div>
              </div>
            </div>
          </Card>

          {filteredKids.length === 0 ? (
            <EmptyState icon="🎒" title={onlyDelayed ? 'لا يوجد متأخرون دراسياً مسجَّلون' : 'لا يوجد أطفال بعمر الدراسة'} />
          ) : (
            <div className="space-y-2">
              {filteredKids.map(kid => {
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
        </>

      ) : (
        <>
          <Card>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setQualFilter('')}
                className={`rounded-xl p-2 text-center border ${!qualFilter ? 'bg-accent/20 border-accent' : 'bg-surface border-border'}`}>
                <div className="text-sm font-black text-blue">{qualStats.total}</div>
                <div className="text-muted text-[9px]">كل البالغين</div>
              </button>
              {QUALIFICATION_OPTIONS.map(q => (
                <button key={q} onClick={() => setQualFilter(f => f===q ? '' : q)}
                  className={`rounded-xl p-2 text-center border ${qualFilter===q ? 'bg-accent/20 border-accent' : 'bg-surface border-border'}`}>
                  <div className="text-sm font-black text-green">{qualStats[q]}</div>
                  <div className="text-muted text-[9px]">{q}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <input value={qualSearch} onChange={e => setQualSearch(e.target.value)}
              placeholder="🔍 بحث بالاسم..."
              className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-sm text-white outline-none" />
          </Card>

          {filteredAdults.length === 0 ? (
            <EmptyState icon="🎓" title="لا توجد نتائج" />
          ) : (
            <div className="space-y-2">
              {filteredAdults.slice(0, 100).map(adult => {
                const f = famMap[adult.family_id] || {}
                return (
                  <Card key={adult.id} className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-black text-sm truncate">{adult.name || '—'}</p>
                        <p className="text-muted text-xs mt-0.5">
                          {adult.age} سنة · {campMap[f.camp_id] || '—'} · 👨‍👩‍👧 {f.head_name || '—'}
                        </p>
                      </div>
                      <select value={adult.qualification || ''} disabled={busyId === adult.id}
                        onChange={e => setQualification(adult, e.target.value)}
                        className="flex-shrink-0 bg-surface2 border border-border rounded-lg px-2 py-1.5 text-white text-xs outline-none disabled:opacity-50">
                        <option value="">غير مُسجَّل</option>
                        {QUALIFICATION_OPTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                      </select>
                    </div>
                  </Card>
                )
              })}
              {filteredAdults.length > 100 && (
                <div className="text-muted text-xs text-center py-2">عرض 100 من {filteredAdults.length} — استخدم البحث لتضييق النتائج</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
