/**
 * CustomExport.jsx — أداة تصدير مخصص
 * اختر الأسر + الحقول + البنر → Excel
 */
import { useState, useMemo } from 'react'
import XLSX from 'xlsx-js-style'

// ── الحقول المتاحة ────────────────────────────────────────
const FAMILY_FIELDS = [
  { key:'head_name',    label:'اسم رب الأسرة',     def:true  },
  { key:'head_id',      label:'رقم الهوية',         def:true  },
  { key:'phone1',       label:'رقم الجوال',         def:true  },
  { key:'phone2',       label:'جوال بديل',          def:false },
  { key:'tent',         label:'رقم الخيمة',         def:true  },
  { key:'camp',         label:'اسم المخيم',         def:true  },
  { key:'head_gender',  label:'الجنس',             def:false },
  { key:'head_marital', label:'الحالة الاجتماعية', def:true  },
  { key:'head_dob',     label:'تاريخ الميلاد',     def:false },
  { key:'members_count',label:'عدد الأفراد',       def:true  },
  { key:'original_address', label:'العنوان الأصلي',def:false },
  { key:'notes',        label:'ملاحظات',           def:false },
]

const MEMBER_FIELDS = [
  { key:'name',         label:'الاسم',             def:true  },
  { key:'relation',     label:'صلة القرابة',       def:true  },
  { key:'national_id',  label:'رقم الهوية',        def:true  },
  { key:'gender',       label:'الجنس',             def:false },
  { key:'dob',          label:'تاريخ الميلاد',    def:false },
  { key:'health',       label:'الحالة الصحية',    def:false },
  { key:'chronic_diseases', label:'أمراض مزمنة',  def:false },
  { key:'disabilities', label:'الإعاقات',          def:false },
  { key:'injuries',     label:'الإصابات',          def:false },
  { key:'orphan_status',label:'يتيم',              def:false },
  { key:'notes',        label:'ملاحظات',           def:false },
]

// ── نمط الخلية ────────────────────────────────────────────
const STYLES = {
  header: {
    font:  { name:'Cairo', bold:true, sz:10, color:{ rgb:'FFFFFF' } },
    fill:  { patternType:'solid', fgColor:{ rgb:'1E3A5F' } },
    alignment: { horizontal:'center', vertical:'center', readingOrder:2 },
    border:{ bottom:{ style:'medium', color:{ rgb:'F59E0B' } } }
  },
  even: {
    font:  { name:'Cairo', sz:9 },
    fill:  { patternType:'solid', fgColor:{ rgb:'FFFFFF' } },
    alignment: { horizontal:'center', vertical:'center', readingOrder:2 }
  },
  odd: {
    font:  { name:'Cairo', sz:9 },
    fill:  { patternType:'solid', fgColor:{ rgb:'F8FAFC' } },
    alignment: { horizontal:'center', vertical:'center', readingOrder:2 }
  },
  banner1: {
    font:  { name:'Cairo', bold:true, sz:16, color:{ rgb:'F59E0B' } },
    fill:  { patternType:'solid', fgColor:{ rgb:'1E3A5F' } },
    alignment: { horizontal:'center', vertical:'center', readingOrder:2 }
  },
  banner2: {
    font:  { name:'Cairo', sz:10, color:{ rgb:'CBD5E1' } },
    fill:  { patternType:'solid', fgColor:{ rgb:'1E3A5F' } },
    alignment: { horizontal:'center', vertical:'center', readingOrder:2 }
  },
}

function styleSheet(ws, headers, dataRows, withBanner, colCount) {
  const dataOffset = withBanner ? 3 : 1  // صفوف البيانات تبدأ من بعد البنر+رأس

  // رأس الأعمدة
  headers.forEach((_, ci) => {
    const cell = `${String.fromCharCode(65+ci)}${dataOffset}`
    if (ws[cell]) ws[cell].s = STYLES.header
  })

  // البيانات
  dataRows.forEach((_, ri) => {
    headers.forEach((_, ci) => {
      const cell = `${String.fromCharCode(65+ci)}${dataOffset+1+ri}`
      if (ws[cell]) ws[cell].s = ri%2===0 ? STYLES.even : STYLES.odd
    })
  })

  // عرض الأعمدة
  ws['!cols'] = headers.map(() => ({ wch: 18 }))
  ws['!rows'] = ws['!rows'] || []

  if (withBanner) {
    ws['!rows'][0] = { hpt:32 }
    ws['!rows'][1] = { hpt:20 }
    ws['!rows'][2] = { hpt:24 }
    if (!ws['!merges']) ws['!merges'] = []
    ws['!merges'].push(
      { s:{r:0,c:0}, e:{r:0,c:colCount-1} },
      { s:{r:1,c:0}, e:{r:1,c:colCount-1} },
    )
  }
}

