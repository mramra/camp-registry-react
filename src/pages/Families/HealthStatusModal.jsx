/**
 * HealthStatusModal.jsx — إدخال/تعديل الحالات الصحية التفصيلية
 * يُستخدم لرب الأسرة (subjectKind='head') وكل فرد (subjectKind='member').
 * إعاقات/إصابات/أمراض مزمنة/احتياجات مساعدة (شرائح اختيار متعدد بدل checkbox،
 * نفس أسلوب اختيار حقول التصدير)، يتم (للقاصرين فقط)، حالات النساء (للإناث فقط).
 */
import { useState, useMemo } from 'react'
import Modal from '../../components/ui/Modal'
import { calcAge } from '../../lib/helpers'
import {
  DISABILITY_TYPES, INJURY_TYPES, CHRONIC_DISEASES, NEEDS_TYPES,
  FEMALE_STATUSES, ORPHAN_TYPES, ORPHAN_CAUSES,
} from '../../lib/healthOptions'

// ── اختيار متعدد بشرائح مع تفصيل اختياري (إعاقة/إصابة/مرض) ──
function ChipMultiSelectWithDetails({ typesList, items, onChange }) {
  const list = Array.isArray(items) ? items : []
  const selectedTypes = typesList.filter(t => list.some(i => i.type === t.label))

  function toggle(label) {
    const exists = list.find(i => i.type === label)
    if (exists) onChange(list.filter(i => i.type !== label))
    else onChange([...list, { type: label, detail: '' }])
  }
  function setDetail(label, detail) {
    onChange(list.map(i => i.type === label ? { ...i, detail } : i))
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {typesList.map(t => {
          const checked = list.some(i => i.type === t.label)
          return (
            <button key={t.key} type="button" onClick={() => toggle(t.label)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                checked ? 'bg-purple-500/15 border-purple-500 text-purple-400 font-bold' : 'bg-surface2 border-border text-muted'
              }`}>
              {t.label}
            </button>
          )
        })}
      </div>

      {selectedTypes.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          {selectedTypes.map(t => {
            const current = list.find(i => i.type === t.label)
            return (
              <div key={t.key} className="flex items-center gap-2 bg-surface2 rounded-lg p-2">
                <span className="text-white text-xs font-bold w-24 flex-shrink-0">{t.label}</span>
                {t.details.length > 0 ? (
                  <select value={current?.detail || ''} onChange={e => setDetail(t.label, e.target.value)}
                    className="flex-1 bg-bg border border-border rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none">
                    <option value="">تفاصيل (اختياري)</option>
                    {t.details.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                ) : (
                  <input value={current?.detail || ''} onChange={e => setDetail(t.label, e.target.value)}
                    placeholder="تفاصيل (اختياري)"
                    className="flex-1 bg-bg border border-border rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none" />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── اختيار متعدد بشرائح بسيطة بلا تفاصيل (احتياجات مساعدة / حالات نسائية) ──
function ChipMultiSelectSimple({ options, items, onChange }) {
  const list = Array.isArray(items) ? items : []
  function toggle(v) {
    onChange(list.includes(v) ? list.filter(x => x !== v) : [...list, v])
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => {
        const checked = list.includes(opt)
        return (
          <button key={opt} type="button" onClick={() => toggle(opt)}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
              checked ? 'bg-purple-500/15 border-purple-500 text-purple-400 font-bold' : 'bg-surface2 border-border text-muted'
            }`}>
            {opt}
          </button>
        )
      })}
    </div>
  )
}

