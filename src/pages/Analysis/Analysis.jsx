import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRxDB } from '../../lib/useRxDB'
import { supabase, ORG_ID } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { useDataScope } from '../../lib/useDataScope'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { formatDate } from '../../lib/utils'

function calcAge(dob) {
  if (!dob) return null
  const b = new Date(dob), t = new Date()
  let age = t.getFullYear() - b.getFullYear()
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--
  return age >= 0 && age < 120 ? age : null
}

const AGE_GROUPS = [
  { label: 'رضيع 0-2',    min: 0,  max: 2   },
  { label: 'طفل 3-12',    min: 3,  max: 12  },
  { label: 'مراهق 13-17', min: 13, max: 17  },
  { label: 'شاب 18-35',   min: 18, max: 35  },
  { label: 'كهل 36-59',   min: 36, max: 59  },
  { label: 'مسن 60+',     min: 60, max: 200 },
]

const TABS = [
  { key: 'overview',  label: '📊 عام'      },
  { key: 'age',       label: '🎂 الأعمار'  },
  { key: 'health',    label: '🏥 الصحة'    },
  { key: 'women',     label: '👩 نساء'     },
  { key: 'children',  label: '🧒 أطفال'    },
  { key: 'camps',     label: '🏕️ مخيمات'   },
  { key: 'dists',     label: '📦 توزيعات'  },
]

// ── DrillDown Modal ─────────────────────────────────────────
// items: قائمة أفراد { personName, personId, personGender, personDob, famId, famName, famHeadId, campName }
// أو أسر عادية { head_name, head_id, phone1, camp_id, id }
function DrillDownModal({ title, items, campMap, onClose, onOpenFamily }) {
  const [search, setSearch] = useState('')

  const filtered = items.filter(item => {
    if (!search) return true
    const q = search.toLowerCase()
    const name = item.personName || item.head_name || ''
    const id   = item.personId   || item.head_id   || ''
    return name.toLowerCase().includes(q) || id.includes(q)
  })

  function getIcon(item) {
    const g = item.personGender || item.head_gender || ''
    const age = item.personDob ? calcAge(item.personDob) : null
    if (age !== null && age < 3)  return '👶'
    if (age !== null && age < 13) return '🧒'
    if (age !== null && age < 18) return '🧑'
    if (g==='ذكر'||g==='male')   return '👨'
    if (g==='أنثى'||g==='female') return '👩'
    return '👤'
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'0'}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'#111827',borderRadius:'20px 20px 0 0',width:'100%',maxWidth:'500px',maxHeight:'85vh',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {/* رأس */}
        <div style={{padding:'16px',borderBottom:'1px solid #374151',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
          <div>
            <div style={{color:'#f59e0b',fontWeight:'900',fontSize:'14px'}}>{title}</div>
            <div style={{color:'#9ca3af',fontSize:'11px',marginTop:'2px'}}>{items.length} فرد/أسرة</div>
          </div>
          <button onClick={onClose}
            style={{background:'#1f2937',border:'1px solid #374151',color:'#9ca3af',borderRadius:'10px',padding:'6px 14px',fontSize:'12px',cursor:'pointer',fontFamily:'Cairo,sans-serif'}}>
            ✕ إغلاق
          </button>
        </div>
        {/* بحث */}
        <div style={{padding:'10px 16px',flexShrink:0}}>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="🔍 بحث بالاسم أو الهوية..."
            style={{width:'100%',background:'#1f2937',border:'1px solid #374151',borderRadius:'10px',padding:'8px 12px',color:'white',fontSize:'12px',fontFamily:'Cairo,sans-serif',outline:'none',boxSizing:'border-box'}}
          />
        </div>
        {/* القائمة */}
        <div style={{overflowY:'auto',flex:1,padding:'0 16px 16px'}}>
          {filtered.length === 0
            ? <div style={{color:'#9ca3af',textAlign:'center',padding:'20px',fontSize:'12px'}}>لا توجد نتائج</div>
            : filtered.map((item, i) => {
              const isPerson = !!item.personName
              const name     = item.personName || item.head_name
              const subId    = item.personId   || item.head_id
              const famName  = item.famName
              const camp     = item.campName   || (item.camp_id && campMap[item.camp_id])
              const icon     = getIcon(item)
              const age      = calcAge(item.personDob || item.head_dob)
              const relation = item.relation
              return (
                <div key={i} onClick={()=>{ onClose(); onOpenFamily(item.famId || item.id, item) }}
                  style={{background:'#1f2937',border:'1px solid #374151',borderRadius:'12px',padding:'10px 14px',marginBottom:'8px',cursor:'pointer',display:'flex',gap:'10px',alignItems:'center'}}>
                  <span style={{fontSize:'24px',flexShrink:0}}>{icon}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:'white',fontWeight:'bold',fontSize:'13px'}}>{i+1}. {name}</div>
                    {isPerson && famName && (
                      <div style={{color:'#f59e0b',fontSize:'10px',marginTop:'1px'}}>
                        👨‍👩‍👧‍👦 أسرة: {famName}
                      </div>
                    )}
                    <div style={{color:'#9ca3af',fontSize:'10px',marginTop:'1px',direction:'ltr',textAlign:'right'}}>
                      {subId}{age !== null ? ` · ${age} سنة` : ''}{relation ? ` · ${relation}` : ''}
                    </div>
                    {camp && <div style={{color:'#3b82f6',fontSize:'10px',marginTop:'1px'}}>🏕️ {camp}</div>}
                  </div>
                  <span style={{color:'#f59e0b',fontSize:'18px',flexShrink:0}}>←</span>
                </div>
              )
            })
          }
        </div>
      </div>
    </div>
  )
}

export default function Analysis() {
  const [tab,        setTab]        = useState('overview')
  const [stats,      setStats]      = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [filterCamp, setFilterCamp] = useState('all')
  const [drillDown,  setDrillDown]  = useState(null) // { title, families }
  const [selFamily,  setSelFamily]  = useState(null)
  const [selMembers, setSelMembers] = useState([])

  const { showToast, online, psReady, psSynced } = useApp()
  const { getAllowedCampIds, applyScope, filterLocal } = useDataScope()
  const navigate = useNavigate()

  // حفظ الأسر الكاملة للـ drill-down
  const [allFamilies, setAllFamilies] = useState([])
  const [allMembers,  setAllMembers]  = useState([])

  const { query } = useRxDB()