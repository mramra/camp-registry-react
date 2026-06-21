import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'
import { useApp } from '../../context/AppContext'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { toast } = useApp()

  return (
    <div className="min-h-screen bg-bg">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[200]"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* المحتوى */}
      <main className="px-4 pt-4 pb-24 max-w-3xl mx-auto">
        <Outlet />
      </main>

      {/* رسائل التنبيه (Toast) — تظهر فوق كل شيء، تختفي تلقائياً */}
      {toast && (
        <div className="fixed bottom-5 inset-x-4 z-[300] flex justify-center pointer-events-none">
          <div
            className={`max-w-md w-full px-4 py-3 rounded-2xl shadow-lg text-sm font-bold text-center whitespace-pre-line
              ${toast.isError
                ? 'bg-red/15 border border-red/40 text-red'
                : 'bg-accent/15 border border-accent/40 text-accent'}`}
          >
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  )
}
