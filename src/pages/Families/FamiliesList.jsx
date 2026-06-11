import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, ORG_ID } from '../../lib/supabase'
import { localDB } from '../../lib/db'
import { enqueue } from '../../lib/sync'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { formatDate } from '../../lib/utils'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import Modal from '../../components/ui/Modal'

const REQUIRED_FIELDS = ['head_name','head_id','phone1','camp_id']

function isIncomplete(f) {
  return REQUIRED_FIELDS.some(k => !f[k]?.toString().trim())
}

function calcAge(dob) {
  if (!dob) return null
  const b = new Date(dob), t = new Date()
  let age = t.getFullYear() - b.getFullYear()
  if (t.getMonth() < b.getMonth() || (t.getMonth()===b.getMonth() && t.getDate()<b.getDate())) age--
  return age >= 0 && age < 120 ? age : null
}

function getMembers(allMems, family) {
  return allMems.filter(m => {
    if (m.family_id !== family.id) return false
    const rel   = (m.relation||'').trim()
    const mName = (m.name||'').trim().replace(/\s+/g,' ')
    const hName = (family.head_name||'').trim().replace(/\s+/g,' ')
    if (['رب الأسرة','رب أسرة','head'].includes(rel)) return false
    if (family.head_id && m.national_id && m.national_id.trim()===family.head_id.trim()) return false
    if (mName && hName && mName===hName) return false
    return true
  })
}

const SEL = "bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-accent"

