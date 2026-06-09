import { useState, useEffect } from 'react'
import { supabase, ORG_ID, callAdminAPI } from '../../lib/supabase'
import { localDB } from '../../lib/db'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { randomPassword, roleLabel } from '../../lib/utils'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import SearchBar from '../../components/ui/SearchBar'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'

const ROLE_CONFIG = {
  platform_owner: { icon: '👑', color: 'text-yellow-400', bg: 'border-r-yellow-400', badge: 'bg-yellow-400/15 text-yellow-400 border-yellow-400/30', label: 'مالك المنصة', indent: 0 },
  super_admin:    { icon: '🔴', color: 'text-red',    bg: 'border-r-red',    badge: 'bg-red/15 text-red border-red/30',       label: 'مدير الإيواء',   indent: 0 },
  camp_delegate:  { icon: '🟠', color: 'text-accent', bg: 'border-r-accent', badge: 'bg-accent/15 text-accent border-accent/30', label: 'مندوب مخيم',   indent: 1 },
  assistant:      { icon: '🟡', color: 'text-blue',   bg: 'border-r-blue',   badge: 'bg-blue/15 text-blue border-blue/30',     label: 'مساعد',         indent: 2 },
}

const PAGES_LIST = [
  { id: 'families',      label: '👪 الأسر',         ops: ['add','edit','delete'] },
  { id: 'distributions', label: '📦 التوزيع',        ops: ['add'] },
  { id: 'data',          label: '📁 استيراد/تصدير',  ops: [] },
  { id: 'movements',     label: '🚶 حركات الأسر',    ops: [] },
  { id: 'analysis',      label: '📈 التقارير',        ops: [] },
  { id: 'alerts',        label: '🔔 التنبيهات',       ops: [] },
]

const EMPTY_FORM = {
  full_name:'', national_id:'', phone:'', role:'camp_delegate', camp_id:'',
  can_add:true, can_edit:true, can_delete:false, can_export:false, can_import:false,
  allowed_pages:{},
}

