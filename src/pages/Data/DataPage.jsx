import { useState, useRef } from 'react'
// SheetJS يُحمَّل ديناميكياً
async function getXLSX() {
  if (window.XLSX) return window.XLSX
  await new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = res; s.onerror = rej
    document.head.appendChild(s)
  })
  return window.XLSX
}
import { localDB } from '../../lib/db'
import { supabase, ORG_ID } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { useDataScope } from '../../lib/useDataScope'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import Modal from '../../components/ui/Modal'

// ── تعريف الأعمدة ──────────────────────────────────────
const FAM_COLS = [
  { key:'head_name',        label:'اسم رب الأسرة',          def:true  },
  { key:'head_id',          label:'رقم الهوية',              def:true  },
  { key:'phone1',           label:'رقم الجوال',              def:true  },
  { key:'phone2',           label:'جوال بديل',               def:false },
  { key:'camp',             label:'المخيم',                  def:true  },
  { key:'tent',             label:'رقم الخيمة',              def:false },
  { key:'head_dob',         label:'تاريخ الميلاد',           def:false },
  { key:'age',              label:'العمر',                   def:false },
  { key:'head_gender',      label:'الجنس',                   def:false },
  { key:'head_marital',     label:'الحالة الاجتماعية',       def:true  },
  { key:'members_count',    label:'عدد الأفراد',             def:true  },
  { key:'spouse_name',      label:'اسم الزوجة',              def:false },
  { key:'spouse_id',        label:'هوية الزوجة',             def:false },
  { key:'category_tags',    label:'الفئة الاجتماعية',        def:false },
  { key:'original_address', label:'عنوان السكن الأصلي',      def:false },
  { key:'address_details',  label:'العنوان بالتفصيل',        def:false },
  { key:'notes',            label:'ملاحظات',                 def:false },
]

const MEM_COLS = [
  { key:'fam_name',    label:'اسم رب الأسرة',           def:true  },
  { key:'head_id',     label:'هوية رب الأسرة',          def:true  },
  { key:'head_phone',  label:'رقم الجوال',               def:true  },
  { key:'camp',        label:'المخيم',                   def:true  },
  { key:'mother_name', label:'اسم الأم',                 def:true  },
  { key:'mother_id',   label:'رقم هوية الأم',            def:true  },
  { key:'mother_dob',  label:'تاريخ ميلاد الأم',        def:false },
  { key:'son_name',    label:'اسم الفرد',                def:true  },
  { key:'son_id',      label:'رقم هوية الفرد',           def:true  },
  { key:'son_dob',     label:'تاريخ الميلاد',            def:true  },
  { key:'relation',    label:'العلاقة',                  def:true  },
  { key:'age',         label:'العمر',                    def:true  },
  { key:'gender',      label:'الجنس',                    def:false },
  { key:'health',      label:'الحالة الصحية',            def:false },
]

function calcAge(dob) {
  if (!dob) return null
  const b = new Date(dob), t = new Date()
  let a = t.getFullYear() - b.getFullYear()
  if (t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate())) a--
  return a>=0&&a<120 ? a : null
}

const REQUIRED = ['head_name','head_id','phone1','camp_id']

