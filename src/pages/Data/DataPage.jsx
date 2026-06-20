import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, ORG_ID } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import Modal from '../../components/ui/Modal'

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

const TABLES = [
  { key: 'families',           label: 'الأسر',               icon: '👨‍👩‍👧' },
  { key: 'family_members',     label: 'أفراد الأسر',          icon: '👤' },
  { key: 'camps',              label: 'المخيمات',             icon: '🏕️' },
  { key: 'org_members',        label: 'المستخدمون',           icon: '👥' },
  { key: 'family_movements',   label: 'الحركات',              icon: '🔄' },
  { key: 'dist_rounds',        label: 'جولات التوزيع',        icon: '📦' },
  { key: 'camp_distributions', label: 'دفعات التوزيع',        icon: '📋' },
  { key: 'camp_dist_families', label: 'استلام التوزيعات',     icon: '✅' },
]

const FAM_COLS = [
  { key:'head_name',        label:'اسم رب الأسرة',      def:true  },
  { key:'head_id',          label:'رقم الهوية',          def:true  },
  { key:'phone1',           label:'رقم الجوال',          def:true  },
  { key:'phone2',           label:'جوال بديل',           def:false },
  { key:'camp',             label:'المخيم',              def:true  },
  { key:'tent',             label:'رقم الخيمة',          def:false },
  { key:'head_dob',         label:'تاريخ الميلاد',       def:false },
  { key:'head_gender',      label:'الجنس',               def:false },
  { key:'head_marital',     label:'الحالة الاجتماعية',   def:true  },
  { key:'members_count',    label:'عدد الأفراد',         def:true  },
  { key:'category_tags',    label:'الفئة الاجتماعية',    def:false },
  { key:'original_address', label:'عنوان السكن الأصلي',  def:false },
  { key:'notes',            label:'ملاحظات',             def:false },
]

const MEM_COLS = [
  { key:'fam_name',    label:'اسم رب الأسرة',    def:true  },
  { key:'head_id',     label:'هوية رب الأسرة',   def:true  },
  { key:'phone1',      label:'رقم الجوال',        def:true  },
  { key:'camp',        label:'المخيم',             def:true  },
  { key:'name',        label:'اسم الفرد',          def:true  },
  { key:'national_id', label:'رقم الهوية',         def:true  },
  { key:'relation',    label:'صلة القرابة',        def:true  },
  { key:'dob',         label:'تاريخ الميلاد',      def:false },
  { key:'age',         label:'العمر',              def:true  },
  { key:'gender',      label:'الجنس',              def:false },
  { key:'health',      label:'الحالة الصحية',      def:false },
]

function calcAge(dob) {
  if (!dob) return null
  const b = new Date(dob), t = new Date()
  let a = t.getFullYear() - b.getFullYear()
  if (t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate())) a--
  return a>=0&&a<120 ? a : null
}

