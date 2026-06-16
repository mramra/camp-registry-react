/**
 * ProtectedAction — يخفي الأزرار حسب الصلاحية
 * الاستخدام:
 *   <ProtectedAction action="write">
 *     <button>إضافة</button>
 *   </ProtectedAction>
 */
import { useAuth } from '../../context/AuthContext'

export default function ProtectedAction({ action, pageKey, op, children, fallback = null }) {
  const { can, canPage } = useAuth()

  // فحص صلاحية صفحة معينة
  if (pageKey) {
    if (!canPage(pageKey, op || 'view')) return fallback
  }

  // فحص صلاحية عامة
  if (action) {
    if (!can(action)) return fallback
  }

  return children
}
