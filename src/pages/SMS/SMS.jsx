
import { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { useLocalDB, visibleFamilies } from '../../lib/db'
import { useDataScope } from '../../lib/useDataScope'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'

export default function SMS() {
  const [families, setFamilies] = useState([])
  const [camps, setCamps] = useState([])
  const [filterCamp, setFilterCamp] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const { showToast } = useApp()
  const { isOwner, isSuperAdmin } = useAuth()
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope()
  const { query } = useLocalDB()

  useEffect(() => {
    Promise.all([query('families'), query('camps')]).then(([fams, c]) => {
      const vis = visibleFamilies(fams, isOwner)
      const campIds = getAllowedCampIds(c)
      setFamilies(filterLocal(vis, campIds))
      setCamps(getVisibleCamps(c))
    })
  }, [])

  const filtered = families.filter(f => {
    if (!filterCamp) return true
    return f.camp_id === filterCamp
  })
  const withPhone = filtered.filter(f => f.phone1)

  async function sendSMS() {
    if (!message.trim()) return showToast('اكتب الرسالة أولاً', true)
    if (!withPhone.length) return showToast('لا توجد أسر برقم جوال', true)
    setSending(true)
    try {
      // محاكاة الإرسال (يحتاج تكامل مع خدمة SMS)
      await new Promise(r => setTimeout(r, 1500))
      showToast(`✅ تم إرسال الرسالة لـ ${withPhone.length} أسرة`)
      setMessage('')
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setSending(false) }
  }

  return (
    <div>
      <PageHeader icon="💬" title="إرسال رسائل SMS" />

      {!(isOwner || isSuperAdmin) ? (
        <EmptyState icon="🔒" title="غير مصرح" subtitle="هذه الخاصية للمديرين فقط" />
      ) : (
        <>
          <Card title="فلترة المستلمين" icon="🎯">
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">المخيم</label>
              <select value={filterCamp} onChange={e => setFilterCamp(e.target.value)}
                className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent">
                <option value="">— كل المخيمات —</option>
                {camps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="mt-3 flex gap-4 text-xs">
              <span className="text-muted">الأسر: <strong className="text-white">{filtered.length}</strong></span>
              <span className="text-muted">برقم جوال: <strong className="text-green">{withPhone.length}</strong></span>
              <span className="text-muted">بدون جوال: <strong className="text-red">{filtered.length - withPhone.length}</strong></span>
            </div>
          </Card>

          <Card title="نص الرسالة" icon="✏️">
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4}
              placeholder="اكتب الرسالة هنا..."
              className="w-full bg-surface2 border border-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent resize-none mb-3" />
            <div className="flex justify-between text-xs text-muted mb-3">
              <span>{message.length} حرف</span>
              <span>{Math.ceil(message.length/160)} رسالة</span>
            </div>
            <button onClick={sendSMS} disabled={sending || !withPhone.length}
              className="w-full bg-accent text-bg font-black py-3 rounded-xl text-sm disabled:opacity-60">
              {sending ? 'جاري الإرسال...' : `📤 إرسال لـ ${withPhone.length} أسرة`}
            </button>
          </Card>
        </>
      )}
    </div>
  )
}
