
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'

export default function Settings() {
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [clearingDB, setClearingDB] = useState(false)
  const { profile, signOut } = useAuth()
  const { showToast, online } = useApp()

  async function changePassword(e) {
    e.preventDefault()
    if (newPass.length < 8) return showToast('8 أحرف على الأقل', true)
    if (newPass !== confirmPass) return showToast('كلمتا المرور غير متطابقتين', true)
    if (!online) return showToast('يتطلب اتصالاً', true)
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass })
      if (error) throw error
      showToast('✅ تم تغيير كلمة المرور')
      setNewPass(''); setConfirm('')
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setSaving(false) }
  }

  async function clearLocalDB() {
    if (!window.confirm('حذف كل البيانات المحلية؟ ستحتاج إلى اتصال إنترنت لاسترجاعها.')) return
    setClearingDB(true)
    try {
      const { getPowerSync } = await import('../../lib/powersync')
      const db = getPowerSync()
      if (db) {
        const TABLES = ['families','camps','family_members','dist_rounds','family_movements','org_members','camp_distributions','camp_dist_families']
        for (const tbl of TABLES) {
          await db.execute(`DELETE FROM ${tbl}`).catch(() => {})
        }
      }
      showToast('✅ تم حذف البيانات المحلية')
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setClearingDB(false) }
  }

  return (
    <div>
      <PageHeader icon="⚙️" title="الإعدادات" />

      <Card title="الملف الشخصي" icon="👤">
        <div className="flex flex-col gap-3">
          {[['الاسم', profile?.full_name], ['رقم الهوية', profile?.national_id], ['الجوال', profile?.phone], ['الدور', profile?.role]].map(([k,v]) => (
            <div key={k} className="flex justify-between items-center border-b border-border pb-2 last:border-0 last:pb-0">
              <span className="text-muted text-xs">{k}</span>
              <span className="text-white text-sm font-bold">{v || '—'}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="تغيير كلمة المرور" icon="🔐">
        <form onSubmit={changePassword} className="flex flex-col gap-3">
          <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="كلمة المرور الجديدة"
            className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent" />
          <input type="password" value={confirmPass} onChange={e => setConfirm(e.target.value)} placeholder="تأكيد كلمة المرور"
            className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent" />
          <button type="submit" disabled={saving}
            className="w-full bg-accent text-bg font-black py-2.5 rounded-xl text-sm disabled:opacity-60">
            {saving ? 'جاري الحفظ...' : '💾 تغيير كلمة المرور'}
          </button>
        </form>
      </Card>

      <Card title="البيانات المحلية" icon="💾">
        <p className="text-muted text-xs mb-4">حذف البيانات المخزنة على هذا الجهاز. لن يؤثر على بيانات السيرفر.</p>
        <button onClick={clearLocalDB} disabled={clearingDB}
          className="w-full bg-red/15 border border-red/30 text-red font-bold py-2.5 rounded-xl text-sm disabled:opacity-60">
          {clearingDB ? 'جاري الحذف...' : '🗑️ حذف البيانات المحلية'}
        </button>
      </Card>

      <Card title="الجلسة" icon="🚪">
        <button onClick={signOut} className="w-full bg-red/15 border border-red/30 text-red font-bold py-2.5 rounded-xl text-sm">
          تسجيل الخروج
        </button>
      </Card>
    </div>
  )
}
