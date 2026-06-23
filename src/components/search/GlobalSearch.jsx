/**
 * GlobalSearch.jsx — البحث الذكي الشامل (منقول من النسخة القديمة doGlobalSearch)
 * يبحث محلياً في الأسر/الأفراد/المستخدمين/المخيمات دفعة واحدة، ضمن النطاق المسموح
 * للمستخدم فقط (خلافاً للنسخة القديمة التي لم تطبّق أي فلترة نطاق على البحث).
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useLocalDB, visibleFamilies, visibleOrgMembers } from '../../lib/db'
import { useDataScope } from '../../lib/useDataScope'
import { ROLE_LABELS } from '../../lib/permissions'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'

export default function GlobalSearch({ open, onClose }) {
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const timerRef = useRef(null)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  const { profile, isOwner, isCampDelegate } = useAuth()
  const { query } = useLocalDB()
  const { getAllowedCampIds, filterLocal, getVisibleCamps } = useDataScope()

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
    else { setQ(''); setResults(null) }
  }, [open])

  useEffect(() => {
    clearTimeout(timerRef.current)
    if (q.trim().length < 2) { setResults(null); return }
    timerRef.current = setTimeout(runSearch, 300)
    return () => clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  async function runSearch() {
    setLoading(true)
    try {
      const term  = q.trim()
      const isNum = /^\d+$/.test(term)

      const [famsRaw, campsRaw, memsRaw, usersRaw] = await Promise.all([
        query('families'), query('camps'), query('family_members'), query('org_members'),
      ])

      // نطاق المستخدم — نفس فلترة كل الصفحات (لا نكرر منطق الفلترة القديم غير الآمن)
      const fams      = visibleFamilies(famsRaw, isOwner)
      const campIds   = getAllowedCampIds(campsRaw)
      const scopedFams = filterLocal(fams, campIds)
      const scopedFamIds = new Set(scopedFams.map(f => f.id))
      const scopedMems  = campIds === null ? memsRaw : memsRaw.filter(m => scopedFamIds.has(m.family_id))
      const scopedCamps = getVisibleCamps(campsRaw)
      const scopedUsers = visibleOrgMembers(usersRaw, profile, campIds)

      const families = scopedFams.filter(f =>
        isNum ? (f.head_id || '').includes(term) || (f.phone1 || '').includes(term)
              : (f.head_name || '').includes(term)
      ).slice(0, 8)

      const members = scopedMems.filter(m =>
        isNum ? (m.national_id || '').includes(term) : (m.name || '').includes(term)
      ).slice(0, 5)

      const users = isCampDelegate
        ? scopedUsers.filter(u => (u.full_name || '').includes(term) || (u.national_id || '').includes(term)).slice(0, 4)
        : []

      const camps = scopedCamps.filter(c => (c.name || '').includes(term)).slice(0, 4)

      const famMap = {}
      scopedFams.forEach(f => { famMap[f.id] = f })

      setResults({ families, members, users, camps, famMap, campMap: Object.fromEntries(scopedCamps.map(c => [c.id, c.name])) })
    } catch (e) {
      console.warn('[GlobalSearch]', e.message)
      setResults({ families: [], members: [], users: [], camps: [], famMap: {}, campMap: {} })
    } finally {
      setLoading(false)
    }
  }

  function go(path) { onClose(); navigate(path) }

  const total = results ? results.families.length + results.members.length + results.users.length + results.camps.length : 0

  return (
    <Modal open={open} onClose={onClose} title="🔍 بحث شامل" size="lg">
      <input
        ref={inputRef}
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="اسم، رقم هوية، أو جوال..."
        className="w-full bg-surface2 border border-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent mb-3"
      />

      {loading && (
        <div className="flex justify-center py-10"><Spinner /></div>
      )}

      {!loading && q.trim().length > 0 && q.trim().length < 2 && (
        <p className="text-center text-muted text-xs py-8">اكتب حرفين على الأقل...</p>
      )}

      {!loading && q.trim().length === 0 && (
        <p className="text-center text-muted text-xs py-8">ابدأ الكتابة للبحث...</p>
      )}

      {!loading && results && q.trim().length >= 2 && total === 0 && (
        <div className="text-center py-10">
          <div className="text-3xl mb-2">🔍</div>
          <p className="text-muted text-sm">لا توجد نتائج لـ "{q.trim()}"</p>
        </div>
      )}

      {!loading && results && total > 0 && (
        <div className="space-y-3">
          {results.families.length > 0 && (
            <ResultGroup label={`👨‍👩‍👧 الأسر (${results.families.length})`}>
              {results.families.map(f => (
                <ResultRow key={f.id} onClick={() => go(`/families/edit/${f.id}`)}
                  title={f.head_name}
                  subtitle={[f.head_id, f.phone1].filter(Boolean).join(' • ')}
                  right={results.campMap[f.camp_id] || '—'} />
              ))}
            </ResultGroup>
          )}

          {results.members.length > 0 && (
            <ResultGroup label={`👤 الأفراد (${results.members.length})`}>
              {results.members.map(m => {
                const fam = results.famMap[m.family_id]
                return (
                  <ResultRow key={m.id} onClick={() => fam && go(`/families/edit/${m.family_id}`)}
                    title={m.name}
                    subtitle={[m.relation, m.national_id].filter(Boolean).join(' • ')}
                    right={fam ? fam.head_name : '—'} rightColor="text-blue-400" />
                )
              })}
            </ResultGroup>
          )}

          {results.users.length > 0 && (
            <ResultGroup label={`🧑‍💼 المستخدمون (${results.users.length})`}>
              {results.users.map(u => (
                <ResultRow key={u.id} onClick={() => go('/users')}
                  title={`${ROLE_LABELS[u.role] || '👤'} ${u.full_name}`}
                  subtitle={u.national_id}
                  right={u.is_active ? 'نشط' : 'موقوف'}
                  rightColor={u.is_active ? 'text-green-400' : 'text-red-400'} />
              ))}
            </ResultGroup>
          )}

          {results.camps.length > 0 && (
            <ResultGroup label={`⛺ المخيمات (${results.camps.length})`}>
              {results.camps.map(c => (
                <ResultRow key={c.id} onClick={() => go('/camps')}
                  title={`⛺ ${c.name}`}
                  right={c.capacity ? `سعة ${c.capacity}` : ''} />
              ))}
            </ResultGroup>
          )}
        </div>
      )}
    </Modal>
  )
}

function ResultGroup({ label, children }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-muted mb-1.5 uppercase">{label}</div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function ResultRow({ onClick, title, subtitle, right, rightColor = 'text-muted' }) {
  return (
    <button onClick={onClick} type="button"
      className="w-full flex items-center justify-between gap-2 bg-surface2 hover:bg-surface2/70 rounded-xl px-3 py-2.5 text-right">
      <div className="min-w-0">
        <div className="text-white text-sm font-bold truncate">{title}</div>
        {subtitle && <div className="text-muted text-[10px] mt-0.5" dir="ltr">{subtitle}</div>}
      </div>
      {right && <div className={`text-[10px] flex-shrink-0 ${rightColor}`}>{right}</div>}
    </button>
  )
}
