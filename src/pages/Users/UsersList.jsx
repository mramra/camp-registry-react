import { useState, useEffect } from 'react'
import { supabase, ORG_ID, callAdminAPI } from '../../lib/supabase'
import { localDB } from '../../lib/db'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { formatDate, randomPassword, roleLabel } from '../../lib/utils'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import SearchBar from '../../components/ui/SearchBar'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'

const ROLE_STYLES = {
  platform_owner: { color: 'red',    bg: 'bg-red/10 border-red/30',       label: '👑 مالك المنصة' },
  super_admin:    { color: 'red',    bg: 'bg-red/10 border-red/30',       label: '🔴 مدير الإيواء' },
  camp_delegate:  { color: 'accent', bg: 'bg-accent/10 border-accent/30', label: '🟠 مندوب مخيم' },
  assistant:      { color: 'blue',   bg: 'bg-blue/10 border-blue/30',     label: '🟡 مساعد' },
}

const PAGES_LIST = [
  { id: 'families',      label: '👪 الأسر',              ops: ['add','edit','delete'] },
  { id: 'distributions', label: '📦 التوزيع',             ops: ['add'] },
  { id: 'data',          label: '📁 استيراد/تصدير',       ops: [] },
  { id: 'movements',     label: '🚶 حركات الأسر',         ops: [] },
  { id: 'analysis',      label: '📈 التقارير',             ops: [] },
  { id: 'alerts',        label: '🔔 التنبيهات',            ops: [] },
  { id: 'audit',         label: '📋 سجل النشاط',          ops: [] },
]

const EMPTY_FORM = {
  full_name: '', national_id: '', phone: '',
  role: 'camp_delegate', camp_id: '',
  can_add: true, can_edit: true, can_delete: false, can_export: false, can_import: false,
  allowed_pages: {},
}

