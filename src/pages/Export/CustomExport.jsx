/**
 * CustomExport.jsx — تصدير مخصص
 * رباب الأسر: حقول + اسم الزوجة + هوية الزوجة
 * الأفراد: قائمة بكل الأفراد (اختيار فردي)
 */
import { useState, useMemo } from 'react'
import XLSX from 'xlsx-js-style'
import { calcAge } from '../../lib/helpers'
import { styleSheet } from '../../lib/excelStyle'

// ── حقول رباب الأسر (مع الزوجة) ─────────────────────────
const FAM_COLS = [
  { key:'head_name',        label:'اسم رب الأسرة',     def:true  },
  { key:'head_id',          label:'رقم هوية رب الأسرة', def:true  },
  { key:'wife_name',        label:'اسم الزوجة',         def:false },
  { key:'wife_id',          label:'هوية الزوجة',         def:false },
  { key:'phone1',           label:'رقم الجوال',          def:true  },
  { key:'phone2',           label:'جوال بديل',           def:false },
  { key:'camp',             label:'المخيم',               def:true  },
  { key:'tent',             label:'رقم الخيمة',          def:true  },
  { key:'head_dob',         label:'تاريخ ميلاد رب الأسرة',def:false },
  { key:'head_gender',      label:'الجنس',               def:false },
  { key:'head_marital',     label:'الحالة الاجتماعية',   def:true  },
  { key:'members_count',    label:'عدد الأفراد',         def:true  },
  { key:'category_tags',    label:'الفئة الاجتماعية',    def:false },
  { key:'original_address', label:'العنوان الأصلي',       def:false },
  { key:'notes',            label:'ملاحظات',             def:false },
]

// ── حقول الأفراد ──────────────────────────────────────────
const MEM_COLS = [
  { key:'tent',        label:'رقم الخيمة',       def:true  },
  { key:'fam_name',    label:'اسم رب الأسرة',    def:true  },
  { key:'head_id',     label:'هوية رب الأسرة',   def:true  },
  { key:'phone1',      label:'رقم الجوال',        def:true  },
  { key:'camp',        label:'المخيم',             def:true  },
  { key:'name',        label:'اسم الفرد',          def:true  },
  { key:'national_id', label:'رقم هوية الفرد',    def:true  },
  { key:'relation',    label:'صلة القرابة',        def:true  },
  { key:'dob',         label:'تاريخ الميلاد',      def:false },
  { key:'age',         label:'العمر',              def:true  },
  { key:'gender',      label:'الجنس',              def:false },
  { key:'health',      label:'الحالة الصحية',      def:false },
  { key:'chronic_diseases', label:'أمراض مزمنة',  def:false },
  { key:'disabilities',     label:'الإعاقات',      def:false },
]

