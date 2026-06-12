
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, ORG_ID, callAdminAPI } from '../../lib/supabase'
import { enqueue } from '../../lib/sync'
import { localDB } from '../../lib/db'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { randomPassword } from '../../lib/utils'
import PageHeader from '../../components/ui/PageHeader'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import SearchBar from '../../components/ui/SearchBar'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'

const ROLE_CONFIG = {
  platform_owner: { icon:'👑', color:'text-yellow-400', bg:'border-r-yellow-400', badge:'bg-yellow-400/15 text-yellow-400 border-yellow-400/30', label:'مالك المنصة',  indent:0 },
  super_admin:    { icon:'🔴', color:'text-red',        bg:'border-r-red',        badge:'bg-red/15 text-red border-red/30',               label:'مدير الإيواء',  indent:0 },
  camp_delegate:  { icon:'🟠', color:'text-accent',     bg:'border-r-accent',     badge:'bg-accent/15 text-accent border-accent/30',       label:'مندوب مخيم',    indent:1 },
  assistant:      { icon:'🟡', color:'text-blue',       bg:'border-r-blue',       badge:'bg-blue/15 text-blue border-blue/30',             label:'مساعد',         indent:2 },
}

const EMPTY_FORM = {
  full_name:'', national_id:'', phone:'', role:'camp_delegate', camp_id:'',
  supervisor_id:'',
  can_add:true, can_edit:true, can_delete:false, can_export:false, can_import:false, allowed_pages:{},
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
  const [previewUser, setPreviewUser] = useState(null)

  const { profile, isOwner, isSuperAdmin, setPreviewAs } = useAuth()
  const navigate = useNavigate()
  const { showToast, online } = useApp()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    // ① Dexie فوراً
    try {
      const [lCamps, lUsers] = await Promise.all([
        localDB.camps.toArray().catch(()=>[]),
        localDB.org_members.toArray().catch(()=>[]),
      ])
      if (lCamps.length) setCamps(lCamps)
      if (lUsers.length) setUsers(lUsers)
    } catch(e) { console.warn(e) }
    finally { setLoading(false) }

    // ② سيرفر في الخلفية — بصمت
    if (!navigator.onLine) return
    try {
      const [cRes, uRes] = await Promise.all([
        supabase.from('camps').select('*').eq('org_id', ORG_ID),
        supabase.from('org_members').select('*').eq('org_id', ORG_ID)
          .order('created_at', { ascending: false }),
      ])
      if (!cRes.error && cRes.data?.length) {
        try { await localDB.camps.bulkPut(cRes.data) } catch {}
        setCamps(cRes.data)
      }
      if (!uRes.error && uRes.data?.length) {
        try { await localDB.org_members.bulkPut(uRes.data) } catch {}
        setUsers(uRes.data)
      }
    } catch(e) { console.warn('[users sync]', e.message) }
  }

  function setF(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: null }))
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
    if (!navigator.onLine) return showToast('إضافة مستخدم جديد تتطلب اتصالاً بالإنترنت', true)
    setSaving(true)
    try {
      const pass = randomPassword()
      await callAdminAPI('create_user', {
        email: `${form.national_id.trim()}@c.co`, password: pass,
        full_name: form.full_name.trim(), national_id: form.national_id.trim(),
        phone: form.phone.trim(), role: form.role,
        camp_id: form.camp_id || null, org_id: ORG_ID,
        supervisor_id: form.supervisor_id || null,
        can_add: form.can_add, can_edit: form.can_edit,
        can_delete: form.can_delete, can_export: form.can_export, can_import: form.can_import,
        allowed_pages: JSON.stringify(form.allowed_pages), created_by: profile?.id,
      })
      showToast('✅ تم الإنشاء\nكلمة المرور: ' + pass)
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
        ...editUser,
        full_name:    form.full_name.trim(),
        phone:        form.phone?.trim() || null,
        camp_id:      form.camp_id || null,
        supervisor_id: form.supervisor_id || null,
        can_add:      form.can_add,
        can_edit:     form.can_edit,
        can_delete:   form.can_delete,
        can_export:   form.can_export,
        can_import:   form.can_import,
        allowed_pages: JSON.stringify(form.allowed_pages),
      }
      if (isOwner) updates.role = form.role

      // حفظ محلي فوراً
      await localDB.org_members.put(updates)
      setUsers(u => u.map(x => x.id === editUser.id ? updates : x))

      if (navigator.onLine) {
        const { error } = await supabase.from('org_members')
          .update(updates).eq('id', editUser.id)
        if (error) {
          await enqueue('update_member', updates)
          showToast('⚠️ حُفظ محلياً — سيُزامَن لاحقاً')
        } else {
          showToast('✅ تم التحديث')
        }
      } else {
        await enqueue('update_member', updates)
        showToast('💾 حُفظ محلياً — سيُزامَن عند الاتصال')
      }
      setEditUser(null)
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setSaving(false) }
  }

  async function handleToggleStatus(user) {
    const newStatus = !user.is_active
    const updated = { ...user, is_active: newStatus }

    // محلي فوراً
    await localDB.org_members.put(updated)
    setUsers(u => u.map(x => x.id === user.id ? updated : x))

    if (navigator.onLine) {
      const { error } = await supabase.from('org_members')
        .update({ is_active: newStatus }).eq('id', user.id)
      if (error) await enqueue('update_member', updated)
    } else {
      await enqueue('update_member', updated)
    }
    showToast(newStatus ? '✅ تم التفعيل' : '🚫 تم الإيقاف')
  }

  async function handleDelete(user) {
    if (!window.confirm(`حذف "${user.full_name}"؟`)) return
    try {
      // محلي فوراً
      await localDB.org_members.delete(user.id)
      setUsers(u => u.filter(x => x.id !== user.id))

      if (navigator.onLine) {
        try {
          await callAdminAPI('delete_user', { user_id: user.user_id, member_id: user.id })
        } catch {
          await enqueue('delete_member', { id: user.id, user_id: user.user_id })
          showToast('⚠️ سيُحذف من السيرفر عند المزامنة')
          return
        }
      } else {
        await enqueue('delete_member', { id: user.id, user_id: user.user_id })
      }
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
      role: user.role||'', camp_id: user.camp_id||'', supervisor_id: user.supervisor_id||'',
      can_add: user.can_add??true, can_edit: user.can_edit??true,
      can_delete: user.can_delete??false, can_export: user.can_export??false,
      can_import: user.can_import??false, allowed_pages: allowedPages,
    })
    setErrors({}); setEditUser(user)
  }

  const campMap = Object.fromEntries(camps.map(c => [c.id, c.name]))
  const admins = users.filter(u => ['super_admin','platform_owner'].includes(u.role))
  const delegates = users.filter(u => u.role === 'camp_delegate')
  const assistants = users.filter(u => u.role === 'assistant')

  const q = search.toLowerCase()
  const allFiltered = search ? users.filter(u => (u.full_name||'').toLowerCase().includes(q) || (u.national_id||'').includes(q)) : users

  const getDelegates = (adminId) => delegates.filter(d => d.supervisor_id === adminId || d.created_by === adminId)
  const getAssistants = (delegateId) => assistants.filter(a => a.supervisor_id === delegateId || a.created_by === delegateId)
  const orphanDelegates = delegates.filter(d => !admins.some(a => a.id === d.supervisor_id || a.id === d.created_by))
  const orphanAssistants = assistants.filter(a => !delegates.some(d => d.id === a.supervisor_id || d.id === a.created_by) && !admins.some(ad => ad.id === a.supervisor_id || ad.id === a.created_by))

  const isMe = (id) => id === profile?.id

  return (
    <>
      <PageHeader icon="👥" title="إدارة المستخدمين" subtitle={`${users.length} مستخدم`}
        action={(isOwner || isSuperAdmin) && (
          <button onClick={() => { setForm(EMPTY_FORM); setErrors({}); setShowAdd(true) }}
            className="bg-accent text-bg font-black px-4 py-2 rounded-xl text-sm">＋ إضافة</button>
        )}
      />

      {!online && (
        <div className="bg-surface2 border border-border text-muted text-[10px] rounded-xl p-2.5 mb-3 text-center">
          📴 أوف لاين — التعديلات ستُزامَن عند الاتصال
        </div>
      )}


      <div className="grid grid-cols-4 gap-2 mb-4">
        {[['مدير', users.filter(u=>u.role==='super_admin').length,'red'],
          ['مندوب', users.filter(u=>u.role==='camp_delegate').length,'accent'],
          ['مساعد', users.filter(u=>u.role==='assistant').length,'blue'],
          ['موقوف', users.filter(u=>!u.is_active).length,'muted']].map(([l,v,c]) => (
          <div key={l} className="bg-surface border border-border rounded-xl p-2 text-center">
            <div className={`text-lg font-black text-${c}`}>{v}</div>
            <div className="text-muted text-[9px] mt-0.5">{l}</div>
          </div>
        ))}
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="بحث بالاسم أو الهوية..." />

      {loading ? <div className="flex justify-center py-16"><Spinner /></div>
      : users.length === 0 ? <EmptyState icon="👥" title="لا يوجد مستخدمون" />
      : (
        <div className="flex flex-col gap-2">
          {(search ? allFiltered.filter(u=>['super_admin','platform_owner'].includes(u.role)) : admins).map(admin => {
            const cfg = ROLE_CONFIG[admin.role]
            const adminDelegates = search ? [] : getDelegates(admin.id)
            const isOpen = !collapsed[admin.id]
            return (
              <div key={admin.id}>
                <UserCard user={admin} cfg={cfg} campMap={campMap} isMe={isMe(admin.id)}
                  onEdit={openEdit} onToggle={handleToggleStatus} onDelete={handleDelete}
                  onReset={u => { setReset(u); setNewPass(randomPassword()) }}
                  onPreview={setPreviewUser}
                  isOwner={isOwner} isSuperAdmin={isSuperAdmin} online={online}
                  childCount={adminDelegates.length} isOpen={isOpen}
                  onToggleOpen={() => setCollapsed(c => ({ ...c, [admin.id]: !c[admin.id] }))}
                />
                {isOpen && adminDelegates.map(delegate => {
                  const dcfg = ROLE_CONFIG.camp_delegate
                  const delegateAssistants = getAssistants(delegate.id)
                  const isDOpen = !collapsed[delegate.id]
                  return (
                    <div key={delegate.id} className="mr-4 border-r-2 border-accent/20">
                      <div className="flex items-center gap-1 pr-2">
                        <span className="text-accent/40 text-xs mr-1">└─</span>
                        <UserCard user={delegate} cfg={dcfg} campMap={campMap} isMe={isMe(delegate.id)}
                          onEdit={openEdit} onToggle={handleToggleStatus} onDelete={handleDelete}
                          onReset={u => { setReset(u); setNewPass(randomPassword()) }}
                          onPreview={setPreviewUser}
                          isOwner={isOwner} isSuperAdmin={isSuperAdmin} online={online}
                          childCount={delegateAssistants.length} isOpen={isDOpen}
                          onToggleOpen={() => setCollapsed(c => ({ ...c, [delegate.id]: !c[delegate.id] }))}
                          fullWidth
                        />
                      </div>
                      {isDOpen && delegateAssistants.map(asst => (
                        <div key={asst.id} className="mr-8 border-r-2 border-blue/20">
                          <div className="flex items-center gap-1 pr-2">
                            <span className="text-blue/40 text-xs mr-1">└─</span>
                            <UserCard user={asst} cfg={ROLE_CONFIG.assistant} campMap={campMap}
                              isMe={isMe(asst.id)} onEdit={openEdit} onToggle={handleToggleStatus}
                              onDelete={handleDelete}
                              onReset={u => { setReset(u); setNewPass(randomPassword()) }}
                              isOwner={isOwner} isSuperAdmin={isSuperAdmin} online={online} fullWidth
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
          {!search && orphanDelegates.length > 0 && (
            <div>
              <div className="text-xs text-muted font-bold px-2 py-2 mt-2">مناديب غير مرتبطين</div>
              {orphanDelegates.map(d => (
                <UserCard key={d.id} user={d} cfg={ROLE_CONFIG.camp_delegate} campMap={campMap}
                  isMe={isMe(d.id)} onEdit={openEdit} onToggle={handleToggleStatus} onDelete={handleDelete}
                  onReset={u => { setReset(u); setNewPass(randomPassword()) }}
                  isOwner={isOwner} isSuperAdmin={isSuperAdmin} online={online}
                />
              ))}
            </div>
          )}
          {!search && orphanAssistants.length > 0 && (
            <div>
              <div className="text-xs text-muted font-bold px-2 py-2 mt-2">مساعدون غير مرتبطين</div>
              {orphanAssistants.map(a => (
                <UserCard key={a.id} user={a} cfg={ROLE_CONFIG.assistant} campMap={campMap}
                  isMe={isMe(a.id)} onEdit={openEdit} onToggle={handleToggleStatus} onDelete={handleDelete}
                  onReset={u => { setReset(u); setNewPass(randomPassword()) }}
                  isOwner={isOwner} isSuperAdmin={isSuperAdmin} online={online}
                />
              ))}
            </div>
          )}
          {search && allFiltered.filter(u=>!['super_admin','platform_owner'].includes(u.role)).map(u => (
            <UserCard key={u.id} user={u} cfg={ROLE_CONFIG[u.role]||ROLE_CONFIG.assistant} campMap={campMap}
              isMe={isMe(u.id)} onEdit={openEdit} onToggle={handleToggleStatus} onDelete={handleDelete}
              onReset={u2 => { setReset(u2); setNewPass(randomPassword()) }}
              isOwner={isOwner} isSuperAdmin={isSuperAdmin} online={online}
            />
          ))}
        </div>
      )}

      {/* نوافذ الإضافة والتعديل */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="➕ إضافة مستخدم" size="lg">
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <Field label="الاسم الكامل *" value={form.full_name} onChange={v=>setF('full_name',v)} error={errors.full_name}/>
          <Field label="رقم الهوية *" value={form.national_id} onChange={v=>setF('national_id',v)} type="tel" inputMode="numeric" error={errors.national_id}/>
          <Field label="رقم الجوال" value={form.phone} onChange={v=>setF('phone',v)} type="tel"/>
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">الدور *</label>
            <div className="flex flex-col gap-1.5">
              {getAllowedRoles().map(r => (
                <button key={r} type="button" onClick={() => setF('role',r)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold border text-right transition-all
                    ${form.role===r?'bg-accent/15 text-accent border-accent':'bg-surface2 border-border text-muted'}`}>
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
          {/* تابع لمدير إيواء — للمندوب فقط */}
          {form.role === 'camp_delegate' && isOwner && (
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">👤 تابع لمدير إيواء</label>
              <select value={form.supervisor_id} onChange={e=>setF('supervisor_id',e.target.value)}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                <option value="">— اختر المدير —</option>
                {users.filter(u=>u.role==='super_admin').map(u=>(
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </div>
          )}
          {/* تابع لمندوب — للمساعد فقط */}
          {form.role === 'assistant' && (isOwner || isSuperAdmin) && (
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">🟠 تابع لمندوب</label>
              <select value={form.supervisor_id} onChange={e=>setF('supervisor_id',e.target.value)}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                <option value="">— اختر المندوب —</option>
                {users.filter(u=>u.role==='camp_delegate').map(u=>(
                  <option key={u.id} value={u.id}>{u.full_name} {u.camp_id && campMap[u.camp_id] ? `— ${campMap[u.camp_id]}` : ''}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="flex-1 bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
              {saving?'جاري الإنشاء...':'✅ إنشاء المستخدم'}
            </button>
            <button type="button" onClick={()=>setShowAdd(false)} className="flex-1 bg-surface2 border border-border text-white font-bold py-3 rounded-xl text-sm">إلغاء</button>
          </div>
        </form>
      </Modal>

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
          {form.role === 'camp_delegate' && isOwner && (
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">👤 تابع لمدير إيواء</label>
              <select value={form.supervisor_id} onChange={e=>setF('supervisor_id',e.target.value)}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                <option value="">— اختر المدير —</option>
                {users.filter(u=>u.role==='super_admin').map(u=>(
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </div>
          )}
          {form.role === 'assistant' && (isOwner || isSuperAdmin) && (
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">🟠 تابع لمندوب</label>
              <select value={form.supervisor_id} onChange={e=>setF('supervisor_id',e.target.value)}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                <option value="">— اختر المندوب —</option>
                {users.filter(u=>u.role==='camp_delegate').map(u=>(
                  <option key={u.id} value={u.id}>{u.full_name} {u.camp_id && campMap[u.camp_id] ? `— ${campMap[u.camp_id]}` : ''}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="flex-1 bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
              {saving?'جاري الحفظ...':'💾 حفظ التعديلات'}
            </button>
            <button type="button" onClick={()=>setEditUser(null)} className="flex-1 bg-surface2 border border-border text-white font-bold py-3 rounded-xl text-sm">إلغاء</button>
          </div>
        </form>
      </Modal>


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

      {previewUser && (
        <UserPreviewPage
          user={previewUser}
          camps={camps}
          users={users}
          onClose={() => setPreviewUser(null)}
        />
      )}
    </>
  )
}

function UserCard({ user, cfg, campMap, isMe, onEdit, onToggle, onDelete, onReset, onPreview, isOwner, isSuperAdmin, childCount, isOpen, onToggleOpen, fullWidth, online }) {
  return (
    <div className={`bg-surface border border-border rounded-xl overflow-hidden mb-1.5 border-r-4 ${cfg.bg} ${!user.is_active?'opacity-60':''} ${fullWidth?'w-full':''}`}>
      <div className="flex items-center gap-3 p-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${cfg.badge} border`}>{cfg.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-white text-sm truncate">{user.full_name}</span>
            {isMe && <span className="text-[9px] bg-green/20 text-green border border-green/30 px-1.5 rounded-full">أنت</span>}
            {user.must_change_pass && <span className="text-[9px] text-accent">⚠️</span>}
            {!online && <span className="text-[9px] text-muted">📴</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`text-[10px] font-bold ${cfg.color}`}>{cfg.label}</span>
            {user.camp_id && campMap[user.camp_id] && <span className="text-[10px] text-blue">🏕️ {campMap[user.camp_id]}</span>}
            <span className={`text-[10px] ${user.is_active!==false?'text-green':'text-red'}`}>{user.is_active!==false?'● نشط':'● موقوف'}</span>
          </div>
        </div>
        {childCount > 0 && onToggleOpen && (
          <button onClick={onToggleOpen} className="w-6 h-6 bg-surface2 border border-border rounded-lg flex items-center justify-center text-[10px] text-muted flex-shrink-0">
            {isOpen ? '▲' : `▼`}
          </button>
        )}
      </div>
      {user.role !== 'platform_owner' && (
        <div className="flex gap-1.5 px-3 pb-2.5 flex-wrap">
          <button onClick={()=>onEdit(user)} className="bg-blue/10 border border-blue/30 text-blue px-2.5 py-1 rounded-lg text-[11px] font-bold">✏️</button>
          <button onClick={()=>onPreview(user)} className="bg-green/10 border border-green/30 text-green px-2.5 py-1 rounded-lg text-[11px] font-bold">👁️</button>
          {!isMe && <button onClick={()=>onToggle(user)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${user.is_active!==false?'bg-red/10 border-red/30 text-red':'bg-green/10 border-green/30 text-green'}`}>{user.is_active!==false?'🚫':'✅'}</button>}
          <button onClick={()=>onReset(user)} className="bg-accent/10 border border-accent/30 text-accent px-2.5 py-1 rounded-lg text-[11px] font-bold">🔑</button>
          {!isMe && (isOwner||isSuperAdmin) && <button onClick={()=>onDelete(user)} className="bg-red/10 border border-red/30 text-red px-2.5 py-1 rounded-lg text-[11px] font-bold">🗑️</button>}
        </div>
      )}
    </div>
  )
}

// ══ صفحة معاينة المستخدم الكاملة ══════════════════════════
function UserPreviewPage({ user, camps, users, onClose }) {
  const campMap = Object.fromEntries(camps.map(c => [c.id, c.name]))

  const role = user.role
  const isOwnerRole    = role === 'platform_owner'
  const isAdminRole    = role === 'super_admin'
  const isDelegateRole = role === 'camp_delegate'
  const isAssistantRole= role === 'assistant'

  // الصفحات المتاحة حسب الدور
  const ALL_PAGES = [
    { icon:'📊', label:'لوحة التحكم',   path:'/',              roles:['all'] },
    { icon:'👨‍👩‍👧‍👦', label:'قائمة الأسر',  path:'/families',     roles:['all'], perm:'view' },
    { icon:'➕', label:'إضافة أسرة',    path:'/families/add', roles:['all'], perm:'add' },
    { icon:'🔄', label:'حركات الأسر',   path:'/movements',    roles:['all'] },
    { icon:'🏕️', label:'المخيمات',      path:'/camps',        roles:['all'] },
    { icon:'📦', label:'التوزيعات',     path:'/distributions',roles:['all'] },
    { icon:'📈', label:'التقارير',      path:'/analysis',     roles:['all'] },
    { icon:'🔔', label:'التنبيهات',     path:'/alerts',       roles:['all'] },
    { icon:'💬', label:'رسائل SMS',     path:'/sms',          roles:['all'] },
    { icon:'⚙️', label:'الإعدادات',     path:'/settings',     roles:['all'] },
    { icon:'❓', label:'المساعدة',      path:'/help',         roles:['all'] },
    { icon:'👥', label:'المستخدمون',    path:'/users',        roles:['platform_owner','super_admin'] },
    { icon:'📋', label:'سجل النشاط',   path:'/audit',        roles:['platform_owner','super_admin'] },
    { icon:'📱', label:'الأجهزة',       path:'/devices',      roles:['platform_owner','super_admin'] },
    { icon:'💾', label:'استيراد/تصدير',path:'/data',         roles:['platform_owner','super_admin'] },
    { icon:'💎', label:'الاشتراك',      path:'/subscription', roles:['platform_owner'] },
  ]

  // صلاحيات الأفعال
  const PERMS = [
    { key:'can_add',    label:'➕ إضافة',   value: user.can_add    },
    { key:'can_edit',   label:'✏️ تعديل',   value: user.can_edit   },
    { key:'can_delete', label:'🗑️ حذف',     value: user.can_delete },
    { key:'can_export', label:'📤 تصدير',   value: user.can_export },
    { key:'can_import', label:'📥 استيراد', value: user.can_import },
  ]

  // المشرف
  const supervisor = users.find(u => u.id === user.supervisor_id)

  // المخيمات التي يراها
  const myCamps = isDelegateRole || isAssistantRole
    ? camps.filter(c => c.id === user.camp_id || c.parent_camp_id === user.camp_id)
    : camps

  function canSeePage(page) {
    if (page.roles.includes('all')) return true
    return page.roles.includes(role)
  }

  const ROLE_LABELS = {
    platform_owner: { label:'مالك المنصة',  icon:'👑', color:'#f59e0b' },
    super_admin:    { label:'مدير الإيواء', icon:'🔴', color:'#ef4444' },
    camp_delegate:  { label:'مندوب مخيم',   icon:'🟠', color:'#f59e0b' },
    assistant:      { label:'مساعد',        icon:'🟡', color:'#3b82f6' },
  }
  const rc = ROLE_LABELS[role] || { label: role, icon:'👤', color:'#6b7280' }

  return (
    <div style={{position:'fixed',inset:0,background:'#0a0a14',zIndex:2000,overflow:'auto',direction:'rtl'}}>
      {/* شريط المعاينة */}
      <div style={{background:'linear-gradient(135deg,#7c3aed,#4f46e5)',padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:10}}>
        <div style={{color:'white',fontSize:'12px',fontWeight:'bold'}}>
          👁️ معاينة: {user.full_name}
        </div>
        <button onClick={onClose}
          style={{background:'white',color:'#7c3aed',border:'none',borderRadius:'8px',padding:'5px 14px',fontSize:'12px',fontWeight:'900',cursor:'pointer'}}>
          ← رجوع
        </button>
      </div>

      <div style={{padding:'16px',maxWidth:'430px',margin:'0 auto'}}>

        {/* بطاقة الهوية */}
        <div className="bg-surface border border-border rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
              style={{background:`${rc.color}22`,border:`2px solid ${rc.color}44`}}>
              {rc.icon}
            </div>
            <div>
              <div className="text-white font-black text-base">{user.full_name}</div>
              <div className="text-xs font-bold mt-0.5" style={{color:rc.color}}>{rc.label}</div>
              {user.camp_id && campMap[user.camp_id] && (
                <div className="text-muted text-xs mt-0.5">🏕️ {campMap[user.camp_id]}</div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ['🪪 الهوية',   user.national_id],
              ['📞 الجوال',   user.phone],
              ['🟢 الحالة',   user.is_active !== false ? 'نشط' : 'موقوف'],
              ['🔑 كلمة المرور', user.must_change_pass ? '⚠️ يجب تغييرها' : '✅ طبيعية'],
            ].filter(([,v])=>v).map(([k,v])=>(
              <div key={k} className="bg-surface2 rounded-xl p-2">
                <div className="text-muted text-[9px]">{k}</div>
                <div className="text-white font-bold text-xs mt-0.5">{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* التسلسل الوظيفي */}
        <div className="bg-surface border border-border rounded-2xl p-4 mb-4">
          <div className="text-accent text-xs font-bold mb-3">👥 التسلسل الوظيفي</div>
          <div className="flex flex-col gap-2">
            {supervisor && (
              <div className="flex items-center gap-2 bg-surface2 rounded-xl px-3 py-2">
                <span className="text-lg">{ROLE_LABELS[supervisor.role]?.icon||'👤'}</span>
                <div>
                  <div className="text-white text-xs font-bold">{supervisor.full_name}</div>
                  <div className="text-muted text-[10px]">{ROLE_LABELS[supervisor.role]?.label} — مشرفي</div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 border-2"
              style={{background:`${rc.color}11`,borderColor:`${rc.color}44`}}>
              <span className="text-lg">{rc.icon}</span>
              <div>
                <div className="text-white text-xs font-bold">{user.full_name}</div>
                <div className="text-xs" style={{color:rc.color}}>{rc.label} ← أنت</div>
              </div>
            </div>
            {/* المرؤوسون */}
            {users.filter(u=>u.supervisor_id===user.id).slice(0,3).map(sub=>(
              <div key={sub.id} className="flex items-center gap-2 bg-surface2 rounded-xl px-3 py-2 mr-4">
                <span className="text-base">{ROLE_LABELS[sub.role]?.icon||'👤'}</span>
                <div>
                  <div className="text-white text-xs">{sub.full_name}</div>
                  <div className="text-muted text-[10px]">{ROLE_LABELS[sub.role]?.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* المخيمات التي يراها */}
        {(isDelegateRole||isAssistantRole) && (
          <div className="bg-surface border border-border rounded-2xl p-4 mb-4">
            <div className="text-accent text-xs font-bold mb-2">🏕️ المخيمات التي يراها</div>
            {myCamps.length === 0
              ? <div className="text-muted text-xs">لا يوجد مخيم محدد</div>
              : myCamps.map(c=>(
                <div key={c.id} className="flex items-center gap-2 bg-surface2 rounded-xl px-3 py-2 mb-1.5">
                  <span>{c.parent_camp_id ? '🏕️' : '⛺'}</span>
                  <div>
                    <div className="text-white text-xs font-bold">{c.name}</div>
                    {c.address && <div className="text-muted text-[10px]">📍 {c.address}</div>}
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* صلاحيات الأفعال */}
        <div className="bg-surface border border-border rounded-2xl p-4 mb-4">
          <div className="text-accent text-xs font-bold mb-3">🔐 صلاحيات الأفعال</div>
          <div className="flex flex-wrap gap-2">
            {PERMS.map(p=>(
              <div key={p.key} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
                style={{
                  background: p.value ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)',
                  color:      p.value ? '#10b981' : '#ef4444',
                  border:     `1px solid ${p.value ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.2)'}`,
                }}>
                {p.label} {p.value ? '✓' : '✗'}
              </div>
            ))}
          </div>
        </div>

        {/* الصفحات المسموحة/الممنوعة */}
        <div className="bg-surface border border-border rounded-2xl p-4 mb-4">
          <div className="text-accent text-xs font-bold mb-3">📱 الصفحات</div>
          <div className="flex flex-col gap-1.5">
            {ALL_PAGES.map(page => {
              const allowed = canSeePage(page)
              return (
                <div key={page.path} className="flex items-center justify-between px-3 py-2 rounded-xl"
                  style={{
                    background: allowed ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.05)',
                    borderRight: `3px solid ${allowed ? '#10b981' : '#ef4444'}`,
                  }}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{page.icon}</span>
                    <span className="text-xs font-bold" style={{color: allowed ? 'white' : '#6b7280'}}>
                      {page.label}
                    </span>
                  </div>
                  <span className="text-xs font-black" style={{color: allowed ? '#10b981' : '#ef4444'}}>
                    {allowed ? '✓ مسموح' : '✗ ممنوع'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}

function Field({ label, value, onChange, type='text', error, ...props }) {
  return (
    <>
      <label className="text-xs font-bold text-muted block mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)}
        className={`w-full bg-surface2 border ${error?'border-red':'border-border'} rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent`}
        {...props}/>
      {error && <p className="text-red text-xs mt-1">{error}</p>}
    </div>
  )
}
