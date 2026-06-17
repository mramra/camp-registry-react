import { useState, useEffect } from 'react'
import { supabase, ORG_ID } from '../../lib/supabase'
import { useLocalDB } from '../../lib/useLocalDB'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import PageHeader from '../../components/ui/PageHeader'
import Modal from '../../components/ui/Modal'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'

const STATUS_MAP = {
  active:    { label:'✅ نشط',     color:'#10b981' },
  suspended: { label:'⏸️ موقوف',  color:'#f59e0b' },
  closed:    { label:'🔴 مغلق',   color:'#ef4444' },
}

export default function CampsList() {
  const [camps,       setCamps]       = useState([])
  const [famCount,    setFamCount]    = useState({})
  const [memberMap,   setMemberMap]   = useState({})
  const [loading,     setLoading]     = useState(true)
  const [syncing,     setSyncing]     = useState(false)
  const [showForm,    setShowForm]    = useState(false)
  const [search,      setSearch]      = useState('')
  const [collapsed,   setCollapsed]   = useState(new Set())

  function toggleCollapse(id) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const [editCamp,    setEditCamp]    = useState(null)
  const [form,        setForm]        = useState({ name:'', camp_type:'main', parent_camp_id:'', address:'', capacity:'', status:'active', coordinates:'' })
  const [saving,      setSaving]      = useState(false)

  const { isOwner, isSuperAdmin, isCampDelegate, canWrite, profile } = useAuth()
  const { showToast , psReady, psSynced} = useApp()

  const { query, upsert, remove, bulkUpsert } = useLocalDB()
  useEffect(() => { loadData() }, [])
  // Delta Sync — يحدّث الصفحة عند وصول تغييرات من مستخدمين آخرين
  useEffect(() => {
    const handler = () => loadData()
    window.addEventListener('delta-sync', handler)
    return () => window.removeEventListener('delta-sync', handler)
  }, [])

  useEffect(() => { loadData() }, [])
  useEffect(() => { if (psReady)  loadData() }, [psReady])
  useEffect(() => { if (psSynced) loadData() }, [psSynced])

  async function loadData() {
    setLoading(true)
    try {
      const [lCamps, lFams, lMems] = await Promise.all([
        query('camps'),
        query('families'),
        query('org_members'),
      ])
      applyData(lCamps, lFams, lMems)
      setLoading(false)
      if (!navigator.onLine) return
      setSyncing(true)
      const [cRes, fRes, mRes] = await Promise.all([
        supabase.from('camps').select('*').eq('org_id', ORG_ID),
        supabase.from('families').select('id,camp_id').eq('org_id', ORG_ID),
        supabase.from('org_members').select('id,full_name,role,camp_id').eq('org_id', ORG_ID),
      ])
      const c2 = !cRes.error && cRes.data ? cRes.data : lCamps
      const f2 = !fRes.error && fRes.data ? fRes.data : lFams
      const m2 = !mRes.error && mRes.data ? mRes.data : lMems
      await bulkUpsert('camps', c2)
      if (m2.length) await bulkUpsert('org_members', m2).catch(()=>{})
      applyData(c2, f2, m2)
    } catch(e) { console.error(e) }
    finally { setLoading(false); setSyncing(false) }
  }

  function applyData(camps, fams, members) {
    const fc = {}
    fams.forEach(f => { fc[f.camp_id] = (fc[f.camp_id]||0)+1 })
    setFamCount(fc)
    const mm = {}
    members.filter(m => m.role==='camp_delegate' && m.camp_id)
      .forEach(m => { mm[m.camp_id] = m.full_name })
    setMemberMap(mm)
    setCamps(camps)
  }

  // فلتر حسب الدور
  function visibleCamps() {
    if (isOwner || isSuperAdmin) return camps
    if (isCampDelegate && profile?.camp_id) {
      return camps.filter(c => c.id===profile.camp_id || c.parent_camp_id===profile.camp_id)
    }
    return camps
  }

  function openAdd() {
    setEditCamp(null)
    setForm({ name:'', camp_type:'main', parent_camp_id:'', address:'', capacity:'', status:'active', notes:'' })
    setShowForm(true)
  }

  function openEdit(camp) {
    setEditCamp(camp)
    setForm({ name:camp.name||'', camp_type:camp.camp_type||'main', parent_camp_id:camp.parent_camp_id||'', address:camp.address||'', capacity:camp.capacity||'', status:camp.status||'active', coordinates: camp.latitude && camp.longitude ? `${camp.latitude},${camp.longitude}` : '' })
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim()) return showToast('اسم المخيم مطلوب', true)
    setSaving(true)
    try {
      const data = {
        id:             editCamp?.id || crypto.randomUUID(),
        org_id:         ORG_ID,
        name:           form.name.trim(),
        camp_type:      form.camp_type      || 'main',
        parent_camp_id: form.parent_camp_id || null,
        address:        form.address        || null,
        capacity:       form.capacity       ? parseInt(form.capacity) : null,
        status:         form.status         || 'active',
        latitude:       (() => {
          const c = form.coordinates?.trim()
          if (!c) return editCamp?.latitude || null
          const parts = c.split(',')
          const v = parseFloat(parts[0]?.trim())
          return isNaN(v) ? null : v
        })(),
        longitude:      (() => {
          const c = form.coordinates?.trim()
          if (!c) return editCamp?.longitude || null
          const parts = c.split(',')
          const v = parseFloat(parts[1]?.trim())
          return isNaN(v) ? null : v
        })(),
        created_at:     editCamp?.created_at || new Date().toISOString(),
        // احتفظ بالحقول الموجودة مسبقاً
        ...(editCamp ? {
          manager_id:  editCamp.manager_id  || null,
          facilities:  editCamp.facilities  || 0,
          portal_open: editCamp.portal_open || false,
        } : {
          facilities: 0, portal_open: false,
        }),
      }
      await upsert('camps', data)
      await enqueue(editCamp ? 'update_camp' : 'insert_camp', data)
      setCamps(prev => editCamp ? prev.map(c=>c.id===data.id?data:c) : [...prev, data])
      setShowForm(false)
      showToast(editCamp ? '✅ تم التعديل' : '✅ تمت الإضافة')
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setSaving(false) }
  }

  async function handleDelete(camp) {
    if (!window.confirm(`حذف "${camp.name}"؟`)) return
    try {
      await remove('camps', camp.id)
      if (navigator.onLine) await supabase.from('camps').delete().eq('id', camp.id)
      else await enqueue('delete_camp', { id: camp.id })
      setCamps(prev => prev.filter(c => c.id !== camp.id))
      showToast('✅ تم الحذف')
    } catch(err) { showToast('خطأ: ' + err.message, true) }
  }

  const visible    = visibleCamps()
  const visibleIds  = new Set(visible.map(c => c.id))
  const searchLower = search.trim().toLowerCase()
  const isSearching = !!searchLower

  // هرمي فقط: الرئيسية تظهر وفروعها تحتها
  const parents  = isSearching
    ? visible.filter(c => c.name?.toLowerCase().includes(searchLower))
    : visible.filter(c => !c.parent_camp_id || !visibleIds.has(c.parent_camp_id))
  const children = isSearching ? []
    : visible.filter(c => !!c.parent_camp_id && visibleIds.has(c.parent_camp_id))
  const mainCamps = camps.filter(c => !c.parent_camp_id)

  return (
    <div>
      <div className="mb-3">
        <input
          value={search}
          onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 ابحث باسم المخيم..."
          className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent"
        />
      </div>
      <PageHeader icon="⛺" title="إدارة المخيمات"
        subtitle={
          <span className="flex items-center gap-2">
            <span className="text-muted text-xs">{visible.length} مخيم</span>
            {syncing && <span className="text-[10px] text-accent animate-pulse">🔄</span>}
          </span>
        }
        action={canWrite && (
          <button onClick={openAdd}
            className="bg-accent text-bg font-black px-4 py-2 rounded-xl text-sm">➕ إضافة</button>
        )}
      />

      {loading ? <div className="flex justify-center py-16"><Spinner /></div>
      : visible.length === 0 ? <EmptyState icon="⛺" title="لا توجد مخيمات" />
      : (
        <div className="flex flex-col gap-2">
          {parents.map(camp => (
            <CampCard key={camp.id}
              camp={camp}
              sub={children.filter(c=>c.parent_camp_id===camp.id)}
              famCount={famCount}
              memberMap={memberMap}
              isOwner={isOwner}
              isSuperAdmin={isSuperAdmin}
              isCampDelegate={isCampDelegate}
              profile={profile}
              onEdit={openEdit}
              onDelete={handleDelete}
              collapsed={collapsed.has(camp.id)}
              onToggle={()=>toggleCollapse(camp.id)}
            />
          ))}
        </div>
      )}

      {/* فورم الإضافة/التعديل */}
      <Modal open={showForm} onClose={()=>setShowForm(false)}
        title={editCamp ? '✏️ تعديل مخيم' : '➕ إضافة مخيم'}>
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">اسم المخيم *</label>
            <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
              placeholder="مثال: مخيم العزايزة"
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent"/>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">النوع</label>
              <select value={form.camp_type} onChange={e=>setForm(f=>({...f,camp_type:e.target.value,parent_camp_id:''}))}
                className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                <option value="main">🏕️ رئيسي</option>
                <option value="sub">🏕️ فرعي</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">الحالة</label>
              <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}
                className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                <option value="active">✅ نشط</option>
                <option value="suspended">⏸️ موقوف</option>
                <option value="closed">🔴 مغلق</option>
              </select>
            </div>
          </div>
          {form.camp_type === 'sub' && (
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">المخيم الرئيسي</label>
              <select value={form.parent_camp_id} onChange={e=>setForm(f=>({...f,parent_camp_id:e.target.value}))}
                className="w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                <option value="">— اختر —</option>
                {mainCamps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">العنوان</label>
            <input value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}
              placeholder="موقع المخيم"
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent"/>
          </div>
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">📍 إحداثيات GPS</label>
            <input value={form.coordinates} onChange={e=>setForm(f=>({...f,coordinates:e.target.value}))}
              placeholder="31.547565,34.461274" dir="ltr"
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-accent"/>
            <div className="text-muted text-[10px] mt-1">الصيغة: خط_العرض,خط_الطول مثل 31.547565,34.461274</div>
            <button type="button"
              onClick={() => {
                if (!navigator.geolocation) return
                navigator.geolocation.getCurrentPosition(
                  pos => setForm(f=>({...f, coordinates: `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`})),
                  () => alert('تعذّر الحصول على الموقع')
                )
              }}
              className="mt-2 w-full py-2 rounded-xl text-xs font-bold border border-blue/40 text-blue"
              style={{background:'rgba(59,130,246,0.08)'}}>
              📡 استخدام موقعي الحالي
            </button>
            {form.coordinates && form.coordinates.includes(',') && (
              <a href={`https://maps.google.com/?q=${form.coordinates.trim()}`}
                target="_blank" rel="noreferrer"
                className="mt-1.5 flex items-center justify-center gap-1 text-[11px] text-blue py-1.5 rounded-xl border border-blue/30"
                style={{background:'rgba(59,130,246,0.05)'}}>
                🗺️ معاينة على الخريطة
              </a>
            )}
          </div>
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">الطاقة الاستيعابية (أسرة)</label>
            <input type="number" value={form.capacity} onChange={e=>setForm(f=>({...f,capacity:e.target.value}))}
              placeholder="0 = غير محدد" min="0"
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent"/>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
              {saving ? 'جاري الحفظ...' : editCamp ? '💾 حفظ' : '✅ إضافة'}
            </button>
            <button type="button" onClick={()=>setShowForm(false)}
              className="flex-1 bg-surface2 border border-border text-white font-bold py-3 rounded-xl text-sm">
              إلغاء
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function CampCard({ camp, sub, famCount, memberMap, isOwner, isSuperAdmin, isCampDelegate, profile, onEdit, onDelete, collapsed, onToggle }) {
  const fc = famCount[camp.id] || 0
  const st = STATUS_MAP[camp.status] || { label: camp.status||'—', color:'#6b7280' }
  const canEdit = isOwner || isSuperAdmin || (isCampDelegate && profile?.camp_id === camp.id)
  const canDel  = isOwner && fc === 0

  return (
    <div>
      <div className="bg-surface border border-border rounded-xl p-4"
        style={{borderRight:'3px solid #f59e0b'}}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-black text-white text-sm">⛺ {camp.name}</div>
            {memberMap[camp.id] && (
              <div className="text-[11px] mt-0.5" style={{color:'#f59e0b'}}>🟠 مندوب: {memberMap[camp.id]}</div>
            )}
            {camp.address && <div className="text-muted text-[10px] mt-0.5">📍 {camp.address}</div>}
            <div className="text-muted text-[10px] mt-0.5">
              👥 {fc} أسرة{camp.capacity ? ` من ${camp.capacity}` : ''}
              {sub.length > 0 && (
                <span
                  onClick={e=>{e.stopPropagation();onToggle()}}
                  className="cursor-pointer ml-1 text-blue hover:text-accent">
                  • 🏕️ {sub.length} فرع {collapsed?'▼':'▲'}
                </span>
              )}
            </div>
            {camp.latitude && camp.longitude && (
              <a href={`https://maps.google.com/?q=${Number(camp.latitude).toFixed(6)},${Number(camp.longitude).toFixed(6)}`}
                target="_blank" rel="noreferrer"
                className="text-[10px] text-blue mt-1 inline-block">
                🗺️ عرض على الخريطة
              </a>
            )}
          </div>
          <span className="text-[10px] font-bold flex-shrink-0" style={{color:st.color}}>{st.label}</span>
        </div>
        {(canEdit || canDel) && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {canEdit && (
              <button onClick={()=>onEdit(camp)}
                className="text-[11px] font-bold px-3 py-1.5 rounded-lg border"
                style={{background:'rgba(59,130,246,0.1)',borderColor:'rgba(59,130,246,0.4)',color:'#3b82f6'}}>
                ✏️ تعديل
              </button>
            )}
            {(isOwner||isSuperAdmin) && (
              <button onClick={()=>onEdit({...camp,camp_type:'sub',parent_camp_id:camp.id,name:''})}
                className="text-[11px] font-bold px-3 py-1.5 rounded-lg border"
                style={{background:'rgba(16,185,129,0.1)',borderColor:'rgba(16,185,129,0.4)',color:'#10b981'}}>
                ➕ فرع
              </button>
            )}
            {canDel && (
              <button onClick={()=>onDelete(camp)}
                className="text-[11px] font-bold px-3 py-1.5 rounded-lg border"
                style={{background:'rgba(239,68,68,0.1)',borderColor:'rgba(239,68,68,0.4)',color:'#ef4444'}}>
                🗑️ حذف
              </button>
            )}
          </div>
        )}
      </div>
      {/* الفروع */}
      {!collapsed && sub.map(s => (
        <div key={s.id} className="bg-surface border border-border rounded-xl p-3 mr-4 mt-1.5"
          style={{borderRight:'3px solid #3b82f6'}}>
          <div className="flex items-start justify-between">
            <div>
              <div className="font-bold text-white text-xs">🏕️ {s.name}</div>
              {memberMap[s.id] && <div className="text-[10px] mt-0.5" style={{color:'#f59e0b'}}>🟠 {memberMap[s.id]}</div>}
              {s.address && <div className="text-muted text-[10px]">📍 {s.address}</div>}
              <div className="text-muted text-[10px]">👥 {famCount[s.id]||0} أسرة</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] font-bold" style={{color:(STATUS_MAP[s.status]||{color:'#6b7280'}).color}}>
                {(STATUS_MAP[s.status]||{label:s.status}).label}
              </span>
              {canEdit && (
                <button onClick={()=>onEdit(s)}
                  className="text-[10px] font-bold px-2 py-1 rounded-lg border"
                  style={{background:'rgba(59,130,246,0.1)',borderColor:'rgba(59,130,246,0.4)',color:'#3b82f6'}}>
                  ✏️
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
