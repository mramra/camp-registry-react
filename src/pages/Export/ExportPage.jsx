import { useState, useEffect, useRef, useCallback } from 'react'
import XLSX from 'xlsx-js-style'
import { applyBanner, TABLE_STYLES } from '../../lib/excelBanner'
import CustomExport from './CustomExport'
import { ORG_ID, supabase, useLocalDB } from '../../lib/db'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { useDataScope } from '../../lib/useDataScope'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import Modal from '../../components/ui/Modal'
import { calcAge } from '../../lib/helpers'

const FAM_COLS = [
  { key:'head_name',        label:'اسم رب الأسرة',    def:true  },
  { key:'head_id',          label:'رقم الهوية',        def:true  },
  { key:'phone1',           label:'رقم الجوال',        def:true  },
  { key:'phone2',           label:'جوال بديل',         def:false },
  { key:'camp',             label:'المخيم',             def:true  },
  { key:'tent',             label:'رقم الخيمة',        def:false },
  { key:'head_dob',         label:'تاريخ الميلاد',     def:false },
  { key:'head_gender',      label:'الجنس',             def:false },
  { key:'head_marital',     label:'الحالة الاجتماعية', def:true  },
  { key:'members_count',    label:'عدد الأفراد',       def:true  },
  { key:'category_tags',    label:'الفئة الاجتماعية',  def:false },
  { key:'original_address', label:'عنوان السكن الأصلي',def:false },
  { key:'notes',            label:'ملاحظات',           def:false },
]

const MEM_COLS = [
  { key:'tent',        label:'رقم الخيمة',      def:true  },
  { key:'fam_name',    label:'اسم رب الأسرة',  def:true  },
  { key:'head_id',     label:'هوية رب الأسرة', def:true  },
  { key:'phone1',      label:'رقم الجوال',      def:true  },
  { key:'camp',        label:'المخيم',           def:true  },
  { key:'name',        label:'اسم الفرد',        def:true  },
  { key:'national_id', label:'رقم الهوية',       def:true  },
  { key:'relation',    label:'صلة القرابة',      def:true  },
  { key:'dob',         label:'تاريخ الميلاد',    def:false },
  { key:'age',         label:'العمر',            def:true  },
  { key:'gender',      label:'الجنس',            def:false },
  { key:'health',      label:'الحالة الصحية',    def:false },
]