export default function UsersList() {
  const [users, setUsers]         = useState([])
  const [camps, setCamps]         = useState([])
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [showAdd, setShowAdd]     = useState(false)
  const [editUser, setEditUser]   = useState(null)
  const [resetTarget, setReset]   = useState(null)
  const [newPass, setNewPass]     = useState('')
  const [form, setForm]           = useState(EMPTY_FORM)
  const [errors, setErrors]       = useState({})

  const { profile, isOwner, isSuperAdmin, role: myRole } = useAuth()
  const { showToast, online } = useApp()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [campsData] = await Promise.all([localDB.camps.toArray()])
      setCamps(campsData)
      if (online) {
        const { data, error } = await supabase
          .from('org_members').select('*').eq('org_id', ORG_ID).order('created_at', { ascending: false })
        if (!error && data) {
          await localDB.org_members.bulkPut(data)
          setUsers(data)
        }
      } else {
        const local = await localDB.org_members.toArray()
        setUsers(local)
      }
    } catch { showToast('خطأ في التحميل', true) }
    finally { setLoading(false) }
  }

  function setF(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: null }))
  }

  function setPage(pageId, checked) {
    setForm(f => ({
      ...f,
      allowed_pages: {
        ...f.allowed_pages,
        [pageId]: checked ? { view: true } : undefined
      }
    }))
  }

  function setPageOp(pageId, op, checked) {
    setForm(f => ({
      ...f,
      allowed_pages: {
        ...f.allowed_pages,
        [pageId]: { ...(f.allowed_pages[pageId] || { view: true }), [op]: checked }
      }
    }))
  }

  // الأدوار المسموح بإنشائها حسب دوري
  function getAllowedRoles() {
    if (isOwner)        return ['super_admin','camp_delegate','assistant']
    if (isSuperAdmin)   return ['camp_delegate','assistant']
    return ['assistant']
  }

  function validate() {
    const errs = {}
    if (!form.full_name.trim()) errs.full_name = 'الاسم مطلوب'
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
    if (!online) return showToast('يتطلب اتصالاً بالإنترنت', true)
    setSaving(true)
    try {
      const pass = randomPassword()
      const email = `${form.national_id.trim()}@c.co`
      // إنشاء المستخدم عبر Admin API
      const result = await callAdminAPI('create_user', {
        email, password: pass,
        full_name: form.full_name.trim(),
        national_id: form.national_id.trim(),
        phone: form.phone.trim(),
        role: form.role,
        camp_id: form.camp_id || null,
        org_id: ORG_ID,
        can_add: form.can_add,
        can_edit: form.can_edit,
        can_delete: form.can_delete,
        can_export: form.can_export,
        can_import: form.can_import,
        allowed_pages: JSON.stringify(form.allowed_pages),
        created_by: profile?.id,
      })
      showToast(`✅ تم إنشاء المستخدم\nكلمة المرور: ${pass}`)
      setShowAdd(false)
      setForm(EMPTY_FORM)
      await loadData()
    } catch (err) {
      showToast('خطأ: ' + (err.message || 'تعذر الإنشاء'), true)
    } finally { setSaving(false) }
  }

  async function handleEdit(e) {
    e.preventDefault()
    if (!editUser) return
    setSaving(true)
    try {
      const updates = {
        full_name: form.full_name.trim(),
        phone: form.phone?.trim() || null,
        camp_id: form.camp_id || null,
        can_add: form.can_add,
        can_edit: form.can_edit,
        can_delete: form.can_delete,
        can_export: form.can_export,
        can_import: form.can_import,
        allowed_pages: JSON.stringify(form.allowed_pages),
      }
      if (isOwner) updates.role = form.role
      const { error } = await supabase.from('org_members').update(updates).eq('id', editUser.id)
      if (error) throw error
      await localDB.org_members.update(editUser.id, updates)
      showToast('✅ تم تحديث المستخدم')
      setEditUser(null)
      await loadData()
    } catch (err) {
      showToast('خطأ: ' + err.message, true)
    } finally { setSaving(false) }
  }

  async function handleToggleStatus(user) {
    if (!online) return showToast('يتطلب اتصالاً', true)
    try {
      const newStatus = !user.is_active
      await supabase.from('org_members').update({ is_active: newStatus }).eq('id', user.id)
      await localDB.org_members.update(user.id, { is_active: newStatus })
      setUsers(u => u.map(x => x.id === user.id ? { ...x, is_active: newStatus } : x))
      showToast(newStatus ? '✅ تم تفعيل المستخدم' : '🚫 تم إيقاف المستخدم')
    } catch { showToast('فشل التحديث', true) }
  }

  async function handleDelete(user) {
    if (!window.confirm(`حذف "${user.full_name}"؟`)) return
    if (!online) return showToast('يتطلب اتصالاً', true)
    try {
      await callAdminAPI('delete_user', { user_id: user.user_id, member_id: user.id })
      await localDB.org_members.delete(user.id)
      setUsers(u => u.filter(x => x.id !== user.id))
      showToast('✅ تم الحذف')
    } catch (err) { showToast('خطأ: ' + err.message, true) }
  }

  async function handleResetPassword(user) {
    if (!newPass || newPass.length < 8) return showToast('كلمة المرور 8 أحرف على الأقل', true)
    if (!online) return showToast('يتطلب اتصالاً', true)
    setSaving(true)
    try {
      await callAdminAPI('reset_password', { user_id: user.user_id, new_password: newPass })
      showToast('✅ تم تغيير كلمة المرور')
      setReset(null)
      setNewPass('')
    } catch (err) { showToast('خطأ: ' + err.message, true) }
    finally { setSaving(false) }
  }

  function openEdit(user) {
    let allowedPages = {}
    try { allowedPages = JSON.parse(user.allowed_pages || '{}') } catch {}
    setForm({
      full_name: user.full_name || '',
      national_id: user.national_id || '',
      phone: user.phone || '',
      role: user.role || '',
      camp_id: user.camp_id || '',
      can_add: user.can_add ?? true,
      can_edit: user.can_edit ?? true,
      can_delete: user.can_delete ?? false,
      can_export: user.can_export ?? false,
      can_import: user.can_import ?? false,
      allowed_pages: allowedPages,
    })
    setErrors({})
    setEditUser(user)
  }

  const campMap = Object.fromEntries(camps.map(c => [c.id, c.name]))

  // ترتيب: PO → super_admin → camp_delegate → assistant
  const ORDER = ['platform_owner','super_admin','camp_delegate','assistant']
  const filtered = users
    .filter(u => {
      if (!search) return true
      const q = search.toLowerCase()
      return (u.full_name||'').toLowerCase().includes(q) || (u.national_id||'').includes(q)
    })
    .sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role))

  const allowedRoles = getAllowedRoles()

  return (
    <div>
      <PageHeader
        icon="👥" title="إدارة المستخدمين"
        subtitle={`${users.length} مستخدم`}
        action={(isOwner || isSuperAdmin) && (
          <button onClick={() => { setForm(EMPTY_FORM); setErrors({}); setShowAdd(true) }}
            className="bg-accent text-bg font-black px-4 py-2 rounded-xl text-sm">
            ＋ إضافة
          </button>
        )}
      />

      {/* إحصائيات */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          ['مدير',    users.filter(u=>u.role==='super_admin').length,   'red'],
          ['مندوب',   users.filter(u=>u.role==='camp_delegate').length, 'accent'],
          ['مساعد',   users.filter(u=>u.role==='assistant').length,     'blue'],
          ['موقوف',   users.filter(u=>!u.is_active).length,            'muted'],
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
      ) : filtered.length === 0 ? (
        <EmptyState icon="👥" title="لا يوجد مستخدمون" />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(user => {
            const rs = ROLE_STYLES[user.role] || ROLE_STYLES.assistant
            const isMe = user.id === profile?.id
            return (
              <div key={user.id}
                className={`bg-surface border rounded-2xl overflow-hidden ${user.is_active ? 'border-border' : 'border-red/30 opacity-70'}`}>
                {/* رأس البطاقة */}
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg border ${rs.bg} flex-shrink-0`}>
                      {user.role === 'platform_owner' ? '👑' : user.role === 'super_admin' ? '🔴' : user.role === 'camp_delegate' ? '🟠' : '🟡'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm truncate">{user.full_name}</span>
                        {isMe && <span className="text-[9px] bg-green/20 text-green border border-green/30 px-1.5 py-0.5 rounded-full">أنت</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-bold text-${rs.color}`}>{rs.label}</span>
                        <span className={`text-[9px] ${user.is_active ? 'text-green' : 'text-red'}`}>
                          {user.is_active ? '● نشط' : '● موقوف'}
                        </span>
                      </div>
                      {user.camp_id && campMap[user.camp_id] && (
                        <div className="text-muted text-[10px] mt-0.5">🏕️ {campMap[user.camp_id]}</div>
                      )}
                    </div>
                  </div>
                  {user.must_change_pass && (
                    <span className="text-[9px] text-accent border border-accent/30 px-1.5 py-0.5 rounded-full mr-2">⚠️ لم يغير كلمة المرور</span>
                  )}
                </div>

                {/* الأزرار — مخفية لـ PO */}
                {user.role !== 'platform_owner' && (
                  <div className="flex gap-1.5 px-4 pb-3 flex-wrap">
                    <button onClick={() => openEdit(user)}
                      className="bg-blue/10 border border-blue/30 text-blue px-3 py-1.5 rounded-lg text-[11px] font-bold">
                      ✏️ تعديل
                    </button>
                    {!isMe && (
                      <button onClick={() => handleToggleStatus(user)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${user.is_active ? 'bg-red/10 border-red/30 text-red' : 'bg-green/10 border-green/30 text-green'}`}>
                        {user.is_active ? '🚫 إيقاف' : '✅ تفعيل'}
                      </button>
                    )}
                    <button onClick={() => { setReset(user); setNewPass(randomPassword()) }}
                      className="bg-accent/10 border border-accent/30 text-accent px-3 py-1.5 rounded-lg text-[11px] font-bold">
                      🔑 كلمة المرور
                    </button>
                    {!isMe && (isOwner || isSuperAdmin) && (
                      <button onClick={() => handleDelete(user)}
                        className="bg-red/10 border border-red/30 text-red px-3 py-1.5 rounded-lg text-[11px] font-bold">
                        🗑️ حذف
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ======= نافذة الإضافة ======= */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="➕ إضافة مستخدم جديد" size="lg">
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <Field label="الاسم الكامل *" value={form.full_name} onChange={v => setF('full_name',v)} error={errors.full_name} />
          <Field label="رقم الهوية *" value={form.national_id} onChange={v => setF('national_id',v)} type="tel" inputMode="numeric" error={errors.national_id} />
          <Field label="رقم الجوال" value={form.phone} onChange={v => setF('phone',v)} type="tel" />

          {/* الدور */}
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">الدور *</label>
            <div className="flex flex-col gap-1.5">
              {allowedRoles.map(r => (
                <button key={r} type="button" onClick={() => setF('role', r)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold border transition-all text-right
                    ${form.role === r ? 'bg-accent/15 text-accent border-accent' : 'bg-surface2 border-border text-muted'}`}>
                  <span>{r === 'super_admin' ? '🔴' : r === 'camp_delegate' ? '🟠' : '🟡'}</span>
                  {ROLE_STYLES[r]?.label?.replace(/🔴|🟠|🟡/,'').trim()}
                </button>
              ))}
            </div>
          </div>

          {/* المخيم */}
          {form.role !== 'super_admin' && (
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">المخيم *</label>
              <select value={form.camp_id} onChange={e => setF('camp_id', e.target.value)}
                className={`w-full bg-surface2 border ${errors.camp_id ? 'border-red' : 'border-border'} rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent`}>
                <option value="">— اختر المخيم —</option>
                {camps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.camp_id && <p className="text-red text-xs mt-1">{errors.camp_id}</p>}
            </div>
          )}

          {/* صلاحيات المساعد */}
          {form.role === 'assistant' && (
            <div className="bg-surface2 border border-border rounded-xl p-4">
              <div className="text-xs font-bold text-muted mb-3">🔐 الصلاحيات</div>
              <div className="grid grid-cols-2 gap-2">
                {[['can_add','إضافة'],['can_edit','تعديل'],['can_delete','حذف'],['can_export','تصدير'],['can_import','استيراد']].map(([k,l]) => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form[k]} onChange={e => setF(k, e.target.checked)}
                      className="w-4 h-4 accent-amber-500" />
                    <span className="text-xs text-white">{l}</span>
                  </label>
                ))}
              </div>
              <div className="text-xs font-bold text-muted mt-3 mb-2">📄 الصفحات المسموحة</div>
              <div className="flex flex-col gap-1.5">
                {PAGES_LIST.map(pg => (
                  <label key={pg.id} className="flex items-center gap-2 cursor-pointer py-1 border-b border-border/50">
                    <input type="checkbox" checked={!!form.allowed_pages[pg.id]?.view}
                      onChange={e => setPage(pg.id, e.target.checked)} className="w-4 h-4 accent-amber-500" />
                    <span className="text-xs text-white flex-1">{pg.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
              {saving ? 'جاري الإنشاء...' : '✅ إنشاء المستخدم'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)}
              className="flex-1 bg-surface2 border border-border text-white font-bold py-3 rounded-xl text-sm">
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      {/* ======= نافذة التعديل ======= */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`✏️ تعديل: ${editUser?.full_name}`} size="lg">
        <form onSubmit={handleEdit} className="flex flex-col gap-4">
          <Field label="الاسم الكامل *" value={form.full_name} onChange={v => setF('full_name',v)} error={errors.full_name} />
          <Field label="رقم الجوال" value={form.phone} onChange={v => setF('phone',v)} type="tel" />
          {isOwner && editUser?.role !== 'platform_owner' && (
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">الدور</label>
              <select value={form.role} onChange={e => setF('role', e.target.value)}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                {['super_admin','camp_delegate','assistant'].map(r => (
                  <option key={r} value={r}>{ROLE_STYLES[r]?.label}</option>
                ))}
              </select>
            </div>
          )}
          {form.role !== 'super_admin' && (
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">المخيم</label>
              <select value={form.camp_id} onChange={e => setF('camp_id', e.target.value)}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                <option value="">— بدون مخيم —</option>
                {camps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {form.role === 'assistant' && (
            <div className="bg-surface2 border border-border rounded-xl p-4">
              <div className="text-xs font-bold text-muted mb-3">🔐 الصلاحيات</div>
              <div className="grid grid-cols-2 gap-2">
                {[['can_add','إضافة'],['can_edit','تعديل'],['can_delete','حذف'],['can_export','تصدير'],['can_import','استيراد']].map(([k,l]) => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form[k]} onChange={e => setF(k, e.target.checked)} className="w-4 h-4 accent-amber-500" />
                    <span className="text-xs text-white">{l}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
              {saving ? 'جاري الحفظ...' : '💾 حفظ التعديلات'}
            </button>
            <button type="button" onClick={() => setEditUser(null)}
              className="flex-1 bg-surface2 border border-border text-white font-bold py-3 rounded-xl text-sm">
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      {/* ======= نافذة إعادة تعيين كلمة المرور ======= */}
      <Modal open={!!resetTarget} onClose={() => setReset(null)} title="🔑 إعادة تعيين كلمة المرور" size="sm">
        {resetTarget && (
          <div className="flex flex-col gap-4">
            <p className="text-muted text-sm">المستخدم: <span className="text-white font-bold">{resetTarget.full_name}</span></p>
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">كلمة المرور الجديدة</label>
              <div className="flex gap-2">
                <input value={newPass} onChange={e => setNewPass(e.target.value)}
                  className="flex-1 bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-accent" />
                <button type="button" onClick={() => setNewPass(randomPassword())}
                  className="bg-surface2 border border-border text-muted px-3 rounded-xl text-sm">🔀</button>
              </div>
            </div>
            <button onClick={() => handleResetPassword(resetTarget)} disabled={saving}
              className="w-full bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
              {saving ? 'جاري التغيير...' : '✅ تغيير كلمة المرور'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Field({ label, value, onChange, type='text', error, ...props }) {
  return (
    <div>
      <label className="text-xs font-bold text-muted block mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className={`w-full bg-surface2 border ${error ? 'border-red' : 'border-border'} rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent`}
        {...props} />
      {error && <p className="text-red text-xs mt-1">{error}</p>}
    </div>
  )
}
