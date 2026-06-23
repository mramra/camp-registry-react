import { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { ORG_ID, supabase, useLocalDB, visibleFamilies } from '../../lib/db'
import { useDataScope } from '../../lib/useDataScope'
import { formatDate } from '../../lib/utils'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import SearchBar from '../../components/ui/SearchBar'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'

const STATUS_MAP = {
  draft:     { label: 'مسودة',   color: 'muted'  },
  active:    { label: 'نشط',     color: 'green'  },
  completed: { label: 'مكتمل',   color: 'blue'   },
  cancelled: { label: 'ملغي',    color: 'red'    },
}

const DIST_STATUS_MAP = {
  pending:   { label: 'معلقة',   color: 'muted'  },
  active:    { label: 'نشطة',    color: 'green'  },
  completed: { label: 'مكتملة',  color: 'blue'   },
}

export default function Distributions() {
  const [rounds,    setRounds]    = useState([])
  const [camps,     setCamps]     = useState({})
  const [campsRaw,  setCampsRaw]  = useState([])
  const [search,    setSearch]    = useState('')
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState(null)  // الجولة المختارة
  const [view,      setView]      = useState('rounds') // 'rounds' | 'batches' | 'receive'
  const [batches,   setBatches]   = useState([])
  const [batchLoad, setBatchLoad] = useState(false)
  const [families,  setFamilies]  = useState([])
  const [received,  setReceived]  = useState({}) // familyId → true
  const [selBatch,  setSelBatch]  = useState(null)
  const [showAddRound, setShowAddRound] = useState(false)
  const [showAddBatch, setShowAddBatch] = useState(false)
  const [form,   setForm]   = useState({ name: '', camp_id: '', notes: '' })
  const [bForm,  setBForm]  = useState({ name: '', camp_id: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const { showToast, online } = useApp()
  const { isSuperAdmin, isOwner, canWrite } = useAuth()
  const { getAllowedCampIds, filterLocal } = useDataScope()
  const { query, upsert, bulkUpsert, remove } = useLocalDB()

  useEffect(() => { loadData() }, [])

  // ─── تحميل الجولات ───────────────────────────────────
  async function loadData() {
    setLoading(true)
    try {
      const campsData = await query('camps')
      setCamps(Object.fromEntries(campsData.map(c => [c.id, c.name])))
      setCampsRaw(campsData)

      // offline-first: SQLite أولاً
      const local = await query('dist_rounds')
      setRounds(local.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)))

      if (online) {
        const { data, error } = await supabase
          .from('dist_rounds').select('*')
          .eq('org_id', ORG_ID)
          .order('created_at', { ascending: false })
        if (!error && data) {
          await bulkUpsert('dist_rounds', data).catch(() => {})
          setRounds(data)
        }
      }
    } catch(err) { showToast('خطأ في التحميل: ' + err.message, true) }
    finally { setLoading(false) }
  }

  // ─── تحميل دفعات الجولة ──────────────────────────────
  async function loadBatches(round) {
    setSelected(round)
    setView('batches')
    setBatchLoad(true)
    try {
      const campIds = getAllowedCampIds(campsRaw)
      const local = await query('camp_distributions', { round_id: round.id })
      setBatches(filterLocal(local, campIds).sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0)))

      if (online) {
        const { data, error } = await supabase
          .from('camp_distributions').select('*')
          .eq('round_id', round.id)
          .order('created_at', { ascending: false })
        if (!error && data) {
          await bulkUpsert('camp_distributions', data).catch(() => {})
          setBatches(filterLocal(data, campIds))
        }
      }
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setBatchLoad(false) }
  }

  // ─── تحميل أسر الدفعة ────────────────────────────────
  async function loadReceive(batch) {
    setSelBatch(batch)
    setView('receive')
    setBatchLoad(true)
    try {
      // أسر المخيم
      const campId = batch.camp_id || selected?.camp_id
      const campIds = getAllowedCampIds(campsRaw)
      const allFamsRaw = await query('families')
      const ownedFams = visibleFamilies(allFamsRaw, isOwner)
      let allFams = ownedFams.filter(f =>
        f.org_id === ORG_ID && (!campId || f.camp_id === campId) && f.status === 'active'
      )
      // حماية مضاعفة: حتى لو الدفعة بلا camp_id محدد، لا تتجاوز نطاق صلاحية المستخدم
      allFams = filterLocal(allFams, campIds)
      setFamilies(allFams)

      // من استلم بالفعل
      const distFams = await query('camp_dist_families', { distribution_id: batch.id })

      let recvSet = {}
      if (online) {
        const { data } = await supabase
          .from('camp_dist_families').select('family_id')
          .eq('distribution_id', batch.id)
        if (data) data.forEach(r => { recvSet[r.family_id] = true })
        await bulkUpsert('camp_dist_families', 
          (data||[]).map(r => ({ ...r, distribution_id: batch.id }))
        ).catch(() => {})
      } else {
        distFams.forEach(r => { recvSet[r.family_id] = true })
      }
      setReceived(recvSet)
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setBatchLoad(false) }
  }

  // ─── إضافة جولة ──────────────────────────────────────
  async function handleAddRound(e) {
    e.preventDefault()
    if (!canWrite) { showToast('⛔ لا تملك صلاحية إضافة جولات توزيع', true); return }
    if (!form.name.trim()) return showToast('اسم الجولة مطلوب', true)
    setSaving(true)
    try {
      const data = {
        id: crypto.randomUUID(), org_id: ORG_ID,
        name: form.name.trim(), camp_id: form.camp_id || null,
        notes: form.notes || null, status: 'draft',
        created_at: new Date().toISOString()
      }
      await upsert('dist_rounds', data)
      showToast('✅ تمت إضافة الجولة')
      setShowAddRound(false)
      setForm({ name: '', camp_id: '', notes: '' })
      await loadData()
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setSaving(false) }
  }

  // ─── إضافة دفعة ──────────────────────────────────────
  async function handleAddBatch(e) {
    e.preventDefault()
    if (!canWrite) { showToast('⛔ لا تملك صلاحية إضافة دفعات توزيع', true); return }
    if (!bForm.name.trim()) return showToast('اسم الدفعة مطلوب', true)
    setSaving(true)
    try {
      const data = {
        id: crypto.randomUUID(), org_id: ORG_ID,
        round_id: selected.id,
        name: bForm.name.trim(),
        camp_id: bForm.camp_id || selected.camp_id || null,
        notes: bForm.notes || null,
        status: 'pending',
        created_at: new Date().toISOString()
      }
      await upsert('camp_distributions', data)
      showToast('✅ تمت إضافة الدفعة')
      setShowAddBatch(false)
      setBForm({ name: '', camp_id: '', notes: '' })
      await loadBatches(selected)
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setSaving(false) }
  }

  // ─── تسجيل الاستلام ──────────────────────────────────
  async function toggleReceive(family) {
    if (!canWrite) { showToast('⛔ لا تملك صلاحية تسجيل الاستلام', true); return }
    const already = received[family.id]
    try {
      if (already) {
        // إلغاء الاستلام
        const existing = await query('camp_dist_families', { distribution_id: selBatch.id, family_id: family.id })
        for (const rec of existing) {
          await remove('camp_dist_families', rec.id).catch(() => {})
        }
        if (online) {
          await supabase.from('camp_dist_families')
            .delete()
            .eq('distribution_id', selBatch.id)
            .eq('family_id', family.id)
        }
        setReceived(r => { const n={...r}; delete n[family.id]; return n })
        showToast('تم إلغاء الاستلام')
      } else {
        // تسجيل الاستلام
        const rec = {
          id: crypto.randomUUID(),
          distribution_id: selBatch.id,
          family_id: family.id,
          org_id: ORG_ID,
          received_at: new Date().toISOString()
        }
        await upsert('camp_dist_families', rec)
        setReceived(r => ({ ...r, [family.id]: true }))
        showToast('✅ تم تسجيل الاستلام')
      }
    } catch(err) { showToast('خطأ: ' + err.message, true) }
  }

  // ─── تغيير حالة الجولة ───────────────────────────────
  async function updateRoundStatus(id, status) {
    if (!isOwner && !isSuperAdmin) { showToast('⛔ لا تملك صلاحية تغيير حالة الجولة', true); return }
    try {
      const current = rounds.find(r => r.id === id)
      await upsert('dist_rounds', { ...current, id, status })
      if (online) await supabase.from('dist_rounds').update({ status }).eq('id', id)
      setRounds(r => r.map(x => x.id === id ? { ...x, status } : x))
      if (selected?.id === id) setSelected(s => ({ ...s, status }))
      showToast('✅ تم تحديث الحالة')
    } catch(err) { showToast('خطأ: ' + err.message, true) }
  }

  const allowedDistCampIds = getAllowedCampIds(campsRaw)
  const campsList = Object.entries(camps)
    .map(([id, name]) => ({ id, name }))
    .filter(c => allowedDistCampIds === null || allowedDistCampIds.includes(c.id))
  const filtered  = rounds.filter(r => !search || (r.name||'').toLowerCase().includes(search.toLowerCase()))
  const receivedCount = Object.keys(received).length

  // ─── عرض استلام الأسر ────────────────────────────────
  if (view === 'receive') {
    return (
      <div>
        <PageHeader icon="🎁" title="استلام التوزيع"
          subtitle={`${selBatch?.name} — ${receivedCount}/${families.length} أسرة`}
          action={
            <button onClick={() => setView('batches')}
              className="bg-surface2 border border-border text-white font-bold px-3 py-2 rounded-xl text-sm">
              ← رجوع
            </button>
          }
        />
        {batchLoad ? <div className="flex justify-center py-16"><Spinner /></div>
        : families.length === 0
          ? <EmptyState icon="👨‍👩‍👧‍👦" title="لا توجد أسر نشطة في هذا المخيم" />
          : (
            <div className="flex flex-col gap-2">
              <div className="bg-surface border border-accent/30 rounded-xl p-3 mb-2 text-center">
                <span className="text-accent font-black text-lg">{receivedCount}</span>
                <span className="text-muted text-sm"> / {families.length} أسرة استلمت</span>
              </div>
              {families.map(fam => {
                const done = !!received[fam.id]
                return (
                  <div key={fam.id}
                    onClick={() => toggleReceive(fam)}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all
                      ${done
                        ? 'bg-green/10 border-green/30'
                        : 'bg-surface border-border hover:border-accent/40'}`}>
                    <div>
                      <div className="font-bold text-white text-sm">{fam.head_name}</div>
                      <div className="text-muted text-xs">{fam.head_id} · {fam.members_count || 0} فرد</div>
                    </div>
                    <div className={`text-2xl transition-all ${done ? 'scale-110' : 'opacity-30'}`}>
                      {done ? '✅' : '⬜'}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        }
      </div>
    )
  }

  // ─── عرض الدفعات ─────────────────────────────────────
  if (view === 'batches') {
    return (
      <div>
        <PageHeader icon="📋" title={selected?.name || 'الدفعات'}
          subtitle={`${batches.length} دفعة`}
          action={
            <div className="flex gap-2">
              {canWrite && (
                <button onClick={() => setShowAddBatch(true)}
                  className="bg-accent text-bg font-black px-3 py-2 rounded-xl text-sm">＋ دفعة</button>
              )}
              <button onClick={() => { setView('rounds'); setSelected(null) }}
                className="bg-surface2 border border-border text-white font-bold px-3 py-2 rounded-xl text-sm">
                ← رجوع
              </button>
            </div>
          }
        />

        {/* حالة الجولة */}
        <div className="bg-surface border border-border rounded-xl p-3 mb-4 flex items-center justify-between">
          <div>
            <div className="text-muted text-xs">حالة الجولة</div>
            <Badge color={STATUS_MAP[selected?.status]?.color || 'muted'}>
              {STATUS_MAP[selected?.status]?.label || selected?.status}
            </Badge>
          </div>
          {(isOwner || isSuperAdmin) && (
            <div className="flex gap-2">
              {selected?.status === 'draft' && (
                <button onClick={() => updateRoundStatus(selected.id, 'active')}
                  className="bg-green/15 border border-green/30 text-green font-bold px-3 py-1.5 rounded-xl text-xs">
                  ▶️ تفعيل
                </button>
              )}
              {selected?.status === 'active' && (
                <button onClick={() => updateRoundStatus(selected.id, 'completed')}
                  className="bg-blue/15 border border-blue/30 text-blue font-bold px-3 py-1.5 rounded-xl text-xs">
                  ✅ إتمام
                </button>
              )}
            </div>
          )}
        </div>

        {batchLoad ? <div className="flex justify-center py-16"><Spinner /></div>
        : batches.length === 0
          ? <EmptyState icon="📋" title="لا توجد دفعات" subtitle="أضف دفعة لبدء التوزيع" />
          : (
            <div className="flex flex-col gap-2">
              {batches.map(batch => (
                <div key={batch.id}
                  className="bg-surface border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-bold text-white text-sm">{batch.name}</div>
                      {batch.camp_id && camps[batch.camp_id] && (
                        <div className="text-muted text-xs mt-0.5">🏕️ {camps[batch.camp_id]}</div>
                      )}
                      <div className="text-muted text-xs mt-0.5">📅 {formatDate(batch.created_at)}</div>
                    </div>
                    <Badge color={DIST_STATUS_MAP[batch.status]?.color || 'muted'}>
                      {DIST_STATUS_MAP[batch.status]?.label || batch.status}
                    </Badge>
                  </div>
                  {(selected?.status === 'active' || selected?.status === 'draft') && (
                    <button onClick={() => loadReceive(batch)}
                      className="w-full bg-accent/10 border border-accent/30 text-accent font-bold py-2 rounded-xl text-sm">
                      🎁 بدء الاستلام
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        }

        {/* مودال إضافة دفعة */}
        <Modal open={showAddBatch} onClose={() => setShowAddBatch(false)} title="➕ إضافة دفعة">
          <form onSubmit={handleAddBatch} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">اسم الدفعة *</label>
              <input value={bForm.name} onChange={e => setBForm(f=>({...f,name:e.target.value}))}
                placeholder="الدفعة الأولى"
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">المخيم</label>
              <select value={bForm.camp_id} onChange={e => setBForm(f=>({...f,camp_id:e.target.value}))}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                <option value="">— {selected?.camp_id ? camps[selected.camp_id] : 'كل المخيمات'} —</option>
                {campsList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">ملاحظات</label>
              <textarea value={bForm.notes} onChange={e => setBForm(f=>({...f,notes:e.target.value}))}
                rows={2} className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent resize-none" />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={saving}
                className="flex-1 bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
                {saving ? 'جاري الحفظ...' : '✅ إضافة'}
              </button>
              <button type="button" onClick={() => setShowAddBatch(false)}
                className="flex-1 bg-surface2 border border-border text-white font-bold py-3 rounded-xl text-sm">
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      </div>
    )
  }

  // ─── عرض الجولات (الرئيسي) ───────────────────────────
  return (
    <div>
      <PageHeader icon="📦" title="التوزيعات" subtitle={`${rounds.length} جولة`}
        action={canWrite && (
          <button onClick={() => setShowAddRound(true)}
            className="bg-accent text-bg font-black px-4 py-2 rounded-xl text-sm">＋ إضافة</button>
        )}
      />

      {/* إحصائيات سريعة */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {Object.entries(STATUS_MAP).map(([k,v]) => (
          <div key={k} className="bg-surface border border-border rounded-xl p-2 text-center">
            <div className={`text-lg font-black text-${v.color}`}>
              {rounds.filter(r => r.status === k).length}
            </div>
            <div className="text-muted text-[9px] mt-0.5">{v.label}</div>
          </div>
        ))}
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="بحث في الجولات..." />

      {loading
        ? <div className="flex justify-center py-16"><Spinner /></div>
        : filtered.length === 0
          ? <EmptyState icon="📦" title="لا توجد جولات توزيع" />
          : (
            <div className="flex flex-col gap-2">
              {filtered.map(round => (
                <div key={round.id}
                  onClick={() => loadBatches(round)}
                  className="bg-surface border border-border rounded-xl p-4 cursor-pointer hover:border-accent/40 active:scale-[0.98] transition-all">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-white text-sm">{round.name}</div>
                      {round.camp_id && camps[round.camp_id] && (
                        <div className="text-muted text-xs mt-0.5">🏕️ {camps[round.camp_id]}</div>
                      )}
                      <div className="text-muted text-xs mt-0.5">📅 {formatDate(round.created_at)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge color={STATUS_MAP[round.status]?.color || 'muted'}>
                        {STATUS_MAP[round.status]?.label || round.status}
                      </Badge>
                      <span className="text-muted text-[10px]">← الدفعات</span>
                    </div>
                  </div>
                  {round.notes && (
                    <div className="text-muted text-xs mt-2 bg-surface2 rounded-lg p-2">{round.notes}</div>
                  )}
                </div>
              ))}
            </div>
          )
      }

      {/* مودال إضافة جولة */}
      <Modal open={showAddRound} onClose={() => setShowAddRound(false)} title="➕ إضافة جولة توزيع">
        <form onSubmit={handleAddRound} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">اسم الجولة *</label>
            <input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))}
              placeholder="توزيع رمضان 2025"
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">المخيم</label>
            <select value={form.camp_id} onChange={e => setForm(f=>({...f,camp_id:e.target.value}))}
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
              <option value="">— كل المخيمات —</option>
              {campsList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))}
              rows={2} className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent resize-none" />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="flex-1 bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
              {saving ? 'جاري الحفظ...' : '✅ إضافة الجولة'}
            </button>
            <button type="button" onClick={() => setShowAddRound(false)}
              className="flex-1 bg-surface2 border border-border text-white font-bold py-3 rounded-xl text-sm">
              إلغاء
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