export default function UsersList() {
  const [users,    setUsers]    = useState([])
  const [camps,    setCamps]    = useState([])
  const [search,   setSearch]   = useState('')
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [showAdd,  setShowAdd]  = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [resetTarget, setReset] = useState(null)
  const [newPass,  setNewPass]  = useState('')
  const [form,     setForm]     = useState(EMPTY_FORM)
  const [errors,   setErrors]   = useState({})
  const [collapsed, setCollapsed] = useState({})

  const { profile, isOwner, isSuperAdmin } = useAuth()
  const { showToast, online } = useApp()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const campsData = await localDB.camps.toArray().catch(() => [])
      setCamps(campsData)
      if (online) {
        const { data, error } = await supabase
          .from('org_members').select('*').eq('org_id', ORG_ID).order('created_at', { ascending: false })
        if (error) { showToast('خطأ السيرفر: ' + error.message, true) }
        else if (data) {
          try { await localDB.org_members.bulkPut(data) } catch {}
          setUsers(data)
        }
      } else {
        const local = await localDB.org_members.toArray().catch(() => [])
        setUsers(local)
      }
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setLoading(false) }
  }

  function setF(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: null }))
  }
  function setPage(pageId, checked) {
    setForm(f => ({ ...f, allowed_pages: { ...f.allowed_pages, [pageId]: checked ? { view:true } : undefined } }))
  }

  function getAllowedRoles() {
    if (isOwner)      return ['super_admin','camp_delegate','assistant']
    if (isSuperAdmin) return ['camp_delegate','assistant']
    return ['assistant']
  }

  function validate() {
    const errs = {}
    if (!form.full_name.trim())   errs.full_name   = 'الاسم مطلوب'
    if (!form.national_id.trim()) errs.national_id = 'رقم الهوية مطلوب'
    if (form.national_id.trim().length < 9) errs.national_id = 'رقم هوية غير صالح'
    if (!form.role) errs.role = 'الدور مطلوب'
    if (form.role !== 'super_admin' && !form.camp_id) errs.camp_id = 'اختر المخيم'
    return errs
  }

  async function handleAdd(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    if (!online) return showToast('يتطلب اتصالاً', true)
    setSaving(true)
    try {
      const pass = randomPassword()
      await callAdminAPI('create_user', {
        email: `${form.national_id.trim()}@c.co`, password: pass,
        full_name: form.full_name.trim(), national_id: form.national_id.trim(),
        phone: form.phone.trim(), role: form.role,
        camp_id: form.camp_id || null, org_id: ORG_ID,
        can_add: form.can_add, can_edit: form.can_edit,
        can_delete: form.can_delete, can_export: form.can_export, can_import: form.can_import,
        allowed_pages: JSON.stringify(form.allowed_pages), created_by: profile?.id,
      })
      showToast(`✅ تم الإنشاء — كلمة المرور: ${pass}`)
      setShowAdd(false); setForm(EMPTY_FORM); await loadData()
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setSaving(false) }
  }

  async function handleEdit(e) {
    e.preventDefault()
    if (!editUser) return
    setSaving(true)
    try {
      const updates = {
        full_name: form.full_name.trim(), phone: form.phone?.trim() || null,
        camp_id: form.camp_id || null, can_add: form.can_add, can_edit: form.can_edit,
        can_delete: form.can_delete, can_export: form.can_export, can_import: form.can_import,
        allowed_pages: JSON.stringify(form.allowed_pages),
      }
      if (isOwner) updates.role = form.role
      const { error } = await supabase.from('org_members').update(updates).eq('id', editUser.id)
      if (error) throw error
      await localDB.org_members.update(editUser.id, updates)
      showToast('✅ تم التحديث'); setEditUser(null); await loadData()
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setSaving(false) }
  }

  async function handleToggleStatus(user) {
    if (!online) return showToast('يتطلب اتصالاً', true)
    const newStatus = !user.is_active
    await supabase.from('org_members').update({ is_active: newStatus }).eq('id', user.id)
    await localDB.org_members.update(user.id, { is_active: newStatus })
    setUsers(u => u.map(x => x.id === user.id ? { ...x, is_active: newStatus } : x))
    showToast(newStatus ? '✅ تم التفعيل' : '🚫 تم الإيقاف')
  }

  async function handleDelete(user) {
    if (!window.confirm(`حذف "${user.full_name}"؟`)) return
    if (!online) return showToast('يتطلب اتصالاً', true)
    try {
      await callAdminAPI('delete_user', { user_id: user.user_id, member_id: user.id })
      await localDB.org_members.delete(user.id)
      setUsers(u => u.filter(x => x.id !== user.id))
      showToast('✅ تم الحذف')
    } catch(err) { showToast('خطأ: ' + err.message, true) }
  }

  async function handleResetPassword(user) {
    if (!newPass || newPass.length < 8) return showToast('8 أحرف على الأقل', true)
    setSaving(true)
    try {
      await callAdminAPI('reset_password', { user_id: user.user_id, new_password: newPass })
      showToast('✅ تم تغيير كلمة المرور'); setReset(null); setNewPass('')
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setSaving(false) }
  }

  function openEdit(user) {
    let allowedPages = {}
    try { allowedPages = JSON.parse(user.allowed_pages || '{}') } catch {}
    setForm({
      full_name: user.full_name||'', national_id: user.national_id||'', phone: user.phone||'',
      role: user.role||'', camp_id: user.camp_id||'',
      can_add: user.can_add??true, can_edit: user.can_edit??true,
      can_delete: user.can_delete??false, can_export: user.can_export??false,
      can_import: user.can_import??false, allowed_pages: allowedPages,
    })
    setErrors({}); setEditUser(user)
  }

  const campMap = Object.fromEntries(camps.map(c => [c.id, c.name]))
  const toggleCollapse = (id) => setCollapsed(c => ({ ...c, [id]: !c[id] }))

  // ===== بناء الشجرة الهرمية =====
  const buildTree = () => {
    const q = search.toLowerCase()
    const filtered = search
      ? users.filter(u => (u.full_name||'').toLowerCase().includes(q) || (u.national_id||'').includes(q))
      : users

    // المديرون (super_admin + platform_owner)
    const admins = filtered.filter(u => ['super_admin','platform_owner'].includes(u.role))
    // المناديب
    const delegates = filtered.filter(u => u.role === 'camp_delegate')
    // المساعدون
    const assistants = filtered.filter(u => u.role === 'assistant')

    return { admins, delegates, assistants }
  }

  const { admins, delegates, assistants } = buildTree()

  // مناديب تحت مدير معين
  const getDelegates = (adminId) =>
    delegates.filter(d => d.supervisor_id === adminId || d.created_by === adminId)

  // مناديب بدون مدير
  const orphanDelegates = delegates.filter(d => {
    const hasSupervisor = admins.some(a => a.id === d.supervisor_id || a.id === d.created_by)
    return !hasSupervisor
  })

  // مساعدون تحت مندوب معين — فقط عبر supervisor_id أو created_by
  const getAssistants = (delegateId) =>
    assistants.filter(a => a.supervisor_id === delegateId || a.created_by === delegateId)

  // مساعدون بدون مندوب (لم يرتبط بأي مندوب)
  const orphanAssistants = assistants.filter(a => {
    const hasDelegate = delegates.some(d => d.id === a.supervisor_id || d.id === a.created_by)
    const hasAdmin    = admins.some(ad => ad.id === a.supervisor_id || ad.id === a.created_by)
    return !hasDelegate && !hasAdmin
  })

  const isMe = (id) => id === profile?.id

  return (
    <div>
      <PageHeader icon="👥" title="إدارة المستخدمين" subtitle={`${users.length} مستخدم`}
        action={(isOwner || isSuperAdmin) && (
          <button onClick={() => { setForm(EMPTY_FORM); setErrors({}); setShowAdd(true) }}
            className="bg-accent text-bg font-black px-4 py-2 rounded-xl text-sm">＋ إضافة</button>
        )}
      />

      {/* إحصائيات */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          ['مدير',   users.filter(u=>u.role==='super_admin').length,   'red'],
          ['مندوب',  users.filter(u=>u.role==='camp_delegate').length, 'accent'],
          ['مساعد',  users.filter(u=>u.role==='assistant').length,     'blue'],
          ['موقوف',  users.filter(u=>!u.is_active).length,            'muted'],
        ].map(([l,v,c]) => (
          <div key={l} className="bg-surface border border-border rounded-xl p-2 text-center">
            <div className={`text-lg font-black text-${c}`}>{v}</div>
            <div className="text-muted text-[9px] mt-0.5">{l}</div>
          </div>
        ))}
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="بحث بالاسم أو الهوية..." />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : users.length === 0 ? (
        <EmptyState icon="👥" title="لا يوجد مستخدمون" />
      ) : (
        <div className="flex flex-col gap-2">
          {/* ======= المديرون وما تحتهم ======= */}
          {admins.map(admin => {
            const cfg = ROLE_CONFIG[admin.role]
            const adminDelegates = getDelegates(admin.id)
            const isOpen = !collapsed[admin.id]
            return (
              <div key={admin.id}>
                {/* بطاقة المدير */}
                <UserCard user={admin} cfg={cfg} campMap={campMap} isMe={isMe(admin.id)}
                  onEdit={openEdit} onToggle={handleToggleStatus} onDelete={handleDelete}
                  onReset={u => { setReset(u); setNewPass(randomPassword()) }}
                  isOwner={isOwner} isSuperAdmin={isSuperAdmin}
                  childCount={adminDelegates.length}
                  isOpen={isOpen} onToggleOpen={() => toggleCollapse(admin.id)}
                />

                {/* المناديب تحت هذا المدير */}
                {isOpen && adminDelegates.map(delegate => {
                  const dcfg = ROLE_CONFIG.camp_delegate
                  const delegateAssistants = getAssistants(delegate.id)
                  const isDOpen = !collapsed[delegate.id]
                  return (
                    <div key={delegate.id} className="mr-4 border-r-2 border-accent/20 pr-2">
                      {/* خط الربط */}
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-accent/40 text-xs">└─</span>
                        <UserCard user={delegate} cfg={dcfg} campMap={campMap} isMe={isMe(delegate.id)}
                          onEdit={openEdit} onToggle={handleToggleStatus} onDelete={handleDelete}
                          onReset={u => { setReset(u); setNewPass(randomPassword()) }}
                          isOwner={isOwner} isSuperAdmin={isSuperAdmin}
                          childCount={delegateAssistants.length}
                          isOpen={isDOpen} onToggleOpen={() => toggleCollapse(delegate.id)}
                          fullWidth
                        />
                      </div>

                      {/* المساعدون تحت هذا المندوب */}
                      {isDOpen && delegateAssistants.map(asst => (
                        <div key={asst.id} className="mr-4 border-r-2 border-blue/20 pr-2">
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-blue/40 text-xs">└─</span>
                            <UserCard user={asst} cfg={ROLE_CONFIG.assistant} campMap={campMap}
                              isMe={isMe(asst.id)} onEdit={openEdit} onToggle={handleToggleStatus}
                              onDelete={handleDelete}
                              onReset={u => { setReset(u); setNewPass(randomPassword()) }}
                              isOwner={isOwner} isSuperAdmin={isSuperAdmin} fullWidth
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* مناديب بدون مدير */}
          {orphanDelegates.length > 0 && (
            <div>
              <div className="text-xs text-muted font-bold px-2 py-2 mt-2">مناديب غير مرتبطين بمدير</div>
              {orphanDelegates.map(delegate => {
                const dcfg = ROLE_CONFIG.camp_delegate
                const delegateAssistants = getAssistants(delegate.id)
                const isDOpen = !collapsed[delegate.id]
                return (
                  <div key={delegate.id}>
                    <UserCard user={delegate} cfg={dcfg} campMap={campMap} isMe={isMe(delegate.id)}
                      onEdit={openEdit} onToggle={handleToggleStatus} onDelete={handleDelete}
                      onReset={u => { setReset(u); setNewPass(randomPassword()) }}
                      isOwner={isOwner} isSuperAdmin={isSuperAdmin}
                      childCount={delegateAssistants.length}
                      isOpen={isDOpen} onToggleOpen={() => toggleCollapse(delegate.id)}
                    />
                    {isDOpen && delegateAssistants.map(asst => (
                      <div key={asst.id} className="mr-4 border-r-2 border-blue/20 pr-2">
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-blue/40 text-xs">└─</span>
                          <UserCard user={asst} cfg={ROLE_CONFIG.assistant} campMap={campMap}
                            isMe={isMe(asst.id)} onEdit={openEdit} onToggle={handleToggleStatus}
                            onDelete={handleDelete}
                            onReset={u => { setReset(u); setNewPass(randomPassword()) }}
                            isOwner={isOwner} isSuperAdmin={isSuperAdmin} fullWidth
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}

          {/* مساعدون بدون مندوب */}
          {orphanAssistants.length > 0 && (
            <div>
              <div className="text-xs text-muted font-bold px-2 py-2 mt-2">مساعدون غير مرتبطين</div>
              {orphanAssistants.map(asst => (
                <UserCard key={asst.id} user={asst} cfg={ROLE_CONFIG.assistant} campMap={campMap}
                  isMe={isMe(asst.id)} onEdit={openEdit} onToggle={handleToggleStatus}
                  onDelete={handleDelete}
                  onReset={u => { setReset(u); setNewPass(randomPassword()) }}
                  isOwner={isOwner} isSuperAdmin={isSuperAdmin}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======= نافذة الإضافة ======= */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="➕ إضافة مستخدم" size="lg">
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <Field label="الاسم الكامل *" value={form.full_name} onChange={v=>setF('full_name',v)} error={errors.full_name} />
          <Field label="رقم الهوية *" value={form.national_id} onChange={v=>setF('national_id',v)} type="tel" inputMode="numeric" error={errors.national_id} />
          <Field label="رقم الجوال" value={form.phone} onChange={v=>setF('phone',v)} type="tel" />
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">الدور *</label>
            <div className="flex flex-col gap-1.5">
              {getAllowedRoles().map(r => (
                <button key={r} type="button" onClick={() => setF('role',r)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold border text-right transition-all
                    ${form.role===r ? 'bg-accent/15 text-accent border-accent':'bg-surface2 border-border text-muted'}`}>
                  <span>{ROLE_CONFIG[r]?.icon}</span>{ROLE_CONFIG[r]?.label}
                </button>
              ))}
            </div>
          </div>
          {form.role !== 'super_admin' && (
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">المخيم *</label>
              <select value={form.camp_id} onChange={e=>setF('camp_id',e.target.value)}
                className={`w-full bg-surface2 border ${errors.camp_id?'border-red':'border-border'} rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent`}>
                <option value="">— اختر المخيم —</option>
                {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.camp_id && <p className="text-red text-xs mt-1">{errors.camp_id}</p>}
            </div>
          )}
          {form.role === 'assistant' && (
            <div className="bg-surface2 border border-border rounded-xl p-3">
              <div className="text-xs font-bold text-muted mb-2">🔐 الصلاحيات</div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[['can_add','إضافة'],['can_edit','تعديل'],['can_delete','حذف'],['can_export','تصدير'],['can_import','استيراد']].map(([k,l])=>(
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form[k]} onChange={e=>setF(k,e.target.checked)} className="w-4 h-4 accent-amber-500" />
                    <span className="text-xs text-white">{l}</span>
                  </label>
                ))}
              </div>
              <div className="text-xs font-bold text-muted mb-1.5">📄 الصفحات</div>
              {PAGES_LIST.map(pg=>(
                <label key={pg.id} className="flex items-center gap-2 cursor-pointer py-1 border-b border-border/30">
                  <input type="checkbox" checked={!!form.allowed_pages[pg.id]?.view}
                    onChange={e=>setPage(pg.id,e.target.checked)} className="w-4 h-4 accent-amber-500" />
                  <span className="text-xs text-white">{pg.label}</span>
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="flex-1 bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
              {saving?'جاري الإنشاء...':'✅ إنشاء المستخدم'}
            </button>
            <button type="button" onClick={()=>setShowAdd(false)}
              className="flex-1 bg-surface2 border border-border text-white font-bold py-3 rounded-xl text-sm">
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      {/* ======= نافذة التعديل ======= */}
      <Modal open={!!editUser} onClose={()=>setEditUser(null)} title={`✏️ ${editUser?.full_name}`} size="lg">
        <form onSubmit={handleEdit} className="flex flex-col gap-4">
          <Field label="الاسم الكامل *" value={form.full_name} onChange={v=>setF('full_name',v)} error={errors.full_name}/>
          <Field label="رقم الجوال" value={form.phone} onChange={v=>setF('phone',v)} type="tel"/>
          {isOwner && editUser?.role !== 'platform_owner' && (
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">الدور</label>
              <select value={form.role} onChange={e=>setF('role',e.target.value)}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                {['super_admin','camp_delegate','assistant'].map(r=>(
                  <option key={r} value={r}>{ROLE_CONFIG[r]?.label}</option>
                ))}
              </select>
            </div>
          )}
          {form.role !== 'super_admin' && (
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">المخيم</label>
              <select value={form.camp_id} onChange={e=>setF('camp_id',e.target.value)}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                <option value="">— بدون مخيم —</option>
                {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {form.role === 'assistant' && (
            <div className="bg-surface2 border border-border rounded-xl p-3">
              <div className="text-xs font-bold text-muted mb-2">🔐 الصلاحيات</div>
              <div className="grid grid-cols-2 gap-2">
                {[['can_add','إضافة'],['can_edit','تعديل'],['can_delete','حذف'],['can_export','تصدير'],['can_import','استيراد']].map(([k,l])=>(
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form[k]} onChange={e=>setF(k,e.target.checked)} className="w-4 h-4 accent-amber-500"/>
                    <span className="text-xs text-white">{l}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="flex-1 bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
              {saving?'جاري الحفظ...':'💾 حفظ التعديلات'}
            </button>
            <button type="button" onClick={()=>setEditUser(null)}
              className="flex-1 bg-surface2 border border-border text-white font-bold py-3 rounded-xl text-sm">
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      {/* ======= نافذة كلمة المرور ======= */}
      <Modal open={!!resetTarget} onClose={()=>setReset(null)} title="🔑 إعادة تعيين كلمة المرور" size="sm">
        {resetTarget && (
          <div className="flex flex-col gap-4">
            <p className="text-muted text-sm">المستخدم: <span className="text-white font-bold">{resetTarget.full_name}</span></p>
            <div className="flex gap-2">
              <input value={newPass} onChange={e=>setNewPass(e.target.value)}
                className="flex-1 bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-accent"/>
              <button type="button" onClick={()=>setNewPass(randomPassword())}
                className="bg-surface2 border border-border text-muted px-3 rounded-xl text-sm">🔀</button>
            </div>
            <button onClick={()=>handleResetPassword(resetTarget)} disabled={saving}
              className="w-full bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
              {saving?'جاري التغيير...':'✅ تغيير كلمة المرور'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ======= مكوّن بطاقة المستخدم =======
function UserCard({ user, cfg, campMap, isMe, onEdit, onToggle, onDelete, onReset, isOwner, isSuperAdmin, childCount, isOpen, onToggleOpen, fullWidth }) {
  return (
    <div className={`bg-surface border border-border rounded-xl overflow-hidden mb-1.5 border-r-4 ${cfg.bg} ${!user.is_active?'opacity-60':''} ${fullWidth?'w-full':''}`}>
      <div className="flex items-center gap-3 p-3">
        {/* أيقونة الدور */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${cfg.badge} border`}>
          {cfg.icon}
        </div>

        {/* البيانات */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-white text-sm truncate">{user.full_name}</span>
            {isMe && <span className="text-[9px] bg-green/20 text-green border border-green/30 px-1.5 rounded-full">أنت</span>}
            {user.must_change_pass && <span className="text-[9px] text-accent">⚠️</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`text-[10px] font-bold ${cfg.color}`}>{cfg.label}</span>
            {user.camp_id && campMap[user.camp_id] && (
              <span className="text-[10px] text-blue">🏕️ {campMap[user.camp_id]}</span>
            )}
            <span className={`text-[10px] ${user.is_active?'text-green':'text-red'}`}>
              {user.is_active?'● نشط':'● موقوف'}
            </span>
          </div>
        </div>

        {/* زر طي/بسط إذا كان لديه أبناء */}
        {childCount > 0 && onToggleOpen && (
          <button onClick={onToggleOpen}
            className="w-6 h-6 bg-surface2 border border-border rounded-lg flex items-center justify-center text-[10px] text-muted flex-shrink-0">
            {isOpen ? '▲' : `▼${childCount}`}
          </button>
        )}
      </div>

      {/* أزرار الإجراءات */}
      {user.role !== 'platform_owner' && (
        <div className="flex gap-1.5 px-3 pb-2.5 flex-wrap">
          <button onClick={()=>onEdit(user)}
            className="bg-blue/10 border border-blue/30 text-blue px-2.5 py-1 rounded-lg text-[11px] font-bold">✏️</button>
          {!isMe && (
            <button onClick={()=>onToggle(user)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${user.is_active?'bg-red/10 border-red/30 text-red':'bg-green/10 border-green/30 text-green'}`}>
              {user.is_active?'🚫':'✅'}
            </button>
          )}
          <button onClick={()=>onReset(user)}
            className="bg-accent/10 border border-accent/30 text-accent px-2.5 py-1 rounded-lg text-[11px] font-bold">🔑</button>
          {!isMe && (isOwner||isSuperAdmin) && (
            <button onClick={()=>onDelete(user)}
              className="bg-red/10 border border-red/30 text-red px-2.5 py-1 rounded-lg text-[11px] font-bold">🗑️</button>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, type='text', error, ...props }) {
  return (
    <div>
      <label className="text-xs font-bold text-muted block mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)}
        className={`w-full bg-surface2 border ${error?'border-red':'border-border'} rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent`}
        {...props}/>
      {error && <p className="text-red text-xs mt-1">{error}</p>}
    </div>
  )
}
