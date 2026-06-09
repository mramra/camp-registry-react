
import { useState } from 'react'
import { supabase, ORG_ID } from '../../lib/supabase'
import { localDB } from '../../lib/db'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'

export default function DataPage() {
  const [exporting, setExporting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const { showToast, online } = useApp()
  const { canExport, canImport } = useAuth()

  async function exportToCSV() {
    setExporting(true)
    try {
      const families = await localDB.families.toArray()
      const camps = await localDB.camps.toArray()
      const campMap = Object.fromEntries(camps.map(c => [c.id, c.name]))
      const rows = [
        ['اسم الأسرة', 'رقم الهوية', 'الجوال', 'المخيم', 'الحالة', 'التاريخ'],
        ...families.map(f => [f.head_name||'', f.head_id||'', f.phone1||'', campMap[f.camp_id]||'', f.status||'', (f.created_at||'').slice(0,10)])
      ]
      const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
      const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `families_${new Date().toISOString().slice(0,10)}.csv`
      a.click(); URL.revokeObjectURL(url)
      showToast(`✅ تم تصدير ${families.length} أسرة`)
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setExporting(false) }
  }

  async function syncFromServer() {
    if (!online) return showToast('يتطلب اتصالاً', true)
    setSyncing(true)
    try {
      const [fRes, cRes] = await Promise.all([
        supabase.from('families').select('*').eq('org_id', ORG_ID),
        supabase.from('camps').select('*').eq('org_id', ORG_ID),
      ])
      if (fRes.data) await localDB.families.bulkPut(fRes.data)
      if (cRes.data) await localDB.camps.bulkPut(cRes.data)
      showToast(`✅ تمت المزامنة: ${fRes.data?.length||0} أسرة، ${cRes.data?.length||0} مخيم`)
    } catch(err) { showToast('خطأ: ' + err.message, true) }
    finally { setSyncing(false) }
  }

  return (
    <div>
      <PageHeader icon="💾" title="استيراد / تصدير البيانات" />

      <Card title="تصدير البيانات" icon="📤">
        <p className="text-muted text-xs mb-4">تصدير قائمة الأسر بصيغة CSV (Excel)</p>
        {canExport ? (
          <button onClick={exportToCSV} disabled={exporting}
            className="w-full bg-green/15 border border-green/30 text-green font-bold py-3 rounded-xl text-sm disabled:opacity-60">
            {exporting ? 'جاري التصدير...' : '📥 تصدير CSV'}
          </button>
        ) : (
          <p className="text-red text-xs text-center">ليس لديك صلاحية التصدير</p>
        )}
      </Card>

      <Card title="مزامنة البيانات" icon="🔄">
        <p className="text-muted text-xs mb-4">جلب أحدث البيانات من السيرفر وتخزينها محلياً</p>
        <button onClick={syncFromServer} disabled={syncing || !online}
          className="w-full bg-blue/15 border border-blue/30 text-blue font-bold py-3 rounded-xl text-sm disabled:opacity-60">
          {syncing ? 'جاري المزامنة...' : online ? '⬇️ جلب البيانات من السيرفر' : 'لا يوجد اتصال'}
        </button>
      </Card>

      <Card title="إحصائيات البيانات المحلية" icon="📊">
        <DBStats />
      </Card>
    </div>
  )
}

function DBStats() {
  const [counts, setCounts] = useState({})
  useEffect(() => {
    Promise.all([
      localDB.families.count().catch(()=>0),
      localDB.camps.count().catch(()=>0),
      localDB.family_movements.count().catch(()=>0),
      localDB.sync_queue.where('status').equals('pending').count().catch(()=>0),
    ]).then(([f,c,m,p]) => setCounts({families:f, camps:c, movements:m, pending:p}))
  }, [])
  return (
    <div className="grid grid-cols-2 gap-2">
      {[['👨‍👩‍👧‍👦','أسرة', counts.families||0], ['🏕️','مخيم', counts.camps||0], ['🔄','حركة', counts.movements||0], ['⏳','انتظار', counts.pending||0]].map(([icon,label,val]) => (
        <div key={label} className="bg-surface2 rounded-xl p-3 text-center">
          <div className="text-xl mb-1">{icon}</div>
          <div className="text-white font-black text-lg">{val}</div>
          <div className="text-muted text-[10px]">{label}</div>
        </div>
      ))}
    </div>
  )
}
