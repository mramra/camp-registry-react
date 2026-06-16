/**
 * CustomExport.jsx — تصدير مخصص
 * حقول + ترتيب مثل تصدير رباب الأسر
 * + تصدير الأفراد
 * + بانر تلقائي عند اختيار مخيم محدد
 */
import { useState, useMemo } from 'react'
import XLSX from 'xlsx-js-style'

// ── نفس حقول ExportPage ───────────────────────────────────
const FAM_COLS = [
  { key:'head_name',        label:'اسم رب الأسرة',     def:true  },
  { key:'head_id',          label:'رقم الهوية',         def:true  },
  { key:'phone1',           label:'رقم الجوال',         def:true  },
  { key:'phone2',           label:'جوال بديل',          def:false },
  { key:'camp',             label:'المخيم',              def:true  },
  { key:'tent',             label:'رقم الخيمة',         def:false },
  { key:'head_dob',         label:'تاريخ الميلاد',      def:false },
  { key:'head_gender',      label:'الجنس',              def:false },
  { key:'head_marital',     label:'الحالة الاجتماعية',  def:true  },
  { key:'members_count',    label:'عدد الأفراد',        def:true  },
  { key:'category_tags',    label:'الفئة الاجتماعية',   def:false },
  { key:'original_address', label:'عنوان السكن الأصلي', def:false },
  { key:'notes',            label:'ملاحظات',            def:false },
]

const MEM_COLS = [
  { key:'tent',        label:'رقم الخيمة',      def:true  },
  { key:'fam_name',    label:'اسم رب الأسرة',   def:true  },
  { key:'head_id',     label:'هوية رب الأسرة',  def:true  },
  { key:'phone1',      label:'رقم الجوال',       def:true  },
  { key:'camp',        label:'المخيم',            def:true  },
  { key:'name',        label:'اسم الفرد',         def:true  },
  { key:'national_id', label:'رقم الهوية',        def:true  },
  { key:'relation',    label:'صلة القرابة',       def:true  },
  { key:'dob',         label:'تاريخ الميلاد',     def:false },
  { key:'age',         label:'العمر',             def:true  },
  { key:'gender',      label:'الجنس',             def:false },
  { key:'health',      label:'الحالة الصحية',     def:false },
]

function calcAge(dob) {
  if (!dob) return null
  const b=new Date(dob),t=new Date()
  let a=t.getFullYear()-b.getFullYear()
  if(t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate()))a--
  return a>=0&&a<120?a:null
}

// ── نمط Excel مطابق لـ ExportPage ────────────────────────
const NAVY = '1E3A5F', GOLD='F59E0B', WHITE='FFFFFF', GRAY='F8FAFC', LGRAY='E2E8F0'