export default function FamiliesList() {
  const [families,    setFamilies]    = useState([])
  const [allMembers,  setAllMembers]  = useState([])
  const [campMap,     setCampMap]     = useState({})
  const [campsList,   setCampsList]   = useState([])
  const [search,      setSearch]      = useState('')
  const [filterCamp,  setFilterCamp]  = useState('')
  const [filterMiss,  setFilterMiss]  = useState('')
  const [filterGender,setFilterGender]= useState('')
  const [ageMin,      setAgeMin]      = useState('')
  const [ageMax,      setAgeMax]      = useState('')
  const [loading,     setLoading]     = useState(true)
  const [syncing,     setSyncing]     = useState(false)
  const [selected,    setSelected]    = useState(null)
  const [selMembers,  setSelMembers]  = useState([])

  const { canWrite, canDelete } = useAuth()
  const { showToast } = useApp()
  const navigate = useNavigate()

  useEffect(() => {
    loadLocal().then(localFams => {
      // إذا Dexie فارغة → جلب من السيرفر فوراً
      syncBackground()
    })
  }, [])

  // ── 1. تحميل من Dexie فوراً ─────────────────────────
  async function loadLocal() {
    try {
      const [fams, camps, mems] = await Promise.all([
        localDB.families.toArray().catch(()=>[]),
        localDB.camps.toArray().catch(()=>[]),
        localDB.family_members.toArray().catch(()=>[]),
      ])
      applyData(fams, camps, mems)
      return fams
    } catch(e) { console.error(e); return [] }
    finally { setLoading(false) }
  }

  // ── 2. مزامنة في الخلفية بصمت ───────────────────────
  async function syncBackground() {
    if (!navigator.onLine) return
    setSyncing(true)
    try {
      const [fRes, cRes] = await Promise.all([
        supabase.from('families').select('*').eq('org_id', ORG_ID)
          .order('updated_at', { ascending: false }).limit(1000),
        supabase.from('camps').select('*').eq('org_id', ORG_ID),
      ])
      const fams  = (!fRes.error  && fRes.data?.length)  ? fRes.data  : null
      const camps = (!cRes.error  && cRes.data?.length)  ? cRes.data  : null
      if (!fams) {
        console.warn('[sync] fams empty or error:', fRes.error)
        return
      }

      let mems = null
      const ids = fams.map(f => f.id)
      const chunks = []
      for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i,i+200))
      const res = await Promise.all(chunks.map(c =>
        supabase.from('family_members')
          .select('id,family_id,name,national_id,relation,dob,gender,health')
          .in('family_id', c)
      ))
      const sm = []
      res.forEach(r => { if (!r.error && r.data) sm.push(...r.data) })
      mems = sm

      // حفظ في Dexie — نتجاهل أخطاء الـ schema بأمان
      if (fams.length) {
        try { await localDB.families.bulkPut(fams) }
        catch(e) {
          console.warn('[dexie] families bulkPut:', e.message)
          // محاولة بديلة — حفظ واحد واحد
          for (const f of fams) { try { await localDB.families.put(f) } catch {} }
        }
      }
      if (camps?.length) {
        try { await localDB.camps.bulkPut(camps) }
        catch(e) { for (const c of camps) { try { await localDB.camps.put(c) } catch {} } }
      }
      if (mems.length) {
        try { await localDB.family_members.bulkPut(mems) }
        catch(e) { for (const m of mems) { try { await localDB.family_members.put(m) } catch {} } }
      }

      const localCamps = camps || await localDB.camps.toArray().catch(()=>[])
      applyData(fams, localCamps, mems)
    } catch(e) { console.warn('[sync]', e.message) }
    finally { setSyncing(false) }
  }

  // ── مزامنة يدوية ─────────────────────────────────────
  async function manualSync() {
    if (!navigator.onLine) return showToast('لا يوجد اتصال', true)
    await syncBackground()
    showToast('✅ تم التحديث')
  }

  function applyData(fams, camps, mems) {
    const cm = {}
    camps.forEach(c => { cm[c.id] = c.name })
    setCampMap(cm)
    setCampsList(camps)
    setFamilies(fams)
    setAllMembers(mems)
  }

  // ── فتح تفاصيل أسرة ──────────────────────────────────
  async function openFamily(family) {
    setSelected(family)
    const local = getMembers(allMembers, family)
    setSelMembers(local)
    if (navigator.onLine) {
      const { data } = await supabase.from('family_members').select('*').eq('family_id', family.id)
      if (data) {
        setSelMembers(getMembers(data, family))
        try { await localDB.family_members.bulkPut(data) } catch {}
      }
    }
  }

  // ── حذف أسرة ─────────────────────────────────────────
  async function deleteFamily(id) {
    if (!window.confirm('حذف هذه الأسرة؟')) return
    try {
      await localDB.families.delete(id)
      await localDB.family_members.where('family_id').equals(id).delete()
      if (navigator.onLine) {
        await supabase.from('family_members').delete().eq('family_id', id)
        await supabase.from('families').delete().eq('id', id)
      } else { await enqueue('delete_family', { id }) }
      setFamilies(f => f.filter(x => x.id !== id))
      setAllMembers(m => m.filter(x => x.family_id !== id))
      setSelected(null)
      showToast('✅ تم الحذف')
    } catch (err) { showToast('خطأ: ' + err.message, true) }
  }

  // ── حساب التكرارات ───────────────────────────────────
  // حساب التكرارات شاملاً أفراد الأسرة
  const { dupFamilyIds, dupPhoneFamilyIds, counts } = useMemo(() => {
    // ── تكرار الهويات (رب الأسرة + الأفراد) ──
    const idToFams = {}  // هوية → Set من family_ids
    families.forEach(f => {
      if (f.head_id) {
        if (!idToFams[f.head_id]) idToFams[f.head_id] = new Set()
        idToFams[f.head_id].add(f.id)
      }
    })
    allMembers.forEach(m => {
      if (m.national_id && m.family_id) {
        if (!idToFams[m.national_id]) idToFams[m.national_id] = new Set()
        idToFams[m.national_id].add(m.family_id)
      }
    })
    // أسر فيها تكرار هوية
    const dupFamilyIds = new Set()
    families.forEach(f => {
      if (f.head_id && (idToFams[f.head_id]?.size||0) > 1) dupFamilyIds.add(f.id)
      // إذا أي فرد من أسرته لديه هوية مكررة
      allMembers.filter(m => m.family_id === f.id).forEach(m => {
        if (m.national_id && (idToFams[m.national_id]?.size||0) > 1) dupFamilyIds.add(f.id)
      })
    })

    // ── تكرار الجوال ──
    const cleanPh = p => (p||'').replace(/\s/g,'')
    const phCount = {}
    families.forEach(f => {
      if (f.phone1) { const p = cleanPh(f.phone1); phCount[p] = (phCount[p]||0)+1 }
    })
    const dupPhoneFamilyIds = new Set(
      families.filter(f => f.phone1 && (phCount[cleanPh(f.phone1)]||0) > 1).map(f => f.id)
    )

    // ── الأسر الناقصة ──
    const incompleteCount = families.filter(f => isIncomplete(f)).length

    return {
      dupFamilyIds,
      dupPhoneFamilyIds,
      counts: {
        incomplete: incompleteCount,
        complete:   families.length - incompleteCount,
        dup_id:     dupFamilyIds.size,
        dup_phone:  dupPhoneFamilyIds.size,
      }
    }
  }, [families, allMembers])

  // للتوافق مع باقي الكود
  const dupIds    = dupFamilyIds
  const dupPhones = dupPhoneFamilyIds

  // ── حساب عدد الأفراد لكل أسرة ───────────────────────
  const memberCount = useMemo(() => {
    const mc = {}
    families.forEach(f => { mc[f.id] = getMembers(allMembers, f).length })
    return mc
  }, [families, allMembers])

  // ── الفلترة ──────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...families]
    if (filterCamp)   list = list.filter(f => f.camp_id === filterCamp)
    if (filterGender) list = list.filter(f => f.head_gender === filterGender)
    if (filterMiss === 'incomplete') list = list.filter(f => isIncomplete(f) || dupIds.has(f.head_id) || dupPhones.has(f.phone1))
    if (filterMiss === 'complete')   list = list.filter(f => !isIncomplete(f) && !dupIds.has(f.head_id) && !dupPhones.has(f.phone1))
    if (filterMiss === 'dup_id')     list = list.filter(f => dupFamilyIds.has(f.id))
    if (filterMiss === 'dup_phone')  list = list.filter(f => dupPhoneFamilyIds.has(f.id))
    if (ageMin || ageMax) {
      const mn = ageMin ? parseInt(ageMin) : 0
      const mx = ageMax ? parseInt(ageMax) : 999
      const inRange = age => age !== null && age >= mn && age <= mx
      // خريطة أفراد الأسر لتسريع البحث
      const memsByFam = {}
      allMembers.forEach(m => {
        if (!memsByFam[m.family_id]) memsByFam[m.family_id] = []
        memsByFam[m.family_id].push(m)
      })
      list = list.filter(f => {
        // افحص رب الأسرة أولاً
        if (inRange(calcAge(f.head_dob))) return true
        // افحص أفراد الأسرة
        return (memsByFam[f.id]||[]).some(m => inRange(calcAge(m.dob)))
      })
    }
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(f =>
        (f.head_name||'').toLowerCase().includes(q) ||
        (f.head_id  ||'').includes(q) ||
        (f.phone1   ||'').includes(q)
      )
    }
    // ترتيب: ناقص أولاً إذا فلتر ناقص، وإلا حسب عدد الأفراد
    if (filterMiss === 'incomplete') {
      list.sort((a,b) => {
        const aI = (isIncomplete(a)?1:0)+(dupIds.has(a.head_id)?1:0)+(dupPhones.has(a.phone1)?1:0)
        const bI = (isIncomplete(b)?1:0)+(dupIds.has(b.head_id)?1:0)+(dupPhones.has(b.phone1)?1:0)
        return bI - aI
      })
    } else {
      list.sort((a,b) => (memberCount[b.id]||0) - (memberCount[a.id]||0))
    }
    return list
  }, [families, allMembers, filterCamp, filterGender, filterMiss, ageMin, ageMax, search, dupFamilyIds, dupPhoneFamilyIds, memberCount])

  const hasFilter = filterCamp || filterMiss || filterGender || ageMin || ageMax || search

  function resetFilters() {
    setFilterCamp(''); setFilterMiss(''); setFilterGender('')
    setAgeMin(''); setAgeMax(''); setSearch('')
  }

  return (
    <div>
      <PageHeader icon="👨‍👩‍👧‍👦" title="قائمة الأسر"
        subtitle={
          <span className="flex items-center gap-2">
            <span className="text-muted text-xs">{filtered.length}/{families.length} أسرة</span>
            {syncing && <span className="text-[10px] text-accent animate-pulse">🔄 تحديث</span>}
            {!navigator.onLine && <span className="text-[10px] text-red">📴 أوف لاين</span>}
          </span>
        }
        action={
          <div className="flex gap-2">
            <button onClick={manualSync} disabled={syncing} title="تحديث البيانات"
              className="bg-surface2 border border-border text-white font-bold w-9 h-9 rounded-xl text-sm disabled:opacity-50 flex items-center justify-center">
              {syncing ? '⏳' : '🔄'}
            </button>
            {canWrite && (
              <button onClick={() => navigate('/families/add')}
                className="bg-accent text-bg font-black px-4 py-2 rounded-xl text-sm">➕ إضافة</button>
            )}
          </div>
        }
      />

      {/* البحث */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="🔍 بحث باسم رب الأسرة أو رقم الهوية أو الجوال..."
        className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent mb-3"
      />

      {/* الفلاتر — صف واحد */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <select value={filterMiss} onChange={e => setFilterMiss(e.target.value)} className={SEL}>
          <option value="">كل الأسر ({families.length})</option>
          <option value="incomplete">⚠️ ناقص ({counts.incomplete})</option>
          <option value="complete">✅ مكتمل ({counts.complete})</option>
          <option value="dup_id">🔁 هوية مكررة ({counts.dup_id})</option>
          <option value="dup_phone">📞 جوال مكرر ({counts.dup_phone})</option>
        </select>
        <select value={filterCamp} onChange={e => setFilterCamp(e.target.value)} className={SEL}>
          <option value="">كل المخيمات</option>
          {campsList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterGender} onChange={e => setFilterGender(e.target.value)} className={SEL}>
          <option value="">كل الجنس</option>
          <option value="ذكر">👨 ذكر</option>
          <option value="أنثى">👩 أنثى</option>
        </select>
        {hasFilter && (
          <button onClick={resetFilters}
            className="border border-border text-muted rounded-xl px-3 py-2 text-xs font-bold">
            ↺ إعادة
          </button>
        )}
      </div>

      {/* فلتر العمر */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-muted text-xs">🎂 العمر من</span>
        <input type="number" value={ageMin} onChange={e => setAgeMin(e.target.value)}
          min="0" max="120" placeholder="—" dir="ltr"
          className="w-14 bg-surface2 border border-border rounded-xl px-2 py-1.5 text-white text-xs text-center focus:outline-none focus:border-accent"/>
        <span className="text-muted text-xs">إلى</span>
        <input type="number" value={ageMax} onChange={e => setAgeMax(e.target.value)}
          min="0" max="120" placeholder="—" dir="ltr"
          className="w-14 bg-surface2 border border-border rounded-xl px-2 py-1.5 text-white text-xs text-center focus:outline-none focus:border-accent"/>
        <span className="text-muted text-xs">سنة</span>
        <span className="text-muted text-xs mr-auto">{hasFilter ? `${filtered.length} نتيجة` : ''}</span>
      </div>

      {/* الجدول */}
      {loading ? (
        <div className="flex flex-col gap-1">
          {[...Array(8)].map((_,i) => (
            <div key={i} className="h-10 bg-surface border border-border rounded-xl animate-pulse"/>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="🔍"
          title={families.length === 0 ? 'لا توجد بيانات محلية' : 'لا توجد نتائج'}
          subtitle={families.length === 0
            ? 'اضغط الزر لجلب البيانات من الخادم'
            : 'جرب تغيير الفلاتر'}
          action={
            <div className="flex gap-2 mt-2 justify-center flex-wrap">
              {families.length === 0 && (
                <button onClick={manualSync} disabled={syncing}
                  className="bg-accent text-bg font-black px-5 py-2.5 rounded-xl text-sm disabled:opacity-60">
                  {syncing ? '⏳ جاري الجلب...' : '🔄 جلب البيانات'}
                </button>
              )}
              {hasFilter && families.length > 0 && (
                <button onClick={resetFilters}
                  className="bg-surface2 border border-border text-white px-4 py-2 rounded-xl text-sm">
                  ↺ مسح الفلاتر
                </button>
              )}
            </div>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full">
            <thead>
              <tr className="bg-surface2 text-muted text-[11px]">
                <th className="px-2 py-2.5 text-right font-bold w-7">#</th>
                <th className="px-3 py-2.5 text-right font-bold">رب الأسرة</th>
                <th className="px-3 py-2.5 text-right font-bold">المخيم</th>
                <th className="px-2 py-2.5 text-center font-bold">الأفراد</th>
                <th className="px-3 py-2.5 text-right font-bold">الجوال</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f, i) => {
                const incomplete = isIncomplete(f)
                const isDupId    = dupIds.has(f.head_id)
                const isDupPhone = dupPhones.has(f.phone1)
                const hasWarn    = incomplete || isDupId || isDupPhone
                const mc         = (memberCount[f.id]||0) + 1
                const dupCount   = (isDupId?1:0) + (isDupPhone?1:0)
                return (
                  <tr key={f.id} onClick={() => openFamily(f)}
                    className={`border-t border-border cursor-pointer transition-colors
                      ${hasWarn ? 'bg-red/5 hover:bg-red/10' : 'hover:bg-surface2'}`}>
                    <td className="px-2 py-2.5 text-muted text-[11px]">{i+1}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-white text-[13px] leading-snug">{f.head_name||'—'}</div>
                      {f.head_id && <div className="text-muted text-[10px]" dir="ltr">{f.head_id}</div>}
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {incomplete && (
                          <span className="text-[9px] bg-red/15 text-red px-1.5 py-0.5 rounded font-bold">
                            ⚠️ ناقص
                          </span>
                        )}
                        {dupCount > 0 && (
                          <span className="text-[9px] bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded font-bold">
                            🔁 {dupCount} تكرار
                          </span>
                        )}
                        {!incomplete && dupCount === 0 && (
                          <span className="text-[9px] text-green">✅</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-muted text-xs">{campMap[f.camp_id]||'—'}</td>
                    <td className="px-2 py-2.5 text-center">
                      <span className="text-accent font-black text-sm">{mc}</span>
                    </td>
                    <td className="px-3 py-2.5 text-blue text-[11px]" dir="ltr">{f.phone1||'—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* مودال التفاصيل */}
      <Modal open={!!selected} onClose={() => { setSelected(null); setSelMembers([]) }} title="تفاصيل الأسرة" size="lg">
        {selected && (
          <div className="flex flex-col gap-4">
            <DuplicateWarnings
              family={selected}
              families={families}
              allMembers={allMembers}
            />
            <div className="bg-surface2 rounded-xl p-4 border border-accent/20">
              <div className="text-accent text-xs font-bold mb-3">👤 رب الأسرة</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['الاسم',             selected.head_name],
                  ['رقم الهوية',        selected.head_id],
                  ['الجوال',            selected.phone1],
                  ['جوال 2',            selected.phone2],
                  ['الجنس',             selected.head_gender],
                  ['الحالة الاجتماعية', selected.head_marital],
                  ['المخيم',            campMap[selected.camp_id]],
                  ['الخيمة',            selected.tent],
                  ['المنطقة الأصلية',   selected.original_address],
                  ['العنوان التفصيلي',  selected.address_details],
                  ['تاريخ الميلاد',     selected.head_dob ? formatDate(selected.head_dob) : null],
                  ['العمر',             calcAge(selected.head_dob) ? `${calcAge(selected.head_dob)} سنة` : null],
                  ['تاريخ التسجيل',     formatDate(selected.created_at)],
                ].filter(([,v])=>v).map(([k,v]) => (
                  <div key={k} className="bg-surface rounded-xl p-2.5">
                    <div className="text-muted text-[9px] mb-0.5">{k}</div>
                    <div className="text-white font-bold text-xs">{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <FamilyMembersView members={selMembers} family={selected} />
            {selected.notes && (
              <div className="bg-surface2 rounded-xl p-3">
                <div className="text-muted text-[10px] mb-1">📝 ملاحظات</div>
                <div className="text-white text-xs">{selected.notes}</div>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => { navigate(`/families/edit/${selected.id}`); setSelected(null) }}
                className="flex-1 bg-accent text-bg font-black py-2.5 rounded-xl text-sm">✏️ تعديل</button>
              {canDelete && (
                <button onClick={() => deleteFamily(selected.id)}
                  className="flex-1 bg-red/15 border border-red/40 text-red font-bold py-2.5 rounded-xl text-sm">🗑️ حذف</button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function DuplicateWarnings({ family, families, allMembers }) {
  const REQUIRED_FIELDS = ['head_name','head_id','phone1','camp_id']
  const FIELD_LABELS = { head_name:'الاسم', head_id:'رقم الهوية', phone1:'الجوال', camp_id:'المخيم' }

  // خريطة الأسر لسهولة البحث
  const famMap = {}
  families.forEach(f => { famMap[f.id] = f })

  const issues = []

  // ── النواقص ──
  const missing = REQUIRED_FIELDS.filter(f => !family[f]?.toString().trim())
  if (missing.length) {
    issues.push({
      color: 'red',
      icon: '⚠️',
      title: 'بيانات ناقصة',
      detail: missing.map(f => FIELD_LABELS[f]).join('، ')
    })
  }

  // ── تكرار هوية رب الأسرة ──
  if (family.head_id) {
    const names = []

    // مع أرباب أسر آخرين
    families.forEach(f => {
      if (f.id !== family.id && f.head_id === family.head_id)
        names.push(`رب الأسرة ${f.head_name}`)
    })

    // مع أفراد أسر أخرى (مع ذكر اسم رب الأسرة)
    allMembers.forEach(m => {
      if (m.family_id === family.id) return  // تجاهل أفراد نفس الأسرة
      if (m.national_id === family.head_id) {
        const parentFam = famMap[m.family_id]
        const parentName = parentFam ? parentFam.head_name : '؟'
        names.push(`الفرد ${m.name} من أسرة ${parentName}`)
      }
    })

    if (names.length) {
      issues.push({
        color: 'purple',
        icon: '🔁',
        title: `هوية رب الأسرة مكررة مع`,
        detail: names.join('
')
      })
    }
  }

  // ── تكرار هويات الأفراد ──
  const myMembers = allMembers.filter(m => m.family_id === family.id && m.national_id)
  myMembers.forEach(m => {
    const names = []

    // مع أرباب أسر
    families.forEach(f => {
      if (f.id !== family.id && f.head_id === m.national_id)
        names.push(`رب الأسرة ${f.head_name}`)
    })

    // مع أفراد أسر أخرى
    allMembers.forEach(x => {
      if (x.family_id === family.id) return  // تجاهل نفس الأسرة
      if (x.national_id === m.national_id) {
        const parentFam = famMap[x.family_id]
        const parentName = parentFam ? parentFam.head_name : '؟'
        names.push(`الفرد ${x.name} من أسرة ${parentName}`)
      }
    })

    if (names.length) {
      issues.push({
        color: 'purple',
        icon: '🔁',
        title: `هوية الفرد "${m.name}" مكررة مع`,
        detail: names.join('
')
      })
    }
  })

  // ── تكرار الجوال ──
  if (family.phone1) {
    const clean = p => (p||'').replace(/[\s-]/g,'')
    const myPhone = clean(family.phone1)
    const dupFams = families.filter(f =>
      f.id !== family.id && clean(f.phone1) === myPhone
    )
    if (dupFams.length) {
      issues.push({
        color: 'blue',
        icon: '📞',
        title: `الجوال ${family.phone1} مكرر مع`,
        detail: dupFams.map(f => `رب الأسرة ${f.head_name}`).join('
')
      })
    }
  }

  if (!issues.length) return null

  const colorMap = {
    red:    'bg-red/10 border-red/30 text-red',
    purple: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
    blue:   'bg-blue/10 border-blue/30 text-blue',
  }

  return (
    <div className="flex flex-col gap-2">
      {issues.map((issue, i) => (
        <div key={i} className={`border rounded-xl p-3 ${colorMap[issue.color]}`}>
          <div className="text-xs font-bold mb-1">{issue.icon} {issue.title}</div>
          {issue.detail.split('\n').map((line, j) => (
            <div key={j} className="text-[11px] opacity-90 py-0.5 border-t border-white/10 first:border-0">
              ← {line}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function FamilyMembersView({ members, family }) {
  const HEALTH_ICONS = { مريض:'🤒', معاق:'♿', مزمن:'💊', مصاب:'🩹' }
  if (!members.length) return (
    <div className="text-muted text-xs text-center py-3">لا يوجد أفراد مسجلون</div>
  )
  return (
    <div>
      <div className="text-accent text-xs font-bold mb-2">
        👨‍👩‍👧‍👦 أفراد الأسرة ({members.length + 1} فرد)
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-accent/10 border border-accent/20">
          <div>
            <div className="text-white text-xs font-bold">{family.head_name}</div>
            <div className="text-muted text-[10px]">رب الأسرة · {family.head_id}</div>
          </div>
          <span>👑</span>
        </div>
        {members.map(m => (
          <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface2">
            <div>
              <div className="text-white text-xs font-bold">{m.name}</div>
              <div className="text-muted text-[10px]">
                {m.relation}{m.national_id?` · ${m.national_id}`:''}{m.dob?` · ${formatDate(m.dob)}`:''}
              </div>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span>{m.gender==='ذكر'||m.gender==='male'?'👦':m.gender==='أنثى'||m.gender==='female'?'👧':'👤'}</span>
              {m.health && m.health!=='سليم' && (
                <span className="text-[10px] text-red">{HEALTH_ICONS[m.health]||'⚠️'} {m.health}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
