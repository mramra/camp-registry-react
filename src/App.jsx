import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppProvider } from './context/AppContext'

// Layout
import Layout from './components/layout/Layout'

// Auth
import LoginPage     from './pages/Login/LoginPage'
import ChangePassword from './pages/Login/ChangePassword'

// Pages
import Dashboard     from './pages/Dashboard/Dashboard'
import FamiliesList  from './pages/Families/FamiliesList'
import FamilyForm    from './pages/Families/FamilyForm'
import CampsList     from './pages/Camps/CampsList'
import UsersList     from './pages/Users/UsersList'
import Distributions from './pages/Distributions/Distributions'
import Analysis      from './pages/Analysis/Analysis'
import DataPage      from './pages/Data/DataPage'
import Settings      from './pages/Settings/Settings'
import AuditLog      from './pages/Audit/AuditLog'
import Alerts        from './pages/Alerts/Alerts'
import Movements     from './pages/Movements/Movements'
import Devices       from './pages/Devices/Devices'
import Subscription  from './pages/Subscription/Subscription'
import HelpPage      from './pages/Help/HelpPage'
import SMS           from './pages/SMS/SMS'
import FamilyPortal  from './pages/FamilyPortal/FamilyPortal'

function ProtectedRoute({ children }) {
  const { user, loading, mustChange } = useAuth()
  if (loading) return <div className="flex items-center justify-center min-h-screen text-accent text-lg">جاري التحميل...</div>
  if (!user)   return <Navigate to="/login" replace />
  if (mustChange) return <Navigate to="/change-password" replace />
  return children
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg gap-4">
      <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center text-3xl">⛺</div>
      <p className="text-accent font-bold text-lg">نبض المخيم</p>
      <div className="w-8 h-8 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
    </div>
  )

  return (
    <Routes>
      {/* بوابة الأسرة — عامة */}
      <Route path="/portal" element={<FamilyPortal />} />

      {/* تسجيل الدخول */}
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/change-password" element={<ChangePassword />} />

      {/* الصفحات المحمية */}
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="families">
          <Route index element={<FamiliesList />} />
          <Route path="add" element={<FamilyForm />} />
          <Route path="edit/:id" element={<FamilyForm />} />
        </Route>
        <Route path="camps"        element={<CampsList />} />
        <Route path="users"        element={<UsersList />} />
        <Route path="distributions" element={<Distributions />} />
        <Route path="analysis"     element={<Analysis />} />
        <Route path="data"         element={<DataPage />} />
        <Route path="settings"     element={<Settings />} />
        <Route path="audit"        element={<AuditLog />} />
        <Route path="alerts"       element={<Alerts />} />
        <Route path="movements"    element={<Movements />} />
        <Route path="devices"      element={<Devices />} />
        <Route path="subscription" element={<Subscription />} />
        <Route path="help"         element={<HelpPage />} />
        <Route path="sms"          element={<SMS />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter basename="/camp-registry-react">
      <AuthProvider>
        <AppProvider>
          <AppRoutes />
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