export default function DataPage() {
  const [loading,       setLoading]       = useState(false)
  const [filterCamp,    setFilterCamp]    = useState('')
  const [camps,         setCamps]         = useState([])
  const [exportModal,   setExportModal]   = useState(null) // 'fam' | 'mem' | null
  const [famCols,       setFamCols]       = useState(() => FAM_COLS.map((c,i)=>({...c, order: c.def?i+1:0})))
  const [memCols,       setMemCols]       = useState(() => MEM_COLS.map((c,i)=>({...c, order: c.def?i+1:0})))
  const [ageFrom,       setAgeFrom]       = useState(0)
  const [ageTo,         setAgeTo]         = useState(120)
  const [importPreview, setImportPreview] = useState(null)
  const [importing,     setImporting]     = useState(false)
  const importRef = useRef()
  const restoreRef = useRef()

  const { profile, isOwner, isSuperAdmin, canExport, canImport } = useAuth()
  const { showToast } = useApp()
  const { getAllowedCampIds, filterLocal } = useDataScope()

  useState(() => {
    localDB.camps.toArray().catch(()=>[]).then(c => {
      setCamps(c)
      if (profile?.camp_id) setFilterCamp(profile.camp_id)
    })
  })

  async function getData() {
    const allFams = await localDB.families.toArray().catch(()=>[])
    const allMems = await localDB.family_members.toArray().catch(()=>[])
    const campMap = Object.fromEntries(camps.map(c=>[c.id,c.name]))
    const campIds = getAllowedCampIds(camps)
    let fams = filterLocal(allFams, campIds)
    if (filterCamp) fams = fams.filter(f => f.camp_id === filterCamp)
    const famIds = new Set(fams.map(f=>f.id))
    const mems = allMems.filter(m => famIds.has(m.family_id))
    const mByFam = {}
    mems.forEach(m => { if(!mByFam[m.family_id]) mByFam[m.family_id]=[]; mByFam[m.family_id].push(m) })
    return { fams, mems, mByFam, campMap }
  }

  // ── تصدير الأسر ──
  async function exportFamilies() {
    setLoading(true)
    try {
      const { fams, mByFam, campMap } = await getData()
      const selected = [...famCols].filter(c=>c.order>0).sort((a,b)=>a.order-b.order)
      if (!selected.length) return showToast('اختر عموداً على الأقل', true)

      const rows = fams.map(f => {
        const fMems = mByFam[f.id] || []
        const spouses = fMems.filter(m => ['زوجة','زوج'].includes(m.relation||''))
        const row = {}
        selected.forEach(col => {
          switch(col.key) {
            case 'head_name':        row[col.label] = f.head_name||''; break
            case 'head_id':          row[col.label] = f.head_id||''; break
            case 'phone1':           row[col.label] = f.phone1||''; break
            case 'phone2':           row[col.label] = f.phone2||''; break
            case 'camp':             row[col.label] = campMap[f.camp_id]||''; break
            case 'tent':             row[col.label] = f.tent||''; break
            case 'head_dob':         row[col.label] = f.head_dob||''; break
            case 'age':              row[col.label] = calcAge(f.head_dob)??''; break
            case 'head_gender':      row[col.label] = f.head_gender||''; break
            case 'head_marital':     row[col.label] = f.head_marital||''; break
            case 'members_count':    row[col.label] = fMems.length+1; break
            case 'spouse_name':      row[col.label] = spouses[0]?.name||''; break
            case 'spouse_id':        row[col.label] = spouses[0]?.national_id||''; break
            case 'category_tags':    row[col.label] = (f.category_tags||[]).join(', '); break
            case 'original_address': row[col.label] = f.original_address||''; break
            case 'address_details':  row[col.label] = f.address_details||''; break
            case 'notes':            row[col.label] = f.notes||''; break
          }
        })
        return row
      })

      const XLSX = await getXLSX()
      const ws = XLSX.utils.json_to_sheet(rows)
      styleSheet(ws, selected.length)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'الأسر')
      addInfoSheet(wb, fams.length, campMap)
      const campName = filterCamp ? campMap[filterCamp] : 'كل المخيمات'
      XLSX.writeFile(wb, `كشف_الأسر_${campName}_${today()}.xlsx`)
      showToast(`✅ تم تصدير ${fams.length} أسرة`)
      setExportModal(null)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false) }
  }

  // ── تصدير الأفراد ──
  async function exportMembers() {
    setLoading(true)
    try {
      const { fams, mByFam, campMap } = await getData()
      const selected = [...memCols].filter(c=>c.order>0).sort((a,b)=>a.order-b.order)
      if (!selected.length) return showToast('اختر عموداً على الأقل', true)

      const memRows = []
      fams.forEach(f => {
        const fMems  = mByFam[f.id] || []
        const mother = fMems.find(m => ['زوجة','زوج','أم'].includes(m.relation||''))
        const allPersons = [
          { _isHead:true, name:f.head_name, national_id:f.head_id, dob:f.head_dob, gender:f.head_gender, relation:'رب الأسرة', health:'' },
          ...fMems
        ]
        const filtered = (ageFrom>0||ageTo<120)
          ? allPersons.filter(m => { const a=calcAge(m.dob); return a!==null&&a>=ageFrom&&a<=ageTo })
          : allPersons

        const toProcess = filtered.length ? filtered : [null]
        toProcess.forEach(child => {
          const age = child ? (calcAge(child.dob)??'') : ''
          const row = {}
          selected.forEach(col => {
            switch(col.key) {
              case 'fam_name':    row[col.label] = f.head_name||''; break
              case 'head_id':     row[col.label] = f.head_id||''; break
              case 'head_phone':  row[col.label] = f.phone1||''; break
              case 'camp':        row[col.label] = campMap[f.camp_id]||''; break
              case 'mother_name': row[col.label] = mother?.name||''; break
              case 'mother_id':   row[col.label] = mother?.national_id||''; break
              case 'mother_dob':  row[col.label] = mother?.dob||''; break
              case 'son_name':    row[col.label] = (!child?._isHead&&child?.name)||''; break
              case 'son_id':      row[col.label] = (!child?._isHead&&child?.national_id)||''; break
              case 'son_dob':     row[col.label] = (!child?._isHead&&child?.dob)||''; break
              case 'relation':    row[col.label] = child?.relation||''; break
              case 'age':         row[col.label] = age; break
              case 'gender':      row[col.label] = child?.gender||''; break
              case 'health':      row[col.label] = child?.health||''; break
            }
          })
          memRows.push(row)
        })
      })

      const XLSX = await getXLSX()
      const ws = XLSX.utils.json_to_sheet(memRows)
      styleSheet(ws, selected.length)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'الأفراد')
      addInfoSheet(wb, fams.length, Object.fromEntries(camps.map(c=>[c.id,c.name])))
      const campName = filterCamp ? Object.fromEntries(camps.map(c=>[c.id,c.name]))[filterCamp] : 'كل المخيمات'
      XLSX.writeFile(wb, `كشف_الأفراد_${campName}_${today()}.xlsx`)
      showToast(`✅ تم تصدير ${memRows.length} سجل`)
      setExportModal(null)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false) }
  }

  // ── تصدير الناقصة ──
  async function exportMissing() {
    setLoading(true)
    try {
      const { fams, campMap } = await getData()
      const XLSX = await getXLSX()
      const missing = fams.filter(f => REQUIRED.some(k=>!f[k]?.toString().trim()))
      const rows = missing.map((f,i) => ({
        '#': i+1,
        'اسم رب الأسرة': f.head_name||'—',
        'رقم الهوية':     f.head_id||'—',
        'رقم الجوال':     f.phone1||'—',
        'المخيم':          campMap[f.camp_id]||'—',
        'النواقص': REQUIRED.filter(k=>!f[k]?.toString().trim())
          .map(k=>({head_name:'الاسم',head_id:'الهوية',phone1:'الجوال',camp_id:'المخيم'}[k])).join(' + ')
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      styleSheet(ws, 6)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'الأسر الناقصة')
      XLSX.writeFile(wb, `ناقصة_${today()}.xlsx`)
      showToast(`✅ ${missing.length} أسرة ناقصة`)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false) }
  }

  // ── تنسيق الورقة ──
  function styleSheet(ws, colCount) {
    const range = XLSX.utils.decode_range(ws['!ref']||'A1')
    ws['!cols'] = Array(colCount).fill({ wch: 20 })
    // تلوين الرأس
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c })
      if (!ws[addr]) continue
      ws[addr].s = {
        fill: { fgColor: { rgb: '1E3A5F' } },
        font: { bold: true, color: { rgb: 'FFFFFF' }, name: 'Arial' },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: { bottom: { style:'thin', color:{ rgb:'CCCCCC' }}}
      }
    }
    ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  }

  function addInfoSheet(wb, count, campMap) {
    const campName = filterCamp ? campMap[filterCamp] : 'كل المخيمات'
    const ws = XLSX.utils.aoa_to_sheet([
      ['المخيم',    campName],
      ['عدد الأسر', count],
      ['تاريخ التصدير', new Date().toLocaleDateString('ar-EG')],
      ['تم بواسطة',  profile?.full_name||'—'],
    ])
    ws['!cols'] = [{wch:18},{wch:30}]
    XLSX.utils.book_append_sheet(wb, ws, 'معلومات')
  }

  function today() {
    return new Date().toLocaleDateString('ar-EG').replace(/\//g,'-')
  }

  // ── تحميل القالب ──
  function downloadTemplate() {
    const XLSX = await getXLSX()
    const headers = ['اسم رب الأسرة*','رقم الهوية*','رقم الجوال*','جوال بديل','الجنس','الحالة الاجتماعية','تاريخ الميلاد','اسم المخيم*','الخيمة','المنطقة الأصلية','ملاحظات']
    const example = ['محمد أحمد علي محمود','123456789','0599000000','','ذكر','متزوج','1980-01-15','مخيم السلام','A1','غزة','']
    const ws = XLSX.utils.aoa_to_sheet([headers, example])
    ws['!cols'] = headers.map(()=>({wch:22}))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'قالب الاستيراد')
    XLSX.writeFile(wb, 'قالب_استيراد_الأسر.xlsx')
    showToast('✅ تم تحميل القالب')
  }

  // ── استيراد ──
  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const XLSX = await getXLSX()
      const buf  = await file.arrayBuffer()
      const wb   = XLSX.read(buf, { type:'array' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval:'' })
      if (!rows.length) return showToast('الملف فارغ', true)

      const existingFams = await localDB.families.toArray().catch(()=>[])
      const existingIds  = new Set(existingFams.map(f=>f.head_id).filter(Boolean))
      const campNameMap  = Object.fromEntries(camps.map(c=>[c.name.trim(), c.id]))

      const preview = rows
        .filter(r => r['اسم رب الأسرة*']||r['اسم رب الأسرة'])
        .map(r => {
          const headId   = String(r['رقم الهوية*']||r['رقم الهوية']||'').trim()
          const campName = String(r['اسم المخيم*']||r['المخيم']||'').trim()
          return {
            head_name: String(r['اسم رب الأسرة*']||r['اسم رب الأسرة']||'').trim(),
            head_id:   headId,
            phone1:    String(r['رقم الجوال*']||r['رقم الجوال']||'').trim(),
            phone2:    String(r['جوال بديل']||'').trim()||null,
            head_gender:  String(r['الجنس']||'ذكر').trim(),
            head_marital: String(r['الحالة الاجتماعية']||'').trim()||null,
            head_dob:     String(r['تاريخ الميلاد']||'').trim()||null,
            camp_id:      campNameMap[campName]||null,
            campName,
            tent:         String(r['الخيمة']||'').trim()||null,
            original_address: String(r['المنطقة الأصلية']||'').trim()||null,
            notes:        String(r['ملاحظات']||'').trim()||null,
            dup:   existingIds.has(headId),
            valid: !!(r['اسم رب الأسرة*']||r['اسم رب الأسرة']) && !!headId,
          }
        })

      setImportPreview(preview)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false); if(importRef.current) importRef.current.value='' }
  }

  async function confirmImport() {
    if (!importPreview) return
    setImporting(true)
    let ok=0, skip=0, err=0
    try {
      for (const row of importPreview.filter(r=>r.valid&&!r.dup)) {
        try {
          const fam = { id:crypto.randomUUID(), org_id:ORG_ID, ...row,
            category_tags:[], created_at:new Date().toISOString(), updated_at:new Date().toISOString() }
          delete fam.dup; delete fam.valid; delete fam.campName
          await localDB.families.put(fam)
          if (navigator.onLine) await supabase.from('families').insert(fam)
          ok++
        } catch { err++ }
      }
      skip = importPreview.filter(r=>r.dup).length
      showToast(`✅ استُورد ${ok} | تخطى ${skip} مكرر${err?` | خطأ ${err}`:''}`)
      setImportPreview(null)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setImporting(false) }
  }

  // ── نسخة احتياطية ──
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
      const backup = { version:1, org_id:ORG_ID, created_at:new Date().toISOString(),
        created_by:profile?.full_name,
        counts:{families:fams.length,members:mems.length,camps:camps2.length},
        data:{families:fams,family_members:mems,camps:camps2,dist_rounds:rounds,camp_dist_families:distFams} }
      const blob = new Blob([JSON.stringify(backup,null,2)], {type:'application/json'})
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href=url; a.download=`backup_${today()}.json`; a.click()
      URL.revokeObjectURL(url)
      showToast(`✅ نسخة احتياطية: ${fams.length} أسرة`)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false) }
  }

  async function handleRestoreFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!window.confirm('سيتم استبدال البيانات المحلية. هل أنت متأكد؟')) return
    setLoading(true)
    try {
      const backup = JSON.parse(await file.text())
      if (!backup.data) return showToast('ملف غير صالح', true)
      if (backup.data.families?.length)       await localDB.families.bulkPut(backup.data.families).catch(()=>{})
      if (backup.data.family_members?.length) await localDB.family_members.bulkPut(backup.data.family_members).catch(()=>{})
      if (backup.data.camps?.length)          await localDB.camps.bulkPut(backup.data.camps).catch(()=>{})
      showToast(`✅ استُعيدت ${backup.data.families?.length||0} أسرة`)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false); if(restoreRef.current) restoreRef.current.value='' }
  }

  const SEL = "w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent"
  const canExp = canExport || isOwner || isSuperAdmin
  const canImp = canImport || isOwner || isSuperAdmin

  return (
    <div>
      <PageHeader icon="📁" title="استيراد وتصدير البيانات" />

      <select value={filterCamp} onChange={e=>setFilterCamp(e.target.value)} className={SEL+' mb-4'}>
        <option value="">🏕️ كل المخيمات</option>
        {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {/* ═══ تصدير ═══ */}
      <Card title="📥 تصدير Excel" icon="">
        {canExp ? (
          <div className="flex flex-col gap-2">
            <p className="text-muted text-xs mb-1">صدّر البيانات إلى Excel مع اختيار الأعمدة</p>
            <button onClick={()=>setExportModal('fam')} disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-black text-bg bg-accent">
              👨‍👩‍👧 كشف الأسر
            </button>
            <button onClick={()=>setExportModal('mem')} disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-bold border border-blue/40 text-blue"
              style={{background:'rgba(59,130,246,0.08)'}}>
              👤 كشف الأفراد
            </button>
            <button onClick={exportMissing} disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-bold border border-red/40 text-red"
              style={{background:'rgba(239,68,68,0.08)'}}>
              ⚠️ الأسر الناقصة
            </button>
          </div>
        ) : <p className="text-red text-xs text-center py-3">🔒 لا تملك صلاحية التصدير</p>}
      </Card>

      {/* ═══ استيراد ═══ */}
      <Card title="📤 استيراد Excel" icon="">
        {canImp ? (
          <div className="flex flex-col gap-2">
            <p className="text-muted text-xs mb-1">استيراد أسر من Excel — يتحقق من التكرار تلقائياً</p>
            <button onClick={downloadTemplate}
              className="w-full py-2.5 rounded-xl text-sm font-bold border border-accent/40 text-accent"
              style={{background:'rgba(245,158,11,0.08)'}}>
              📋 تحميل قالب الاستيراد
            </button>
            <button onClick={()=>importRef.current?.click()} disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-black text-bg bg-accent">
              📂 اختيار ملف Excel
            </button>
            <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFile}/>

            {importPreview && (
              <div className="mt-1">
                <div className="flex gap-3 text-xs mb-2 flex-wrap">
                  <span className="text-white font-bold">{importPreview.length} سجل</span>
                  <span className="text-green">✅ {importPreview.filter(r=>r.valid&&!r.dup).length} جديد</span>
                  <span className="text-accent">🔁 {importPreview.filter(r=>r.dup).length} مكرر</span>
                  <span className="text-red">❌ {importPreview.filter(r=>!r.valid).length} ناقص</span>
                </div>
                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto mb-2">
                  {importPreview.map((r,i)=>(
                    <div key={i} className="text-[11px] px-3 py-1.5 rounded-lg flex justify-between"
                      style={{background:r.dup?'rgba(245,158,11,0.1)':r.valid?'rgba(16,185,129,0.1)':'rgba(239,68,68,0.1)'}}>
                      <span className="text-white truncate max-w-[200px]">{r.head_name}</span>
                      <span>{r.dup?'🔁 مكرر':r.valid?'✅':'❌'}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={confirmImport} disabled={importing}
                    className="flex-1 py-2.5 rounded-xl text-sm font-black text-bg bg-accent">
                    {importing?'⏳...':'✅ تأكيد'}
                  </button>
                  <button onClick={()=>setImportPreview(null)}
                    className="flex-1 py-2.5 rounded-xl text-sm border border-border text-muted">
                    إلغاء
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : <p className="text-red text-xs text-center py-3">🔒 لا تملك صلاحية الاستيراد</p>}
      </Card>

      {/* ═══ نسخة احتياطية ═══ */}
      {(isOwner||isSuperAdmin) && (
        <Card title="💾 النسخة الاحتياطية" icon="">
          <div className="flex flex-col gap-2">
            <button onClick={createBackup} disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-black text-bg bg-accent">
              💾 إنشاء نسخة احتياطية
            </button>
            <button onClick={()=>restoreRef.current?.click()} disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-bold border border-accent/40 text-accent"
              style={{background:'rgba(245,158,11,0.08)'}}>
              📂 استعادة نسخة احتياطية
            </button>
            <input ref={restoreRef} type="file" accept=".json" className="hidden" onChange={handleRestoreFile}/>
          </div>
        </Card>
      )}

      {loading && <div className="flex justify-center py-4"><Spinner/></div>}

      {/* ═══ Modal اختيار الأعمدة ═══ */}
      <Modal open={!!exportModal} onClose={()=>setExportModal(null)}
        title={exportModal==='fam'?'📊 تصدير كشف الأسر':'📊 تصدير كشف الأفراد'}>
        <div className="flex flex-col gap-3">
          {/* فلتر العمر للأفراد */}
          {exportModal==='mem' && (
            <div className="bg-surface2 rounded-xl p-3">
              <div className="text-xs font-bold text-muted mb-2">🎂 فلتر العمر</div>
              <div className="flex items-center gap-2">
                <input type="number" value={ageFrom} onChange={e=>setAgeFrom(+e.target.value)}
                  min="0" max="120" className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-white text-sm text-center focus:outline-none"/>
                <span className="text-muted text-sm">—</span>
                <input type="number" value={ageTo} onChange={e=>setAgeTo(+e.target.value)}
                  min="0" max="120" className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-white text-sm text-center focus:outline-none"/>
                <span className="text-muted text-xs">سنة</span>
              </div>
              <div className="flex gap-1 mt-2 flex-wrap">
                {[[0,120,'الكل'],[0,17,'أطفال'],[18,59,'بالغون'],[60,120,'مسنون']].map(([f,t,l])=>(
                  <button key={l} onClick={()=>{setAgeFrom(f);setAgeTo(t)}}
                    className="text-[10px] px-2 py-1 rounded-lg border border-border text-muted">
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* الأعمدة */}
          <div className="text-xs font-bold text-muted mb-1">
            اختر الأعمدة وترتيبها (رقم = الترتيب، فارغ = لا يُصدَّر)
          </div>
          <div className="flex gap-2 mb-1">
            <button onClick={()=>{
              const cols = exportModal==='fam'?famCols:memCols
              const setter = exportModal==='fam'?setFamCols:setMemCols
              setter(cols.map((c,i)=>({...c,order:i+1})))
            }} className="text-[11px] px-3 py-1.5 rounded-lg border border-border text-muted">تحديد الكل</button>
            <button onClick={()=>{
              const setter = exportModal==='fam'?setFamCols:setMemCols
              setter(exportModal==='fam'?FAM_COLS.map(c=>({...c,order:0})):MEM_COLS.map(c=>({...c,order:0})))
            }} className="text-[11px] px-3 py-1.5 rounded-lg border border-border text-muted">إلغاء الكل</button>
          </div>

          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
            {(exportModal==='fam'?famCols:memCols).map((col,i)=>(
              <div key={col.key} className="flex items-center gap-2 bg-surface2 border border-border rounded-xl px-3 py-2">
                <input type="number" min="0" max="20"
                  value={col.order||''}
                  placeholder="—"
                  onChange={e=>{
                    const v = parseInt(e.target.value)||0
                    const setter = exportModal==='fam'?setFamCols:setMemCols
                    setter(prev=>prev.map((c,j)=>j===i?{...c,order:v}:c))
                  }}
                  className="w-12 bg-surface border border-border rounded-lg text-accent font-black text-center text-sm focus:outline-none py-1"
                />
                <span className="text-white text-xs flex-1">{col.label}</span>
              </div>
            ))}
          </div>

          <button onClick={exportModal==='fam'?exportFamilies:exportMembers}
            disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-black text-bg bg-accent mt-1">
            {loading?'⏳ جارٍ التصدير...':'📥 تصدير Excel'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
