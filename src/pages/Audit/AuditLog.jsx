import { useState, useEffect } from 'react'
import { supabase, ORG_ID } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import { useApp } from '../../context/AppContext'
import PageHeader from '../../components/ui/PageHeader'
import SearchBar from '../../components/ui/SearchBar'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'

export default function AuditLog() {
  const [logs,    setLogs]    = useState([])
  const [search,  setSearch]  = useState('')
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const { showToast } = useApp()

  useEffect(() => {
    if (!navigator.onLine) { setOffline(true); setLoading(false); return }
    loadLogs()
    window.addEventListener('online', loadLogs)
    return () => window.removeEventListener('online', loadLogs)
  }, [])

  async function loadLogs() {
    setOffline(false); setLoading(true)
    try {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*, org_members(full_name)')
        .eq('org_id', ORG_ID)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      setLogs(data || [])
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setLoading(false) }
  }

  const filtered = logs.filter(l => !search ||
    (l.action||'').toLowerCase().includes(search.toLowerCase()) ||
    (l.org_members?.full_name||'').toLowerCase().includes(search.toLowerCase()))

  const ACTION_COLOR = { add:'green', edit:'blue', delete:'red', login:'accent', logout:'muted' }

  if (offline) return (
    <div>
      <PageHeader icon="📋" title="سجل النشاط" />
      <EmptyState icon="📡" title="يتطلب اتصالاً بالإنترنت"
        subtitle="سجل النشاط متاح عند الاتصال فقط" />
    </div>
  )

  return (
    <div>
      <PageHeader icon="📋" title="سجل النشاط" subtitle={`${logs.length} سجل`} />
      <SearchBar value={search} onChange={setSearch} placeholder="بحث في السجلات..." />
      {loading ? <div className="flex justify-center py-16"><Spinner /></div>
      : filtered.length === 0 ? <EmptyState icon="📋" title="لا توجد سجلات" />
      : (
        <div className="flex flex-col gap-2">
          {filtered.map(log => {
            const actionWord = (log.action||'').split(' ')[0]?.toLowerCase()
            const color = ACTION_COLOR[actionWord] || 'muted'
            return (
              <div key={log.id} className="bg-surface border border-border rounded-xl p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className={`text-xs font-bold text-${color} mb-1`}>{log.action}</div>
                    <div className="text-muted text-[11px]">👤 {log.org_members?.full_name || 'مجهول'}</div>
                    {log.entity_name && <div className="text-muted text-[11px]">📌 {log.entity_name}</div>}
                  </div>
                  <div className="text-muted text-[10px] text-left">{formatDate(log.created_at)}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