export default function HealthStatusModal({ open, onClose, subjectName, gender, dob, initial, onSave }) {
  const [orphanStatus, setOrphanStatus] = useState(initial?.orphan_status || '')
  const [orphanCause,  setOrphanCause]  = useState(initial?.orphan_cause  || '')
  const [disabilities, setDisabilities] = useState(initial?.disabilities || [])
  const [injuries,     setInjuries]     = useState(initial?.injuries     || [])
  const [chronics,     setChronics]     = useState(initial?.chronic_diseases || [])
  const [femaleStatus, setFemaleStatus] = useState(initial?.female_status || [])
  const [needs,        setNeeds]        = useState(initial?.needs || [])

  const age = useMemo(() => calcAge(dob), [dob])
  const isMinor  = age !== null && age < 18
  const isFemale = (gender || '').includes('أنثى')

  function handleSave() {
    onSave({
      orphan_status: orphanStatus || null,
      orphan_cause:  orphanStatus ? (orphanCause || null) : null,
      disabilities,
      injuries,
      chronic_diseases: chronics,
      female_status: femaleStatus,
      needs,
    })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`🩺 حالات صحية — ${subjectName || ''}`} size="md">
      <div className="flex flex-col gap-4">

        {/* اليتم — للقاصرين فقط */}
        {isMinor && (
          <div>
            <div className="text-xs font-bold text-muted mb-2">👶 حالة اليتم</div>
            <div className="flex flex-col gap-1.5">
              {ORPHAN_TYPES.map(o => (
                <label key={o.key} className="flex items-center gap-2.5 bg-surface2 border border-border rounded-xl p-2.5 cursor-pointer">
                  <input type="radio" name="orphan" checked={orphanStatus === o.key}
                    onChange={() => setOrphanStatus(o.key)} className="w-[16px] h-[16px] accent-accent" />
                  <span className="text-white text-sm">{o.label}</span>
                </label>
              ))}
              <label className="flex items-center gap-2.5 bg-surface2 border border-border rounded-xl p-2.5 cursor-pointer">
                <input type="radio" name="orphan" checked={!orphanStatus}
                  onChange={() => setOrphanStatus('')} className="w-[16px] h-[16px]" />
                <span className="text-muted text-sm">ليس يتيماً</span>
              </label>
            </div>
            {orphanStatus && (
              <select value={orphanCause} onChange={e => setOrphanCause(e.target.value)}
                className="w-full mt-2 bg-surface2 border border-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none">
                <option value="">سبب الوفاة (اختياري)</option>
                {ORPHAN_CAUSES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>
        )}

        {/* الإعاقات */}
        <div>
          <div className="text-xs font-bold text-muted mb-2">🦽 الإعاقات</div>
          <ChipMultiSelectWithDetails typesList={DISABILITY_TYPES} items={disabilities} onChange={setDisabilities} />
        </div>

        {/* الإصابات */}
        <div>
          <div className="text-xs font-bold text-muted mb-2">🩹 إصابات الحرب</div>
          <ChipMultiSelectWithDetails typesList={INJURY_TYPES} items={injuries} onChange={setInjuries} />
        </div>

        {/* الأمراض المزمنة */}
        <div>
          <div className="text-xs font-bold text-muted mb-2">💊 الأمراض المزمنة</div>
          <ChipMultiSelectWithDetails typesList={CHRONIC_DISEASES} items={chronics} onChange={setChronics} />
        </div>

        {/* احتياجات مساعدة */}
        <div>
          <div className="text-xs font-bold text-muted mb-2">🦯 احتياجات مساعدة</div>
          <ChipMultiSelectSimple options={NEEDS_TYPES} items={needs} onChange={setNeeds} />
        </div>

        {/* حالات خاصة بالنساء */}
        {isFemale && (
          <div>
            <div className="text-xs font-bold text-muted mb-2">♀️ حالات خاصة</div>
            <ChipMultiSelectSimple options={FEMALE_STATUSES} items={femaleStatus} onChange={setFemaleStatus} />
          </div>
        )}

        <div className="flex gap-2.5 pt-1">
          <button type="button" onClick={handleSave}
            className="flex-1 bg-accent text-bg font-black py-2.5 rounded-xl text-sm">
            💾 حفظ الحالات
          </button>
          <button type="button" onClick={onClose}
            className="flex-1 bg-surface2 border border-border text-white font-bold py-2.5 rounded-xl text-sm">
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  )
}
