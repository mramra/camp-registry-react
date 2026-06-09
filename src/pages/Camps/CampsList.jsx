import { useState, useEffect } from 'react'
import { supabase, ORG_ID } from '../../lib/supabase'
import { localDB } from '../../lib/db'
import { enqueue } from '../../lib/sync'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import SearchBar from '../../components/ui/SearchBar'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'

const STATUS_MAP = {
  active:    { label:'نشط',    color:'green' },
  suspended: { label:'موقوف',  color:'accent' },
  closed:    { label:'مغلق',   color:'red' },
}

const EMPTY_FORM = {
  name:'', address:'', capacity:'', facilities:'',
  status:'active', camp_type:'main', parent_camp_id:'',
  latitude:'', longitude:'',
}

export default function CampsList() {
  const [camps,        setCamps]        = useState([])
  const [search,       setSearch]       = useState('')
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [showModal,    setShowModal]    = useState(false)
  const [editId,       setEditId]       = useState(null)
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [errors,       setErrors]       = useState({})
  const [selected,     setSelected]     = useState(null)
  const [familyCounts, setFamilyCounts] = useState({})
  const [collapsed,    setCollapsed]    = useState({})

  const { isSuperAdmin, isOwner, isCampDelegate, canDelete } = useAuth()
  const { showToast, online } = useApp()
  const canManage = isOwner || isSuperAdmin || isCampDelegate

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      if (online) {
        const { data, error } = await supabase
          .from('camps').select('*').eq('org_id', ORG_ID).order('created_at', { ascending: false })
        if (error) { showToast('خطأ السيرفر: ' + error.message, true) }
        else if (data) {
          try { await localDB.camps.bulkPut(data) } catch {}
          setCamps(data)
        }
      }
      const localCamps = await localDB.camps.toArray().catch(() => [])
      if (!online) setCamps(localCamps.sort((a,b) => new Date(b.created_at)-new Date(a.created_at)))
      const families = await localDB.families.toArray().catch(() => [])
      const counts = {}
      families.forEach(f => { counts[f.camp_id] = (counts[f.camp_id] || 0) + 1 })
      setFamilyCounts(counts)
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setLoading(false) }
  }

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: null }))
  }

  function validate() {
    const errs = {}
    if (!form.name.trim()) errs.name = 'اسم المخيم مطلوب'
    if (form.camp_type === 'branch' && !form.parent_camp_id) errs.parent_camp_id = 'اختر المخيم الرئيسي'
    return errs
  }

  async function handleSave(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const data = {
        id: editId || crypto.randomUUID(), org_id: ORG_ID,
        name: form.name.trim(), address: form.address.trim() || null,
        capacity: parseInt(form.capacity) || 0,
        facilities: parseInt(form.facilities) || 0,
        status: form.status, camp_type: form.camp_type,
        parent_camp_id: form.camp_type === 'branch' ? form.parent_camp_id || null : null,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        updated_at: now, ...(!editId && { created_at: now }),
      }
      await localDB.camps.put(data)
      await enqueue(editId ? 'update_camp' : 'insert_camp', data)
      if (online) {
        const { error } = await supabase.from('camps').upsert(data)
        if (error) throw error
      }
      await loadData()
      setShowModal(false)
      showToast(editId ? '✅ تم تعديل المخيم' : '✅ تمت إضافة المخيم')
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setSaving(false) }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`حذف "${name}"؟`)) return
    try {
      await localDB.camps.delete(id)
      if (online) await supabase.from('camps').delete().eq('id', id)
      setCamps(c => c.filter(x => x.id !== id))
      setSelected(null)
      showToast('تم الحذف')
    } catch { showToast('فشل الحذف', true) }
  }

  function openAdd(parentId = null) {
    setEditId(null)
    setForm({ ...EMPTY_FORM, camp_type: parentId ? 'branch' : 'main', parent_camp_id: parentId || '' })
    setErrors({}); setShowModal(true)
  }

  function openEdit(camp) {
    setEditId(camp.id)
    setForm({
      name: camp.name||'', address: camp.address||'',
      capacity: camp.capacity||'', facilities: camp.facilities||'',
      status: camp.status||'active', camp_type: camp.camp_type||'main',
      parent_camp_id: camp.parent_camp_id||'',
      latitude: camp.latitude!=null ? String(camp.latitude) : '',
      longitude: camp.longitude!=null ? String(camp.longitude) : '',
    })
    setErrors({}); setSelected(null); setShowModal(true)
  }

  function getGPS() {
    if (!navigator.geolocation) return showToast('GPS غير مدعوم', true)
    showToast('📍 جاري تحديد الموقع...')
    navigator.geolocation.getCurrentPosition(
      pos => { set('latitude', pos.coords.latitude.toFixed(6)); set('longitude', pos.coords.longitude.toFixed(6)); showToast('✅ تم') },
      () => showToast('تعذر GPS', true),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  // ===== بناء الشجرة =====
  const q = search.toLowerCase()
  const allFiltered = search
    ? camps.filter(c => (c.name||'').toLowerCase().includes(q) || (c.address||'').toLowerCase().includes(q))
    : camps

  const mainCamps  = camps.filter(c => c.camp_type !== 'branch')
  const getBranches = (parentId) => camps.filter(c => c.parent_camp_id === parentId)
  const filteredMain = allFiltered.filter(c => c.camp_type !== 'branch')
  const filteredBranches = allFiltered.filter(c => c.camp_type === 'branch')

  // إحصائيات
  const totalFamilies = Object.values(familyCounts).reduce((a,b)=>a+b,0)
  const activeCamps = camps.filter(c=>c.status==='active').length

  return (
    <div>
      <PageHeader icon="🏕️" title="إدارة المخيمات" subtitle={`${camps.length} مخيم`}
        action={canManage && (
          <button onClick={() => openAdd()} className="bg-accent text-bg font-black px-4 py-2 rounded-xl text-sm">＋ إضافة</button>
        )}
      />

      {/* إحصائيات */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-surface border border-border rounded-xl p-3 text-center">
          <div className="text-xl font-black text-accent">{camps.length}</div>
          <div className="text-muted text-[10px] mt-0.5">إجمالي المخيمات</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-3 text-center">
          <div className="text-xl font-black text-green">{activeCamps}</div>
          <div className="text-muted text-[10px] mt-0.5">نشط</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-3 text-center">
          <div className="text-xl font-black text-blue">{totalFamilies}</div>
          <div className="text-muted text-[10px] mt-0.5">إجمالي الأسر</div>
        </div>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="بحث باسم المخيم أو العنوان..." />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : camps.length === 0 ? (
        <EmptyState icon="🏕️" title="لا توجد مخيمات"
          action={canManage && (
            <button onClick={()=>openAdd()} className="bg-accent text-bg font-black px-5 py-2.5 rounded-xl text-sm mt-2">إضافة مخيم</button>
          )}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {(search ? filteredMain : mainCamps).map(camp => {
            const branches = getBranches(camp.id)
            const isOpen = !collapsed[camp.id]
            const fCount = familyCounts[camp.id] || 0
            const capacity = camp.capacity || 0
            const pct = capacity > 0 ? Math.min(100, Math.round(fCount/capacity*100)) : 0

            return (
              <div key={camp.id}>
                {/* ===== المخيم الرئيسي ===== */}
                <div onClick={()=>setSelected(camp)}
                  className={`bg-surface border-2 rounded-2xl p-4 cursor-pointer active:scale-98 transition-all
                    ${camp.status==='active'?'border-accent/40':'border-border'}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-2xl">⛺</span>
                      <div className="min-w-0">
                        <div className="font-black text-white text-base truncate">{camp.name}</div>
                        {camp.address && <div className="text-muted text-xs mt-0.5">📍 {camp.address}</div>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 mr-2">
                      <Badge color={STATUS_MAP[camp.status]?.color||'muted'}>
                        {STATUS_MAP[camp.status]?.label||camp.status}
                      </Badge>
                      <span className="text-[9px] text-blue font-bold">مخيم رئيسي</span>
                    </div>
                  </div>

                  {/* إحصائيات */}
                  <div className="flex gap-3 text-xs text-muted mb-2 flex-wrap">
                    <span>👨‍👩‍👧‍👦 {fCount} أسرة</span>
                    {capacity>0 && <span>📊 سعة {capacity}</span>}
                    {camp.facilities>0 && <span>🏗️ {camp.facilities} مرافق</span>}
                    {branches.length>0 && <span className="text-accent font-bold">🏕️ {branches.length} فرع</span>}
                    {camp.latitude && <span>📍 GPS ✓</span>}
                  </div>

                  {/* شريط السعة */}
                  {capacity>0 && (
                    <div className="mb-2">
                      <div className="flex justify-between text-[10px] text-muted mb-1">
                        <span>الإشغال</span><span>{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${pct>=90?'bg-red':pct>=70?'bg-accent':'bg-green'}`}
                          style={{width:`${pct}%`}}/>
                      </div>
                    </div>
                  )}

                  {/* أزرار */}
                  {canManage && (
                    <div className="flex gap-2 flex-wrap" onClick={e=>e.stopPropagation()}>
                      <button onClick={()=>openEdit(camp)}
                        className="bg-blue/10 border border-blue/30 text-blue px-3 py-1.5 rounded-lg text-xs font-bold">✏️ تعديل</button>
                      <button onClick={()=>openAdd(camp.id)}
                        className="bg-accent/10 border border-accent/30 text-accent px-3 py-1.5 rounded-lg text-xs font-bold">＋ فرع</button>
                      {branches.length>0 && (
                        <button onClick={()=>setCollapsed(c=>({...c,[camp.id]:!c[camp.id]}))}
                          className="bg-surface2 border border-border text-muted px-3 py-1.5 rounded-lg text-xs font-bold">
                          {isOpen?`▲ طي (${branches.length})`:`▼ ${branches.length} فرع`}
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={()=>handleDelete(camp.id,camp.name)}
                          className="bg-red/10 border border-red/30 text-red px-3 py-1.5 rounded-lg text-xs font-bold">🗑️</button>
                      )}
                    </div>
                  )}
                </div>

                {/* ===== الفروع ===== */}
                {isOpen && branches.map(branch => {
                  const bCount = familyCounts[branch.id] || 0
                  const bCap = branch.capacity || 0
                  const bPct = bCap>0 ? Math.min(100, Math.round(bCount/bCap*100)) : 0
                  return (
                    <div key={branch.id} className="mr-5 border-r-2 border-accent/20">
                      <div className="flex items-center gap-1 mr-0 pr-2">
                        <span className="text-accent/40 text-sm mr-1">└─</span>
                        <div onClick={()=>setSelected(branch)}
                          className="flex-1 bg-surface border border-accent/20 rounded-xl p-3 cursor-pointer active:scale-98 transition-all hover:border-accent/40 mb-1.5">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-lg">🏕️</span>
                              <div className="min-w-0">
                                <div className="font-bold text-white text-sm truncate">{branch.name}</div>
                                {branch.address && <div className="text-muted text-xs">📍 {branch.address}</div>}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 mr-2">
                              <Badge color={STATUS_MAP[branch.status]?.color||'muted'}>
                                {STATUS_MAP[branch.status]?.label}
                              </Badge>
                              <span className="text-[9px] text-purple-400 font-bold">فرع</span>
                            </div>
                          </div>
                          <div className="flex gap-3 text-xs text-muted mb-1.5 flex-wrap">
                            <span>👨‍👩‍👧‍👦 {bCount} أسرة</span>
                            {bCap>0 && <span>📊 سعة {bCap}</span>}
                            {branch.latitude && <span>📍 GPS ✓</span>}
                          </div>
                          {bCap>0 && (
                            <div className="h-1 bg-surface2 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${bPct>=90?'bg-red':bPct>=70?'bg-accent':'bg-green'}`}
                                style={{width:`${bPct}%`}}/>
                            </div>
                          )}
                          {canManage && (
                            <div className="flex gap-2 mt-2 flex-wrap" onClick={e=>e.stopPropagation()}>
                              <button onClick={()=>openEdit(branch)}
                                className="bg-blue/10 border border-blue/30 text-blue px-2.5 py-1 rounded-lg text-[11px] font-bold">✏️ تعديل</button>
                              {canDelete && (
                                <button onClick={()=>handleDelete(branch.id,branch.name)}
                                  className="bg-red/10 border border-red/30 text-red px-2.5 py-1 rounded-lg text-[11px] font-bold">🗑️</button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* فروع بحث بدون أب */}
          {search && filteredBranches.filter(b => !filteredMain.some(m=>m.id===b.parent_camp_id)).map(branch => (
            <div key={branch.id} className="bg-surface border border-accent/20 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">🏕️</span>
                <span className="font-bold text-white text-sm">{branch.name}</span>
                <span className="text-[9px] text-purple-400">فرع</span>
              </div>
              <div className="text-muted text-xs">تابع لـ: {camps.find(c=>c.id===branch.parent_camp_id)?.name || '—'}</div>
            </div>
          ))}
        </div>
      )}

      {/* نافذة التفاصيل */}
      <Modal open={!!selected} onClose={()=>setSelected(null)} title="تفاصيل المخيم">
        {selected && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                ['الاسم', selected.name],
                ['النوع', selected.camp_type==='branch'?'فرعي':'رئيسي'],
                ['الحالة', STATUS_MAP[selected.status]?.label],
                ['العنوان', selected.address],
                ['السعة', selected.capacity?`${selected.capacity} أسرة`:'—'],
                ['الأسر الحالية', familyCounts[selected.id]||0],
              ].map(([k,v])=>(
                <div key={k} className="bg-surface2 rounded-xl p-3">
                  <div className="text-muted text-[10px] mb-0.5">{k}</div>
                  <div className="text-white font-bold text-xs">{v||'—'}</div>
                </div>
              ))}
            </div>
            {selected.latitude && (
              <a href={`https://maps.google.com/?q=${selected.latitude},${selected.longitude}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-blue/15 border border-blue/30 text-blue font-bold py-2.5 rounded-xl text-sm">
                🗺️ فتح في Google Maps
              </a>
            )}
          </div>
        )}
      </Modal>

      {/* نافذة الإضافة/التعديل */}
      <Modal open={showModal} onClose={()=>setShowModal(false)} title={editId?'✏️ تعديل مخيم':'➕ إضافة مخيم'} size="lg">
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">اسم المخيم *</label>
            <input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="مثال: مخيم العزايزة"
              className={`w-full bg-surface2 border ${errors.name?'border-red':'border-border'} rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent`}/>
            {errors.name && <p className="text-red text-xs mt-1">{errors.name}</p>}
          </div>
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">النوع</label>
            <div className="flex gap-2">
              {[['main','رئيسي','⛺'],['branch','فرعي','🏕️']].map(([v,l,ic])=>(
                <button key={v} type="button" onClick={()=>set('camp_type',v)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all
                    ${form.camp_type===v?'bg-accent/15 text-accent border-accent':'bg-surface2 border-border text-muted'}`}>
                  {ic} {l}
                </button>
              ))}
            </div>
          </div>
          {form.camp_type==='branch' && (
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">المخيم الرئيسي *</label>
              <select value={form.parent_camp_id} onChange={e=>set('parent_camp_id',e.target.value)}
                className={`w-full bg-surface2 border ${errors.parent_camp_id?'border-red':'border-border'} rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent`}>
                <option value="">— اختر الرئيسي —</option>
                {mainCamps.filter(c=>c.id!==editId).map(c=><option key={c.id} value={c.id}>⛺ {c.name}</option>)}
              </select>
              {errors.parent_camp_id && <p className="text-red text-xs mt-1">{errors.parent_camp_id}</p>}
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">الحالة</label>
            <select value={form.status} onChange={e=>set('status',e.target.value)}
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
              <option value="active">✅ نشط</option>
              <option value="suspended">⏸️ موقوف</option>
              <option value="closed">🔴 مغلق</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">العنوان</label>
            <input value={form.address} onChange={e=>set('address',e.target.value)} placeholder="المنطقة / الحي"
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">السعة</label>
              <input type="number" min="0" value={form.capacity} onChange={e=>set('capacity',e.target.value)}
                placeholder="200" dir="ltr"
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent"/>
            </div>
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">المرافق</label>
              <input type="number" min="0" value={form.facilities} onChange={e=>set('facilities',e.target.value)}
                placeholder="10" dir="ltr"
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent"/>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-muted">الإحداثيات GPS</label>
              <button type="button" onClick={getGPS}
                className="text-xs text-accent bg-accent/10 border border-accent/20 px-2.5 py-1 rounded-lg font-bold">📍 تلقائي</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={form.latitude} onChange={e=>set('latitude',e.target.value)} placeholder="خط العرض" dir="ltr"
                className="bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent"/>
              <input value={form.longitude} onChange={e=>set('longitude',e.target.value)} placeholder="خط الطول" dir="ltr"
                className="bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent"/>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="flex-1 bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
              {saving?'جاري الحفظ...':editId?'💾 حفظ التعديل':'✅ إضافة المخيم'}
            </button>
            <button type="button" onClick={()=>setShowModal(false)}
              className="flex-1 bg-surface2 border border-border text-white font-bold py-3 rounded-xl text-sm">إلغاء</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
