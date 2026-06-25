import { useState, useEffect, useMemo } from 'react'
import { useApp }         from '../../context/AppContext'
import { useAuth }        from '../../context/AuthContext'
import { useLocalDB, visibleFamilies, supabase, ORG_ID } from '../../lib/db'
import {
  parseArr, calcAge, isAgeInRange, hasHealthData,
  buildFamHasNamedWife, buildFamWithInfant, isAutoNursing,
} from '../../lib/helpers'
import { useDataScope }   from '../../lib/useDataScope'
import { exportXLSX }     from '../../lib/excelExport'
import PageHeader         from '../../components/ui/PageHeader'
import Card               from '../../components/ui/Card'
import Spinner            from '../../components/ui/Spinner'
import EmptyState         from '../../components/ui/EmptyState'

// حساب العمر من تاريخ الميلاد
function StatBox({ value, label, color = 'text-accent' }) {
  return (
    <div className="flex flex-col items-center justify-center bg-surface2 rounded-xl p-3 min-w-[70px]">
      <span className={`text-2xl font-black ${color}`}>{value}</span>
      <span className="text-[10px] text-muted mt-0.5 text-center">{label}</span>
    </div>
  )
}

export default function WomenPage() {
  const [families, setFamilies] = useState([])
  const [members,  setMembers]  = useState([])
  const [camps,    setCamps]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [campFilter, setCampFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [ageFrom, setAgeFrom] = useState('')
  const [ageTo,   setAgeTo]   = useState('')

  const { showToast } = useApp()
  const { canExport, isOwner }  = useAuth()
  const { query }      = useLocalDB()
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
      const scopedCamps = getVisibleCamps(c)
      setFamilies(scoped); setCamps(scopedCamps); setMembers(scopedMem)
    } catch (err) {
      showToast('خطأ في تحميل البيانات: ' + err.message, true)
    } finally {
      setLoading(false)
    }
  }

  const campMap = useMemo(() => {
    const m = {}
    camps.forEach(c => { m[c.id] = c.name })
    return m
  }, [camps])

  // جمع كل النساء (ربة أسرة + أفراد إناث)
  const allWomen = useMemo(() => {
    const list = []
    const famSet = new Set(families.map(f => f.id))

    // ربات الأسر الإناث
    families.filter(f => f.head_gender === 'أنثى').forEach(f => {
      const fMems = members.filter(m => m.family_id === f.id)
      list.push({
        id: f.id + '_head',
        name: f.head_name,
        national_id: f.head_id,
        dob: f.head_dob,
        age: calcAge(f.head_dob),
        marital: f.head_marital,
        relation: 'رب الأسرة',
        camp: campMap[f.camp_id] || '—',
        phone: f.phone1,
        female_status: f.head_female_status || [],
        disabilities: f.head_disabilities,
        chronic: f.head_chronic_diseases,
        family_id: f.id,
        head_name: f.head_name,
        _mems: fMems,
        isHead: true,
      })
    })

    // الأفراد الإناث
    members.filter(m => famSet.has(m.family_id) && m.gender === 'أنثى').forEach(m => {
      const f = families.find(x => x.id === m.family_id)
      if (!f) return
      list.push({
        id: m.id,
        name: m.name,
        national_id: m.national_id,
        dob: m.dob,
        age: calcAge(m.dob),
        marital: null,
        relation: m.relation,
        camp: campMap[f.camp_id] || '—',
        phone: f.phone1,
        female_status: m.female_status || [],
        disabilities: m.disabilities,
        chronic: m.chronic_diseases,
        family_id: f.id,
        head_name: f.head_name,
        _mems: members.filter(x => x.family_id === f.id),
        isHead: false,
      })
    })

    return list
  }, [families, members, campMap])

  // صلات الأمومة المعتمدة لحساب المرضعة تلقائياً (مشترك من helpers.js)
  const famHasNamedWife = useMemo(() => buildFamHasNamedWife(members), [members])
  const famWithInfant   = useMemo(() => buildFamWithInfant(members, families), [members, families])

  // هل هذه المرأة مرضعة تلقائياً؟
  function isAutoNursingLocal(w) { return isAutoNursing(w, famHasNamedWife, famWithInfant) }

  // النتائج المفلترة
  const filtered = useMemo(() => {
    return allWomen.filter(w => {
      // مطابقة دقيقة بـ camp_id فقط — لا مطابقة نصية جزئية (كانت تطابق خطأً أي فرع
      // يحتوي اسم المخيم الرئيسي كجزء من اسمه، مثل "معلمات السلام الأولمبي" عند
      // اختيار "السلام الأولمبي")
      if (campFilter) {
        const f = families.find(x => x.id === w.family_id)
        if (!f || f.camp_id !== campFilter) return false
      }
      if (ageFrom && !isAgeInRange(w.dob, ageFrom, '')) return false
      if (ageTo   && !isAgeInRange(w.dob, '', ageTo))   return false

      if (statusFilter) {
        const fs = parseArr(w.female_status)
        const mar = w.marital || ''
        const rel = w.relation || ''
        if (statusFilter === 'حامل'   && !fs.includes('حامل'))  return false
        if (statusFilter === 'مرضع') {
          const explicit = fs.includes('مرضع') || w.marital === 'مرضع'
          if (!explicit && !isAutoNursingLocal(w)) return false
        }
        if (statusFilter === 'أرملة'  && !['أرملة','أرمل'].includes(mar) && !['أرملة','أرمل'].includes(rel)) return false
        if (statusFilter === 'مطلقة'  && !['مطلقة','مطلق'].includes(mar) && !['مطلقة','مطلق'].includes(rel)) return false
        if (statusFilter === 'معاق') {
          const d = w.disabilities
          if (!(Array.isArray(d) ? d.length : d)) return false
        }
      }
      return true
    })
  }, [allWomen, campFilter, ageFrom, ageTo, statusFilter, families, campMap])

  // إحصاءات
  const stats = useMemo(() => {
    const base = campFilter
      ? allWomen.filter(w => { const f = families.find(x => x.id === w.family_id); return f?.camp_id === campFilter })
      : allWomen
    return {
      total:    base.length,
      pregnant: base.filter(w => (Array.isArray(w.female_status) ? w.female_status : []).includes('حامل')).length,
      nursing: base.filter(w => {
        const fs2 = parseArr(w.female_status)
        if (fs2.includes('مرضع')) return true
        return isAutoNursingLocal(w)
      }).length,
      widows:   base.filter(w => ['أرملة','أرمل'].includes(w.marital) || ['أرملة','أرمل'].includes(w.relation)).length,
      divorced: base.filter(w => ['مطلقة','مطلق'].includes(w.marital) || ['مطلقة','مطلق'].includes(w.relation)).length,
    }
  }, [allWomen, campFilter, families, famWithInfant, famHasNamedWife])

  function exportExcel() {
    try {
      if (!filtered.length) return showToast('لا توجد بيانات للتصدير', true)
      const rows = filtered.map(w => {
        const healthParts = []
        if (hasHealthData(w.disabilities)) healthParts.push('إعاقة')
        if (hasHealthData(w.chronic))       healthParts.push('مرض مزمن')
        return {
          'الاسم': w.name,
          'رقم الهوية': w.national_id || '',
          'تاريخ الميلاد': w.dob || '',
          'العمر': w.age ?? '',
          'الصلة': w.relation,
          'الحالة الاجتماعية': w.marital || '',
          'المخيم': w.camp,
          'عدد أفراد الأسرة': (w._mems?.length || 0) + 1,
          'الحالة الصحية (نسائية)': Array.isArray(w.female_status) ? w.female_status.join('،') : '',
          'الإعاقة / المرض المزمن': healthParts.join('،'),
          'الهاتف': w.phone || '',
        }
      })
      exportXLSX(rows, 'كشف النساء', 'كشف_النساء')
    } catch (err) {
      showToast('خطأ في التصدير: ' + err.message, true)
    }
  }

  async function exportBanner() {
    try {
      const { data: orgMembers } = await supabase.from('org_members').select('id,full_name,phone').eq('org_id', ORG_ID)
      const byMemberId = Object.fromEntries((orgMembers || []).map(m => [m.id, m]))
      const visibleCampList = campFilter ? camps.filter(c => c.id === campFilter) : camps
      if (!visibleCampList.length) return showToast('لا توجد مخيمات للتصدير', true)
      const rows = visibleCampList.map(c => {
        const mgr = byMemberId[c.manager_id]
        const count = filtered.filter(w => {
          const f = families.find(x => x.id === w.family_id)
          return f?.camp_id === c.id
        }).length
        return {
          'المخيم':        c.name || '',
          'المندوب':       mgr?.full_name || '',
          'جوال المندوب':  mgr?.phone || '',
          'خط العرض':      c.latitude ?? '',
          'خط الطول':      c.longitude ?? '',
          'عدد المطابقين': count,
        }
      })
      exportXLSX(rows, 'بانر المخيمات', 'بانر_كشف_النساء')
    } catch (err) {
      showToast('خطأ في تصدير البانر: ' + err.message, true)
    }
  }

  const STATUS_TAG = {
    'حامل':  { bg: 'bg-pink-500/20',   text: 'text-pink-400',   label: '🤰 حامل' },
    'مرضع':  { bg: 'bg-blue-500/20',   text: 'text-blue-400',   label: '🤱 مرضع' },
    'أرملة': { bg: 'bg-purple-500/20', text: 'text-purple-400', label: '🕊️ أرملة' },
    'أرمل':  { bg: 'bg-purple-500/20', text: 'text-purple-400', label: '🕊️ أرمل' },
    'مطلقة': { bg: 'bg-red/20',        text: 'text-red-400',    label: '💔 مطلقة' },
    'مطلق':  { bg: 'bg-red/20',        text: 'text-red-400',    label: '💔 مطلق' },
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="إحصاءات النساء"
        icon="👩"
        subtitle={`${filtered.length} من ${allWomen.length} سجل`}
        action={canExport && filtered.length > 0 && (
          <div className="flex gap-1.5">
            <button onClick={exportExcel}
              className="bg-accent text-bg font-black px-3 py-2 rounded-xl text-sm">
              📤 تصدير
            </button>
            <button onClick={exportBanner}
              className="bg-blue/10 border border-blue/30 text-blue font-black px-3 py-2 rounded-xl text-sm">
              📍 بانر
            </button>
          </div>
        )}
      />

      {/* إحصاءات سريعة */}
      <Card>
        <div className="flex flex-wrap gap-2 justify-center">
          <StatBox value={stats.total}    label="إجمالي النساء" color="text-accent" />
          <StatBox value={stats.pregnant} label="🤰 حوامل"       color="text-pink-400" />
          <StatBox value={stats.nursing}  label="🤱 مرضعات"      color="text-blue-400" />
          <StatBox value={stats.widows}   label="🕊️ أرامل"       color="text-purple-400" />
          <StatBox value={stats.divorced} label="💔 مطلقات"      color="text-red-400" />
        </div>
      </Card>

      {/* فلاتر */}
      <Card>
        <div className="flex flex-col gap-2">
          <select
            value={campFilter}
            onChange={e => setCampFilter(e.target.value)}
            className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-sm text-white font-bold outline-none"
          >
            <option value="">⛺ كل المخيمات</option>
            {camps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-sm text-white font-bold outline-none"
          >
            <option value="">كل الحالات</option>
            <option value="حامل">🤰 حامل</option>
            <option value="مرضع">🤱 مرضعة</option>
            <option value="أرملة">🕊️ أرامل</option>
            <option value="مطلقة">💔 مطلقات</option>
            <option value="معاق">🦽 ذوات إعاقة</option>
          </select>

          <div className="flex gap-2">
            <input
              type="number" placeholder="العمر من"
              value={ageFrom} onChange={e => setAgeFrom(e.target.value)}
              className="flex-1 bg-surface2 border border-border rounded-xl px-3 py-2.5 text-sm text-white outline-none"
            />
            <input
              type="number" placeholder="إلى"
              value={ageTo} onChange={e => setAgeTo(e.target.value)}
              className="flex-1 bg-surface2 border border-border rounded-xl px-3 py-2.5 text-sm text-white outline-none"
            />
          </div>
        </div>
      </Card>

      {/* القائمة */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="👩" message="لا توجد نتائج بهذه المعايير" />
      ) : (
        <div className="space-y-2">
          {filtered.map(w => {
            const tags = []
            const fs = parseArr(w.female_status)
            fs.forEach(s => { if (STATUS_TAG[s]) tags.push(STATUS_TAG[s]) })
            if (['أرملة','أرمل'].includes(w.marital)) tags.push(STATUS_TAG['أرملة'])
            if (['مطلقة','مطلق'].includes(w.marital)) tags.push(STATUS_TAG['مطلقة'])

            return (
              <Card key={w.id} className="p-3">
                <div className="flex items-start gap-2">
                  <div className="text-2xl mt-0.5">👩</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-black text-sm truncate">{w.name}</p>
                    <p className="text-muted text-xs mt-0.5">
                      {w.relation} · {w.camp} {w.age !== null ? `· ${w.age} سنة` : ''}
                    </p>
                    {w.national_id && (
                      <p className="text-muted text-xs">🪪 {w.national_id}</p>
                    )}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {tags.map((t, i) => (
                          <span key={i} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.bg} ${t.text}`}>
                            {t.label}
                          </span>
                        ))}
                      </div>
                    )}
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
