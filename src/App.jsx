import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppProvider } from './context/AppContext'
import { PowerSyncProvider } from './context/PowerSyncContext'
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
const DataPage       = lazy(() => import('./pages/Data/DataPage'))
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
const RegistriesPage  = lazy(() => import('./pages/Registries/RegistriesPage'))
const RegistersPage   = lazy(() => import('./pages/Registers/RegistersPage'))
const CampCompare    = lazy(() => import('./pages/Analysis/CampCompare'))
const NeedsReport    = lazy(() => import('./pages/Analysis/NeedsReport'))

// ── شاشة تحميل موحّدة ────────────────────────────────
function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Spinner size="lg" />
      <p className="text-muted text-sm">جاري التحميل...</p>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading, mustChange } = useAuth()
  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg gap-4">
      <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center text-3xl">🏕️</div>
      <p className="text-accent font-bold text-lg">نبض المخيم</p>
      <Spinner size="lg" />
    </div>
  )
  if (!user)      return <Navigate to="/login" replace />
  if (mustChange) return <Navigate to="/change-password" replace />
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
          <Route index element={<Dashboard />} />
          <Route path="families">
            <Route index        element={<FamiliesList />} />
            <Route path="add"   element={<FamilyForm />} />
            <Route path="edit/:id" element={<FamilyForm />} />
          </Route>
          <Route path="camps"         element={<CampsList />} />
          <Route path="users" element={<ProtectedRoute requireAdmin><UsersList /></ProtectedRoute>} />
          <Route path="distributions" element={<Distributions />} />
          <Route path="analysis" element={<ProtectedRoute requireCan="reports"><Analysis /></ProtectedRoute>} />
          <Route path="camp-compare"  element={<CampCompare />} />
          <Route path="needs-report"  element={<NeedsReport />} />
          <Route path="data" element={<ProtectedRoute requireOwner><DataPage /></ProtectedRoute>} />
          <Route path="export"        element={<ExportPage />} />
          <Route path="settings"      element={<Settings />} />
          <Route path="audit"         element={<AuditLog />} />
          <Route path="alerts"        element={<Alerts />} />
          <Route path="movements"     element={<Movements />} />
          <Route path="devices"       element={<Devices />} />
          <Route path="subscription"  element={<Subscription />} />
          <Route path="help"          element={<HelpPage />} />
          <Route path="sms"           element={<SMS />} />
          <Route path="registers"   element={<RegistersPage />} />
          <Route path="registries"  element={<RegistriesPage />} />
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
        {/* PowerSyncProvider يعمل بعد تسجيل الدخول — يفشل بصمت إذا لم تكن sync rules جاهزة */}
        <PowerSyncProvider>
          <AppProvider>
            <AppRoutes />
          </AppProvider>
        </PowerSyncProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