export default function ExportPage() {
  const { profile, isOwner, isSuperAdmin, canExport, canImport } = useAuth()
  const { getAllowedCampIds, applyScope, filterLocal, getVisibleCamps } = useDataScope()
  const { showToast, psReady, psSynced } = useApp()
  const { query } = useLocalDB()

  const [loading,       setLoading]       = useState(false)
  const [camps,         setCamps]         = useState([])
  const [orgMembers,    setOrgMembers]    = useState([])
  const [filterCamp,    setFilterCamp]    = useState('')
  const [exportModal,   setExportModal]   = useState(null)
  const [famCols,       setFamCols]       = useState(()=>FAM_COLS.map((c,i)=>({...c,order:c.def?i+1:0})))
  const [memCols,       setMemCols]       = useState(()=>MEM_COLS.map((c,i)=>({...c,order:c.def?i+1:0})))
  const [importPreview, setImportPreview] = useState(null)
  const [importing,     setImporting]     = useState(false)
  const [showBanner,    setShowBanner]    = useState(true)
  const [allFamilies,   setAllFamilies]   = useState([])
  const [allMembers,    setAllMembers]    = useState([])
  const importRef = useRef()

  const isAdmin = isOwner || isSuperAdmin
  const canExp  = canExport || isAdmin
  const canImp  = canImport || isAdmin

  // ── تحميل المخيمات والمستخدمين ──────────────────────
  // جلب مباشر من Supabase — يضمن أحدث بيانات (جوال المندوب)
  const loadCamps = useCallback(async () => {
    try {
      const [{ data: c }, { data: m }] = await Promise.all([
        supabase.from('camps').select('id,name,latitude,longitude,address,manager_id').eq('org_id',ORG_ID),
        supabase.from('org_members').select('id,user_id,full_name,phone,camp_id,role').eq('org_id',ORG_ID),
      ])
      if (c?.length) setCamps(getVisibleCamps(c))
      if (m?.length) setOrgMembers(m)
    } catch (e) { console.warn('[export] فشل تحميل المخيمات/المستخدمين:', e.message) }
  }, [])

  useEffect(() => {
    loadCamps()
    // تحميل أسر وأفراد المستخدم المسموح له فقط للتصدير المخصص
    Promise.all([
      supabase.from('camps').select('*').eq('org_id', ORG_ID),
    ]).then(async ([{data:campsData}]) => {
      const campIds = getAllowedCampIds(campsData || [])
      let famsQ = supabase.from('families').select('*').eq('org_id', ORG_ID).order('tent')
      famsQ = applyScope(famsQ, campIds)
      const [{data:fams},{data:mems}] = await Promise.all([
        famsQ,
        supabase.from('family_members').select('*'),
      ])
      if (fams?.length) setAllFamilies(fams)
      if (mems?.length) {
        const famIdSet = new Set((fams||[]).map(f=>f.id))
        setAllMembers(campIds === null ? mems : mems.filter(m=>famIdSet.has(m.family_id)))
      }
    }).catch(()=>{})
  }, [])

  // ── معلومات المخيم (مندوب + إحداثيات) ──────────────
  function getCampInfo(campId) {
    if (!campId) return null
    const camp = camps.find(c=>c.id===campId)
    if (!camp) return null
    // 1. مندوب المخيم مباشرة
    let delegate = orgMembers.find(m=>m.camp_id===campId&&m.role==='camp_delegate')
    // 2. مدير المخيم (manager_id)
    if (!delegate) delegate = orgMembers.find(m=>m.user_id===camp.manager_id)
    // 3. أي عضو مرتبط بهذا المخيم
    if (!delegate) delegate = orgMembers.find(m=>m.camp_id===campId)
    return {
      name: camp.name,
      lat: camp.latitude, lng: camp.longitude,
      address: camp.address,
      delegateName: delegate?.full_name||'',
      delegatePhone: delegate?.phone || delegate?.national_id || '',
    }
  }

  // ── جلب البيانات (Supabase مباشرة) ──
  async function getFullData() {
    if (!navigator.onLine) throw new Error('لا يوجد اتصال بالإنترنت')
    const {data:campsData} = await supabase.from('camps').select('*').eq('org_id', ORG_ID)
    const campIds = getAllowedCampIds(campsData || [])
    let q = supabase.from('families').select(`
      *, camps!camp_id(id,name,latitude,longitude,address,manager_id), family_members(*)
    `).eq('org_id',ORG_ID)
    if (filterCamp) q = q.eq('camp_id',filterCamp)
    else q = applyScope(q, campIds)
    const { data, error } = await q
    if (error) throw error
    return data || []
  }

  // ── بناء الـ aoa مع البانر ──────────────────────────────────
  // الترتيب: صف1 (مخيم) + صف2 (مندوب) + صف3 (رواسي) + بيانات
  // بدون سطر فاصل
  function buildAoa(campInfo, colHeaders, dataRows, showBnr) {
    const aoa = []
    const empty = () => Array(colHeaders.length).fill('')
    if (showBnr && campInfo) {
      const coord = (campInfo.lat&&campInfo.lng)
        ? `${campInfo.lat}, ${campInfo.lng}`
        : (campInfo.address||'—')
      const r1 = empty()
      r1[0] = `🏕️  مخيم:  ${campInfo.name}`
      const r2 = empty()
      // البانر الآن عبر excelBanner.js
      r2[0] = `${campInfo.delegateName||'—'}   |   ${campInfo.delegatePhone||'—'}   |   ${coord}   |   ${new Date().toLocaleDateString('ar-EG')}`
      aoa.push(r1, r2)   // صفان فقط بلا فاصل
    }
    aoa.push(colHeaders)
    dataRows.forEach(r => aoa.push(r))
    return aoa
  }

  // ── تطبيق التنسيق (xlsx-js-style) ──────────────────────────
  function styleSheet(ws, colCount, showBnr, campInfo, totalDataRows) {
    const hasBnr    = showBnr && campInfo
    const hdrRow    = hasBnr ? 2 : 0
    const dataStart = hdrRow + 1

    // ── دمج البانر ──
    if (hasBnr) {
      ws['!merges'] = [
        { s:{r:0,c:0}, e:{r:0,c:colCount-1} },  // اسم المخيم
        { s:{r:1,c:0}, e:{r:1,c:colCount-1} },  // بيانات المندوب
      ]
      // صف 1 — اسم المخيم
      const cell0 = ws[XLSX.utils.encode_cell({r:0,c:0})]
      if (cell0) cell0.s = {
        fill: { patternType:'solid', fgColor:{rgb:'0A3060'}, bgColor:{rgb:'0A3060'} },
        font: { bold:true, color:{rgb:'FFD700'}, sz:18, name:'Arial' },
        alignment: { horizontal:'center', vertical:'center', wrapText:false },
        border: { bottom:{ style:'medium', color:{rgb:'1A6AB0'} } }
      }
      // صف 2 — بيانات المندوب
      const cell1 = ws[XLSX.utils.encode_cell({r:1,c:0})]
      if (cell1) cell1.s = {
        fill: { patternType:'solid', fgColor:{rgb:'154580'}, bgColor:{rgb:'154580'} },
        font: { bold:true, color:{rgb:'FFFFFF'}, sz:11, name:'Arial' },
        alignment: { horizontal:'center', vertical:'center', wrapText:false },
        border: { bottom:{ style:'medium', color:{rgb:'0A3060'} } }
      }
      ws['!rows'] = [{ hpt:32 }, { hpt:20 }]
    }

    // ── رواسي الأعمدة ──
    for (let col = 0; col < colCount; col++) {
      const cell = ws[XLSX.utils.encode_cell({r:hdrRow, c:col})]
      if (cell) cell.s = {
        fill: { patternType:'solid', fgColor:{rgb:'1E3A5F'}, bgColor:{rgb:'1E3A5F'} },
        font: { bold:true, color:{rgb:'FFFFFF'}, sz:10, name:'Arial' },
        alignment: { horizontal:'center', vertical:'center', wrapText:false },
        border: {
          top:    { style:'medium', color:{rgb:'0A3060'} },
          bottom: { style:'medium', color:{rgb:'0A3060'} },
          left:   { style:'thin',   color:{rgb:'2A4A7F'} },
          right:  { style:'thin',   color:{rgb:'2A4A7F'} },
        }
      }
    }

    // ── صفوف البيانات: أبيض / رمادي فاتح ──
    for (let row = dataStart; row < dataStart + totalDataRows; row++) {
      const isEven = (row - dataStart) % 2 === 0
      const bgHex  = isEven ? 'FFFFFF' : 'EEF2F7'
      for (let col = 0; col < colCount; col++) {
        const cell = ws[XLSX.utils.encode_cell({r:row, c:col})]
        if (cell) cell.s = {
          fill: { patternType:'solid', fgColor:{rgb:bgHex}, bgColor:{rgb:bgHex} },
          font: { sz:10, name:'Arial' },
          alignment: { horizontal:'center', vertical:'center', wrapText:false },
          border: { bottom:{ style:'thin', color:{rgb:'CCCCCC'} } }
        }
      }
    }

    ws['!cols']   = Array(colCount).fill({ wch:20 })
    ws['!freeze'] = { xSplit:0, ySplit: hdrRow+1 }
    return ws
  }

  // ── تصدير رباب الأسر ─────────────────────────────────
  async function exportFamilies() {
    setLoading(true)
    try {
      const selected = famCols.filter(c=>c.order>0).sort((a,b)=>a.order-b.order)
      if (!selected.length) return showToast('اختر عموداً على الأقل',true)
      const data = await getFullData()
      const campInfo = getCampInfo(filterCamp)
      const rows = data.map(f=>{
        const mems = f.family_members||[]
        const row = {}
        selected.forEach(col=>{
          switch(col.key){
            case 'head_name':        row[col.label]=f.head_name||''; break
            case 'head_id':          row[col.label]=f.head_id||''; break
            case 'phone1':           row[col.label]=f.phone1||''; break
            case 'phone2':           row[col.label]=f.phone2||''; break
            case 'camp':             row[col.label]=f.camps?.name||''; break
            case 'tent':             row[col.label]=f.tent||''; break
            case 'head_dob':         row[col.label]=f.head_dob||''; break
            case 'head_gender':      row[col.label]=f.head_gender||''; break
            case 'head_marital':     row[col.label]=f.head_marital||''; break
            case 'members_count':    row[col.label]=mems.length+1; break
            case 'category_tags':    row[col.label]=(Array.isArray(f.category_tags)?f.category_tags:[]).join(', '); break
            case 'original_address': row[col.label]=f.original_address||''; break
            case 'notes':            row[col.label]=f.notes||''; break
          }
        })
        return row
      })
      // ترتيب حسب رقم الخيمة
      const sortedData = [...data].sort((a,b)=>{
        const tA=a.tent||'ٮ', tB=b.tent||'ٮ'
        return tA.localeCompare(tB,'ar',{numeric:true})
      })
      const sortedRows = sortedData.map(f=>{
        const mems=f.family_members||[]
        const row={}
        selected.forEach(col=>{
          switch(col.key){
            case 'head_name':        row[col.label]=f.head_name||''; break
            case 'head_id':          row[col.label]=f.head_id||''; break
            case 'phone1':           row[col.label]=f.phone1||''; break
            case 'phone2':           row[col.label]=f.phone2||''; break
            case 'camp':             row[col.label]=f.camps?.name||''; break
            case 'tent':             row[col.label]=f.tent||''; break
            case 'head_dob':         row[col.label]=f.head_dob||''; break
            case 'head_gender':      row[col.label]=f.head_gender||''; break
            case 'head_marital':     row[col.label]=f.head_marital||''; break
            case 'members_count':    row[col.label]=mems.length+1; break
            case 'category_tags':    row[col.label]=(Array.isArray(f.category_tags)?f.category_tags:[]).join(', '); break
            case 'original_address': row[col.label]=f.original_address||''; break
            case 'notes':            row[col.label]=f.notes||''; break
          }
        })
        return row
      })
      const colHeaders = selected.map(c=>c.label)
      const dataRows   = sortedRows.map(r=>colHeaders.map(h=>r[h]??''))
      const aoa = buildAoa(showBanner?campInfo:null, colHeaders, dataRows, showBanner)
      const ws  = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = selected.map(()=>({wch:22}))
      styleSheet(ws, selected.length, showBanner, campInfo, dataRows.length)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, campInfo?campInfo.name.substring(0,31):'كل المخيمات')
      const label = campInfo?campInfo.name:'كل_المخيمات'
      XLSX.writeFile(wb, `كشف_الأسر_${label}_${new Date().toLocaleDateString('ar-EG').replace(/\//g,'-')}.xlsx`)
      showToast(`✅ تم تصدير ${data.length} أسرة مرتبة بالخيمة`)
      setExportModal(null)
    } catch(e){showToast('خطأ: '+e.message,true)}
    finally{setLoading(false)}
  }

  // ── تصدير أفراد الأسر ────────────────────────────────
  async function exportMembers() {
    setLoading(true)
    try {
      const selected = memCols.filter(c=>c.order>0).sort((a,b)=>a.order-b.order)
      if (!selected.length) return showToast('اختر عموداً على الأقل', true)
      const data     = await getFullData()
      const campInfo = getCampInfo(filterCamp)

      // ترتيب حسب الخيمة
      const sorted = [...data].sort((a,b)=>
        (a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true})
      )

      // بناء صفوف البيانات
      const dataRows = []
      sorted.forEach(f => {
        const mems = f.family_members||[]
        const all = [
          {name:f.head_name,national_id:f.head_id,relation:'رب الأسرة',dob:f.head_dob,gender:f.head_gender,health:''},
          ...mems
        ]
        all.forEach(m => {
          dataRows.push(selected.map(col => {
            switch(col.key){
              case 'tent':        return f.tent||''
              case 'fam_name':    return f.head_name||''
              case 'head_id':     return f.head_id||''
              case 'phone1':      return f.phone1||''
              case 'camp':        return f.camps?.name||''
              case 'name':        return m.name||''
              case 'national_id': return m.national_id||''
              case 'relation':    return m.relation||''
              case 'dob':         return m.dob||''
              case 'age':         return calcAge(m.dob)??''
              case 'gender':      return m.gender||''
              case 'health':      return m.health||''
              default: return ''
            }
          }))
        })
      })

      const colHeaders = selected.map(c=>c.label)
      const aoa = buildAoa(showBanner?campInfo:null, colHeaders, dataRows, showBanner)
      const ws  = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = selected.map(()=>({wch:22}))
      styleSheet(ws, selected.length, showBanner, campInfo, dataRows.length)
      const wb = XLSX.utils.book_new()
      const sheetName = campInfo ? campInfo.name.substring(0,31) : 'كل المخيمات'
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
      const label = campInfo ? campInfo.name : 'كل_المخيمات'
      XLSX.writeFile(wb, `كشف_الأفراد_${label}_${new Date().toLocaleDateString('ar-EG').replace(/\//g,'-')}.xlsx`)
      showToast(`✅ تم تصدير ${dataRows.length} سجل`)
      setExportModal(null)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false) }
  }

  // ── تصدير الناقصة ────────────────────────────────────
  async function exportMissing() {
    setLoading(true)
    try {
      const data    = await getFullData()
      const missing = data.filter(f=>!f.head_name||!f.head_id||!f.phone1||!f.camp_id)
      if (!missing.length) return showToast('✅ لا توجد بيانات ناقصة')
      const colHeaders = ['#','اسم رب الأسرة','رقم الهوية','رقم الجوال','المخيم','النواقص']
      const dataRows   = missing.map((f,i)=>[
        i+1, f.head_name||'—', f.head_id||'—', f.phone1||'—', f.camps?.name||'—',
        [!f.head_name&&'الاسم',!f.head_id&&'الهوية',!f.phone1&&'الجوال',!f.camp_id&&'المخيم'].filter(Boolean).join(' + ')
      ])
      const campInfo = getCampInfo(filterCamp)
      const aoa = buildAoa(showBanner?campInfo:null, colHeaders, dataRows, showBanner)
      const ws  = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = Array(6).fill({wch:22})
      styleSheet(ws, 6, showBanner, campInfo, dataRows.length)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'الأسر الناقصة')
      XLSX.writeFile(wb, `ناقصة_${new Date().toLocaleDateString('ar-EG').replace(/\//g,'-')}.xlsx`)
      showToast(`✅ ${missing.length} أسرة ناقصة`)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false) }
  }

  // ── استيراد ──────────────────────────────────────────
  async function handleImportFile(e) {
    const file = e.target.files?.[0]; if (!file) return
    setLoading(true)
    try {
      const rows = XLSX.utils.sheet_to_json(
        XLSX.read(await file.arrayBuffer(),{type:'array'}).Sheets[
          XLSX.read(await file.arrayBuffer(),{type:'array'}).SheetNames[0]
        ], {defval:''}
      )
      if (!rows.length) return showToast('الملف فارغ',true)
      const {data:existing} = await supabase.from('families').select('head_id').eq('org_id',ORG_ID)
      const existingIds = new Set((existing||[]).map(f=>f.head_id).filter(Boolean))
      const campMap = Object.fromEntries(camps.map(c=>[c.name.trim(),c.id]))
      const preview = rows.filter(r=>r['اسم رب الأسرة*']||r['اسم رب الأسرة']).map(r=>{
        const headId = String(r['رقم الهوية*']||r['رقم الهوية']||'').trim()
        const campName = String(r['اسم المخيم*']||r['المخيم']||'').trim()
        return {
          head_name: String(r['اسم رب الأسرة*']||r['اسم رب الأسرة']||'').trim(),
          head_id: headId, phone1: String(r['رقم الجوال*']||r['رقم الجوال']||'').trim(),
          phone2: String(r['جوال بديل']||'').trim()||null,
          head_gender: String(r['الجنس']||'ذكر').trim(),
          head_marital: String(r['الحالة الاجتماعية']||'').trim()||null,
          head_dob: String(r['تاريخ الميلاد']||'').trim()||null,
          camp_id: campMap[campName]||null, campName,
          tent: String(r['الخيمة']||'').trim()||null,
          original_address: String(r['المنطقة الأصلية']||'').trim()||null,
          notes: String(r['ملاحظات']||'').trim()||null,
          dup: existingIds.has(headId),
          valid: !!(r['اسم رب الأسرة*']||r['اسم رب الأسرة'])&&!!headId,
        }
      })
      setImportPreview(preview)
    } catch(e){showToast('خطأ: '+e.message,true)}
    finally{setLoading(false); if(importRef.current) importRef.current.value=''}
  }

  async function confirmImport() {
    if (!importPreview) return
    setImporting(true); let ok=0,skip=0,err=0
    try {
      for (const row of importPreview.filter(r=>r.valid&&!r.dup)) {
        const fam = {id:crypto.randomUUID(),org_id:ORG_ID,...row,
          category_tags:[],created_at:new Date().toISOString(),updated_at:new Date().toISOString()}
        delete fam.dup; delete fam.valid; delete fam.campName
        const {error} = await supabase.from('families').insert(fam)
        if (error) err++; else ok++
      }
      skip = importPreview.filter(r=>r.dup).length
      showToast(`✅ ${ok} استُورد | ${skip} مكرر${err?` | ${err} خطأ`:''}`)
      setImportPreview(null)
    } catch(e){showToast('خطأ: '+e.message,true)}
    finally{setImporting(false)}
  }

  async function downloadTemplate() {
    const headers = ['اسم رب الأسرة*','رقم الهوية*','رقم الجوال*','جوال بديل','الجنس','الحالة الاجتماعية','تاريخ الميلاد','اسم المخيم*','الخيمة','المنطقة الأصلية','ملاحظات']
    const example = ['محمد أحمد علي','123456789','0599000000','','ذكر','متزوج','1980-01-15',camps[0]?.name||'مخيم السلام','A1','غزة','']
    const ws = XLSX.utils.aoa_to_sheet([headers,example])
    ws['!cols'] = headers.map(()=>({wch:22}))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb,ws,'قالب الاستيراد')
    XLSX.writeFile(wb,'قالب_استيراد_الأسر.xlsx')
    showToast('✅ تم تحميل القالب')
  }

  const SEL = "w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent"

  return (
    <div>
      <PageHeader icon="💾" title="استيراد وتصدير"
        subtitle={!navigator.onLine ? <span className="text-accent text-xs">📴 وضع أوف لاين — البيانات من الذاكرة المحلية</span> : null}
      />

      {/* فلتر المخيم */}
      <select value={filterCamp} onChange={e=>setFilterCamp(e.target.value)} className={SEL+' mb-3'}>
        <option value="">🏕️ كل المخيمات</option>
        {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {/* خيار إظهار البانر */}
      <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
        <div onClick={()=>setShowBanner(v=>!v)}
          className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${showBanner?'bg-accent':'bg-surface2 border border-border'}`}>
          <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${showBanner?'translate-x-4':''}`}/>
        </div>
        <span className="text-white text-xs font-bold">إظهار بانر المخيم في الكشف</span>
        <span className="text-muted text-[10px]">(اسم المخيم + مندوب + إحداثيات)</span>
      </label>

      {/* ═══ تصدير ═══ */}
      <Card title="📥 تصدير Excel" icon="">
        {canExp ? (
          <div className="flex flex-col gap-2">
            <p className="text-muted text-xs mb-1">
              {filterCamp ? `مخيم: ${camps.find(c=>c.id===filterCamp)?.name}` : 'كل المخيمات'}
            </p>
            <button onClick={()=>setExportModal('fam')} disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-black text-bg bg-accent">
              👨‍👩‍👧 كشف رباب الأسر
            </button>
            <button onClick={()=>setExportModal('mem')} disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-bold border border-blue/40 text-blue"
              style={{background:'rgba(59,130,246,0.08)'}}>
              👤 كشف أفراد الأسر
            </button>
            <button onClick={exportMissing} disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-bold border border-red/40 text-red"
              style={{background:'rgba(239,68,68,0.08)'}}>
              ⚠️ الأسر الناقصة
            </button>
          </div>
        ) : <p className="text-red text-xs text-center py-3">🔒 لا تملك صلاحية التصدير</p>}
      </Card>

      {/* ═══ تصدير مخصص ═══ */}
      {canExp && allFamilies.length > 0 && (
        <Card title={`🎯 تصدير مخصص (${allFamilies.length} أسرة)`} icon="">
          <CustomExport
            families={allFamilies}
            members={allMembers}
            camps={camps}
            orgMembers={orgMembers}
          />
        </Card>
      )}
      {canExp && allFamilies.length === 0 && (
        <Card title="🎯 تصدير مخصص" icon="">
          <p className="text-muted text-xs text-center py-3">⏳ جاري تحميل الأسر...</p>
        </Card>
      )}

      {/* ═══ استيراد ═══ */}
      <Card title="📤 استيراد Excel" icon="">
        {canImp ? (
          <div className="flex flex-col gap-2">
            <p className="text-muted text-xs mb-1">استيراد أسر من ملف Excel</p>
            <button onClick={downloadTemplate}
              className="w-full py-2.5 rounded-xl text-sm font-bold border border-accent/40 text-accent"
              style={{background:'rgba(245,158,11,0.08)'}}>
              📋 تحميل قالب الاستيراد
            </button>
            <button onClick={()=>importRef.current?.click()} disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-black text-bg bg-accent">
              📂 اختيار ملف Excel
            </button>
            <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFile}/>

            {importPreview && (
              <div className="mt-2">
                <div className="flex gap-3 text-xs mb-3 flex-wrap">
                  <span className="text-white font-bold">{importPreview.length} سجل</span>
                  <span className="text-green">✅ {importPreview.filter(r=>r.valid&&!r.dup).length} جديد</span>
                  <span className="text-accent">🔁 {importPreview.filter(r=>r.dup).length} مكرر</span>
                  <span className="text-red">❌ {importPreview.filter(r=>!r.valid).length} ناقص</span>
                </div>
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto mb-3">
                  {importPreview.map((r,i)=>(
                    <div key={i} className="text-[11px] px-3 py-1.5 rounded-lg flex justify-between"
                      style={{background:r.dup?'rgba(245,158,11,0.1)':r.valid?'rgba(16,185,129,0.1)':'rgba(239,68,68,0.1)'}}>
                      <span className="text-white">{r.head_name}</span>
                      <span>{r.dup?'🔁':r.valid?'✅':'❌'}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={confirmImport} disabled={importing}
                    className="flex-1 py-2.5 rounded-xl text-sm font-black text-bg bg-accent">
                    {importing?'⏳ جاري الاستيراد...':'✅ تأكيد الاستيراد'}
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

      {loading && (
        <div className="flex items-center justify-center gap-2 py-2 mb-2 bg-accent/10 rounded-xl">
          <Spinner size="sm"/>
          <span className="text-accent text-xs font-bold">جاري التصدير...</span>
        </div>
      )}

      {/* Modal اختيار الأعمدة */}
      <Modal open={!!exportModal} onClose={()=>setExportModal(null)}
        title={exportModal==='mem'?'📊 كشف أفراد الأسر':'📊 كشف رباب الأسر'}>
        <div className="flex flex-col gap-3">
          {(()=>{
            const isMem = exportModal==='mem'
            const cols = isMem?memCols:famCols
            const setCols = isMem?setMemCols:setFamCols
            const DEF = isMem?MEM_COLS:FAM_COLS
            return (<>
              <div className="flex gap-2">
                <button onClick={()=>setCols(cols.map((c,i)=>({...c,order:i+1})))}
                  className="text-[11px] px-3 py-1.5 rounded-lg border border-border text-muted">تحديد الكل</button>
                <button onClick={()=>setCols(DEF.map(c=>({...c,order:0})))}
                  className="text-[11px] px-3 py-1.5 rounded-lg border border-border text-muted">إلغاء الكل</button>
              </div>
              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                {cols.map((col,i)=>(
                  <div key={col.key} className="flex items-center gap-2 bg-surface2 border border-border rounded-xl px-3 py-2">
                    <input type="number" min="0" max="20" value={col.order||''} placeholder="—"
                      onChange={e=>{
                        const v=parseInt(e.target.value)||0
                        setCols(prev=>prev.map((c,j)=>j===i?{...c,order:v}:c))
                      }}
                      className="w-12 bg-surface border border-border rounded-lg text-accent font-black text-center text-sm focus:outline-none py-1"/>
                    <span className="text-white text-xs flex-1">{col.label}</span>
                  </div>
                ))}
              </div>
              <button onClick={isMem?exportMembers:exportFamilies} disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-black text-bg bg-accent">
                {loading?'⏳ جاري التصدير...':'📥 تصدير Excel'}
              </button>
            </>)
          })()}
        </div>
      </Modal>
    </div>
  )
}