function ColPicker({ cols, onChange, label }) {
  return (
    <div className="bg-surface2 rounded-xl p-3">
      <div className="flex justify-between items-center mb-2">
        <p className="text-accent text-xs font-black">{label}</p>
        <div className="flex gap-1">
          <button onClick={()=>onChange(cols.map((c,i)=>({...c,order:i+1})))}
            className="text-[10px] px-2 py-1 rounded-lg border border-border text-muted">الكل</button>
          <button onClick={()=>onChange(cols.map(c=>({...c,order:0})))}
            className="text-[10px] px-2 py-1 rounded-lg border border-border text-muted">لا شيء</button>
        </div>
      </div>
      <p className="text-muted text-[10px] mb-2">رقم الترتيب (0 = مخفي)</p>
      <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
        {cols.map((col,i)=>(
          <div key={col.key} className="flex items-center gap-2 bg-surface border border-border rounded-lg px-2 py-1.5">
            <input type="number" min="0" max="20" value={col.order||''} placeholder="—"
              onChange={e=>{
                const v=parseInt(e.target.value)||0
                onChange(cols.map((c,j)=>j===i?{...c,order:v}:c))
              }}
              className="w-10 bg-surface2 border border-border rounded text-accent font-black text-center text-xs focus:outline-none py-0.5"/>
            <span className="text-white text-xs flex-1">{col.label}</span>
            {col.order>0&&<span className="text-accent text-[10px] w-4 text-center font-bold">{col.order}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CustomExport({ families, members, camps, orgMembers }) {
  const [mode,       setMode]       = useState('families')
  const [filterCamp, setFilterCamp] = useState('')
  const [search,     setSearch]     = useState('')
  const [selected,   setSelected]   = useState(new Set())
  const [famCols,    setFamCols]    = useState(()=>FAM_COLS.map((c,i)=>({...c,order:c.def?i+1:0})))
  const [memCols,    setMemCols]    = useState(()=>MEM_COLS.map((c,i)=>({...c,order:c.def?i+1:0})))
  const [sheetName,  setSheetName]  = useState('كشف مخصص')

  // ── مندوب تلقائي ─────────────────────────────────────
  const autoDelegate = useMemo(()=>{
    if (!filterCamp) return null
    return orgMembers.find(m=>m.camp_id===filterCamp&&m.role==='camp_delegate')
        || orgMembers.find(m=>m.user_id===camps.find(c=>c.id===filterCamp)?.manager_id)
        || null
  }, [filterCamp,orgMembers,camps])

  const showBanner = !!filterCamp
  const campMap    = Object.fromEntries(camps.map(c=>[c.id,c.name]))

  // ── زوجة كل أسرة ─────────────────────────────────────
  const wifeMap = useMemo(()=>{
    const m={}
    members.forEach(mem=>{
      if(['زوجة','زوجه'].includes(mem.relation||'') && !m[mem.family_id])
        m[mem.family_id]=mem
    })
    return m
  },[members])

  // ── أفراد كل أسرة ────────────────────────────────────
  const membersMap = useMemo(()=>{
    const m={}; members.forEach(x=>{if(!m[x.family_id])m[x.family_id]=[]; m[x.family_id].push(x)}); return m
  },[members])

  // ── القائمة حسب الوضع ────────────────────────────────
  const filteredFams = useMemo(()=>
    families.filter(f=>{
      if(filterCamp&&f.camp_id!==filterCamp) return false
      if(mode==='families'&&search&&!f.head_name?.includes(search)&&!f.tent?.includes(search)) return false
      return true
    }).sort((a,b)=>(a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true}))
  ,[families,filterCamp,search,mode])

  // قائمة الأفراد (للوضع members)
  const filteredMems = useMemo(()=>{
    if(mode!=='members') return []
    return members.filter(m=>{
      const fam=families.find(f=>f.id===m.family_id)
      if(!fam) return false
      if(filterCamp&&fam.camp_id!==filterCamp) return false
      if(search&&!m.name?.includes(search)&&!fam.head_name?.includes(search)) return false
      return true
    }).map(m=>{
      const fam=families.find(f=>f.id===m.family_id)||{}
      return {...m, fam_name:fam.head_name||'—', head_id:fam.head_id||'—', phone1:fam.phone1||'—', tent:fam.tent||'—', camp_id:fam.camp_id, camp:campMap[fam.camp_id]||'—', age:calcAge(m.dob) }
    }).sort((a,b)=>(a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true}))
  },[members,families,filterCamp,search,campMap,mode])

  // ── تحديد ────────────────────────────────────────────
  const list       = mode==='families' ? filteredFams : filteredMems
  const toggleOne  = id => setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n})
  const selAll     = ()=>setSelected(new Set(list.map(x=>x.id)))
  const deselAll   = ()=>setSelected(new Set())

  // ── عند تغيير الوضع: مسح التحديد ────────────────────
  const prevMode = useMemo(()=>mode,[mode])

  // ── تصدير ────────────────────────────────────────────
  function doExport() {
    const isMem  = mode==='members'
    const cols   = (isMem ? memCols : famCols).filter(c=>c.order>0).sort((a,b)=>a.order-b.order)
    if (!cols.length||!selected.size) return

    const headers  = cols.map(c=>c.label)
    const colCount = headers.length+1
    const camp     = camps.find(c=>c.id===filterCamp)

    let dataRows = []
    if (!isMem) {
      const selFams = filteredFams.filter(f=>selected.has(f.id))
      selFams.forEach((f,fi)=>{
        const wife = wifeMap[f.id]
        const row  = {'#':fi+1}
        cols.forEach(col=>{
          if(col.key==='camp')          row[col.label]=campMap[f.camp_id]||'—'
          else if(col.key==='members_count') row[col.label]=membersMap[f.id]?.length||0
          else if(col.key==='wife_name') row[col.label]=wife?.name||'—'
          else if(col.key==='wife_id')   row[col.label]=wife?.national_id||'—'
          else row[col.label]=f[col.key]||''
        })
        dataRows.push(row)
      })
    } else {
      const selMems = filteredMems.filter(m=>selected.has(m.id))
      selMems.forEach((m,mi)=>{
        const row={'#':mi+1}
        cols.forEach(col=>{ row[col.label]=m[col.key]??'' })
        dataRows.push(row)
      })
    }

    // AOA
    const bannerRows = showBanner ? [
      [`🏕️ مخيم: ${camp?.name||''} — ${sheetName}`],
      [`المندوب: ${autoDelegate?.full_name||'—'}   |   الجوال: ${autoDelegate?.phone||'—'}   |   📅 ${new Date().toLocaleDateString('ar-EG')}`],
    ] : []
    const aoa = [...bannerRows, ['#',...headers], ...dataRows.map(r=>['#',...headers].map(h=>h==='#'?r['#']:r[h]))]
    const ws  = XLSX.utils.aoa_to_sheet(aoa)
    styleSheet(ws, colCount, showBanner, dataRows.length)

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0,31))
    XLSX.writeFile(wb, `${sheetName}_${new Date().toLocaleDateString('ar-EG').replace(/\//g,'-')}.xlsx`)
  }

  const SEL='w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none'
  const CB='w-4 h-4 accent-amber-500 cursor-pointer flex-shrink-0'

  return (
    <div className="flex flex-col gap-3">

      {/* نوع الكشف */}
      <div className="grid grid-cols-2 gap-2">
        {[['families','👨‍👩‍👧 رباب الأسر'],['members','👤 أفراد الأسر']].map(([k,l])=>(
          <button key={k} onClick={()=>{setMode(k);setSelected(new Set())}}
            className={`py-2.5 rounded-xl text-sm font-black border transition-all ${mode===k?'bg-accent text-bg border-accent':'bg-surface text-muted border-border'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* اسم الكشف */}
      <input value={sheetName} onChange={e=>setSheetName(e.target.value)}
        placeholder="اسم الكشف..." className={SEL}/>

      {/* فلتر المخيم */}
      <div>
        <select value={filterCamp} onChange={e=>{setFilterCamp(e.target.value);setSelected(new Set())}} className={SEL}>
          <option value="">🏕️ كل المخيمات (بدون بانر)</option>
          {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {filterCamp && (
          <div className={`mt-1.5 px-3 py-2 rounded-xl text-xs ${autoDelegate?'bg-green/10 border border-green/30 text-green':'bg-surface2 border border-border text-muted'}`}>
            {autoDelegate?`✅ المندوب: ${autoDelegate.full_name} — ${autoDelegate.phone||'—'}`:'⚠️ لا يوجد مندوب لهذا المخيم'}
          </div>
        )}
        {!filterCamp&&<p className="text-muted text-[10px] mt-1">عند اختيار مخيم: بانر + مندوب تلقائي</p>}
      </div>

      {/* القائمة */}
      <div className="bg-surface border border-border rounded-xl p-3">
        <div className="flex justify-between items-center mb-2">
          <p className="text-accent text-xs font-black">
            {mode==='families'?'👨‍👩‍👧 اختر الأسر':'👤 اختر الأفراد'}
            <span className="text-muted font-normal mr-1">({selected.size} مختار من {list.length})</span>
          </p>
          <div className="flex gap-1">
            <button onClick={selAll} className="text-[10px] px-2 py-1 rounded-lg bg-accent/10 text-accent border border-accent/30">الكل</button>
            <button onClick={deselAll} className="text-[10px] px-2 py-1 rounded-lg border border-border text-muted">لا شيء</button>
          </div>
        </div>

        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 ابحث بالاسم أو الخيمة..."
          className={`${SEL} mb-2 py-1.5 text-xs`}/>

        <div className="max-h-52 overflow-y-auto flex flex-col gap-0.5 rounded-lg border border-border p-1.5 bg-surface2">
          {list.length===0
            ? <p className="text-muted text-xs text-center py-4">لا توجد نتائج</p>
            : list.map(item=>(
              <label key={item.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer ${selected.has(item.id)?'bg-accent/10 border border-accent/20':'hover:bg-surface'}`}>
                <input type="checkbox" checked={selected.has(item.id)} onChange={()=>toggleOne(item.id)} className={CB}/>
                <span className="text-accent text-xs font-bold w-10 flex-shrink-0">⛺{item.tent||'—'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-xs truncate">{mode==='families'?item.head_name:item.name}</div>
                  {mode==='members'&&<div className="text-muted text-[10px]">{item.relation||'—'} • {item.fam_name}</div>}
                </div>
                {mode==='families'&&<span className="text-muted text-[10px] flex-shrink-0">{membersMap[item.id]?.length||0} فرد</span>}
              </label>
            ))
          }
        </div>
      </div>

      {/* حقول وترتيب */}
      <ColPicker
        cols={mode==='families'?famCols:memCols}
        onChange={mode==='families'?setFamCols:setMemCols}
        label={mode==='families'?'📋 حقول رباب الأسر (مع الزوجة)':'📋 حقول الأفراد'}
      />

      {/* تصدير */}
      <button onClick={doExport} disabled={selected.size===0}
        className="w-full py-3.5 rounded-xl font-black text-bg bg-accent disabled:opacity-40 text-sm">
        📥 تصدير {selected.size>0?`${selected.size} ${mode==='families'?'أسرة':'فرد'}`:''}
      </button>
    </div>
  )
}