export default function DataPage() {
  const { profile, isOwner, isSuperAdmin, canExport, canImport } = useAuth()
  const { showToast, online } = useApp()

  const [loading,       setLoading]       = useState(false)
  const [monitor,       setMonitor]       = useState(null)
  const [monLoading,    setMonLoading]    = useState(false)
  const [stats,         setStats]         = useState({})
  const [camps,         setCamps]         = useState([])
  const [filterCamp,    setFilterCamp]    = useState('')
  const [exportModal,   setExportModal]   = useState(false)
  const [famCols,       setFamCols]       = useState(() => FAM_COLS.map((c,i)=>({...c,order:c.def?i+1:0})))
  const [memCols,       setMemCols]       = useState(() => MEM_COLS.map((c,i)=>({...c,order:c.def?i+1:0})))
  const [importPreview, setImportPreview] = useState(null)
  const [importing,     setImporting]     = useState(false)
  const [activeTab,     setActiveTab]     = useState('stats')
  const [orgMembers,    setOrgMembers]    = useState([])
  const importRef  = useRef()
  const restoreRef = useRef()

  const isAdmin = isOwner || isSuperAdmin
  const canExp  = canExport || isAdmin
  const canImp  = canImport || isAdmin

  // ── تحميل الإحصائيات من Supabase مباشرة ────────────
  // الجداول التي لها org_id مباشرة
  const TABLES_WITH_ORG = ['families','camps','org_members','family_movements','dist_rounds','camp_distributions']

  const loadStats = useCallback(async () => {
    try {
      const results = {}
      await Promise.all(TABLES.map(async ({ key }) => {
        try {
          let q = supabase.from(key).select('*', { count: 'exact', head: true })
          if (TABLES_WITH_ORG.includes(key)) q = q.eq('org_id', ORG_ID)
          const { count } = await q
          results[key] = count ?? 0
        } catch { results[key] = '—' }
      }))
      setStats(results)
      const [{ data: campsData }, { data: membersData }] = await Promise.all([
        supabase.from('camps').select('id,name,latitude,longitude,address,manager_id').eq('org_id',ORG_ID),
        supabase.from('org_members').select('user_id,full_name,phone,camp_id,role').eq('org_id',ORG_ID),
      ])
      if (campsData) setCamps(campsData)
      if (membersData) setOrgMembers(membersData)
    } catch (e) { console.warn('[data] فشل تحميل إحصائيات المخيمات/المستخدمين:', e.message) }
  }, [])

  useEffect(() => {
    loadStats()
  }, [])

  const loadMonitor = useCallback(async () => {
    setMonLoading(true)
    const safe = async (fn) => { try { return await fn() } catch(e) { console.warn('[monitor]', e.message); return {} } }

    // جلب كل البيانات بشكل مستقل
    const [dbRes, infraRes, authRes, famRes, memRes, campRes, movRes, distRes, cdfRes] =
      await Promise.all([
        safe(() => supabase.rpc('get_db_stats')),           // حجم DB — يعمل دائماً
        safe(() => supabase.rpc('get_infra_stats')),         // بنية تحتية — تحتاج SQL function
        safe(() => supabase.from('org_members').select('*',{count:'exact',head:true}).eq('org_id',ORG_ID)),
        safe(() => supabase.from('families').select('*',{count:'exact',head:true}).eq('org_id',ORG_ID)),
        safe(() => supabase.from('family_members').select('*',{count:'exact',head:true})),
        safe(() => supabase.from('camps').select('*',{count:'exact',head:true}).eq('org_id',ORG_ID)),
        safe(() => supabase.from('family_movements').select('*',{count:'exact',head:true}).eq('org_id',ORG_ID)),
        safe(() => supabase.from('dist_rounds').select('*',{count:'exact',head:true}).eq('org_id',ORG_ID)),
        safe(() => supabase.from('camp_dist_families').select('*',{count:'exact',head:true})),
      ])

    // DB size: من get_db_stats أولاً، ثم get_infra_stats كـ fallback
    const dbMB   = Number(dbRes?.data?.db_size_mb || infraRes?.data?.db_size_mb || 0)
    const infra  = infraRes?.data || null
    const totalRows = (famRes?.count||0)+(memRes?.count||0)+(campRes?.count||0)+
                      (movRes?.count||0)+(distRes?.count||0)+(cdfRes?.count||0)

    setMonitor({
      // أساسيات — تعمل دائماً
      dbMB, dbPct: Math.round(dbMB/500*100),
      authUsers:   authRes?.count ?? stats?.org_members ?? 0,
      authPct:     Math.round((authRes?.count ?? stats?.org_members ?? 0)/50000*100),
      totalRows,
      famCount:    famRes?.count||0,
      memCount:    memRes?.count||0,
      campCount:   campRes?.count||0,
      lastChecked: new Date().toLocaleTimeString('ar'),
      // بنية تحتية — تحتاج get_infra_stats()
      hasInfra:    !!infra,
      connTotal:   Number(infra?.conn_total||0),
      connActive:  Number(infra?.conn_active||0),
      connIdle:    Number(infra?.conn_idle||0),
      connMax:     Number(infra?.conn_max||60),
      connPct:     infra ? Math.round(Number(infra.conn_total||0)/Number(infra.conn_max||60)*100) : 0,
      cacheHit:    Number(infra?.cache_hit_ratio||0),
      tables:      infra?.tables||[],
    })
    setMonLoading(false)
  }, [])

  const handleRefresh = useCallback(async () => {
    await loadStats()
  }, [loadStats])

  // ── جلب البيانات للتصدير (من Supabase مباشرة) ───────
  async function getFullData() {
    let query = supabase.from('families').select(`
      *,
      camps!camp_id(id, name, latitude, longitude, address, manager_id),
      family_members(*)
    `).eq('org_id', ORG_ID)
    if (filterCamp) query = query.eq('camp_id', filterCamp)
    const { data, error } = await query
    if (error) throw error
    return data || []
  }

  // معلومات المخيم المحدد (اسم + مندوب + إحداثيات)
  function getCampInfo(campId) {
    if (!campId) return null
    const camp = camps.find(c => c.id === campId)
    if (!camp) return null
    // البحث عن المندوب: role=camp_delegate و camp_id = campId
    const delegate = orgMembers.find(m =>
      m.camp_id === campId && m.role === 'camp_delegate'
    ) || orgMembers.find(m => m.user_id === camp.manager_id)
    return {
      name: camp.name,
      lat: camp.latitude,
      lng: camp.longitude,
      address: camp.address,
      delegateName: delegate?.full_name || '',
      delegatePhone: delegate?.phone || '',
    }
  }

  // ── تصدير Excel ─────────────────────────────────────
  async function exportFamilies() {
    setLoading(true)
    try {
      const selected = famCols.filter(c=>c.order>0).sort((a,b)=>a.order-b.order)
      if (!selected.length) return showToast('اختر عموداً على الأقل', true)

      const data = await getFullData()
      const rows = data.map(f => {
        const mems = f.family_members || []
        const row = {}
        selected.forEach(col => {
          switch(col.key) {
            case 'head_name':        row[col.label] = f.head_name||''; break
            case 'head_id':          row[col.label] = f.head_id||''; break
            case 'phone1':           row[col.label] = f.phone1||''; break
            case 'phone2':           row[col.label] = f.phone2||''; break
            case 'camp':             row[col.label] = f.camps?.name||''; break
            case 'tent':             row[col.label] = f.tent||''; break
            case 'head_dob':         row[col.label] = f.head_dob||''; break
            case 'head_gender':      row[col.label] = f.head_gender||''; break
            case 'head_marital':     row[col.label] = f.head_marital||''; break
            case 'members_count':    row[col.label] = mems.length + 1; break
            case 'category_tags':    row[col.label] = (Array.isArray(f.category_tags)?f.category_tags:[]).join(', '); break
            case 'original_address': row[col.label] = f.original_address||''; break
            case 'notes':            row[col.label] = f.notes||''; break
          }
        })
        return row
      })

      const XLSX   = await getXLSX()
      const campInfo = getCampInfo(filterCamp)
      const colCount = selected.length

      // ── بناء الكشف بـ aoa (رأسية + بيانات) ──────────
      const aoa = []
      if (campInfo) {
        // صف 1: اسم المخيم | اسم المندوب | جوال المندوب
        aoa.push([`كشف أسر مخيم: ${campInfo.name}`, campInfo.delegateName, campInfo.delegatePhone])
        // صف 2: الإحداثيات والعنوان
        const coord = (campInfo.lat && campInfo.lng)
          ? `${campInfo.lat}, ${campInfo.lng}`
          : (campInfo.address || '—')
        aoa.push([`الإحداثيات: ${coord}`, `التاريخ: ${new Date().toLocaleDateString('ar-EG')}`, ''])
        aoa.push([])   // صف فاصل
      }
      // صف رواسي الأعمدة
      aoa.push(selected.map(col => col.label))
      // صفوف البيانات
      rows.forEach(r => aoa.push(selected.map(col => r[col.label] ?? '')))

      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = selected.map(()=>({wch:22}))

      const colHdrRow = campInfo ? 3 : 0   // رقم صف رواسي الأعمدة (0-indexed)

      // تنسيق صف اسم المخيم
      if (campInfo) {
        const addr0 = XLSX.utils.encode_cell({r:0,c:0})
        if (ws[addr0]) ws[addr0].s = {
          fill:{fgColor:{rgb:'0D4A8C'}},
          font:{bold:true,color:{rgb:'FFFFFF'},sz:13},
          alignment:{horizontal:'right'}
        }
      }
      // تنسيق رواسي الأعمدة
      for (let col = 0; col < colCount; col++) {
        const addr = XLSX.utils.encode_cell({r: colHdrRow, c: col})
        if (ws[addr]) ws[addr].s = {
          fill:{fgColor:{rgb:'1E3A5F'}},
          font:{bold:true,color:{rgb:'FFFFFF'}},
          alignment:{horizontal:'center'},
          border:{bottom:{style:'thin',color:{rgb:'999999'}}}
        }
      }
      if (!ws['!freeze']) ws['!freeze'] = {xSplit:0,ySplit:colHdrRow+1}

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, campInfo ? campInfo.name.substring(0,31) : 'كل المخيمات')
      const campLabel = campInfo ? campInfo.name : 'كل_المخيمات'
      const dateStr   = new Date().toLocaleDateString('ar-EG').replace(/\//g,'-')
      XLSX.writeFile(wb, `كشف_الأسر_${campLabel}_${dateStr}.xlsx`)
      showToast(`✅ تم تصدير ${data.length} أسرة`)
      setExportModal(null)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false) }
  }

  // ── تصدير أفراد الأسر ─────────────────────────────
  async function exportMembers() {
    setLoading(true)
    try {
      const selected = memCols.filter(c=>c.order>0).sort((a,b)=>a.order-b.order)
      if (!selected.length) return showToast('اختر عموداً على الأقل', true)
      const data = await getFullData()
      const campMap = Object.fromEntries(camps.map(c=>[c.id,c.name]))
      const rows = []
      data.forEach(f => {
        const mems = f.family_members || []
        const allPersons = [
          { _head:true, name:f.head_name, national_id:f.head_id, dob:f.head_dob, gender:f.head_gender, relation:'رب الأسرة', health:'' },
          ...mems
        ]
        allPersons.forEach(m => {
          const row = {}
          selected.forEach(col => {
            switch(col.key) {
              case 'fam_name':    row[col.label] = f.head_name||''; break
              case 'head_id':     row[col.label] = f.head_id||''; break
              case 'phone1':      row[col.label] = f.phone1||''; break
              case 'camp':        row[col.label] = f.camps?.name||campMap[f.camp_id]||''; break
              case 'name':        row[col.label] = m.name||''; break
              case 'national_id': row[col.label] = m.national_id||''; break
              case 'relation':    row[col.label] = m.relation||''; break
              case 'dob':         row[col.label] = m.dob||''; break
              case 'age':         row[col.label] = calcAge(m.dob)??''; break
              case 'gender':      row[col.label] = m.gender||''; break
              case 'health':      row[col.label] = m.health||''; break
            }
          })
          rows.push(row)
        })
      })
      const XLSX = await getXLSX()
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = selected.map(()=>({wch:20}))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'الأفراد')
      const campLabel = filterCamp ? camps.find(c=>c.id===filterCamp)?.name||'' : 'كل_المخيمات'
      XLSX.writeFile(wb, `كشف_الأفراد_${campLabel}_${new Date().toLocaleDateString('ar-EG').replace(/\//g,'-')}.xlsx`)
      showToast(`✅ تم تصدير ${rows.length} فرد`)
      setExportModal(false)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false) }
  }

  // ── تصدير الأسر الناقصة ─────────────────────────────
  async function exportMissing() {
    setLoading(true)
    try {
      const data = await getFullData()
      const XLSX = await getXLSX()
      const missing = data.filter(f => !f.head_name||!f.head_id||!f.phone1||!f.camp_id)
      const rows = missing.map((f,i) => ({
        '#': i+1,
        'اسم رب الأسرة': f.head_name||'—',
        'رقم الهوية': f.head_id||'—',
        'رقم الجوال': f.phone1||'—',
        'المخيم': f.camps?.name||'—',
        'النواقص': [
          !f.head_name&&'الاسم', !f.head_id&&'الهوية',
          !f.phone1&&'الجوال', !f.camp_id&&'المخيم'
        ].filter(Boolean).join(' + ')
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = Array(6).fill({wch:20})
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'الناقصة')
      XLSX.writeFile(wb, `ناقصة_${new Date().toLocaleDateString('ar-EG').replace(/\//g,'-')}.xlsx`)
      showToast(`✅ ${missing.length} أسرة ناقصة`)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false) }
  }

  // ── نسخة احتياطية كاملة من Supabase ────────────────
  async function createBackup() {
    setLoading(true)
    try {
      const [
        { data: fams },
        { data: mems },
        { data: campsD },
        { data: rounds },
        { data: distFams },
        { data: dists },
      ] = await Promise.all([
        supabase.from('families').select('*').eq('org_id', ORG_ID),
        supabase.from('family_members').select('*'),
        supabase.from('camps').select('*').eq('org_id', ORG_ID),
        supabase.from('dist_rounds').select('*').eq('org_id', ORG_ID),
        supabase.from('camp_dist_families').select('*'),
        supabase.from('camp_distributions').select('*').eq('org_id', ORG_ID),
      ])

      const backup = {
        version: 2,
        org_id: ORG_ID,
        created_at: new Date().toISOString(),
        created_by: profile?.full_name,
        source: 'supabase',
        counts: {
          families: fams?.length||0,
          family_members: mems?.length||0,
          camps: campsD?.length||0,
        },
        data: { families:fams, family_members:mems, camps:campsD, dist_rounds:rounds, camp_dist_families:distFams, camp_distributions:dists }
      }

      const blob = new Blob([JSON.stringify(backup,null,2)],{type:'application/json'})
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href=url; a.download=`backup_supabase_${new Date().toLocaleDateString('ar-EG').replace(/\//g,'-')}.json`; a.click()
      URL.revokeObjectURL(url)
      showToast(`✅ نسخة احتياطية كاملة: ${fams?.length||0} أسرة`)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false) }
  }

  // ── استعادة نسخة احتياطية → Supabase ────────────────
  async function handleRestoreFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!window.confirm('⚠️ سيتم رفع البيانات لـ Supabase. هل أنت متأكد؟')) return
    setLoading(true)
    try {
      const backup = JSON.parse(await file.text())
      if (!backup.data) return showToast('ملف غير صالح', true)
      let ok = 0

      if (backup.data.families?.length) {
        const { error } = await supabase.from('families').upsert(backup.data.families)
        if (!error) ok += backup.data.families.length
      }
      if (backup.data.family_members?.length) {
        await supabase.from('family_members').upsert(backup.data.family_members)
      }
      showToast(`✅ استُعيدت ${ok} أسرة في Supabase`)
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false); if(restoreRef.current) restoreRef.current.value='' }
  }

  // ── استيراد Excel ────────────────────────────────────
  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const XLSX = await getXLSX()
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, {type:'array'})
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, {defval:''})
      if (!rows.length) return showToast('الملف فارغ', true)

      const { data: existing } = await supabase.from('families').select('head_id').eq('org_id', ORG_ID)
      const existingIds = new Set((existing||[]).map(f=>f.head_id).filter(Boolean))
      const campNameMap = Object.fromEntries(camps.map(c=>[c.name.trim(), c.id]))

      const preview = rows
        .filter(r => r['اسم رب الأسرة*']||r['اسم رب الأسرة'])
        .map(r => {
          const headId   = String(r['رقم الهوية*']||r['رقم الهوية']||'').trim()
          const campName = String(r['اسم المخيم*']||r['المخيم']||'').trim()
          return {
            head_name:    String(r['اسم رب الأسرة*']||r['اسم رب الأسرة']||'').trim(),
            head_id:      headId,
            phone1:       String(r['رقم الجوال*']||r['رقم الجوال']||'').trim(),
            phone2:       String(r['جوال بديل']||'').trim()||null,
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
      const toImport = importPreview.filter(r=>r.valid&&!r.dup)
      for (const row of toImport) {
        const fam = {
          id: crypto.randomUUID(), org_id: ORG_ID, ...row,
          category_tags: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        delete fam.dup; delete fam.valid; delete fam.campName
        const { error } = await supabase.from('families').insert(fam)
        if (error) err++; else ok++
      }
      skip = importPreview.filter(r=>r.dup).length
      showToast(`✅ ${ok} استُورد | ${skip} مكرر${err?` | ${err} خطأ`:''}`)
      setImportPreview(null)
      loadStats()
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setImporting(false) }
  }

  // ── حذف كل البيانات ─────────────────────────────────
  async function clearAllData() {
    if (!isOwner) { showToast('⛔ حذف كل البيانات لمالك المنصة فقط', true); return }
    if (!window.confirm('⚠️⚠️ حذف كل بيانات المنظمة نهائياً؟\nهذا الإجراء لا يمكن التراجع عنه!')) return
    if (!window.confirm('تأكيد أخير — هل أنت متأكد 100%؟')) return
    setLoading(true)
    try {
      await supabase.from('camp_dist_families').delete().neq('id','00000000-0000-0000-0000-000000000000')
      await supabase.from('family_members').delete().neq('id','00000000-0000-0000-0000-000000000000')
      await supabase.from('family_movements').delete().eq('org_id',ORG_ID)
      await supabase.from('families').delete().eq('org_id',ORG_ID)
      showToast('✅ تم حذف جميع البيانات')
      loadStats()
    } catch(e) { showToast('خطأ: '+e.message, true) }
    finally { setLoading(false) }
  }

  const SEL = "w-full bg-surface2 border border-border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent"


  if (!isAdmin) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <div className="text-4xl">🔒</div>
      <p className="text-muted text-sm">هذه الصفحة لمالك المنصة فقط</p>
    </div>
  )

  return (
    <div>
      <PageHeader icon="🗄️" title="إدارة البيانات" subtitle="مالك المنصة" />

      {/* ═══ تبويبات ═══ */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {[
          {id:'stats',   label:'📊 الإحصائيات'},
          {id:'monitor', label:'🔭 المراقبة'},
          {id:'backup',  label:'💾 نسخ احتياطية'},
          {id:'danger',  label:'⚠️ خطر'},
        ].map(t => (
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab===t.id
                ? 'bg-accent text-bg'
                : 'bg-surface2 text-muted border border-border'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ إحصائيات ═══ */}
      {activeTab==='stats' && (
        <div className="flex flex-col gap-3">
          {/* حالة الاتصال */}
          <Card title="🔄 حالة الاتصال" icon="">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">الإنترنت</span>
                <span className={online?'text-green':'text-red'}>{online?'🟢 متصل':'🔴 غير متصل'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">قاعدة البيانات</span>
                <span className="text-blue text-xs">Supabase (مباشر)</span>
              </div>
            </div>
            <button onClick={handleRefresh}
              className="w-full mt-3 py-2 rounded-xl text-xs font-bold border border-border text-muted active:scale-95 transition-transform">
              🔄 تحديث الإحصائيات
            </button>
          </Card>

          {/* إحصائيات Supabase */}
          <Card title="📊 إحصائيات Supabase (مصدر الحقيقة)" icon="">
            <div className="flex flex-col gap-2">
              {TABLES.map(t => (
                <div key={t.key} className="flex justify-between items-center py-1.5 border-b border-border/30 last:border-0">
                  <span className="text-muted text-xs">{t.icon} {t.label}</span>
                  <span className={`font-black text-sm ${stats[t.key]===undefined?'text-muted':'text-white'}`}>
                    {stats[t.key]??'…'}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* إحصائيات PowerSync محلياً */}

        </div>
      )}



      {/* ═══ نسخ احتياطية ═══ */}
      {activeTab==='backup' && (
        <div className="flex flex-col gap-3">
          <Card title="💾 نسخة احتياطية من Supabase" icon="">
            <div className="flex flex-col gap-2">
              <p className="text-muted text-xs">
                يُصدّر كل البيانات من Supabase بصيغة JSON — مصدر الحقيقة الكاملة
              </p>
              <button onClick={createBackup} disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-black text-bg bg-accent">
                {loading ? '⏳ جاري الإنشاء...' : '💾 إنشاء نسخة احتياطية'}
              </button>
            </div>
          </Card>

          <Card title="📂 استعادة نسخة احتياطية → Supabase" icon="">
            <div className="flex flex-col gap-2">
              <p className="text-muted text-xs">
                ⚠️ يرفع البيانات مباشرة لـ Supabase — سيُدمج مع البيانات الموجودة
              </p>
              <button onClick={()=>restoreRef.current?.click()} disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-bold border border-accent/40 text-accent"
                style={{background:'rgba(245,158,11,0.08)'}}>
                📂 اختيار ملف النسخة الاحتياطية
              </button>
              <input ref={restoreRef} type="file" accept=".json" className="hidden" onChange={handleRestoreFile}/>
            </div>
          </Card>
        </div>
      )}

      {/* ═══ المراقبة ═══ */}
      {activeTab==='monitor' && (
        <div className="flex flex-col gap-3">
          {/* حدود Supabase المجانية */}
          <div className="bg-surface border border-border rounded-xl p-3">
            <p className="text-accent text-xs font-black mb-2">🆓 حدود الخطة المجانية</p>
            <div className="flex flex-col gap-1.5 text-xs text-muted">
              <div className="flex justify-between"><span>💾 قاعدة البيانات</span><span className="text-white font-bold">500 MB</span></div>
              <div className="flex justify-between"><span>👥 مستخدمين/شهر</span><span className="text-white font-bold">50,000</span></div>
              <div className="flex justify-between"><span>🌐 نقل بيانات</span><span className="text-white font-bold">5 GB/شهر</span></div>
              <div className="flex justify-between"><span>📁 تخزين ملفات</span><span className="text-white font-bold">1 GB</span></div>
              <div className="flex justify-between"><span>🏗️ مشاريع نشطة</span><span className="text-white font-bold">2 مشاريع</span></div>
              <div className="flex justify-between"><span>⏸️ إيقاف تلقائي</span><span className="text-red font-bold">7 أيام بلا نشاط</span></div>
            </div>
          </div>

          {/* موارد البنية التحتية */}
          {monitor?.hasInfra && (
            <div className="bg-surface border border-border rounded-xl p-3">
              <p className="text-accent text-xs font-black mb-3">⚙️ موارد قاعدة البيانات</p>
              {[
                {label:'💾 حجم DB',    v:monitor.dbMB,     max:500,           unit:'MB', pct:monitor.dbPct,   rev:false},
                {label:'🔌 الاتصالات', v:monitor.connTotal,max:monitor.connMax,unit:'',   pct:monitor.connPct, rev:false},
                {label:'⚡ Cache Hit', v:monitor.cacheHit, max:100,           unit:'%',  pct:monitor.cacheHit,rev:true},
              ].map(({label,v,max,unit,pct,rev})=>{
                const col = rev?(pct>=90?'#10B981':pct>=60?'#F59E0B':'#EF4444'):(pct>=90?'#EF4444':pct>=70?'#F59E0B':'#10B981')
                return (
                  <div key={label} className="mb-2">
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-muted">{label}</span>
                      <span className="font-black" style={{color:col}}>{v}{unit}/{max}{unit} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-surface2 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{width:`${Math.min(100,pct)}%`,background:col}}/>
                    </div>
                  </div>
                )
              })}
              <div className="grid grid-cols-3 gap-1 mt-2 pt-2 border-t border-border/30 text-center text-[11px]">
                <div><span className="text-green font-black block">{monitor.connActive}</span><span className="text-muted">نشط</span></div>
                <div><span className="text-muted font-black block">{monitor.connIdle}</span><span className="text-muted">خامل</span></div>
                <div><span className="text-white font-black block">{monitor.connTotal}</span><span className="text-muted">الكل</span></div>
              </div>
            </div>
          )}
          {monitor && !monitor.hasInfra && (
            <div className="text-center py-2">
              <p className="text-muted text-[10px]">⚠️ لعرض موارد الاتصالات شغّل SQL Function في Supabase</p>
            </div>
          )}

          {/* الاستخدام الحالي */}
          <div className="bg-surface border border-border rounded-xl p-3">
            <div className="flex justify-between items-center mb-3">
              <p className="text-accent text-xs font-black">📊 استخدامك الحالي</p>
              {monitor && <span className="text-muted text-[10px]">آخر فحص: {monitor.lastChecked}</span>}
            </div>

            {monLoading ? (
              <div className="flex justify-center py-4 text-muted text-xs">جاري الفحص...</div>
            ) : monitor ? (
              <div className="flex flex-col gap-3">
                {/* حجم DB */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted">💾 حجم قاعدة البيانات</span>
                    <span className={`font-black ${monitor.dbPct>80?'text-red':monitor.dbPct>60?'text-accent':'text-green'}`}>
                      {monitor.dbMB} MB / 500 MB ({monitor.dbPct}%)
                    </span>
                  </div>
                  <div className="w-full bg-surface2 rounded-full h-2">
                    <div className={`h-2 rounded-full transition-all ${monitor.dbPct>80?'bg-red':monitor.dbPct>60?'bg-accent':'bg-green'}`}
                      style={{width:`${Math.min(100,monitor.dbPct)}%`}}/>
                  </div>
                  {monitor.dbPct>80&&<p className="text-red text-[10px] mt-1">⚠️ تقترب من الحد! فكر في حذف البيانات القديمة</p>}
                </div>

                {/* عدد الأسر */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted">📋 إجمالي الصفوف</span>
                    <span className="text-white font-black">{monitor.totalRows.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="bg-surface2 px-2 py-0.5 rounded-lg text-muted">👨‍👩‍👧 {stats.families||0} أسرة</span>
                    <span className="bg-surface2 px-2 py-0.5 rounded-lg text-muted">👤 {stats.family_members||0} فرد</span>
                    <span className="bg-surface2 px-2 py-0.5 rounded-lg text-muted">🏕️ {stats.camps||0} مخيم</span>
                  </div>
                </div>

                {/* المستخدمون */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted">👥 مستخدمو النظام</span>
                    <span className={`font-black ${monitor.authPct>80?'text-red':'text-green'}`}>
                      {monitor.authUsers ?? stats?.org_members ?? '—'} / 50,000
                    </span>
                  </div>
                  <div className="w-full bg-surface2 rounded-full h-2">
                    <div className="h-2 rounded-full bg-green transition-all"
                      style={{width:`${Math.min(100,monitor.authPct)}%`}}/>
                  </div>
                </div>

                {/* تنبيه Keep-Alive */}
                <div className="bg-green/10 border border-green/30 rounded-xl p-2">
                  <p className="text-green text-[11px] font-bold">✅ Keep-Alive مفعّل</p>
                  <p className="text-muted text-[10px]">Supabase يُوقَظ تلقائياً كل 48 ساعة عبر GitHub Actions</p>
                </div>
              </div>
            ) : (
              <p className="text-muted text-xs text-center py-2">اضغط &quot;فحص الآن&quot; لعرض الاستخدام</p>
            )}

            <button onClick={loadMonitor} disabled={monLoading}
              className="w-full mt-3 py-2.5 rounded-xl text-sm font-black text-bg bg-accent active:scale-95">
              {monLoading ? '⏳ جاري الفحص...' : '🔭 فحص الآن'}
            </button>
          </div>

          {/* نصائح التوفير */}
          <div className="bg-surface border border-border rounded-xl p-3">
            <p className="text-accent text-xs font-black mb-2">💡 نصائح لتجنب التوقف</p>
            <div className="flex flex-col gap-1.5 text-[11px] text-muted">
              <p>• Keep-Alive يعمل كل 48 ساعة تلقائياً ✅</p>
              <p>• تسجيل الدخول بانتظام يمنع الإيقاف</p>
              <p>• عند تجاوز 80% من DB حذف سجلات قديمة</p>
              <p>• إذا تجاوزت الحدود → ترقية Pro ($25/شهر)</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ منطقة الخطر ═══ */}
      {activeTab==='danger' && isOwner && (
        <div className="flex flex-col gap-3">
          <div className="bg-red/10 border border-red/30 rounded-xl p-3">
            <p className="text-red text-xs font-bold mb-1">⚠️ منطقة الخطر</p>
            <p className="text-muted text-xs">العمليات هنا لا يمكن التراجع عنها</p>
          </div>

          <Card title="🗑️ حذف البيانات" icon="">
            <div className="flex flex-col gap-2">
              <p className="text-muted text-xs">يحذف كل الأسر والأفراد والحركات من Supabase نهائياً</p>
              <button onClick={clearAllData} disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-black text-white"
                style={{background:'rgba(239,68,68,0.2)', border:'1px solid rgba(239,68,68,0.4)'}}>
                🗑️ حذف كل بيانات الأسر
              </button>
            </div>
          </Card>
        </div>
      )}

      {!canExp && !canImp && !isAdmin && (
        <div className="text-center py-8 text-muted text-sm">🔒 لا تملك صلاحيات إدارة البيانات</div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-2xl p-6 flex flex-col items-center gap-3">
            <Spinner size="lg" />
            <p className="text-white text-sm">جاري المعالجة...</p>
          </div>
        </div>
      )}

      {/* Modal تصدير */}
      <Modal open={!!exportModal} onClose={()=>setExportModal(false)} title={exportModal==='mem'?'📊 كشف أفراد الأسر':'📊 كشف رباب الأسر'}>
        <div className="flex flex-col gap-3">
          {(() => {
            const isMem = exportModal==='mem'
            const cols = isMem ? memCols : famCols
            const setCols = isMem ? setMemCols : setFamCols
            const DEF = isMem ? MEM_COLS : FAM_COLS
            const onExport = isMem ? exportMembers : exportFamilies
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
              <button onClick={onExport} disabled={loading}
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
