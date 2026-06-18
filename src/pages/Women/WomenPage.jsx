import { useState, useEffect, useMemo } from 'react'
import { useLocalDB }     from '../../lib/useLocalDB'
import { useApp }         from '../../context/AppContext'
import { useAuth }        from '../../context/AuthContext'
import { useDataScope }   from '../../lib/useDataScope'
import PageHeader         from '../../components/ui/PageHeader'
import Card               from '../../components/ui/Card'
import Spinner            from '../../components/ui/Spinner'
import EmptyState         from '../../components/ui/EmptyState'

// حساب العمر من تاريخ الميلاد
function parseArr(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  if (typeof val === 'string') {
    const s = val.trim().replace(/^"+|"+$/g, '')
    if (!s || s === '[]' || s === 'null') return []
    try { const p = JSON.parse(s); return Array.isArray(p) ? p : [] }
    catch { return [] }
  }
  return []
}

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

  // الأنثى الأكبر سناً في كل أسرة
  const famOldestFemaleAge = useMemo(() => {
    const map = {}
    members.filter(m => m.gender === 'أنثى' || m.gender === 'female').forEach(m => {
      const a = calcAge(m.dob)
      if (a === null) return
      if (map[m.family_id] === undefined || a > map[m.family_id]) map[m.family_id] = a
    })
    families.filter(f => f.head_gender === 'أنثى').forEach(f => {
      const a = calcAge(f.head_dob)
      if (a === null) return
      if (map[f.id] === undefined || a > map[f.id]) map[f.id] = a
    })
    return map
  }, [members, families])

  // الأسر التي فيها رضيع (عمر < 2 سنة) — لحساب المرضعات تلقائياً
  const famWithInfant = useMemo(() => {
    const s = new Set()
    members.forEach(m => { const a = calcAge(m.dob); if (a !== null && a < 2) s.add(m.family_id) })
    families.forEach(f => { const a = calcAge(f.head_dob); if (a !== null && a < 2) s.add(f.id) })
    return s
  }, [members, families])

  // النتائج المفلترة
  const filtered = useMemo(() => {
    return allWomen.filter(w => {
      if (campFilter && !w.camp.includes(campMap[campFilter] || campFilter)) {
        const f = families.find(x => x.id === w.family_id)
        if (!f || f.camp_id !== campFilter) return false
      }
      if (ageFrom && (w.age === null || w.age < parseInt(ageFrom))) return false
      if (ageTo   && (w.age === null || w.age > parseInt(ageTo)))   return false

      if (statusFilter) {
        const fs = parseArr(w.female_status)
        const mar = w.marital || ''
        const rel = w.relation || ''
        if (statusFilter === 'حامل'   && !fs.includes('حامل'))  return false
        if (statusFilter === 'مرضع') {
          const famId = w.family_id
          const age = w.age
          const rel = (w.relation || '').trim()
          const isMotherRole = w.isHead || ['زوجة','زوجة ثانية','زوجة ثالثة','زوجة رابعة','زوجه','أم'].includes(rel)
          const explicit = fs.includes('مرضع') || w.marital === 'مرضع'
          const oldestAge = famOldestFemaleAge[famId]
          const isOldest  = age === null || oldestAge === undefined || age >= oldestAge
          const auto = isMotherRole && famWithInfant.has(famId) && isOldest
          if (!explicit && !auto) return false
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
        const rel = (w.relation || '').trim()
        const isMotherRole = w.isHead || ['زوجة','زوجة ثانية','زوجة ثالثة','زوجة رابعة','زوجه','أم'].includes(rel)
        const oldestAge = famOldestFemaleAge[w.family_id]
        const isOldest  = w.age === null || oldestAge === undefined || w.age >= oldestAge
        return isMotherRole && famWithInfant.has(w.family_id) && isOldest
      }).length,
      widows:   base.filter(w => ['أرملة','أرمل'].includes(w.marital) || ['أرملة','أرمل'].includes(w.relation)).length,
      divorced: base.filter(w => ['مطلقة','مطلق'].includes(w.marital) || ['مطلقة','مطلق'].includes(w.relation)).length,
    }
  }, [allWomen, campFilter, families, famWithInfant, famOldestFemaleAge])

  function exportExcel() {
    try {
      const rows = filtered.map(w => ({
        'الاسم': w.name,
        'رقم الهوية': w.national_id || '',
        'العمر': w.age ?? '',
        'الصلة': w.relation,
        'الحالة الاجتماعية': w.marital || '',
        'المخيم': w.camp,
        'الحالة الصحية': Array.isArray(w.female_status) ? w.female_status.join('،') : '',
        'الهاتف': w.phone || '',
        'اسم رب الأسرة': w.head_name,
      }))

      // بناء CSV بسيط
      const headers = Object.keys(rows[0])
      const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${r[h]}"`).join(','))].join('\n')
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = 'كشف_النساء.csv'; a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      showToast('خطأ في التصدير: ' + err.message, true)
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
          <button onClick={exportExcel}
            className="bg-accent text-bg font-black px-4 py-2 rounded-xl text-sm">
            📤 تصدير
          </button>
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