export default function CustomExport({ families, members, camps, orgMembers }) {
  const campMap   = useMemo(()=>Object.fromEntries(camps.map(c=>[c.id,c.name])),[camps])
  const membersOf = useMemo(()=>{
    const map = {}
    members.forEach(m=>{
      if(!map[m.family_id]) map[m.family_id]=[]
      map[m.family_id].push(m)
    })
    return map
  },[members])

  // ── الحالة ────────────────────────────────────────────────
  const [search,       setSearch]       = useState('')
  const [filterCamp,   setFilterCamp]   = useState('')
  const [selected,     setSelected]     = useState(new Set())
  const [famFields,    setFamFields]    = useState(()=>new Set(FAMILY_FIELDS.filter(f=>f.def).map(f=>f.key)))
  const [memFields,    setMemFields]    = useState(()=>new Set(MEMBER_FIELDS.filter(f=>f.def).map(f=>f.key)))
  const [withBanner,   setWithBanner]   = useState(true)
  const [inclMembers,  setInclMembers]  = useState(false)
  const [sheetName,    setSheetName]    = useState('كشف مخصص')
  const [selCamp,      setSelCamp]      = useState('')  // للبنر

  // ── قائمة الأسر المفلترة ──────────────────────────────────
  const filtered = useMemo(()=>
    families.filter(f=>{
      if(filterCamp && f.camp_id!==filterCamp) return false
      if(search && !f.head_name?.includes(search) && !f.tent?.includes(search)) return false
      return true
    }).sort((a,b)=>(a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true}))
  ,[families,filterCamp,search])

  // ── تحديد / إلغاء ─────────────────────────────────────────
  function toggleOne(id) {
    setSelected(s=>{ const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n })
  }
  function selectAll()   { setSelected(new Set(filtered.map(f=>f.id))) }
  function deselectAll() { setSelected(new Set()) }
  function toggleField(set, setFn, key) {
    setFn(s=>{ const n=new Set(s); n.has(key)?n.delete(key):n.add(key); return n })
  }

  // ── تصدير ─────────────────────────────────────────────────
  function doExport() {
    const selFams = families.filter(f=>selected.has(f.id))
    if(!selFams.length) return

    const headers  = FAMILY_FIELDS.filter(f=>famFields.has(f.key)).map(f=>f.label)
    const memHdrs  = inclMembers ? MEMBER_FIELDS.filter(f=>memFields.has(f.key)).map(f=>f.label) : []
    const allHdrs  = ['#', ...headers, ...(inclMembers?['— الأفراد —',...memHdrs]:[]) ]
    const colCount = allHdrs.length

    // بناء الصفوف
    const rows = []
    selFams.forEach((f,fi)=>{
      const mems = inclMembers ? (membersOf[f.id]||[]) : []
      const famRow = {
        '#': fi+1,
        ...Object.fromEntries(
          FAMILY_FIELDS.filter(x=>famFields.has(x.key)).map(x=>{
            if(x.key==='camp')          return [x.label, campMap[f.camp_id]||'—']
            if(x.key==='members_count') return [x.label, membersOf[f.id]?.length||0]
            return [x.label, f[x.key]||'']
          })
        ),
      }
      rows.push(famRow)

      mems.forEach(m=>{
        rows.push({
          '#': '',
          ...Object.fromEntries(headers.map(h=>([h,'']))),
          ...(inclMembers?{'— الأفراد —':''}:{}),
          ...Object.fromEntries(
            MEMBER_FIELDS.filter(x=>memFields.has(x.key)).map(x=>[x.label, m[x.key]||''])
          ),
        })
      })
    })

    // إنشاء الـ worksheet
    const ws = {}
    const dataOffset = withBanner ? 3 : 1

    // البنر
    if(withBanner) {
      const camp    = camps.find(c=>c.id===selCamp) || camps[0]
      const delegate = orgMembers.find(m=>m.camp_id===camp?.id&&m.role==='camp_delegate')
                    || orgMembers.find(m=>m.user_id===camp?.manager_id)
      const coord = camp?.latitude ? `${parseFloat(camp.latitude).toFixed(5)}, ${parseFloat(camp.longitude).toFixed(5)}` : ''
      ws['A1'] = { v: `🏕️ ${camp?.name||'المخيم'}  —  ${sheetName}`, t:'s', s:STYLES.banner1 }
      ws['A2'] = { v: `المندوب: ${delegate?.full_name||'—'}   |   الجوال: ${delegate?.phone||'—'}   |   ${coord}   |   📅 ${new Date().toLocaleDateString('ar-EG')}`, t:'s', s:STYLES.banner2 }
    }

    // رأس الأعمدة
    allHdrs.forEach((h,ci)=>{
      const cell = `${String.fromCharCode(65+ci)}${dataOffset}`
      ws[cell] = { v:h, t:'s' }
    })

    // البيانات
    rows.forEach((row,ri)=>{
      allHdrs.forEach((h,ci)=>{
        const cell = `${String.fromCharCode(65+ci)}${dataOffset+1+ri}`
        ws[cell] = { v: row[h]??'', t:'s' }
      })
    })

    ws['!ref'] = `A1:${String.fromCharCode(64+colCount)}${dataOffset+rows.length}`
    styleSheet(ws, allHdrs, rows, withBanner, colCount)

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0,31))
    XLSX.writeFile(wb, `${sheetName}_${new Date().toLocaleDateString('ar-EG').replace(/\//g,'-')}.xlsx`)
  }

  const SEL = 'w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none'
  const CB  = 'w-4 h-4 accent-amber-500 cursor-pointer'

  return (
    <div className="flex flex-col gap-4">

      {/* ── اسم الكشف ─────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-xl p-3">
        <p className="text-accent text-xs font-black mb-2">📄 اسم الكشف</p>
        <input value={sheetName} onChange={e=>setSheetName(e.target.value)}
          placeholder="كشف مخصص..." className={SEL}/>
      </div>

      {/* ── اختيار الأسر ──────────────────────────────── */}
      <div className="bg-surface border border-border rounded-xl p-3">
        <p className="text-accent text-xs font-black mb-2">
          👨‍👩‍👧 اختر الأسر
          <span className="text-muted font-normal mr-2">({selected.size} مختار)</span>
        </p>

        {/* فلاتر */}
        <select value={filterCamp} onChange={e=>setFilterCamp(e.target.value)} className={`${SEL} mb-2`}>
          <option value="">🏕️ كل المخيمات</option>
          {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 ابحث بالاسم أو الخيمة..."
          className={`${SEL} mb-2`}/>

        {/* أزرار سريعة */}
        <div className="flex gap-2 mb-2">
          <button onClick={selectAll}
            className="flex-1 py-1.5 text-xs font-bold rounded-xl bg-accent/10 text-accent border border-accent/30">
            ✅ تحديد الكل ({filtered.length})
          </button>
          <button onClick={deselectAll}
            className="flex-1 py-1.5 text-xs font-bold rounded-xl bg-surface2 text-muted border border-border">
            ✕ إلغاء الكل
          </button>
        </div>

        {/* قائمة الأسر */}
        <div className="max-h-56 overflow-y-auto flex flex-col gap-1 rounded-xl border border-border p-2 bg-surface2">
          {filtered.length===0 && <p className="text-muted text-xs text-center py-4">لا توجد نتائج</p>}
          {filtered.map(f=>(
            <label key={f.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${selected.has(f.id)?'bg-accent/10 border border-accent/20':'hover:bg-surface'}`}>
              <input type="checkbox" checked={selected.has(f.id)}
                onChange={()=>toggleOne(f.id)} className={CB}/>
              <span className="text-accent text-xs font-bold w-12 flex-shrink-0">⛺{f.tent||'—'}</span>
              <span className="text-white text-xs flex-1 truncate">{f.head_name}</span>
              <span className="text-muted text-[10px]">{membersOf[f.id]?.length||0} فرد</span>
            </label>
          ))}
        </div>
      </div>

      {/* ── حقول رب الأسرة ────────────────────────────── */}
      <div className="bg-surface border border-border rounded-xl p-3">
        <p className="text-accent text-xs font-black mb-2">📋 حقول رب الأسرة</p>
        <div className="grid grid-cols-2 gap-1.5">
          {FAMILY_FIELDS.map(f=>(
            <label key={f.key} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={famFields.has(f.key)}
                onChange={()=>toggleField(famFields,setFamFields,f.key)} className={CB}/>
              <span className="text-xs text-muted">{f.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ── الأفراد ────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-xl p-3">
        <label className="flex items-center gap-2 mb-2 cursor-pointer">
          <input type="checkbox" checked={inclMembers}
            onChange={e=>setInclMembers(e.target.checked)} className={CB}/>
          <span className="text-white text-sm font-bold">👤 تضمين أفراد الأسر</span>
        </label>
        {inclMembers && (
          <div className="grid grid-cols-2 gap-1.5 mt-2">
            {MEMBER_FIELDS.map(f=>(
              <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={memFields.has(f.key)}
                  onChange={()=>toggleField(memFields,setMemFields,f.key)} className={CB}/>
                <span className="text-xs text-muted">{f.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* ── خيارات ─────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-xl p-3">
        <p className="text-accent text-xs font-black mb-2">⚙️ خيارات التصدير</p>
        <label className="flex items-center gap-2 mb-2 cursor-pointer">
          <input type="checkbox" checked={withBanner}
            onChange={e=>setWithBanner(e.target.checked)} className={CB}/>
          <span className="text-white text-sm">إضافة بانر المخيم</span>
        </label>
        {withBanner && (
          <select value={selCamp} onChange={e=>setSelCamp(e.target.value)} className={`${SEL} mt-1`}>
            <option value="">اختر المخيم للبنر</option>
            {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {/* ── زر التصدير ─────────────────────────────────── */}
      <button
        onClick={doExport}
        disabled={selected.size===0}
        className="w-full py-3.5 rounded-xl font-black text-bg bg-accent disabled:opacity-40 text-sm">
        📥 تصدير {selected.size} أسرة {inclMembers?'مع أفرادهم':''}
      </button>

    </div>
  )
}
