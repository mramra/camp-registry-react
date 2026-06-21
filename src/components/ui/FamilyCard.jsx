/**
 * FamilyCard.jsx — بطاقة الأسرة
 * مستخدمة في: FamiliesList, Dashboard, RegistersPage
 */
export default function FamilyCard({ family, members = [], onClick, onEdit, onDelete, campName, canEdit, canDelete }) {
  const membersCount = members.length || family._memberCount || 0

  return (
    <div
      className="bg-surface border border-border rounded-2xl p-4 cursor-pointer active:scale-[0.99] transition-all"
      onClick={onClick}
    >
      {/* رأس البطاقة */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-black text-white text-sm leading-tight">{family.head_name}</h3>
            {family.review_status === 'pending' && (
              <span className="bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-[10px] font-bold px-1.5 py-0.5 rounded-lg">
                🔍 قيد المراجعة
              </span>
            )}
            {family.review_status === 'rejected' && (
              <span className="bg-red/15 border border-red/30 text-red text-[10px] font-bold px-1.5 py-0.5 rounded-lg">
                ❌ مرفوض
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {family.tent && (
              <span className="text-accent text-xs font-bold">⛺ {family.tent}</span>
            )}
            {campName && (
              <span className="text-muted text-xs">🏕️ {campName}</span>
            )}
          </div>
        </div>

        {/* عدد الأفراد */}
        <div className="bg-accent/10 border border-accent/20 rounded-xl px-2 py-1 text-center">
          <span className="text-accent font-black text-sm">{membersCount}</span>
          <span className="text-muted text-[10px] block">فرد</span>
        </div>
      </div>

      {/* معلومات */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] mb-3">
        {family.head_id && (
          <span className="text-muted">🪪 {family.head_id}</span>
        )}
        {family.phone1 && (
          <span className="text-muted">📞 {family.phone1}</span>
        )}
        {family.head_marital && (
          <span className="text-muted">💍 {family.head_marital}</span>
        )}
        {family.head_gender && (
          <span className="text-muted">{family.head_gender === 'ذكر' ? '👨' : '👩'} {family.head_gender}</span>
        )}
      </div>

      {/* تحذيرات */}
      {(!family.head_id || !family.phone1) && (
        <div className="bg-accent/10 border border-accent/20 rounded-lg px-2 py-1 text-[10px] text-accent mb-2">
          ⚠️ بيانات ناقصة: {[!family.head_id && 'الهوية', !family.phone1 && 'الجوال'].filter(Boolean).join(' + ')}
        </div>
      )}

      {/* أزرار */}
      {(canEdit || canDelete) && (
        <div className="flex gap-2 pt-2 border-t border-border/30"
          onClick={e => e.stopPropagation()}>
          {canEdit && (
            <button onClick={onEdit}
              className="flex-1 py-1.5 rounded-xl text-xs font-bold text-blue bg-blue/10 border border-blue/20">
              ✏️ تعديل
            </button>
          )}
          {canDelete && (
            <button onClick={onDelete}
              className="flex-1 py-1.5 rounded-xl text-xs font-bold text-red bg-red/10 border border-red/20">
              🗑️ حذف
            </button>
          )}
        </div>
      )}
    </div>
  )
}
