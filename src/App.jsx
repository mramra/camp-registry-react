import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppProvider } from './context/AppContext'
import { PowerSyncProvider } from './context/PowerSyncContext'
import OfflineBanner from './components/ui/OfflineBanner'
import Layout from './components/layout/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import Spinner from './components/ui/Spinner'

// ── تحميل كسول لكل الصفحات ──────────────────────────
const LoginPage      = lazy(() => import('./pages/Login/LoginPage'))
const ChangePassword = lazy(() => import('./pages/Login/ChangePassword'))
const Dashboard      = lazy(() => import('./pages/Dashboard/Dashboard'))
const FamiliesList   = lazy(() => import('./pages/Families/FamiliesList'))
const FamilyForm     = lazy(() => import('./pages/Families/FamilyForm'))
const CampsList      = lazy(() => import('./pages/Camps/CampsList'))
const UsersList      = lazy(() => import('./pages/Users/UsersList'))
const Distributions  = lazy(() => import('./pages/Distributions/Distributions'))
const Analysis       = lazy(() => import('./pages/Analysis/Analysis'))
const DataPage        = lazy(() => import('./pages/Data/DataPage'))
const DiagnosticsPage = lazy(() => import('./pages/Diagnostics/DiagnosticsPage'))
const ExportPage     = lazy(() => import('./pages/Export/ExportPage'))
const Settings       = lazy(() => import('./pages/Settings/Settings'))
const AuditLog       = lazy(() => import('./pages/Audit/AuditLog'))
const Alerts         = lazy(() => import('./pages/Alerts/Alerts'))
const Movements      = lazy(() => import('./pages/Movements/Movements'))
const Devices        = lazy(() => import('./pages/Devices/Devices'))
const Subscription   = lazy(() => import('./pages/Subscription/Subscription'))
const HelpPage       = lazy(() => import('./pages/Help/HelpPage'))
const SMS            = lazy(() => import('./pages/SMS/SMS'))
const FamilyPortal   = lazy(() => import('./pages/FamilyPortal/FamilyPortal'))
const RegistersPage   = lazy(() => import('./pages/Registers/RegistersPage'))
const CampCompare    = lazy(() => import('./pages/Analysis/CampCompare'))
const NeedsReport    = lazy(() => import('./pages/Analysis/NeedsReport'))
const PermissionsAdmin = lazy(() => import('./pages/PermissionsAdmin/PermissionsAdmin'))
const WomenPage        = lazy(() => import('./pages/Women/WomenPage'))
const ChildrenPage     = lazy(() => import('./pages/Children/ChildrenPage'))
const HealthReportPage = lazy(() => import('./pages/HealthReport/HealthReportPage'))

// ── شاشة تحميل موحّدة ────────────────────────────────
function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Spinner size="lg" />
      <p className="text-muted text-sm">جاري التحميل...</p>
    </div>
  )
}

// ── شاشة "غير مصرح" واضحة بدل التحويل الصامت ─────────
function AccessDenied({ pageLabel }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="text-5xl mb-4">🔒</div>
      <h2 className="text-white font-black text-lg mb-2">غير مصرح لك بالوصول</h2>
      <p className="text-muted text-sm mb-6 max-w-xs">
        لا تملك صلاحية الدخول إلى {pageLabel ? `«${pageLabel}»` : 'هذه الصفحة'}.
        تواصل مع مسؤول النظام إذا كنت تحتاج هذه الصلاحية.
      </p>
      <a href="#/" className="px-5 py-2.5 rounded-xl text-sm font-black"
        style={{ background: '#f59e0b', color: '#000' }}>
        🏠 الرجوع للرئيسية
      </a>
    </div>
  )
}

