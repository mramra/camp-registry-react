import { useState, useRef } from 'react'
import { localDB } from '../../lib/db'
import { supabase, ORG_ID } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { useDataScope } from '../../lib/useDataScope'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'

const REQUIRED = ['head_name','head_id','phone1','camp_id']

export default function DataPage() {
  const [loading,        setLoading]        = useState(false)
  const [filterCamp,     setFilterCamp]     = useState('')
  const [camps,          setCamps]          = useState([])
  const [importPreview,  setImportPreview]  = useState(null)
  const [importing,      setImporting]      = useState(false)
  const [backupStats,    setBackupStats]    = useState(null)
  const importRef = useRef()

  const { profile, isOwner, isSuperAdmin, canExport, canImport } = useAuth()
  const { showToast } = useApp()
  const { getAllowedCampIds, filterLocal } = useDataScope()

  // جلب المخيمات عند الفتح
  useState(() => {
    localDB.camps.toArray().catch(()=>[]).then(c => {
      setCamps(c)
      if (profile?.camp_id) setFilterCamp(profile.camp_id)
    })
  })

  // ══ جلب البيانات ══
  async function getData() {
    const allFams = await localDB.families.toArray().catch(()=>[])
    const allMems = await localDB.family_members.toArray().catch(()=>[])
    const campMap = Object.fromEntries(camps.map(c=>[c.id,c.name]))
    const campIds = getAllowedCampIds(camps)
    let fams = filterLocal(allFams, campIds)
    if (filterCamp) fams = fams.filter(f => f.camp_id === filterCamp)
    const famIds = new Set(fams.map(f=>f.id))
    const mems = allMems.filter(m => famIds.has(m.family_id))
    return { fams, mems, campMap }
  }

  // ══ تصدير الأسر Excel ══
  async function exportFamilies() {
    setLoading(true)
    try {
      const { fams, mems, campMap } = await getData()
      const memCount = {}
      mems.forEach(m => { memCount[m.family_id] = (memCount[m.family_id]||0)+1 })

      const rows = [
        ['#','اسم رب الأسرة','رقم الهوية','الجوال','جوال بديل','المخيم','الخيمة','الجنس','الحالة الاجتماعية','الأفراد','المنطقة الأصلية','ملاحظات']
      ]
      fams.forEach((f,i) => {
        rows.push([
          i+1, f.head_name||'', f.head_id||'', f.phone1||'', f.phone2||'',
          campMap[f.camp_id]||'', f.tent||'', f.head_gender||'',
          f.head_marital||'', (memCount[f.id]||0)+1,
          f.original_address||'', f.notes||''
        ])
      })
      downloadCSV(rows, `أسر_${new Date().toLocaleDateString('ar')}.csv`)
      showToast(`✅ تم تصدير ${fams.length} أسرة`)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false) }
  }

  // ══ تصدير الأفراد Excel ══
  async function exportMembers() {
    setLoading(true)
    try {
      const { fams, mems, campMap } = await getData()
      const famMap = Object.fromEntries(fams.map(f=>[f.id,f]))

      const rows = [
        ['#','اسم الفرد','رقم الهوية','الصلة','تاريخ الميلاد','الجنس','الحالة الصحية','اسم رب الأسرة','المخيم']
      ]
      // رب الأسرة
      fams.forEach((f,i) => {
        rows.push([i+1, f.head_name||'', f.head_id||'', 'رب الأسرة',
          f.head_dob||'', f.head_gender||'', 'سليم',
          f.head_name||'', campMap[f.camp_id]||''])
      })
      // الأفراد
      mems.forEach((m,i) => {
        const fam = famMap[m.family_id] || {}
        rows.push([fams.length+i+1, m.name||'', m.national_id||'',
          m.relation||'', m.dob||'', m.gender||'', m.health||'سليم',
          fam.head_name||'', campMap[fam.camp_id]||''])
      })
      downloadCSV(rows, `أفراد_${new Date().toLocaleDateString('ar')}.csv`)
      showToast(`✅ تم تصدير ${fams.length + mems.length} فرد`)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false) }
  }

  // ══ تصدير الناقصة ══
  async function exportMissing() {
    setLoading(true)
    try {
      const { fams, campMap } = await getData()
      const missing = fams.filter(f => REQUIRED.some(k => !f[k]?.toString().trim()))
      const rows = [['#','اسم رب الأسرة','رقم الهوية','الجوال','المخيم','النواقص']]
      missing.forEach((f,i) => {
        const lacks = REQUIRED.filter(k=>!f[k]?.toString().trim())
          .map(k=>({head_name:'الاسم',head_id:'الهوية',phone1:'الجوال',camp_id:'المخيم'}[k]))
          .join(' + ')
        rows.push([i+1, f.head_name||'—', f.head_id||'—', f.phone1||'—',
          campMap[f.camp_id]||'—', lacks])
      })
      downloadCSV(rows, `ناقصة_${new Date().toLocaleDateString('ar')}.csv`)
      showToast(`✅ ${missing.length} أسرة ناقصة`)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false) }
  }

  // ══ تحميل قالب الاستيراد ══
  function downloadTemplate() {
    const rows = [
      ['اسم رب الأسرة*','رقم الهوية*','رقم الجوال*','جوال بديل','الجنس','الحالة الاجتماعية','تاريخ الميلاد','اسم المخيم*','الخيمة','المنطقة الأصلية','ملاحظات'],
      ['محمد أحمد علي محمود','123456789','0599000000','','ذكر','متزوج','1980-01-15','مخيم السلام','A1','غزة','']
    ]
    downloadCSV(rows, 'قالب_استيراد_الأسر.csv')
    showToast('✅ تم تحميل القالب')
  }

  // ══ معالجة ملف الاستيراد ══
  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const text = await file.text()
      const lines = text.split('\n').filter(l=>l.trim())
      if (lines.length < 2) return showToast('الملف فارغ', true)

      const headers = lines[0].split(',').map(h=>h.trim().replace(/"/g,''))
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v=>v.trim().replace(/"/g,''))
        return Object.fromEntries(headers.map((h,i)=>[h,vals[i]||'']))
      }).filter(r => r['اسم رب الأسرة*']?.trim())

      // تحقق من التكرار
      const existingFams = await localDB.families.toArray().catch(()=>[])
      const existingIds = new Set(existingFams.map(f=>f.head_id).filter(Boolean))
      const campMap = Object.fromEntries(camps.map(c=>[c.name,c.id]))

      const preview = rows.map(r => {
        const headId = r['رقم الهوية*']?.trim()
        const dup = existingIds.has(headId)
        const campName = r['اسم المخيم*']?.trim()
        const campId = campMap[campName] || null
        return {
          head_name: r['اسم رب الأسرة*'],
          head_id:   headId,
          phone1:    r['رقم الجوال*'],
          phone2:    r['جوال بديل'],
          head_gender:  r['الجنس'] || 'ذكر',
          head_marital: r['الحالة الاجتماعية'],
          head_dob:     r['تاريخ الميلاد'],
          camp_id:   campId,
          campName:  campName,
          tent:      r['الخيمة'],
          original_address: r['المنطقة الأصلية'],
          notes:     r['ملاحظات'],
          dup, campId,
          valid: !!r['اسم رب الأسرة*'] && !!headId && !!r['رقم الجوال*'],
        }
      })

      setImportPreview(preview)
    } catch(e) { showToast('خطأ في قراءة الملف: '+e.message, true) }
    finally { setLoading(false); if(importRef.current) importRef.current.value='' }
  }

  // ══ تأكيد الاستيراد ══
  async function confirmImport() {
    if (!importPreview) return
    setImporting(true)
    try {
      const toImport = importPreview.filter(r => r.valid && !r.dup)
      let ok=0, skip=0, err=0

      for (const row of toImport) {
        try {
          const fam = {
            id: crypto.randomUUID(), org_id: ORG_ID,
            head_name: row.head_name, head_id: row.head_id,
            phone1: row.phone1, phone2: row.phone2||null,
            head_gender: row.head_gender, head_marital: row.head_marital||null,
            head_dob: row.head_dob||null, camp_id: row.camp_id||null,
            tent: row.tent||null, original_address: row.original_address||null,
            notes: row.notes||null, category_tags: [],
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }
          await localDB.families.put(fam)
          if (navigator.onLine) {
            await supabase.from('families').insert(fam)
          }
          ok++
        } catch { err++ }
      }
      skip = importPreview.filter(r=>r.dup).length

      showToast(`✅ استُورد ${ok} | تخطى ${skip} مكرر | خطأ ${err}`)
      setImportPreview(null)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setImporting(false) }
  }

  // ══ نسخة احتياطية ══
  async function createBackup() {
    setLoading(true)
    try {
      const [fams, mems, camps2, rounds, distFams] = await Promise.all([
        localDB.families.toArray().catch(()=>[]),
        localDB.family_members.toArray().catch(()=>[]),
        localDB.camps.toArray().catch(()=>[]),
        localDB.dist_rounds.toArray().catch(()=>[]),
        localDB.camp_dist_families.toArray().catch(()=>[]),
      ])
      const backup = {
        version: 1, org_id: ORG_ID,
        created_at: new Date().toISOString(),
        created_by: profile?.full_name,
        counts: { families: fams.length, members: mems.length, camps: camps2.length },
        data: { families: fams, family_members: mems, camps: camps2,
                dist_rounds: rounds, camp_dist_families: distFams }
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `backup_${new Date().toLocaleDateString('ar').replace(/\//g,'-')}.json`
      a.click()
      URL.revokeObjectURL(url)
      setBackupStats({ families: fams.length, members: mems.length })
      showToast('✅ تم إنشاء النسخة الاحتياطية')
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false) }
  }

  // ══ استعادة نسخة احتياطية ══
  const restoreRef = useRef()
  async function handleRestoreFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!window.confirm('سيتم استبدال البيانات المحلية بالنسخة الاحتياطية. هل أنت متأكد؟')) return
    setLoading(true)
    try {
      const text   = await file.text()
      const backup = JSON.parse(text)
      if (!backup.data) return showToast('ملف غير صالح', true)
      if (backup.data.families?.length)        await localDB.families.bulkPut(backup.data.families).catch(()=>{})
      if (backup.data.family_members?.length)  await localDB.family_members.bulkPut(backup.data.family_members).catch(()=>{})
      if (backup.data.camps?.length)           await localDB.camps.bulkPut(backup.data.camps).catch(()=>{})
      showToast(`✅ استُعيدت ${backup.data.families?.length||0} أسرة`)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false); if(restoreRef.current) restoreRef.current.value='' }
  }

  // ══ مساعد: تحميل CSV ══
  function downloadCSV(rows, filename) {
    const csv = rows.map(r =>
      r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')
    ).join('\n')
    const bom  = '\uFEFF'
    const blob = new Blob([bom+csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  const SEL = "w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent"
  const BTN_P = "w-full py-2.5 rounded-xl text-sm font-black text-bg bg-accent"
  const BTN_B = "w-full py-2.5 rounded-xl text-sm font-bold border"

  return (
    <div>
      <PageHeader icon="📁" title="استيراد وتصدير البيانات" />

      {/* فلتر المخيم */}
      <select value={filterCamp} onChange={e=>setFilterCamp(e.target.value)} className={SEL + ' mb-4'}>
        <option value="">كل المخيمات</option>
        {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {/* ══ تصدير ══ */}
      <Card title="📥 تصدير البيانات" icon="">
        {canExport || isOwner || isSuperAdmin ? (
          <div className="flex flex-col gap-2">
            <p className="text-muted text-xs mb-2">صدّر بيانات الأسر أو الأفراد إلى CSV</p>
            <button onClick={exportFamilies} disabled={loading} className={BTN_P}>
              {loading ? '⏳ جارٍ...' : '👨‍👩‍👧 كشف الأسر'}
            </button>
            <button onClick={exportMembers} disabled={loading}
              className={BTN_B + ' border-blue/40 text-blue'} style={{background:'rgba(59,130,246,0.08)'}}>
              👤 كشف الأفراد
            </button>
            <button onClick={exportMissing} disabled={loading}
              className={BTN_B + ' border-red/40 text-red'} style={{background:'rgba(239,68,68,0.08)'}}>
              ⚠️ الأسر الناقصة
            </button>
          </div>
        ) : (
          <div className="text-center text-red text-xs py-4">🔒 لا تملك صلاحية التصدير</div>
        )}
      </Card>

      {/* ══ استيراد ══ */}
      <Card title="📤 استيراد البيانات" icon="">
        {canImport || isOwner || isSuperAdmin ? (
          <div className="flex flex-col gap-2">
            <p className="text-muted text-xs mb-1">استيراد أسر من CSV — يتحقق من التكرار تلقائياً</p>
            <button onClick={downloadTemplate}
              className={BTN_B + ' border-accent/40 text-accent'} style={{background:'rgba(245,158,11,0.08)'}}>
              📋 تحميل قالب الاستيراد
            </button>
            <button onClick={()=>importRef.current?.click()} disabled={loading} className={BTN_P}>
              📂 اختيار ملف CSV
            </button>
            <input ref={importRef} type="file" accept=".csv,.xlsx,.xls"
              className="hidden" onChange={handleImportFile}/>

            {/* معاينة الاستيراد */}
            {importPreview && (
              <div className="mt-2">
                <div className="text-white text-xs font-bold mb-2">
                  معاينة: {importPreview.length} سجل
                  <span className="text-green mr-2">✅ {importPreview.filter(r=>r.valid&&!r.dup).length} جديد</span>
                  <span className="text-accent mr-2">🔁 {importPreview.filter(r=>r.dup).length} مكرر</span>
                  <span className="text-red mr-2">❌ {importPreview.filter(r=>!r.valid).length} ناقص</span>
                </div>
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {importPreview.map((r,i) => (
                    <div key={i} className="text-xs px-3 py-1.5 rounded-lg flex justify-between"
                      style={{background: r.dup?'rgba(245,158,11,0.1)':r.valid?'rgba(16,185,129,0.1)':'rgba(239,68,68,0.1)'}}>
                      <span className="text-white">{r.head_name}</span>
                      <span>{r.dup?'🔁 مكرر':r.valid?'✅':'❌ ناقص'}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={confirmImport} disabled={importing} className={BTN_P + ' flex-1'}>
                    {importing ? '⏳ جارٍ...' : '✅ تأكيد الاستيراد'}
                  </button>
                  <button onClick={()=>setImportPreview(null)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-muted">
                    إلغاء
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-red text-xs py-4">🔒 لا تملك صلاحية الاستيراد</div>
        )}
      </Card>

      {/* ══ نسخة احتياطية ══ */}
      {(isOwner || isSuperAdmin) && (
        <Card title="💾 النسخة الاحتياطية" icon="">
          <div className="flex flex-col gap-2">
            <p className="text-muted text-xs mb-1">حفظ أو استعادة كل البيانات</p>
            <button onClick={createBackup} disabled={loading} className={BTN_P}>
              💾 إنشاء نسخة احتياطية
            </button>
            <button onClick={()=>restoreRef.current?.click()} disabled={loading}
              className={BTN_B + ' border-accent/40 text-accent'} style={{background:'rgba(245,158,11,0.08)'}}>
              📂 استعادة من نسخة احتياطية
            </button>
            <input ref={restoreRef} type="file" accept=".json"
              className="hidden" onChange={handleRestoreFile}/>
            {backupStats && (
              <div className="text-green text-xs text-center">
                ✅ نسخة: {backupStats.families} أسرة · {backupStats.members} فرد
              </div>
            )}
          </div>
        </Card>
      )}

      {loading && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}
    </div>
  )
}
