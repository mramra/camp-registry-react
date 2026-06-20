
import { useState, useEffect } from 'react'
import { supabase, ORG_ID } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'
import Badge from '../../components/ui/Badge'

export default function Devices() {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const { showToast, online } = useApp()
  const { isOwner, isSuperAdmin } = useAuth()

  // تسجيل الجهاز الحالي
  const deviceId = localStorage.getItem('device_id') || (() => {
    const id = crypto.randomUUID()
    localStorage.setItem('device_id', id)
    return id
  })()

  const ua = navigator.userAgent
  const deviceInfo = { id: deviceId, user_agent: ua, last_seen: new Date().toISOString(), org_id: ORG_ID }

  useEffect(() => {
    if (online) { registerDevice(); loadDevices() }
    else setLoading(false)
  }, [online])

  async function registerDevice() {
    try {
      await supabase.from('devices').upsert({ ...deviceInfo, last_seen: new Date().toISOString() }, { onConflict: 'id' })
    } catch (e) { console.warn('[devices] فشل تسجيل الجهاز:', e.message) }
  }

  async function loadDevices() {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('devices').select('*').eq('org_id', ORG_ID).order('last_seen', { ascending: false })
      if (error) throw error
      setDevices(data || [])
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setLoading(false) }
  }

  async function removeDevice(id) {
    if (!isOwner && !isSuperAdmin) { showToast('⛔ لا تملك صلاحية إزالة الأجهزة', true); return }
    if (!window.confirm('إزالة هذا الجهاز؟')) return
    try {
      await supabase.from('devices').delete().eq('id', id)
      setDevices(d => d.filter(x => x.id !== id))
      showToast('✅ تم إزالة الجهاز')
    } catch(err) { showToast('خطأ: ' + err.message, true) }
  }

  const getOS = (ua) => {
    if (ua.includes('Android')) return '🤖 Android'
    if (ua.includes('iPhone') || ua.includes('iPad')) return '🍎 iOS'
    if (ua.includes('Windows')) return '🖥️ Windows'
    if (ua.includes('Mac')) return '💻 Mac'
    return '🌐 Unknown'
  }

  return (
    <div>
      <PageHeader icon="📱" title="إدارة الأجهزة" subtitle={`${devices.length} جهاز`} />
      {!online && <div className="bg-red/10 border border-red/30 text-red text-xs rounded-xl p-3 mb-4 text-center">يتطلب اتصالاً</div>}
      {loading ? <div className="flex justify-center py-16"><Spinner /></div>
      : devices.length === 0 ? <EmptyState icon="📱" title="لا توجد أجهزة مسجلة" />
      : (
        <div className="flex flex-col gap-2">
          {devices.map(d => (
            <div key={d.id} className={`bg-surface border ${d.id === deviceId ? 'border-accent/40' : 'border-border'} rounded-xl p-4`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">{getOS(d.user_agent||'')}</span>
                    {d.id === deviceId && <Badge color="accent">هذا الجهاز</Badge>}
                  </div>
                  <div className="text-muted text-xs">آخر نشاط: {formatDate(d.last_seen)}</div>
                  <div className="text-muted text-[10px] mt-0.5 truncate max-w-48">{(d.user_agent||'').slice(0,60)}</div>
                </div>
                {d.id !== deviceId && (isOwner || isSuperAdmin) && (
                  <button onClick={() => removeDevice(d.id)} className="text-red text-xs bg-red/10 border border-red/20 px-2.5 py-1 rounded-lg">إزالة</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