function ProtectedRoute({ children, pageKey, pageLabel }) {
  const { user, loading, mustChange, pagePermLoaded, canAccessPageNow } = useAuth()
  const keys = Array.isArray(pageKey) ? pageKey : (pageKey ? [pageKey] : [])
  const hasAccess = keys.length === 0 || keys.some(k => canAccessPageNow(k))
  if (loading || (keys.length && !pagePermLoaded)) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg gap-4">
      <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center text-3xl">🏕️</div>
      <p className="text-accent font-bold text-lg">نبض المخيم</p>
      <Spinner size="lg" />
    </div>
  )
  if (!user)      return <Navigate to="/login" replace />
  if (mustChange) return <Navigate to="/change-password" replace />
  if (keys.length && !hasAccess) return <AccessDenied pageLabel={pageLabel} />
  return children
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg gap-4">
      <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center text-3xl">🏕️</div>
      <p className="text-accent font-bold text-lg">نبض المخيم</p>
      <Spinner size="lg" />
    </div>
  )

  return (
    <ErrorBoundary>
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* بوابة الأسرة — عامة */}
        <Route path="/portal" element={<FamilyPortal />} />

        {/* تسجيل الدخول */}
        <Route path="/login"           element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/change-password" element={<ChangePassword />} />

        {/* الصفحات المحمية */}
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<ProtectedRoute pageKey="dashboard" pageLabel="الرئيسية"><Dashboard /></ProtectedRoute>} />
          <Route path="families">
            <Route index        element={<ProtectedRoute pageKey="families" pageLabel="قائمة الأسر"><FamiliesList /></ProtectedRoute>} />
            <Route path="add"   element={<ProtectedRoute pageKey="families" pageLabel="قائمة الأسر"><FamilyForm /></ProtectedRoute>} />
            <Route path="edit/:id" element={<ProtectedRoute pageKey="families" pageLabel="قائمة الأسر"><FamilyForm /></ProtectedRoute>} />
          </Route>
          <Route path="camps"         element={<ProtectedRoute pageKey="camps" pageLabel="المخيمات"><CampsList /></ProtectedRoute>} />
          <Route path="users" element={<ProtectedRoute pageKey="users" pageLabel="المستخدمون"><UsersList /></ProtectedRoute>} />
          <Route path="distributions" element={<ProtectedRoute pageKey="distributions" pageLabel="التوزيعات"><Distributions /></ProtectedRoute>} />
          <Route path="analysis" element={<ProtectedRoute pageKey="analysis" pageLabel="التحليل"><Analysis /></ProtectedRoute>} />
          <Route path="camp-compare"  element={<ProtectedRoute pageKey="camp_compare" pageLabel="مقارنة المخيمات"><CampCompare /></ProtectedRoute>} />
          <Route path="needs-report"  element={<ProtectedRoute pageKey="needs_report" pageLabel="تقارير الاحتياجات"><NeedsReport /></ProtectedRoute>} />
          <Route path="data" element={<ProtectedRoute pageKey="data" pageLabel="إدارة البيانات"><DataPage /></ProtectedRoute>} />
          <Route path="diagnostics" element={<ProtectedRoute pageKey="diagnostics" pageLabel="تشخيص النظام"><DiagnosticsPage /></ProtectedRoute>} />
          <Route path="export"        element={<ProtectedRoute pageKey="export" pageLabel="الاستيراد والتصدير"><ExportPage /></ProtectedRoute>} />
          <Route path="settings"      element={<ProtectedRoute pageKey="settings" pageLabel="الإعدادات"><Settings /></ProtectedRoute>} />
          <Route path="audit"         element={<ProtectedRoute pageKey="audit" pageLabel="سجل التغييرات"><AuditLog /></ProtectedRoute>} />
          <Route path="alerts"        element={<ProtectedRoute pageKey="alerts" pageLabel="التنبيهات"><Alerts /></ProtectedRoute>} />
          <Route path="movements"     element={<ProtectedRoute pageKey="movements" pageLabel="حركات الأسر"><Movements /></ProtectedRoute>} />
          <Route path="devices"       element={<ProtectedRoute pageKey="devices" pageLabel="الأجهزة"><Devices /></ProtectedRoute>} />
          <Route path="subscription"  element={<ProtectedRoute pageKey="subscription" pageLabel="الاشتراكات"><Subscription /></ProtectedRoute>} />
          <Route path="help"          element={<ProtectedRoute pageKey="help" pageLabel="المساعدة"><HelpPage /></ProtectedRoute>} />
          <Route path="sms"           element={<ProtectedRoute pageKey="sms" pageLabel="الرسائل"><SMS /></ProtectedRoute>} />
          <Route path="registers"   element={<ProtectedRoute pageKey={["registers","registries"]} pageLabel="السجلات"><RegistersPage /></ProtectedRoute>} />
          <Route path="registries"  element={<Navigate to="/registers" replace />} />
          <Route path="permissions-admin" element={<ProtectedRoute pageKey="page_permissions" pageLabel="إدارة الصلاحيات"><PermissionsAdmin /></ProtectedRoute>} />
          <Route path="women"        element={<ProtectedRoute pageKey="women"        pageLabel="النساء"><WomenPage /></ProtectedRoute>} />
          <Route path="children"     element={<ProtectedRoute pageKey="children"     pageLabel="سجل الأطفال"><ChildrenPage /></ProtectedRoute>} />
          <Route path="health-report" element={<ProtectedRoute pageKey="health_report" pageLabel="الحالات الصحية"><HealthReportPage /></ProtectedRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <BrowserRouter basename="/camp-registry-react">
      <AuthProvider>
        {/* PowerSyncProvider الآن كاشف اتصال بسيط — لا SQLite، لا PowerSync */}
        <PowerSyncProvider>
          <OfflineBanner />
          <AppProvider>
            <AppRoutes />
          </AppProvider>
        </PowerSyncProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
// rebuild-trigger