function styleSheet(ws, colCount, showBanner, dataRows) {
  const off = showBanner ? 3 : 1
  const hdrRow = off
  const colLast = String.fromCharCode(64+colCount)

  // بانر
  if (showBanner) {
    if (!ws['!merges']) ws['!merges'] = []
    ws['!merges'].push({ s:{r:0,c:0}, e:{r:0,c:colCount-1} })
    ws['!merges'].push({ s:{r:1,c:0}, e:{r:1,c:colCount-1} })
    if (!ws['!rows']) ws['!rows'] = []
    ws['!rows'][0] = { hpt:34 }
    ws['!rows'][1] = { hpt:22 }
    const bannerStyle1 = { font:{name:'Cairo',bold:true,sz:16,color:{rgb:GOLD}}, fill:{patternType:'solid',fgColor:{rgb:NAVY}}, alignment:{horizontal:'center',vertical:'center',readingOrder:2} }
    const bannerStyle2 = { font:{name:'Cairo',sz:10,color:{rgb:'CBD5E1'}}, fill:{patternType:'solid',fgColor:{rgb:NAVY}}, alignment:{horizontal:'center',vertical:'center',readingOrder:2} }
    if (ws['A1']) ws['A1'].s = bannerStyle1
    if (ws['A2']) ws['A2'].s = bannerStyle2
  }

  // رأس الأعمدة
  for (let c=0;c<colCount;c++) {
    const cell=`${String.fromCharCode(65+c)}${hdrRow}`
    if (ws[cell]) ws[cell].s = { font:{name:'Cairo',bold:true,sz:10,color:{rgb:WHITE}}, fill:{patternType:'solid',fgColor:{rgb:NAVY}}, alignment:{horizontal:'center',vertical:'center',wrapText:true,readingOrder:2}, border:{bottom:{style:'medium',color:{rgb:GOLD}}} }
  }

  // صفوف البيانات
  dataRows.forEach((_,ri) => {
    for (let c=0;c<colCount;c++) {
      const cell=`${String.fromCharCode(65+c)}${hdrRow+1+ri}`
      if (ws[cell]) ws[cell].s = { font:{name:'Cairo',sz:9}, fill:{patternType:'solid',fgColor:{rgb:ri%2===0?WHITE:GRAY}}, alignment:{horizontal:'center',vertical:'center',readingOrder:2}, border:{bottom:{style:'thin',color:{rgb:LGRAY}}} }
    }
  })

  ws['!cols'] = Array(colCount).fill({wch:18})
}

// ── مكوّن اختيار الحقول وترتيبها ────────────────────────
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
      <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto">
        {cols.map((col,i)=>(
          <div key={col.key} className="flex items-center gap-2 bg-surface border border-border rounded-lg px-2 py-1.5">
            <input type="number" min="0" max="20" value={col.order||''} placeholder="—"
              onChange={e=>{
                const v=parseInt(e.target.value)||0
                onChange(cols.map((c,j)=>j===i?{...c,order:v}:c))
              }}
              className="w-10 bg-surface2 border border-border rounded text-accent font-black text-center text-xs focus:outline-none py-0.5"/>
            <span className="text-white text-xs flex-1">{col.label}</span>
            {col.order>0 && <span className="text-accent text-[10px] w-4 text-center">{col.order}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CustomExport({ families, members, camps, orgMembers }) {
  const [mode,       setMode]       = useState('families')  // 'families' | 'members'
  const [filterCamp, setFilterCamp] = useState('')
  const [search,     setSearch]     = useState('')
  const [selected,   setSelected]   = useState(new Set())
  const [famCols,    setFamCols]    = useState(()=>FAM_COLS.map((c,i)=>({...c,order:c.def?i+1:0})))
  const [memCols,    setMemCols]    = useState(()=>MEM_COLS.map((c,i)=>({...c,order:c.def?i+1:0})))
  const [sheetName,  setSheetName]  = useState('كشف مخصص')

  // ── اختيار المندوب تلقائياً ───────────────────────────
  const autoDelegate = useMemo(()=>{
    if (!filterCamp) return null
    return orgMembers.find(m=>m.camp_id===filterCamp&&m.role==='camp_delegate')
        || orgMembers.find(m=>m.user_id===camps.find(c=>c.id===filterCamp)?.manager_id)
        || null
  }, [filterCamp, orgMembers, camps])

  const showBanner = !!filterCamp  // بانر فقط عند اختيار مخيم محدد

  // ── مجموعة الأسر المرئية ──────────────────────────────
  const campMap = Object.fromEntries(camps.map(c=>[c.id,c.name]))

  const filtered = useMemo(()=>
    families.filter(f=>{
      if(filterCamp && f.camp_id!==filterCamp) return false
      if(search && !f.head_name?.includes(search) && !f.tent?.includes(search)) return false
      return true
    }).sort((a,b)=>(a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true}))
  ,[families,filterCamp,search])

  const membersMap = useMemo(()=>{
    const m={}; members.forEach(x=>{if(!m[x.family_id])m[x.family_id]=[]; m[x.family_id].push(x)}); return m
  },[members])

  // ── تحديد الأسر ──────────────────────────────────────
  const toggleOne = id => setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n})
  const selAll    = ()=>setSelected(new Set(filtered.map(f=>f.id)))
  const deselAll  = ()=>setSelected(new Set())

  // ── تصدير ────────────────────────────────────────────
  function doExport() {
    const selFams = families.filter(f=>selected.has(f.id))
      .sort((a,b)=>(a.tent||'ٮ').localeCompare(b.tent||'ٮ','ar',{numeric:true}))
    if (!selFams.length) return

    const isMem = mode==='members'
    const cols  = isMem ? memCols : famCols
    const active = cols.filter(c=>c.order>0).sort((a,b)=>a.order-b.order)
    if (!active.length) return

    const headers = active.map(c=>c.label)
    const colCount= headers.length
    const camp    = camps.find(c=>c.id===filterCamp)

    // بناء الصفوف
    const dataRows = []
    if (!isMem) {
      selFams.forEach((f,fi)=>{
        const row = { '#': fi+1 }
        active.forEach(col=>{
          if (col.key==='camp')          row[col.label]=campMap[f.camp_id]||'—'
          else if(col.key==='members_count') row[col.label]=membersMap[f.id]?.length||0
          else row[col.label]=f[col.key]||''
        })
        dataRows.push(row)
      })
    } else {
      let n=1
      selFams.forEach(f=>{
        const mems=membersMap[f.id]||[]
        mems.forEach(m=>{
          const row={'#':n++}
          active.forEach(col=>{
            if(col.key==='camp')     row[col.label]=campMap[f.camp_id]||'—'
            else if(col.key==='fam_name') row[col.label]=f.head_name||'—'
            else if(col.key==='head_id')  row[col.label]=f.head_id||'—'
            else if(col.key==='phone1')   row[col.label]=f.phone1||'—'
            else if(col.key==='tent')     row[col.label]=f.tent||'—'
            else if(col.key==='age')      row[col.label]=calcAge(m.dob)??''
            else row[col.label]=m[col.key]||''
          })
          dataRows.push(row)
        })
      })
    }

    // بناء AOA
    const off = showBanner ? 3 : 1
    const aoa = []
    if (showBanner) {
      const coord=camp?.latitude?`${parseFloat(camp.latitude).toFixed(5)}, ${parseFloat(camp.longitude).toFixed(5)}`:''
      aoa.push([`🏕️ مخيم: ${camp?.name||''} — ${sheetName}`])
      aoa.push([`المندوب: ${autoDelegate?.full_name||'—'}   |   الجوال: ${autoDelegate?.phone||'—'}   |   ${coord}   |   📅 ${new Date().toLocaleDateString('ar-EG')}`])
    }
    aoa.push(['#', ...headers])
    dataRows.forEach(r=>aoa.push(['#','...headers'].map(()=>null)))

    const ws = XLSX.utils.aoa_to_sheet(
      (showBanner?[
        [`🏕️ مخيم: ${camp?.name||''} — ${sheetName}`],
        [`المندوب: ${autoDelegate?.full_name||'—'}   |   الجوال: ${autoDelegate?.phone||'—'}   |   📅 ${new Date().toLocaleDateString('ar-EG')}`],
        ['#',...headers],
      ]:[['#',...headers]]).concat(
        dataRows.map(r=>['#',...headers].map(h=>h==='#'?r['#']:r[h]))
      )
    )

    styleSheet(ws, colCount+1, showBanner, dataRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0,31))
    XLSX.writeFile(wb, `${sheetName}_${new Date().toLocaleDateString('ar-EG').replace(/\//g,'-')}.xlsx`)
  }

  const SEL='w-full bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none'
  const CB='w-4 h-4 accent-amber-500 cursor-pointer'

  return (
    <div className="flex flex-col gap-3">

      {/* ── نوع الكشف ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        {[['families','👨‍👩‍👧 رباب الأسر'],['members','👤 أفراد الأسر']].map(([k,l])=>(
          <button key={k} onClick={()=>setMode(k)}
            className={`py-2.5 rounded-xl text-sm font-black border transition-all ${mode===k?'bg-accent text-bg border-accent':'bg-surface text-muted border-border'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── اسم الكشف ──────────────────────────────── */}
      <input value={sheetName} onChange={e=>setSheetName(e.target.value)}
        placeholder="اسم الكشف..." className={SEL}/>

      {/* ── فلتر المخيم + مندوب تلقائي ────────────── */}
      <div>
        <select value={filterCamp} onChange={e=>setFilterCamp(e.target.value)} className={SEL}>
          <option value="">🏕️ كل المخيمات (بدون بانر)</option>
          {camps.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {filterCamp && (
          <div className={`mt-1.5 px-3 py-2 rounded-xl text-xs ${autoDelegate?'bg-green/10 border border-green/30 text-green':'bg-surface2 border border-border text-muted'}`}>
            {autoDelegate
              ? `✅ المندوب: ${autoDelegate.full_name} — ${autoDelegate.phone||'—'}`
              : '⚠️ لا يوجد مندوب مسجّل لهذا المخيم'}
          </div>
        )}
        {!filterCamp && <p className="text-muted text-[10px] mt-1 px-1">عند اختيار مخيم: يُضاف البانر + المندوب تلقائياً</p>}
      </div>

      {/* ── اختيار الأسر ───────────────────────────── */}
      <div className="bg-surface border border-border rounded-xl p-3">
        <div className="flex justify-between items-center mb-2">
          <p className="text-accent text-xs font-black">👨‍👩‍👧 اختر الأسر <span className="text-muted font-normal">({selected.size} مختار)</span></p>
          <div className="flex gap-1">
            <button onClick={selAll} className="text-[10px] px-2 py-1 rounded-lg bg-accent/10 text-accent border border-accent/30">الكل</button>
            <button onClick={deselAll} className="text-[10px] px-2 py-1 rounded-lg border border-border text-muted">لا شيء</button>
          </div>
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 ابحث بالاسم أو الخيمة..."
          className={`${SEL} mb-2 text-xs py-1.5`}/>
        <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5 rounded-lg border border-border p-1.5 bg-surface2">
          {filtered.length===0
            ? <p className="text-muted text-xs text-center py-3">لا توجد نتائج</p>
            : filtered.map(f=>(
              <label key={f.id} className={`flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer ${selected.has(f.id)?'bg-accent/10 border border-accent/20':'hover:bg-surface'}`}>
                <input type="checkbox" checked={selected.has(f.id)} onChange={()=>toggleOne(f.id)} className={CB}/>
                <span className="text-accent text-xs font-bold w-10">⛺{f.tent||'—'}</span>
                <span className="text-white text-xs flex-1 truncate">{f.head_name}</span>
                <span className="text-muted text-[10px]">{membersMap[f.id]?.length||0}</span>
              </label>
            ))
          }
        </div>
      </div>

      {/* ── حقول وترتيبها ──────────────────────────── */}
      <ColPicker
        cols={mode==='families'?famCols:memCols}
        onChange={mode==='families'?setFamCols:setMemCols}
        label={mode==='families'?'📋 حقول رباب الأسر':'📋 حقول الأفراد'}
      />

      {/* ── تصدير ──────────────────────────────────── */}
      <button onClick={doExport} disabled={selected.size===0}
        className="w-full py-3.5 rounded-xl font-black text-bg bg-accent disabled:opacity-40 text-sm active:scale-95">
        📥 تصدير {selected.size>0?`${selected.size} أسرة`:''} {mode==='members'?'(الأفراد)':'(رباب الأسر)'}
      </button>

    </div>
  )
}
